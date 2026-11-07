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
  // music / artist profiles
  { id: "youtubemusic", label: "YouTube Music", color: "#FF0000", glyph: "◉", hosts: ["music.youtube.com"] },
  { id: "deezer", label: "Deezer", color: "#A238FF", glyph: "≋", hosts: ["deezer.com", "deezer.page.link", "dzr.page.link"] },
  { id: "tidal", label: "TIDAL", color: "#000000", glyph: "◆", hosts: ["tidal.com", "listen.tidal.com"] },
  { id: "amazonmusic", label: "Amazon Music", color: "#25D1DA", glyph: "♪", hosts: ["music.amazon.com", "music.amazon.co.uk", "music.amazon.de", "amazon.com/music"] },
  { id: "audiomack", label: "Audiomack", color: "#FFA200", glyph: "≈", hosts: ["audiomack.com"], fromHandle: (h) => `https://audiomack.com/${h}` },
  { id: "bandcamp", label: "Bandcamp", color: "#1DA0C3", glyph: "◢", hosts: ["bandcamp.com"], fromHandle: (h) => `https://${h}.bandcamp.com` },
  { id: "beatport", label: "Beatport", color: "#01FF95", glyph: "♬", hosts: ["beatport.com"] },
  { id: "boomplay", label: "Boomplay", color: "#0C1E3C", glyph: "▷", hosts: ["boomplay.com", "boomplaymusic.com"] },
  { id: "anghami", label: "Anghami", color: "#7A2BFF", glyph: "◑", hosts: ["anghami.com", "play.anghami.com"] },
  { id: "shazam", label: "Shazam", color: "#0088FF", glyph: "S", hosts: ["shazam.com"] },
  { id: "genius", label: "Genius", color: "#FFFF64", glyph: "G", hosts: ["genius.com"] },
  { id: "musixmatch", label: "Musixmatch", color: "#FF6050", glyph: "M", hosts: ["musixmatch.com"] },
  // more socials
  { id: "bluesky", label: "Bluesky", color: "#1185FE", glyph: "☁", hosts: ["bsky.app"], fromHandle: (h) => `https://bsky.app/profile/${h.includes(".") ? h : `${h}.bsky.social`}` },
  { id: "kick", label: "Kick", color: "#53FC18", glyph: "K", hosts: ["kick.com"], fromHandle: (h) => `https://kick.com/${h}` },
  { id: "reddit", label: "Reddit", color: "#FF4500", glyph: "r/", hosts: ["reddit.com"], fromHandle: (h) => `https://reddit.com/user/${h}` },
  { id: "pinterest", label: "Pinterest", color: "#E60023", glyph: "P", hosts: ["pinterest.com", "pin.it"], fromHandle: (h) => `https://pinterest.com/${h}` },
  { id: "patreon", label: "Patreon", color: "#FF424D", glyph: "●", hosts: ["patreon.com"], fromHandle: (h) => `https://patreon.com/${h}` },
  { id: "whatsapp", label: "WhatsApp", color: "#25D366", glyph: "✆", hosts: ["wa.me", "whatsapp.com", "chat.whatsapp.com"] },
  { id: "vk", label: "VK", color: "#0077FF", glyph: "VK", hosts: ["vk.com"], fromHandle: (h) => `https://vk.com/${h}` },
  // gaming
  { id: "steam", label: "Steam", color: "#171A21", glyph: "♨", hosts: ["steamcommunity.com", "store.steampowered.com"], fromHandle: (h) => `https://steamcommunity.com/id/${h}` },
  { id: "xbox", label: "Xbox", color: "#107C10", glyph: "X", hosts: ["xbox.com", "account.xbox.com"], fromHandle: (h) => `https://www.xbox.com/play/user/${encodeURIComponent(h)}` },
  { id: "playstation", label: "PlayStation", color: "#003791", glyph: "△", hosts: ["psnprofiles.com", "my.playstation.com"], fromHandle: (h) => `https://psnprofiles.com/${h}` },
  { id: "epicgames", label: "Epic Games", color: "#2F2D2E", glyph: "E", hosts: ["epicgames.com", "store.epicgames.com"] },
  { id: "roblox", label: "Roblox", color: "#E2231A", glyph: "◧", hosts: ["roblox.com"] },
  { id: "chesscom", label: "Chess.com", color: "#81B64C", glyph: "♞", hosts: ["chess.com"], fromHandle: (h) => `https://www.chess.com/member/${h}` },
  // music & video
  { id: "lastfm", label: "Last.fm", color: "#D51007", glyph: "as", hosts: ["last.fm", "lastfm.com"], fromHandle: (h) => `https://www.last.fm/user/${h}` },
  { id: "mixcloud", label: "Mixcloud", color: "#5000FF", glyph: "☁", hosts: ["mixcloud.com"], fromHandle: (h) => `https://www.mixcloud.com/${h}` },
  { id: "qobuz", label: "Qobuz", color: "#000000", glyph: "Q", hosts: ["qobuz.com", "open.qobuz.com"] },
  { id: "vimeo", label: "Vimeo", color: "#1AB7EA", glyph: "v", hosts: ["vimeo.com"], fromHandle: (h) => `https://vimeo.com/${h}` },
  // social & creator
  { id: "mastodon", label: "Mastodon", color: "#6364FF", glyph: "M", hosts: ["mastodon.social", "mstdn.social", "mas.to"] },
  { id: "kofi", label: "Ko-fi", color: "#FF5E5B", glyph: "☕", hosts: ["ko-fi.com"], fromHandle: (h) => `https://ko-fi.com/${h}` },
  { id: "buymeacoffee", label: "Buy Me a Coffee", color: "#FFDD00", glyph: "☕", hosts: ["buymeacoffee.com"], fromHandle: (h) => `https://buymeacoffee.com/${h}` },
  { id: "linktree", label: "Linktree", color: "#43E55E", glyph: "✳", hosts: ["linktr.ee"], fromHandle: (h) => `https://linktr.ee/${h}` },
  { id: "substack", label: "Substack", color: "#FF6719", glyph: "S", hosts: ["substack.com"], fromHandle: (h) => `https://${h}.substack.com` },
  { id: "medium", label: "Medium", color: "#000000", glyph: "M", hosts: ["medium.com"], fromHandle: (h) => `https://medium.com/@${h}` },
  { id: "behance", label: "Behance", color: "#1769FF", glyph: "Bē", hosts: ["behance.net"], fromHandle: (h) => `https://www.behance.net/${h}` },
  { id: "dribbble", label: "Dribbble", color: "#EA4C89", glyph: "◍", hosts: ["dribbble.com"], fromHandle: (h) => `https://dribbble.com/${h}` },
  { id: "website", label: "Website", color: "#4E5058", glyph: "🌐", hosts: [] },
];

/** categories for Settings → Connections */
export const CONNECTION_GROUPS: { label: string; ids: string[] }[] = [
  { label: "Social", ids: ["instagram", "tiktok", "x", "youtube", "snapchat", "threads", "bluesky", "facebook", "reddit", "pinterest", "linkedin", "mastodon", "telegram", "whatsapp", "vk"] },
  { label: "Music", ids: ["soundcloud", "applemusic", "youtubemusic", "deezer", "tidal", "amazonmusic", "audiomack", "bandcamp", "beatport", "lastfm", "mixcloud", "qobuz", "shazam", "genius"] },
  { label: "Gaming & streaming", ids: ["twitch", "kick", "steam", "xbox", "playstation", "epicgames", "roblox", "chesscom", "discord", "vimeo"] },
  { label: "Creator & support", ids: ["patreon", "kofi", "buymeacoffee", "linktree", "substack", "medium", "behance", "dribbble", "github", "website"] },
];

/** platforms shown under "Music" on profiles */
export const MUSIC_PLATFORMS = new Set(["spotify", "applemusic", "youtubemusic", "soundcloud", "deezer", "tidal", "amazonmusic", "audiomack", "bandcamp", "beatport", "boomplay", "anghami", "shazam", "genius", "musixmatch"]);

/** open.spotify.com/artist/{id} (any locale prefix) */
export function spotifyArtistId(url: string | null | undefined): string | null {
  const m = url?.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?artist\/([A-Za-z0-9]{22})/);
  return m ? m[1] : null;
}

export const platformById = (id: string) => PLATFORMS.find((p) => p.id === id) ?? PLATFORMS[PLATFORMS.length - 1];

export function detectPlatform(url: string): Platform {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    const hostPath = `${host}${u.pathname}`;
    // most specific match wins (music.youtube.com beats youtube.com)
    let best: Platform | null = null;
    let bestLen = 0;
    for (const p of PLATFORMS)
      for (const h of p.hosts) {
        const hit = h.includes("/") ? hostPath.startsWith(h) : host === h || host.endsWith(`.${h}`);
        if (hit && h.length > bestLen) {
          best = p;
          bestLen = h.length;
        }
      }
    return best ?? platformById("website");
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
  if (l.type === "spotify" && spotifyArtistId(l.url)) return "Artist profile";
  if (l.type === "bandcamp") {
    try {
      const sub = new URL(l.url).hostname.split(".")[0];
      if (sub && sub !== "bandcamp" && sub !== "www") return sub;
    } catch {
      /* fall through */
    }
  }
  try {
    const u = new URL(l.url);
    const path = u.pathname.replace(/\/+$/, "");
    const seg = path.split("/").filter(Boolean);
    if (MUSIC_PLATFORMS.has(l.type) && seg.some((x) => /^artists?$/i.test(x))) return "Artist profile";
    if ((l.type === "bluesky" || l.type === "reddit") && seg[1]) return `@${seg[1]}`;
    const noHandle = ["website", "spotify", "applemusic", "youtubemusic", "deezer", "tidal", "amazonmusic", "beatport", "boomplay", "anghami", "shazam", "genius", "musixmatch", "whatsapp"];
    if (!noHandle.includes(l.type) && seg[0]) {
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

/** music.apple.com/…/{album|song|playlist}/… → embed.music.apple.com player */
export function appleMusicEmbed(url: string | null | undefined): string | null {
  if (!url || !/music\.apple\.com/i.test(url)) return null;
  try {
    const u = new URL(url.trim());
    if (u.hostname.includes("embed.music.apple.com")) return u.toString();
    // https://music.apple.com/{cc}/album/…/id?i=songId  or /song/ /playlist/
    const path = u.pathname.replace(/^\/+/, "");
    if (!path) return null;
    const emb = new URL(`https://embed.music.apple.com/${path}`);
    u.searchParams.forEach((v, k) => emb.searchParams.set(k, v));
    emb.searchParams.set("theme", "dark");
    return emb.toString();
  } catch {
    return null;
  }
}

/** soundcloud.com/… → w.soundcloud.com/player/?url=… */
export function soundcloudEmbed(url: string | null | undefined): string | null {
  if (!url || !/soundcloud\.com/i.test(url)) return null;
  try {
    const u = new URL(url.trim());
    if (u.hostname.includes("w.soundcloud.com") || u.pathname.includes("/player/")) return u.toString();
    // Already an API track resource
    if (/api\.soundcloud\.com/i.test(u.hostname)) {
      return `https://w.soundcloud.com/player/?url=${encodeURIComponent(u.toString())}&color=%23ff5500&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false`;
    }
    const clean = `${u.origin}${u.pathname}`.replace(/\/+$/, "");
    return `https://w.soundcloud.com/player/?url=${encodeURIComponent(clean)}&color=%23ff5500&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=false`;
  } catch {
    return null;
  }
}

export type MusicEmbed = { kind: "spotify" | "apple" | "soundcloud" | "audio"; src: string; height: number };

/** Resolve a Link / profile music URL into a playable embed or direct audio src. */
export function resolveMusicEmbed(url: string | null | undefined): MusicEmbed | null {
  if (!url?.trim()) return null;
  const raw = url.trim();
  const sp = spotifyEmbed(raw);
  if (sp) return { kind: "spotify", src: sp, height: 152 };
  const apple = appleMusicEmbed(raw);
  if (apple) return { kind: "apple", src: apple, height: 175 };
  const sc = soundcloudEmbed(raw);
  if (sc) return { kind: "soundcloud", src: sc, height: 166 };
  if (/^https?:\/\//i.test(raw) && (/\.(mp3|wav|m4a|aac|ogg|flac|webm)(\?|$)/i.test(raw) || /linkbio-music/i.test(raw))) {
    return { kind: "audio", src: raw, height: 54 };
  }
  return null;
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
