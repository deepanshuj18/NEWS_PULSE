/**
 * News Pulse — Backend API Server
 * 

 *
 * Express server serving cluster, timeline, and ingest endpoints.
 * Supports both SQLite (local dev) and PostgreSQL (production).
 */

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import clusterRoutes from "./routes/clusters";
import timelineRoutes from "./routes/timeline";
import ingestRoutes from "./routes/ingest";

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";

// --- Middleware ---

app.use(cors({
  origin: CORS_ORIGIN.split(",").map(s => s.trim()),
  methods: ["GET", "POST"],
  credentials: true,
}));

app.use(express.json());

// Request logging
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// --- Routes ---

app.get("/", (_req, res) => {
  res.json({
    name: "News Pulse API",
    version: "1.0.0",
    endpoints: {
      "GET /clusters": "List all topic clusters",
      "GET /clusters/:id": "Get cluster detail with articles",
      "GET /timeline": "Get timeline-formatted cluster data",
      "POST /ingest/trigger": "Trigger the scraping + clustering pipeline",
      "GET /ingest/status/:jobId": "Check pipeline job status",
    },
  });
});

app.use("/clusters", clusterRoutes);
app.use("/timeline", timelineRoutes);
app.use("/ingest", ingestRoutes);

// --- Health check ---

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// --- Error handling ---

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[Server] Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// --- Start server ---

app.listen(PORT, () => {
  console.log(`\n🚀 News Pulse API running on http://localhost:${PORT}`);
  console.log(`   CORS origin: ${CORS_ORIGIN}`);
  console.log(`   Database: ${process.env.DATABASE_URL?.startsWith("sqlite") ? "SQLite" : "PostgreSQL"}\n`);
});

export default app;
