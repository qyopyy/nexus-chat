// Nexus Snap: take a photo in Nexus (or the separate Snap app), it lands in your Nexus Drive vault
// and gets a nexusproject.cc/s/<token> link straight away. Pure helpers (no DOM) so they can be tested.

export const SNAP_FOLDER = "Snap";
export const SNAP_DEFAULT_EXPIRY_HOURS = 168;

export const SNAP_EXPIRY: { label: string; hours: number | null }[] = [
  { label: "1 hour", hours: 1 },
  { label: "1 day", hours: 24 },
  { label: "7 days", hours: 168 },
  { label: "30 days", hours: 720 },
  { label: "Never", hours: null },
];

const p2 = (n: number) => String(n).padStart(2, "0");

/** snap-2026-11-27-22-01-05.jpg (front-camera shots end in -selfie). Videos pass their own extension. */
export function snapFileName(d: Date, facing: "user" | "environment" = "environment", ext = "jpg"): string {
  const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${p2(d.getHours())}-${p2(d.getMinutes())}-${p2(d.getSeconds())}`;
  return `snap-${stamp}${facing === "user" ? "-selfie" : ""}.${ext.replace(/^\./, "")}`;
}

/** Stored expiry choice → hours; falls back to 7 days for anything that isn't one of the options. */
export function parseExpiry(raw: string | null | undefined): number | null {
  if (raw === "never") return null;
  const n = Number(raw);
  return SNAP_EXPIRY.some((o) => o.hours === n) ? n : SNAP_DEFAULT_EXPIRY_HOURS;
}
export const expiryKey = (hours: number | null) => (hours === null ? "never" : String(hours));

export function snapShareText(link: string, kind: "image" | "video" = "image"): string {
  return `${kind === "video" ? "🎥" : "📸"} ${link}`;
}

export function isSnapShell(ua: string | null | undefined): boolean {
  return /NexusSnap/i.test(ua ?? "");
}

/** Plain-language reason for a camera failure (getUserMedia errors are cryptic). */
export function cameraErrorMessage(err: unknown, secure = true): string {
  const name = (err as { name?: string } | null)?.name ?? "";
  if (!secure) return "The camera only works on a secure (https) page.";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Camera access is blocked. Allow the camera for Nexus in your browser or iPhone Settings, then try again.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No camera found on this device.";
    case "NotReadableError":
    case "TrackStartError":
      return "The camera is busy in another app. Close it and try again.";
    case "OverconstrainedError":
      return "This camera can't do the requested mode. Try flipping the camera.";
    case "SecurityError":
      return "The browser blocked the camera on this page.";
    default:
      return "Couldn't start the camera. Try again, or use the file picker instead.";
  }
}

/** Largest size that keeps the longest edge within `max` pixels (no upscaling). */
export function fitWithin(w: number, h: number, max = 2560): { w: number; h: number } {
  if (!w || !h) return { w: 0, h: 0 };
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

// ---------------------------------------------------------------- v2: quality, ratio, effects, video, recipients

export type Facing = "user" | "environment";
export type SnapQuality = { key: "standard" | "high" | "max"; label: string; hint: string; maxEdge: number; jpeg: number; videoBps: number; videoH: number };
export const SNAP_QUALITY: SnapQuality[] = [
  { key: "standard", label: "Standard", hint: "Small files", maxEdge: 1920, jpeg: 0.85, videoBps: 3_000_000, videoH: 720 },
  { key: "high", label: "High", hint: "Full HD", maxEdge: 2560, jpeg: 0.92, videoBps: 8_000_000, videoH: 1080 },
  { key: "max", label: "Max", hint: "Biggest your camera does", maxEdge: 4096, jpeg: 0.97, videoBps: 16_000_000, videoH: 2160 },
];
export const qualityByKey = (k: string | null | undefined): SnapQuality => SNAP_QUALITY.find((q) => q.key === k) ?? SNAP_QUALITY[1];

/** `r` = width / height of the saved picture; null = whatever the camera gives (Full). */
export const SNAP_RATIOS: { key: string; label: string; r: number | null }[] = [
  { key: "full", label: "Full", r: null },
  { key: "3:4", label: "3:4", r: 3 / 4 },
  { key: "9:16", label: "9:16", r: 9 / 16 },
  { key: "1:1", label: "1:1", r: 1 },
  { key: "4:3", label: "4:3", r: 4 / 3 },
  { key: "16:9", label: "16:9", r: 16 / 9 },
];
export const ratioByKey = (k: string | null | undefined) => SNAP_RATIOS.find((r) => r.key === k) ?? SNAP_RATIOS[0];

/** Centered crop of a sw×sh source to ratio `r` (w/h). null keeps everything. Integers, never out of bounds. */
export function cropRect(sw: number, sh: number, r: number | null): { sx: number; sy: number; sw: number; sh: number } {
  if (!sw || !sh) return { sx: 0, sy: 0, sw: 0, sh: 0 };
  if (!r || r <= 0) return { sx: 0, sy: 0, sw, sh };
  const cur = sw / sh;
  if (Math.abs(cur - r) < 0.001) return { sx: 0, sy: 0, sw, sh };
  if (cur > r) {
    const w = Math.max(1, Math.round(sh * r));
    return { sx: Math.floor((sw - w) / 2), sy: 0, sw: w, sh };
  }
  const h = Math.max(1, Math.round(sw / r));
  return { sx: 0, sy: Math.floor((sh - h) / 2), sw, sh: h };
}

export type SnapEffect = { key: string; label: string; css: string };
/** `css` = the same look as a CSS filter: live preview on the <video>, and video recording where the browser supports ctx.filter. */
export const SNAP_EFFECTS: SnapEffect[] = [
  { key: "none", label: "Normal", css: "none" },
  { key: "vivid", label: "Vivid", css: "saturate(1.35) contrast(1.08)" },
  { key: "pop", label: "Pop", css: "saturate(1.2) contrast(1.25)" },
  { key: "warm", label: "Warm", css: "sepia(0.18) saturate(1.15) brightness(1.03)" },
  { key: "cool", label: "Cool", css: "hue-rotate(-12deg) saturate(1.05) brightness(1.02)" },
  { key: "fade", label: "Fade", css: "contrast(0.88) brightness(1.1) saturate(0.8)" },
  { key: "vintage", label: "Vintage", css: "sepia(0.4) contrast(0.95) saturate(0.9)" },
  { key: "sepia", label: "Sepia", css: "sepia(1)" },
  { key: "mono", label: "Mono", css: "grayscale(1)" },
  { key: "noir", label: "Noir", css: "grayscale(1) contrast(1.4)" },
];
export const effectByKey = (k: string | null | undefined) => SNAP_EFFECTS.find((e) => e.key === k) ?? SNAP_EFFECTS[0];

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** In-place RGBA pixel effect (works in every browser, unlike ctx.filter on older Safari). */
export function applyEffect(d: Uint8ClampedArray | number[], key: string): void {
  if (key === "none" || !SNAP_EFFECTS.some((e) => e.key === key)) return;
  for (let i = 0; i + 2 < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const sat = (k: number) => {
      r = lum + (r - lum) * k;
      g = lum + (g - lum) * k;
      b = lum + (b - lum) * k;
    };
    const con = (k: number) => {
      r = (r - 128) * k + 128;
      g = (g - 128) * k + 128;
      b = (b - 128) * k + 128;
    };
    const sepia = (k: number) => {
      const sr = 0.393 * r + 0.769 * g + 0.189 * b;
      const sg = 0.349 * r + 0.686 * g + 0.168 * b;
      const sb = 0.272 * r + 0.534 * g + 0.131 * b;
      r += (sr - r) * k;
      g += (sg - g) * k;
      b += (sb - b) * k;
    };
    switch (key) {
      case "vivid": sat(1.35); con(1.08); break;
      case "pop": sat(1.2); con(1.25); break;
      case "warm": sepia(0.18); sat(1.15); r *= 1.03; g *= 1.03; b *= 1.03; break;
      case "cool": r *= 0.93; b = b * 1.1 + 6; break;
      case "fade": sat(0.8); con(0.88); r += 22; g += 22; b += 22; break;
      case "vintage": sepia(0.4); con(0.95); sat(0.9); break;
      case "sepia": sepia(1); break;
      case "mono": r = g = b = lum; break;
      case "noir": r = g = b = (lum - 128) * 1.4 + 128; break;
    }
    d[i] = clamp(r);
    d[i + 1] = clamp(g);
    d[i + 2] = clamp(b);
  }
}

export const SNAP_MAX_VIDEO_MS = 3 * 60 * 1000;

/** Best recording format this browser can make: mp4 first (plays everywhere, incl. iPhone), then webm. */
export function pickVideoMime(isSupported: (mime: string) => boolean): { mime: string; ext: string } | null {
  const list: { mime: string; ext: string }[] = [
    { mime: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", ext: "mp4" },
    { mime: "video/mp4", ext: "mp4" },
    { mime: "video/webm;codecs=vp9,opus", ext: "webm" },
    { mime: "video/webm;codecs=vp8,opus", ext: "webm" },
    { mime: "video/webm", ext: "webm" },
  ];
  for (const c of list) {
    try {
      if (isSupported(c.mime)) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** "video/webm;codecs=vp9,opus" → "video/webm" (what we store in the vault). */
export const baseMime = (m: string) => m.split(";")[0].trim().toLowerCase();

/** 0:07, 1:02, 1:02:03 */
export function formatDuration(ms: number): string {
  const t = Math.max(0, Math.floor((ms || 0) / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h}:${p2(m)}:${p2(s)}` : `${m}:${p2(s)}`;
}

/** Is the picture/video pipeline through a canvas needed (effect or crop), or can the camera stream be recorded as is? */
export const needsCanvasPipeline = (effectKey: string, ratioKey: string) => effectKey !== "none" || ratioByKey(ratioKey).r !== null;

export const isVideoMime = (m: string | null | undefined) => /^video\//i.test(m ?? "");

export type Recipient = { kind: "email"; value: string } | { kind: "username"; value: string };
/** "@Martin" → username martin; "a@b.co" → email. Anything else → null. */
export function parseRecipient(input: string): Recipient | null {
  const t = (input ?? "").trim();
  if (!t) return null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t) && t.length <= 254) return { kind: "email", value: t.toLowerCase() };
  const u = t.replace(/^@+/, "").toLowerCase();
  if (/^[a-z0-9_.-]{2,32}$/.test(u)) return { kind: "username", value: u };
  return null;
}

/** getUserMedia constraints for the chosen quality. Video mode asks for audio too. */
export function cameraConstraints(f: Facing, q: SnapQuality, withAudio: boolean): MediaStreamConstraints {
  const long = q.videoH >= 2160 ? 3840 : q.videoH >= 1080 ? 1920 : 1280;
  return {
    video: { facingMode: { ideal: f }, width: { ideal: long }, height: { ideal: Math.round((long * 3) / 4) } },
    audio: withAudio ? { echoCancellation: true, noiseSuppression: true } : false,
  };
}

/** Largest box with ratio `r` (w/h) that fits inside cw×ch; r = null fills it. Used so the live preview shows exactly what gets saved. */
export function fitBox(cw: number, ch: number, r: number | null): { w: number; h: number } {
  if (!cw || !ch) return { w: 0, h: 0 };
  if (!r || r <= 0) return { w: cw, h: ch };
  return cw / ch > r ? { w: Math.round(ch * r), h: ch } : { w: cw, h: Math.round(cw / r) };
}

/** True when a Supabase/PostgREST error means "that database function isn't installed (yet)". */
export function isMissingRpc(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  return e.code === "PGRST202" || e.code === "42883" || /could not find the function|does not exist/i.test(e.message ?? "");
}

/** self-timer choices in seconds (0 = off) */
export const SNAP_TIMERS = [0, 3, 10] as const;
export const parseTimer = (raw: string | null | undefined): number => {
  const n = Number(raw);
  return (SNAP_TIMERS as readonly number[]).includes(n) ? n : 0;
};
export const nextTimer = (cur: number): number => SNAP_TIMERS[(Math.max(0, (SNAP_TIMERS as readonly number[]).indexOf(cur)) + 1) % SNAP_TIMERS.length];
