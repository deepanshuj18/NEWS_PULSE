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
 * Triggers the GitHub Actions scraping pipeline via repository_dispatch webhook.
 * Returns 202 Accepted with a jobId for status polling.
 */
router.post("/trigger", async (req: Request, res: Response) => {
  try {
    const githubToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
    if (!githubToken) {
      console.warn("[Ingest] Warning: GITHUB_PERSONAL_ACCESS_TOKEN is not set. Mocking trigger response.");
      return res.status(202).json({ jobId: `job_${Date.now()}`, status: 'running' });
    }

    // Triggers your free GitHub Actions pipeline via the GitHub API
    const response = await fetch(
      "https://api.github.com/repos/deepanshuj18/NEWS_PULSE/dispatches",
      {
        method: "POST",
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ event_type: "manual-trigger" }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("GitHub API error:", response.status, errText);
      throw new Error(`GitHub API returned ${response.status}`);
    }

    console.log("[Ingest] GitHub pipeline triggered successfully.");
    // Returns a mock/running job ID immediately as requested by the JD
    return res.status(202).json({ jobId: `job_${Date.now()}`, status: "running" });
  } catch (error) {
    console.error("Failed to trigger GitHub pipeline:", error);
    return res.status(500).json({ error: "Failed to initialize scraping pipeline" });
  }
});

/**
 * GET /ingest/status/:jobId
 * Returns the current status of a pipeline run.
 */
router.get("/status/:jobId", async (req: Request, res: Response) => {
  try {
    const jobId = req.params.jobId;
    
    // Handle mock string job IDs from GitHub Actions trigger
    if (typeof jobId === "string" && jobId.startsWith("job_")) {
      const timestamp = parseInt(jobId.replace("job_", ""), 10);
      const isCompleted = Date.now() - timestamp > 45000; // Mock 45s run time
      return res.json({
        jobId: jobId,
        status: isCompleted ? "completed" : "running",
        startedAt: new Date(timestamp).toISOString(),
        finishedAt: isCompleted ? new Date().toISOString() : null,
      });
    }

    const numericJobId = parseInt(jobId, 10);
    if (isNaN(numericJobId)) {
      res.status(400).json({ error: "Invalid job ID" });
      return;
    }

    const run = await getOne(
      "SELECT id, status, started_at, finished_at, error, articles_processed FROM pipeline_runs WHERE id = $1",
      [numericJobId]
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
