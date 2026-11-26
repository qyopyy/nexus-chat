"use client";

import { Check, CircleAlert } from "lucide-react";
import { reviewNotice, type NoticeLike } from "@/lib/noticeCopy";
import { cn } from "@/lib/utils";

/** Live "notice strength" review: what makes a copyright agent act on a notice without follow-up questions. */
export default function NoticeStrength({ draft, works, hasEvidence }: { draft: NoticeLike | null; works?: number; hasEvidence?: boolean }) {
  if (!draft) return null;
  const r = reviewNotice(draft, { works, hasEvidence });
  const color = r.grade === "strong" ? "#23a55a" : r.grade === "good" ? "#f0b232" : "#ed4245";
  return (
    <div className="rounded-xl bg-black/20 p-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Notice strength</div>
          <div className="text-xs text-sub">{r.grade === "strong" ? "Ready — this has everything agents look for." : "Fix the items below to reduce rejections and follow-up questions."}</div>
        </div>
        <div className="text-2xl font-black tabular-nums" style={{ color }}>
          {r.score}%
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/40">
        <div className="h-full transition-all" style={{ width: `${r.score}%`, background: color }} />
      </div>
      <ul className="mt-2 space-y-1">
        {r.checks.map((c) => (
          <li key={c.id} className="flex gap-2 text-xs">
            {c.ok ? <Check className="mt-0.5 size-3.5 shrink-0 text-ok" /> : <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-[#f0b232]" />}
            <span className={cn(c.ok && "text-sub")}>
              {c.label}
              {!c.ok && <span className="block text-sub">{c.tip}</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-sub">No tool can guarantee removal — each platform reviews notices itself. A specific, honest, well-documented notice is simply the fastest to approve.</p>
    </div>
  );
}
