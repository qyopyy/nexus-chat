import { detectPlatform, parseCount, spotifyArtistId } from "./links";

/** Platforms we can refresh with a live audience count (not manual-only). */
export const LIVE_FOLLOWER_TYPES = new Set([
  "x",
  "youtube",
  "tiktok",
  "twitch",
  "github",
  "soundcloud",
  "spotify",
]);

export function supportsLiveFollowers(type: string, url: string): boolean {
  if (type === "spotify") return !!spotifyArtistId(url);
  return LIVE_FOLLOWER_TYPES.has(type);
}

/** Stable cache key for a profile link (platform + handle / id). */
export function followersCacheKey(type: string, url: string): string | null {
  const handle = platformHandle(type, url);
  if (!handle) return null;
  return `${type}:${handle}`;
}

/** Extract the public handle / channel id used to look up audience size. */
export function platformHandle(type: string, url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\.|^mobile\./, "");
    const parts = u.pathname.replace(/\/+$/, "").split("/").filter(Boolean);

    if (type === "x" || host === "x.com" || host === "twitter.com" || host.endsWith(".x.com") || host.endsWith(".twitter.com")) {
      const skip = new Set(["home", "explore", "search", "i", "intent", "share", "hashtag", "settings", "notifications", "messages", "compose"]);
      const h = parts[0];
      if (!h || skip.has(h.toLowerCase()) || h.startsWith("status")) return null;
      return h.replace(/^@/, "").toLowerCase();
    }

    if (type === "youtube" || host.includes("youtube.com") || host === "youtu.be") {
      if (parts[0]?.startsWith("@")) return parts[0];
      if (parts[0] === "channel" && parts[1]) return parts[1];
      if ((parts[0] === "c" || parts[0] === "user") && parts[1]) return parts[1];
      if (host === "youtu.be") return null; // video link, not a channel
      return parts[0]?.startsWith("@") ? parts[0] : parts[0] ? `@${parts[0]}` : null;
    }

    if (type === "tiktok" || host.includes("tiktok.com")) {
      const h = parts[0]?.startsWith("@") ? parts[0].slice(1) : parts[0];
      if (!h || h === "music" || h === "tag" || h === "video") return null;
      return h.toLowerCase();
    }

    if (type === "twitch" || host.includes("twitch.tv")) {
      const skip = new Set(["directory", "videos", "p", "settings", "inventory", "subscriptions", "wallet", "drops"]);
      const h = parts[0];
      if (!h || skip.has(h.toLowerCase())) return null;
      return h.toLowerCase();
    }

    if (type === "github" || host === "github.com") {
      const skip = new Set(["settings", "marketplace", "explore", "topics", "collections", "events", "sponsors", "orgs", "organizations", "login", "signup"]);
      const h = parts[0];
      if (!h || skip.has(h.toLowerCase())) return null;
      return h;
    }

    if (type === "soundcloud" || host.includes("soundcloud.com")) {
      const skip = new Set(["discover", "stream", "you", "upload", "pages", "search", "charts", "genres"]);
      const h = parts[0];
      if (!h || skip.has(h.toLowerCase())) return null;
      return h;
    }

    if (type === "spotify") return spotifyArtistId(url);

    // Fall back: first path segment for known platforms
    const detected = detectPlatform(url);
    if (detected.id !== "website" && parts[0]) return parts[0].replace(/^@/, "");
    return null;
  } catch {
    return null;
  }
}

/** Parse human audience strings from scraped pages ("30.6M subscribers", "1.2 million"). */
export function parseAudienceText(raw: string): number | null {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/,/g, "")
    .replace(/\s+(subscribers?|followers?|fans|members?)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const million = s.match(/^([\d.]+)\s*million$/);
  if (million) return Math.round(parseFloat(million[1]) * 1e6);
  const billion = s.match(/^([\d.]+)\s*billion$/);
  if (billion) return Math.round(parseFloat(billion[1]) * 1e9);
  const thousand = s.match(/^([\d.]+)\s*thousand$/);
  if (thousand) return Math.round(parseFloat(thousand[1]) * 1e3);
  return parseCount(s.replace(/\s/g, ""));
}

export type LiveFollowersResult = {
  followers: number | null;
  platform: string;
  handle: string | null;
  source?: string;
};

const mem = new Map<string, { at: number; value: number | null }>();
const inflight = new Map<string, Promise<number | null>>();
const CLIENT_TTL_MS = 5 * 60_000;

/** Fetch a live follower/subscriber count for a profile link URL. */
export async function fetchLiveFollowers(type: string, url: string): Promise<number | null> {
  if (!supportsLiveFollowers(type, url)) return null;
  const key = followersCacheKey(type, url) ?? `${type}:${url}`;
  const hit = mem.get(key);
  if (hit && Date.now() - hit.at < CLIENT_TTL_MS) return hit.value;
  const pending = inflight.get(key);
  if (pending) return pending;

  const job = (async () => {
    try {
      // Spotify stays on the existing edge function for artist IDs.
      if (type === "spotify") {
        const { sp } = await import("./music");
        const id = spotifyArtistId(url);
        if (!id) return null;
        const r = await sp<{ artists: { followers: number | null }[] }>("artists", { ids: [id] });
        return r.artists?.[0]?.followers ?? null;
      }
      const r = await fetch(`/api/followers?url=${encodeURIComponent(url)}&type=${encodeURIComponent(type)}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!r.ok) return null;
      const j = (await r.json()) as LiveFollowersResult;
      return typeof j.followers === "number" && j.followers >= 0 ? j.followers : null;
    } catch {
      return null;
    }
  })();

  inflight.set(key, job);
  try {
    const value = await job;
    mem.set(key, { at: Date.now(), value });
    return value;
  } finally {
    inflight.delete(key);
  }
}
