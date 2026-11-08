import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/apiGuard";
import { cacheGet, cacheSet } from "@/lib/serverCache";
import { coord, wumpJson, WUMP_UA, type WumpPoi } from "@/lib/wumpApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** OSM tag filters per category (Overpass QL) */
const CATS: Record<string, { label: string; q: string[] }> = {
  coffee: { label: "Coffee", q: ['nwr["amenity"="cafe"]'] },
  food: { label: "Food", q: ['nwr["amenity"~"^(restaurant|fast_food)$"]'] },
  bars: { label: "Bars", q: ['nwr["amenity"~"^(bar|pub|nightclub)$"]'] },
  parks: { label: "Parks", q: ['nwr["leisure"~"^(park|garden)$"]["name"]'] },
  transit: { label: "Transit", q: ['nwr["public_transport"="station"]', 'nwr["railway"~"^(station|subway_entrance|tram_stop)$"]'] },
  shops: { label: "Shops", q: ['nwr["shop"~"^(supermarket|convenience|mall|clothes)$"]'] },
  music: { label: "Music", q: ['nwr["amenity"~"^(music_venue|nightclub)$"]', 'nwr["shop"="music"]'] },
};
const NEARBY_CATS = Object.entries(CATS).map(([id, c]) => ({ id, label: c.label }));

type OverpassEl = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

/** Nearby places — GET /api/wump/nearby?at=lat,lng&cat=coffee (OpenStreetMap via Overpass, 1.2 km radius) */
export async function GET(req: NextRequest) {
  const limited = rateLimit(req, "wump-nearby", 20, 60_000);
  if (limited) return limited;
  const at = coord(req.nextUrl.searchParams.get("at"));
  const cat = req.nextUrl.searchParams.get("cat") ?? "";
  if (!at || !CATS[cat]) return wumpJson({ error: "at=lat,lng and a known cat are required", cats: NEARBY_CATS }, 400);
  const key = `${cat}|${at.map((n) => n.toFixed(3))}`;
  const hit = cacheGet<WumpPoi[]>("wump-nearby", key, 30 * 60_000);
  if (hit) return wumpJson({ places: hit }, 200, 900);
  const around = `(around:1200,${at[0]},${at[1]})`;
  const ql = `[out:json][timeout:12];(${CATS[cat].q.map((q) => `${q}${around};`).join("")});out center tags 40;`;
  try {
    const r = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "User-Agent": WUMP_UA, "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(ql)}`,
      signal: AbortSignal.timeout(14_000),
    });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { elements?: OverpassEl[] };
    const places: WumpPoi[] = (j.elements ?? [])
      .map((e): WumpPoi | null => {
        const lat = e.lat ?? e.center?.lat;
        const lng = e.lon ?? e.center?.lon;
        const t = e.tags ?? {};
        if (lat == null || lng == null || !t.name) return null;
        const addr = [[t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" "), t["addr:city"]].filter(Boolean).join(", ") || null;
        const site = t.website || t["contact:website"] || null;
        return { id: `${e.type[0]}${e.id}`, name: t.name, kind: String(t.amenity || t.leisure || t.shop || t.railway || t.public_transport || cat).replace(/_/g, " "), lat, lng, address: addr, open: t.opening_hours ?? null, website: site && /^https?:\/\//.test(site) ? site : null };
      })
      .filter((x): x is WumpPoi => !!x)
      .slice(0, 40);
    cacheSet("wump-nearby", key, places);
    return wumpJson({ places }, 200, 900);
  } catch {
    return wumpJson({ places: [], error: "Nearby search is busy — try again in a minute" }, 502);
  }
}
