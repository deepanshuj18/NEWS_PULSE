"""
Gemini-based cluster label generator for News Pulse — BATCH MODE.

Uses Google Gemini 2.5 Flash to generate concise, human-readable event labels
for news clusters. Instead of 1 API call per cluster (50+ sequential calls),
we pack clusters into batches of 10 and request structured JSON output.

Performance improvement:
  - Before:  ~50 API calls × 4s sleep = ~200s of I/O wait alone
  - After:   ~5 API calls  × 4s sleep = ~20s  of I/O wait total (90% reduction)

This module is called AFTER clusters have already been formed by HDBSCAN.
Gemini is NEVER involved in clustering, similarity, grouping, or deduplication.
"""

import os
import re
import json
import time


# ─── Gemini Client Setup ──────────────────────────────────────────────────────

def _get_client():
    """
    Create and return a Gemini client using the google-genai SDK.
    Returns None if GEMINI_API_KEY is not set or the SDK isn't installed.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("[Gemini] GEMINI_API_KEY not set — all labels will use keyword fallback.")
        return None

    try:
        from google import genai
        client = genai.Client(api_key=api_key)
        return client
    except ImportError:
        print("[Gemini] google-genai package not installed — all labels will use keyword fallback.")
        return None
    except Exception as e:
        print(f"[Gemini] Failed to initialize client: {e}")
        return None


# Module-level client — initialized once on first import
_client = None
_client_initialized = False


def _ensure_client():
    """Lazily initialize the Gemini client once."""
    global _client, _client_initialized
    if not _client_initialized:
        _client = _get_client()
        _client_initialized = True
    return _client


# ─── Label Cleaning ──────────────────────────────────────────────────────────

def _clean_label(raw_label: str) -> str:
    """
    Clean and truncate a Gemini-generated label.

    - Strips surrounding whitespace and quotes
    - Removes trailing punctuation
    - Truncates to a maximum of 6 words (instead of rejecting longer labels)
    """
    label = raw_label.strip()

    # Remove surrounding quotes (single or double, curly or straight)
    label = label.strip("\"'""''`")

    # Remove trailing punctuation (periods, colons, etc.)
    label = re.sub(r'[.,:;!?\-]+$', '', label)

    # Strip again after punctuation removal
    label = label.strip()

    if not label:
        return ""

    # Truncate to 6 words max — don't reject good labels that are slightly long
    words = label.split()
    if len(words) > 6:
        label = " ".join(words[:6])

    return label


# ─── Gemini 2.5 Flash Pricing Constants ──────────────────────────────────────
# Source: https://ai.google.dev/gemini-api/docs/pricing
# Gemini 2.5 Flash (pay-as-you-go)

INPUT_COST_PER_MILLION  = 0.15    # $0.15 per 1M input tokens (non-thinking)
OUTPUT_COST_PER_MILLION = 0.60    # $0.60 per 1M output tokens (non-thinking)


# ─── Batch Label Generation ──────────────────────────────────────────────────

# How many clusters to pack into each API request
BATCH_SIZE = 10


def generate_labels_batched(cluster_headline_map: dict, fallback_labels: dict) -> dict:
    """
    Generate labels for ALL clusters using batched Gemini API calls.

    Args:
        cluster_headline_map: Dict mapping cluster index (int) → list of up to 3 headline strings.
                              Example: {0: ["Headline A", "Headline B"], 1: ["Headline C"], ...}
        fallback_labels:      Dict mapping cluster index (int) → keyword-based fallback label (str).
                              Used when Gemini fails for any cluster.

    Returns:
        A dict with:
            "labels":        Dict mapping cluster index (int) → final label (str)
            "input_tokens":  Total input tokens consumed across all batches
            "output_tokens": Total output tokens consumed across all batches
            "cost":          Total USD cost across all batches
    """
    client = _ensure_client()

    # ── If Gemini is unavailable, return all fallback labels immediately ──────
    if client is None:
        print("[Gemini] Client unavailable — using keyword fallback for all clusters.")
        return {
            "labels": dict(fallback_labels),
            "input_tokens": 0,
            "output_tokens": 0,
            "cost": 0.0,
        }

    # ── Chunk cluster indices into batches of BATCH_SIZE ──────────────────────
    all_indices = sorted(cluster_headline_map.keys())
    batches = [
        all_indices[i:i + BATCH_SIZE]
        for i in range(0, len(all_indices), BATCH_SIZE)
    ]

    total_clusters = len(all_indices)
    total_batches = len(batches)
    print(f"[Gemini] Batching {total_clusters} clusters into {total_batches} API calls (batch size={BATCH_SIZE})")

    # ── Accumulate results ───────────────────────────────────────────────────
    final_labels = {}
    total_input_tokens = 0
    total_output_tokens = 0
    total_cost = 0.0

    for batch_num, batch_indices in enumerate(batches, start=1):
        print(f"[Gemini] Batch {batch_num}/{total_batches} — clusters {batch_indices}")

        # Rate limit: sleep BEFORE each batch (except the first)
        if batch_num > 1:
            time.sleep(4)

        # ── Build the batch prompt ───────────────────────────────────────────
        # We present each cluster as "Cluster <ID>:" followed by its headlines,
        # and ask for a JSON object mapping each ID to its 6-word label.
        cluster_sections = []
        for idx in batch_indices:
            headlines = cluster_headline_map[idx][:3]  # Max 3 headlines
            headline_text = "\n".join(f"  - {h}" for h in headlines)
            cluster_sections.append(f"Cluster {idx}:\n{headline_text}")

        clusters_block = "\n\n".join(cluster_sections)

        prompt = (
            "You are a news headline editor. For each numbered cluster below, "
            "generate a concise news-style title.\n\n"
            "Rules:\n"
            "- Maximum 6 words per title\n"
            "- Human readable, professional headline style\n"
            "- No punctuation, no quotes, no explanation\n"
            "- Return ONLY a JSON object mapping cluster number (as string) to the title\n\n"
            f"{clusters_block}\n\n"
            "Return JSON like: {\"0\": \"Title Here\", \"1\": \"Another Title\"}"
        )

        # ── Make the API call with structured JSON output ────────────────────
        try:
            from google.genai import types

            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",   # Force structured JSON output
                    thinking_config=types.ThinkingConfig(thinking_budget=0),  # No thinking needed
                ),
            )

            # ── Extract token telemetry ──────────────────────────────────────
            usage = response.usage_metadata
            batch_input = usage.prompt_token_count or 0
            batch_output = usage.candidates_token_count or 0

            input_cost = (batch_input / 1_000_000) * INPUT_COST_PER_MILLION
            output_cost = (batch_output / 1_000_000) * OUTPUT_COST_PER_MILLION
            batch_cost = input_cost + output_cost

            total_input_tokens += batch_input
            total_output_tokens += batch_output
            total_cost += batch_cost

            print(f"[Gemini] Batch {batch_num} tokens: in={batch_input}, out={batch_output}, cost=${batch_cost:.6f}")

            # ── Parse the structured JSON response ───────────────────────────
            raw_text = response.text
            if not raw_text:
                print(f"[Gemini] Batch {batch_num} returned empty response — using fallbacks")
                for idx in batch_indices:
                    final_labels[idx] = fallback_labels[idx]
                continue

            parsed = json.loads(raw_text)

            # Map each cluster in this batch to its generated label
            for idx in batch_indices:
                str_key = str(idx)
                if str_key in parsed and parsed[str_key]:
                    cleaned = _clean_label(str(parsed[str_key]))
                    if cleaned:
                        final_labels[idx] = cleaned
                        continue
                # If missing or empty after cleaning, use fallback
                print(f"[Gemini] Cluster {idx} missing from batch response — using fallback")
                final_labels[idx] = fallback_labels[idx]

        except json.JSONDecodeError as e:
            print(f"[Gemini] Batch {batch_num} JSON parse error: {e} — using fallbacks")
            for idx in batch_indices:
                final_labels[idx] = fallback_labels[idx]

        except Exception as e:
            print(f"[Gemini] Batch {batch_num} API error: {e} — using fallbacks")
            for idx in batch_indices:
                final_labels[idx] = fallback_labels[idx]

    # ── Fill any clusters that were somehow missed ────────────────────────────
    for idx in all_indices:
        if idx not in final_labels:
            final_labels[idx] = fallback_labels[idx]

    return {
        "labels": final_labels,
        "input_tokens": total_input_tokens,
        "output_tokens": total_output_tokens,
        "cost": total_cost,
    }


# ─── Legacy single-label function (kept for backward compatibility) ──────────

def generate_label(headlines: list, cluster_index: int = 0) -> dict | None:
    """
    Generate a concise news-style label for a single cluster using Gemini Flash.
    DEPRECATED: Use generate_labels_batched() for production pipelines.

    Args:
        headlines: List of representative headline strings (up to 3).
        cluster_index: Cluster number for logging purposes.

    Returns:
        A dict with 'label', 'input_tokens', 'output_tokens', 'cost' on success,
        or None if Gemini fails (caller should use fallback).
    """
    client = _ensure_client()
    if client is None:
        return None

    if not headlines:
        return None

    selected = headlines[:3]
    print(f"[Gemini] Generating label for cluster {cluster_index}")

    # Pause to respect Gemini Free Tier rate limit (15 RPM = 1 request per 4 seconds)
    time.sleep(4)

    prompt = (
        "You are labeling a news event cluster.\n\n"
        "Generate a concise news-style title.\n\n"
        "Rules:\n"
        "- Maximum 6 words\n"
        "- Human readable\n"
        "- Professional headline style\n"
        "- No punctuation\n"
        "- No quotes\n"
        "- No explanation\n\n"
        "Headlines:\n"
        + "\n".join(selected)
        + "\n\nReturn only the title."
    )

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config={
                "thinking_config": {"thinking_budget": 0},
            },
        )

        usage = response.usage_metadata
        input_tokens = usage.prompt_token_count
        output_tokens = usage.candidates_token_count

        input_cost = (input_tokens / 1_000_000) * INPUT_COST_PER_MILLION
        output_cost = (output_tokens / 1_000_000) * OUTPUT_COST_PER_MILLION
        cluster_cost = input_cost + output_cost

        raw = response.text
        if not raw:
            print(f"[Gemini] Empty response for cluster {cluster_index}")
            return None

        label = _clean_label(raw)
        if not label:
            print(f"[Gemini] Invalid label after cleaning for cluster {cluster_index}")
            return None

        print(f"[Gemini] Label generated: {label} | Cost: ${cluster_cost:.6f}")
        return {
            "label": label,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost": cluster_cost,
        }

    except Exception as e:
        print(f"[Gemini] API error for cluster {cluster_index}: {e}")
        return None
