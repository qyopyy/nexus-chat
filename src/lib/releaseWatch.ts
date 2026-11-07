/** Takedown protection helpers: which store a release link belongs to, and how to watch it. */
export type WatchPlatform = "spotify" | "apple" | "youtube" | "deezer" | "soundcloud" | "tidal" | "isrc";

export const WATCH_LABEL: Record<WatchPlatform, { name: string; color: string }> = {
  spotify: { name: "Spotify", color: "#1DB954" },
  apple: { name: "Apple Music", color: "#FA243C" },
  youtube: { name: "YouTube", color: "#FF0033" },
  deezer: { name: "Deezer", color: "#A238FF" },
  soundcloud: { name: "SoundCloud", color: "#FF5500" },
  tidal: { name: "TIDAL", color: "#111111" },
  isrc: { name: "ISRC (Deezer)", color: "#5865F2" },
};

export function platformOf(raw: string): WatchPlatform | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const h = u.hostname.replace(/^www\.|^m\./, "");
  if (h === "open.spotify.com") return "spotify";
  if (h === "music.apple.com" || h === "itunes.apple.com") return "apple";
  if (h === "youtube.com" || h === "music.youtube.com" || h === "youtu.be") return "youtube";
  if (h === "api.deezer.com" && /^\/track\/isrc:/i.test(u.pathname)) return "isrc";
  if (h === "deezer.com" || h === "api.deezer.com") return "deezer";
  if (h === "soundcloud.com") return "soundcloud";
  if (h === "tidal.com" || h === "listen.tidal.com") return "tidal";
  return null;
}

