"""
Topic clustering using TF-IDF + HDBSCAN.
Groups related articles into meaningful clusters and generates labels.

Label generation is BATCHED: clusters are formed first, then all labels
are generated in a single batched call to Gemini (10 clusters per API request).
"""

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from gemini_labeler import generate_labels_batched

try:
    import hdbscan
    HAS_HDBSCAN = True
except ImportError:
    HAS_HDBSCAN = False
    print("[Cluster] HDBSCAN not available, falling back to keyword overlap")

from config import MIN_CLUSTER_SIZE, MIN_SAMPLES, CLUSTER_SELECTION_METHOD, STORY_MERGE_THRESHOLD, DEBUG_SANITIZER, ENABLE_HEADLINE_SANITIZER, ENABLE_CLUSTER_PURITY_VALIDATION, CLUSTER_PURITY_THRESHOLD
from .sanitizer import DocumentPreprocessor
from .purity import PurityValidator


# Standard English stop words
STOP_WORDS = {
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "shall", "can", "need", "dare",
    "ought", "used", "this", "that", "these", "those", "i", "me", "my",
    "myself", "we", "our", "ours", "ourselves", "you", "your", "yours",
    "yourself", "yourselves", "he", "him", "his", "himself", "she", "her",
    "hers", "herself", "it", "its", "itself", "they", "them", "their",
    "theirs", "themselves", "what", "which", "who", "whom", "when", "where",
    "why", "how", "all", "each", "every", "both", "few", "more", "most",
    "other", "some", "such", "no", "nor", "not", "only", "own", "same",
    "so", "than", "too", "very", "just", "because", "as", "until", "while",
    "about", "between", "through", "during", "before", "after", "above",
    "below", "up", "down", "out", "off", "over", "under", "again",
    "further", "then", "once", "here", "there", "also", "new", "said",
    "says", "say", "like", "get", "got", "go", "going", "one", "two",
    "first", "last", "long", "great", "little", "right", "still",
    "us", "back", "even", "old", "give", "day", "many", "well",
}


def prepare_text(article):
    """Combine article fields into a single text for vectorization."""
    parts = []
    if article.get("title"):
        # Weight title more heavily by repeating it
        parts.append(article["title"])
        parts.append(article["title"])
    if article.get("summary"):
        parts.append(article["summary"])
    if article.get("body"):
        # Use first 500 chars of body
        parts.append(article["body"][:500])
    return " ".join(parts)


def cluster_articles(articles):
    """
    Cluster articles using TF-IDF vectors + HDBSCAN, then batch-label all clusters
    via Gemini in a single pass.

    Returns a list of clusters, each containing:
    - label: auto-generated cluster label (Gemini or keyword fallback)
    - article_ids: list of article IDs in the cluster
    - articles: the article dicts belonging to this cluster
    """
    if not articles:
        print("[Cluster] No articles to cluster.")
        return []

    print(f"[Cluster] Clustering {len(articles)} articles...")

    preprocessor = DocumentPreprocessor()
    
    # Preprocess all articles
    processed_articles = []
    for a in articles:
        sanitized_fields = preprocessor.preprocess(a, ENABLE_HEADLINE_SANITIZER)
        
        # Create a shallow copy for vectorization only
        temp_a = dict(a)
        temp_a["title"] = sanitized_fields["headline"]
        temp_a["summary"] = sanitized_fields["summary"]
        temp_a["body"] = sanitized_fields["body"]
        
        processed_articles.append(temp_a)

    if DEBUG_SANITIZER:
        preprocessor.stats.print_report()

    # Prepare text corpus using the sanitized versions
    texts = [prepare_text(a) for a in processed_articles]

    # Build TF-IDF matrix
    vectorizer = TfidfVectorizer(
        max_features=5000,
        stop_words=list(STOP_WORDS),
        min_df=1,
        max_df=0.95,
        ngram_range=(1, 2),
    )
    tfidf_matrix = vectorizer.fit_transform(texts)
    feature_names = vectorizer.get_feature_names_out()

    # ── Step 1: Form unlabeled clusters ──────────────────────────────────────
    if HAS_HDBSCAN and len(processed_articles) >= MIN_CLUSTER_SIZE:
        raw_clusters = _hdbscan_cluster(tfidf_matrix, processed_articles, feature_names)
    else:
        raw_clusters = _keyword_overlap_cluster(processed_articles, feature_names, tfidf_matrix)

    # ── Step 1.5: Purity Validation ──────────────────────────────────────────
    if ENABLE_CLUSTER_PURITY_VALIDATION:
        validator = PurityValidator(
            min_cluster_size=MIN_CLUSTER_SIZE,
            threshold=CLUSTER_PURITY_THRESHOLD
        )
        raw_clusters = validator.validate(raw_clusters, tfidf_matrix)
        validator.stats.print_report()

    print(f"[Cluster] Found {len(raw_clusters)} valid clusters. Starting batch labeling...")

    # ── Step 2: Pre-generate fallback labels and gather headlines ─────────────
    # These are computed LOCALLY (no API call) so they're always available.
    cluster_headline_map = {}  # idx → [headline1, headline2, headline3]
    fallback_labels = {}       # idx → keyword-based label string

    for idx, cluster in enumerate(raw_clusters):
        fallback_labels[idx] = cluster["keyword_label"]
        headlines = _select_representative_headlines(cluster["articles"], max_count=3)
        cluster_headline_map[idx] = headlines

    # ── Step 3: Batch-label all clusters via Gemini ──────────────────────────
    result = generate_labels_batched(cluster_headline_map, fallback_labels)

    gemini_labels = result["labels"]         # idx → final label
    total_input  = result["input_tokens"]
    total_output = result["output_tokens"]
    total_cost   = result["cost"]

    # ── Step 4: Assemble final cluster objects with labels ───────────────────
    clusters = []
    for idx, cluster in enumerate(raw_clusters):
        label = gemini_labels.get(idx, fallback_labels[idx])
        clusters.append({
            "label": label,
            "article_ids": cluster["article_ids"],
            "articles": cluster["articles"],
        })

    print(f"[Cluster] Labeled {len(clusters)} clusters successfully.")

    # ── Step 5: Print Gemini telemetry report ────────────────────────────────
    if total_input > 0:
        print("\n" + "=" * 60)
        print("   BATCHED GEMINI 2.5 FLASH TELEMETRY REPORT")
        print("=" * 60)
        print(f"  Clusters Labeled:            {len(clusters)}")
        print(f"  API Calls Made:              {(len(clusters) + 9) // 10}")
        print(f"  Total Input Tokens:          {total_input:,}")
        print(f"  Total Output Tokens:         {total_output:,}")
        print(f"  Input Cost:                  ${(total_input / 1_000_000) * 0.15:.6f}")
        print(f"  Output Cost:                 ${(total_output / 1_000_000) * 0.60:.6f}")
        print(f"  Total Pipeline Cost:         ${total_cost:.6f}")
        print("=" * 60)

    return clusters


# ─── Clustering Algorithms ────────────────────────────────────────────────────
# Both return a list of "raw cluster" dicts with:
#   - keyword_label:  TF-IDF fallback label (always computed locally)
#   - article_ids:    list of article IDs
#   - articles:       list of article dicts
# Gemini labeling happens AFTER clustering, not inside these functions.

def _hdbscan_cluster(tfidf_matrix, articles, feature_names):
    """Cluster using HDBSCAN on TF-IDF vectors. Returns unlabeled raw clusters."""
    dense = tfidf_matrix.toarray()

    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=max(MIN_CLUSTER_SIZE, 2),
        min_samples=MIN_SAMPLES,
        metric="euclidean",
        cluster_selection_method=CLUSTER_SELECTION_METHOD,
    )
    labels = clusterer.fit_predict(dense)

    # Group articles by cluster label
    cluster_map = {}
    for idx, label in enumerate(labels):
        if label == -1:
            continue  # noise
        if label not in cluster_map:
            cluster_map[label] = []
        cluster_map[label].append(idx)

    # Build raw cluster objects (without Gemini labels — those come later)
    raw_clusters = []
    for cluster_label, indices in cluster_map.items():
        cluster_articles_list = [articles[i] for i in indices]
        article_ids = [articles[i]["id"] for i in indices]
        keyword_label = _generate_label(tfidf_matrix, indices, feature_names)

        raw_clusters.append({
            "keyword_label": keyword_label,
            "article_ids": article_ids,
            "articles": cluster_articles_list,
            "indices": indices,
        })

    return raw_clusters


def _keyword_overlap_cluster(articles, feature_names, tfidf_matrix):
    """
    Fallback: cluster using cosine similarity threshold on TF-IDF vectors.
    Returns unlabeled raw clusters.
    """
    sim_matrix = cosine_similarity(tfidf_matrix)
    threshold = 0.3

    n = len(articles)
    visited = set()
    raw_clusters = []

    for i in range(n):
        if i in visited:
            continue

        cluster_indices = [i]
        visited.add(i)

        for j in range(i + 1, n):
            if j in visited:
                continue
            if sim_matrix[i, j] >= threshold:
                cluster_indices.append(j)
                visited.add(j)

        # Only keep clusters with 2+ articles
        if len(cluster_indices) >= 2:
            cluster_articles_list = [articles[idx] for idx in cluster_indices]
            article_ids = [articles[idx]["id"] for idx in cluster_indices]
            keyword_label = _generate_label(tfidf_matrix, cluster_indices, feature_names)

            raw_clusters.append({
                "keyword_label": keyword_label,
                "article_ids": article_ids,
                "articles": cluster_articles_list,
                "indices": cluster_indices,
            })

    return raw_clusters


# ─── Shared Utility Functions ─────────────────────────────────────────────────

def _select_representative_headlines(cluster_articles_list, max_count=3):
    """
    Select up to `max_count` representative headlines from a cluster.
    Prefers articles with earliest published_at dates to capture the original reporting.
    """
    def sort_key(article):
        pub = article.get("published_at")
        if pub is None:
            return "9999"  # push to end
        return str(pub)

    sorted_articles = sorted(cluster_articles_list, key=sort_key)

    headlines = []
    for article in sorted_articles:
        title = article.get("title", "").strip()
        if title and title not in headlines:
            headlines.append(title)
        if len(headlines) >= max_count:
            break

    return headlines


def _generate_label(tfidf_matrix, indices, feature_names):
    """
    Generate a human-readable label for a cluster using the top TF-IDF terms.
    This serves as the LOCAL fallback when Gemini is unavailable.
    """
    cluster_vectors = tfidf_matrix[indices]
    if hasattr(cluster_vectors, 'toarray'):
        mean_vector = np.asarray(cluster_vectors.mean(axis=0)).flatten()
    else:
        mean_vector = np.mean(cluster_vectors, axis=0)

    top_indices = mean_vector.argsort()[-4:][::-1]
    top_terms = [feature_names[i] for i in top_indices if mean_vector[i] > 0]

    if top_terms:
        label = " / ".join(term.title() for term in top_terms[:3])
    else:
        label = "Uncategorized"

    return label


def group_stories(clusters, tfidf_matrix=None, articles=None):
    """
    Merge related clusters into higher-level story groups.
    Uses cluster centroid similarity.
    """
    if len(clusters) < 2:
        return []

    print(f"[StoryGroup] Checking {len(clusters)} clusters for story merging...")

    # Compute centroid for each cluster by averaging article texts
    all_texts = []

    for cluster in clusters:
        combined = " ".join(
            prepare_text(a) for a in cluster["articles"]
        )
        all_texts.append(combined)

    if not all_texts:
        return []

    # Vectorize cluster texts
    vectorizer = TfidfVectorizer(
        max_features=3000,
        stop_words=list(STOP_WORDS),
        min_df=1,
    )
    cluster_vectors = vectorizer.fit_transform(all_texts)
    sim_matrix = cosine_similarity(cluster_vectors)

    # Find pairs of clusters that should be merged
    merged = set()
    story_groups = []

    for i in range(len(clusters)):
        if i in merged:
            continue

        group_indices = [i]
        merged.add(i)

        for j in range(i + 1, len(clusters)):
            if j in merged:
                continue
            if sim_matrix[i, j] >= STORY_MERGE_THRESHOLD:
                group_indices.append(j)
                merged.add(j)

        if len(group_indices) > 1:
            # Use the label of the largest cluster
            largest = max(group_indices, key=lambda idx: len(clusters[idx]["article_ids"]))
            story_groups.append({
                "title": clusters[largest]["label"],
                "cluster_indices": group_indices,
            })

    print(f"[StoryGroup] Created {len(story_groups)} story groups.")
    return story_groups
