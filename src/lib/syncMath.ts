/** Shared timing and distance math for Listen Together, Wump headings, and Locator. */

export function driftedSeconds(positionS: number, updatedAt: string, playing: boolean, now = Date.now()) {
  const base = Number.isFinite(positionS) ? Math.max(0, positionS) : 0;
  if (!playing) return base;
  const elapsed = (now - Date.parse(updatedAt)) / 1000;
  if (!Number.isFinite(elapsed) || elapsed < 0) return base;
  return base + Math.min(elapsed, 20);
}

export function needsSeek(local: number, target: number, slack = 1.6) {
  if (!Number.isFinite(local) || !Number.isFinite(target)) return false;
  return Math.abs(local - target) > slack;
}

export function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000;
  const r = Math.PI / 180;
  const dLat = (bLat - aLat) * r;
  const dLng = (bLng - aLng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Walking pace when the device has no useful speed. */
export function etaMinutes(meters: number, speedMps: number | null) {
  if (!Number.isFinite(meters) || meters < 30) return 1;
  const speed = speedMps != null && speedMps > 0.5 ? speedMps : 1.4;
  return Math.max(1, Math.round(meters / speed / 60));
}

export function freshIso(iso: string | null | undefined, ms: number, now = Date.now()) {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && now - t < ms && now - t >= -5_000;
}
