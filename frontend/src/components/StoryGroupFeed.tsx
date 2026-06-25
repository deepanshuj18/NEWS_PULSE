"use client";

import { useMemo } from "react";
import type { StoryGroup, TimelineItem } from "@/lib/types";

interface StoryGroupFeedProps {
  storyGroups: StoryGroup[];
  standaloneItems: TimelineItem[];
  onStoryGroupClick: (sg: StoryGroup) => void;
  onClusterClick: (clusterId: number) => void;
  selectedId: { type: "story"; id: number } | { type: "cluster"; id: number } | null;
}

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diffMs / 60000);
  const h = Math.floor(diffMs / 3600000);
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(diffMs / 86400000)}d ago`;
}

// Grid icon for cluster-count pill
function GridIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 flex-shrink-0" fill="currentColor" viewBox="0 0 16 16">
      <rect x="1" y="1" width="6" height="6" rx="1.5" />
      <rect x="9" y="1" width="6" height="6" rx="1.5" />
      <rect x="1" y="9" width="6" height="6" rx="1.5" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" />
    </svg>
  );
}

export default function StoryGroupFeed({
  storyGroups,
  standaloneItems,
  onStoryGroupClick,
  onClusterClick,
  selectedId,
}: StoryGroupFeedProps) {
  // Unified sorted feed: story groups (by lastUpdated desc) then standalone clusters (by end desc)
  const feed = useMemo(() => {
    const sgItems = [...storyGroups]
      .sort((a, b) => (b.lastUpdated ?? "").localeCompare(a.lastUpdated ?? ""))
      .map((sg) => ({ type: "story" as const, data: sg }));
    const clItems = [...standaloneItems]
      .sort((a, b) => (b.end ?? "").localeCompare(a.end ?? ""))
      .map((ci) => ({ type: "cluster" as const, data: ci }));
    return [...sgItems, ...clItems];
  }, [storyGroups, standaloneItems]);

  if (feed.length === 0) {
    return (
      <div className="glass-panel rounded-2xl flex flex-col items-center justify-center py-24 text-center">
        <svg className="w-14 h-14 mb-4 opacity-20 text-slate-400 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
        </svg>
        <p className="text-base font-semibold text-slate-500 dark:text-slate-400">No stories yet</p>
        <p className="text-sm text-slate-400 dark:text-slate-600 mt-1">Run the pipeline to generate story groups</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {feed.map((item) => {
        if (item.type === "story") {
          const sg = item.data as StoryGroup;
          const active = selectedId?.type === "story" && selectedId.id === sg.id;

          return (
            <div
              key={`sg-${sg.id}`}
              onClick={() => onStoryGroupClick(sg)}
              className={`
                relative rounded-2xl p-5 cursor-pointer overflow-hidden group transition-all duration-300
                ${active
                  ? "bg-white dark:bg-white/[0.04] ring-2 ring-indigo-500/50 dark:ring-indigo-400/25 shadow-lg shadow-indigo-500/10"
                  : "glass-bar dark:!border-transparent bg-white/50 dark:bg-transparent hover:bg-white/70 dark:hover:bg-white/[0.03] dark:hover:!border-white/10"}
              `}
            >
              {/* Shimmer sweep */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-50/50 dark:via-indigo-500/[0.04] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 -skew-x-12 translate-x-[-120%] group-hover:translate-x-[200%] pointer-events-none" />

              {/* Indigo left accent */}
              <div className={`absolute left-0 inset-y-3 w-[3px] rounded-r-full transition-all duration-300 ${active ? "bg-indigo-500" : "bg-indigo-400/50 group-hover:bg-indigo-500"}`} />

              <div className="flex items-start justify-between gap-4 pl-3">
                {/* Left content */}
                <div className="flex-1 min-w-0">
                  <span className="inline-block text-[9px] font-black uppercase tracking-[0.12em] text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2.5 py-0.5 rounded-full mb-2">
                    Macro Story
                  </span>
                  <h3 className={`font-bold text-base leading-snug transition-colors truncate ${active ? "text-indigo-600 dark:text-indigo-300" : "text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-white"}`}>
                    {sg.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-500 mt-1.5 font-medium">
                    Updated {formatRelative(sg.lastUpdated)}
                    {" · "}
                    <span className="text-indigo-500/80 dark:text-indigo-400/70">
                      {sg.clusterCount} Angle{sg.clusterCount !== 1 ? "s" : ""}
                    </span>
                    {" · "}
                    {sg.articleCount} Article{sg.articleCount !== 1 ? "s" : ""}
                  </p>
                </div>

                {/* Cluster count pill */}
                <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 self-center">
                  <GridIcon />
                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-300 whitespace-nowrap">
                    {sg.clusterCount} Cluster{sg.clusterCount !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            </div>
          );
        }

        // Standalone cluster row
        const ci = item.data as TimelineItem;
        const active = selectedId?.type === "cluster" && selectedId.id === ci.clusterId;

        return (
          <div
            key={`cl-${ci.clusterId}`}
            onClick={() => onClusterClick(ci.clusterId)}
            className={`
              relative rounded-2xl p-5 cursor-pointer overflow-hidden group transition-all duration-300
              ${active
                ? "bg-white dark:bg-white/[0.04] ring-2 ring-slate-300/60 dark:ring-white/10 shadow-md"
                : "glass-bar dark:!border-transparent bg-white/40 dark:bg-transparent hover:bg-white/70 dark:hover:bg-white/[0.03] dark:hover:!border-white/10"}
            `}
          >
            {/* Shimmer sweep */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 dark:via-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 -skew-x-12 translate-x-[-120%] group-hover:translate-x-[200%] pointer-events-none" />

            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h3 className={`font-semibold text-base leading-snug transition-colors ${active ? "text-slate-700 dark:text-white" : "text-slate-800 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white"}`}>
                  {ci.label}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-1 font-medium">
                  Updated {formatRelative(ci.end)}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {ci.sources.map((src) => (
                    <span key={src} className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                      {src}
                    </span>
                  ))}
                </div>
              </div>

              {/* Article count bubble */}
              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-white/10 dark:to-white/5 flex items-center justify-center shadow-inner self-center">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{ci.articleCount}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
