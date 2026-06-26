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
 * In development: spawns the local Python scraper as a child process.
 * In production:  dispatches a GitHub Actions workflow via the GitHub API.
 * Returns 202 Accepted with a jobId for status polling.
 */
router.post("/trigger", async (req: Request, res: Response) => {
  try {
    // ── LOCAL DEVELOPMENT MODE ──────────────────────────────────────────────
    if (process.env.NODE_ENV === "development") {
      console.log("[Ingest] Local development detected — spawning local scraper…");

      // Resolve paths from .env (set in backend/.env)
      // process.cwd() is the 'backend' directory where the server was started
      const pythonInterpreter = path.resolve(
        process.cwd(),
        process.env.PYTHON_PATH || "../scraper/venv/Scripts/python.exe"
      );
      const scraperDir = path.resolve(
        process.cwd(),
        process.env.SCRAPER_DIR || "../scraper"
      );
      const scraperScript = path.resolve(scraperDir, "main.py");

      console.log(`[Ingest] Executing: ${pythonInterpreter} ${scraperScript}`);
      console.log(`[Ingest] Working dir: ${scraperDir}`);

      const jobId = `local_${Date.now()}`;

      // Spawn asynchronously — don't block the HTTP response
      const scraperProcess = spawn(pythonInterpreter, [scraperScript], {
        cwd: scraperDir,
        env: { ...process.env }, // Pass DATABASE_URL, GEMINI_API_KEY etc.
      });

      // Stream stdout/stderr to the Node console in real-time
      scraperProcess.stdout.on("data", (data: Buffer) => {
        console.log(`[Scraper] ${data.toString().trim()}`);
      });

      scraperProcess.stderr.on("data", (data: Buffer) => {
        console.error(`[Scraper ERR] ${data.toString().trim()}`);
      });

      scraperProcess.on("error", (err: Error) => {
        console.error(`[Ingest] Failed to start local scraper process: ${err.message}`);
        console.error(`Please verify that PYTHON_PATH (${pythonInterpreter}) is correct.`);
      });

      scraperProcess.on("close", (code: number | null) => {
        console.log(`[Ingest] Local scraper exited with code ${code}`);
        // Bust the timeline cache so the next frontend poll gets fresh data
        invalidateTimelineCache();
      });

      return res.status(202).json({
        jobId,
        status: "running",
        message: "Local scraper pipeline spawned in background.",
      });
    }

    // ── PRODUCTION: GitHub Actions dispatch ──────────────────────────────────
    const githubToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
    if (!githubToken) {
      throw new Error("GITHUB_PERSONAL_ACCESS_TOKEN environment variable is missing.");
    }

    // Triggers your free GitHub Actions pipeline via the GitHub API
    const response = await fetch(
      "https://api.github.com/repos/deepanshuj18/NEWS_PULSE/dispatches",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubToken.trim()}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "News-Pulse-Backend-API",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ event_type: "manual-trigger" }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("GitHub API error:", response.status, errText);
      throw new Error(`GitHub API returned ${response.status}: ${errText}`);
    }

    console.log("[Ingest] GitHub pipeline triggered successfully.");
    return res.status(202).json({ jobId: `job_${Date.now()}`, status: "running" });
  } catch (error: any) {
    console.error("Failed to trigger pipeline:", error);
    return res.status(500).json({ 
      error: "Failed to initialize scraping pipeline",
      details: error?.message || String(error)
    });
  }
});

/**
 * GET /ingest/status/:jobId
 * Returns the current status of a pipeline run.
 */
router.get("/status/:jobId", async (req: Request, res: Response) => {
  try {
    const jobId = req.params.jobId;
    
    // Handle mock string job IDs (job_* from production mock, local_* from dev mode)
    if (typeof jobId === "string" && (jobId.startsWith("job_") || jobId.startsWith("local_"))) {
      const prefix = jobId.startsWith("local_") ? "local_" : "job_";
      const timestamp = parseInt(jobId.replace(prefix, ""), 10);
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
