/**
 * Cluster routes — serves topic clusters and timeline data.
 */

import { Router, Request, Response } from "express";
import { query, getOne, isSqlite } from "../db";

const router = Router();

/**
 * GET /clusters
 * List all topic clusters with article count and time range.
 */
router.get("/", async (_req: Request, res: Response) => {
  try {
    // Use DB-appropriate aggregate: SQLite=GROUP_CONCAT, PostgreSQL=STRING_AGG
    const concatFn = isSqlite()
      ? "GROUP_CONCAT(DISTINCT s.name)"
      : "STRING_AGG(DISTINCT s.name, ',')";

    // Single query: fetch clusters with all their sources in one shot (no N+1)
    const result = await query(`
      SELECT 
        c.id,
        c.label,
        c.article_count,
        c.created_at,
        MIN(a.published_at) as start_time,
        MAX(a.published_at) as end_time,
        ${concatFn} as source_names
      FROM clusters c
      LEFT JOIN cluster_articles ca ON c.id = ca.cluster_id
      LEFT JOIN articles a ON ca.article_id = a.id
      LEFT JOIN sources s ON a.source_id = s.id
      GROUP BY c.id, c.label, c.article_count, c.created_at
      ORDER BY start_time DESC
    `);

    const clusters = result.rows.map((row: any) => ({
      id: row.id,
      label: row.label,
      articleCount: row.article_count,
      timeRange: {
        start: row.start_time,
        end: row.end_time,
      },
      sources: row.source_names ? String(row.source_names).split(",") : [],
      createdAt: row.created_at,
    }));

    res.json({ clusters });
  } catch (error) {
    console.error("[API] Error fetching clusters:", error);
    res.status(500).json({ error: "Failed to fetch clusters" });
  }
});

/**
 * GET /clusters/:id
 * Get full cluster detail with all articles.
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const clusterId = parseInt(req.params.id, 10);
    if (isNaN(clusterId)) {
      res.status(400).json({ error: "Invalid cluster ID" });
      return;
    }

    // Get cluster info
    const cluster = await getOne(
      "SELECT id, label, article_count, created_at FROM clusters WHERE id = $1",
      [clusterId]
    );

    if (!cluster) {
      res.status(404).json({ error: "Cluster not found" });
      return;
    }

    // Get articles in this cluster
    const articles = await query(`
      SELECT 
        a.id,
        a.title,
        a.summary,
        a.url,
        a.published_at,
        s.name as source
      FROM cluster_articles ca
      JOIN articles a ON ca.article_id = a.id
      JOIN sources s ON a.source_id = s.id
      WHERE ca.cluster_id = $1
      ORDER BY a.published_at DESC
    `, [clusterId]);

    res.json({
      id: cluster.id,
      label: cluster.label,
      articleCount: cluster.article_count,
      createdAt: cluster.created_at,
      articles: articles.rows.map((a: any) => ({
        id: a.id,
        title: a.title,
        summary: a.summary,
        url: a.url,
        publishedAt: a.published_at,
        source: a.source,
      })),
    });
  } catch (error) {
    console.error("[API] Error fetching cluster:", error);
    res.status(500).json({ error: "Failed to fetch cluster" });
  }
});

export default router;
