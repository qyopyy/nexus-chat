"use client";

import { useEffect, useRef, useState } from "react";
import { usePrefs } from "@/lib/prefs";
import { cn } from "@/lib/utils";

/**
 * Covers a whole message:
 *  • spoiler — dark cover, tap once to reveal (stays open)
 *  • hidden  — "invisible ink": blurred under moving sparkles, hold (or tap) to read; it hides itself again
 * The sender always sees their own message, with a small label.
 */
export default function MessageVeil({ kind, mine, children }: { kind: "hidden" | "spoiler"; mine: boolean; children: React.ReactNode }) {
  const autoSpoilers = usePrefs((s) => s.spoilersAutoReveal);
  const [open, setOpen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (hideTimer.current && clearTimeout(hideTimer.current)), []);

  if (mine || (kind === "spoiler" && autoSpoilers)) {
    return (
      <>
        <span className={cn("mb-0.5 inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-bold tracking-wide uppercase", mine ? "bg-white/15 text-white/80" : "bg-black/20 text-sub")}>
          {kind === "hidden" ? "🙈 Hidden" : "⚠️ Spoiler"}
        </span>
        <div>{children}</div>
      </>
    );
  }

  if (kind === "spoiler") {
    return (
      <div className="relative">
        <div className={cn("transition duration-300", !open && "pointer-events-none select-none blur-xl")} aria-hidden={!open}>
          {children}
        </div>
        {!open && (
          <button onClick={() => setOpen(true)} className="absolute inset-0 grid min-h-12 min-w-32 place-items-center rounded-xl bg-black/70" aria-label="Reveal spoiler">
            <span className="rounded-full bg-black/60 px-3 py-1 text-xs font-black tracking-widest text-white uppercase ring-1 ring-white/20">Spoiler</span>
          </button>
        )}
      </div>
    );
  }

  const show = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setOpen(true);
  };
  const hideSoon = (ms: number) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setOpen(false), ms);
  };
  return (
    <div
      className="relative select-none"
      onPointerDown={show}
      onPointerUp={() => hideSoon(1200)}
      onPointerLeave={() => open && hideSoon(1200)}
      onClick={() => {
        show();
        hideSoon(6000);
      }}
      onContextMenu={(e) => e.preventDefault()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          show();
          hideSoon(6000);
        }
      }}
      aria-label={open ? "Hidden message (showing)" : "Hidden message — hold to read"}
    >
      <div className={cn("transition duration-300", !open && "pointer-events-none blur-[9px] opacity-60")}>{children}</div>
      {!open && (
        <>
          <div className="ink-sparkles pointer-events-none absolute inset-0 rounded-xl" aria-hidden />
          <div className="pointer-events-none absolute inset-0 grid min-h-10 min-w-36 place-items-center">
            <span className="rounded-full bg-black/45 px-2.5 py-0.5 text-[11px] font-bold text-white/90 backdrop-blur">🙈 Hold to read</span>
          </div>
        </>
      )}
    </div>
  );
}
