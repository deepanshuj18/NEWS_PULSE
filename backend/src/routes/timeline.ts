/**
 * Timeline route — serves data optimized for the frontend timeline visualization.
 * Includes in-memory caching for fast repeated reads.
 */

import { Router, Request, Response } from "express";
import { query, isSqlite } from "../db";

const router = Router();

// --- In-memory cache ---
let timelineCache: { data: any; timestamp: number; sourceKey: string } | null = null;
const CACHE_TTL_MS = 30_000; // 30 seconds

/** Call this to invalidate the cache (e.g., after a pipeline run completes). */
export function invalidateTimelineCache() {
  timelineCache = null;
}

/**
 * GET /timeline
 * Returns clusters formatted for timeline plotting.
 * Each item has: clusterId, label, start, end, articleCount, intensity, sources
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    // Optional source filter via query params
    const sourceFilter = req.query.sources
      ? (req.query.sources as string).split(",")
      : null;

    const cacheKey = sourceFilter ? sourceFilter.sort().join(",") : "__all__";

    // Serve from cache if fresh
    if (
      timelineCache &&
      timelineCache.sourceKey === cacheKey &&
      Date.now() - timelineCache.timestamp < CACHE_TTL_MS
    ) {
      return res.json(timelineCache.data);
    }

    // Use DB-appropriate aggregate: SQLite=GROUP_CONCAT, PostgreSQL=STRING_AGG
    const concatFn = isSqlite()
      ? "GROUP_CONCAT(DISTINCT s.name)"
      : "STRING_AGG(DISTINCT s.name, ',')";

    // Single query: fetch clusters + sources in one shot (no N+1)
    const result = await query(`
      SELECT 
        c.id,
        c.label,
        c.article_count,
        MIN(a.published_at) as start_time,
        MAX(a.published_at) as end_time,
        ${concatFn} as source_names
      FROM clusters c
      JOIN cluster_articles ca ON c.id = ca.cluster_id
      JOIN articles a ON ca.article_id = a.id
      JOIN sources s ON a.source_id = s.id
      GROUP BY c.id, c.label, c.article_count
      HAVING COUNT(a.id) > 0
      ORDER BY start_time DESC
    `);

    // Get max article count for intensity normalization
    const maxCount = Math.max(...result.rows.map((r: any) => r.article_count), 1);

    const items = result.rows
      .map((row: any) => {
        const sourceNames = row.source_names ? String(row.source_names).split(",") : [];

        // Apply source filter if specified
        if (sourceFilter) {
          const hasMatchingSource = sourceNames.some((name: string) =>
            sourceFilter.includes(name)
          );
          if (!hasMatchingSource) return null;
        }

        return {
          clusterId: row.id,
          label: row.label,
          start: row.start_time,
          end: row.end_time,
          articleCount: row.article_count,
          intensity: Math.round((row.article_count / maxCount) * 100) / 100,
          sources: sourceNames,
        };
      })
      .filter(Boolean);

    const responseData = {
      items,
      totalClusters: items.length,
      lastUpdated: new Date().toISOString(),
    };

    // Store in cache
    timelineCache = { data: responseData, timestamp: Date.now(), sourceKey: cacheKey };

    res.json(responseData);
  } catch (error) {
    console.error("[API] Error fetching timeline:", error);
    res.status(500).json({ error: "Failed to fetch timeline data" });
  }
});

export default router;
