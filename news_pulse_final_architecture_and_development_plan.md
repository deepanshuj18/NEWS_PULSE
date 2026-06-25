# News Pulse — Final Architecture and Phase-wise Development Plan

## 1. Project Goal
Build a production-style news intelligence system that:
- pulls articles from multiple RSS feeds,
- normalizes messy feed data,
- extracts full article content,
- groups related articles into semantic clusters,
- merges related clusters into higher-level story groups,
- displays the result on a polished timeline UI,
- supports async ingestion refresh,
- and is deployed live.

The design prioritizes reliability, clean boundaries between components, and a clear demo story for interview review.

---

## 2. Final Architecture Overview

### 2.1 System Layers

**Frontend (Next.js)**
- Timeline visualization
- Cluster / story group explorer
- Source filter
- Refresh button
- Auto refresh polling
- Job status UI

**Backend API (Node.js + TypeScript)**
- REST endpoints
- Job orchestration
- Input validation
- Query shaping for frontend
- Database read/write access

**Worker Pipeline (Python)**
- RSS feed adapters
- Article extraction
- Deduplication
- Embedding generation
- HDBSCAN clustering
- Story grouping
- Cluster label generation

**Storage (PostgreSQL)**
- Articles
- Clusters
- Story groups
- Job status
- Source metadata

**Deployment**
- Frontend: Vercel
- Backend: Render
- Database: Neon PostgreSQL
- Scheduled refresh: GitHub Actions or backend trigger

---

## 3. Final Architecture Diagram

```text
┌─────────────────────────────────────────────────────────────┐
│                         FRONTEND                            │
│                    Next.js + Tailwind                       │
│-------------------------------------------------------------│
│ Timeline Visualization                                       │
│ Cluster / Story Explorer                                     │
│ Source Filter                                                │
│ Refresh Button                                               │
│ Auto Refresh (polling)                                       │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      NODE API LAYER                         │
│                  Express + TypeScript                       │
│-------------------------------------------------------------│
│ GET /clusters                                               │
│ GET /clusters/:id                                           │
│ GET /timeline                                               │
│ POST /ingest/trigger                                        │
│ GET /ingest/status/:jobId                                   │
│                                                             │
│ Responsibilities:                                           │
│ - request validation                                        │
│ - response shaping                                          │
│ - job creation                                              │
│ - orchestration                                             │
└───────────────┬───────────────────────────────┬─────────────┘
                │                               │
                │ read/write                    │ async job control
                ▼                               ▼
┌──────────────────────────────┐     ┌────────────────────────┐
│     POSTGRESQL DATABASE      │     │     PYTHON WORKER      │
│        Neon / Supabase       │     │ RSS + NLP Pipeline     │
│------------------------------│     │------------------------│
│ articles                     │     │ RSS feed adapters      │
│ clusters                     │     │ full text extraction    │
│ cluster_articles             │     │ deduplication           │
│ story_groups                 │     │ embeddings              │
│ story_group_clusters         │     │ HDBSCAN clustering      │
│ pipeline_runs                │     │ story grouping          │
│ sources                      │     │ label generation        │
└──────────────────────────────┘     └────────────────────────┘
```

---

## 4. Detailed Component Use Cases and How They Work

### 4.1 Frontend — Next.js + Tailwind

#### Use Case 1: Visualize news activity on a timeline
**How it works:**
- Frontend requests `/timeline` from the backend.
- Each timeline item contains a label, start time, end time, article count, and sources.
- The UI renders each story group as a horizontal bar spanning its activity window.
- Larger article volume can be represented by thicker or more prominent bars.

**Why it matters:**
- The assessment wants a timeline, not a simple list.
- This is the most visible part of the demo.

#### Use Case 2: Inspect a cluster or story group
**How it works:**
- User clicks a timeline item.
- Frontend loads cluster details from `/clusters/:id`.
- Articles are shown with headline, source, published time, and link.
- The detail panel helps explain why articles were grouped together.

#### Use Case 3: Filter by source
**How it works:**
- User toggles sources such as BBC, NPR, Reuters, or Guardian.
- The frontend filters visible clusters or timeline data.
- This makes the timeline easier to understand and demonstrates control over the data.

#### Use Case 4: Refresh data
**How it works:**
- User clicks Refresh.
- Frontend calls `POST /ingest/trigger`.
- It receives a `jobId` immediately.
- React Query polls `GET /ingest/status/:jobId` until completion.
- Once completed, the timeline data is refetched.

#### Use Case 5: Auto refresh
**How it works:**
- A background polling interval re-fetches timeline data at a fixed frequency.
- Useful for a live demo or for showing how the system would work in a real product.

---

### 4.2 Backend API — Node.js + TypeScript + Express

#### Use Case 1: Serve cluster and timeline data
**How it works:**
- Backend reads from PostgreSQL.
- It shapes data into frontend-ready structures.
- It avoids pushing database complexity into the UI.

#### Use Case 2: Trigger ingestion
**How it works:**
- `POST /ingest/trigger` creates a new pipeline run record.
- The backend starts the Python worker process or signals a worker job.
- The endpoint returns immediately with `202 Accepted` and a `jobId`.
- This keeps the API responsive.

#### Use Case 3: Track ingestion progress
**How it works:**
- Frontend polls `GET /ingest/status/:jobId`.
- Backend reads job status from the database.
- Possible states: pending, processing, completed, failed.

#### Use Case 4: Validate and protect the API
**How it works:**
- Zod validates route inputs.
- Invalid requests return `400`.
- Missing records return `404`.
- Unexpected issues return `500`.
- This makes the backend feel production-ready.

---

### 4.3 Python Worker — RSS + NLP Pipeline

#### Use Case 1: Read multiple RSS feeds
**How it works:**
- Each feed gets its own adapter.
- BBC, NPR, Reuters, Guardian, or another source can be mapped into a common schema.
- Feed-specific quirks are isolated inside adapters.

#### Use Case 2: Normalize messy feed data
**How it works:**
- Different feeds may use different XML fields.
- The adapter layer converts them into a standard article structure.
- Missing or inconsistent dates are normalized.

#### Use Case 3: Extract full article content
**How it works:**
- The worker fetches the article URL.
- It uses a primary extractor first.
- If that fails, it falls back to a simpler HTML extraction method.
- If full extraction still fails, summary text is preserved so the pipeline continues.

#### Use Case 4: Remove duplicates
**How it works:**
- URLs are normalized before hashing.
- Tracking parameters are removed.
- A SHA-256 deduplication key is generated.
- Inserts use a unique constraint to prevent duplicate rows.

#### Use Case 5: Convert text into semantic vectors
**How it works:**
- The worker generates embeddings for article title + summary + body.
- These vectors represent meaning rather than just word overlap.

#### Use Case 6: Cluster related articles
**How it works:**
- HDBSCAN groups semantically similar articles.
- It automatically determines cluster structure without needing a fixed number of clusters.
- Articles that do not belong to any meaningful topic are treated as noise.

#### Use Case 7: Merge clusters into story groups
**How it works:**
- After cluster creation, cluster centroids are compared.
- Similar clusters from different sources can be merged into a higher-level story group.
- This is useful for cross-source story tracking.

#### Use Case 8: Generate human-readable labels
**How it works:**
- A label is produced from representative keywords or a lightweight summarization step.
- The goal is a readable, short label for the timeline.
- Labels should be polished enough for presentation.

---

### 4.4 PostgreSQL Storage Layer

#### Use Case 1: Store article records safely
**How it works:**
- Each article is inserted once.
- Unique URL hash prevents duplicates.
- The database becomes the source of truth.

#### Use Case 2: Store topic clusters and story groups
**How it works:**
- Articles are linked to clusters.
- Clusters may be linked to story groups.
- This allows a single article to be part of the final event model while still preserving detail.

#### Use Case 3: Track pipeline runs
**How it works:**
- Every ingestion run gets a job record.
- The job table supports the async refresh flow.
- If a run fails, the error is visible and debug-friendly.

---

## 5. Database Tables

### 5.1 `sources`
Stores metadata about each RSS source.

**Fields:**
- id
- name
- rss_url
- enabled

### 5.2 `articles`
Stores normalized article data.

**Fields:**
- id
- source_id
- url
- url_hash
- title
- summary
- body
- published_at
- created_at

### 5.3 `clusters`
Stores topic clusters.

**Fields:**
- id
- label
- article_count
- created_at

### 5.4 `cluster_articles`
Maps articles to clusters.

**Fields:**
- cluster_id
- article_id

### 5.5 `story_groups`
Stores merged higher-level stories.

**Fields:**
- id
- title
- created_at

### 5.6 `story_group_clusters`
Maps clusters to story groups.

**Fields:**
- story_group_id
- cluster_id

### 5.7 `pipeline_runs`
Tracks ingestion jobs.

**Fields:**
- id
- status
- started_at
- finished_at
- error
- articles_processed

---

## 6. Phase-wise Development Plan

## Phase 1 — Project Setup and Foundation

### Goal
Create the repo structure and basic project skeletons.

### Tasks
- Create `/frontend`, `/backend`, and `/scraper` folders.
- Initialize Next.js app.
- Initialize Node.js + TypeScript backend.
- Initialize Python worker project.
- Set up environment variable templates.
- Add README and architecture notes.

### Output
- Clean project structure
- Running dev servers
- Clear repo boundaries

---

## Phase 2 — Database Design

### Goal
Define the storage contract before writing logic.

### Tasks
- Design PostgreSQL schema.
- Create tables for sources, articles, clusters, story groups, and jobs.
- Add unique constraints for deduplication.
- Add foreign keys and many-to-many mapping tables.

### Output
- Database schema finalized
- Both Node and Python can work against the same schema

---

## Phase 3 — RSS Ingestion Layer

### Goal
Read articles from multiple feeds and normalize them.

### Tasks
- Build base adapter interface.
- Add feed-specific adapters.
- Normalize titles, links, summaries, and dates.
- Handle missing or inconsistent feed fields.

### Output
- Standardized article objects
- Multiple feeds parsed reliably

---

## Phase 4 — Content Extraction and Deduplication

### Goal
Improve article quality and prevent duplicate storage.

### Tasks
- Fetch full article body from original URL.
- Add primary extraction and fallback extraction.
- Normalize URL before hashing.
- Skip duplicates using unique hash constraints.

### Output
- Cleaner article text
- No duplicate inserts on repeated runs

---

## Phase 5 — Semantic Clustering

### Goal
Group related articles into meaningful topic clusters.

### Tasks
- Generate embeddings.
- Run HDBSCAN.
- Label clusters using top keywords or a lightweight label generator.
- Save cluster relationships to the database.

### Output
- Meaningful topic clusters
- Noise articles separated out

---

## Phase 6 — Story Grouping

### Goal
Merge clusters that represent the same broader news event.

### Tasks
- Compute cluster centroid embeddings.
- Compare clusters using cosine similarity.
- Merge related clusters into story groups.
- Store story-group-to-cluster mappings.

### Output
- Higher-level story events
- Better cross-source visualization

---

## Phase 7 — Backend API Development

### Goal
Serve data to the frontend and handle ingestion control.

### Tasks
- Build `/clusters` endpoint.
- Build `/clusters/:id` endpoint.
- Build `/timeline` endpoint.
- Build `/ingest/trigger` endpoint.
- Build `/ingest/status/:jobId` endpoint.
- Add validation and centralized error handling.

### Output
- Fully functional API layer
- Frontend-ready response formats

---

## Phase 8 — Async Job Orchestration

### Goal
Make ingestion non-blocking.

### Tasks
- Create job record on trigger.
- Start worker execution asynchronously.
- Update job status in the database.
- Support polling from frontend.

### Output
- Safe refresh flow
- No UI freeze or API timeout risk

---

## Phase 9 — Frontend Timeline UI

### Goal
Build the polished visual experience.

### Tasks
- Build timeline component.
- Build cluster/story detail drawer.
- Add source filters.
- Add refresh button.
- Add loading and error states.
- Add auto refresh.

### Output
- Demo-ready timeline UI
- Clear visual storytelling

---

## Phase 10 — Deployment

### Goal
Run the whole system live.

### Tasks
- Deploy frontend to Vercel.
- Deploy backend to Render.
- Deploy database to Neon.
- Configure environment variables.
- Add production URLs to README.

### Output
- Live demo accessible to reviewers
- Production-style deployment story

---

## Phase 11 — Testing and Hardening

### Goal
Reduce runtime risk and improve reliability.

### Tasks
- Test clustering logic.
- Test adapter normalization.
- Test deduplication.
- Test API routes.
- Test job polling flow.
- Verify deployment links.

### Output
- Safer submission
- Easier interview discussion

---

## 7. Recommended Implementation Order

1. Database schema
2. RSS adapters
3. Article extraction
4. Deduplication
5. Clustering
6. Story grouping
7. Backend endpoints
8. Async job flow
9. Frontend timeline
10. Deployment
11. README and video

This order minimizes rework.

---

## 8. Key Engineering Decisions

### 8.1 Why separate Node and Python?
- Node is best for API orchestration.
- Python is best for NLP and clustering.
- Separation keeps responsibilities clean.

### 8.2 Why PostgreSQL?
- Works well for relational article/cluster mapping.
- Easy to deploy on a free tier.
- Reliable for both app and worker.

### 8.3 Why HDBSCAN?
- No need to predefine number of clusters.
- Good for varying cluster density.
- Better for real news stories than fixed-count clustering.

### 8.4 Why story groups?
- Useful for cross-source story merging.
- Adds a more realistic event model.
- Makes the timeline more insightful.

### 8.5 Why async ingestion?
- Prevents request timeouts.
- Makes the UI responsive.
- Matches real-world system behavior.

---

## 9. Final Deliverables Checklist

- [ ] GitHub repo with `/scraper`, `/backend`, `/frontend`
- [ ] Live frontend URL
- [ ] Live backend URL
- [ ] Database deployed
- [ ] README with architecture and setup
- [ ] RSS sources documented
- [ ] Clustering approach explained
- [ ] Limitations documented
- [ ] Video walkthrough link
- [ ] Timeline UI working
- [ ] Refresh flow working
- [ ] Deployment verified

---

## 10. Closing Summary

This architecture is designed to look and behave like a practical production system while remaining realistic for an assessment setting. The strongest signal comes from the combination of:
- clean data ingestion,
- semantic clustering,
- story grouping,
- async job handling,
- and a polished timeline frontend.

That combination shows both implementation ability and architectural judgment.

