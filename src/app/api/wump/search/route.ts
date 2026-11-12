import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/apiGuard";
import { cacheGet, cacheSet } from "@/lib/serverCache";
import { coord, getJson, wumpJson, type WumpSearchResult } from "@/lib/wumpApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PhotonFeature = { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> & { osm_id?: number; osm_type?: string } };

/** Place search for Wump — GET /api/wump/search?q=coffee&near=47.49,19.04 (Photon / OpenStreetMap, no key). */
export async function GET(req: NextRequest) {
  const limited = rateLimit(req, "wump-search", 60, 60_000);
  if (limited) return limited;
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 2) return wumpJson({ results: [] });
  const near = coord(req.nextUrl.searchParams.get("near"));
  const lang = (req.nextUrl.searchParams.get("lang") ?? "en").replace(/[^a-z]/gi, "").slice(0, 2) || "en";
  const key = `${q.toLowerCase()}|${near ? near.map((n) => n.toFixed(2)).join(",") : ""}|${lang}`;
  const hit = cacheGet<WumpSearchResult[]>("wump-search", key, 30 * 60_000);
  if (hit) return wumpJson({ results: hit });

  const maptiler = process.env.MAPTILER_API_KEY || process.env.NEXT_PUBLIC_MAPTILER_KEY || "";
  if (maptiler) {
    try {
      const mu = new URL(`https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json`);
      mu.searchParams.set("key", maptiler);
      mu.searchParams.set("limit", "8");
      mu.searchParams.set("language", lang);
      if (near) mu.searchParams.set("proximity", `${near[1]},${near[0]}`);
      type Mt = { features?: { id?: string; text?: string; place_name?: string; center?: [number, number]; properties?: { category?: string } }[] };
      const j = await getJson<Mt>(mu.toString());
      const results: WumpSearchResult[] = (j.features ?? []).flatMap((f) => {
        const [lng, lat] = f.center ?? [];
        if (lat == null || lng == null) return [];
        return [{ id: String(f.id ?? `${lat},${lng}`), name: f.text || q, address: f.place_name || null, kind: f.properties?.category ?? null, lat, lng }];
      });
      cacheSet("wump-search", key, results);
      return wumpJson({ results });
    } catch {
      /* Photon below */
    }
  }

  const u = new URL("https://photon.komoot.io/api/");
  u.searchParams.set("q", q);
  u.searchParams.set("limit", "8");
  if (["en", "de", "fr", "it"].includes(lang)) u.searchParams.set("lang", lang);
  if (near) {
    u.searchParams.set("lat", String(near[0]));
    u.searchParams.set("lon", String(near[1]));
  }
  try {
    const j = await getJson<{ features?: PhotonFeature[] }>(u.toString());
    const results: WumpSearchResult[] = (j.features ?? []).map((f) => {
      const p = f.properties;
      const [lng, lat] = f.geometry.coordinates;
      const street = [p.street, p.housenumber].filter(Boolean).join(" ");
      const address = [street || null, p.postcode && p.city ? `${p.postcode} ${p.city}` : p.city || p.district || p.county, p.country].filter(Boolean).join(", ") || null;
      return { id: `${p.osm_type ?? "x"}${p.osm_id ?? `${lat},${lng}`}`, name: p.name || street || p.city || q, address, kind: p.osm_value?.replace(/_/g, " ") ?? null, lat, lng };
    });
    cacheSet("wump-search", key, results);
    return wumpJson({ results });
  } catch {
    return wumpJson({ results: [], error: "Search is busy — try again" }, 502);
  }
}
