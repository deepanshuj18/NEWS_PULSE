import unittest
from clustering.sanitizer import DocumentPreprocessor

class TestHeadlineSanitizer(unittest.TestCase):

    def setUp(self):
        self.preprocessor = DocumentPreprocessor()

    def test_prefix_removal(self):
        text, prefix = self.preprocessor.remove_presentation_prefix("Breaking: Apple launches AI chip")
        self.assertEqual(text, "Apple launches AI chip")
        self.assertIsNotNone(prefix)

        text, prefix = self.preprocessor.remove_presentation_prefix("Watch: Roads split")
        self.assertEqual(text, "Roads split")
        
        text, prefix = self.preprocessor.remove_presentation_prefix("BREAKING NEWS: Market crashes")
        self.assertEqual(text, "Market crashes")
        
        text, prefix = self.preprocessor.remove_presentation_prefix("Opinion - Why interest rates matter")
        self.assertEqual(text, "Why interest rates matter")

    def test_false_positive_protection(self):
        text, prefix = self.preprocessor.remove_presentation_prefix("Breaking Bad actor wins award")
        self.assertEqual(text, "Breaking Bad actor wins award")
        self.assertIsNone(prefix)
        
        text, prefix = self.preprocessor.remove_presentation_prefix("Watchmen sequel announced")
        self.assertEqual(text, "Watchmen sequel announced")
        self.assertIsNone(prefix)

    def test_multi_topic_split(self):
        text, was_split = self.preprocessor.detect_multi_topic_split("Rescuers search for survivors. And, SCOTUS rules on asylum.")
        self.assertEqual(text, "Rescuers search for survivors.")
        self.assertTrue(was_split)
        
        text, was_split = self.preprocessor.detect_multi_topic_split("Earthquake destroys city. Meanwhile, heavy rains continue.")
        self.assertEqual(text, "Earthquake destroys city.")
        self.assertTrue(was_split)

    def test_normal_headline_no_split(self):
        text, was_split = self.preprocessor.detect_multi_topic_split("India and Australia sign agreement")
        self.assertEqual(text, "India and Australia sign agreement")
        self.assertFalse(was_split)

    def test_source_suffix_removal(self):
        text, suffix = self.preprocessor.remove_source_suffix("Earthquake kills hundreds - BBC News")
        self.assertEqual(text, "Earthquake kills hundreds")
        self.assertIsNotNone(suffix)

        text, suffix = self.preprocessor.remove_source_suffix("Some article | Explained")
        self.assertEqual(text, "Some article")
        self.assertIsNotNone(suffix)
        
        text, suffix = self.preprocessor.remove_source_suffix("Some article | Reuters")
        self.assertEqual(text, "Some article")
        self.assertIsNotNone(suffix)

    def test_length_validation(self):
        original = "Breaking:"
        cleaned = "" 
        result = self.preprocessor.validate_length(cleaned, original)
        self.assertEqual(result, original)

    def test_full_pipeline(self):
        result = self.preprocessor.sanitize_headline("Breaking: Rescuers search for survivors... And, SCOTUS rules on asylum. - BBC News")
        self.assertEqual(result.sanitized, "Rescuers search for survivors...")
        self.assertTrue(result.was_split)
        self.assertEqual(result.removed_prefix.lower(), "breaking:")
        
    def test_summary_cleaning(self):
        summary = "Rescuers continue operations. Meanwhile, Trump signs asylum order."
        cleaned = self.preprocessor.clean_summary(summary)
        self.assertEqual(cleaned, "Rescuers continue operations.")
        
    def test_abbreviation_preservation(self):
        text = self.preprocessor.normalize_whitespace("He has a Ph.D... in science")
        # Ensure the periods are not collapsed to one period
        self.assertEqual(text, "He has a Ph.D... in science")

if __name__ == '__main__':
    unittest.main()
