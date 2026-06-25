"use client";

/**
 * RefreshButton — Triggers the ingestion pipeline and shows job progress.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { triggerIngest, getIngestStatus } from "@/lib/api";

interface RefreshButtonProps {
  onComplete: () => void;
}

export default function RefreshButton({ onComplete }: RefreshButtonProps) {
  const [status, setStatus] = useState<"idle" | "triggering" | "processing" | "completed" | "failed">("idle");
  const [progress, setProgress] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleRefresh = useCallback(async () => {
    if (status === "triggering" || status === "processing") return;

    setStatus("triggering");
    setProgress("Starting pipeline...");

    try {
      const result = await triggerIngest();
      setStatus("processing");
      setProgress(`Job #${result.jobId} running...`);

      // Poll for completion
      pollRef.current = setInterval(async () => {
        try {
          const jobStatus = await getIngestStatus(result.jobId);

          if (jobStatus.status === "completed") {
            if (pollRef.current) clearInterval(pollRef.current);
            setStatus("completed");
            setProgress(`Done! ${jobStatus.articlesProcessed} articles processed`);
            onComplete();

            // Reset after 3 seconds
            setTimeout(() => {
              setStatus("idle");
              setProgress("");
            }, 3000);
          } else if (jobStatus.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            setStatus("failed");
            setProgress(jobStatus.error || "Pipeline failed");

            setTimeout(() => {
              setStatus("idle");
              setProgress("");
            }, 5000);
          } else {
            setProgress(`Processing... ${jobStatus.articlesProcessed || 0} articles so far`);
          }
        } catch {
          // Polling error, keep trying
        }
      }, 2000);
    } catch (error) {
      setStatus("failed");
      setProgress(error instanceof Error ? error.message : "Failed to trigger pipeline");
      setTimeout(() => {
        setStatus("idle");
        setProgress("");
      }, 5000);
    }
  }, [status, onComplete]);

  const isRunning = status === "triggering" || status === "processing";

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleRefresh}
        disabled={isRunning}
        className={`
          relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold
          transition-all duration-300 overflow-hidden
          ${isRunning
            ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 cursor-wait"
            : status === "completed"
              ? "bg-emerald-600/20 text-emerald-300 border border-emerald-500/30"
              : status === "failed"
                ? "bg-red-600/20 text-red-300 border border-red-500/30"
                : "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/30 hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-500/10"
          }
        `}
      >
        {/* Spinner */}
        {isRunning && (
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        )}

        {/* Success check */}
        {status === "completed" && (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )}

        {/* Error icon */}
        {status === "failed" && (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}

        {/* Refresh icon */}
        {status === "idle" && (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        )}

        <span>
          {status === "idle" && "Refresh Data"}
          {status === "triggering" && "Starting..."}
          {status === "processing" && "Processing..."}
          {status === "completed" && "Complete!"}
          {status === "failed" && "Failed"}
        </span>

        {/* Progress shimmer */}
        {isRunning && (
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />
        )}
      </button>

      {/* Status text */}
      {progress && (
        <span className={`text-xs ${status === "failed" ? "text-red-400" : status === "completed" ? "text-emerald-400" : "text-gray-400"}`}>
          {progress}
        </span>
      )}
    </div>
  );
}
