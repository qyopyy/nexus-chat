import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/apiGuard";
import { cacheGet, cacheSet } from "@/lib/serverCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reverse geocode for Wump Live pins — web deploys update IPAs (Capacitor loads the site). */
export type WumpGeocode = {
  ok: boolean;
  name: string | null;
  locality: string | null;
  city: string | null;
  country: string | null;
  display: string | null;
  source: string;
};

const CACHE = "wump-geocode";
const TTL = 6 * 60 * 60_000;
const UA = "NexusWump/1.0 (https://nexusproject.cc; wump-map@nexusproject.cc)";

function json(body: WumpGeocode | { error: string }, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function roundKey(lat: number, lng: number) {
  // ~100 m grid — matches approx precision; avoids hammering geocoders
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

async function fromNominatim(lat: number, lng: number): Promise<WumpGeocode | null> {
  const u = new URL("https://nominatim.openstreetmap.org/reverse");
  u.searchParams.set("format", "jsonv2");
  u.searchParams.set("lat", String(lat));
  u.searchParams.set("lon", String(lng));
  u.searchParams.set("zoom", "18");
  u.searchParams.set("addressdetails", "1");
  const ctrl = AbortSignal.timeout(8_000);
  const res = await fetch(u.toString(), {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: ctrl,
    next: { revalidate: 3600 },
  });
  if (!res.ok) return null;
  const j = (await res.json()) as {
    name?: string;
    display_name?: string;
    address?: Record<string, string>;
  };
  const a = j.address || {};
  const road = a.road || a.pedestrian || a.footway || a.path || a.neighbourhood || a.suburb;
  const poi = j.name && j.name !== road ? j.name : a.amenity || a.shop || a.tourism || a.building || null;
  const city = a.city || a.town || a.village || a.municipality || a.county || null;
  const locality = a.suburb || a.neighbourhood || a.city_district || city;
  const name = poi || road || locality || city || null;
  const display = [name, city && name !== city ? city : null, a.country].filter(Boolean).join(", ") || j.display_name || null;
  return {
    ok: true,
    name,
    locality,
    city,
    country: a.country || null,
    display: display ? display.slice(0, 160) : null,
    source: "nominatim",
  };
}

async function fromBigDataCloud(lat: number, lng: number): Promise<WumpGeocode | null> {
  const u = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
  const res = await fetch(u, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) return null;
  const j = (await res.json()) as {
    locality?: string;
    city?: string;
    principalSubdivision?: string;
    countryName?: string;
    localityInfo?: { informative?: { name?: string }[] };
  };
  const informative = j.localityInfo?.informative?.map((x) => x.name).filter(Boolean) ?? [];
  const name = j.locality || informative[0] || j.city || j.principalSubdivision || null;
  const city = j.city || j.principalSubdivision || null;
  const display = [name, city && name !== city ? city : null, j.countryName].filter(Boolean).join(", ") || null;
  return {
    ok: true,
    name,
    locality: j.locality || city,
    city,
    country: j.countryName || null,
    display,
    source: "bigdatacloud",
  };
}

export async function GET(req: NextRequest) {
  const limited = rateLimit(req, "wump-geocode", 60, 60_000);
  if (limited) return limited;
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return json({ error: "Invalid coordinates" }, 400);
  }

  const key = roundKey(lat, lng);
  const cached = cacheGet<WumpGeocode>(CACHE, key, TTL);
  if (cached?.ok) return json(cached);

  let out: WumpGeocode | null = null;
  try {
    out = await fromNominatim(lat, lng);
  } catch {
    /* try fallback */
  }
  if (!out?.display) {
    try {
      out = await fromBigDataCloud(lat, lng);
    } catch {
      /* ignore */
    }
  }
  if (!out?.ok) {
    return json({ ok: false, name: null, locality: null, city: null, country: null, display: null, source: "none" });
  }
  cacheSet(CACHE, key, out);
  return json(out);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
