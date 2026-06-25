"""
Database module for News Pulse scraper.
Supports both SQLite (local dev) and PostgreSQL (production).
"""

import sqlite3
import hashlib
import os
import json
from datetime import datetime, timezone
from config import DATABASE_URL


def _is_sqlite():
    return DATABASE_URL.startswith("sqlite")


def _get_sqlite_path():
    return DATABASE_URL.replace("sqlite:///", "")


def get_connection():
    """Get a database connection based on DATABASE_URL."""
    if _is_sqlite():
        conn = sqlite3.connect(_get_sqlite_path())
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn
    else:
        import psycopg2
        import psycopg2.extras
        conn = psycopg2.connect(DATABASE_URL)
        conn.autocommit = False
        return conn


def init_db():
    """Initialize database tables."""
    conn = get_connection()
    cur = conn.cursor()

    if _is_sqlite():
        cur.executescript("""
            CREATE TABLE IF NOT EXISTS sources (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                rss_url TEXT NOT NULL,
                enabled INTEGER DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS articles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_id INTEGER NOT NULL REFERENCES sources(id),
                url TEXT NOT NULL,
                url_hash TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                summary TEXT,
                body TEXT,
                published_at TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                UNIQUE(url_hash)
            );

            CREATE TABLE IF NOT EXISTS pipeline_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                status TEXT NOT NULL DEFAULT 'pending',
                started_at TEXT DEFAULT (datetime('now')),
                finished_at TEXT,
                error TEXT,
                articles_processed INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS clusters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                label TEXT NOT NULL,
                article_count INTEGER DEFAULT 0,
                pipeline_run_id INTEGER REFERENCES pipeline_runs(id),
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS cluster_articles (
                cluster_id INTEGER NOT NULL REFERENCES clusters(id),
                article_id INTEGER NOT NULL REFERENCES articles(id),
                PRIMARY KEY (cluster_id, article_id)
            );

            CREATE TABLE IF NOT EXISTS story_groups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS story_group_clusters (
                story_group_id INTEGER NOT NULL REFERENCES story_groups(id),
                cluster_id INTEGER NOT NULL REFERENCES clusters(id),
                PRIMARY KEY (story_group_id, cluster_id)
            );
        """)
    else:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS sources (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                rss_url TEXT NOT NULL,
                enabled BOOLEAN DEFAULT TRUE
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS articles (
                id SERIAL PRIMARY KEY,
                source_id INTEGER NOT NULL REFERENCES sources(id),
                url TEXT NOT NULL,
                url_hash VARCHAR(64) NOT NULL UNIQUE,
                title TEXT NOT NULL,
                summary TEXT,
                body TEXT,
                published_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS pipeline_runs (
                id SERIAL PRIMARY KEY,
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                started_at TIMESTAMPTZ DEFAULT NOW(),
                finished_at TIMESTAMPTZ,
                error TEXT,
                articles_processed INTEGER DEFAULT 0
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS clusters (
                id SERIAL PRIMARY KEY,
                label TEXT NOT NULL,
                article_count INTEGER DEFAULT 0,
                pipeline_run_id INTEGER REFERENCES pipeline_runs(id),
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS cluster_articles (
                cluster_id INTEGER NOT NULL REFERENCES clusters(id),
                article_id INTEGER NOT NULL REFERENCES articles(id),
                PRIMARY KEY (cluster_id, article_id)
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS story_groups (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS story_group_clusters (
                story_group_id INTEGER NOT NULL REFERENCES story_groups(id),
                cluster_id INTEGER NOT NULL REFERENCES clusters(id),
                PRIMARY KEY (story_group_id, cluster_id)
            );
        """)

    conn.commit()
    conn.close()
    print("[DB] Tables initialized.")


def ensure_sources(feeds):
    """Insert source records if they don't already exist."""
    conn = get_connection()
    cur = conn.cursor()

    for feed in feeds:
        if _is_sqlite():
            cur.execute(
                "INSERT OR IGNORE INTO sources (name, rss_url) VALUES (?, ?)",
                (feed["name"], feed["url"]),
            )
        else:
            cur.execute(
                "INSERT INTO sources (name, rss_url) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                (feed["name"], feed["url"]),
            )

    conn.commit()
    conn.close()


def get_source_id(source_name):
    """Get source ID by name."""
    conn = get_connection()
    cur = conn.cursor()
    placeholder = "?" if _is_sqlite() else "%s"
    cur.execute(f"SELECT id FROM sources WHERE name = {placeholder}", (source_name,))
    row = cur.fetchone()
    conn.close()
    return row[0] if row else None


def url_hash(url):
    """Generate SHA-256 hash of a normalized URL for deduplication."""
    return hashlib.sha256(normalize_url(url).encode("utf-8")).hexdigest()


def normalize_url(url):
    """Normalize URL by removing tracking parameters and standardizing format."""
    from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

    parsed = urlparse(url.strip().lower())

    # Remove common tracking parameters
    tracking_params = {
        "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
        "ref", "fbclid", "gclid", "mc_cid", "mc_eid",
    }
    query_params = parse_qs(parsed.query)
    filtered_params = {
        k: v for k, v in query_params.items() if k not in tracking_params
    }
    clean_query = urlencode(filtered_params, doseq=True)

    # Remove trailing slash from path
    path = parsed.path.rstrip("/")

    return urlunparse((parsed.scheme, parsed.netloc, path, "", clean_query, ""))


def insert_article(source_id, url, title, summary, body, published_at):
    """Insert an article, skipping if duplicate URL hash exists. Returns True if inserted."""
    conn = get_connection()
    cur = conn.cursor()
    hash_val = url_hash(url)

    try:
        if _is_sqlite():
            cur.execute(
                """INSERT OR IGNORE INTO articles 
                   (source_id, url, url_hash, title, summary, body, published_at) 
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (source_id, url, hash_val, title, summary, body, published_at),
            )
        else:
            cur.execute(
                """INSERT INTO articles 
                   (source_id, url, url_hash, title, summary, body, published_at) 
                   VALUES (%s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (url_hash) DO NOTHING""",
                (source_id, url, hash_val, title, summary, body, published_at),
            )
        conn.commit()
        inserted = cur.rowcount > 0
        conn.close()
        return inserted
    except Exception as e:
        conn.rollback()
        conn.close()
        print(f"[DB] Error inserting article: {e}")
        return False


def create_pipeline_run():
    """Create a new pipeline run record. Returns the run ID."""
    conn = get_connection()
    cur = conn.cursor()

    if _is_sqlite():
        cur.execute(
            "INSERT INTO pipeline_runs (status) VALUES ('pending')"
        )
        run_id = cur.lastrowid
    else:
        cur.execute(
            "INSERT INTO pipeline_runs (status) VALUES ('pending') RETURNING id"
        )
        run_id = cur.fetchone()[0]

    conn.commit()
    conn.close()
    return run_id


def update_pipeline_run(run_id, status, articles_processed=0, error=None):
    """Update pipeline run status."""
    conn = get_connection()
    cur = conn.cursor()
    placeholder = "?" if _is_sqlite() else "%s"
    now = datetime.now(timezone.utc).isoformat()

    if _is_sqlite():
        cur.execute(
            f"""UPDATE pipeline_runs 
               SET status = ?, finished_at = ?, articles_processed = ?, error = ?
               WHERE id = ?""",
            (status, now if status in ("completed", "failed") else None,
             articles_processed, error, run_id),
        )
    else:
        cur.execute(
            """UPDATE pipeline_runs 
               SET status = %s, finished_at = %s, articles_processed = %s, error = %s
               WHERE id = %s""",
            (status, now if status in ("completed", "failed") else None,
             articles_processed, error, run_id),
        )

    conn.commit()
    conn.close()


def get_all_articles():
    """Fetch all articles with source name for clustering."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT a.id, a.title, a.summary, a.body, a.published_at, a.url, s.name as source_name
        FROM articles a
        JOIN sources s ON a.source_id = s.id
        ORDER BY a.published_at DESC
    """)
    rows = cur.fetchall()
    conn.close()

    if _is_sqlite():
        return [dict(row) for row in rows]
    else:
        columns = [desc[0] for desc in cur.description]
        return [dict(zip(columns, row)) for row in rows]


def clear_clusters():
    """Clear existing cluster data before re-clustering."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM story_group_clusters")
    cur.execute("DELETE FROM story_groups")
    cur.execute("DELETE FROM cluster_articles")
    cur.execute("DELETE FROM clusters")
    conn.commit()
    conn.close()


def save_cluster(label, article_ids, pipeline_run_id):
    """Save a cluster with its article associations. Returns cluster ID."""
    conn = get_connection()
    cur = conn.cursor()

    if _is_sqlite():
        cur.execute(
            "INSERT INTO clusters (label, article_count, pipeline_run_id) VALUES (?, ?, ?)",
            (label, len(article_ids), pipeline_run_id),
        )
        cluster_id = cur.lastrowid
        for aid in article_ids:
            cur.execute(
                "INSERT INTO cluster_articles (cluster_id, article_id) VALUES (?, ?)",
                (cluster_id, aid),
            )
    else:
        cur.execute(
            "INSERT INTO clusters (label, article_count, pipeline_run_id) VALUES (%s, %s, %s) RETURNING id",
            (label, len(article_ids), pipeline_run_id),
        )
        cluster_id = cur.fetchone()[0]
        for aid in article_ids:
            cur.execute(
                "INSERT INTO cluster_articles (cluster_id, article_id) VALUES (%s, %s)",
                (cluster_id, aid),
            )

    conn.commit()
    conn.close()
    return cluster_id


def save_story_group(title, cluster_ids):
    """Save a story group linking multiple clusters."""
    conn = get_connection()
    cur = conn.cursor()

    if _is_sqlite():
        cur.execute(
            "INSERT INTO story_groups (title) VALUES (?)",
            (title,),
        )
        group_id = cur.lastrowid
        for cid in cluster_ids:
            cur.execute(
                "INSERT INTO story_group_clusters (story_group_id, cluster_id) VALUES (?, ?)",
                (group_id, cid),
            )
    else:
        cur.execute(
            "INSERT INTO story_groups (title) VALUES (%s) RETURNING id",
            (title,),
        )
        group_id = cur.fetchone()[0]
        for cid in cluster_ids:
            cur.execute(
                "INSERT INTO story_group_clusters (story_group_id, cluster_id) VALUES (%s, %s)",
                (group_id, cid),
            )

    conn.commit()
    conn.close()
    return group_id
