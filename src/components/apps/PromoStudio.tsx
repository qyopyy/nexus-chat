"use client";

import { useMemo, useState } from "react";
import { Clapperboard, Copy, Megaphone, RefreshCw } from "lucide-react";
import { toast } from "@/store/app";
import {
  DAY_PACKS,
  allPromoPool,
  formatDayPack,
  formatPromo,
  formatPromoScript,
  packForDay,
  promoDayNumber,
  todaysTheme,
  type PromoKind,
  type PromoPiece,
} from "@/lib/promoCopy";
import AppFrame from "./AppFrame";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<PromoKind, string> = {
  story: "IG Story",
  reel: "IG Reel",
  tiktok: "TikTok",
};

function PromoCard({ p }: { p: PromoPiece }) {
  return (
    <article className="flex flex-col rounded-2xl border border-line bg-side/60 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-black tracking-wide text-accent uppercase">
          {KIND_LABEL[p.kind]}
        </span>
        <span className="text-[10px] font-bold text-faint">Day {p.day}/30</span>
        <span className="truncate text-sm font-bold">{p.title}</span>
      </div>
      <p className="text-sm font-semibold text-txt">{p.hook}</p>
      <p className="mt-2 text-sm text-sub">{p.caption}</p>
      <p className="mt-2 text-xs font-semibold text-accent">{p.cta}</p>
      <p className="mt-1 text-[11px] text-faint">
        ~{p.durationSec}s · {p.music}
      </p>
      <div className="mt-3 space-y-1">
        <p className="text-[10px] font-black tracking-wide text-faint uppercase">On-screen</p>
        <ul className="space-y-0.5 text-xs text-sub">
          {p.overlays.map((o) => (
            <li key={o}>• {o}</li>
          ))}
        </ul>
      </div>
      <div className="mt-3 space-y-1">
        <p className="text-[10px] font-black tracking-wide text-faint uppercase">Shot list</p>
        <ul className="space-y-0.5 text-xs text-sub">
          {p.shots.map((s) => (
            <li key={s}>• {s}</li>
          ))}
        </ul>
      </div>
      <p className="mt-2 text-[11px] text-faint">{p.hashtags.join(" ")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-accent px-3 py-2 text-sm font-bold text-white"
          onClick={() => void navigator.clipboard.writeText(formatPromo(p)).then(() => toast(`${KIND_LABEL[p.kind]} caption copied`, "success"))}
        >
          <Copy className="size-4" /> Caption
        </button>
        <button
          type="button"
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-hover px-3 py-2 text-sm font-bold"
          onClick={() => void navigator.clipboard.writeText(formatPromoScript(p)).then(() => toast("Full filming script copied", "success"))}
        >
          <Clapperboard className="size-4" /> Script
        </button>
      </div>
    </article>
  );
}

export default function PromoStudio({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const [dayOffset, setDayOffset] = useState(0);
  const [tab, setTab] = useState<"today" | "calendar" | "library">("today");
  const [jumpDay, setJumpDay] = useState(1);

  const viewDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return d;
  }, [dayOffset]);

  const dayNum = promoDayNumber(viewDate);
  const theme = todaysTheme(viewDate);
  const today = useMemo(() => packForDay(dayNum).pieces, [dayNum]);
  const calendarPack = useMemo(() => packForDay(jumpDay), [jumpDay]);
  const library = useMemo(() => allPromoPool(), []);

  return (
    <AppFrame title="Promo studio" Icon={Megaphone} iconClass="text-[#ff2bd6]" mobile={mobile} onBack={onBack} wide>
      <p className="text-sm text-sub">
        30 days of Instagram Story, Reel, and TikTok scripts — hooks, captions, on-screen text, shot lists, and music cues. Copy and film.
      </p>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["today", "Today’s 3"],
            ["calendar", "30-day calendar"],
            ["library", "All 90 scripts"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn("rounded-full px-3 py-1.5 text-xs font-bold", tab === id ? "bg-accent text-white" : "bg-hover text-sub")}
          >
            {label}
          </button>
        ))}
        {tab === "today" && (
          <>
            <button type="button" onClick={() => setDayOffset((n) => n + 1)} className="inline-flex items-center gap-1 rounded-full bg-hover px-3 py-1.5 text-xs font-bold">
              <RefreshCw className="size-3.5" /> Next day set
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full bg-[#ff2bd6]/20 px-3 py-1.5 text-xs font-bold text-[#ff2bd6]"
              onClick={() => void navigator.clipboard.writeText(formatDayPack(dayNum)).then(() => toast("Full day pack copied", "success"))}
            >
              <Copy className="size-3.5" /> Copy today’s pack
            </button>
          </>
        )}
      </div>

      {tab === "today" && (
        <div className="rounded-2xl border border-line bg-side/40 px-4 py-3">
          <p className="text-[10px] font-black tracking-wide text-faint uppercase">
            Day {dayNum}/30 · {theme}
            {dayOffset !== 0 ? ` · preview +${dayOffset}d` : ""}
          </p>
          <p className="text-sm text-sub">Film all three today for max reach — Story (reach) · Reel (algo) · TikTok (discovery).</p>
        </div>
      )}

      {tab === "calendar" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {DAY_PACKS.map((pack, i) => {
              const d = i + 1;
              return (
                <button
                  key={pack.theme}
                  type="button"
                  onClick={() => setJumpDay(d)}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-[11px] font-bold",
                    jumpDay === d ? "bg-accent text-white" : "bg-hover text-sub",
                  )}
                  title={pack.theme}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-side/40 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black tracking-wide text-faint uppercase">Day {jumpDay}/30</p>
              <p className="truncate text-sm font-bold">{calendarPack.theme}</p>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-white"
              onClick={() => void navigator.clipboard.writeText(formatDayPack(jumpDay)).then(() => toast(`Day ${jumpDay} pack copied`, "success"))}
            >
              <Copy className="size-3.5" /> Copy day pack
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        {(tab === "today" ? today : tab === "calendar" ? calendarPack.pieces : library).map((p) => (
          <PromoCard key={p.id} p={p} />
        ))}
      </div>
    </AppFrame>
  );
}
