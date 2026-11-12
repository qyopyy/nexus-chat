/** URL parsing and text cleanup for legal Acetate imports. No network and no audio. */

export type ImportSource = "spotify" | "youtube" | "soundcloud";

export type ParsedLink =
  | { source: "spotify"; kind: "track" | "album" | "playlist" | "episode"; id: string; url: string }
  | { source: "youtube"; kind: "video" | "playlist"; id: string; url: string }
  | { source: "soundcloud"; kind: "track" | "playlist"; url: string };

const SPOTIFY_ID = /^[A-Za-z0-9]{10,40}$/;
const YT_VIDEO = /^[A-Za-z0-9_-]{11}$/;
const YT_LIST = /^[A-Za-z0-9_-]{12,80}$/;

const AUDIO_KEYS = new Set([
  "preview_url",
  "stream_url",
  "download_url",
  "audio",
  "audio_url",
  "media",
  "transcodings",
  "progressive",
]);

export function cleanText(value: unknown, max: number) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function httpsUrl(value: unknown, max = 500) {
  try {
    const url = new URL(String(value ?? "").trim());
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    const text = url.toString();
    if (text.length > max || /\s/.test(text)) return null;
    return text;
  } catch {
    return null;
  }
}

export function hostOf(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function knownSource(value: string): ImportSource | null {
  const host = hostOf(value);
  if (!host) return null;
  if (host === "open.spotify.com" || host === "spotify.link") return "spotify";
  if (
    host === "youtube.com" ||
    host === "www.youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtu.be" ||
    host === "www.youtube-nocookie.com"
  ) {
    return "youtube";
  }
  if (host === "soundcloud.com" || host === "m.soundcloud.com" || host === "on.soundcloud.com" || host.endsWith(".soundcloud.com")) {
    return "soundcloud";
  }
  return null;
}

export function soundCloudPage(value: string) {
  const url = httpsUrl(value);
  if (!url || knownSource(url) !== "soundcloud") return null;
  const path = new URL(url).pathname.toLowerCase();
  if (path.includes("/streams") || path.split("/").includes("stream") || path.includes("/download")) return null;
  return url;
}

function spotifyKind(segment: string): "track" | "album" | "playlist" | "episode" {
  if (segment === "album" || segment === "playlist" || segment === "episode") return segment;
  return "track";
}

export function parseImportLink(raw: string): ParsedLink | null {
  const text = raw.trim();
  const uri = text.match(/^spotify:(track|album|playlist|episode):([A-Za-z0-9]{10,40})$/i);
  if (uri && SPOTIFY_ID.test(uri[2])) {
    const kind = uri[1].toLowerCase() as "track" | "album" | "playlist" | "episode";
    return { source: "spotify", kind, id: uri[2], url: `https://open.spotify.com/${kind}/${uri[2]}` };
  }
  const url = httpsUrl(text);
  if (!url) return null;
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();

  if (host === "open.spotify.com") {
    const parts = parsed.pathname.split("/").filter(Boolean);
    const locale = parts[0]?.startsWith("intl-") ? 1 : 0;
    const kind = parts[locale];
    const id = parts[locale + 1] || "";
    if (!kind || !SPOTIFY_ID.test(id)) return null;
    if (kind !== "track" && kind !== "album" && kind !== "playlist" && kind !== "episode") return null;
    return { source: "spotify", kind: spotifyKind(kind), id, url: `https://open.spotify.com/${kind}/${id}` };
  }

  if (host === "youtu.be") {
    const id = parsed.pathname.split("/").filter(Boolean)[0] || "";
    if (!YT_VIDEO.test(id)) return null;
    return { source: "youtube", kind: "video", id, url: `https://www.youtube.com/watch?v=${id}` };
  }

  if (host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com" || host === "music.youtube.com" || host === "www.youtube-nocookie.com") {
    const list = parsed.searchParams.get("list") || "";
    const video = parsed.searchParams.get("v") || "";
    const pieces = parsed.pathname.split("/").filter(Boolean);
    const short = pieces[0] === "shorts" || pieces[0] === "embed" || pieces[0] === "live" ? pieces[1] || "" : "";
    const id = YT_VIDEO.test(video) ? video : YT_VIDEO.test(short) ? short : "";
    if (id) return { source: "youtube", kind: "video", id, url: `https://www.youtube.com/watch?v=${id}` };
    if (pieces[0] === "playlist" && YT_LIST.test(list)) {
      return { source: "youtube", kind: "playlist", id: list, url: `https://www.youtube.com/playlist?list=${list}` };
    }
    if (YT_LIST.test(list) && !id) {
      return { source: "youtube", kind: "playlist", id: list, url: `https://www.youtube.com/playlist?list=${list}` };
    }
    return null;
  }

  if (knownSource(url) === "soundcloud") {
    const page = soundCloudPage(url);
    if (!page) return null;
    const parts = new URL(page).pathname.split("/").filter(Boolean);
    if (!parts.length) return null;
    const kind = parts.includes("sets") ? "playlist" : "track";
    return { source: "soundcloud", kind, url: page.split("?")[0] };
  }

  return null;
}

export function normTitle(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Metadata responses must not carry stream, preview, or download URLs. */
export function assertMetadataOnly(value: unknown): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) assertMetadataOnly(item);
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (AUDIO_KEYS.has(key)) throw new Error("Refusing to return an audio URL");
    assertMetadataOnly(child);
  }
}

export function youtubeIsoDuration(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  const ms = ((hours * 60 + minutes) * 60 + seconds) * 1000;
  if (!Number.isFinite(ms) || ms < 0 || ms >= 86_400_000) return null;
  return ms;
}
