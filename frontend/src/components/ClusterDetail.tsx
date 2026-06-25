"use client";

import type { ClusterDetail as ClusterDetailType, StoryGroup } from "@/lib/types";

interface ClusterDetailProps {
  cluster: ClusterDetailType | null;
  storyGroup: StoryGroup | null;
  isLoading: boolean;
  onClose: () => void;
  isOpen: boolean;
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ArticleCard({
  article,
}: {
  article: { id: number; title: string; url: string; publishedAt: string; source: string; summary?: string };
}) {
  return (
    <div className="bg-white border border-slate-200 dark:bg-white/5 dark:border-white/10 rounded-xl p-4 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors shadow-sm group/card">
      <div className="flex justify-between items-center mb-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
          {article.source}
        </span>
        <span className="text-xs text-slate-400">{formatDateTime(article.publishedAt)}</span>
      </div>
      <h5 className="text-sm font-semibold text-slate-900 dark:text-white mb-3 leading-snug">
        {article.title}
      </h5>
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-1 font-medium w-max transition-colors"
      >
        Read full article <span className="text-lg leading-none">&rsaquo;</span>
      </a>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="p-4 rounded-xl bg-white border border-slate-200 dark:bg-white/5 dark:border-white/5 animate-pulse"
        >
          <div className="h-4 w-3/4 bg-slate-200 dark:bg-white/10 rounded mb-3" />
          <div className="h-3 w-full bg-slate-100 dark:bg-white/5 rounded mb-2" />
          <div className="h-3 w-2/3 bg-slate-100 dark:bg-white/5 rounded" />
        </div>
      ))}
    </>
  );
}

export default function ClusterDetail({
  cluster,
  storyGroup,
  isLoading,
  onClose,
  isOpen,
}: ClusterDetailProps) {
  const isGrouped = !!storyGroup && !isLoading;

  // ── Header copy ────────────────────────────────────────────────────────────
  let headerTitle = "Select a Topic";
  let headerSubtitle = "Click a story or cluster to read its articles";

  if (isLoading) {
    headerTitle = "Loading...";
    headerSubtitle = "Fetching articles...";
  } else if (isGrouped && storyGroup) {
    headerTitle = storyGroup.title;
    headerSubtitle = `Tracking ${storyGroup.clusterCount} angle${storyGroup.clusterCount !== 1 ? "s" : ""} across ${storyGroup.articleCount} article${storyGroup.articleCount !== 1 ? "s" : ""}`;
  } else if (cluster) {
    headerTitle = cluster.label;
    headerSubtitle = `${cluster.articleCount} article${cluster.articleCount !== 1 ? "s" : ""} in this cluster`;
  }

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <aside
        className={`
          fixed inset-x-0 bottom-0 top-20
          md:top-0 md:left-auto md:right-0 md:w-[420px]
          h-auto md:h-screen
          bg-slate-50 dark:bg-[#0B0E14]
          shadow-2xl z-50 flex flex-col
          rounded-t-3xl md:rounded-none
          border-t md:border-t-0 md:border-l border-slate-200 dark:border-white/5
          transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
          ${isOpen ? "translate-y-0 md:translate-x-0" : "translate-y-full md:translate-x-full md:translate-y-0"}
        `}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-white/10 flex justify-between items-start bg-white/60 dark:bg-black/20 flex-shrink-0">
          <div className="flex-1 min-w-0 pr-3">
            {isGrouped && (
              <span className="inline-block text-[9px] font-black uppercase tracking-[0.12em] text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2.5 py-0.5 rounded-full mb-2">
                Macro Story
              </span>
            )}
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1 leading-snug">
              {headerTitle}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{headerSubtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-white/5 dark:hover:bg-white/10 rounded-lg transition-colors text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white flex-shrink-0"
          >
            <span className="text-xl leading-none">&times;</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-grow overflow-y-auto p-6">
          {/* Empty state */}
          {!cluster && !storyGroup && !isLoading && (
            <div className="text-center text-slate-400 dark:text-slate-600 mt-16 text-sm px-4">
              Select a story group or cluster from the feed to explore its articles.
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="flex flex-col gap-4">
              <LoadingSkeleton />
            </div>
          )}

          {/* ── GROUPED MODE: story group with cluster accordion ──────────── */}
          {!isLoading && isGrouped && storyGroup && (
            <div className="space-y-8">
              {storyGroup.clusters.map((cl, idx) => (
                <div key={cl.id}>
                  {/* Cluster section header — sticky within scroll */}
                  <div className="flex items-center gap-2 pb-2 mb-3 border-b border-slate-200 dark:border-white/10 sticky top-0 bg-slate-50 dark:bg-[#0B0E14] pt-1 z-10">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-600">
                      Angle {idx + 1}
                    </span>
                    <h4 className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate">
                      {cl.label}
                    </h4>
                  </div>

                  {/* Articles indented with left border */}
                  <div className="pl-4 border-l-2 border-slate-100 dark:border-white/[0.06] space-y-3">
                    {cl.articles.length > 0 ? (
                      cl.articles.map((article) => (
                        <ArticleCard key={article.id} article={article} />
                      ))
                    ) : (
                      <p className="text-xs text-slate-400 italic">No articles in this angle.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── FLAT MODE: single cluster article list ───────────────────── */}
          {!isLoading && !isGrouped && cluster && (
            <div className="flex flex-col gap-4">
              {cluster.articles.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
