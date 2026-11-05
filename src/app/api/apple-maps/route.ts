import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/apiGuard";
import { cacheGet, cacheSet } from "@/lib/serverCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 30 * 60_000;
const CACHE = "apple-maps";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

export type AppleMapsPlace = {
  url: string;
  finalUrl: string;
  name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  image: string | null;
  source: string;
};

function json(body: AppleMapsPlace | { error: string }, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function meta(html: string, key: string): string | null {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${esc}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["']${esc}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1].trim());
  }
  return null;
}

function isAppleMapsHost(hostname: string) {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  return h === "maps.apple.com" || h.endsWith(".maps.apple.com") || h === "apple.com" || h.endsWith(".apple.com");
}

function parseLl(raw: string | null | undefined): { lat: number; lng: number } | null {
  if (!raw) return null;
  const m = String(raw).match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function coordsFromHtml(html: string, url: URL): { lat: number; lng: number } | null {
  const fromQuery =
    parseLl(url.searchParams.get("ll")) ||
    parseLl(url.searchParams.get("sll")) ||
    parseLl(url.searchParams.get("center"));
  if (fromQuery) return fromQuery;

  const geo = meta(html, "geo.position") || meta(html, "icbm");
  if (geo) {
    const p = parseLl(geo.replace(/;/g, ","));
    if (p) return p;
  }

  const placeJson = html.match(/"coordinate"\s*:\s*\{\s*"latitude"\s*:\s*(-?\d+(?:\.\d+)?)\s*,\s*"longitude"\s*:\s*(-?\d+(?:\.\d+)?)/i);
  if (placeJson) {
    const lat = Number(placeJson[1]);
    const lng = Number(placeJson[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  const latLng = html.match(/"latitude"\s*:\s*(-?\d+(?:\.\d+)?)[^}]{0,80}"longitude"\s*:\s*(-?\d+(?:\.\d+)?)/i);
  if (latLng) {
    const lat = Number(latLng[1]);
    const lng = Number(latLng[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  return null;
}

function parsePlace(url: string, finalUrl: string, html: string): AppleMapsPlace {
  const u = new URL(finalUrl);
  const name =
    meta(html, "og:title") ||
    meta(html, "twitter:title") ||
    meta(html, "apple:title") ||
    (() => {
      const m = html.match(/<title[^>]*>([^<]{1,300})<\/title>/i);
      return m ? decodeEntities(m[1].trim()) : null;
    })();
  const description =
    meta(html, "og:description") ||
    meta(html, "twitter:description") ||
    meta(html, "description");
  const image = meta(html, "og:image") || meta(html, "twitter:image");
  const coords = coordsFromHtml(html, u);
  const q = u.searchParams.get("q") || u.searchParams.get("address");

  let cleanName = name?.replace(/\s*[·|].*Apple\s*Maps.*$/i, "").replace(/\s+on\s+Apple\s+Maps$/i, "").trim() || null;
  if (cleanName && /^(Apple\s*Maps|Maps)$/i.test(cleanName)) cleanName = q ? decodeURIComponent(q) : null;

  let address = description;
  if (address && cleanName && address.toLowerCase().startsWith(cleanName.toLowerCase())) {
    address = address.slice(cleanName.length).replace(/^[\s,·\-–—]+/, "").trim() || address;
  }
  if (!address && q && q !== cleanName) address = decodeURIComponent(q);

  return {
    url,
    finalUrl,
    name: cleanName || (q ? decodeURIComponent(q) : null),
    address: address || null,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    image: image || null,
    source: "apple-maps-scrape",
  };
}

async function fetchHtml(target: string): Promise<{ finalUrl: string; html: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(target, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    return { finalUrl: r.url || target, html };
  } finally {
    clearTimeout(t);
  }
}

function buildAppleUrl(input: { url?: string | null; lat?: number | null; lng?: number | null; q?: string | null }) {
  if (input.url) {
    const u = new URL(input.url);
    if (!isAppleMapsHost(u.hostname) && !u.hostname.includes("apple.com")) {
      throw new Error("Only maps.apple.com links are supported");
    }
    // Normalize share hosts → maps.apple.com when possible
    if (u.hostname === "apple.com" || u.hostname.endsWith(".apple.com")) {
      if (!u.pathname.includes("maps") && !u.searchParams.has("ll") && !u.searchParams.has("q")) {
        throw new Error("Not an Apple Maps place link");
      }
    }
    return u.toString();
  }
  if (input.lat != null && input.lng != null && Number.isFinite(input.lat) && Number.isFinite(input.lng)) {
    const u = new URL("https://maps.apple.com/");
    u.searchParams.set("ll", `${input.lat},${input.lng}`);
    u.searchParams.set("q", input.q?.trim() || `${input.lat},${input.lng}`);
    return u.toString();
  }
  if (input.q?.trim()) {
    const u = new URL("https://maps.apple.com/");
    u.searchParams.set("q", input.q.trim());
    return u.toString();
  }
  throw new Error("Pass url, q, or lat+lng");
}

export async function GET(req: NextRequest) {
  const limited = rateLimit(req, "apple-maps", 40, 60_000);
  if (limited) return limited;

  const sp = req.nextUrl.searchParams;
  const urlParam = sp.get("url");
  const q = sp.get("q");
  const lat = sp.get("lat") != null ? Number(sp.get("lat")) : null;
  const lng = sp.get("lng") != null ? Number(sp.get("lng")) : null;

  let target: string;
  try {
    target = buildAppleUrl({ url: urlParam, lat, lng, q });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "bad request" }, 400);
  }

  const cached = cacheGet<AppleMapsPlace>(CACHE, target, CACHE_TTL_MS);
  if (cached) return json(cached);

  try {
    const { finalUrl, html } = await fetchHtml(target);
    const place = parsePlace(target, finalUrl, html);
    // If scrape got a name-less pin, keep coords from request
    if (place.lat == null && lat != null && lng != null) {
      place.lat = lat;
      place.lng = lng;
    }
    cacheSet(CACHE, target, place);
    return json(place);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "scrape failed" }, 502);
  }
}
