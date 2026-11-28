// Nexus Drop for Snap (pure helpers, no DOM, no network). The network half is snapDropNet.ts.
//
// Sending uses the existing Nexus Drop cloud inbox (nexusDrop.ts: private bucket + `nexus_drops` table, the same
// inbox the Phone Link panel shows), so a Snap lands wherever the person already receives Drops. On top of that:
//  - "Nearby": people who switch it on join a realtime room named after their ~1 km map cell (a geohash). Everyone
//    also listens to the 8 cells around, so people either side of a cell edge still see each other. Nearby only
//    discovers people; it never carries files.
//  - If the Drop can't be delivered (too big, inbox unavailable), the Snap goes into their DM as a normal attachment.

const B32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/** Standard geohash. precision 6 ≈ 1.2 km × 0.6 km. */
export function geohashEncode(lat: number, lng: number, precision = 6): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("bad coordinates");
  const la = Math.max(-90, Math.min(90, lat));
  const lo = ((((lng + 180) % 360) + 360) % 360) - 180;
  let latLo = -90, latHi = 90, lngLo = -180, lngHi = 180;
  let hash = "";
  let bits = 0;
  let ch = 0;
  let even = true;
  while (hash.length < precision) {
    if (even) {
      const mid = (lngLo + lngHi) / 2;
      if (lo >= mid) {
        ch = (ch << 1) | 1;
        lngLo = mid;
      } else {
        ch <<= 1;
        lngHi = mid;
      }
    } else {
      const mid = (latLo + latHi) / 2;
      if (la >= mid) {
        ch = (ch << 1) | 1;
        latLo = mid;
      } else {
        ch <<= 1;
        latHi = mid;
      }
    }
    even = !even;
    if (++bits === 5) {
      hash += B32[ch];
      bits = 0;
      ch = 0;
    }
  }
  return hash;
}

/** Centre and size (degrees) of a geohash cell. */
export function geohashBox(hash: string): { lat: number; lng: number; dLat: number; dLng: number } {
  let latLo = -90, latHi = 90, lngLo = -180, lngHi = 180;
  let even = true;
  for (const c of hash) {
    const v = B32.indexOf(c);
    if (v < 0) throw new Error("bad geohash");
    for (let b = 4; b >= 0; b--) {
      const bit = (v >> b) & 1;
      if (even) {
        const mid = (lngLo + lngHi) / 2;
        if (bit) lngLo = mid;
        else lngHi = mid;
      } else {
        const mid = (latLo + latHi) / 2;
        if (bit) latLo = mid;
        else latHi = mid;
      }
      even = !even;
    }
  }
  return { lat: (latLo + latHi) / 2, lng: (lngLo + lngHi) / 2, dLat: latHi - latLo, dLng: lngHi - lngLo };
}

/** The cell itself first, then up to 8 neighbours (fewer at the poles). No duplicates. */
export function geohashAround(hash: string): string[] {
  const b = geohashBox(hash);
  const out = [hash];
  for (const dy of [-1, 0, 1]) {
    for (const dx of [-1, 0, 1]) {
      if (!dx && !dy) continue;
      const lat = b.lat + dy * b.dLat;
      if (lat > 90 || lat < -90) continue;
      const h = geohashEncode(lat, b.lng + dx * b.dLng, hash.length);
      if (!out.includes(h)) out.push(h);
    }
  }
  return out;
}

export const DROP_PRECISION = 6;
export const dropCell = (lat: number, lng: number) => geohashEncode(lat, lng, DROP_PRECISION);
export const cellTopic = (cell: string) => `snap-drop:${cell}`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === "string" && UUID.test(s);

const clean = (s: unknown, max: number) =>
  typeof s === "string"
    ? s
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim()
        .slice(0, max)
    : "";

export type NearbyPerson = { id: string; username: string; name: string; avatar: string | null };

/** Presence payloads from all the cells → one list: valid, de-duplicated, minus yourself, sorted by name. */
export function nearbyFromPresence(states: unknown[], me: string | null): NearbyPerson[] {
  const seen = new Map<string, NearbyPerson>();
  for (const s of states) {
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    if (!isUuid(o.id) || o.id === me) continue;
    const username = clean(o.username, 40);
    if (!username) continue;
    seen.set(o.id, { id: o.id, username, name: clean(o.name, 60) || username, avatar: typeof o.avatar === "string" && /^https:\/\//.test(o.avatar) ? o.avatar.slice(0, 500) : null });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export type DropStatus = "idle" | "sending" | "sent" | "link" | "error";

export function statusLabel(s: DropStatus, who: string): string {
  switch (s) {
    case "sending":
      return "Sending…";
    case "sent":
      return `In ${who}'s Nexus Drop inbox ✓`;
    case "link":
      return `Sent in ${who}'s chat`;
    case "error":
      return "Couldn't send";
    default:
      return "";
  }
}

/** Errors that mean "nothing was delivered and a link wouldn't help either". Everything else falls back to a Drive link. */
export function isHardDropError(message: string): boolean {
  return /^(No Nexus user|Sign in)/i.test(message);
}

/** True when the browser can hand a real file to the iOS/Android share sheet (that's where real AirDrop lives). */
export function canShareFile(nav: { canShare?: (d: { files: File[] }) => boolean; share?: unknown } | undefined, file: File | null | undefined): boolean {
  if (!nav || !file || typeof nav.share !== "function" || typeof nav.canShare !== "function") return false;
  try {
    return nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** `navigator.share` rejects with AbortError when the person just closes the sheet. That isn't a failure. */
export const isShareCancel = (e: unknown) => !!e && typeof e === "object" && (e as { name?: string }).name === "AbortError";
