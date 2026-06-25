/**
 * Story Groups route — serves macro story groups with nested clusters and articles.
 * Also returns standalone clusters (those not belonging to any story group).
 */

import { Router, Request, Response } from "express";
import { query, isSqlite } from "../db";

const router = Router();

/**
 * GET /story-groups
 * Returns:
 *   storyGroups[]  — macro stories, each with nested clusters and articles
 *   standaloneItems[] — clusters not belonging to any story group (TimelineItem shape)
 */
router.get("/", async (_req: Request, res: Response) => {
  try {
    const concatFn = isSqlite()
      ? "GROUP_CONCAT(DISTINCT s.name)"
      : "STRING_AGG(DISTINCT s.name, ',')";

    // ── 1. Story groups with nested clusters + articles ──────────────────────
    const sgResult = await query(`
      SELECT
        sg.id        AS sg_id,
        sg.title     AS sg_title,
        c.id         AS cluster_id,
        c.label      AS cluster_label,
        a.id         AS article_id,
        a.title      AS article_title,
        a.url        AS article_url,
        a.published_at AS article_published_at,
        s.name       AS source_name
      FROM story_groups sg
      JOIN story_group_clusters sgc ON sg.id = sgc.story_group_id
      JOIN clusters c               ON sgc.cluster_id = c.id
      LEFT JOIN cluster_articles ca ON c.id = ca.cluster_id
      LEFT JOIN articles a          ON ca.article_id = a.id
      LEFT JOIN sources s           ON a.source_id = s.id
      ORDER BY sg.id ASC, c.id ASC, a.published_at DESC
    `);

    // Aggregate flat rows into nested structure
    const sgMap = new Map<number, {
      id: number;
      title: string;
      clusters: Map<number, { id: number; label: string; articles: any[] }>;
    }>();

    for (const row of sgResult.rows) {
      if (!sgMap.has(row.sg_id)) {
        sgMap.set(row.sg_id, { id: row.sg_id, title: row.sg_title, clusters: new Map() });
      }
      const sg = sgMap.get(row.sg_id)!;

      if (row.cluster_id != null && !sg.clusters.has(row.cluster_id)) {
        sg.clusters.set(row.cluster_id, { id: row.cluster_id, label: row.cluster_label, articles: [] });
      }
      if (row.cluster_id != null && row.article_id != null) {
        sg.clusters.get(row.cluster_id)!.articles.push({
          id: row.article_id,
          title: row.article_title,
          url: row.article_url,
          publishedAt: row.article_published_at,
          source: row.source_name,
        });
      }
    }

    const storyGroups = Array.from(sgMap.values()).map((sg) => {
      const clusters = Array.from(sg.clusters.values());
      const articleCount = clusters.reduce((sum, c) => sum + c.articles.length, 0);
      const allDates = clusters
        .flatMap((c) => c.articles.map((a: any) => a.publishedAt))
        .filter(Boolean)
        .sort()
        .reverse();
      return {
        id: sg.id,
        title: sg.title,
        clusterCount: clusters.length,
        articleCount,
        lastUpdated: allDates[0] ?? null,
        clusters,
      };
    });

    // ── 2. Standalone clusters (not in any story group) ──────────────────────
    const standaloneResult = await query(`
      SELECT
        c.id,
        c.label,
        c.article_count,
        MIN(a.published_at) AS start_time,
        MAX(a.published_at) AS end_time,
        ${concatFn}         AS source_names
      FROM clusters c
      LEFT JOIN cluster_articles ca ON c.id = ca.cluster_id
      LEFT JOIN articles a          ON ca.article_id = a.id
      LEFT JOIN sources s           ON a.source_id = s.id
      WHERE c.id NOT IN (SELECT cluster_id FROM story_group_clusters)
      GROUP BY c.id, c.label, c.article_count
      ORDER BY start_time DESC
    `);

    const standaloneItems = standaloneResult.rows.map((row: any) => ({
      clusterId: row.id,
      label: row.label,
      articleCount: row.article_count,
      start: row.start_time,
      end: row.end_time,
      sources: row.source_names ? String(row.source_names).split(",") : [],
      intensity: 0,
    }));

    res.json({ storyGroups, standaloneItems });
  } catch (error) {
    console.error("[API] Error fetching story groups:", error);
    res.status(500).json({ error: "Failed to fetch story groups" });
  }
});

export default router;
