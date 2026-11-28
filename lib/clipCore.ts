// Nexus Clip: the rules, as plain functions (no network, no browser), so they can be tested.

export type ClipKind = "text" | "url" | "color" | "image" | "code" | "handoff";

/** What is sealed inside an item. The server only ever sees the sealed form. */
export type ClipPayload = {
  v: 1;
  kind: ClipKind;
  text?: string;
  /** data: URL of a picture */
  image?: string;
  url?: string;
  title?: string;
  /** media position in seconds (handoff) */
  at?: number;
  /** device label that sent it */
  from: string;
  /** why it counts as sensitive */
  why?: string;
};

export type ClipItem = {
  id: string;
  kind: ClipKind;
  pinned: boolean;
  sensitive: boolean;
  expiresAt: number | null;
  createdAt: number;
  payload: ClipPayload;
};

export const MAX_TEXT = 200_000;
export const MAX_IMAGE = 1_300_000; // characters of data URL, after shrinking
export const SENSITIVE_SECONDS = 60;
export const HANDOFF_HOURS = 24;

// ------------------------------------------------------------------ what was copied?
const URL_RE = /^https?:\/\/[^\s<>"']+$/i;
const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC_COLOR_RE = /^(rgba?|hsla?)\(\s*[\d.%\s,/-]+\)$/i;
const SECRET_PATTERNS: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/^otpauth:\/\//i, "2FA setup link"],
  [/\bAKIA[0-9A-Z]{16}\b/, "access key"],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/, "access token"],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, "access token"],
  [/\bsk-[A-Za-z0-9_-]{20,}/, "API key"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/, "login token"],
  [/\b(api[_-]?key|secret|token|passw(or)?d)\s*[:=]\s*\S{8,}/i, "secret"],
];

export function normalizeColor(s: string): string | null {
  const t = s.trim();
  const m = HEX_RE.exec(t);
  if (m) {
    let h = m[1]!.toLowerCase();
    if (h.length <= 4) h = [...h].map((c) => c + c).join("");
    return "#" + h;
  }
  return FUNC_COLOR_RE.test(t) ? t.toLowerCase() : null;
}

/** A single word-less string that mixes character types, like a generated password. */
export function looksLikePassword(s: string): boolean {
  if (s.length < 8 || s.length > 80 || /\s/.test(s) || URL_RE.test(s) || normalizeColor(s)) return false;
  let kinds = 0;
  if (/[a-z]/.test(s)) kinds++;
  if (/[A-Z]/.test(s)) kinds++;
  if (/\d/.test(s)) kinds++;
  if (/[^A-Za-z0-9]/.test(s)) kinds++;
  return kinds >= 3;
}

export type Classified = { kind: Exclude<ClipKind, "image" | "handoff">; sensitive: boolean; why?: string };
export function classify(raw: string): Classified {
  const text = raw.trim();
  for (const [re, why] of SECRET_PATTERNS) if (re.test(text)) return { kind: "text", sensitive: true, why };
  if (/^\d{6,8}$/.test(text)) return { kind: "text", sensitive: true, why: "one-time code" };
  if (/^\d{3}[- ]\d{3}$/.test(text)) return { kind: "text", sensitive: true, why: "one-time code" };
  if (looksLikePassword(text)) return { kind: "text", sensitive: true, why: "password" };
  if (URL_RE.test(text)) return { kind: "url", sensitive: false };
  if (normalizeColor(text)) return { kind: "color", sensitive: false };
  if (text.includes("\n") && /[{};]|=>|^\s{2,}\S|\bfunction\b|\bdef\b|\bimport\b/m.test(text)) return { kind: "code", sensitive: false };
  return { kind: "text", sensitive: false };
}

// ------------------------------------------------------------------ expiry
export type ExpiryRules = { sensitiveSec: number; handoffHours: number; historyDays: number };
export const DEFAULT_RULES: ExpiryRules = { sensitiveSec: SENSITIVE_SECONDS, handoffHours: HANDOFF_HOURS, historyDays: 0 };

export function expiryFor(kind: ClipKind, sensitive: boolean, pinned: boolean, now: number, r: ExpiryRules = DEFAULT_RULES): number | null {
  if (pinned) return null; // pinning is the user saying "keep this"
  if (sensitive && r.sensitiveSec > 0) return now + r.sensitiveSec * 1000;
  if (kind === "handoff") return now + r.handoffHours * 3600_000;
  if (r.historyDays > 0) return now + r.historyDays * 86_400_000;
  return null;
}
export const isExpired = (i: Pick<ClipItem, "expiresAt">, now: number) => i.expiresAt !== null && i.expiresAt <= now;
export const secondsLeft = (i: Pick<ClipItem, "expiresAt">, now: number) => (i.expiresAt === null ? null : Math.max(0, Math.ceil((i.expiresAt - now) / 1000)));

// ------------------------------------------------------------------ what to send, and what not to
/** Decide whether newly seen clipboard text should be sent. `known` = what we last sent or received. */
export function shouldPush(text: string | null | undefined, known: readonly string[]): { ok: true; text: string } | { ok: false; why: "empty" | "same" | "too_big" } {
  const t = (text ?? "").replace(/\r\n/g, "\n");
  if (!t.trim()) return { ok: false, why: "empty" };
  if (t.length > MAX_TEXT) return { ok: false, why: "too_big" };
  if (known.includes(t)) return { ok: false, why: "same" };
  return { ok: true, text: t };
}

export function buildPayload(text: string, from: string): { payload: ClipPayload; sensitive: boolean } {
  const c = classify(text);
  const payload: ClipPayload = { v: 1, kind: c.kind, from };
  if (c.kind === "url") payload.url = text.trim();
  else payload.text = text;
  if (c.why) payload.why = c.why;
  return { payload, sensitive: c.sensitive };
}

// ------------------------------------------------------------------ handoff: pages and media positions
const toSeconds = (v: string): number | null => {
  if (/^\d+(\.\d+)?$/.test(v)) return Math.floor(Number(v));
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(v);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
};
/** Position in a link, e.g. youtu.be/x?t=95, a #t=1m30s fragment, or ?start=120. */
export function mediaTimeFromUrl(url: string): number | null {
  try {
    const u = new URL(url);
    const frag = /(?:^|[#&])t=([^&]+)/.exec(u.hash.slice(1) ? "#" + u.hash.slice(1) : "");
    const v = frag?.[1] ?? u.searchParams.get("t") ?? u.searchParams.get("start") ?? u.searchParams.get("time_continue");
    return v ? toSeconds(v) : null;
  } catch {
    return null;
  }
}
const DIRECT_MEDIA = /\.(mp4|m4v|mov|webm|mkv|mp3|flac|wav|m4a|ogg|opus|aac)$/i;
/** The same link, opened at `sec`. Direct media files use a media fragment; sites use their own `t` parameter. */
export function withTime(url: string, sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  try {
    const u = new URL(url);
    if (DIRECT_MEDIA.test(u.pathname)) {
      u.hash = `t=${s}`;
      return u.toString();
    }
    if (/(^|\.)vimeo\.com$/.test(u.hostname)) {
      u.hash = `t=${s}s`;
      return u.toString();
    }
    u.searchParams.delete("start");
    u.searchParams.delete("time_continue");
    u.hash = u.hash.replace(/(^|[#&])t=[^&]*/, "").replace(/^#&?$/, "");
    u.searchParams.set("t", String(s));
    return u.toString();
  } catch {
    return url;
  }
}
export function buildHandoff(o: { url: string; title?: string; at?: number | null }, from: string): ClipPayload | null {
  const url = o.url.trim();
  if (!URL_RE.test(url)) return null;
  const at = o.at != null && o.at > 0 ? Math.floor(o.at) : mediaTimeFromUrl(url);
  return { v: 1, kind: "handoff", url: at ? withTime(url, at) : url, title: o.title?.trim().slice(0, 200) || undefined, at: at ?? undefined, from };
}
export const clock = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = Math.floor(s % 60);
  return `${h ? h + ":" + String(m).padStart(2, "0") : m}:${String(x).padStart(2, "0")}`;
};

// ------------------------------------------------------------------ the list
export function sortClips<T extends Pick<ClipItem, "pinned" | "createdAt">>(list: T[]): T[] {
  return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt);
}
export type Filter = "all" | "pinned" | "text" | "url" | "color" | "image";
export function searchClips(list: ClipItem[], q: string, filter: Filter = "all"): ClipItem[] {
  const n = q.trim().toLowerCase();
  return sortClips(
    list.filter((i) => {
      if (i.kind === "handoff") return false; // handoffs live in their own tray
      if (filter === "pinned" ? !i.pinned : filter === "text" ? i.kind !== "text" && i.kind !== "code" : filter !== "all" && i.kind !== filter) return false;
      if (!n) return true;
      if (i.sensitive) return false; // secrets are never matched by search or shown in previews
      const p = i.payload;
      return `${p.text ?? ""} ${p.url ?? ""} ${p.title ?? ""} ${p.from}`.toLowerCase().includes(n);
    }),
  );
}
export function preview(i: ClipItem, max = 140): string {
  const p = i.payload;
  if (i.sensitive) return "•••••• hidden until you tap to show";
  if (i.kind === "image") return "Image";
  const t = (p.url ?? p.text ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

// ------------------------------------------------------------------ naming this device
export function deviceLabel(ua: string): string {
  const os = /iPhone/i.test(ua) ? "iPhone" : /iPad/i.test(ua) ? "iPad" : /Android/i.test(ua) ? "Android" : /Windows/i.test(ua) ? "Windows" : /Macintosh|Mac OS X/i.test(ua) ? "Mac" : /CrOS/i.test(ua) ? "Chromebook" : /Linux/i.test(ua) ? "Linux" : "Device";
  const br = /Edg\//i.test(ua) ? "Edge" : /OPR\/|Opera/i.test(ua) ? "Opera" : /CriOS|Chrome\//i.test(ua) ? "Chrome" : /FxiOS|Firefox\//i.test(ua) ? "Firefox" : /Safari\//i.test(ua) ? "Safari" : "";
  return os === "iPhone" || os === "iPad" ? os : br ? `${br} on ${os}` : os;
}
