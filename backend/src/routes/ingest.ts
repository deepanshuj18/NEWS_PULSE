/**
 * Ingest routes — trigger Python pipeline and poll job status.
 */

import { Router, Request, Response } from "express";
import { spawn } from "child_process";
import path from "path";
import { query, getOne } from "../db";
import { invalidateTimelineCache } from "./timeline";

const router = Router();

// In-memory job tracking for active processes
const activeJobs = new Map<number, { process: any; startedAt: Date }>();

/**
 * POST /ingest/trigger
 * Triggers the Python scraping + clustering pipeline.
 * Returns 202 Accepted with a jobId for status polling.
 */
router.post("/trigger", async (_req: Request, res: Response) => {
  try {
    const pythonPath = process.env.PYTHON_PATH || "python";
    const scraperDir = path.resolve(process.env.SCRAPER_DIR || "../scraper");
    const mainScript = path.join(scraperDir, "main.py");

    // Create pipeline run record
    const result = await query(
      "INSERT INTO pipeline_runs (status) VALUES ('pending')"
    );

    // Get the new run ID
    let runId: number;

    // For SQLite, lastInsertRowid is returned
    if (result.rows[0]?.id) {
      runId = Number(result.rows[0].id);
    } else {
      // Fallback: get the last inserted row
      const lastRow = await getOne(
        "SELECT id FROM pipeline_runs ORDER BY id DESC LIMIT 1"
      );
      runId = lastRow.id;
    }

    // Update status to processing
    await query(
      "UPDATE pipeline_runs SET status = 'processing' WHERE id = $1",
      [runId]
    );

    // Spawn Python process
    console.log(`[Ingest] Starting pipeline run ${runId}...`);
    console.log(`[Ingest] Python: ${pythonPath}, Script: ${mainScript}`);

    const child = spawn(pythonPath, [mainScript, "--run-id", String(runId)], {
      cwd: scraperDir,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    activeJobs.set(runId, { process: child, startedAt: new Date() });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      console.log(`[Pipeline ${runId}] ${text.trim()}`);
    });

    child.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      console.error(`[Pipeline ${runId}] ERR: ${text.trim()}`);
    });

    child.on("close", async (code: number | null) => {
      activeJobs.delete(runId);

      if (code === 0) {
        console.log(`[Ingest] Pipeline run ${runId} completed successfully.`);
        invalidateTimelineCache(); // Bust cache so next request gets fresh data
        await query(
          "UPDATE pipeline_runs SET status = 'completed', finished_at = $1 WHERE id = $2",
          [new Date().toISOString(), runId]
        );
      } else {
        console.error(`[Ingest] Pipeline run ${runId} failed with code ${code}`);
        const errorMsg = stderr.slice(-500) || `Process exited with code ${code}`;
        await query(
          "UPDATE pipeline_runs SET status = 'failed', finished_at = $1, error = $2 WHERE id = $3",
          [new Date().toISOString(), errorMsg, runId]
        );
      }
    });

    child.on("error", async (err: Error) => {
      activeJobs.delete(runId);
      console.error(`[Ingest] Failed to start pipeline: ${err.message}`);
      await query(
        "UPDATE pipeline_runs SET status = 'failed', finished_at = $1, error = $2 WHERE id = $3",
        [new Date().toISOString(), err.message, runId]
      );
    });

    res.status(202).json({
      jobId: runId,
      status: "processing",
      message: "Pipeline triggered successfully",
    });
  } catch (error) {
    console.error("[API] Error triggering ingest:", error);
    res.status(500).json({ error: "Failed to trigger pipeline" });
  }
});

/**
 * GET /ingest/status/:jobId
 * Returns the current status of a pipeline run.
 */
router.get("/status/:jobId", async (req: Request, res: Response) => {
  try {
    const jobId = parseInt(req.params.jobId, 10);
    if (isNaN(jobId)) {
      res.status(400).json({ error: "Invalid job ID" });
      return;
    }

    const run = await getOne(
      "SELECT id, status, started_at, finished_at, error, articles_processed FROM pipeline_runs WHERE id = $1",
      [jobId]
    );

    if (!run) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    res.json({
      jobId: run.id,
      status: run.status,
      startedAt: run.started_at,
      finishedAt: run.finished_at,
      error: run.error,
      articlesProcessed: run.articles_processed,
    });
  } catch (error) {
    console.error("[API] Error checking ingest status:", error);
    res.status(500).json({ error: "Failed to check job status" });
  }
});

export default router;
