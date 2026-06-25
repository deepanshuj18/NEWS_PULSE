"use client";

import type { ClusterDetail as ClusterDetailType } from "@/lib/types";

interface ClusterDetailProps {
  cluster: ClusterDetailType | null;
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

export default function ClusterDetail({ cluster, isLoading, onClose, isOpen }: ClusterDetailProps) {
  return (
    <>
      {/* Backdrop for mobile to dim background */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden"
          onClick={onClose}
        />
      )}
      
      {/* Drawer Panel */}
      <aside 
        className={`fixed inset-x-0 bottom-0 top-20 md:top-0 md:left-auto md:right-0 md:w-[400px] h-auto md:h-screen bg-slate-50 dark:bg-[#0B0E14] shadow-2xl z-50 flex flex-col rounded-t-3xl md:rounded-none border-t md:border-t-0 md:border-l border-slate-200 dark:border-white/5 transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${isOpen ? 'translate-y-0 md:translate-x-0' : 'translate-y-full md:translate-x-full md:translate-y-0'}`}
      >
      <div className="p-6 border-b border-slate-200 dark:border-white/10 flex justify-between items-start bg-slate-100/50 dark:bg-black/20">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
            {isLoading ? "Loading..." : (cluster ? cluster.label : "Select a Cluster")}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isLoading ? "Fetching articles..." : (cluster ? `${cluster.articleCount} articles in cluster` : "Click a bar on the timeline")}
          </p>
        </div>
        <button 
          onClick={onClose} 
          className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white p-1 bg-slate-200 hover:bg-slate-300 dark:bg-white/5 dark:hover:bg-white/10 rounded-md transition-colors"
        >
          <span className="text-xl leading-none">&times;</span>
        </button>
      </div>

      <div className="flex-grow overflow-y-auto p-6 flex flex-col gap-4">
        {!cluster && !isLoading && (
          <div className="text-center text-slate-500 mt-10 text-sm">
            Select a topic cluster from the timeline to view its articles here.
          </div>
        )}

        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-4 rounded-xl bg-white border border-slate-200 dark:bg-white/5 dark:border-white/5 animate-pulse">
              <div className="h-4 w-3/4 bg-slate-200 dark:bg-white/10 rounded mb-3" />
              <div className="h-3 w-full bg-slate-100 dark:bg-white/5 rounded mb-2" />
              <div className="h-3 w-2/3 bg-slate-100 dark:bg-white/5 rounded" />
            </div>
          ))
        ) : (
          cluster?.articles.map((article) => (
            <div key={article.id} className="bg-white border border-slate-200 dark:bg-white/5 dark:border-white/10 rounded-xl p-4 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors shadow-sm">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">{article.source}</span>
                <span className="text-xs text-slate-500">{formatDateTime(article.publishedAt)}</span>
              </div>
              <h5 className="text-sm font-semibold text-slate-900 dark:text-white mb-3 leading-snug">{article.title}</h5>
              <a href={article.url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-1 font-medium w-max">
                Read full article <span className="text-lg leading-none">&rsaquo;</span>
              </a>
            </div>
          ))
        )}
      </div>
    </aside>
    </>
  );
}
