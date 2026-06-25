"""
Configuration for the News Pulse scraper pipeline.
All settings are loaded from environment variables with sensible defaults.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# Database
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///newspulse.db")

# RSS Feeds
FEEDS = [
    {
        "name": "BBC News",
        "url": "http://feeds.bbci.co.uk/news/rss.xml",
        "adapter": "bbc",
    },
    {
        "name": "NPR",
        "url": "https://feeds.npr.org/1001/rss.xml",
        "adapter": "npr",
    },
    {
        "name": "Reuters",
        "url": "https://www.reutersagency.com/feed/?best-topics=tech&post_type=best",
        "adapter": "reuters",
    },
    {
        "name": "Times of India",
        "url": "http://timesofindia.indiatimes.com/rssfeedstopstories.cms",
        "adapter": "generic",
    },
    {
        "name": "The Hindu",
        "url": "https://www.thehindu.com/news/national/feeder/default.rss",
        "adapter": "generic",
    },
]

# Content extraction
REQUEST_TIMEOUT = 15  # seconds
USER_AGENT = "NewsPulse/1.0 (news aggregator; academic project)"
MAX_BODY_LENGTH = 5000  # characters to store

# Clustering
MIN_CLUSTER_SIZE = 3
MIN_SAMPLES = 2
CLUSTER_SELECTION_METHOD = "eom"

# Story grouping
STORY_MERGE_THRESHOLD = 0.35  # cosine similarity threshold
