/** Pure routing helpers shared by /api/wump/route and the client. No secrets, no I/O. */

export type RouteMode = "walk" | "bike" | "drive";
export type RouteProvider = "osrm" | "ors" | "valhalla";
export type LatLng = [number, number];

export function pickRouteProvider(env: { ors?: string; valhalla?: string }): RouteProvider {
  if (env.ors?.trim()) return "ors";
  if (env.valhalla?.trim()) return "valhalla";
  return "osrm";
}

export function parseLatLngPair(v: string | null | undefined): LatLng | null {
  if (!v) return null;
  const [a, b] = v.split(",").map(Number);
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  return [a, b];
}

/** `lat,lng|lat,lng` or `lat,lng;lat,lng`, capped so public routers stay small. */
export function parseVia(v: string | null | undefined, limit = 6): LatLng[] {
  if (!v) return [];
  const bits = v.split(/[|;]/).map((s) => s.trim()).filter(Boolean);
  const out: LatLng[] = [];
  for (const bit of bits) {
    const p = parseLatLngPair(bit);
    if (p) out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

/** Origin, optional stops, destination. Drops duplicates that sit on the previous point. */
export function routeStops(from: LatLng, to: LatLng, via: LatLng[]): LatLng[] {
  const all = [from, ...via, to];
  const out: LatLng[] = [];
  for (const p of all) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev[0] - p[0]) < 1e-6 && Math.abs(prev[1] - p[1]) < 1e-6) continue;
    out.push(p);
  }
  return out.slice(0, 8);
}

export function osrmProfile(mode: RouteMode): "driving" | "foot" | "bike" {
  if (mode === "bike") return "bike";
  if (mode === "walk") return "foot";
  return "driving";
}

/** Public OSRM-compatible bases. The foot/bike servers use the profile name `driving` in the path. */
export function osrmUrl(mode: RouteMode, stops: LatLng[]): string {
  const host =
    mode === "walk"
      ? "https://routing.openstreetmap.de/routed-foot/route/v1/driving"
      : mode === "bike"
        ? "https://routing.openstreetmap.de/routed-bike/route/v1/driving"
        : "https://router.project-osrm.org/route/v1/driving";
  const path = stops.map(([lat, lng]) => `${lng},${lat}`).join(";");
  return `${host}/${path}?overview=full&geometries=geojson&steps=true`;
}

export function orsProfile(mode: RouteMode): string {
  if (mode === "walk") return "foot-walking";
  if (mode === "bike") return "cycling-regular";
  return "driving-car";
}

export function valhallaCosting(mode: RouteMode): "pedestrian" | "bicycle" | "auto" {
  if (mode === "walk") return "pedestrian";
  if (mode === "bike") return "bicycle";
  return "auto";
}

export function valhallaEndpoint(base: string): string {
  const trimmed = base.trim().replace(/\/+$/, "");
  if (/\/route$/i.test(trimmed)) return trimmed;
  return `${trimmed}/route`;
}

/** Google-encoded polyline → [lat, lng][]. Valhalla uses precision 6. */
export function decodePolyline(encoded: string, precision = 5): LatLng[] {
  const factor = 10 ** precision;
  const out: LatLng[] = [];
  let lat = 0;
  let lng = 0;
  let i = 0;
  while (i < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte = 0;
    do {
      if (i >= encoded.length) return out;
      byte = encoded.charCodeAt(i++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      if (i >= encoded.length) return out;
      byte = encoded.charCodeAt(i++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    out.push([lat / factor, lng / factor]);
  }
  return out;
}

export function maneuverText(type: string, modifier?: string, name?: string): string {
  const dir = modifier ? modifier.replace("slight ", "slightly ").replace("sharp ", "sharp ") : "";
  const on = name ? ` onto ${name}` : "";
  switch (type) {
    case "depart":
      return `Head ${dir || "out"}${name ? ` on ${name}` : ""}`;
    case "arrive":
      return "Arrive at your destination";
    case "turn":
      return `Turn ${dir}${on}`.replace(/\s+/g, " ").trim();
    case "roundabout":
    case "rotary":
      return `Take the roundabout${on}`;
    case "merge":
      return `Merge ${dir}${on}`.trim();
    case "fork":
    case "end of road":
      return type === "fork" ? `Keep ${dir}${on}`.trim() : `At the end of the road turn ${dir}${on}`.trim();
    default:
      return `Continue${dir ? ` ${dir}` : ""}${on}`.trim();
  }
}

export function handoffUrl(opts: {
  to: LatLng;
  name: string;
  mode: RouteMode;
  from?: LatLng | null;
  via?: LatLng[];
  apple: boolean;
}): string {
  const travel = opts.mode === "walk" ? "walking" : opts.mode === "drive" ? "driving" : "bicycling";
  const flag = opts.mode === "walk" ? "w" : opts.mode === "drive" ? "d" : "c";
  if (opts.apple) {
    const u = new URL("https://maps.apple.com/");
    if (opts.from) u.searchParams.append("saddr", `${opts.from[0]},${opts.from[1]}`);
    for (const stop of opts.via ?? []) u.searchParams.append("daddr", `${stop[0]},${stop[1]}`);
    u.searchParams.append("daddr", `${opts.to[0]},${opts.to[1]}`);
    u.searchParams.set("q", opts.name);
    u.searchParams.set("dirflg", flag);
    return u.toString();
  }
  const u = new URL("https://www.google.com/maps/dir/");
  u.searchParams.set("api", "1");
  if (opts.from) u.searchParams.set("origin", `${opts.from[0]},${opts.from[1]}`);
  u.searchParams.set("destination", `${opts.to[0]},${opts.to[1]}`);
  u.searchParams.set("travelmode", travel);
  const via = (opts.via ?? []).map(([lat, lng]) => `${lat},${lng}`).join("|");
  if (via) u.searchParams.set("waypoints", via);
  return u.toString();
}
