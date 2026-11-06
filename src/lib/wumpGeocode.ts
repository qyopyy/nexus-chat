"use client";

/** Client helper for Wump reverse geocode (hits /api/wump/geocode — no IPA rebuild). */

export type WumpPlace = {
  name: string | null;
  locality: string | null;
  city: string | null;
  country: string | null;
  display: string | null;
};

const mem = new Map<string, { at: number; place: WumpPlace }>();
const MEM_TTL = 30 * 60_000;

function key(lat: number, lng: number) {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

export async function wumpGeocode(lat: number, lng: number): Promise<WumpPlace | null> {
  const k = key(lat, lng);
  const hit = mem.get(k);
  if (hit && Date.now() - hit.at < MEM_TTL) return hit.place;
  try {
    const res = await fetch(`/api/wump/geocode?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`, {
      cache: "force-cache",
    });
    if (!res.ok) return null;
    const j = (await res.json()) as WumpPlace & { ok?: boolean };
    if (!j?.display && !j?.name) return null;
    const place: WumpPlace = {
      name: j.name ?? null,
      locality: j.locality ?? null,
      city: j.city ?? null,
      country: j.country ?? null,
      display: j.display ?? j.name ?? null,
    };
    mem.set(k, { at: Date.now(), place });
    return place;
  } catch {
    return null;
  }
}

/** Short label for map chips: "Andrássy út" or "Budapest" */
export function wumpPlaceShort(p: WumpPlace | null | undefined) {
  if (!p) return null;
  return p.name || p.locality || p.city || p.display || null;
}
