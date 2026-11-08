"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Bike, Bookmark, Car, ChevronDown, Footprints, Loader2, MapPin, Music2, Navigation, Search, User, X } from "lucide-react";
import type { LMap, LeafletNS } from "@/lib/geo";
import { NEARBY_CATS, externalMapsUrl, fmtDistance, fmtDuration, getRoute, nearbyPlaces, searchPlaces, type NearbyCat, type WumpPoi, type WumpRoute, type WumpSearchResult } from "@/lib/wumpMapApi";
import { cn } from "@/lib/utils";
import { bumpSearchPeople, bumpSearchSongs, bumpSetSong, type BumpPerson, type BumpSong } from "@/lib/bump";
import Avatar from "@/components/ui/Avatar";
import { WumpTrackPlayer } from "./WumpProfileBits";

type Scope = "places" | "people" | "songs";
const SCOPES: { id: Scope; label: string }[] = [
  { id: "places", label: "Places" },
  { id: "people", label: "People" },
  { id: "songs", label: "Songs" },
];

type Removable = { remove: () => void };
export type MapPlace = { id: string; name: string; address: string | null; kind: string | null; lat: number; lng: number; open?: string | null; website?: string | null };
type Mode = WumpRoute["mode"];

const dot = (L: LeafletNS, emoji: string, active = false) =>
  L.divIcon({
    className: "",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<div style="width:34px;height:34px;border-radius:999px;display:grid;place-items:center;font-size:16px;background:${active ? "#0ea5e9" : "#fff"};box-shadow:0 4px 14px rgba(0,0,0,.25);border:2px solid ${active ? "#fff" : "rgba(15,23,42,.08)"}">${emoji}</div>`,
  });

/** Search, nearby places and directions layered on the Wump map. */
export default function WumpMapTools({
  mapRef,
  LRef,
  ready,
  me,
  tap,
  onClearTap,
  onSavePlace,
  onOpenPerson,
  onFocusFriend,
  liveIds = "",
}: {
  mapRef: React.RefObject<LMap | null>;
  LRef: React.RefObject<LeafletNS | null>;
  ready: boolean;
  me: [number, number] | null;
  tap: { lat: number; lng: number; name: string; locality: string | null } | null;
  onClearTap: () => void;
  onSavePlace?: (place: { name: string; lat: number; lng: number; locality?: string | null; source: "map" | "live" | "tap" }) => void | Promise<void>;
  onOpenPerson?: (id: string) => void;
  onFocusFriend?: (id: string) => void;
  /** comma-joined ids of people whose pin is on the map */
  liveIds?: string;
}) {
  const [scope, setScope] = useState<Scope>("places");
  const [people, setPeople] = useState<BumpPerson[]>([]);
  const [songs, setSongs] = useState<BumpSong[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [songBusy, setSongBusy] = useState<string | null>(null);
  const onMap = new Set(liveIds ? liveIds.split(",") : []);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<WumpSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [cat, setCat] = useState<NearbyCat | null>(null);
  const [pois, setPois] = useState<WumpPoi[]>([]);
  const [catBusy, setCatBusy] = useState(false);
  const [sel, setSel] = useState<MapPlace | null>(null);
  const [mode, setMode] = useState<Mode>("walk");
  const [route, setRoute] = useState<WumpRoute | null>(null);
  const [routeBusy, setRouteBusy] = useState(false);
  const [steps, setSteps] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const poiMarkers = useRef<Removable[]>([]);
  const selMarker = useRef<Removable | null>(null);
  const routeLine = useRef<Removable[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const center = (): [number, number] | null => {
    const c = mapRef.current?.getCenter?.();
    return c ? [c.lat, c.lng] : me;
  };

  // debounced search
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const v = q.trim();
    if (v.length < 2) {
      setResults([]);
      setPeople([]);
      setSongs([]);
      return;
    }
    timer.current = setTimeout(() => {
      setSearching(true);
      setErr(null);
      const job =
        scope === "people"
          ? bumpSearchPeople(v).then(setPeople)
          : scope === "songs"
            ? bumpSearchSongs(v).then(setSongs)
            : searchPlaces(v, center()).then(setResults);
      void job.catch((e: Error) => setErr(e.message)).finally(() => setSearching(false));
    }, 320);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, scope]);

  const setSong = async (t: BumpSong) => {
    setSongBusy(t.id);
    await bumpSetSong(t.url);
    setSongBusy(null);
  };
  const hasResults = scope === "places" ? results.length > 0 : scope === "people" ? people.length > 0 : songs.length > 0;

  // tap on the map → becomes the selected place
  useEffect(() => {
    if (tap) select({ id: `tap-${tap.lat},${tap.lng}`, name: tap.name, address: tap.locality, kind: null, lat: tap.lat, lng: tap.lng }, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tap]);

  const clearRoute = () => {
    routeLine.current.forEach((l) => l.remove());
    routeLine.current = [];
    setRoute(null);
    setSteps(false);
  };
  const clearPois = () => {
    poiMarkers.current.forEach((m) => m.remove());
    poiMarkers.current = [];
    setPois([]);
  };

  function select(p: MapPlace, fly = true) {
    const L = LRef.current;
    const map = mapRef.current;
    setSel(p);
    setOpen(false);
    clearRoute();
    setErr(null);
    selMarker.current?.remove();
    selMarker.current = null;
    if (!L || !map) return;
    if (!p.id.startsWith("tap-")) selMarker.current = L.marker([p.lat, p.lng], { icon: dot(L, "📍", true), zIndexOffset: 900 }).addTo(map);
    if (fly) (map.flyTo ? map.flyTo([p.lat, p.lng], Math.max(map.getZoom?.() ?? 15, 16), { duration: 0.6 }) : map.setView([p.lat, p.lng], 16));
  }
  const close = () => {
    setSel(null);
    clearRoute();
    selMarker.current?.remove();
    selMarker.current = null;
    onClearTap();
  };

  const showCat = async (c: NearbyCat) => {
    if (cat === c) {
      setCat(null);
      clearPois();
      return;
    }
    const at = center();
    if (!at) return;
    setCat(c);
    setCatBusy(true);
    setErr(null);
    clearPois();
    try {
      const list = await nearbyPlaces(at, c);
      const L = LRef.current;
      const map = mapRef.current;
      setPois(list);
      if (L && map) {
        const emoji = NEARBY_CATS.find((x) => x.id === c)?.emoji ?? "•";
        poiMarkers.current = list.map((p) => {
          const m = L.marker([p.lat, p.lng], { icon: dot(L, emoji), title: p.name }).addTo(map);
          m.on("click", () => select({ ...p }, false));
          return m;
        });
        if (list.length) map.fitBounds([at, ...list.map((p) => [p.lat, p.lng] as [number, number])], { padding: [40, 40], maxZoom: 16 });
      }
      if (!list.length) setErr("Nothing like that within 1.2 km");
    } catch (e) {
      setErr((e as Error).message);
    }
    setCatBusy(false);
  };

  const directions = async (m: Mode = mode) => {
    if (!sel) return;
    const from = me ?? center();
    if (!from) return setErr("Turn on Live (or allow location) for directions");
    setMode(m);
    setRouteBusy(true);
    setErr(null);
    try {
      const r = await getRoute(from, [sel.lat, sel.lng], m);
      const L = LRef.current;
      const map = mapRef.current;
      routeLine.current.forEach((l) => l.remove());
      if (L && map) {
        routeLine.current = [
          L.polyline(r.coords, { color: "#0f172a", weight: 9, opacity: 0.25, lineCap: "round" }).addTo(map),
          L.polyline(r.coords, { color: m === "drive" ? "#2563eb" : m === "bike" ? "#16a34a" : "#0ea5e9", weight: 5.5, opacity: 0.95, lineCap: "round", dashArray: m === "walk" ? "1 9" : undefined }).addTo(map),
        ];
        map.fitBounds(r.coords, { padding: [60, 60], maxZoom: 17 });
      }
      setRoute(r);
    } catch (e) {
      setErr((e as Error).message);
    }
    setRouteBusy(false);
  };

  useEffect(
    () => () => {
      poiMarkers.current.forEach((m) => m.remove());
      selMarker.current?.remove();
      routeLine.current.forEach((l) => l.remove());
    },
    [],
  );

  const save = async () => {
    if (!sel || !onSavePlace) return;
    setSaving(true);
    await onSavePlace({ name: sel.name, lat: sel.lat, lng: sel.lng, locality: sel.address, source: sel.id.startsWith("tap-") ? "tap" : "map" });
    setSaving(false);
  };

  if (!ready) return null;
  return (
    <>
      {/* search + categories */}
      <div className="absolute top-[3.4rem] right-14 left-3 z-20">
        <div className="relative z-10">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={scope === "people" ? "Search friends & people" : scope === "songs" ? "Search Spotify songs" : "Search places"}
            enterKeyHint="search"
            className="h-10 w-full rounded-2xl bg-white/95 pr-9 pl-9 text-[16px] text-slate-800 shadow-lg ring-1 ring-black/5 outline-none backdrop-blur placeholder:text-slate-400 focus:ring-sky-400 sm:text-sm"
          />
          {(q || searching) && (
            <button onClick={() => (setQ(""), setResults([]), setPeople([]), setSongs([]), setPreview(null))} className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:text-slate-600" aria-label="Clear search">
              {searching ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
            </button>
          )}
          {open && (
            <div className="absolute inset-x-0 top-11 z-10 overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
              <div className="flex gap-1 border-b border-slate-100 p-1.5">
                {SCOPES.map((sc) => (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => {
                      setScope(sc.id);
                      setPreview(null);
                    }}
                    className={cn("flex flex-1 items-center justify-center gap-1 rounded-xl py-1.5 text-[11px] font-bold transition", scope === sc.id ? "bg-sky-500 text-white" : "text-slate-500 hover:bg-slate-50")}
                  >
                    {sc.id === "places" ? <MapPin className="size-3" /> : sc.id === "people" ? <User className="size-3" /> : <Music2 className="size-3" />} {sc.label}
                  </button>
                ))}
                <button type="button" onClick={() => setOpen(false)} className="grid w-7 place-items-center rounded-xl text-slate-400 hover:bg-slate-50" aria-label="Close results">
                  <X className="size-3.5" />
                </button>
              </div>
              {!hasResults ? (
                <p className="px-3 py-2.5 text-[11px] text-slate-400">
                  {q.trim().length < 2 ? (scope === "songs" ? "Type a song or artist — tap Set to put it on your profile" : scope === "people" ? "Type a name or @username" : "Type a place, address or category") : searching ? "Searching…" : "No results"}
                </p>
              ) : (
                <ul className="max-h-72 overflow-y-auto py-1">
                  {scope === "places" &&
                    results.map((r) => (
                      <li key={r.id}>
                        <button onClick={() => select(r)} className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-slate-50">
                          <span className="mt-0.5 text-base">📍</span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-slate-800">{r.name}</span>
                            <span className="block truncate text-[11px] text-slate-500">{[r.kind, r.address].filter(Boolean).join(" · ")}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  {scope === "people" &&
                    people.map((u) => (
                      <li key={u.user_id} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-slate-50">
                        <button type="button" onClick={() => (setOpen(false), onOpenPerson?.(u.user_id))} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                          <Avatar userId={u.user_id} size={32} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-slate-800">
                              {u.display_name || u.username}
                              {u.is_friend && <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">Friend</span>}
                            </span>
                            <span className="block truncate text-[11px] text-slate-500">@{u.username}</span>
                          </span>
                        </button>
                        {onMap.has(u.user_id) && onFocusFriend && (
                          <button type="button" onClick={() => (setOpen(false), onFocusFriend(u.user_id))} className="shrink-0 rounded-full bg-sky-500 px-2.5 py-1 text-[10px] font-bold text-white">
                            On map
                          </button>
                        )}
                      </li>
                    ))}
                  {scope === "songs" &&
                    songs.map((t) => (
                      <li key={t.id} className="px-2 py-1">
                        <div className="flex items-center gap-2.5 rounded-xl px-1 py-1 hover:bg-slate-50">
                          <button type="button" onClick={() => setPreview(preview === t.id ? null : t.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                            {t.image ? <img src={t.image} alt="" className="size-10 shrink-0 rounded-md object-cover" /> : <span className="grid size-10 shrink-0 place-items-center rounded-md bg-slate-100">🎵</span>}
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-slate-800">{t.name}</span>
                              <span className="block truncate text-[11px] text-slate-500">{t.artists}</span>
                            </span>
                          </button>
                          <button type="button" disabled={songBusy === t.id} onClick={() => void setSong(t)} className="shrink-0 rounded-full bg-[#1DB954] px-2.5 py-1 text-[10px] font-bold text-black disabled:opacity-50">
                            {songBusy === t.id ? "…" : "Set"}
                          </button>
                        </div>
                        {preview === t.id && <WumpTrackPlayer url={t.url} className="mt-1" />}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          {NEARBY_CATS.map((c) => (
            <button
              key={c.id}
              onClick={() => void showCat(c.id)}
              className={cn("flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold shadow ring-1 backdrop-blur transition", cat === c.id ? "bg-sky-500 text-white ring-sky-400" : "bg-white/92 text-slate-700 ring-black/5")}
            >
              {catBusy && cat === c.id ? <Loader2 className="size-3 animate-spin" /> : <span>{c.emoji}</span>} {c.label}
              {cat === c.id && pois.length > 0 && <span className="opacity-80">· {pois.length}</span>}
            </button>
          ))}
        </div>
        {err && <div className="mt-1 inline-block rounded-xl bg-slate-950/80 px-2.5 py-1 text-[11px] font-semibold text-white">{err}</div>}
      </div>

      {/* selected place / route card */}
      {sel && (
        <div className="absolute inset-x-3 bottom-[7.75rem] z-30 overflow-hidden rounded-2xl bg-white/97 shadow-2xl ring-1 ring-black/8 backdrop-blur-md">
          <div className="flex items-start gap-3 p-3.5">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-sky-50 text-lg">📍</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-slate-900">{sel.name}</div>
              <div className="mt-0.5 truncate text-[11px] text-slate-500">{[sel.kind, sel.address || `${sel.lat.toFixed(4)}, ${sel.lng.toFixed(4)}`].filter(Boolean).join(" · ")}</div>
              {sel.open && <div className="mt-0.5 truncate text-[11px] text-emerald-700">🕑 {sel.open}</div>}
            </div>
            <button onClick={close} className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200" aria-label="Close">
              <X className="size-4" />
            </button>
          </div>

          {route && (
            <div className="border-t border-slate-100 px-3.5 py-2.5">
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-black text-slate-900">{fmtDuration(route.duration)}</span>
                <span className="text-xs font-semibold text-slate-500">{fmtDistance(route.distance)}</span>
                <button onClick={() => setSteps((s) => !s)} className="ml-auto flex items-center gap-0.5 text-[11px] font-bold text-sky-600">
                  Steps <ChevronDown className={cn("size-3.5 transition", steps && "rotate-180")} />
                </button>
              </div>
              {steps && (
                <ol className="mt-2 max-h-36 space-y-1 overflow-y-auto text-[12px] text-slate-600">
                  {route.steps.map((s, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="w-4 shrink-0 text-right text-slate-400">{i + 1}</span>
                      <span className="flex-1">{s.text}</span>
                      {s.distance > 0 && <span className="shrink-0 text-slate-400">{fmtDistance(s.distance)}</span>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2.5">
            <div className="flex rounded-xl bg-slate-100 p-0.5">
              {(
                [
                  ["walk", Footprints],
                  ["bike", Bike],
                  ["drive", Car],
                ] as [Mode, typeof Car][]
              ).map(([m, I]) => (
                <button key={m} onClick={() => void directions(m)} aria-pressed={route?.mode === m} aria-label={m} className={cn("grid h-8 w-9 place-items-center rounded-lg transition", route?.mode === m ? "bg-white text-sky-600 shadow" : "text-slate-500")}>
                  <I className="size-4" />
                </button>
              ))}
            </div>
            <button disabled={routeBusy} onClick={() => void directions()} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white transition hover:bg-slate-800 disabled:opacity-60">
              {routeBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Navigation className="size-3.5" />} {route ? "Update" : "Directions"}
            </button>
            {onSavePlace && (
              <button disabled={saving} onClick={() => void save()} className="grid size-10 place-items-center rounded-xl bg-sky-50 text-sky-700 transition hover:bg-sky-100 disabled:opacity-60" aria-label="Save place" title="Save place">
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Bookmark className="size-4" />}
              </button>
            )}
            <a href={externalMapsUrl([sel.lat, sel.lng], sel.name, route?.mode ?? mode)} target="_blank" rel="noreferrer" className="grid size-10 place-items-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200" aria-label="Open in Maps" title="Open in Maps">
              <ArrowUpRight className="size-4" />
            </a>
          </div>
        </div>
      )}
    </>
  );
}
