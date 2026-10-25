import type { ProfileLink } from "./types";

export type Platform = {
  id: string;
  label: string;
  color: string;
  /** short glyph drawn inside the colored chip */
  glyph: string;
  hosts: string[];
  /** builds a URL from a bare handle */
  fromHandle?: (h: string) => string;
};

export const PLATFORMS: Platform[] = [
  { id: "x", label: "X / Twitter", color: "#000000", glyph: "𝕏", hosts: ["x.com", "twitter.com"], fromHandle: (h) => `https://x.com/${h}` },
  { id: "instagram", label: "Instagram", color: "linear-gradient(45deg,#feda75,#fa7e1e,#d62976,#962fbf,#4f5bd5)", glyph: "◎", hosts: ["instagram.com"], fromHandle: (h) => `https://instagram.com/${h}` },
  { id: "youtube", label: "YouTube", color: "#FF0033", glyph: "▶", hosts: ["youtube.com", "youtu.be"], fromHandle: (h) => `https://youtube.com/@${h}` },
  { id: "tiktok", label: "TikTok", color: "#111111", glyph: "♪", hosts: ["tiktok.com"], fromHandle: (h) => `https://tiktok.com/@${h}` },
  { id: "telegram", label: "Telegram", color: "#2AABEE", glyph: "➤", hosts: ["t.me", "telegram.me"], fromHandle: (h) => `https://t.me/${h}` },
  { id: "spotify", label: "Spotify", color: "#1DB954", glyph: "◉", hosts: ["open.spotify.com", "spotify.com"] },
  { id: "soundcloud", label: "SoundCloud", color: "#FF5500", glyph: "☁", hosts: ["soundcloud.com"], fromHandle: (h) => `https://soundcloud.com/${h}` },
  { id: "applemusic", label: "Apple Music", color: "#FA243C", glyph: "♫", hosts: ["music.apple.com"] },
  { id: "twitch", label: "Twitch", color: "#9146FF", glyph: "▣", hosts: ["twitch.tv"], fromHandle: (h) => `https://twitch.tv/${h}` },
  { id: "discord", label: "Discord", color: "#5865F2", glyph: "◈", hosts: ["discord.gg", "discord.com"] },
  { id: "github", label: "GitHub", color: "#24292F", glyph: "⌥", hosts: ["github.com"], fromHandle: (h) => `https://github.com/${h}` },
  { id: "snapchat", label: "Snapchat", color: "#FFFC00", glyph: "👻", hosts: ["snapchat.com"], fromHandle: (h) => `https://snapchat.com/add/${h}` },
  { id: "facebook", label: "Facebook", color: "#1877F2", glyph: "f", hosts: ["facebook.com", "fb.com"], fromHandle: (h) => `https://facebook.com/${h}` },
  { id: "linkedin", label: "LinkedIn", color: "#0A66C2", glyph: "in", hosts: ["linkedin.com"] },
  { id: "threads", label: "Threads", color: "#000000", glyph: "@", hosts: ["threads.net", "threads.com"], fromHandle: (h) => `https://threads.net/@${h}` },
  { id: "website", label: "Website", color: "#4E5058", glyph: "🌐", hosts: [] },
];

export const platformById = (id: string) => PLATFORMS.find((p) => p.id === id) ?? PLATFORMS[PLATFORMS.length - 1];

export function detectPlatform(url: string): Platform {
  try {
    const host = new URL(url).hostname.replace(/^www\.|^m\./, "");
    return PLATFORMS.find((p) => p.hosts.some((h) => host === h || host.endsWith(`.${h}`))) ?? platformById("website");
  } catch {
    return platformById("website");
  }
}

/** Accepts a full URL, "domain.com/x" or a bare @handle (with a chosen platform). Returns null when unusable. */
export function normalizeLink(input: string, platformId?: string): ProfileLink | null {
  let s = input.trim();
  if (!s) return null;
  const plat = platformId ? platformById(platformId) : null;
  if (/^@?[\w.]{1,40}$/.test(s) && plat?.fromHandle) s = plat.fromHandle(s.replace(/^@/, ""));
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (!u.hostname.includes(".")) return null;
    const p = detectPlatform(u.toString());
    return { type: p.id, url: u.toString().slice(0, 300) };
  } catch {
    return null;
  }
}

/** Human-friendly text for a link row: @handle when we can tell, else the host + path */
export function linkLabel(l: ProfileLink): string {
  if (l.label) return l.label;
  try {
    const u = new URL(l.url);
    const path = u.pathname.replace(/\/+$/, "");
    const seg = path.split("/").filter(Boolean);
    if (l.type !== "website" && l.type !== "spotify" && l.type !== "applemusic" && seg[0]) {
      const h = seg[0] === "add" && seg[1] ? seg[1] : seg[0];
      return h.startsWith("@") ? h : `@${h}`;
    }
    return u.hostname.replace(/^www\./, "") + (path.length > 1 && l.type === "website" ? path : "");
  } catch {
    return l.url;
  }
}

/** open.spotify.com/{track|album|playlist|artist|episode}/{id} → embed URL */
export function spotifyEmbed(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/(?:open\.spotify\.com\/(?:intl-[a-z-]+\/)?|spotify:)(track|album|playlist|artist|episode|show)[/:]([A-Za-z0-9]+)/);
  return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=generator&theme=0` : null;
}

export function spotifyKind(url: string | null | undefined) {
  const m = url?.match(/(track|album|playlist|artist|episode|show)[/:]/);
  return m?.[1] ?? null;
}

/** "12.4k", "1,200", "3.1M" → number */
export function parseCount(s: string): number | null {
  const m = s.trim().toLowerCase().replace(/[\s,]/g, "").match(/^(\d+(?:\.\d+)?)([kmb])?$/);
  if (!m) return null;
  const n = parseFloat(m[1]) * (m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : m[2] === "b" ? 1e9 : 1);
  return Math.round(n);
}
export const fmtCount = (n: number) =>
  n >= 1e9 ? `${+(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${+(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : String(n);
/** what the platform calls its audience */
export const audienceWord = (type: string) => (type === "youtube" ? "subscribers" : type === "twitch" || type === "spotify" ? "followers" : type === "discord" || type === "telegram" ? "members" : "followers");
/** Spotify artist id from a link */
export const spotifyArtistId = (url: string) => url.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?artist\/([A-Za-z0-9]{22})/)?.[1] ?? null;
