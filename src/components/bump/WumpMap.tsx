"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Bookmark,
  BookmarkPlus,
  Compass,
  Crosshair,
  ExternalLink,
  Layers,
  LocateFixed,
  MapPinned,
  Pause,
  Play,
  Search,
  TriangleAlert,
  Users,
} from "lucide-react";
import type { BumpNearby } from "@/lib/bump";
import {
  loadLeaflet,
  newWumpMap,
  wumpAvatarIcon,
  wumpPlaceIcon,
  type LCircle,
  type LMap,
  type LeafletNS,
  type WumpMapStyle,
} from "@/lib/geo";
import { formatMeters } from "@/lib/location";
import { wumpGeocode, wumpPlaceShort } from "@/lib/wumpGeocode";
import type { WumpSavedPlace } from "@/lib/wumpPlaces";
import { wumpProfileUrl } from "@/lib/wumpPlaces";
import { useApp } from "@/store/app";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";

type MarkerHandle = {
  remove: () => void;
  setLatLng?: (c: [number, number]) => void;
  getLatLng?: () => { lat: number; lng: number };
  setIcon?: (icon: unknown) => void;
  on?: (ev: string, fn: () => void) => void;
};

type TapSave = {
  lat: number;
  lng: number;
  name: string;
  locality: string | null;
};

function ageLabel(ageSec?: number | null) {
  if (ageSec == null || !Number.isFinite(ageSec)) return null;
  if (ageSec < 20) return "now";
  if (ageSec < 60) return `${Math.round(ageSec)}s`;
  if (ageSec < 3600) return `${Math.round(ageSec / 60)}m`;
  return `${Math.round(ageSec / 3600)}h`;
}

/** Live OpenStreetMap / CARTO map with real friend pins (Zenly-style chrome on top). */
export default function WumpMap({
  me,
  myLat,
  myLng,
  myHeading,
  myAccuracy,
  myPlaceName,
  myUsername,
  nearby,
  live,
  viewsToday,
  placesCount,
  savedPlaces = [],
  explorePercent = 0,
  exploreLocal = 0,
  exploreTotal = 0,
  exploreAll = 0,
  playing,
  onTogglePlay,
  onOpenPerson,
  onOpenProfilePage,
  onSearch,
  onScratch,
  onPlaces,
  onGoLive,
  onSavePlace,
}: {
  me: string | null;
  myLat: number | null;
  myLng: number | null;
  myHeading?: number | null;
  myAccuracy?: number | null;
  myPlaceName?: string | null;
  myUsername?: string | null;
  nearby: BumpNearby[];
  live: boolean;
  viewsToday: number;
  placesCount: number;
  savedPlaces?: WumpSavedPlace[];
  explorePercent?: number;
  exploreLocal?: number;
  exploreTotal?: number;
  exploreAll?: number;
  playing: boolean;
  onTogglePlay: () => void;
  onOpenPerson: (id: string) => void;
  onOpenProfilePage?: (username: string) => void;
  onSearch: () => void;
  onScratch: () => void;
  onPlaces: () => void;
  onGoLive?: () => void;
  onSavePlace?: (place: { name: string; lat: number; lng: number; locality?: string | null; source: "map" | "live" | "tap" }) => void | Promise<void>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const LRef = useRef<LeafletNS | null>(null);
  const setStyleRef = useRef<((s: WumpMapStyle) => void) | null>(null);
  const markersRef = useRef<Map<string, MarkerHandle>>(new Map());
  const placeMarkersRef = useRef<Map<string, MarkerHandle>>(new Map());
  const savedMarkersRef = useRef<Map<string, MarkerHandle>>(new Map());
  const accuracyRef = useRef<LCircle | null>(null);
  const trailRef = useRef<{ remove: () => void; setLatLngs?: (c: [number, number][]) => void } | null>(null);
  const trailPts = useRef<[number, number][]>([]);
  const followRef = useRef(true);
  const userPannedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [mapStyle, setMapStyle] = useState<WumpMapStyle>("streets");
  const [tapPlace, setTapPlace] = useState<string | null>(null);
  const [tapSave, setTapSave] = useState<TapSave | null>(null);
  const [saving, setSaving] = useState(false);
  const [resolvedMine, setResolvedMine] = useState<string | null>(null);
  const profiles = useApp((s) => s.profiles);

  useEffect(() => {
    followRef.current = follow;
  }, [follow]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let cancelled = false;
    void (async () => {
      try {
        const L = await loadLeaflet();
        if (cancelled) return;
        LRef.current = L;
        const center: [number, number] = myLat != null && myLng != null ? [myLat, myLng] : [47.4979, 19.0402];
        const { map, setStyle } = newWumpMap(L, el, center, myLat != null ? 15 : 12, "streets");
        mapRef.current = map;
        setStyleRef.current = setStyle;
        const markPanned = () => {
          userPannedRef.current = true;
          followRef.current = false;
          setFollow(false);
        };
        map.on("dragstart", markPanned);
        map.on("zoomstart", markPanned);
        map.on("click", (e) => {
          const { lat, lng } = e.latlng;
          setTapPlace("Looking up…");
          setTapSave(null);
          void wumpGeocode(lat, lng).then((p) => {
            const name = wumpPlaceShort(p) || p?.display || "Unknown place";
            setTapPlace(name);
            setTapSave({
              lat,
              lng,
              name,
              locality: p?.locality || p?.city || null,
            });
          });
        });
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
      for (const m of placeMarkersRef.current.values()) m.remove();
      placeMarkersRef.current.clear();
      for (const m of savedMarkersRef.current.values()) m.remove();
      savedMarkersRef.current.clear();
      accuracyRef.current?.remove();
      accuracyRef.current = null;
      trailRef.current?.remove();
      trailRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // init once — position updates handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || !setStyleRef.current) return;
    setStyleRef.current(mapStyle);
  }, [ready, mapStyle]);

  // Resize when container settles
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 80);
    return () => clearTimeout(t);
  }, [ready, live, nearby.length, savedPlaces.length]);

  // Sync pins + accuracy + trail
  useEffect(() => {
    const map = mapRef.current;
    const L = LRef.current;
    if (!map || !L || !ready) return;

    const want = new Set<string>();
    const upsert = (
      id: string,
      lat: number,
      lng: number,
      opts: {
        color: string;
        initial: string;
        me?: boolean;
        label?: string;
        place?: string | null;
        username?: string | null;
        heading?: number | null;
        stale?: boolean;
      },
    ) => {
      want.add(id);
      const icon = wumpAvatarIcon(L, opts);
      const existing = markersRef.current.get(id);
      if (existing?.setLatLng) {
        existing.setIcon?.(icon);
        const marker = existing;
        const cur = marker.getLatLng?.();
        if (cur) {
          const steps = 10;
          let i = 0;
          const from = { lat: cur.lat, lng: cur.lng };
          const tick = () => {
            i++;
            const k = i / steps;
            marker.setLatLng?.([from.lat + (lat - from.lat) * k, from.lng + (lng - from.lng) * k]);
            if (i < steps) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        } else {
          existing.setLatLng([lat, lng]);
        }
        return;
      }
      existing?.remove();
      const marker = L.marker([lat, lng], { icon }).addTo(map) as unknown as MarkerHandle;
      marker.on?.("click", () => {
        if (opts.me) {
          if (opts.username && onOpenProfilePage) onOpenProfilePage(opts.username);
          return;
        }
        onOpenPerson(id);
      });
      markersRef.current.set(id, marker);
    };

    if (live && myLat != null && myLng != null && me) {
      const name = profiles[me]?.display_name || profiles[me]?.username || "You";
      const place = myPlaceName || resolvedMine;
      const username = myUsername || profiles[me]?.username || null;
      upsert(me, myLat, myLng, {
        color: "#0ea5e9",
        initial: name.slice(0, 1),
        me: true,
        label: "You",
        place,
        username,
        heading: myHeading ?? null,
      });

      // Accuracy circle
      const r = Math.max(12, Math.min(myAccuracy ?? 40, 180));
      if (accuracyRef.current) {
        accuracyRef.current.setLatLng([myLat, myLng]);
        accuracyRef.current.setRadius(r);
      } else if (L.circle) {
        accuracyRef.current = L.circle([myLat, myLng], {
          radius: r,
          color: "#38bdf8",
          weight: 1,
          fillColor: "#38bdf8",
          fillOpacity: 0.12,
          interactive: false,
        }).addTo(map);
      }

      // Breadcrumb trail (last ~40 samples)
      const last = trailPts.current[trailPts.current.length - 1];
      if (!last || Math.hypot(last[0] - myLat, last[1] - myLng) > 0.00005) {
        trailPts.current = [...trailPts.current.slice(-39), [myLat, myLng] as [number, number]];
      }
      if (trailPts.current.length >= 2) {
        if (trailRef.current?.setLatLngs) {
          trailRef.current.setLatLngs(trailPts.current);
        } else {
          trailRef.current?.remove();
          trailRef.current = L.polyline(trailPts.current, {
            color: "#38bdf8",
            weight: 3,
            opacity: 0.55,
            lineCap: "round",
          }).addTo(map) as { remove: () => void; setLatLngs?: (c: [number, number][]) => void };
        }
      }
    } else {
      accuracyRef.current?.remove();
      accuracyRef.current = null;
      trailRef.current?.remove();
      trailRef.current = null;
      trailPts.current = [];
    }

    for (const n of nearby) {
      const p = profiles[n.user_id];
      const username = n.username || p?.username || null;
      const name = n.display_name || p?.display_name || username || "?";
      const age = n.age_seconds ?? (n.updated_at ? (Date.now() - new Date(n.updated_at).getTime()) / 1000 : null);
      const stale = age != null && age > 90;
      const dist = formatMeters(n.meters);
      const ageTxt = ageLabel(age);
      const place = n.place_name || n.place_locality || null;
      upsert(n.user_id, n.lat, n.lng, {
        color: p?.avatar_color || "#22c55a",
        initial: name.slice(0, 1),
        label: ageTxt ? `${dist} · ${ageTxt}` : dist,
        place,
        username,
        heading: n.heading ?? null,
        stale,
      });
    }

    for (const [id, m] of [...markersRef.current.entries()]) {
      if (!want.has(id)) {
        m.remove();
        markersRef.current.delete(id);
      }
    }

    // Profile-pinned places (Apple Maps / saved spots)
    const wantPlaces = new Set<string>();
    for (const n of nearby) {
      if (n.profile_place_lat == null || n.profile_place_lng == null || !n.profile_place_name) continue;
      const id = `place:${n.user_id}`;
      wantPlaces.add(id);
      const existing = placeMarkersRef.current.get(id);
      if (existing?.setLatLng) {
        existing.setLatLng([n.profile_place_lat, n.profile_place_lng]);
        continue;
      }
      existing?.remove();
      const marker = L.marker([n.profile_place_lat, n.profile_place_lng], {
        icon: wumpPlaceIcon(L, { title: n.profile_place_name, color: profiles[n.user_id]?.avatar_color || "#f59e0b" }),
      }).addTo(map) as unknown as MarkerHandle;
      marker.on?.("click", () => onOpenPerson(n.user_id));
      placeMarkersRef.current.set(id, marker);
    }
    for (const [id, m] of [...placeMarkersRef.current.entries()]) {
      if (!wantPlaces.has(id)) {
        m.remove();
        placeMarkersRef.current.delete(id);
      }
    }

    // User-saved places
    const wantSaved = new Set<string>();
    for (const s of savedPlaces) {
      const id = `saved:${s.id}`;
      wantSaved.add(id);
      const existing = savedMarkersRef.current.get(id);
      if (existing?.setLatLng) {
        existing.setLatLng([s.lat, s.lng]);
        continue;
      }
      existing?.remove();
      const marker = L.marker([s.lat, s.lng], {
        icon: wumpPlaceIcon(L, { title: s.name, color: "#38bdf8" }),
      }).addTo(map) as unknown as MarkerHandle;
      savedMarkersRef.current.set(id, marker);
    }
    for (const [id, m] of [...savedMarkersRef.current.entries()]) {
      if (!wantSaved.has(id)) {
        m.remove();
        savedMarkersRef.current.delete(id);
      }
    }

    // Camera: follow me OR one-shot fit when first going live (not after user pans)
    if (followRef.current && live && myLat != null && myLng != null) {
      map.setView([myLat, myLng], Math.max(map.getZoom?.() ?? 15, 15));
    } else if (!userPannedRef.current && live && myLat != null && myLng != null && nearby.length) {
      const pts: [number, number][] = [[myLat, myLng], ...nearby.map((n) => [n.lat, n.lng] as [number, number])];
      try {
        map.fitBounds(pts, { padding: [56, 56], maxZoom: 16 });
      } catch {
        /* empty */
      }
    }
  }, [
    ready,
    live,
    myLat,
    myLng,
    myHeading,
    myAccuracy,
    myPlaceName,
    myUsername,
    resolvedMine,
    me,
    nearby,
    profiles,
    savedPlaces,
    onOpenPerson,
    onOpenProfilePage,
    follow,
  ]);

  // Resolve my place name on the client when server hasn't filled it yet
  useEffect(() => {
    if (!live || myLat == null || myLng == null) {
      setResolvedMine(null);
      return;
    }
    if (myPlaceName) {
      setResolvedMine(myPlaceName);
      return;
    }
    let cancelled = false;
    void wumpGeocode(myLat, myLng).then((p) => {
      if (!cancelled) setResolvedMine(wumpPlaceShort(p));
    });
    return () => {
      cancelled = true;
    };
  }, [live, myLat, myLng, myPlaceName]);

  const recenter = () => {
    userPannedRef.current = false;
    setFollow(true);
    followRef.current = true;
    if (myLat != null && myLng != null) mapRef.current?.setView([myLat, myLng], 16);
    else onGoLive?.();
  };

  const cycleStyle = () => {
    const order: WumpMapStyle[] = ["streets", "dark", "satellite"];
    const next = order[(order.indexOf(mapStyle) + 1) % order.length]!;
    setMapStyle(next);
  };

  const saveTap = async () => {
    if (!tapSave || !onSavePlace) return;
    setSaving(true);
    await onSavePlace({
      name: tapSave.name,
      lat: tapSave.lat,
      lng: tapSave.lng,
      locality: tapSave.locality,
      source: "tap",
    });
    setSaving(false);
    setTapSave(null);
  };

  const saveHere = async () => {
    if (!onSavePlace || myLat == null || myLng == null) return;
    const name = myPlaceName || resolvedMine || "Saved place";
    setSaving(true);
    await onSavePlace({
      name,
      lat: myLat,
      lng: myLng,
      locality: null,
      source: "live",
    });
    setSaving(false);
  };

  const liveFriends = nearby.filter((n) => (n.age_seconds ?? 0) < 90).length;
  const shownPlace = myPlaceName || resolvedMine;
  const profileHref = myUsername ? wumpProfileUrl(myUsername) : null;
  const exploreLabel =
    exploreTotal > 0
      ? `${explorePercent}% explored · ${exploreLocal}/${exploreTotal} cells`
      : exploreAll > 0
        ? `${exploreAll} cells explored`
        : "Explore the map while Live";

  return (
    <div className="relative mx-auto aspect-[9/14] w-full max-w-md overflow-hidden rounded-[2rem] shadow-2xl ring-1 ring-black/10">
      <div ref={wrapRef} className="absolute inset-0 z-0 bg-[#e2e8f0] [&_.leaflet-control-attribution]:text-[9px]" />

      {err && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-slate-200 p-6 text-center text-sm font-semibold text-slate-700">
          {err}
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-black/25 to-transparent" />

      <div className="absolute top-3 left-1/2 z-10 flex max-w-[78%] -translate-x-1/2 flex-col items-center gap-1">
        <div className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold text-slate-600 shadow backdrop-blur">
          <span className={cn("size-1.5 rounded-full", live ? "animate-pulse bg-emerald-500" : "bg-slate-300")} />
          {live ? `${liveFriends} live · ${nearby.length} nearby` : `${viewsToday} on map`}
        </div>
        <div
          className="flex max-w-full items-center gap-1.5 truncate rounded-full bg-emerald-950/85 px-2.5 py-1 text-[10px] font-bold text-emerald-100 shadow backdrop-blur"
          title={exploreLabel}
        >
          <Compass className="size-3 shrink-0 text-emerald-300" />
          <span className="truncate">
            {explorePercent}% map · {exploreAll} cells
          </span>
        </div>
        {(shownPlace || tapPlace) && (
          <div className="flex max-w-full items-center gap-1 truncate rounded-full bg-slate-900/85 px-2.5 py-1 text-[10px] font-bold text-white shadow backdrop-blur">
            <MapPinned className="size-3 shrink-0 text-sky-300" />
            <span className="truncate">{tapPlace || shownPlace}</span>
          </div>
        )}
        {myUsername && (
          <button
            type="button"
            onClick={() => (onOpenProfilePage ? onOpenProfilePage(myUsername) : undefined)}
            className="pointer-events-auto flex max-w-full items-center gap-1 truncate rounded-full bg-sky-950/80 px-2.5 py-1 text-[10px] font-bold text-sky-100 shadow backdrop-blur"
          >
            @{myUsername}
            <ExternalLink className="size-2.5 shrink-0 opacity-80" />
          </button>
        )}
      </div>

      <div className="absolute top-3 right-3 z-10 flex flex-col items-center gap-2">
        {me && (
          <button
            type="button"
            onClick={() => {
              if (myUsername && onOpenProfilePage) onOpenProfilePage(myUsername);
            }}
            className="relative"
            aria-label={myUsername ? `Open @${myUsername}` : "Profile"}
            title={myUsername ? `@${myUsername}` : "Profile"}
          >
            <Avatar userId={me} size={40} className="ring-2 ring-white shadow" />
            <span className={cn("absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-white", live ? "bg-ok" : "bg-faint")} />
          </button>
        )}
        <button
          type="button"
          onClick={onSearch}
          className="relative grid size-10 place-items-center rounded-full bg-[#3b82f6] text-white shadow-lg"
          aria-label="People"
        >
          <Bell className="size-4" />
        </button>
        <button
          type="button"
          onClick={cycleStyle}
          className="grid size-10 place-items-center rounded-full bg-white/90 text-slate-600 shadow-lg backdrop-blur"
          aria-label={`Map style: ${mapStyle}`}
          title={`Map: ${mapStyle}`}
        >
          <Layers className="size-4" />
        </button>
        {live && myLat != null && myLng != null && onSavePlace && (
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveHere()}
            className="grid size-10 place-items-center rounded-full bg-amber-400 text-amber-950 shadow-lg disabled:opacity-60"
            aria-label="Save this place"
            title="Save this place"
          >
            <BookmarkPlus className="size-4" />
          </button>
        )}
      </div>

      {!live && (
        <button
          type="button"
          onClick={() => onGoLive?.()}
          className="absolute inset-x-6 top-[40%] z-10 rounded-2xl bg-white/95 p-4 text-center text-sm font-semibold text-slate-700 shadow-lg backdrop-blur"
        >
          Go live to explore the map and drop your pin
        </button>
      )}

      {tapSave && onSavePlace && (
        <div className="absolute inset-x-4 top-[38%] z-20 rounded-2xl bg-white/95 p-3 shadow-xl backdrop-blur">
          <div className="flex items-start gap-2">
            <Bookmark className="mt-0.5 size-4 shrink-0 text-sky-600" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-slate-800">{tapSave.name}</div>
              <div className="text-[11px] text-slate-500">
                {tapSave.lat.toFixed(5)}, {tapSave.lng.toFixed(5)}
              </div>
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveTap()}
              className="flex-1 rounded-xl bg-sky-600 py-2 text-xs font-bold text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save place"}
            </button>
            <button
              type="button"
              onClick={() => {
                setTapSave(null);
                setTapPlace(null);
              }}
              className="rounded-xl bg-slate-200 px-3 py-2 text-xs font-bold text-slate-600"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={recenter}
        className={cn(
          "absolute bottom-28 left-4 z-10 grid size-11 place-items-center rounded-full shadow-lg",
          follow ? "bg-sky-500 text-white" : "bg-white text-sky-600",
        )}
        aria-label={follow ? "Following you" : "Recenter / follow"}
        title={follow ? "Following" : "Follow me"}
      >
        {follow ? <LocateFixed className="size-5" /> : <Crosshair className="size-5" />}
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
            +{Math.max(placesCount, nearby.length, savedPlaces.length)}
          </span>
        </button>
      </div>

      {profileHref && (
        <a href={profileHref} className="sr-only">
          Profile @{myUsername}
        </a>
      )}
    </div>
  );
}
