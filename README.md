# 📰 News Pulse — AI-Powered Topic-Clustered News Timeline

> A full-stack news intelligence platform that ingests live articles from 5 major RSS feeds, automatically discovers related topics using NLP, groups evolving stories into macro-events, and visualizes them as an interactive timeline — all in under 90 seconds per pipeline run.

*Built for the Xponentium India Internship Assessment.*

---

## 🚀 Live Demo

| Link | URL |
|---|---|
| **Frontend** | [Your Vercel URL] |
| **Backend API** | [Your Render URL] |
| **Demo Video** | [YouTube / Loom Link] |

---

## 📸 Screenshots

### ✦ Top Stories View — Macro Story Explorer
![Top Stories View](docs/top_stories.png)
*Macro stories grouping related clusters into a single narrative. Click any story to open the angle-by-angle breakdown.*

### ⌇ Live Timeline View
![Live Timeline View 1](docs/live_time1.png)
*Articles plotted across time by topic cluster. Bar width reflects story intensity.*

![Live Timeline View 2](docs/live%20image.png)

![Live Timeline View 3](docs/live%20image2.png)

---

## ✨ Features

| Feature | Status | Description |
| :--- | :---: | :--- |
| 🌐 **Multi-Source RSS Ingestion** | ✅ | Aggregates live news from BBC News, NPR, Reuters, Times of India, and The Hindu |
| 📄 **Full-Text Extraction** | ✅ | Extracts article bodies via `trafilatura` with `newspaper3k` + `BeautifulSoup` fallbacks |
| 🛡️ **SHA-256 Deduplication** | ✅ | Normalized URL hashing prevents duplicate articles across pipeline runs |
| 🧠 **Semantic Clustering** | ✅ | TF-IDF vectorization + HDBSCAN discovers organic topic clusters |
| 🤖 **Gemini Label Generation** | ✅ | Gemini 2.5 Flash generates human-readable titles via batched API calls |
| 📚 **Story Grouping** | ✅ | Cosine similarity merges related clusters into macro-stories |
| ✦ **Top Stories View** | ✅ | Grouped accordion UI surfacing macro-stories and their angles |
| 📈 **Interactive Timeline** | ✅ | Visual timeline plotting cluster activity across time |
| 📊 **Volume Chart** | ✅ | Article volume bar chart for temporal density analysis |
| 🎯 **Source Filtering** | ✅ | Filter clusters by publisher in real time |
| 🔄 **Background Ingestion** | ✅ | Async job dispatch with HTTP polling for status |
| 🌙 **Dark / Light Themes** | ✅ | Full dark mode with glassmorphism design system |

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────┐
│              RSS Feeds (5 Sources)                  │
│  BBC News · NPR · Reuters · Times of India · Hindu  │
└────────────────────────┬────────────────────────────┘
                         │ feedparser
                         ▼
              ┌──────────────────────┐
              │  RSS Normalization   │  Per-source adapters
              │      Layer           │  (bbc, npr, reuters,
              └──────────┬───────────┘   generic)
                         │
                         ▼
              ┌──────────────────────┐
              │  Full-Text          │  trafilatura → newspaper3k
              │  Extraction Engine  │  → BeautifulSoup fallback
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  SHA-256             │  Prevents re-insertion
              │  Deduplication       │  of seen articles
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  TF-IDF              │  Title (×2 weight)
              │  Vectorization       │  + Summary + Body[:500]
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  HDBSCAN Clustering  │  No fixed k required
              │                      │  Handles noise articles
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  Gemini 2.5 Flash    │  Batched (10 clusters
              │  Label Generation    │  per API call)
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  Story Grouping      │  Cosine similarity
              │                      │  on cluster centroids
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  PostgreSQL (Neon)   │  Shared cloud datastore
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  Express REST API    │  /clusters /timeline
              │  (Node.js + TS)      │  /story-groups /ingest
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  Next.js Frontend    │  Top Stories + Timeline
              │  (React + TS)        │  Drawer · Toggle · Filters
              └──────────────────────┘
```

---

## 🧠 Clustering Approach

### 1 · TF-IDF Vectorization

Each article is transformed into a sparse numerical vector using:
- **Title** (repeated twice for higher weight)
- **Summary**
- **Article body** (first 500 characters)

A custom stop-word list removes 90+ common English words before vectorization.

### 2 · HDBSCAN Clustering

| Property | HDBSCAN | K-Means |
|---|---|---|
| Number of clusters | Auto-detected | Must be specified |
| Noise handling | ✅ Marks outliers as noise | ❌ Forces into clusters |
| Variable density | ✅ Handles naturally | ❌ Assumes spherical clusters |
| Real-world news fit | ✅ Ideal | ❌ Requires knowing topic count |

This is why HDBSCAN is the right algorithm for a live news stream where the number of stories changes every day.

### 3 · Gemini 2.5 Flash Label Generation — Batched

After HDBSCAN finishes, representative headlines from every cluster are **batched** and sent to Gemini 2.5 Flash.

**Why batching matters:**

| Metric | Before (Sequential) | After (Batched) |
|---|---|---|
| API calls for 80 clusters | 80 | 8 |
| Rate-limit sleeps | 80 × 4s = **320s** | 8 × 4s = **32s** |
| Input token repetition | System prompt × 80 | System prompt × 8 |
| Failure blast radius | 1 cluster | 10 clusters (with fallback) |

Structured JSON output is enforced via `response_mime_type="application/json"`, so there is no regex parsing of raw text.

**Example input → output:**

```
Input headlines:
  - India, U.S. note substantial progress in trade talks
  - Piyush Goyal clarifies India's stance on trade pact
  - Why India-U.S. trade deal has been delayed

Generated label: "India US Trade Deal Progresses"
```

> **Important:** Gemini is **never** used for clustering, similarity, or grouping.
> It only generates display labels **after** all deterministic NLP work is complete.
> If Gemini fails, a keyword-based TF-IDF fallback label is used automatically.

---

## 📚 Story Grouping (3-Level Hierarchy)

```
Level 1 — Macro Story (Story Group)
└── Level 2 — Cluster (Angle / Perspective)
    └── Level 3 — Articles
```

**Example:**
```
📰 Macro Story: "Kerala Low-Alcohol Liquor Policy Sparks Storm"
├── Angle 1: "Kerala Low-Alcohol Liquor Policy Sparks"
│   ├── Liquor company's letter to M.V. Govindan surfaces  [The Hindu]
│   └── Why Kerala's low-alcohol liquor policy sparked a storm [The Hindu]
└── Angle 2: "UDF, Satheesan Misleading on Liquor Row"
    └── Kanthapuram seeks prohibition of liquor  [The Hindu]
```

Story grouping works by computing the cosine similarity between **cluster centroids** (average TF-IDF vectors of all articles in a cluster). Clusters with similarity ≥ 0.35 are merged into one macro-story.

---

## 🗄️ Database Schema

```
sources
│
├─── articles (source_id → sources.id)
│     └─── cluster_articles ──────────────────┐
│                                              │
├─── clusters (pipeline_run_id → runs.id) ◄──┘
│     └─── story_group_clusters ───────────────┐
│                                              │
├─── story_groups ◄────────────────────────────┘
│
└─── pipeline_runs
```

| Table | Purpose |
|---|---|
| `sources` | Publisher metadata (name, feed URL) |
| `articles` | Normalized scraped articles with full body text |
| `clusters` | NLP-generated topic clusters with Gemini labels |
| `cluster_articles` | Many-to-many: articles → clusters |
| `story_groups` | Macro-stories linking multiple related clusters |
| `story_group_clusters` | Many-to-many: clusters → story groups |
| `pipeline_runs` | Job tracking: status, timing, article count, errors |

---

## ⚙️ Tech Stack

### Frontend
- **Next.js 14** + **React** + **TypeScript**
- **Tailwind CSS** — utility-first styling
- **Glassmorphism** design system with dark/light modes

### Backend
- **Node.js** + **Express** + **TypeScript**
- In-memory timeline cache (30s TTL, auto-busted on pipeline completion)

### AI / NLP Pipeline (Python)
- **feedparser** — RSS parsing
- **trafilatura** + **newspaper3k** + **BeautifulSoup4** — full-text extraction with fallback chain
- **scikit-learn** — TF-IDF vectorization
- **HDBSCAN** — density-based clustering
- **google-genai** — Gemini 2.5 Flash batched label generation

### Infrastructure
- **PostgreSQL** via [Neon](https://neon.tech) — serverless shared datastore
- **GitHub Actions** — ephemeral scraper runner (free tier)
- **Render** — Backend API hosting
- **Vercel** — Frontend hosting

---

## 📡 API Endpoints

### Clusters
```http
GET  /clusters           # All topic clusters
GET  /clusters/:id       # Cluster detail + associated articles
```

### Timeline
```http
GET  /timeline           # Clusters formatted for timeline visualization
```

### Story Groups
```http
GET  /story-groups       # Macro stories with nested clusters + articles
```

### Ingestion
```http
POST /ingest/trigger     # Trigger scraping pipeline (local spawn or GitHub Actions)
GET  /ingest/status/:id  # Poll pipeline job status
```

---

## ⚡ Performance

**Latest pipeline run (from terminal logs):**

```
New articles:   3
Clusters:       79
Story Groups:   7 (Deadly Omega Heatwave, Owaisi BJP Citizenship,
                   Venezuela Double Quakes, Scotland World Cup, ...)
Gemini calls:   8 (batched from 79 clusters)
Time taken:     1m 16s (76.91s total)
```

**Optimization impact:**

| Metric | Before Batching | After Batching |
|---|---|---|
| Gemini API calls | 79 | 8 |
| Rate-limit wait | ~316s | ~32s |
| Total runtime | ~7 min | ~77s |
| Cost reduction | baseline | ~90% |

---

## 🔒 Reliability

### Deduplication
Every article URL is normalized and hashed with SHA-256 before insertion. Duplicates are silently skipped, making the pipeline safe to re-run at any time.

### Gemini Fallback Chain
```
Gemini API call
      │
      ├── Success → Use generated label
      │
      └── Failure (network, quota, parse error)
            │
            └── TF-IDF keyword label fallback
                  │
                  └── Pipeline continues without crashing
```

### Local Dev / Production Hybrid
The `/ingest/trigger` endpoint auto-detects `NODE_ENV`:
- **development** → spawns `scraper/venv/Scripts/python.exe main.py` as a child process, streaming live logs to the Node console
- **production** → dispatches a GitHub Actions `repository_dispatch` webhook

---

## 🛠️ Local Setup

### Prerequisites
- Node.js 18+
- Python 3.9+
- PostgreSQL (local or [Neon](https://neon.tech) free tier)

### 1. Clone & configure

```bash
git clone <your-repo>
cd "pulse new"
```

**`backend/.env`**
```env
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://postgres:password@localhost:5432/news_pulse
GEMINI_API_KEY=your_gemini_key
GITHUB_PERSONAL_ACCESS_TOKEN=your_pat
PYTHON_PATH=../scraper/venv/Scripts/python.exe
SCRAPER_DIR=../scraper
```

**`scraper/.env`**
```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/news_pulse
GEMINI_API_KEY=your_gemini_key
```

**`frontend/.env.local`**
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### 2. Python scraper

```bash
cd scraper
python -m venv venv
venv\Scripts\activate        # Windows
source venv/bin/activate     # Mac / Linux
pip install -r requirements.txt
```

### 3. Backend

```bash
cd backend
npm install
npm run dev
# → http://localhost:3001
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

> **Tip:** Click **Refresh Data** in the UI to trigger the pipeline. Python logs will stream live into your backend terminal.

---

## 🚀 Deployment

| Component | Platform | Notes |
|---|---|---|
| **Database** | [Neon](https://neon.tech) | Free serverless PostgreSQL |
| **Backend** | [Render](https://render.com) | Build: `npm install && npm run build` · Start: `npm start` |
| **Frontend** | [Vercel](https://vercel.com) | Set `NEXT_PUBLIC_API_URL` to your Render URL |
| **Pipeline** | GitHub Actions | Triggered via `repository_dispatch` from the backend |

---

## 🔮 Future Improvements

- [ ] Sentence-transformer embeddings for deeper semantic understanding
- [ ] Real-time WebSocket timeline updates
- [ ] Multi-language clustering support
- [ ] Named entity extraction for people/places/orgs
- [ ] Sentiment trend analysis per story group
- [ ] Persistent job tracking via database (replace in-memory status)
- [x] ~~LLM cluster labeling~~ *(Gemini 2.5 Flash — implemented)*
- [x] ~~Macro story grouping~~ *(Story Groups — implemented)*
- [x] ~~Batch API calls~~ *(10 clusters per Gemini call — implemented)*

---

## 📹 Video Walkthrough

A 2–3 minute walkthrough covering the architecture, pipeline execution, Top Stories UI, and live demonstration.

**[Insert Link Here]**

---

## 📄 License

MIT License

---

*Built with ❤️ using Next.js · Express · Python · HDBSCAN · Gemini 2.5 Flash · PostgreSQL*
