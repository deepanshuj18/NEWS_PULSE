"""
RSS Feed Adapters for News Pulse.
Each adapter normalizes a specific feed's quirks into a common article schema.
"""

import feedparser
import re
from datetime import datetime, timezone
from dateutil import parser as dateparser
from abc import ABC, abstractmethod


class Article:
    """Normalized article structure from any RSS feed."""

    def __init__(self, title, url, summary, published_at, source_name):
        self.title = title.strip() if title else "Untitled"
        self.url = url.strip() if url else ""
        self.summary = self._clean_html(summary) if summary else ""
        self.published_at = published_at
        self.source_name = source_name
        self.body = None  # filled later by content extractor

    def _clean_html(self, text):
        """Remove HTML tags from summary text."""
        clean = re.sub(r"<[^>]+>", "", text)
        clean = re.sub(r"\s+", " ", clean).strip()
        return clean

    def __repr__(self):
        return f"Article('{self.title[:50]}...' from {self.source_name})"


class BaseAdapter(ABC):
    """Base adapter for RSS feed parsing."""

    def __init__(self, feed_config):
        self.name = feed_config["name"]
        self.url = feed_config["url"]

    def fetch_articles(self):
        """Fetch and parse the RSS feed, returning normalized Article objects."""
        print(f"[RSS] Fetching feed: {self.name} ({self.url})")

        try:
            feed = feedparser.parse(self.url)

            if feed.bozo and not feed.entries:
                print(f"[RSS] Warning: Feed {self.name} had parsing issues: {feed.bozo_exception}")
                return []

            articles = []
            for entry in feed.entries:
                try:
                    article = self._parse_entry(entry)
                    if article and article.url:
                        articles.append(article)
                except Exception as e:
                    print(f"[RSS] Error parsing entry in {self.name}: {e}")
                    continue

            print(f"[RSS] Parsed {len(articles)} articles from {self.name}")
            return articles

        except Exception as e:
            print(f"[RSS] Failed to fetch feed {self.name}: {e}")
            return []

    @abstractmethod
    def _parse_entry(self, entry):
        """Parse a single feed entry into an Article. Override per-feed."""
        pass

    def _extract_date(self, entry):
        """Try multiple date fields and formats."""
        date_fields = ["published", "updated", "created", "pubDate"]

        for field in date_fields:
            value = entry.get(field) or entry.get(f"{field}_parsed")
            if value:
                try:
                    if isinstance(value, str):
                        dt = dateparser.parse(value)
                        if dt and dt.tzinfo is None:
                            dt = dt.replace(tzinfo=timezone.utc)
                        return dt.isoformat() if dt else None
                    elif hasattr(value, "tm_year"):
                        # struct_time from feedparser
                        from time import mktime
                        dt = datetime.fromtimestamp(mktime(value), tz=timezone.utc)
                        return dt.isoformat()
                except Exception:
                    continue

        # Fallback: use current time
        return datetime.now(timezone.utc).isoformat()

    def _extract_summary(self, entry):
        """Extract summary from various possible fields."""
        # Try content:encoded first (often has richer content)
        if hasattr(entry, "content") and entry.content:
            for content in entry.content:
                if content.get("type", "").startswith("text"):
                    return content.get("value", "")

        # Try description
        if entry.get("description"):
            return entry.description

        # Try summary
        if entry.get("summary"):
            return entry.summary

        return ""


class BBCAdapter(BaseAdapter):
    """Adapter for BBC News RSS feed."""

    def _parse_entry(self, entry):
        return Article(
            title=entry.get("title", ""),
            url=entry.get("link", ""),
            summary=self._extract_summary(entry),
            published_at=self._extract_date(entry),
            source_name=self.name,
        )


class NPRAdapter(BaseAdapter):
    """Adapter for NPR RSS feed."""

    def _parse_entry(self, entry):
        return Article(
            title=entry.get("title", ""),
            url=entry.get("link", ""),
            summary=self._extract_summary(entry),
            published_at=self._extract_date(entry),
            source_name=self.name,
        )


class ReutersAdapter(BaseAdapter):
    """Adapter for Reuters RSS feed."""

    def _parse_entry(self, entry):
        # Reuters sometimes uses guid as the URL
        url = entry.get("link") or entry.get("id", "")

        return Article(
            title=entry.get("title", ""),
            url=url,
            summary=self._extract_summary(entry),
            published_at=self._extract_date(entry),
            source_name=self.name,
        )


class GenericAdapter(BaseAdapter):
    """Generic adapter for any standard RSS 2.0 or Atom feed."""

    def _parse_entry(self, entry):
        return Article(
            title=entry.get("title", ""),
            url=entry.get("link", ""),
            summary=self._extract_summary(entry),
            published_at=self._extract_date(entry),
            source_name=self.name,
        )


# Adapter registry
ADAPTERS = {
    "bbc": BBCAdapter,
    "npr": NPRAdapter,
    "reuters": ReutersAdapter,
    "generic": GenericAdapter,
}


def get_adapter(feed_config):
    """Factory function to get the appropriate adapter for a feed."""
    adapter_name = feed_config.get("adapter", "generic")
    adapter_class = ADAPTERS.get(adapter_name, GenericAdapter)
    return adapter_class(feed_config)
