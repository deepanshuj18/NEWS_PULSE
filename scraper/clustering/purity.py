import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from typing import List, Dict, Any

class PurityStats:
    def __init__(self):
        self.clusters_validated = 0
        self.articles_checked = 0
        self.articles_removed = 0
        self.total_similarity = 0.0
        self.lowest_sim_removed = float('inf')
        self.highest_sim_removed = float('-inf')

    def record_kept(self, sim: float):
        self.articles_checked += 1
        self.total_similarity += sim

    def record_removed(self, sim: float):
        self.articles_checked += 1
        self.articles_removed += 1
        self.total_similarity += sim
        if sim < self.lowest_sim_removed:
            self.lowest_sim_removed = sim
        if sim > self.highest_sim_removed:
            self.highest_sim_removed = sim

    def print_report(self):
        avg_sim = (self.total_similarity / self.articles_checked) if self.articles_checked > 0 else 0
        
        lowest = self.lowest_sim_removed if self.lowest_sim_removed != float('inf') else 0
        highest = self.highest_sim_removed if self.highest_sim_removed != float('-inf') else 0

        print("\n========== PURITY VALIDATION REPORT ==========")
        print(f"Clusters Validated      : {self.clusters_validated}")
        print(f"Articles Checked        : {self.articles_checked}")
        print(f"Articles Removed        : {self.articles_removed}")
        print(f"Average Similarity      : {avg_sim:.3f}")
        print(f"Lowest Sim Removed      : {lowest:.3f}")
        print(f"Highest Sim Removed     : {highest:.3f}")
        print("==============================================\n")


class PurityValidator:
    def __init__(self, min_cluster_size: int, threshold: float):
        self.min_cluster_size = min_cluster_size
        self.threshold = threshold
        self.stats = PurityStats()

    def find_medoid_index(self, tfidf_subset: np.ndarray) -> int:
        """Find the index of the medoid (article with highest avg similarity to all others)."""
        # Compute pairwise cosine similarity for all items in the cluster
        sim_matrix = cosine_similarity(tfidf_subset)
        # Average similarity of each article to all other articles
        avg_sims = np.mean(sim_matrix, axis=1)
        # Index of the article with the maximum average similarity
        return int(np.argmax(avg_sims))

    def validate(self, raw_clusters: List[Dict[str, Any]], tfidf_matrix: Any) -> List[Dict[str, Any]]:
        """Validate clusters using the medoid approach and remove weak members."""
        validated_clusters = []

        for cluster in raw_clusters:
            indices = cluster.get("indices", [])
            articles = cluster["articles"]
            article_ids = cluster["article_ids"]
            
            if len(indices) <= self.min_cluster_size:
                # Too small to filter, keep as is. We still count them as checked/validated
                self.stats.clusters_validated += 1
                for _ in range(len(indices)):
                    self.stats.record_kept(1.0) # Assume 1.0 sim for skipped elements to avoid skewing too much, or ignore
                validated_clusters.append(cluster)
                continue

            self.stats.clusters_validated += 1
            
            # Extract TF-IDF vectors for this cluster
            cluster_vectors = tfidf_matrix[indices]
            
            # 1. Find the Medoid
            medoid_idx_in_subset = self.find_medoid_index(cluster_vectors)
            medoid_vector = cluster_vectors[medoid_idx_in_subset]
            if len(medoid_vector.shape) == 1:
                medoid_vector = medoid_vector.reshape(1, -1)
            
            # 2. Compute similarities to the medoid
            sims_to_medoid = cosine_similarity(cluster_vectors, medoid_vector).flatten()
            
            valid_indices = []
            valid_articles = []
            valid_article_ids = []
            
            rejected_logs = []
            
            for i, sim in enumerate(sims_to_medoid):
                article = articles[i]
                if sim >= self.threshold:
                    valid_indices.append(indices[i])
                    valid_articles.append(article)
                    valid_article_ids.append(article_ids[i])
                    self.stats.record_kept(sim)
                else:
                    # Will removing this violate min_cluster_size?
                    # We compute remaining if we reject this one
                    # But actually we should check if total valid drops below min_size
                    # A better way: score them all, sort by similarity, and keep at least min_cluster_size
                    pass
            
            # To strictly enforce minimum size, let's process them properly:
            # Pair (index_in_cluster, similarity)
            scored_items = list(enumerate(sims_to_medoid))
            # Sort by similarity descending
            scored_items.sort(key=lambda x: x[1], reverse=True)
            
            final_valid_items = []
            
            for rank, (i, sim) in enumerate(scored_items):
                article = articles[i]
                # Keep if above threshold OR if we haven't reached the minimum cluster size yet
                if sim >= self.threshold or rank < self.min_cluster_size:
                    final_valid_items.append((i, sim))
                    self.stats.record_kept(sim)
                else:
                    self.stats.record_removed(sim)
                    rejected_logs.append({
                        "title": article.get("title", "Untitled"),
                        "sim": sim
                    })
                    
            # Reconstruct the cluster with valid items (restore original order)
            final_valid_items.sort(key=lambda x: x[0])
            
            new_indices = []
            new_articles = []
            new_article_ids = []
            
            for i, sim in final_valid_items:
                new_indices.append(indices[i])
                new_articles.append(articles[i])
                new_article_ids.append(article_ids[i])
                
            if rejected_logs:
                print(f"\n[Purity] Cluster '{cluster['keyword_label']}'")
                print(f"Original: {len(articles)} | Removed: {len(rejected_logs)} | Final: {len(new_articles)}")
                for r in rejected_logs:
                    print(f"  [Rejected] Sim: {r['sim']:.3f} | {r['title'][:60]}")
            
            validated_clusters.append({
                "keyword_label": cluster["keyword_label"],
                "article_ids": new_article_ids,
                "articles": new_articles,
                "indices": new_indices
            })

        return validated_clusters
