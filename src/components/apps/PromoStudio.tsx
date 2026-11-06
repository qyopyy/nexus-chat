"use client";

import { useMemo, useState } from "react";
import { Copy, Megaphone, RefreshCw } from "lucide-react";
import { toast } from "@/store/app";
import { allPromoPool, formatPromo, todaysPromos, type PromoKind } from "@/lib/promoCopy";
import AppFrame from "./AppFrame";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<PromoKind, string> = {
  story: "IG Story",
  reel: "IG Reel",
  tiktok: "TikTok",
};

export default function PromoStudio({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const [dayOffset, setDayOffset] = useState(0);
  const [tab, setTab] = useState<"today" | "library">("today");
  const today = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return todaysPromos(d);
  }, [dayOffset]);
  const library = useMemo(() => allPromoPool(), []);

  return (
    <AppFrame title="Promo studio" Icon={Megaphone} iconClass="text-[#ff2bd6]" mobile={mobile} onBack={onBack} wide>
      <p className="text-sm text-sub">
        Ready-to-post captions for Instagram Stories, Reels, and TikTok — rotate daily so you always have something to ship.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setTab("today")} className={cn("rounded-full px-3 py-1.5 text-xs font-bold", tab === "today" ? "bg-accent text-white" : "bg-hover text-sub")}>
          Today&apos;s 3
        </button>
        <button type="button" onClick={() => setTab("library")} className={cn("rounded-full px-3 py-1.5 text-xs font-bold", tab === "library" ? "bg-accent text-white" : "bg-hover text-sub")}>
          Full library
        </button>
        {tab === "today" && (
          <button type="button" onClick={() => setDayOffset((n) => n + 1)} className="inline-flex items-center gap-1 rounded-full bg-hover px-3 py-1.5 text-xs font-bold">
            <RefreshCw className="size-3.5" /> Next day set
          </button>
        )}
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {(tab === "today" ? today : library).map((p) => (
          <article key={p.id} className="flex flex-col rounded-2xl border border-line bg-side/60 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-black tracking-wide text-accent uppercase">{KIND_LABEL[p.kind]}</span>
              <span className="truncate text-sm font-bold">{p.title}</span>
            </div>
            <p className="text-sm font-semibold text-txt">{p.hook}</p>
            <p className="mt-2 flex-1 text-sm text-sub">{p.caption}</p>
            <p className="mt-2 text-xs font-semibold text-accent">{p.cta}</p>
            <p className="mt-1 text-[11px] text-faint">{p.hashtags.join(" ")}</p>
            <button
              type="button"
              className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-full bg-accent px-3 py-2 text-sm font-bold text-white"
              onClick={() => void navigator.clipboard.writeText(formatPromo(p)).then(() => toast(`${KIND_LABEL[p.kind]} caption copied`, "success"))}
            >
              <Copy className="size-4" /> Copy post
            </button>
          </article>
        ))}
      </div>
    </AppFrame>
  );
}
