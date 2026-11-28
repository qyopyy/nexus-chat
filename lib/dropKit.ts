// Nexus Drop, pure helpers (no browser, no network): file kinds, expiry text, friendly errors, batching.
// Kept dependency-free so it can be unit-tested with plain node.

export const DROP_MAX_BYTES = 100 * 1024 * 1024;
export const DROP_MAX_FILES = 12;

export type DropKind = "image" | "video" | "audio" | "pdf" | "archive" | "doc" | "file";

const EXT: Record<string, DropKind> = {
  jpg: "image", jpeg: "image", png: "image", gif: "image", webp: "image", heic: "image", heif: "image", avif: "image", svg: "image",
  mp4: "video", mov: "video", m4v: "video", webm: "video", mkv: "video",
  mp3: "audio", wav: "audio", m4a: "audio", aac: "audio", flac: "audio", ogg: "audio", opus: "audio",
  pdf: "pdf",
  zip: "archive", rar: "archive", "7z": "archive", tar: "archive", gz: "archive",
  doc: "doc", docx: "doc", xls: "doc", xlsx: "doc", ppt: "doc", pptx: "doc", txt: "doc", md: "doc", csv: "doc", rtf: "doc", pages: "doc", numbers: "doc", key: "doc",
};

export function dropKind(mime: string | null | undefined, name: string): DropKind {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m === "application/pdf") return "pdf";
  const ext = (name.split(".").pop() || "").toLowerCase();
  return EXT[ext] ?? "file";
}

const ICON: Record<DropKind, string> = { image: "🖼️", video: "🎬", audio: "🎵", pdf: "📄", archive: "🗜️", doc: "📝", file: "📎" };
export const dropIcon = (kind: DropKind) => ICON[kind];

/** Formats like the rest of Nexus: KB under 1 MB, MB under 1 GB. */
export function fmtSize(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 KB";
  if (n >= 1073741824) return `${(n / 1073741824).toFixed(1)} GB`;
  if (n >= 1048576) return `${(n / 1048576).toFixed(n >= 10485760 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** "23 h left", "40 min left", "expired". */
export function timeLeft(expiresAt: string, now = Date.now()): string {
  const ms = Date.parse(expiresAt) - now;
  if (!Number.isFinite(ms)) return "";
  if (ms <= 0) return "expired";
  const min = Math.ceil(ms / 60000);
  if (min < 60) return `${min} min left`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return h < 6 && rest >= 5 ? `${h} h ${rest} min left` : `${h} h left`;
}

export function agoText(iso: string, now = Date.now()): string {
  const m = Math.round((now - Date.parse(iso)) / 60000);
  if (!Number.isFinite(m) || m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
}

/** Turn raw storage / Postgres / network messages into something a person can act on. */
export function friendlyDropError(input: unknown): string {
  const raw = input instanceof Error ? input.message : typeof input === "string" ? input : "";
  const m = raw.toLowerCase();
  if (!raw) return "Something went wrong. Try again.";
  if (m.includes("not found") || m.includes("object not found") || m.includes("404")) return "The sender removed this file or it expired.";
  if (m.includes("expired") || m.includes("pending, unexpired")) return "This drop has expired. Ask them to send it again.";
  if (m.includes("exceeded") || m.includes("too large") || m.includes("413") || m.includes("100 mb")) return "That file is over the 100 MB limit.";
  if (m.includes("network") || m.includes("failed to fetch") || m.includes("load failed") || m.includes("timed out")) return "Connection problem. Check your network and retry.";
  if (m.includes("no nexus user")) return "No Nexus user with that username.";
  if (m.includes("jwt") || m.includes("sign in")) return "Sign in again, then retry.";
  if (m.includes("row-level security") || m.includes("permission") || m.includes("42501")) return "You don't have permission for that. Sign in again, then retry.";
  if (m.includes("rate") && m.includes("limit")) return "Slow down a little, then try again.";
  return raw.length > 140 ? `${raw.slice(0, 137)}…` : raw;
}

export type Rejected = { name: string; reason: string };
/** Split a picked/dropped list into what can be sent and what can't (with a reason for each). */
export function planBatch(files: ReadonlyArray<{ name: string; size: number }>, max = DROP_MAX_FILES): { ok: number[]; rejected: Rejected[] } {
  const ok: number[] = [];
  const rejected: Rejected[] = [];
  files.forEach((f, i) => {
    if (!f.size || f.size <= 0) rejected.push({ name: f.name, reason: "empty file" });
    else if (f.size > DROP_MAX_BYTES) rejected.push({ name: f.name, reason: "over 100 MB" });
    else if (ok.length >= max) rejected.push({ name: f.name, reason: `only ${max} files at a time` });
    else ok.push(i);
  });
  return { ok, rejected };
}

/** Clean "@Name " into the stored username form. */
export function cleanUsername(v: string): string {
  return v.trim().replace(/^@+/, "").replace(/\s+/g, "").slice(0, 40);
}

/** Overall percent across a batch (each item: 0..1). */
export function batchPercent(parts: ReadonlyArray<number>): number {
  if (!parts.length) return 0;
  const sum = parts.reduce((a, b) => a + (Number.isFinite(b) ? Math.min(1, Math.max(0, b)) : 0), 0);
  return Math.round((sum / parts.length) * 100);
}

/** Pasted/dropped items with no useful name (screenshots are called "image.png") get a readable one. */
export function niceFileName(name: string, mime: string, now = new Date()): string {
  const generic = !name || /^(image|blob|unknown|screenshot|capture)\.?[a-z0-9]*$/i.test(name);
  if (!generic) return name;
  const ext = (mime.split("/")[1] || "bin").replace("jpeg", "jpg").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "bin";
  const p = (n: number) => String(n).padStart(2, "0");
  return `Nexus ${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}.${p(now.getMinutes())}.${p(now.getSeconds())}.${ext}`;
}
