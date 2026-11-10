"use client";

import { useEffect, useRef, useState } from "react";
import {
  BookmarkPlus,
  Compass,
  Crosshair,
  Layers,
  Lock,
  LocateFixed,
  Pause,
  Play,
  MessageCircle,
  Search,
  UserPlus,
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
  WUMP_HD,
  WUMP_STYLE_LABEL,
} from "@/lib/geo";
import WumpMapTools from "./WumpMapTools";
import WumpLiveWith from "./WumpLiveWith";
import { useWumpPlus, wumpPlusStyles, PLUS_GOLD, type WumpPlusStyle } from "@/lib/wumpPlus";
import { effectiveLook, useWumpLook, wumpTheme } from "@/lib/wumpLook";
import { formatMeters } from "@/lib/location";
import { wumpGeocode, wumpPlaceShort } from "@/lib/wumpGeocode";
import type { WumpSavedPlace } from "@/lib/wumpPlaces";
import { wumpProfileUrl } from "@/lib/wumpPlaces";
import { wumpFriendTrail, wumpListMeetups, wumpMyTrail, type WumpNudgeKind } from "@/lib/wumpTogether";
import { freshPin, motionClass, prefersReducedMotion, shortPlace, trailEventName } from "@/lib/hundred";
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
  onFriends,
  onScratch,
  onPlaces,
  onGoLive,
  onSavePlace,
  onMessagePerson,
  onFocusChange,
  onUpgradePlus,
  onNudge,
  nudgeBurst,
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
  onFriends?: () => void;
  onScratch: () => void;
  onPlaces: () => void;
  onGoLive?: () => void;
  onSavePlace?: (place: { name: string; lat: number; lng: number; locality?: string | null; source: "map" | "live" | "tap" }) => void | Promise<void>;
  onMessagePerson?: (id: string) => void;
  /** "Live with" a friend started / stopped — lets the hub poll faster */
  onFocusChange?: (id: string | null) => void;
  onUpgradePlus?: () => void;
  onNudge?: (id: string, kind: WumpNudgeKind) => void;
  /** Latest incoming nudge, shown as a floating emoji. */
  nudgeBurst?: { id: number; emoji: string } | null;
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
  const histRef = useRef<{ remove: () => void; setLatLngs?: (c: [number, number][]) => void } | null>(null);
  const friendTrailRef = useRef<{ remove: () => void; setLatLngs?: (c: [number, number][]) => void } | null>(null);
  const meetupMarks = useRef<MarkerHandle[]>([]);
  const followRef = useRef(true);
  const userPannedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [mapStyle, setMapStyle] = useState<WumpMapStyle>(() => {
    try {
      const v = localStorage.getItem("wump-map-style") as WumpMapStyle | null;
      return v && v in WUMP_STYLE_LABEL ? v : "streets";
    } catch {
      return "streets";
    }
  });
  const [styleMenu, setStyleMenu] = useState(false);
  const [, setTapPlace] = useState<string | null>(null);
  const [tapSave, setTapSave] = useState<TapSave | null>(null);
  const [saving, setSaving] = useState(false);
  const [resolvedMine, setResolvedMine] = useState<string | null>(null);
  const profiles = useApp((s) => s.profiles);
  const plus = useWumpPlus();
  const look = effectiveLook(useWumpLook(), !!plus?.active);
  const theme = wumpTheme(look.theme);
  const iconKeys = useRef<Map<string, string>>(new Map());
  const anims = useRef<Map<string, number>>(new Map());
  const [plusStyles, setPlusStyles] = useState<Record<string, WumpPlusStyle>>({});
  const [withId, setWithId] = useState<string | null>(null);
  const PLUS_STYLES: WumpMapStyle[] = ["satellite", "hybrid", "outdoors"];

  const focusFriend = (id: string | null) => {
    setWithId(id);
    if (id) {
      followRef.current = false;
      setFollow(false);
    }
  };
  useEffect(() => {
    onFocusChange?.(withId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withId]);

  // Wump Plus cosmetics (emoji pins, colors) for everyone on the map
  const nearbyKey = nearby.map((n) => n.user_id).sort().join(",");
  useEffect(() => {
    const ids = nearbyKey ? nearbyKey.split(",") : [];
    if (!ids.length) return;
    let off = false;
    void wumpPlusStyles(ids).then((r) => {
      if (!off) setPlusStyles(r);
    });
    return () => {
      off = true;
    };
  }, [nearbyKey]);

  // Opt-in server trail (fuzzed pin history) + friend trail while Live-with + meetup pins.
  useEffect(() => {
    if (!ready) return;
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    let off = false;
    const drawLine = (
      ref: typeof histRef,
      pts: [number, number][],
      style: Record<string, unknown>,
    ) => {
      if (pts.length < 2) {
        ref.current?.remove();
        ref.current = null;
        return;
      }
      if (ref.current?.setLatLngs) {
        ref.current.setLatLngs(pts);
        return;
      }
      ref.current?.remove();
      ref.current = L.polyline(pts, style).addTo(map);
    };
    const pullMine = async () => {
      if (!live) {
        histRef.current?.remove();
        histRef.current = null;
        return;
      }
      const rows = await wumpMyTrail(24);
      if (off) return;
      drawLine(
        histRef,
        rows.map((p) => [p.lat, p.lng] as [number, number]),
        { color: "#0284c7", weight: 3, opacity: 0.45, dashArray: "6 8", lineCap: "round" },
      );
    };
    const pullFriend = async () => {
      if (!withId) {
        friendTrailRef.current?.remove();
        friendTrailRef.current = null;
        return;
      }
      const rows = await wumpFriendTrail(withId, 6);
      if (off) return;
      drawLine(
        friendTrailRef,
        rows.map((p) => [p.lat, p.lng] as [number, number]),
        { color: "#facc15", weight: 3, opacity: 0.8, lineCap: "round" },
      );
    };
    const pullMeetups = async () => {
      const rows = await wumpListMeetups();
      if (off) return;
      meetupMarks.current.forEach((m) => m.remove());
      meetupMarks.current = rows.map((m) => {
        const marker = L.marker([m.lat, m.lng], {
          icon: L.divIcon({
            className: "",
            iconSize: [28, 28],
            iconAnchor: [14, 28],
            html: `<div style="font-size:18px;line-height:28px;text-align:center;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))" title="${m.title.replace(/[&<>"']/g, "")}">📍</div>`,
          }),
          interactive: false,
        }).addTo(map);
        return marker;
      });
    };
    void pullMine();
    void pullFriend();
    void pullMeetups();
    const onMeet = () => void pullMeetups();
    const onTrail = () => void pullMine();
    window.addEventListener("wump-meetups", onMeet);
    window.addEventListener(trailEventName(), onTrail);
    const t = setInterval(() => {
      void pullMine();
      void pullFriend();
      void pullMeetups();
    }, 45_000);
    return () => {
      off = true;
      clearInterval(t);
      window.removeEventListener("wump-meetups", onMeet);
      window.removeEventListener(trailEventName(), onTrail);
      histRef.current?.remove();
      histRef.current = null;
      friendTrailRef.current?.remove();
      friendTrailRef.current = null;
      meetupMarks.current.forEach((m) => m.remove());
      meetupMarks.current = [];
    };
  }, [ready, live, withId, LRef, mapRef]);

  // Plus-only map styles fall back when Plus isn't active
  useEffect(() => {
    if (plus && !plus.active && PLUS_STYLES.includes(mapStyle)) setMapStyle("streets");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plus?.active, mapStyle]);

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
      for (const a of anims.current.values()) cancelAnimationFrame(a);
      anims.current.clear();
      iconKeys.current.clear();
      try {
        mapRef.current?.remove();
      } catch {
        /* already torn down */
      }
      mapRef.current = null;
    };
    // init once — position updates handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || !setStyleRef.current) return;
    setStyleRef.current(mapStyle);
    try {
      localStorage.setItem("wump-map-style", mapStyle);
    } catch {
      /* private mode */
    }
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
        emoji?: string | null;
        plus?: boolean;
        focus?: boolean;
        arrow?: "classic" | "arrow" | "beam" | "orb" | "ghost" | "comet";
      },
    ) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
      want.add(id);
      // Heading jitter → only re-render the icon when it turns ≥ 6°
      const heading = opts.heading != null && Number.isFinite(opts.heading) ? Math.round(opts.heading / 6) * 6 : null;
      const o = { ...opts, heading };
      const key = JSON.stringify(o);
      const existing = markersRef.current.get(id);
      if (existing?.setLatLng) {
        if (iconKeys.current.get(id) !== key) {
          existing.setIcon?.(wumpAvatarIcon(L, o));
          iconKeys.current.set(id, key);
        }
        const marker = existing;
        const cur = marker.getLatLng?.();
        const prev = anims.current.get(id);
        if (prev) cancelAnimationFrame(prev);
        const far = cur ? Math.abs(cur.lat - lat) + Math.abs(cur.lng - lng) > 0.05 : true;
        if (cur && !far) {
          const t0 = performance.now();
          const dur = 650;
          const from = { lat: cur.lat, lng: cur.lng };
          const tick = (t: number) => {
            const k = Math.min(1, (t - t0) / dur);
            const e = 1 - (1 - k) ** 3;
            marker.setLatLng?.([from.lat + (lat - from.lat) * e, from.lng + (lng - from.lng) * e]);
            if (k < 1) anims.current.set(id, requestAnimationFrame(tick));
            else anims.current.delete(id);
          };
          anims.current.set(id, requestAnimationFrame(tick));
        } else {
          existing.setLatLng([lat, lng]);
        }
        return;
      }
      existing?.remove();
      iconKeys.current.set(id, key);
      const marker = L.marker([lat, lng], { icon: wumpAvatarIcon(L, o) }).addTo(map) as unknown as MarkerHandle;
      marker.on?.("click", () => {
        if (opts.me) {
          if (opts.username && onOpenProfilePage) onOpenProfilePage(opts.username);
          return;
        }
        focusFriend(id);
      });
      markersRef.current.set(id, marker);
    };

    if (live && myLat != null && myLng != null && me) {
      const name = profiles[me]?.display_name || profiles[me]?.username || "You";
      const place = myPlaceName || resolvedMine;
      const username = myUsername || profiles[me]?.username || null;
      upsert(me, myLat, myLng, {
        color: plus?.active && plus.pin_color ? plus.pin_color : theme.pin,
        emoji: plus?.active ? plus.pin_emoji : null,
        plus: !!plus?.active,
        arrow: look.arrow,
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
      const ps = plusStyles[n.user_id];
      upsert(n.user_id, n.lat, n.lng, {
        color: ps ? ps.pin_color || PLUS_GOLD : p?.avatar_color || "#22c55a",
        emoji: ps?.pin_emoji ?? null,
        plus: !!ps,
        focus: n.user_id === withId,
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
        iconKeys.current.delete(id);
        const a = anims.current.get(id);
        if (a) cancelAnimationFrame(a);
        anims.current.delete(id);
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
    } else if (!withId && !userPannedRef.current && live && myLat != null && myLng != null && nearby.length) {
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
    plus,
    plusStyles,
    withId,
    look.arrow,
    theme.pin,
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

  const cycleStyle = () => setStyleMenu((o) => !o);

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
  const shownPlace = shortPlace(myPlaceName || resolvedMine, 48);
  const profileHref = myUsername ? wumpProfileUrl(myUsername) : null;
  const pct = Math.max(0, Math.min(100, explorePercent || 0));
  const exploreTitle =
    exploreTotal > 0
      ? `${pct}% explored · ${exploreLocal}/${exploreTotal} areas`
      : exploreAll > 0
        ? `${exploreAll} areas explored`
        : "Explore while Live";

  return (
    <div className="relative mx-auto aspect-[9/14] w-full max-w-md overflow-hidden rounded-[2rem] bg-slate-200 shadow-2xl ring-1 ring-black/10">
      <div ref={wrapRef} className="absolute inset-0 z-0 bg-[#e2e8f0] [&_.leaflet-control-attribution]:text-[9px]" />
      {look.tintMap && theme.tint && <div className="pointer-events-none absolute inset-0 z-[1]" style={{ background: theme.tint, mixBlendMode: "multiply" }} />}

      {err && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-slate-200/95 p-6 text-center text-sm font-semibold text-slate-700 backdrop-blur">
          {err}
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-28 bg-gradient-to-b from-black/35 via-black/10 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-36 bg-gradient-to-t from-black/30 to-transparent" />

      {/* Compact status HUD */}
      <div className="absolute top-3 left-3 right-14 z-10 space-y-1.5">
        <div className="inline-flex max-w-full items-center gap-2 rounded-2xl bg-white/92 px-2.5 py-1.5 shadow-lg backdrop-blur-md ring-1 ring-black/5">
          <span className={cn("size-2 shrink-0 rounded-full", live ? "animate-pulse bg-emerald-500" : "bg-slate-300")} />
          <span className="truncate text-[11px] font-semibold text-slate-700">
            {live ? `${liveFriends} live · ${nearby.length} nearby` : `${viewsToday} on map`}
          </span>
          <span className="h-3 w-px shrink-0 bg-slate-200" />
          {shownPlace && (
            <>
              <span className="hidden max-w-[7rem] truncate text-[11px] font-semibold text-slate-500 min-[380px]:inline">{shownPlace}</span>
              <span className="h-3 w-px shrink-0 bg-slate-200" />
            </>
          )}
          <span className="inline-flex items-center gap-1 text-[11px] font-bold tabular-nums text-emerald-700" title={exploreTitle}>
            <Compass className="size-3 shrink-0" />
            {pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="absolute top-3 right-3 z-10 flex flex-col items-center gap-2">
        {me && (
          <button
            type="button"
            onClick={() => {
              if (myUsername && onOpenProfilePage) onOpenProfilePage(myUsername);
            }}
            className="group relative"
            aria-label={myUsername ? `Open @${myUsername}` : "Profile"}
            title={myUsername ? `@${myUsername}` : "Profile"}
          >
            <Avatar userId={me} size={40} className="ring-2 ring-white shadow-lg" />
            <span className={cn("absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-white", live ? "bg-emerald-500" : "bg-slate-400")} />
            {myUsername && (
              <span className="pointer-events-none absolute top-full left-1/2 mt-1 max-w-[4.5rem] -translate-x-1/2 truncate rounded-md bg-slate-950/85 px-1.5 py-0.5 text-[9px] font-bold text-sky-100 opacity-0 shadow transition group-hover:opacity-100">
                @{myUsername}
              </span>
            )}
          </button>
        )}
        <button
          type="button"
          onClick={() => (onFriends || onSearch)()}
          className="grid size-10 place-items-center rounded-full bg-slate-900/85 text-white shadow-lg backdrop-blur transition hover:bg-slate-900"
          aria-label="Friends"
          title="Friends"
        >
          <UserPlus className="size-4" />
        </button>
        <button
          type="button"
          onClick={onScratch}
          className="grid size-10 place-items-center rounded-full bg-emerald-600 text-white shadow-lg backdrop-blur transition hover:bg-emerald-500"
          aria-label="Chat"
          title="Chat"
        >
          <MessageCircle className="size-4" />
        </button>
        <button
          type="button"
          onClick={cycleStyle}
          className="grid size-10 place-items-center rounded-full bg-white/92 text-slate-600 shadow-lg backdrop-blur ring-1 ring-black/5 transition hover:bg-white"
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
            className="grid size-10 place-items-center rounded-full bg-white text-sky-700 shadow-lg ring-1 ring-sky-200 transition hover:bg-sky-50 disabled:opacity-60"
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
          className="absolute inset-x-5 top-[38%] z-10 rounded-2xl bg-white/95 p-4 text-center shadow-xl ring-1 ring-black/5 backdrop-blur"
        >
          <div className="text-sm font-bold text-slate-800">Go Live on the map</div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            Share your pin, explore nearby coverage, and save places as you move.
          </p>
        </button>
      )}

      <WumpMapTools
        mapRef={mapRef}
        LRef={LRef}
        ready={ready}
        me={myLat != null && myLng != null ? [myLat, myLng] : null}
        tap={tapSave}
        onClearTap={() => {
          setTapSave(null);
          setTapPlace(null);
        }}
        onSavePlace={onSavePlace}
        onOpenPerson={onOpenPerson}
        onFocusFriend={(id) => focusFriend(id)}
        liveIds={nearbyKey}
      />

      {/* live friends rail — tap to go "Live with" them */}
      {nearby.length > 0 && !withId && (
        <div className="absolute top-[8.9rem] left-3 z-10 flex flex-col gap-1.5">
          {[...nearby]
            .sort((a, b) => (a.age_seconds ?? 1e9) - (b.age_seconds ?? 1e9))
            .slice(0, 5)
            .map((n) => {
              const fresh = freshPin(n.age_seconds);
              const ps = plusStyles[n.user_id];
              return (
                <button
                  key={n.user_id}
                  type="button"
                  onClick={() => focusFriend(n.user_id)}
                  className="relative rounded-full shadow-lg transition active:scale-95"
                  aria-label={`Live with ${n.display_name || n.username || "friend"}`}
                  title={`Live with ${n.username ? "@" + n.username : "friend"}`}
                >
                  <Avatar userId={n.user_id} size={36} className={cn("ring-2", ps ? "ring-amber-300" : "ring-white")} />
                  <span className={cn("absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-white", fresh ? "animate-pulse bg-emerald-500" : "bg-slate-400")} />
                </button>
              );
            })}
        </div>
      )}

      {withId && (
        <WumpLiveWith
          mapRef={mapRef}
          LRef={LRef}
          ready={ready}
          me={live && myLat != null && myLng != null ? [myLat, myLng] : null}
          friendId={withId}
          friend={nearby.find((n) => n.user_id === withId) ?? null}
          onClose={() => focusFriend(null)}
          onMessage={onMessagePerson}
          onProfile={onOpenPerson}
          onNudge={onNudge}
        />
      )}

      {nudgeBurst && (
        <div key={nudgeBurst.id} className={motionClass(prefersReducedMotion(), "pointer-events-none absolute top-[28%] left-1/2 z-40 -translate-x-1/2 animate-bounce text-6xl drop-shadow-lg")}>
          {nudgeBurst.emoji}
        </div>
      )}

      {styleMenu && (
        <div className="absolute top-3 right-16 z-30 w-40 overflow-hidden rounded-2xl bg-white/97 py-1 shadow-2xl ring-1 ring-black/5 backdrop-blur">
          {(Object.keys(WUMP_STYLE_LABEL) as WumpMapStyle[]).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => {
                if (PLUS_STYLES.includes(st) && !plus?.active) {
                  setStyleMenu(false);
                  onUpgradePlus?.();
                  return;
                }
                setMapStyle(st);
                setStyleMenu(false);
              }}
              className={cn("flex w-full items-center justify-between px-3 py-2 text-left text-xs font-bold", mapStyle === st ? "text-sky-600" : "text-slate-700 hover:bg-slate-50")}
            >
              {WUMP_STYLE_LABEL[st]}
              {mapStyle === st ? <span>✓</span> : PLUS_STYLES.includes(st) && !plus?.active ? <Lock className="size-3 text-amber-500" /> : null}
            </button>
          ))}
          {WUMP_HD && <div className="border-t border-slate-100 px-3 py-1.5 text-[10px] font-semibold text-slate-400">HD maps · MapTiler</div>}
        </div>
      )}

      <button
        type="button"
        onClick={recenter}
        className={cn(
          "absolute bottom-28 left-4 z-10 grid size-11 place-items-center rounded-full shadow-lg ring-1 transition",
          follow ? "bg-sky-500 text-white ring-sky-400/40" : "bg-white text-sky-600 ring-black/5",
        )}
        aria-label={follow ? "Following you" : "Recenter / follow"}
        title={follow ? "Following" : "Follow me"}
      >
        {follow ? <LocateFixed className="size-5" /> : <Crosshair className="size-5" />}
      </button>
      <button
        type="button"
        onClick={onSearch}
        className="absolute bottom-28 right-4 z-10 grid size-11 place-items-center rounded-full bg-white text-slate-500 shadow-lg ring-1 ring-black/5"
        aria-label="Search people"
        title="Find friends"
      >
        <Search className="size-5" />
      </button>

      <div className="absolute inset-x-0 bottom-4 z-10 flex items-end justify-center gap-2.5 px-3">
        <button
          type="button"
          onClick={() => (onFriends || onSearch)()}
          className="relative grid size-[3.85rem] place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-xl ring-2 ring-white/40 active:scale-95"
          aria-label="Friends"
        >
          <UserPlus className="size-5" />
          <span className="absolute -bottom-0.5 text-[8px] font-black tracking-wider">FRIENDS</span>
        </button>
        <button
          type="button"
          onClick={onScratch}
          className="relative grid size-[3.85rem] place-items-center rounded-full bg-gradient-to-br from-[#34d399] to-[#059669] text-white shadow-xl ring-2 ring-white/40 active:scale-95"
          aria-label="Chat"
        >
          <MessageCircle className="size-5" />
          <span className="absolute -bottom-0.5 text-[8px] font-black tracking-wider">CHAT</span>
        </button>
        <button
          type="button"
          onClick={onTogglePlay}
          className="grid size-[4.75rem] place-items-center rounded-full bg-gradient-to-br from-[#38bdf8] to-[#0ea5e9] text-white shadow-2xl ring-4 ring-white/55 active:scale-95"
          aria-label={playing ? "Pause music" : "Play music"}
        >
          {playing ? <Pause className="size-7 fill-white" /> : <Play className="ml-0.5 size-7 fill-white" />}
        </button>
        <button
          type="button"
          onClick={onPlaces}
          className="relative grid size-[3.85rem] place-items-center rounded-full bg-gradient-to-br from-[#38bdf8] to-[#2563eb] text-white shadow-xl ring-2 ring-white/40 active:scale-95"
          aria-label="Places"
        >
          <span className="text-center text-[10px] leading-tight font-black">
            <Users className="mx-auto mb-0.5 size-3.5" />
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
