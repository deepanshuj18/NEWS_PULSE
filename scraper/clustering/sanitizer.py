import re
import unicodedata
from dataclasses import dataclass
from typing import Optional, List, Dict

# Flexible Regex matching
PREFIX_PATTERN = r'^(breaking( news)?|watch|live( updates)?|photos|explained|opinion|podcast|morning news|daily briefing|update)\s*[:|-]\s*'
SUFFIX_PATTERN = r'\s*[|-]\s*(bbc news|reuters|ap news|npr|video|analysis|podcast|live updates|explained|live|updates)$'

# Patterns that indicate a split when following a sentence boundary (period, question mark, exclamation mark, etc.)
SPLIT_PATTERNS = [
    "And,",
    "Meanwhile,",
    "Also,",
    "Plus,",
    "Here's what else"
]

@dataclass
class SanitizedHeadline:
    original: str
    sanitized: str
    was_split: bool = False
    removed_prefix: Optional[str] = None
    removed_suffix: Optional[str] = None

class SanitizerStats:
    def __init__(self):
        self.processed = 0
        self.prefixes_removed = 0
        self.suffixes_removed = 0
        self.multi_topic_splits = 0
        self.total_chars_reduced = 0
    
    def record(self, original_len: int, result: SanitizedHeadline):
        self.processed += 1
        if result.removed_prefix:
            self.prefixes_removed += 1
        if result.removed_suffix:
            self.suffixes_removed += 1
        if result.was_split:
            self.multi_topic_splits += 1
        self.total_chars_reduced += (original_len - len(result.sanitized))

    def print_report(self):
        avg_reduction = (self.total_chars_reduced / self.processed) if self.processed > 0 else 0
        print("\n========== PREPROCESSING REPORT ==========")
        print(f"Processed Headlines : {self.processed}")
        print(f"Prefix Removed      : {self.prefixes_removed}")
        print(f"Suffix Removed      : {self.suffixes_removed}")
        print(f"Multi-topic Split   : {self.multi_topic_splits}")
        print(f"Avg Reduction       : {avg_reduction:.1f} chars")
        print("=========================================\n")


class DocumentPreprocessor:
    def __init__(self):
        self.stats = SanitizerStats()
        
        # Compile patterns
        self.prefix_re = re.compile(PREFIX_PATTERN, flags=re.IGNORECASE)
        self.suffix_re = re.compile(SUFFIX_PATTERN, flags=re.IGNORECASE)

    def normalize_unicode(self, text: str) -> str:
        """Normalize unicode characters."""
        if not text:
            return ""
        return unicodedata.normalize("NFKC", text)

    def normalize_whitespace(self, text: str) -> str:
        """Remove duplicated spaces, normalize dash variants."""
        if not text:
            return ""
        # Normalize dash variants to a single hyphen
        text = re.sub(r'[—–]', '-', text)
        # Remove duplicated dashes (e.g., --)
        text = re.sub(r'-{2,}', '-', text)
        # Remove duplicated spaces
        text = re.sub(r'\s+', ' ', text)
        return text.strip()

    def remove_presentation_prefix(self, text: str) -> tuple[str, Optional[str]]:
        """Remove presentation-only prefixes when they appear at the beginning."""
        if not text:
            return text, None
            
        match = self.prefix_re.match(text)
        if match:
            # We found a prefix
            return text[match.end():].strip(), match.group(0).strip()
                
        return text, None

    def detect_multi_topic_split(self, text: str) -> tuple[str, bool]:
        """
        Detect RSS headlines/summaries containing multiple unrelated stories.
        Only split when the separator follows a sentence boundary.
        """
        if not text:
            return text, False
            
        # We look for a sentence boundary: a period, question mark, or exclamation point
        # followed by space(s), and then one of our split patterns.
        for pattern in SPLIT_PATTERNS:
            regex = r'([.!?])\s+(' + re.escape(pattern) + r')(?:\s|$)'
            match = re.search(regex, text, flags=re.IGNORECASE)
            if match:
                # Keep everything up to the sentence boundary (including the boundary punctuation)
                split_index = match.start(1) + 1 # +1 to include the punctuation
                return text[:split_index].strip(), True
                
        return text, False

    def remove_source_suffix(self, text: str) -> tuple[str, Optional[str]]:
        """Remove source formatting appended by publishers."""
        if not text:
            return text, None
            
        match = self.suffix_re.search(text)
        if match:
            return text[:match.start()].strip(), match.group(0).strip()
                
        return text, None

    def validate_length(self, cleaned_text: str, original_text: str) -> str:
        """If the cleaned headline is empty or less than 3 chars, fallback to original."""
        if len(cleaned_text) < 3:
            return original_text
        return cleaned_text

    def sanitize_headline(self, title: str) -> SanitizedHeadline:
        """Run the headline sanitization pipeline."""
        if not title:
            return SanitizedHeadline("", "", False, None, None)
            
        original = title.strip()
        
        # 1. Unicode Normalization
        text = self.normalize_unicode(original)
        
        # 2. Whitespace Normalization
        text = self.normalize_whitespace(text)
        
        # 3. Presentation Prefix Removal
        text, removed_prefix = self.remove_presentation_prefix(text)
        
        # 4. Multi-topic Split Detection
        text, was_split = self.detect_multi_topic_split(text)
        
        # 5. Source Suffix Removal
        text, removed_suffix = self.remove_source_suffix(text)
        
        # 6. Final whitespace cleanup just in case
        text = text.strip()
        
        # 7. Length Validation
        text = self.validate_length(text, original)
        
        # If the length validation caused a fallback to original, technically we didn't remove/split.
        if text == original:
            was_split = False
            removed_prefix = None
            removed_suffix = None
            
        result = SanitizedHeadline(
            original=original,
            sanitized=text,
            was_split=was_split,
            removed_prefix=removed_prefix,
            removed_suffix=removed_suffix
        )
        
        self.stats.record(len(original), result)
        return result

    def clean_summary(self, summary: str) -> str:
        """Lightweight preprocessing for summaries including multi-topic splits."""
        if not summary:
            return ""
        text = self.normalize_unicode(summary)
        text = self.normalize_whitespace(text)
        text, _ = self.detect_multi_topic_split(text)
        return text

    def preprocess(self, article: dict, enable_sanitizer: bool = True) -> dict:
        """
        Process the entire article dict and return sanitized fields.
        Returns a new dictionary with sanitized 'headline', 'summary', and original 'body'.
        """
        headline = article.get("title", "")
        summary = article.get("summary", "")
        body = article.get("body", "")

        if not enable_sanitizer:
            return {
                "headline": headline,
                "summary": summary,
                "body": body
            }

        sanitized_headline = self.sanitize_headline(headline).sanitized if headline else ""
        cleaned_summary = self.clean_summary(summary) if summary else ""

        return {
            "headline": sanitized_headline,
            "summary": cleaned_summary,
            "body": body
        }
