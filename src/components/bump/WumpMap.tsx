"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Crosshair, Pause, Play, Search, TriangleAlert, Users } from "lucide-react";
import type { BumpNearby } from "@/lib/bump";
import { loadLeaflet, newWumpMap, wumpAvatarIcon, type LMap, type LeafletNS } from "@/lib/geo";
import { formatMeters } from "@/lib/location";
import { useApp } from "@/store/app";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";

type MarkerHandle = { remove: () => void; setLatLng?: (c: [number, number]) => void };

/** Live OpenStreetMap / CARTO map with real friend pins (Zenly-style chrome on top). */
export default function WumpMap({
  me,
  myLat,
  myLng,
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
  onGoLive,
}: {
  me: string | null;
  myLat: number | null;
  myLng: number | null;
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
  onGoLive?: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const LRef = useRef<LeafletNS | null>(null);
  const markersRef = useRef<Map<string, MarkerHandle>>(new Map());
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const profiles = useApp((s) => s.profiles);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let cancelled = false;
    void (async () => {
      try {
        const L = await loadLeaflet();
        if (cancelled) return;
        LRef.current = L;
        const center: [number, number] =
          myLat != null && myLng != null ? [myLat, myLng] : [47.4979, 19.0402];
        const map = newWumpMap(L, el, center, myLat != null ? 15 : 12);
        mapRef.current = map;
        setReady(true);
        requestAnimationFrame(() => map.invalidateSize());
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Map failed to load");
      }
    })();
    return () => {
      cancelled = true;
      for (const m of markersRef.current.values()) m.remove();
      markersRef.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // init once — position updates handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize when container settles
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 80);
    return () => clearTimeout(t);
  }, [ready, live, nearby.length]);

  // Sync pins
  useEffect(() => {
    const map = mapRef.current;
    const L = LRef.current;
    if (!map || !L || !ready) return;

    const want = new Set<string>();
    const upsert = (id: string, lat: number, lng: number, opts: { color: string; initial: string; me?: boolean; label?: string }) => {
      want.add(id);
      const existing = markersRef.current.get(id);
      if (existing?.setLatLng) {
        existing.setLatLng([lat, lng]);
        return;
      }
      existing?.remove();
      const marker = L.marker([lat, lng], { icon: wumpAvatarIcon(L, opts) }).addTo(map) as unknown as MarkerHandle & {
        on: (ev: string, fn: () => void) => void;
        setLatLng: (c: [number, number]) => void;
      };
      marker.on?.("click", () => {
        if (!opts.me) onOpenPerson(id);
      });
      markersRef.current.set(id, marker);
    };

    if (live && myLat != null && myLng != null && me) {
      const name = profiles[me]?.display_name || profiles[me]?.username || "You";
      upsert(me, myLat, myLng, {
        color: "#0ea5e9",
        initial: name.slice(0, 1),
        me: true,
        label: "You",
      });
    }

    for (const n of nearby) {
      const p = profiles[n.user_id];
      const name = p?.display_name || p?.username || "?";
      upsert(n.user_id, n.lat, n.lng, {
        color: p?.avatar_color || "#22c55a",
        initial: name.slice(0, 1),
        label: formatMeters(n.meters),
      });
    }

    for (const [id, m] of [...markersRef.current.entries()]) {
      if (!want.has(id)) {
        m.remove();
        markersRef.current.delete(id);
      }
    }

    const pts: [number, number][] = [];
    if (live && myLat != null && myLng != null) pts.push([myLat, myLng]);
    for (const n of nearby) pts.push([n.lat, n.lng]);
    if (pts.length >= 2) {
      try {
        map.fitBounds(pts, { padding: [48, 48], maxZoom: 16 });
      } catch {
        /* empty */
      }
    } else if (pts.length === 1) {
      map.setView(pts[0], 15);
    }
  }, [ready, live, myLat, myLng, me, nearby, profiles, onOpenPerson]);

  const recenter = () => {
    if (myLat != null && myLng != null) mapRef.current?.setView([myLat, myLng], 16);
    else onGoLive?.();
  };

  return (
    <div className="relative mx-auto aspect-[9/14] w-full max-w-md overflow-hidden rounded-[2rem] shadow-2xl ring-1 ring-black/10">
      <div ref={wrapRef} className="absolute inset-0 z-0 bg-[#e2e8f0] [&_.leaflet-control-attribution]:text-[9px]" />

      {err && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-slate-200 p-6 text-center text-sm font-semibold text-slate-700">
          {err}
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-black/25 to-transparent" />

      <div className="absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-white/85 px-3 py-1 text-[11px] font-semibold text-slate-600 shadow backdrop-blur">
        {viewsToday} nearby · OSM map
      </div>

      <div className="absolute top-3 right-3 z-10 flex flex-col items-center gap-2">
        {me && (
          <div className="relative">
            <Avatar userId={me} size={40} className="ring-2 ring-white shadow" />
            <span className={cn("absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-white", live ? "bg-ok" : "bg-faint")} />
          </div>
        )}
        <button
          type="button"
          onClick={onSearch}
          className="relative grid size-10 place-items-center rounded-full bg-[#3b82f6] text-white shadow-lg"
          aria-label="People"
        >
          <Bell className="size-4" />
        </button>
      </div>

      {!live && (
        <button
          type="button"
          onClick={() => onGoLive?.()}
          className="absolute inset-x-6 top-[40%] z-10 rounded-2xl bg-white/95 p-4 text-center text-sm font-semibold text-slate-700 shadow-lg backdrop-blur"
        >
          Go live to drop your pin on the real map
        </button>
      )}

      <button
        type="button"
        onClick={recenter}
        className="absolute bottom-28 left-4 z-10 grid size-11 place-items-center rounded-full bg-white text-sky-600 shadow-lg"
        aria-label="Recenter"
      >
        <Crosshair className="size-5" />
      </button>
      <button
        type="button"
        onClick={onSearch}
        className="absolute bottom-28 right-4 z-10 grid size-11 place-items-center rounded-full bg-white text-slate-500 shadow-lg"
        aria-label="Search people"
      >
        <Search className="size-5" />
      </button>

      <div className="absolute inset-x-0 bottom-4 z-10 flex items-end justify-center gap-3 px-4">
        <button
          type="button"
          onClick={onScratch}
          className="relative grid size-[4.5rem] place-items-center rounded-full bg-gradient-to-br from-[#fb7185] to-[#e11d48] text-white shadow-xl active:scale-95"
        >
          <TriangleAlert className="size-6" />
          <span className="absolute -bottom-1 text-[9px] font-black tracking-wider">CHAT</span>
        </button>
        <button
          type="button"
          onClick={onTogglePlay}
          className="grid size-[5.25rem] place-items-center rounded-full bg-gradient-to-br from-[#60a5fa] via-[#a78bfa] to-[#f472b6] text-white shadow-2xl ring-4 ring-white/50 active:scale-95"
          aria-label={playing ? "Pause music" : "Play music"}
        >
          {playing ? <Pause className="size-8 fill-white" /> : <Play className="ml-1 size-8 fill-white" />}
        </button>
        <button
          type="button"
          onClick={onPlaces}
          className="relative grid size-[4.5rem] place-items-center rounded-full bg-gradient-to-br from-[#38bdf8] to-[#2563eb] text-white shadow-xl active:scale-95"
        >
          <span className="text-center text-[11px] leading-tight font-black">
            <Users className="mx-auto mb-0.5 size-4" />
            +{Math.max(placesCount, nearby.length)}
          </span>
        </button>
      </div>
    </div>
  );
}
