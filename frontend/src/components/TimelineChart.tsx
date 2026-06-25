"use client";

import { useMemo } from "react";
import type { TimelineItem } from "@/lib/types";

interface TimelineChartProps {
  items: TimelineItem[];
  onClusterClick: (clusterId: number) => void;
  selectedClusterId: number | null;
}

// Premium color palettes matching globals.css bg-ambient vibes
const CLUSTER_COLORS = [
  { lightBg: "linear-gradient(90deg, rgba(99, 102, 241, 0.4) 0%, rgba(139, 92, 246, 0.6) 100%)", lightGlow: "rgba(139, 92, 246, 0.5)", darkBg: "#10b981" },
  { lightBg: "linear-gradient(90deg, rgba(236, 72, 153, 0.4) 0%, rgba(217, 70, 239, 0.6) 100%)", lightGlow: "rgba(217, 70, 239, 0.5)", darkBg: "#6366f1" },
  { lightBg: "linear-gradient(90deg, rgba(16, 185, 129, 0.4) 0%, rgba(5, 150, 105, 0.6) 100%)", lightGlow: "rgba(16, 185, 129, 0.5)", darkBg: "#d946ef" },
  { lightBg: "linear-gradient(90deg, rgba(245, 158, 11, 0.4) 0%, rgba(217, 119, 6, 0.6) 100%)", lightGlow: "rgba(245, 158, 11, 0.5)", darkBg: "#f97316" },
];

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffMs / 86400000)}d ago`;
}

export default function TimelineChart({ items, onClusterClick, selectedClusterId }: TimelineChartProps) {
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="glass-panel rounded-2xl flex flex-col items-center justify-center py-20 text-slate-400">
        <svg className="w-16 h-16 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
        </svg>
        <p className="text-lg font-medium text-white">No clusters found</p>
        <p className="text-sm mt-1">Try refreshing data or adjusting source filters</p>
      </div>
    );
  }

  // Compute time range
  const allTimes = items.flatMap(i => [new Date(i.start).getTime(), new Date(i.end).getTime()]);
  const minTime = Math.min(...allTimes);
  const maxTime = Math.max(...allTimes);
  const timeRange = maxTime - minTime || 3600000;

  return (
    <div className="space-y-4">
      {/* Time axis header */}
      <div className="flex items-center justify-between text-[11px] font-semibold tracking-wider uppercase text-slate-500 px-2 mb-2">
        <span>{formatDate(new Date(minTime).toISOString())} {formatTime(new Date(minTime).toISOString())}</span>
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 dark:via-white/5 to-transparent mx-4" />
        <span>{formatDate(new Date(maxTime).toISOString())} {formatTime(new Date(maxTime).toISOString())}</span>
      </div>

      {/* Cluster bars */}
      {sortedItems.map((item, index) => {
        const color = CLUSTER_COLORS[index % CLUSTER_COLORS.length];
        const startPct = ((new Date(item.start).getTime() - minTime) / timeRange) * 100;
        const endPct = ((new Date(item.end).getTime() - minTime) / timeRange) * 100;
        const widthPct = Math.max(endPct - startPct, 5); 
        const isSelected = selectedClusterId === item.clusterId;

        return (
          <div
            key={item.clusterId}
            className={`glass-bar dark:!border-transparent dark:!shadow-none dark:!backdrop-blur-none rounded-xl p-4 transition-all duration-300 relative overflow-hidden group cursor-pointer ${isSelected ? 'ring-2 ring-indigo-500 bg-white/60 dark:ring-0 dark:!border-white/15 dark:bg-white/[0.03] shadow-[0_0_20px_rgba(99,102,241,0.2)] dark:!shadow-[0_0_12px_rgba(255,255,255,0.06)]' : 'bg-white/40 dark:bg-transparent hover:bg-white/60 dark:hover:bg-white/[0.02] dark:hover:!border-white/15 dark:hover:!shadow-[0_0_12px_rgba(255,255,255,0.06)]'}`}
            onClick={() => onClusterClick(item.clusterId)}
            style={{
              "--light-bg": color.lightBg,
              "--dark-bg": color.darkBg,
              "--light-glow": color.lightGlow,
            } as React.CSSProperties}
          >
            {/* Background gradient hint */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 dark:via-white/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 -skew-x-12 translate-x-[-100%] group-hover:translate-x-[200%] pointer-events-none" />

            {/* Circular Article Count Badge (Bottom Right) */}
            <div className="absolute bottom-3 right-3 w-6 h-6 rounded-full flex items-center justify-center shadow-sm z-20"
                 style={{ backgroundImage: 'var(--light-bg)' }}>
              <div className="dark:hidden absolute inset-0 rounded-full" style={{ backgroundImage: 'var(--light-bg)' }} />
              <div className="hidden dark:block absolute inset-0 rounded-full" style={{ background: 'var(--dark-bg)' }} />
              <span className="text-[10px] font-bold text-white relative z-10 drop-shadow-md">{item.articleCount}</span>
            </div>

            <div className="flex flex-col md:flex-row dark:flex-col md:items-center dark:items-stretch justify-between gap-4 dark:gap-2 mb-3 relative z-10">
              <div className="flex-1 min-w-0">
                <div className="flex items-center dark:justify-between gap-3 mb-1">
                  <h3 className={`font-bold text-base truncate transition-colors ${isSelected ? "text-indigo-600 dark:text-white" : "text-slate-900 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-white"}`}>
                    {item.label}
                  </h3>
                  
                  {/* Removed active pill entirely */}

                  {/* Dark mode sources aligned to right of title */}
                  <div className="hidden dark:flex flex-wrap gap-1.5 flex-shrink-0">
                    {item.sources.map((source) => (
                      <span key={source} className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-slate-400">
                        {source}
                      </span>
                    ))}
                  </div>
                </div>
                
                <div className="text-xs text-slate-500 dark:text-slate-500 font-medium">
                  Last updated {formatRelativeTime(item.end)}
                </div>
              </div>

              {/* Light mode sources on right */}
              <div className="flex dark:hidden flex-wrap gap-1.5 flex-shrink-0">
                {item.sources.map((source) => (
                  <span key={source} className="text-[9px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-600 uppercase tracking-wider">
                    {source}
                  </span>
                ))}
              </div>
            </div>

            {/* Premium Timeline Bar */}
            <div className="timeline-track w-full mt-2 relative group/track">
              <div
                className="timeline-segment shadow-xl group-hover/track:scale-y-110 relative"
                style={{
                  left: `${startPct}%`,
                  width: `${widthPct}%`,
                } as React.CSSProperties}
              >
                {/* Rich Hover Tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-64 p-3 rounded-xl bg-slate-900/95 dark:bg-black/95 backdrop-blur-xl border border-white/10 shadow-2xl opacity-0 translate-y-2 pointer-events-none group-hover/track:opacity-100 group-hover/track:translate-y-0 transition-all duration-300 z-50 text-left flex flex-col gap-2">
                  <div className="font-semibold text-white text-xs leading-tight">{item.label}</div>
                  
                  <div className="flex justify-between items-center text-[10px] font-medium text-slate-300 border-b border-white/10 pb-1.5">
                    <span>{item.articleCount} Active Articles</span>
                    <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">{timeRange > 0 ? "Trending" : "New"}</span>
                  </div>

                  <div className="text-[10px] text-slate-400">
                    <div className="flex justify-between mb-1">
                      <span>Start:</span>
                      <span className="text-slate-300">{formatDate(item.start)} {formatTime(item.start)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>End:</span>
                      <span className="text-slate-300">{formatDate(item.end)} {formatTime(item.end)}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1 mt-1">
                    {item.sources.map(src => (
                      <span key={src} className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/10 text-slate-300">{src}</span>
                    ))}
                  </div>
                  
                  {/* Tooltip Triangle */}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-[1px] border-4 border-transparent border-t-slate-900/95 dark:border-t-black/95" />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
