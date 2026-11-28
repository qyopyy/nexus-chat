// Live Control: settings the owner changes on the server and every open app picks up at once (pure, no DOM).

export type LiveDef =
  | { key: string; kind: "bool"; def: boolean; label: string; hint: string }
  | { key: string; kind: "choice"; def: number; options: readonly number[]; label: string; hint: string }
  | { key: string; kind: "text"; def: string; max: number; label: string; hint: string };

export const LIVE_DEFS: readonly LiveDef[] = [
  { key: "snap.camera_enabled", kind: "bool", def: true, label: "Snap camera on", hint: "Off shows a notice instead of the camera for everyone, instantly" },
  { key: "snap.zoom_enhance", kind: "bool", def: true, label: "Zoom enhance allowed", hint: "Off turns the zoomed-photo sharpening off for everyone" },
  { key: "snap.max_video_sec", kind: "choice", def: 180, options: [30, 60, 180, 300], label: "Longest Snap video (seconds)", hint: "Caps what people pick in their own settings" },
  { key: "snap.notice", kind: "text", def: "", max: 140, label: "Snap notice", hint: "A short line shown on top of the camera (empty = none)" },
  { key: "snap.pack_looks", kind: "bool", def: true, label: "Snap Pack: extra looks", hint: "14 extra photo and video looks (Golden, Cyber, HDR…). Off keeps the original ten" },
  { key: "snap.pack_frames", kind: "bool", def: true, label: "Snap Pack: extra frames", hint: "Neon, Scanlines, Cinema, Viewfinder, Rounded, Light leak, Glow, Film strip" },
  { key: "snap.pack_stickers", kind: "bool", def: true, label: "Snap Pack: sticker packs", hint: "72 more stickers in 6 packs, with size and corner choices" },
  { key: "snap.pack_captions", kind: "bool", def: true, label: "Snap Pack: caption styles", hint: "Bold, Neon, Outline, Typewriter, Meme, plus top / middle / bottom" },
  { key: "snap.featured_look", kind: "text", def: "", max: 20, label: "Look of the day", hint: "A look key such as cyber or golden: it moves to the front of the list" },
  { key: "snap.featured_frame", kind: "text", def: "", max: 20, label: "Frame of the day", hint: "A frame key such as neon or strip: shown with a star" },
  { key: "snap.featured_sticker", kind: "text", def: "", max: 8, label: "Sticker of the day", hint: "One emoji, shown first in the sticker tray" },
  { key: "snap.daily_prompt", kind: "text", def: "", max: 100, label: "Daily prompt", hint: "A photo idea shown on the camera (empty = none)" },
  { key: "snap.event_caption", kind: "text", def: "", max: 60, label: "Event caption", hint: "Added to every photo that has no caption of its own (empty = none)" },
  { key: "snap.watermark", kind: "text", def: "", max: 30, label: "Photo watermark", hint: "Small corner mark on every Snap photo, such as @nexus (empty = none)" },
  { key: "nexus.max_voice_sec", kind: "choice", def: 300, options: [60, 120, 300, 600], label: "Longest voice message (seconds)", hint: "Applies to chat voice messages" },
];

export type LiveMap = Record<string, unknown>;

const byKey = new Map(LIVE_DEFS.map((d) => [d.key, d]));
export const isLiveKey = (k: string) => byKey.has(k);

/** One raw value (from the database, anything) in → a valid value for that key out. Bad or unknown input = the default. */
export function cleanLive(key: string, raw: unknown): boolean | number | string | null {
  const d = byKey.get(key);
  if (!d) return null;
  if (d.kind === "bool") return typeof raw === "boolean" ? raw : d.def;
  if (d.kind === "choice") return typeof raw === "number" && d.options.includes(raw) ? raw : d.def;
  return typeof raw === "string" ? raw.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, d.max) : d.def;
}

export function liveGet<T extends boolean | number | string>(map: LiveMap, key: string): T {
  const d = byKey.get(key);
  return cleanLive(key, map[key]) as T ?? (d?.def as T);
}

/** Rows from the table → one clean map. */
export function toMap(rows: { key: string; value: unknown }[] | null | undefined): LiveMap {
  const m: LiveMap = {};
  for (const r of rows ?? []) if (byKey.has(r.key)) m[r.key] = cleanLive(r.key, r.value);
  return m;
}

/** The person's own choice can only be lowered by the owner, never raised. */
export const capSeconds = (own: number, live: number) => Math.min(own, live);

export type SnapLimits = { enabled: boolean; zoomEnhance: boolean; maxVideoSec: number; notice: string };

export function snapLimits(map: LiveMap): SnapLimits {
  return {
    enabled: liveGet<boolean>(map, "snap.camera_enabled"),
    zoomEnhance: liveGet<boolean>(map, "snap.zoom_enhance"),
    maxVideoSec: liveGet<number>(map, "snap.max_video_sec"),
    notice: liveGet<string>(map, "snap.notice"),
  };
}

/** Your saved Snap settings with the owner's live limits laid over them (settings screen still shows your own choice). */
export function withSnapLimits<P extends { zoomEnhance: boolean; maxVideoSec: number }>(prefs: P, map: LiveMap): P {
  const l = snapLimits(map);
  const sec = capSeconds(prefs.maxVideoSec, l.maxVideoSec);
  const maxVideoSec = (sec >= 180 ? 180 : sec >= 60 ? 60 : 30) as P["maxVideoSec"];
  return { ...prefs, zoomEnhance: prefs.zoomEnhance && l.zoomEnhance, maxVideoSec };
}
