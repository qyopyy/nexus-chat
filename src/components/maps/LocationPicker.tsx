"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, LocateFixed, MapPin, Search, X } from "lucide-react";
import { loadWumpGl, newWumpGlMap } from "@/lib/wumpGl";
import type { LMap, LeafletNS } from "@/lib/geo";
import { searchPlaces, type WumpSearchResult } from "@/lib/wumpMapApi";
import { wumpGeocode, wumpPlaceShort } from "@/lib/wumpGeocode";
import { getDeviceLocation } from "@/lib/location";
import { loadRecents, rememberSearch, type RecentSearch } from "@/lib/wumpRecent";
import { cn } from "@/lib/utils";

export type PickedPlace = {
  lat: number;
  lng: number;
  name: string;
  address: string | null;
};

/**
 * Small MapLibre map for choosing a place: search, tap, drag the pin, or use
 * the device location (Capacitor on the iOS shell, browser geolocation on the web).
 */
export default function LocationPicker({
  initial,
  onPick,
  onCancel,
  confirmLabel = "Use this place",
  extra,
  className,
}: {
  initial?: { lat: number; lng: number; name?: string | null } | null;
  onPick: (place: PickedPlace) => void | Promise<void>;
  onCancel?: () => void;
  confirmLabel?: string;
  extra?: { label: string; onPress: (place: PickedPlace) => void | Promise<void> };
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const LRef = useRef<LeafletNS | null>(null);
  const pinRef = useRef<{ setLatLng: (c: [number, number]) => void; remove: () => void } | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<WumpSearchResult[]>([]);
  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [place, setPlace] = useState<PickedPlace | null>(
    initial ? { lat: initial.lat, lng: initial.lng, name: initial.name || "Pinned place", address: null } : null,
  );
  const [err, setErr] = useState<string | null>(null);

  const describe = async (lat: number, lng: number, name?: string | null) => {
    const geo = await wumpGeocode(lat, lng);
    const label = name || wumpPlaceShort(geo) || geo?.display || "Pinned place";
    const next = { lat, lng, name: label, address: geo?.display || geo?.locality || geo?.city || null };
    setPlace(next);
    return next;
  };

  const drop = (lat: number, lng: number, name?: string | null, fly = false) => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (!pinRef.current) {
      const marker = L.marker([lat, lng], {
        draggable: true,
        zIndexOffset: 800,
        icon: L.divIcon({
          className: "",
          iconSize: [28, 36],
          iconAnchor: [14, 34],
          html: `<div style="width:28px;height:36px"><svg viewBox="0 0 28 36" width="28" height="36"><path d="M14 35s12-12.6 12-21A12 12 0 0 0 2 14c0 8.4 12 21 12 21z" fill="#0284c7" stroke="#fff" stroke-width="2.5"/><circle cx="14" cy="13" r="4.5" fill="#fff"/></svg></div>`,
        }),
      }).addTo(map);
      marker.on?.("dragend", () => {
        const ll = marker.getLatLng?.();
        if (ll) void describe(ll.lat, ll.lng);
      });
      pinRef.current = marker;
    } else {
      pinRef.current.setLatLng([lat, lng]);
    }
    if (fly) map.flyTo?.([lat, lng], Math.max(map.getZoom?.() ?? 15, 16), { duration: 0.5 }) ?? map.setView([lat, lng], 16);
    void describe(lat, lng, name);
  };

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let dead = false;
    void (async () => {
      try {
        const L = await loadWumpGl();
        if (dead || !wrapRef.current) return;
        LRef.current = L;
        const center: [number, number] = initial ? [initial.lat, initial.lng] : [47.4979, 19.0402];
        const { map } = await newWumpGlMap(wrapRef.current, center, initial ? 15 : 3, "streets");
        if (dead) {
          map.remove();
          return;
        }
        mapRef.current = map;
        const placeAt = (lat: number, lng: number) => drop(lat, lng);
        map.on("click", (e) => placeAt(e.latlng.lat, e.latlng.lng));
        map.on("longpress", (e) => placeAt(e.latlng.lat, e.latlng.lng));
        if (initial) drop(initial.lat, initial.lng, initial.name, false);
        requestAnimationFrame(() => map.invalidateSize());
      } catch (e) {
        if (!dead) setErr(e instanceof Error ? e.message : "Map failed to load");
      }
    })();
    void loadRecents().then((rows) => {
      if (!dead) setRecent(rows);
    });
    return () => {
      dead = true;
      pinRef.current?.remove();
      pinRef.current = null;
      try {
        mapRef.current?.remove();
      } catch {
        /* already gone */
      }
      mapRef.current = null;
    };
    // mount once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const v = q.trim();
    if (v.length < 2) {
      setResults([]);
      return;
    }
    const t = window.setTimeout(() => {
      setBusy(true);
      const c = mapRef.current?.getCenter?.();
      void searchPlaces(v, c ? [c.lat, c.lng] : null)
        .then(setResults)
        .catch((e: Error) => setErr(e.message))
        .finally(() => setBusy(false));
    }, 420);
    return () => window.clearTimeout(t);
  }, [q]);

  const choose = (hit: { name: string; lat: number; lng: number; address?: string | null; query?: string }) => {
    setOpen(false);
    setQ("");
    drop(hit.lat, hit.lng, hit.name, true);
    void rememberSearch({ query: hit.query || hit.name, name: hit.name, lat: hit.lat, lng: hit.lng }).then(setRecent);
  };

  const useMine = async () => {
    setLocating(true);
    setErr(null);
    try {
      const loc = await getDeviceLocation({ highAccuracy: true });
      drop(loc.lat, loc.lng, null, true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Location unavailable");
    }
    setLocating(false);
  };

  return (
    <div className={cn("overflow-hidden rounded-2xl bg-slate-950 text-white shadow-2xl ring-1 ring-white/10", className)}>
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <MapPin className="size-4 text-sky-300" />
        <div className="min-w-0 flex-1 text-sm font-bold">Choose a place</div>
        {onCancel && (
          <button type="button" onClick={onCancel} className="grid size-8 place-items-center rounded-full text-white/70 hover:bg-white/10" aria-label="Close">
            <X className="size-4" />
          </button>
        )}
      </div>
      <div className="relative">
        <div className="absolute inset-x-2 top-2 z-10">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder="Search an address or place"
              className="h-10 w-full rounded-xl bg-white pr-9 pl-9 text-[16px] text-slate-900 outline-none sm:text-sm"
            />
            <button type="button" onClick={() => (setQ(""), setResults([]), setOpen(false))} className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center text-slate-400" aria-label="Clear search">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
            </button>
          </div>
          {open && (q.trim().length >= 2 ? results.length > 0 : recent.length > 0) && (
            <ul className="mt-1 max-h-40 overflow-y-auto rounded-xl bg-white py-1 text-slate-800 shadow-xl">
              {q.trim().length < 2
                ? recent.map((r) => (
                    <li key={`${r.query}-${r.at}`}>
                      <button
                        type="button"
                        className="block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                        onClick={() => (r.lat != null && r.lng != null ? choose({ name: r.name || r.query, lat: r.lat, lng: r.lng, query: r.query }) : setQ(r.query))}
                      >
                        {r.name || r.query}
                      </button>
                    </li>
                  ))
                : results.map((r) => (
                    <li key={r.id}>
                      <button type="button" className="block w-full px-3 py-1.5 text-left hover:bg-slate-50" onClick={() => choose({ ...r, query: q.trim() })}>
                        <span className="block truncate text-sm font-semibold">{r.name}</span>
                        <span className="block truncate text-[11px] text-slate-500">{r.address}</span>
                      </button>
                    </li>
                  ))}
            </ul>
          )}
        </div>
        <div ref={wrapRef} className="h-64 bg-slate-800" />
        <button
          type="button"
          onClick={() => void useMine()}
          disabled={locating}
          className="absolute bottom-2 left-2 z-10 inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-800 shadow disabled:opacity-60"
        >
          {locating ? <Loader2 className="size-3.5 animate-spin" /> : <LocateFixed className="size-3.5" />} Use my location
        </button>
      </div>
      <div className="space-y-2 px-3 py-3">
        <div className="min-h-8 text-sm">
          <div className="truncate font-semibold">{place?.name || "Tap the map to drop a pin"}</div>
          {place?.address && <div className="truncate text-[11px] text-white/60">{place.address}</div>}
          {err && <div className="text-[11px] text-rose-300">{err}</div>}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!place}
            onClick={() => place && void onPick(place)}
            className="flex-1 rounded-xl bg-sky-500 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {confirmLabel}
          </button>
          {extra && (
            <button type="button" disabled={!place} onClick={() => place && void extra.onPress(place)} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold disabled:opacity-40">
              {extra.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
