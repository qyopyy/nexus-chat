// Nexus Snap settings: one typed object, saved on the device, every field validated on the way in (pure, no DOM).

export const GRID_STYLES = ["off", "thirds", "center", "golden", "diagonal"] as const;
export type GridStyle = (typeof GRID_STYLES)[number];
export const GEO_TAGS = ["off", "approx", "precise"] as const;
export type GeoTag = (typeof GEO_TAGS)[number];

export type SnapPrefs = {
  // camera
  tapFocus: boolean;
  exposureSlider: boolean;
  focusLock: boolean;
  pinchZoom: boolean;
  zoomControl: boolean;
  zoomEnhance: boolean;
  nativeCamera: boolean;
  doubleTapFlip: boolean;
  shutterSound: boolean;
  timerBeep: boolean;
  haptics: boolean;
  levelGuide: boolean;
  gridStyle: GridStyle;
  keepAwake: boolean;
  startMode: "photo" | "video";
  startFacing: "environment" | "user";
  autoQuality: boolean;
  dataSaver: boolean;
  screenFlash: boolean;
  maxVideoSec: 30 | 60 | 180;
  // saving and sharing
  autoSave: boolean;
  autoCopyLink: boolean;
  downloadCopy: boolean;
  confirmDelete: boolean;
  linkDownload: boolean;
  maxDownloads: 0 | 1 | 5 | 10;
  // privacy
  geoTag: GeoTag;
  locationInSend: boolean;
  privacyScreen: boolean;
  appLock: boolean;
  receiveDrops: boolean;
  nearbyMinutes: 5 | 10 | 30;
  // layout
  leftHanded: boolean;
  bigShutter: boolean;
  showHints: boolean;
  reduceMotion: boolean;
  cameraBadge: boolean;
  showDropButton: boolean;
};

export const DEFAULT_PREFS: SnapPrefs = {
  tapFocus: true,
  exposureSlider: true,
  focusLock: true,
  pinchZoom: true,
  zoomControl: true,
  zoomEnhance: true,
  nativeCamera: false,
  doubleTapFlip: true,
  shutterSound: false,
  timerBeep: true,
  haptics: true,
  levelGuide: false,
  gridStyle: "thirds",
  keepAwake: true,
  startMode: "photo",
  startFacing: "environment",
  autoQuality: true,
  dataSaver: false,
  screenFlash: true,
  maxVideoSec: 180,
  autoSave: true,
  autoCopyLink: true,
  downloadCopy: false,
  confirmDelete: true,
  linkDownload: true,
  maxDownloads: 0,
  geoTag: "off",
  locationInSend: false,
  privacyScreen: true,
  appLock: false,
  receiveDrops: true,
  nearbyMinutes: 10,
  leftHanded: false,
  bigShutter: false,
  showHints: true,
  reduceMotion: false,
  cameraBadge: true,
  showDropButton: true,
};

export const PREFS_KEY = "snap.prefs.v1";

const inList = <T extends string | number>(list: readonly T[], v: unknown, d: T): T => (list.includes(v as T) ? (v as T) : d);

/** Anything (old, damaged, hand-edited) in → a complete, valid settings object out. Unknown keys are dropped. */
export function parsePrefs(raw: unknown): SnapPrefs {
  let o: Record<string, unknown> = {};
  if (typeof raw === "string") {
    try {
      const j = JSON.parse(raw);
      if (j && typeof j === "object" && !Array.isArray(j)) o = j as Record<string, unknown>;
    } catch {
      /* damaged JSON: defaults */
    }
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)) o = raw as Record<string, unknown>;
  const d = DEFAULT_PREFS;
  const out = { ...d } as Record<string, unknown>;
  for (const k of Object.keys(d) as (keyof SnapPrefs)[]) if (typeof d[k] === "boolean" && typeof o[k] === "boolean") out[k] = o[k];
  out.gridStyle = inList(GRID_STYLES, o.gridStyle, d.gridStyle);
  out.geoTag = inList(GEO_TAGS, o.geoTag, d.geoTag);
  out.startMode = inList(["photo", "video"] as const, o.startMode, d.startMode);
  out.startFacing = inList(["environment", "user"] as const, o.startFacing, d.startFacing);
  out.maxVideoSec = inList([30, 60, 180] as const, o.maxVideoSec, d.maxVideoSec);
  out.maxDownloads = inList([0, 1, 5, 10] as const, o.maxDownloads, d.maxDownloads);
  out.nearbyMinutes = inList([5, 10, 30] as const, o.nearbyMinutes, d.nearbyMinutes);
  return out as SnapPrefs;
}

export const serializePrefs = (p: SnapPrefs) => JSON.stringify(parsePrefs(p));

// ------------------------------------------------------------------ location

/** Approximate = about 1 km (2 decimals); precise = about 1 m (5 decimals). Off or bad input = null. */
export function roundPosition(lat: number, lng: number, mode: GeoTag): { lat: number; lng: number } | null {
  if (mode === "off" || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const k = mode === "approx" ? 100 : 100000;
  return { lat: Math.round(lat * k) / k, lng: Math.round(lng * k) / k };
}

export const mapsUrl = (p: { lat: number; lng: number }) => `https://maps.google.com/?q=${p.lat},${p.lng}`;

/** Vault note for a Snap: "Nexus Snap", plus the place when the person asked for location tags. */
export function snapNote(p: { lat: number; lng: number } | null): string {
  return p ? `Nexus Snap · ${p.lat},${p.lng}` : "Nexus Snap";
}

/** Chat text for a shared Snap, with a map link underneath only when sending location is switched on. */
export function sendText(base: string, p: { lat: number; lng: number } | null, enabled: boolean): string {
  return enabled && p ? `${base}\n📍 ${mapsUrl(p)}` : base;
}

// ------------------------------------------------------------------ screen lock PIN

export const validPin = (s: unknown): s is string => typeof s === "string" && /^\d{4,8}$/.test(s);

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

/** "salt:sha256(salt:pin)". The PIN is a screen lock on this device only; it never leaves it. */
export async function hashPin(pin: string, salt?: string): Promise<string> {
  const s = salt ?? hex(crypto.getRandomValues(new Uint8Array(8)).buffer);
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${s}:${pin}`));
  return `${s}:${hex(d)}`;
}

export async function checkPin(pin: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored || !validPin(pin)) return false;
  const salt = stored.split(":")[0];
  if (!salt) return false;
  return (await hashPin(pin, salt)) === stored;
}

/** After every 5th wrong try the keypad waits 30 s. */
export function lockoutLeft(fails: number, lastFailAt: number, now: number): number {
  if (fails < 5 || fails % 5 !== 0) return 0;
  return Math.max(0, 30_000 - (now - lastFailAt));
}

/** Lock again when the app was away this long. */
export const RELOCK_AFTER_MS = 30_000;
export const shouldRelock = (hiddenAt: number | null, now: number) => hiddenAt !== null && now - hiddenAt >= RELOCK_AFTER_MS;
