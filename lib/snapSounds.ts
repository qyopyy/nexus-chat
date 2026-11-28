// Profile sounds: pick a song from Spotify and it plays on your profile for 24 hours (48 hours for VIP, staff and
// admins). The time limit is enforced by the database (set_profile_sound), these helpers are what the screens use.
// Pure, no DOM, no network.

export const SOUND_HOURS = 24;
export const SOUND_HOURS_LONG = 48;
/** site roles that get the longer 48 hour sound (same group as unlimited storage) */
export const LONG_SOUND_ROLES = ["vip", "moderator", "admin", "owner"] as const;

export const soundHours = (role: string | null | undefined) => ((LONG_SOUND_ROLES as readonly string[]).includes(role ?? "") ? SOUND_HOURS_LONG : SOUND_HOURS);

export type SoundPick = { track_id: string; title: string; artist: string; cover_url: string | null; preview_url: string | null; spotify_url: string | null };
export type Sound = SoundPick & { user_id: string; created_at: string; expires_at: string };

const TRACK_ID = /^[A-Za-z0-9]{10,40}$/;
const text = (v: unknown, max: number) =>
  typeof v === "string"
    ? v
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim()
        .slice(0, max)
    : "";
const https = (v: unknown, max = 500) => (typeof v === "string" && /^https:\/\/[^\s]+$/.test(v) && v.length <= max ? v : null);

/** One result of the Spotify proxy's track search → what we store. Anything odd (no id, no title, non-https links) is cleaned or refused. */
export function pickFromSpotify(item: unknown): SoundPick | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  const id = typeof o.id === "string" && TRACK_ID.test(o.id) ? o.id : null;
  const title = text(o.name, 200);
  if (!id || !title) return null;
  const artists = Array.isArray(o.artists) ? (o.artists as { name?: unknown }[]).map((a) => text(a?.name, 80)).filter(Boolean) : [];
  const album = o.album && typeof o.album === "object" ? (o.album as Record<string, unknown>) : null;
  const url = https(o.url, 300);
  return {
    track_id: id,
    title,
    artist: artists.join(", ").slice(0, 300),
    cover_url: https(album?.image),
    preview_url: https(o.preview_url),
    spotify_url: url && /^https:\/\/open\.spotify\.com\//.test(url) ? url : `https://open.spotify.com/track/${id}`,
  };
}

export const isActive = (s: Pick<Sound, "expires_at"> | null | undefined, now: number) => !!s && Date.parse(s.expires_at) > now;

/** "23h left", "1h 05m left", "12m left", "Ended" */
export function timeLeftLabel(expiresAt: string, now: number): string {
  const ms = Date.parse(expiresAt) - now;
  if (!Number.isFinite(ms) || ms <= 0) return "Ended";
  const mins = Math.ceil(ms / 60_000);
  if (mins < 60) return `${mins}m left`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h >= 10 || m === 0 ? `${h}h left` : `${h}h ${String(m).padStart(2, "0")}m left`;
}

/** Spotify's own player for a track (plays a preview in the page, no login needed). */
export const embedUrl = (trackId: string) => (TRACK_ID.test(trackId) ? `https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0` : null);

/** Search box text → what we send ("" = don't search). */
export const cleanQuery = (q: string) => text(q.replace(/\s+/g, " "), 100);

/** People search: usernames are letters, digits, _ and . */
export const cleanPeopleQuery = (q: string) => q.replace(/^@+/, "").replace(/[^a-z0-9_.]/gi, "").slice(0, 32);
