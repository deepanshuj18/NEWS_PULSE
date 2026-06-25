/**
 * Database connection module — supports both SQLite (local dev) and PostgreSQL (production).
 * Uses sql.js (pure JS, no native deps) for SQLite and pg for PostgreSQL.
 */

import path from "path";
import fs from "fs";

function getDbUrl(): string {
  return process.env.DATABASE_URL || "sqlite:///newspulse.db";
}

function isSqlite(): boolean {
  return getDbUrl().startsWith("sqlite");
}

function getSqlitePath(): string {
  const dbPath = getDbUrl().replace("sqlite:///", "");
  if (!path.isAbsolute(dbPath)) {
    const scraperDir = process.env.SCRAPER_DIR || "../scraper";
    return path.resolve(scraperDir, dbPath);
  }
  return dbPath;
}

// --- sql.js implementation ---

let sqliteDb: any = null;
let sqliteDbPath: string = "";

async function getSqliteDb() {
  if (!sqliteDb) {
    const initSqlJs = require("sql.js");
    const SQL = await initSqlJs();
    sqliteDbPath = getSqlitePath();
    console.log(`[DB] Connecting to SQLite: ${sqliteDbPath}`);

    if (fs.existsSync(sqliteDbPath)) {
      const fileBuffer = fs.readFileSync(sqliteDbPath);
      sqliteDb = new SQL.Database(fileBuffer);
    } else {
      sqliteDb = new SQL.Database();
    }

    sqliteDb.run("PRAGMA foreign_keys = ON");
  }
  return sqliteDb;
}

function saveSqliteDb() {
  if (sqliteDb && sqliteDbPath) {
    const data = sqliteDb.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(sqliteDbPath, buffer);
  }
}

// --- PostgreSQL implementation ---

let pgPool: any = null;

function getPgPool() {
  if (!pgPool) {
    const { Pool } = require("pg");
    const dbUrl = getDbUrl();
    
    // Neon PostgreSQL requires SSL connections
    const isNeon = dbUrl.includes("neon.tech");
    
    pgPool = new Pool({ 
      connectionString: dbUrl,
      ssl: isNeon ? { rejectUnauthorized: false } : undefined
    });
    
    console.log(`[DB] Connected to PostgreSQL${isNeon ? " (Neon SSL Enabled)" : ""}`);
  }
  return pgPool;
}

// --- Unified query interface ---

export interface QueryResult {
  rows: any[];
}

export async function query(sql: string, params: any[] = []): Promise<QueryResult> {
  if (isSqlite()) {
    const db = await getSqliteDb();
    // Convert $1, $2 to ? for SQLite
    const sqliteSql = sql.replace(/\$\d+/g, "?");

    const trimmed = sqliteSql.trim().toUpperCase();
    if (trimmed.startsWith("SELECT") || trimmed.startsWith("WITH")) {
      const stmt = db.prepare(sqliteSql);
      if (params.length > 0) stmt.bind(params);

      const rows: any[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        rows.push(row);
      }
      stmt.free();
      return { rows };
    } else {
      db.run(sqliteSql, params);

      // For INSERT, get the last inserted row ID
      const lastIdResult = db.exec("SELECT last_insert_rowid() as id");
      const lastId = lastIdResult.length > 0 ? lastIdResult[0].values[0][0] : null;
      const changes = db.getRowsModified();

      saveSqliteDb();
      return { rows: [{ id: lastId, changes }] };
    }
  } else {
    const pool = getPgPool();
    const result = await pool.query(sql, params);
    return { rows: result.rows };
  }
}

export async function getOne(sql: string, params: any[] = []): Promise<any | null> {
  const result = await query(sql, params);
  return result.rows[0] || null;
}

export function closeDb() {
  if (sqliteDb) {
    saveSqliteDb();
    sqliteDb.close();
    sqliteDb = null;
  }
  if (pgPool) {
    pgPool.end();
    pgPool = null;
  }
}

export { isSqlite };
