"""
Full article content extraction with fallback strategy.
Primary: trafilatura
Fallback: newspaper3k
Last resort: keep RSS summary
"""

import requests
from config import REQUEST_TIMEOUT, USER_AGENT, MAX_BODY_LENGTH


def extract_body(url):
    """
    Attempt to extract the full article body from a URL.
    Returns the extracted text or None if all methods fail.
    """
    if not url:
        return None

    try:
        html = _fetch_page(url)
        if not html:
            return None

        # Primary: trafilatura
        body = _try_trafilatura(html)
        if body and len(body) > 100:
            return body[:MAX_BODY_LENGTH]

        # Fallback: newspaper3k (reuse already-fetched HTML)
        body = _try_newspaper(url, html)
        if body and len(body) > 100:
            return body[:MAX_BODY_LENGTH]

        return None

    except Exception as e:
        print(f"[Extractor] Failed for {url[:60]}: {e}")
        return None


def _fetch_page(url):
    """Fetch raw HTML from URL with timeout and user-agent."""
    try:
        headers = {"User-Agent": USER_AGENT}
        resp = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT, allow_redirects=True)
        resp.raise_for_status()
        return resp.text
    except requests.RequestException as e:
        print(f"[Extractor] HTTP error fetching {url[:60]}: {e}")
        return None


def _try_trafilatura(html):
    """Extract article text using trafilatura."""
    try:
        import trafilatura
        result = trafilatura.extract(html, include_comments=False, include_tables=False)
        return result
    except Exception as e:
        print(f"[Extractor] trafilatura failed: {e}")
        return None


def _try_newspaper(url, html):
    """Extract article text using newspaper3k with pre-fetched HTML (no re-download)."""
    try:
        from newspaper import Article

        article = Article(url)
        article.set_html(html)
        article.parse()
        return article.text
    except Exception as e:
        print(f"[Extractor] newspaper3k failed: {e}")
        return None
