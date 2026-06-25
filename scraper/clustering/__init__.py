"""
Topic clustering using TF-IDF + HDBSCAN.
Groups related articles into meaningful clusters and generates labels.
"""

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

try:
    import hdbscan
    HAS_HDBSCAN = True
except ImportError:
    HAS_HDBSCAN = False
    print("[Cluster] HDBSCAN not available, falling back to keyword overlap")

from config import MIN_CLUSTER_SIZE, MIN_SAMPLES, CLUSTER_SELECTION_METHOD, STORY_MERGE_THRESHOLD


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
    Cluster articles using TF-IDF vectors + HDBSCAN.
    Returns a list of clusters, each containing:
    - label: auto-generated cluster label
    - article_ids: list of article IDs in the cluster
    - articles: the article dicts belonging to this cluster
    """
    if not articles:
        print("[Cluster] No articles to cluster.")
        return []

    print(f"[Cluster] Clustering {len(articles)} articles...")

    # Prepare text corpus
    texts = [prepare_text(a) for a in articles]

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

    if HAS_HDBSCAN and len(articles) >= MIN_CLUSTER_SIZE:
        clusters = _hdbscan_cluster(tfidf_matrix, articles, feature_names, vectorizer)
    else:
        clusters = _keyword_overlap_cluster(articles, feature_names, vectorizer, tfidf_matrix)

    print(f"[Cluster] Found {len(clusters)} clusters.")
    return clusters


def _hdbscan_cluster(tfidf_matrix, articles, feature_names, vectorizer):
    """Cluster using HDBSCAN on TF-IDF vectors."""
    # Convert sparse to dense for HDBSCAN
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

    # Build cluster objects with labels
    clusters = []
    for cluster_label, indices in cluster_map.items():
        cluster_articles_list = [articles[i] for i in indices]
        article_ids = [articles[i]["id"] for i in indices]

        # Generate label from top TF-IDF terms in this cluster
        label = _generate_label(tfidf_matrix, indices, feature_names)

        clusters.append({
            "label": label,
            "article_ids": article_ids,
            "articles": cluster_articles_list,
        })

    return clusters


def _keyword_overlap_cluster(articles, feature_names, vectorizer, tfidf_matrix):
    """
    Fallback: cluster using cosine similarity threshold on TF-IDF vectors.
    This works when HDBSCAN is not available or dataset is very small.
    """
    sim_matrix = cosine_similarity(tfidf_matrix)
    threshold = 0.3  # articles with >0.3 cosine similarity are grouped

    n = len(articles)
    visited = set()
    clusters = []

    for i in range(n):
        if i in visited:
            continue

        # Find all articles similar to article i
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
            label = _generate_label(tfidf_matrix, cluster_indices, feature_names)

            clusters.append({
                "label": label,
                "article_ids": article_ids,
                "articles": cluster_articles_list,
            })

    return clusters


def _generate_label(tfidf_matrix, indices, feature_names):
    """
    Generate a human-readable label for a cluster using the top TF-IDF terms.
    """
    # Get mean TF-IDF vector for this cluster
    cluster_vectors = tfidf_matrix[indices]
    if hasattr(cluster_vectors, 'toarray'):
        mean_vector = np.asarray(cluster_vectors.mean(axis=0)).flatten()
    else:
        mean_vector = np.mean(cluster_vectors, axis=0)

    # Get top terms
    top_indices = mean_vector.argsort()[-4:][::-1]
    top_terms = [feature_names[i] for i in top_indices if mean_vector[i] > 0]

    if top_terms:
        # Capitalize and join
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
    cluster_text_map = []

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
