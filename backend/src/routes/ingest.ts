/**
 * Ingest routes — trigger Python pipeline and poll job status.
 */

import { Router, Request, Response } from "express";
import { spawn } from "child_process";
import path from "path";
import { query, getOne } from "../db";
import { invalidateTimelineCache } from "./timeline";

const router = Router();

// In-memory job tracking for local processes
const localJobStatus = new Map<string, { status: string; conclusion: string | null }>();

// Track when production jobs were dispatched to avoid stale run detection
const jobDispatchTime = new Map<string, number>();

async function getGithubActionsStatus(
  token: string,
  dispatchedAfter?: number
): Promise<{ status: string; conclusion: string | null }> {
  const resp = await fetch(
    "https://api.github.com/repos/deepanshuj18/NEWS_PULSE/actions/workflows/scraper.yml/runs?event=repository_dispatch&per_page=1",
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    }
  );
  const data = await resp.json();
  const latestRun = data.workflow_runs?.[0];
  
  if (!latestRun) return { status: "unknown", conclusion: null };

  // If we know when this job was dispatched, ignore runs that started before it
  if (dispatchedAfter) {
    const runCreatedAt = new Date(latestRun.created_at).getTime();
    if (runCreatedAt < dispatchedAfter) {
      // The latest run is from before our dispatch — our run hasn't appeared yet
      return { status: "queued", conclusion: null };
    }
  }
  
  return {
    status: latestRun.status ?? "unknown",
    conclusion: latestRun.conclusion ?? null
  };
}

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
      localJobStatus.set(jobId, { status: "running", conclusion: null });

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
        const conclusion = code === 0 ? "success" : "failure";
        localJobStatus.set(jobId, { status: "completed", conclusion });
        
        if (conclusion === "success") {
          // Bust the timeline cache so the next frontend poll gets fresh data
          invalidateTimelineCache();
        }
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
        body: JSON.stringify({ event_type: "trigger-scraper" }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("GitHub API error:", response.status, errText);
      throw new Error(`GitHub API returned ${response.status}: ${errText}`);
    }

    console.log("[Ingest] GitHub pipeline triggered successfully.");
    const jobId = `job_${Date.now()}`;
    jobDispatchTime.set(jobId, Date.now());
    return res.status(202).json({ jobId, status: "running" });
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
      const isLocal = jobId.startsWith("local_");
      const prefix = isLocal ? "local_" : "job_";
      const timestamp = parseInt(jobId.replace(prefix, ""), 10);
      let finalStatus = "running";

      if (!isLocal && process.env.GITHUB_PERSONAL_ACCESS_TOKEN) {
        const dispatchedAt = jobDispatchTime.get(jobId);
        const ghData = await getGithubActionsStatus(
          process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
          dispatchedAt
        );
        if (ghData.status === "completed") {
          if (ghData.conclusion === "success") {
            finalStatus = "completed";
          } else {
            finalStatus = "failed";
          }
        } else {
          finalStatus = "running";
        }
      } else {
        const jobData = localJobStatus.get(jobId);
        if (jobData) {
          if (jobData.status === "completed") {
            finalStatus = jobData.conclusion === "success" ? "completed" : "failed";
          } else {
            finalStatus = "running";
          }
        } else {
          // Fallback if job is not in memory
          const isCompleted = Date.now() - timestamp > 150000;
          finalStatus = isCompleted ? "completed" : "running";
        }
      }

      if (finalStatus === "completed") {
        invalidateTimelineCache();
        // Cleanup tracking maps
        jobDispatchTime.delete(jobId);
        localJobStatus.delete(jobId);
      } else if (finalStatus === "failed") {
        jobDispatchTime.delete(jobId);
        localJobStatus.delete(jobId);
      }

      return res.json({
        jobId: jobId,
        status: finalStatus,
        startedAt: new Date(timestamp).toISOString(),
        finishedAt: finalStatus === "completed" || finalStatus === "failed" ? new Date().toISOString() : null,
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
