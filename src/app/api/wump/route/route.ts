import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/apiGuard";
import { cacheGet, cacheSet } from "@/lib/serverCache";
import { getJson, wumpJson, type WumpRoute } from "@/lib/wumpApi";
import {
  decodePolyline,
  maneuverText,
  orsProfile,
  osrmUrl,
  parseLatLngPair,
  parseVia,
  pickRouteProvider,
  routeStops,
  valhallaCosting,
  valhallaEndpoint,
  type LatLng,
  type RouteMode,
  type RouteProvider,
} from "@/lib/wumpRoutePlan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Directions — GET /api/wump/route?from=lat,lng&to=lat,lng&mode=walk|bike|drive&via=lat,lng|lat,lng
 *
 * Provider (first match):
 *   OPENROUTESERVICE_API_KEY — OpenRouteService
 *   VALHALLA_URL             — Valhalla (optional VALHALLA_API_KEY bearer)
 *   otherwise the public OSRM demo / FOSSGIS foot & bike routers
 */

type Step = { text: string; distance: number };

function modeOf(v: string | null): RouteMode {
  return v === "bike" || v === "drive" ? v : "walk";
}

function envProvider(): RouteProvider {
  return pickRouteProvider({
    ors: process.env.OPENROUTESERVICE_API_KEY,
    valhalla: process.env.VALHALLA_URL,
  });
}

async function fromOsrm(stops: LatLng[], mode: RouteMode): Promise<{ distance: number; duration: number; coords: LatLng[]; steps: Step[] }> {
  type OsrmStep = { distance: number; name: string; maneuver: { type: string; modifier?: string } };
  type Osrm = { code: string; routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] }; legs: { steps: OsrmStep[] }[] }[] };
  const j = await getJson<Osrm>(osrmUrl(mode, stops), {}, 12_000);
  const r = j.routes?.[0];
  if (j.code !== "Ok" || !r) throw new Error("No route found between those points");
  return {
    distance: Math.round(r.distance),
    duration: Math.round(r.duration),
    coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as LatLng),
    steps: r.legs
      .flatMap((l) => l.steps)
      .filter((s) => s.distance > 0 || s.maneuver.type === "arrive")
      .slice(0, 60)
      .map((s) => ({ text: maneuverText(s.maneuver.type, s.maneuver.modifier, s.name), distance: Math.round(s.distance) })),
  };
}

async function fromOrs(stops: LatLng[], mode: RouteMode): Promise<{ distance: number; duration: number; coords: LatLng[]; steps: Step[] }> {
  const key = process.env.OPENROUTESERVICE_API_KEY || "";
  type Ors = {
    features?: {
      properties?: { summary?: { distance: number; duration: number }; segments?: { steps?: { distance: number; instruction?: string; name?: string }[] }[] };
      geometry?: { coordinates: [number, number][] };
    }[];
  };
  const j = await getJson<Ors>(
    `https://api.openrouteservice.org/v2/directions/${orsProfile(mode)}/geojson`,
    {
      method: "POST",
      headers: { Authorization: key, "Content-Type": "application/json" },
      body: JSON.stringify({ coordinates: stops.map(([lat, lng]) => [lng, lat]) }),
    },
    14_000,
  );
  const f = j.features?.[0];
  const summary = f?.properties?.summary;
  const coords = f?.geometry?.coordinates;
  if (!summary || !coords?.length) throw new Error("No route found between those points");
  const steps = (f.properties?.segments ?? [])
    .flatMap((seg) => seg.steps ?? [])
    .slice(0, 60)
    .map((s) => ({ text: s.instruction || (s.name ? `Continue on ${s.name}` : "Continue"), distance: Math.round(s.distance) }));
  return {
    distance: Math.round(summary.distance),
    duration: Math.round(summary.duration),
    coords: coords.map(([lng, lat]) => [lat, lng] as LatLng),
    steps,
  };
}

async function fromValhalla(stops: LatLng[], mode: RouteMode): Promise<{ distance: number; duration: number; coords: LatLng[]; steps: Step[] }> {
  const base = process.env.VALHALLA_URL || "";
  const key = process.env.VALHALLA_API_KEY || "";
  type Val = {
    trip?: {
      summary?: { length: number; time: number };
      legs?: { shape?: string; maneuvers?: { instruction?: string; length?: number }[] }[];
    };
  };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key) headers.Authorization = `Bearer ${key}`;
  const j = await getJson<Val>(
    valhallaEndpoint(base),
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        locations: stops.map(([lat, lng]) => ({ lat, lon: lng })),
        costing: valhallaCosting(mode),
        units: "kilometers",
      }),
    },
    14_000,
  );
  const trip = j.trip;
  if (!trip?.summary || !trip.legs?.length) throw new Error("No route found between those points");
  const coords = trip.legs.flatMap((leg) => (leg.shape ? decodePolyline(leg.shape, 6) : []));
  const steps = trip.legs
    .flatMap((leg) => leg.maneuvers ?? [])
    .slice(0, 60)
    .map((m) => ({ text: m.instruction || "Continue", distance: Math.round((m.length ?? 0) * 1000) }));
  if (coords.length < 2) throw new Error("No route found between those points");
  return {
    distance: Math.round(trip.summary.length * 1000),
    duration: Math.round(trip.summary.time),
    coords,
    steps,
  };
}

export async function GET(req: NextRequest) {
  const limited = rateLimit(req, "wump-route", 30, 60_000);
  if (limited) return limited;
  const from = parseLatLngPair(req.nextUrl.searchParams.get("from"));
  const to = parseLatLngPair(req.nextUrl.searchParams.get("to"));
  const mode = modeOf(req.nextUrl.searchParams.get("mode"));
  const via = parseVia(req.nextUrl.searchParams.get("via"));
  if (!from || !to) return wumpJson({ error: "from and to must be lat,lng" }, 400);
  const stops = routeStops(from, to, via);
  if (stops.length < 2) return wumpJson({ error: "Pick two different points" }, 400);
  const provider = envProvider();
  const key = `${provider}|${mode}|${stops.map((p) => p.map((n) => n.toFixed(4)).join(",")).join(";")}`;
  const hit = cacheGet<WumpRoute>("wump-route", key, 10 * 60_000);
  if (hit) return wumpJson(hit, 200, 120);
  try {
    const built = provider === "ors" ? await fromOrs(stops, mode) : provider === "valhalla" ? await fromValhalla(stops, mode) : await fromOsrm(stops, mode);
    const out: WumpRoute = { mode, provider, ...built };
    cacheSet("wump-route", key, out);
    return wumpJson(out, 200, 120);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/No route/.test(msg)) return wumpJson({ error: msg }, 404);
    return wumpJson({ error: "Directions are busy — try again" }, 502);
  }
}
