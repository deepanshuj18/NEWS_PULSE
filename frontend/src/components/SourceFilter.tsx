"use client";

interface SourceFilterProps {
  allSources: string[];
  activeSources: string[];
  onToggleSource: (source: string) => void;
}

export default function SourceFilter({ allSources, activeSources, onToggleSource }: SourceFilterProps) {
  if (allSources.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 w-full">
      {allSources.map((source) => {
        const isActive = activeSources.includes(source);

        return (
          <button
            key={source}
            onClick={() => onToggleSource(source)}
            className={`
              text-xs px-4 py-2 rounded-full border transition-all duration-300
              font-medium tracking-wide flex items-center gap-2
              ${isActive 
                ? "bg-white border-slate-200 text-slate-800 shadow-sm dark:bg-white/[0.08] dark:border-white/20 dark:text-white dark:shadow-[0_0_15px_rgba(255,255,255,0.05)]" 
                : "bg-slate-100 border-transparent text-slate-500 hover:bg-slate-200 hover:text-slate-700 dark:bg-transparent dark:border-white/5 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-300"}
            `}
          >
            {isActive && <span className="text-[10px]">✓</span>}
            {source}
          </button>
        );
      })}
    </div>
  );
}
