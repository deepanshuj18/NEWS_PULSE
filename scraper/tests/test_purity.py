import unittest
import numpy as np
from clustering.purity import PurityValidator

class TestPurityValidator(unittest.TestCase):
    def setUp(self):
        self.validator = PurityValidator(min_cluster_size=2, threshold=0.50)
        
        # Mock TF-IDF matrix with 4 documents
        # Doc 0, 1, 2 are similar (e.g., Earthquakes). Doc 3 is an outlier.
        self.tfidf_matrix = np.array([
            [0.9, 0.1, 0.0, 0.0], # Doc 0
            [0.8, 0.2, 0.0, 0.0], # Doc 1
            [0.85, 0.15, 0.0, 0.0], # Doc 2
            [0.0, 0.0, 0.9, 0.1], # Doc 3 (Outlier)
        ])
        
        self.raw_clusters = [
            {
                "keyword_label": "Test Cluster",
                "article_ids": [100, 101, 102, 103],
                "articles": [
                    {"id": 100, "title": "Earthquake 1"},
                    {"id": 101, "title": "Earthquake 2"},
                    {"id": 102, "title": "Earthquake 3"},
                    {"id": 103, "title": "Oil Prices (Outlier)"}
                ],
                "indices": [0, 1, 2, 3]
            }
        ]

    def test_medoid_selection_and_rejection(self):
        validated = self.validator.validate(self.raw_clusters, self.tfidf_matrix)
        
        self.assertEqual(len(validated), 1)
        cluster = validated[0]
        
        # The outlier (Doc 3) should be removed because its similarity to the medoid of {0, 1, 2, 3} will be very low (0.0)
        self.assertEqual(len(cluster["indices"]), 3)
        self.assertEqual(cluster["indices"], [0, 1, 2])
        self.assertEqual(cluster["article_ids"], [100, 101, 102])
        self.assertEqual(self.validator.stats.articles_removed, 1)

    def test_min_cluster_size_protection(self):
        # Even if all articles are dissimilar, if the cluster reaches min_cluster_size, it shouldn't shrink further.
        validator = PurityValidator(min_cluster_size=3, threshold=0.99) # High threshold, all will be considered weak
        validated = validator.validate(self.raw_clusters, self.tfidf_matrix)
        
        cluster = validated[0]
        # Min size is 3, so it should keep the top 3 and remove 1
        self.assertEqual(len(cluster["indices"]), 3)
        self.assertEqual(validator.stats.articles_removed, 1)

    def test_cluster_too_small(self):
        validator = PurityValidator(min_cluster_size=5, threshold=0.99)
        # Cluster has 4 items, min size is 5, so it should NOT filter at all
        validated = validator.validate(self.raw_clusters, self.tfidf_matrix)
        
        cluster = validated[0]
        self.assertEqual(len(cluster["indices"]), 4)
        self.assertEqual(validator.stats.articles_removed, 0)

if __name__ == '__main__':
    unittest.main()
