// Shield 360 Pro — pure helpers (no imports, unit-tested): multi-artist credits, platform protection matrix,
// protection score and Instagram link validation.

// ------------------------------------------------------------------ credits
export const ROLES = ["Primary artist", "Featured artist", "Producer", "Songwriter", "Composer", "Lyricist", "Remixer", "Mixer", "Mastering", "Label"] as const;
export type Credit = { name: string; role: string; split?: number | null; ipi?: string | null };

const clean = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "");

/** normalise, drop empties and duplicates (same name + role), cap at 30 */
export function cleanCredits(list: Credit[] | null | undefined): Credit[] {
  const seen = new Set<string>();
  const out: Credit[] = [];
  for (const c of list ?? []) {
    const name = clean(c?.name, 120);
    const role = clean(c?.role, 40) || "Primary artist";
    if (!name) continue;
    const key = `${name.toLowerCase()}|${role.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const split = typeof c.split === "number" && Number.isFinite(c.split) ? Math.max(0, Math.min(100, Math.round(c.split * 100) / 100)) : null;
    const ipi = clean(c.ipi, 40).replace(/\D/g, "").slice(0, 11) || null;
    out.push({ name, role, split, ipi });
    if (out.length >= 30) break;
  }
  return out;
}

/** "A, B & C feat. D x E" → primary A, B, C + featured D, E */
export function creditsFromArtist(artist: string | null | undefined): Credit[] {
  const s = clean(artist, 400);
  if (!s) return [];
  const m = s.match(/\s(?:feat\.?|ft\.?|featuring|with)\s/i);
  const main = m ? s.slice(0, m.index) : s;
  const feat = m ? s.slice((m.index ?? 0) + m[0].length) : "";
  const split = (x: string) => x.split(/\s*(?:,|&|\band\b|\bx\b|\+|\/)\s*/i).map((n) => n.trim()).filter(Boolean);
  return cleanCredits([...split(main).map((name) => ({ name, role: "Primary artist" })), ...split(feat).map((name) => ({ name, role: "Featured artist" }))]);
}

/** display line: "A, B feat. C" */
export function artistLine(credits: Credit[] | null | undefined): string {
  const c = cleanCredits(credits);
  const main = c.filter((x) => x.role === "Primary artist").map((x) => x.name);
  const feat = c.filter((x) => x.role === "Featured artist").map((x) => x.name);
  return [main.join(", "), feat.length ? `feat. ${feat.join(", ")}` : ""].filter(Boolean).join(" ");
}

/** problems worth fixing before you seal / distribute */
export function creditIssues(credits: Credit[] | null | undefined): string[] {
  const c = cleanCredits(credits);
  const out: string[] = [];
  if (!c.some((x) => x.role === "Primary artist")) out.push("Add at least one primary artist");
  const withSplit = c.filter((x) => x.split != null && x.role !== "Label");
  if (withSplit.length) {
    const sum = Math.round(withSplit.reduce((a, x) => a + (x.split ?? 0), 0) * 100) / 100;
    if (sum !== 100) out.push(`Splits add up to ${sum}% — they should total 100%`);
  }
  if (c.some((x) => x.ipi && x.ipi.length < 9)) out.push("IPI numbers have 9–11 digits");
  return out;
}

// ------------------------------------------------------------------ platforms
export type Mode = "off" | "watch" | "block" | "claim";
export type ShieldPlatform = {
  id: string;
  name: string;
  kind: "dsp" | "social";
  color: string;
  modes: Mode[];
  /** id in the Takedown tool, when it has a ready-made notice for this platform */
  takedown?: string;
  /** official report form / policy page for platforms without a notice template */
  form?: string;
  search: (q: string) => string;
  hint: string;
};
const enc = encodeURIComponent;
export const SHIELD_PLATFORMS: ShieldPlatform[] = [
  { id: "spotify", name: "Spotify", kind: "dsp", color: "#1DB954", modes: ["off", "watch", "block"], takedown: "spotify", search: (q) => `https://open.spotify.com/search/${enc(q)}`, hint: "Catch leaks & impersonators on your artist profile" },
  { id: "apple", name: "Apple Music", kind: "dsp", color: "#FA243C", modes: ["off", "watch", "block"], takedown: "apple", search: (q) => `https://music.apple.com/search?term=${enc(q)}`, hint: "Apple Music dispute / copyright notice" },
  { id: "youtube", name: "YouTube · Content ID", kind: "social", color: "#FF0000", modes: ["off", "watch", "block", "claim"], takedown: "youtube", search: (q) => `https://www.youtube.com/results?search_query=${enc(q)}`, hint: "Block or monetise re-uploads" },
  { id: "youtube_music", name: "YouTube Music", kind: "dsp", color: "#FF4E45", modes: ["off", "watch", "block"], takedown: "youtube_music", search: (q) => `https://music.youtube.com/search?q=${enc(q)}`, hint: "Topic channel & art-track copies" },
  { id: "tiktok", name: "TikTok", kind: "social", color: "#25F4EE", modes: ["off", "watch", "block"], takedown: "tiktok", search: (q) => `https://www.tiktok.com/search?q=${enc(q)}`, hint: "Sound-library & video copies" },
  { id: "instagram", name: "Instagram / Reels", kind: "social", color: "#E1306C", modes: ["off", "watch", "block", "claim"], form: "https://help.instagram.com/contact/552695131608132", search: (q) => `https://www.instagram.com/explore/search/keyword/?q=${enc(q)}`, hint: "Reels audio & uploads · Meta Rights Manager for claims" },
  { id: "snapchat", name: "Snapchat", kind: "social", color: "#FFFC00", modes: ["off", "watch", "block"], takedown: "snapchat", search: (q) => `https://www.snapchat.com/search?q=${enc(q)}`, hint: "Sounds & Spotlight" },
  { id: "soundcloud", name: "SoundCloud", kind: "dsp", color: "#FF5500", modes: ["off", "watch", "block"], takedown: "soundcloud", search: (q) => `https://soundcloud.com/search?q=${enc(q)}`, hint: "Leaks & unauthorised uploads" },
  { id: "deezer", name: "Deezer", kind: "dsp", color: "#A238FF", modes: ["off", "watch", "block"], takedown: "deezer", search: (q) => `https://www.deezer.com/search/${enc(q)}`, hint: "Checked by ISRC" },
  { id: "tidal", name: "TIDAL", kind: "dsp", color: "#00FFFF", modes: ["off", "watch", "block"], takedown: "tidal", search: (q) => `https://listen.tidal.com/search?q=${enc(q)}`, hint: "Hi-fi store copies" },
  { id: "amazon", name: "Amazon Music", kind: "dsp", color: "#25D1DA", modes: ["off", "watch", "block"], takedown: "amazon", search: (q) => `https://music.amazon.com/search/${enc(q)}`, hint: "Amazon Music & Prime" },
  { id: "bandcamp", name: "Bandcamp", kind: "dsp", color: "#1DA0C3", modes: ["off", "watch", "block"], form: "https://bandcamp.com/copyright", search: (q) => `https://bandcamp.com/search?q=${enc(q)}`, hint: "Direct-sale copies" },
  { id: "audius", name: "Audius", kind: "dsp", color: "#CC0FE0", modes: ["off", "watch", "block"], form: "https://help.audius.co/copyright/what-are-the-audius-copyright-policies-and-processes", search: (q) => `https://audius.co/search/${enc(q)}`, hint: "Web3 streaming uploads" },
];

export const MODE_LABEL: Record<Mode, string> = { off: "Off", watch: "Watch", block: "Block", claim: "Claim" };
export const platformMode = (platforms: Record<string, string> | null | undefined, id: string): Mode => {
  const p = SHIELD_PLATFORMS.find((x) => x.id === id);
  const v = platforms?.[id] as Mode | undefined;
  return v && p?.modes.includes(v) ? v : "off";
};
export function setPlatformMode(platforms: Record<string, string> | null | undefined, id: string, mode: Mode): Record<string, string> {
  const next = { ...(platforms ?? {}) };
  if (mode === "off" || !SHIELD_PLATFORMS.find((x) => x.id === id)?.modes.includes(mode)) delete next[id];
  else next[id] = mode;
  return next;
}
/** same mode on every platform that supports it (others fall back to the strongest they support) */
export function allPlatforms(mode: Mode): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of SHIELD_PLATFORMS) {
    if (mode === "off") continue;
    out[p.id] = p.modes.includes(mode) ? mode : "block";
  }
  return out;
}
export const platformsActive = (platforms: Record<string, string> | null | undefined) => SHIELD_PLATFORMS.filter((p) => platformMode(platforms, p.id) !== "off").length;

// ------------------------------------------------------------------ protection score
export type ScoreInput = {
  status?: string;
  unlock_at?: string | null;
  policy?: string;
  content_id?: boolean;
  block_where?: string[];
  strict?: boolean;
  notify_owner?: boolean;
  isrc?: string | null;
  file_path?: string | null;
  meta_seal?: string | null;
  credits?: Credit[] | null;
  platforms?: Record<string, string> | null;
  acr_status?: string | null;
};
const ALL = ["chat", "video", "space", "release", "send", "sound", "short"];
export function protectionScore(w: ScoreInput, now = Date.now()): { score: number; todo: string[] } {
  const todo: string[] = [];
  let s = 0;
  const live = w.status === "locked" && (!w.unlock_at || new Date(w.unlock_at).getTime() > now);
  if (live) s += 25; else todo.push("Lock the song");
  const where = w.block_where ?? ALL;
  const cover = ALL.filter((x) => where.includes(x)).length / ALL.length;
  s += Math.round(cover * 15);
  if (cover < 1) todo.push("Block everywhere (TikTok sound, chats, spaces, distribution)");
  if (w.policy !== "track") s += 5; else todo.push("Switch policy to Block");
  if (w.content_id) s += 5; else todo.push("Turn on Content ID matching");
  if (w.strict) s += 5; else todo.push("Enable strict matching");
  if (w.notify_owner !== false) s += 3; else todo.push("Turn alerts on");
  if (w.file_path) s += 7; else todo.push("Keep the original in your vault");
  if (w.acr_status === "ready") s += 5; else todo.push("Sync to ACRCloud");
  if (w.isrc) s += 5; else todo.push("Add the ISRC");
  if (cleanCredits(w.credits).length) s += 5; else todo.push("Add credits for every artist");
  if (w.meta_seal) s += 10; else todo.push("Seal the metadata");
  const n = platformsActive(w.platforms);
  s += Math.round(Math.min(1, n / 6) * 10);
  if (n < 6) todo.push("Protect 6+ platforms");
  return { score: Math.min(100, s), todo };
}

// ------------------------------------------------------------------ Instagram links
const RESERVED = new Set(["p", "reel", "reels", "explore", "stories", "accounts", "direct", "tv", "about", "legal", "web", "developer", "directory", "challenge", "emailsignup", "login", "music", "audio"]);
export type Parsed = { ok: true; url: string; value: string } | { ok: false; error: string };

/** @handle, handle or any instagram.com/handle URL → canonical https://www.instagram.com/handle/ */
export function parseInstagramProfile(input: string): Parsed {
  let s = (input ?? "").trim();
  if (!s) return { ok: false, error: "Enter your Instagram username or profile link" };
  if (/^https?:\/\//i.test(s) || /^(www\.)?instagram\.com\//i.test(s)) {
    s = s.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
    if (!/^instagram\.com\//i.test(s)) return { ok: false, error: "That isn't an Instagram link" };
    s = s.slice("instagram.com/".length).split(/[/?#]/)[0];
  }
  s = s.replace(/^@/, "");
  if (!/^[A-Za-z0-9._]{1,30}$/.test(s) || RESERVED.has(s.toLowerCase())) return { ok: false, error: "That doesn't look like a profile username" };
  if (/^\.|\.$|\.\./.test(s)) return { ok: false, error: "Usernames can't start or end with a dot or contain “..”" };
  return { ok: true, url: `https://www.instagram.com/${s}/`, value: s };
}

/** Instagram audio page: https://www.instagram.com/reels/audio/<id>/ */
export function parseInstagramSong(input: string): Parsed {
  const s = (input ?? "").trim();
  if (!s) return { ok: false, error: "Paste the Instagram song link" };
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return { ok: false, error: "That isn't a valid link" };
  }
  if (!/^(www\.)?instagram\.com$/i.test(u.hostname)) return { ok: false, error: "That isn't an Instagram link" };
  const m = u.pathname.match(/^\/reels\/audio\/(\d{5,25})\/?$/);
  if (!m) return { ok: false, error: "Use the song page link — it looks like instagram.com/reels/audio/123456…" };
  return { ok: true, url: `https://www.instagram.com/reels/audio/${m[1]}/`, value: m[1] };
}

export function igCaption(o: { title: string; artist?: string; songUrl?: string | null; profileUrl?: string | null }): string {
  return [`🎵 ${o.title}${o.artist ? ` — ${o.artist}` : ""}`, o.songUrl ? `Use the sound: ${o.songUrl}` : "", o.profileUrl ? `Artist: ${o.profileUrl}` : ""].filter(Boolean).join("\n");
}
