/**
 * API client for the News Pulse backend.
 */

import type {
  TimelineResponse,
  ClusterDetail,
  ClustersResponse,
  IngestTriggerResponse,
  IngestStatusResponse,
  StoryGroupsResponse,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_URL}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `API error: ${res.status}`);
  }

  return res.json();
}

export async function getTimeline(sources?: string[]): Promise<TimelineResponse> {
  const params = sources?.length ? `?sources=${sources.join(",")}` : "";
  return fetchAPI<TimelineResponse>(`/timeline${params}`);
}

export async function getClusters(): Promise<ClustersResponse> {
  return fetchAPI<ClustersResponse>("/clusters");
}

export async function getClusterDetail(id: number): Promise<ClusterDetail> {
  return fetchAPI<ClusterDetail>(`/clusters/${id}`);
}

export async function triggerIngest(): Promise<IngestTriggerResponse> {
  return fetchAPI<IngestTriggerResponse>("/ingest/trigger", {
    method: "POST",
  });
}

export async function getIngestStatus(jobId: number): Promise<IngestStatusResponse> {
  return fetchAPI<IngestStatusResponse>(`/ingest/status/${jobId}`);
}

export async function getStoryGroups(): Promise<StoryGroupsResponse> {
  return fetchAPI<StoryGroupsResponse>("/story-groups");
}
