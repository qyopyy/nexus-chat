"use client";

import { Compass, ExternalLink } from "lucide-react";
import { wumpExploreSummary, type WumpExploreStats } from "@/lib/wumpPlaces";
import { cn } from "@/lib/utils";

export default function WumpExplorePanel({
  stats,
  username,
  onOpenProfile,
  className,
}: {
  stats: WumpExploreStats;
  username?: string | null;
  onOpenProfile?: () => void;
  className?: string;
}) {
  const summary = wumpExploreSummary(stats);
  const pct = Math.max(0, Math.min(100, stats.percent || 0));

  return (
    <section className={cn("overflow-hidden rounded-2xl bg-side ring-1 ring-white/5", className)}>
      <div className="flex items-start gap-3 px-4 py-3.5">
        <div className="relative grid size-11 shrink-0 place-items-center">
          <svg viewBox="0 0 44 44" className="absolute inset-0 size-11 -rotate-90" aria-hidden>
            <circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeWidth="3" className="text-white/10" />
            <circle
              cx="22"
              cy="22"
              r="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              className="text-emerald-400 transition-[stroke-dashoffset] duration-500"
              strokeDasharray={`${2 * Math.PI * 18}`}
              strokeDashoffset={`${2 * Math.PI * 18 * (1 - pct / 100)}`}
            />
          </svg>
          <Compass className="relative size-4 text-emerald-300" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-bold tracking-tight text-txt">{summary.headline}</h3>
            <span className="tabular-nums text-xs font-semibold text-emerald-300/90">{summary.percentLabel}</span>
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-sub">{summary.detail}</p>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-sky-400 transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        {username && onOpenProfile && (
          <button
            type="button"
            onClick={onOpenProfile}
            className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-sky-200 ring-1 ring-white/10 transition hover:bg-white/10"
            title={`Open @${username}`}
          >
            @{username}
            <ExternalLink className="size-2.5 opacity-70" />
          </button>
        )}
      </div>
    </section>
  );
}
