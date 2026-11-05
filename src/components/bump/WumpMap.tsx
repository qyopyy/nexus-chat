"use client";

import { useMemo } from "react";
import { Bell, Globe2, Pause, Play, Search, TriangleAlert } from "lucide-react";
import type { BumpNearby } from "@/lib/bump";
import { useWumpMusic } from "@/lib/wumpMusic";
import { WUMP_MAP_BG } from "@/lib/wumpBrand";
import { formatMeters } from "@/lib/location";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";

/** Stylized social map (Zenly-inspired) with friend pins + floating actions. */
export default function WumpMap({
  me,
  nearby,
  live,
  viewsToday,
  placesCount,
  playing,
  onTogglePlay,
  onOpenPerson,
  onSearch,
  onScratch,
  onPlaces,
}: {
  me: string | null;
  nearby: BumpNearby[];
  live: boolean;
  viewsToday: number;
  placesCount: number;
  playing: boolean;
  onTogglePlay: () => void;
  onOpenPerson: (id: string) => void;
  onSearch: () => void;
  onScratch: () => void;
  onPlaces: () => void;
}) {
  const pins = useMemo(() => {
    if (!nearby.length) return [] as { id: string; x: number; y: number; meters: number }[];
    const lats = nearby.map((n) => n.lat);
    const lngs = nearby.map((n) => n.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const dLat = Math.max(0.0008, maxLat - minLat);
    const dLng = Math.max(0.0008, maxLng - minLng);
    return nearby.map((n, i) => {
      const nx = (n.lng - minLng) / dLng;
      const ny = 1 - (n.lat - minLat) / dLat;
      // jitter slightly so stacked friends don't fully overlap
      const jx = ((i * 17) % 7) / 100;
      const jy = ((i * 13) % 7) / 100;
      return {
        id: n.user_id,
        x: 12 + (nx * 0.76 + jx) * 76,
        y: 18 + (ny * 0.64 + jy) * 64,
        meters: n.meters,
      };
    });
  }, [nearby]);

  const localPlaying = useWumpMusic((s) => s.playing);

  return (
    <div className="relative mx-auto aspect-[9/14] w-full max-w-md overflow-hidden rounded-[2rem] shadow-2xl ring-1 ring-black/10">
      <div className="absolute inset-0" style={{ background: WUMP_MAP_BG }} />
      {/* grid land */}
      <svg className="absolute inset-0 h-full w-full opacity-40" aria-hidden>
        <defs>
          <pattern id="wump-grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#94a3b8" strokeWidth="0.6" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#wump-grid)" />
        <path
          d="M0,55 Q40,40 70,58 T160,50 T280,62 L280,200 L0,200 Z"
          fill="#fef9c3"
          opacity="0.85"
          transform="scale(1.4)"
        />
      </svg>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#fb7185] via-[#fb7185]/70 to-transparent" />

      {/* views pill */}
      <div className="absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-white/70 px-3 py-1 text-[11px] font-semibold text-slate-600 shadow backdrop-blur">
        {viewsToday} views today
      </div>

      {/* me + alerts */}
      <div className="absolute top-3 right-3 z-10 flex flex-col items-center gap-2">
        {me && (
          <div className="relative">
            <Avatar userId={me} size={40} className="ring-2 ring-white shadow" />
            <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-red-500 ring-2 ring-white" />
          </div>
        )}
        <button type="button" className="relative grid size-10 place-items-center rounded-full bg-[#3b82f6] text-white shadow-lg" aria-label="Notifications">
          <Bell className="size-4" />
          <span className="absolute top-0 right-0 size-2.5 rounded-full bg-red-500 ring-2 ring-white" />
        </button>
      </div>

      {/* pins */}
      {pins.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onOpenPerson(p.id)}
          className="absolute z-[5] -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${p.x}%`, top: `${p.y}%` }}
          title={formatMeters(p.meters)}
        >
          <span className="relative block">
            <Avatar userId={p.id} size={44} className="ring-[3px] ring-white shadow-lg" />
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-slate-900/80 px-1.5 text-[9px] font-bold text-white">
              {formatMeters(p.meters)}
            </span>
          </span>
        </button>
      ))}

      {/* self blue dot */}
      {live && (
        <div className="absolute top-[48%] left-1/2 z-[4] -translate-x-1/2 -translate-y-1/2">
          <span className="relative flex size-5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-60" />
            <span className="relative inline-flex size-5 rounded-full bg-sky-500 ring-4 ring-white" />
            {!nearby.length && (
              <TriangleAlert className="absolute -right-3 -top-3 size-4 text-amber-500 drop-shadow" />
            )}
          </span>
        </div>
      )}

      {!live && (
        <div className="absolute inset-x-6 top-[42%] z-10 rounded-2xl bg-white/90 p-4 text-center text-sm font-semibold text-slate-700 shadow-lg backdrop-blur">
          Go live to drop your pin on the Wump map
        </div>
      )}

      {/* floating FABs */}
      <button
        type="button"
        onClick={onSearch}
        className="absolute bottom-28 left-4 z-10 grid size-11 place-items-center rounded-full bg-white text-slate-500 shadow-lg"
        aria-label="Search"
      >
        <Search className="size-5" />
      </button>
      <button
        type="button"
        onClick={onPlaces}
        className="absolute bottom-28 right-4 z-10 grid size-11 place-items-center rounded-full bg-white text-sky-500 shadow-lg"
        aria-label="Globe"
      >
        <Globe2 className="size-5" />
      </button>

      <div className="absolute inset-x-0 bottom-4 z-10 flex items-end justify-center gap-3 px-4">
        <button
          type="button"
          onClick={onScratch}
          className="relative grid size-[4.5rem] place-items-center rounded-full bg-gradient-to-br from-[#fb7185] to-[#e11d48] text-white shadow-xl active:scale-95"
        >
          <TriangleAlert className="size-6" />
          <span className="absolute -bottom-1 text-[9px] font-black tracking-wider">SCRATCH</span>
          <span className="absolute top-1 right-1 size-2.5 rounded-full bg-red-500 ring-2 ring-white" />
        </button>
        <button
          type="button"
          onClick={onTogglePlay}
          className="grid size-[5.25rem] place-items-center rounded-full bg-gradient-to-br from-[#60a5fa] via-[#a78bfa] to-[#f472b6] text-white shadow-2xl ring-4 ring-white/50 active:scale-95"
          aria-label={playing || localPlaying ? "Pause music" : "Play music"}
        >
          {playing || localPlaying ? <Pause className="size-8 fill-white" /> : <Play className="ml-1 size-8 fill-white" />}
        </button>
        <button
          type="button"
          onClick={onPlaces}
          className={cn(
            "relative grid size-[4.5rem] place-items-center rounded-full bg-gradient-to-br from-[#38bdf8] to-[#2563eb] text-white shadow-xl active:scale-95",
          )}
        >
          <span className="text-center text-[11px] leading-tight font-black">
            +{Math.max(placesCount, nearby.length)}
            <br />
            PLACES
          </span>
          <span className="absolute top-1 right-1 size-2.5 rounded-full bg-red-500 ring-2 ring-white" />
        </button>
      </div>
    </div>
  );
}
