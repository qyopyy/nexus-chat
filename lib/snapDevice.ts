// Nexus Snap on every phone: pick a sensible capture size, keep the layout usable on small screens,
// and map a tap on the preview to the camera's own coordinates for tap-to-focus (pure, no DOM).

import type { Facing, SnapQuality } from "./snap";

export type DeviceInfo = {
  screenW: number;
  screenH: number;
  dpr: number;
  memoryGb?: number;
  cores?: number;
  saveData?: boolean;
  effectiveType?: string;
};

/** Standard / High / Max for this device. Weak network, little memory or a tiny screen = lighter; big fast screens = Max. */
export function autoQualityKey(d: DeviceInfo): SnapQuality["key"] {
  const physical = Math.max(d.screenW, d.screenH) * (d.dpr || 1);
  if (d.saveData || /^(slow-2g|2g|3g)$/.test(d.effectiveType ?? "")) return "standard";
  if (d.memoryGb !== undefined && d.memoryGb <= 3) return "standard";
  if (physical < 1280) return "standard";
  if (physical >= 2400 && (d.memoryGb === undefined || d.memoryGb >= 6) && (d.cores ?? 6) >= 6) return "max";
  return "high";
}

/** The quality actually used: Data saver beats everything, then Auto, then the person's own pick. */
export function effectiveQualityKey(chosen: string, auto: boolean, dataSaver: boolean, d: DeviceInfo): SnapQuality["key"] {
  if (dataSaver) return "standard";
  if (auto) return autoQualityKey(d);
  return chosen === "standard" || chosen === "max" ? chosen : "high";
}

/** iPhone / iPad (iPadOS reports itself as a Mac with a touch screen). */
export function isIOSDevice(ua: string, platform = "", touchPoints = 0): boolean {
  return /iPhone|iPad|iPod/i.test(ua) || (platform === "MacIntel" && touchPoints > 1);
}

/** A camera stream that has died (iOS stops it when another app, like the iPhone Camera, uses the camera). */
export function streamIsDead(track: { readyState?: string; muted?: boolean } | null | undefined): boolean {
  return !track || track.readyState !== "live" || track.muted === true;
}

/** Short screens (iPhone SE, split view, landscape) get tighter controls. */
export const isCompactHeight = (h: number) => h > 0 && h < 700;

type Caps = { width?: { max?: number }; height?: { max?: number } };

/** Capture size for a quality, never more than the camera can do. */
export function targetSize(q: SnapQuality, caps?: Caps): { w: number; h: number } {
  const want = q.videoH >= 2160 ? 3840 : q.videoH >= 1080 ? 1920 : 1280;
  const camLong = Math.max(caps?.width?.max ?? 0, caps?.height?.max ?? 0);
  const long = camLong > 0 ? Math.min(want, camLong) : want;
  return { w: long, h: Math.round((long * 3) / 4) };
}

/** First try: the quality's size. Second try (after an OverconstrainedError): just the camera side. Last try: anything. */
export function constraintLadder(f: Facing, q: SnapQuality, withAudio: boolean): MediaStreamConstraints[] {
  const t = targetSize(q);
  // studio-grade microphone: 48 kHz, stereo where the phone has it (front and back camera alike)
  const audio = withAudio ? { echoCancellation: true, noiseSuppression: true, channelCount: { ideal: 2 }, sampleRate: { ideal: 48000 } } : false;
  return [
    { video: { facingMode: { ideal: f }, width: { ideal: t.w }, height: { ideal: t.h }, frameRate: { ideal: 30, max: 60 } }, audio },
    { video: { facingMode: { ideal: f } }, audio },
    { video: true, audio },
  ];
}

/** Does the live track already deliver (nearly) what the camera can do at this quality? If not, what to ask for. */
export function upgradeTo(q: SnapQuality, settings: { width?: number; height?: number }, caps?: Caps): { width: number; height: number } | null {
  if (!caps) return null;
  const t = targetSize(q, caps);
  const cur = Math.max(settings.width ?? 0, settings.height ?? 0);
  if (!cur || cur >= t.w * 0.95) return null;
  return { width: t.w, height: t.h };
}

/**
 * A tap at (px, py) inside a box showing the video with object-cover → the point in the camera's own 0..1 space
 * (what `pointsOfInterest` wants). Front camera previews are mirrored.
 */
export function tapToVideoPoint(px: number, py: number, boxW: number, boxH: number, vidW: number, vidH: number, mirrored: boolean): { x: number; y: number } | null {
  if (!boxW || !boxH || !vidW || !vidH) return null;
  const scale = Math.max(boxW / vidW, boxH / vidH);
  const offX = (vidW * scale - boxW) / 2;
  const offY = (vidH * scale - boxH) / 2;
  let x = (px + offX) / scale / vidW;
  const y = (py + offY) / scale / vidH;
  if (mirrored) x = 1 - x;
  const c = (v: number) => Math.min(1, Math.max(0, v));
  return { x: c(x), y: c(y) };
}

/** Distance between two pointers; used for pinch-to-zoom. */
export const pinchDistance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** New zoom after a pinch (ratio of distances), kept inside the camera's range. */
export function pinchZoom(start: number, ratio: number, min: number, max: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return start;
  return Math.min(max, Math.max(min, start * ratio));
}

/** Level guide: roll angle (degrees, 0 = upright phone) from gravity along the screen's x and y axes. */
export function rollFromGravity(x: number, y: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(y) || (x === 0 && y === 0)) return 0;
  return (Math.atan2(x, y) * 180) / Math.PI;
}
export const isLevel = (deg: number) => Math.abs(deg) <= 1.5;
