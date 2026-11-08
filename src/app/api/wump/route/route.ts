import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/apiGuard";
import { cacheGet, cacheSet } from "@/lib/serverCache";
import { coord, getJson, wumpJson, type WumpRoute } from "@/lib/wumpApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// OSRM (OpenStreetMap routing) — walking/cycling via routing.openstreetmap.de, driving via the OSRM demo server
const HOSTS = { walk: "https://routing.openstreetmap.de/routed-foot/route/v1/driving", bike: "https://routing.openstreetmap.de/routed-bike/route/v1/driving", drive: "https://router.project-osrm.org/route/v1/driving" } as const;

type OsrmStep = { distance: number; name: string; maneuver: { type: string; modifier?: string } };
type Osrm = { code: string; routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] }; legs: { steps: OsrmStep[] }[] }[] };

const say = (s: OsrmStep) => {
  const m = s.maneuver;
  const dir = m.modifier ? m.modifier.replace("slight ", "slightly ").replace("sharp ", "sharp ") : "";
  const on = s.name ? ` onto ${s.name}` : "";
  switch (m.type) {
    case "depart": return `Head ${dir || "out"}${s.name ? ` on ${s.name}` : ""}`;
    case "arrive": return "Arrive at your destination";
    case "turn": return `Turn ${dir}${on}`;
    case "roundabout": case "rotary": return `Take the roundabout${on}`;
    case "merge": return `Merge ${dir}${on}`;
    case "fork": return `Keep ${dir}${on}`;
    case "end of road": return `At the end of the road turn ${dir}${on}`;
    default: return `Continue${dir ? ` ${dir}` : ""}${on}`;
  }
};

/** Directions — GET /api/wump/route?from=lat,lng&to=lat,lng&mode=walk|bike|drive */
export async function GET(req: NextRequest) {
  const limited = rateLimit(req, "wump-route", 30, 60_000);
  if (limited) return limited;
  const from = coord(req.nextUrl.searchParams.get("from"));
  const to = coord(req.nextUrl.searchParams.get("to"));
  const m = req.nextUrl.searchParams.get("mode");
  const mode: WumpRoute["mode"] = m === "bike" || m === "drive" ? m : "walk";
  if (!from || !to) return wumpJson({ error: "from and to must be lat,lng" }, 400);
  const key = `${mode}|${from.map((n) => n.toFixed(4))}|${to.map((n) => n.toFixed(4))}`;
  const hit = cacheGet<WumpRoute>("wump-route", key, 10 * 60_000);
  if (hit) return wumpJson(hit, 200, 120);
  try {
    const j = await getJson<Osrm>(`${HOSTS[mode]}/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson&steps=true`, {}, 12_000);
    const r = j.routes?.[0];
    if (j.code !== "Ok" || !r) return wumpJson({ error: "No route found between those points" }, 404);
    const out: WumpRoute = {
      mode,
      distance: Math.round(r.distance),
      duration: Math.round(r.duration),
      coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
      steps: r.legs.flatMap((l) => l.steps).filter((s) => s.distance > 0 || s.maneuver.type === "arrive").slice(0, 60).map((s) => ({ text: say(s), distance: Math.round(s.distance) })),
    };
    cacheSet("wump-route", key, out);
    return wumpJson(out, 200, 120);
  } catch {
    return wumpJson({ error: "Directions are busy — try again" }, 502);
  }
}
