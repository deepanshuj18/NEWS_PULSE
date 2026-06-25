"""
News Pulse — Main Pipeline Entry Point

Usage:
    python main.py              # Full pipeline: fetch, extract, cluster
    python main.py --fetch-only # Only fetch and store articles
    python main.py --cluster-only # Only re-cluster existing articles
    python main.py --run-id 5   # Associate with a specific pipeline run
"""

import sys
import io
import time
import argparse
import traceback

# Force UTF-8 output so special characters (₹, é, etc.) don't crash on Windows cp1252 consoles
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from config import FEEDS
from db import (
    init_db,
    ensure_sources,
    get_source_id,
    insert_article,
    get_all_articles,
    clear_clusters,
    save_cluster,
    save_story_group,
    create_pipeline_run,
    update_pipeline_run,
)
from adapters import get_adapter
from extractors import extract_body
from clustering import cluster_articles, group_stories


def _process_single_article(article, source_id):
    """Process a single article: extract body + insert into DB. Returns 1 if inserted, 0 otherwise."""
    try:
        print(f"  Extracting: {article.title[:60]}...")
        body = extract_body(article.url)
        if body:
            article.body = body

        inserted = insert_article(
            source_id=source_id,
            url=article.url,
            title=article.title,
            summary=article.summary,
            body=article.body,
            published_at=article.published_at,
        )
        return 1 if inserted else 0
    except Exception as e:
        print(f"  [Pipeline] Error processing {article.url[:60]}: {e}")
        return 0


def fetch_articles():
    """Fetch articles from all configured RSS feeds using parallel extraction."""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    print("\n" + "=" * 60)
    print("PHASE 1: Fetching RSS feeds (parallel)")
    print("=" * 60)

    total_new = 0
    MAX_WORKERS = 20  # Parallel HTTP connections

    for feed_config in FEEDS:
        adapter = get_adapter(feed_config)
        articles = adapter.fetch_articles()
        source_id = get_source_id(feed_config["name"])

        if not source_id:
            print(f"[Pipeline] Warning: Source '{feed_config['name']}' not found in DB, skipping.")
            continue

        new_count = 0
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = {
                executor.submit(_process_single_article, article, source_id): article
                for article in articles
            }
            for future in as_completed(futures):
                new_count += future.result()

        print(f"[Pipeline] {feed_config['name']}: {new_count} new articles (of {len(articles)} parsed)")
        total_new += new_count

    return total_new


def run_clustering(pipeline_run_id):
    """Run clustering on all articles in the database."""
    print("\n" + "=" * 60)
    print("PHASE 2: Clustering articles")
    print("=" * 60)

    # Load all articles from DB
    articles = get_all_articles()
    if not articles:
        print("[Pipeline] No articles found for clustering.")
        return 0

    # Clear old clusters before re-clustering
    clear_clusters()

    # Run clustering
    clusters = cluster_articles(articles)

    # Save clusters to DB
    cluster_ids = []
    for cluster in clusters:
        cluster_id = save_cluster(
            label=cluster["label"],
            article_ids=cluster["article_ids"],
            pipeline_run_id=pipeline_run_id,
        )
        cluster_ids.append(cluster_id)
        cluster["db_id"] = cluster_id
        print(f"  Cluster '{cluster['label']}' — {len(cluster['article_ids'])} articles")

    # Run story grouping
    print("\n" + "=" * 60)
    print("PHASE 3: Story grouping")
    print("=" * 60)

    story_groups = group_stories(clusters)
    for sg in story_groups:
        sg_cluster_ids = [clusters[i]["db_id"] for i in sg["cluster_indices"]]
        save_story_group(sg["title"], sg_cluster_ids)
        print(f"  Story Group '{sg['title']}' — {len(sg_cluster_ids)} clusters merged")

    return len(clusters)


def run_pipeline(run_id=None):
    """Run the full pipeline: init → fetch → cluster."""
    start_time = time.time()

    print("\n" + "#" * 60)
    print("# NEWS PULSE — Pipeline Start")
    print("#" * 60)

    # Initialize database
    init_db()
    ensure_sources(FEEDS)

    # Create or use pipeline run
    if run_id is None:
        run_id = create_pipeline_run()

    update_pipeline_run(run_id, "processing")

    try:
        # Fetch articles
        new_articles = fetch_articles()

        # Cluster all articles
        num_clusters = run_clustering(run_id)

        # Update run status
        update_pipeline_run(run_id, "completed", articles_processed=new_articles)

        elapsed = time.time() - start_time
        minutes = int(elapsed // 60)
        seconds = int(elapsed % 60)

        print("\n" + "#" * 60)
        print(f"# Pipeline Complete!")
        print(f"# New articles:  {new_articles}")
        print(f"# Clusters:      {num_clusters}")
        print(f"# Run ID:        {run_id}")
        print(f"# Time taken:    {minutes}m {seconds}s ({elapsed:.2f}s total)")
        print("#" * 60)

        return run_id

    except Exception as e:
        error_msg = f"{type(e).__name__}: {str(e)}"
        print(f"\n[Pipeline] FATAL ERROR: {error_msg}")
        traceback.print_exc()
        update_pipeline_run(run_id, "failed", error=error_msg)
        raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="News Pulse Pipeline")
    parser.add_argument("--fetch-only", action="store_true", help="Only fetch articles, skip clustering")
    parser.add_argument("--cluster-only", action="store_true", help="Only re-cluster existing articles")
    parser.add_argument("--run-id", type=int, help="Pipeline run ID to use")
    args = parser.parse_args()

    init_db()
    ensure_sources(FEEDS)

    if args.cluster_only:
        run_id = args.run_id or create_pipeline_run()
        update_pipeline_run(run_id, "processing")
        try:
            run_clustering(run_id)
            update_pipeline_run(run_id, "completed")
        except Exception as e:
            update_pipeline_run(run_id, "failed", error=str(e))
            raise
    elif args.fetch_only:
        fetch_articles()
    else:
        run_pipeline(args.run_id)
