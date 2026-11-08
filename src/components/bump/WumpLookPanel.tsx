"use client";

import { Palette, Sparkles } from "lucide-react";
import { toast } from "@/store/app";
import { WUMP_ARROWS, WUMP_BGS, WUMP_THEMES, setWumpLook, useWumpLook, wumpTheme, type WumpLook } from "@/lib/wumpLook";
import { useWumpPlus } from "@/lib/wumpPlus";
import { cn } from "@/lib/utils";
import { Toggle } from "./WumpSettings";

function ArrowPreview({ id, color }: { id: string; color: string }) {
  if (id === "orb") return <span className="size-4 rounded-full border-2 border-white" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />;
  if (id === "beam")
    return (
      <span className="relative grid size-8 place-items-center">
        <span className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(from -32deg, ${color}88, transparent 64deg, transparent 0)` }} />
        <span className="size-3.5 rounded-full border-2 border-white" style={{ background: color }} />
      </span>
    );
  if (id === "arrow" || id === "comet")
    return (
      <span className="relative grid size-8 place-items-center">
        {id === "comet" && <span className="absolute top-4 h-5 w-2.5 rounded-full" style={{ background: `linear-gradient(${color}, transparent)` }} />}
        <svg viewBox="0 0 24 24" width="22" height="22" className="relative">
          <path d="M12 2 20 21 12 16.8 4 21Z" fill={color} stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </span>
    );
  return (
    <span className={cn("grid size-7 place-items-center rounded-full border-2 border-white text-[10px] font-black text-white", id === "ghost" && "opacity-50")} style={{ background: color }}>
      A
    </span>
  );
}

/** Themes, backgrounds and your location arrow for Wump (per device). */
export default function WumpLookPanel() {
  const look = useWumpLook();
  const plus = useWumpPlus();
  const isPlus = !!plus?.active;
  const pick = (patch: Partial<WumpLook>, plusOnly?: boolean) => {
    if (plusOnly && !isPlus) {
      toast("That one is a Wump Plus look — open the ✦ Plus tab", "info");
      return;
    }
    setWumpLook(patch);
  };
  const pin = wumpTheme(look.theme).pin;

  return (
    <section className="rounded-2xl bg-side p-4 ring-1 ring-white/5">
      <div className="mb-1 flex items-center gap-2 text-sm font-bold">
        <Palette className="size-4 text-accent" /> Look
      </div>
      <p className="mb-4 text-xs text-sub">Theme, background and how your location shows on the map. Saved on this device.</p>

      <div className="mb-1.5 text-[11px] font-bold tracking-wide text-sub uppercase">Theme</div>
      <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {WUMP_THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => pick({ theme: t.id }, t.plus)}
            className={cn("relative overflow-hidden rounded-xl p-2 text-left ring-2 transition", look.theme === t.id ? "ring-accent" : "ring-white/5 hover:ring-white/20")}
            style={{ background: t.swatch[0] }}
          >
            <span className="mb-4 flex gap-1">
              <span className="size-3 rounded-full" style={{ background: t.swatch[1] }} />
              <span className="size-3 rounded-full opacity-60" style={{ background: t.swatch[1] }} />
            </span>
            <span className="block truncate text-[11px] font-bold text-white">{t.name}</span>
            {t.id.includes("999") && <span className="pointer-events-none absolute -right-1 -bottom-2 text-2xl font-black tracking-tighter opacity-20" style={{ color: t.swatch[1] }}>999</span>}
            {t.plus && <Sparkles className="absolute top-1.5 right-1.5 size-3 text-amber-300" />}
          </button>
        ))}
      </div>

      <div className="mb-1.5 text-[11px] font-bold tracking-wide text-sub uppercase">Background</div>
      <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {WUMP_BGS.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => pick({ bg: b.id }, b.plus)}
            className={cn("wump-look relative h-16 overflow-hidden rounded-xl bg-chat ring-2 transition", look.bg === b.id ? "ring-accent" : "ring-white/5 hover:ring-white/20")}
            data-wump-bg={b.id}
          >
            <span className="absolute inset-x-1.5 bottom-1 truncate text-left text-[10px] font-bold text-txt">{b.name}</span>
            {b.plus && <Sparkles className="absolute top-1.5 right-1.5 size-3 text-amber-300" />}
          </button>
        ))}
      </div>

      <div className="mb-1.5 text-[11px] font-bold tracking-wide text-sub uppercase">Your location arrow</div>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {WUMP_ARROWS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => pick({ arrow: a.id }, a.plus)}
            className={cn("flex items-center gap-2.5 rounded-xl bg-black/25 p-2.5 text-left ring-2 transition", look.arrow === a.id ? "ring-accent" : "ring-transparent hover:ring-white/15")}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-200/90">
              <ArrowPreview id={a.id} color={pin} />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1 text-xs font-bold">
                {a.name} {a.plus && <Sparkles className="size-3 text-amber-300" />}
              </span>
              <span className="block truncate text-[10px] text-sub">{a.hint}</span>
            </span>
          </button>
        ))}
      </div>

      <Toggle label="Tint the map to match" hint="Soft colour wash over the map in darker themes." checked={look.tintMap} onChange={(v) => setWumpLook({ tintMap: v })} />
    </section>
  );
}
