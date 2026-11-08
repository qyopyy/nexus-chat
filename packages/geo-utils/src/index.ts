/** Small geo helpers used by Wump (Nexus). Zero dependencies. */
export type LatLng = [lat: number, lng: number];
export type TravelMode = "walk" | "bike" | "drive";

/** Great-circle distance in metres (haversine). */
export function metersBetween(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r;
  const dLng = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "47.49,19.04" → [47.49, 19.04]; null when malformed or out of range. */
export function parseLatLng(v: string | null | undefined): LatLng | null {
  if (!v) return null;
  const [a, b] = v.split(",").map(Number);
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  return [a, b];
}

/** 340 → "340 m", 1234 → "1.2 km", 23456 → "23 km" */
export const fmtDistance = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`);

/** seconds → "4 min" / "1 h 20 min" */
export function fmtDuration(s: number) {
  const m = Math.max(1, Math.round(s / 60));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
}

/** 0–360° → "N", "NE", … */
export function compass(deg: number) {
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

/** Directions link that opens Apple Maps on Apple devices and Google Maps elsewhere. */
export function directionsUrl(to: LatLng, name: string, mode: TravelMode = "walk", apple = typeof navigator !== "undefined" && /iPhone|iPad|Macintosh/.test(navigator.userAgent)) {
  const flag = mode === "walk" ? "w" : mode === "drive" ? "d" : "c";
  return apple
    ? `https://maps.apple.com/?daddr=${to[0]},${to[1]}&q=${encodeURIComponent(name)}&dirflg=${flag}`
    : `https://www.google.com/maps/dir/?api=1&destination=${to[0]},${to[1]}&travelmode=${mode === "walk" ? "walking" : mode === "drive" ? "driving" : "bicycling"}`;
}

/** Round a coordinate to a privacy-friendly grid (default ≈ 110 m). */
export function fuzz([lat, lng]: LatLng, decimals = 3): LatLng {
  const f = 10 ** decimals;
  return [Math.round(lat * f) / f, Math.round(lng * f) / f];
}
