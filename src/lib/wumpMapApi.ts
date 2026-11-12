"use client";

/** Client side of the Wump map API: place search, directions and nearby places (all via /api/wump/*). */
import type { WumpPoi, WumpRoute, WumpSearchResult } from "./wumpApi";
import { handoffUrl, type LatLng } from "./wumpRoutePlan";
export type { WumpPoi, WumpRoute, WumpSearchResult };

export const NEARBY_CATS = [
  { id: "coffee", label: "Coffee", emoji: "☕" },
  { id: "food", label: "Food", emoji: "🍔" },
  { id: "bars", label: "Bars", emoji: "🍸" },
  { id: "parks", label: "Parks", emoji: "🌳" },
  { id: "transit", label: "Transit", emoji: "🚉" },
  { id: "shops", label: "Shops", emoji: "🛍️" },
  { id: "music", label: "Music", emoji: "🎵" },
] as const;
export type NearbyCat = (typeof NEARBY_CATS)[number]["id"];

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url);
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error || "Map service is busy — try again");
  return j;
}
const ll = (c: [number, number]) => `${c[0].toFixed(6)},${c[1].toFixed(6)}`;

export const searchPlaces = (q: string, near?: [number, number] | null) =>
  get<{ results: WumpSearchResult[] }>(`/api/wump/search?q=${encodeURIComponent(q)}${near ? `&near=${ll(near)}` : ""}&lang=${(typeof navigator !== "undefined" ? navigator.language : "en").slice(0, 2)}`).then((j) => j.results);
export const getRoute = (from: [number, number], to: [number, number], mode: WumpRoute["mode"], via: [number, number][] = []) => {
  const stops = via.length ? `&via=${via.map(ll).join("|")}` : "";
  return get<WumpRoute>(`/api/wump/route?from=${ll(from)}&to=${ll(to)}&mode=${mode}${stops}`);
};

const etaCache = new Map<string, { at: number; min: number }>();
/** Road ETA in minutes. Coarse cache so a moving pin does not hammer the router. */
export async function routedEtaMinutes(from: [number, number], to: [number, number], mode: WumpRoute["mode"]) {
  const key = `${mode}|${from.map((n) => n.toFixed(3)).join(",")}|${to.map((n) => n.toFixed(3)).join(",")}`;
  const hit = etaCache.get(key);
  if (hit && Date.now() - hit.at < 3 * 60_000) return hit.min;
  const route = await getRoute(from, to, mode);
  const min = Math.max(1, Math.round(route.duration / 60));
  etaCache.set(key, { at: Date.now(), min });
  return min;
}
export const nearbyPlaces = (at: [number, number], cat: NearbyCat) => get<{ places: WumpPoi[] }>(`/api/wump/nearby?at=${ll(at)}&cat=${cat}`).then((j) => j.places);

export const fmtDuration = (s: number) => {
  const m = Math.round(s / 60);
  return m < 60 ? `${Math.max(1, m)} min` : `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim();
};
export const fmtDistance = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`);
/** Hand off to Apple Maps or Google Maps. This builds a directions URL; it does not scrape either service. */
export const externalMapsUrl = (to: LatLng, name: string, mode: WumpRoute["mode"], from?: LatLng | null, via?: LatLng[]) =>
  handoffUrl({
    to,
    name,
    mode,
    from,
    via,
    apple: typeof navigator !== "undefined" && /iPhone|iPad|Macintosh/.test(navigator.userAgent),
  });
