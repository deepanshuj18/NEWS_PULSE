"use client";

type ViewMode = "top-stories" | "live-timeline";

interface ViewToggleProps {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
}

const OPTIONS: { value: ViewMode; label: string; icon: string }[] = [
  { value: "top-stories",  label: "Top Stories",   icon: "✦" },
  { value: "live-timeline", label: "Live Timeline", icon: "⌇" },
];

export default function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-xl gap-0.5 border border-slate-200/80 dark:border-white/5 shadow-inner">
      {OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold rounded-lg transition-all duration-200 select-none ${
              active
                ? "bg-white dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 shadow-sm border border-indigo-200/60 dark:border-indigo-500/30"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <span className={`text-xs ${active ? "opacity-100" : "opacity-40"}`}>{opt.icon}</span>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
