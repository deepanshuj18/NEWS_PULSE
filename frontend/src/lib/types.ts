/**
 * TypeScript types for News Pulse frontend.
 */

export interface TimelineItem {
  clusterId: number;
  label: string;
  start: string;
  end: string;
  articleCount: number;
  intensity: number;
  sources: string[];
}

export interface TimelineResponse {
  items: TimelineItem[];
  totalClusters: number;
  lastUpdated: string;
}

export interface Article {
  id: number;
  title: string;
  summary: string;
  url: string;
  publishedAt: string;
  source: string;
}

export interface ClusterSummary {
  id: number;
  label: string;
  articleCount: number;
  timeRange: {
    start: string;
    end: string;
  };
  sources: string[];
  createdAt: string;
}

export interface ClusterDetail {
  id: number;
  label: string;
  articleCount: number;
  createdAt: string;
  articles: Article[];
}

export interface ClustersResponse {
  clusters: ClusterSummary[];
}

export interface IngestTriggerResponse {
  jobId: number;
  status: string;
  message: string;
}

export interface IngestStatusResponse {
  jobId: number;
  status: "pending" | "processing" | "completed" | "failed";
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  articlesProcessed: number;
}
