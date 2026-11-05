"use client";

// Distribution dashboard extras: status history, smart links + analytics, playlist pitches,
// release readiness score, duplicate release, release defaults.

import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";
import { addTrack, createRelease, getRelease, saveTrack } from "./dist";
import { lyricsLookExplicit, type AudioCheck } from "./audio";
import type { DistRelease, DistTrack } from "./types";

export const SITE = typeof window !== "undefined" ? window.location.origin : "https://nexus-chat-plum.vercel.app";

// ------------------------------------------------------------------ status history
export type StatusLog = { id: number; release_id: string; status: DistRelease["status"]; actor: string | null; note: string | null; at: string };
export async function statusLog(releaseIds?: string[], limit = 60): Promise<StatusLog[]> {
  let q = supabase.from("dist_status_log").select("*").order("at", { ascending: false }).limit(limit);
  if (releaseIds) {
    if (!releaseIds.length) return [];
    q = q.in("release_id", releaseIds);
  }
  const { data } = await q;
  return (data ?? []) as StatusLog[];
}

// ------------------------------------------------------------------ smart links
export type SmartLink = {
  id: string;
  release_id: string;
  owner_id: string;
  slug: string;
  enabled: boolean;
  links: Record<string, string>;
  accent: string | null;
  headline: string | null;
  created_at: string;
  updated_at: string;
};
export const LINK_SERVICES: { id: string; name: string; color: string; hint: string }[] = [
  { id: "spotify", name: "Spotify", color: "#1DB954", hint: "https://open.spotify.com/album/…" },
  { id: "apple", name: "Apple Music", color: "#FA243C", hint: "https://music.apple.com/…" },
  { id: "youtube_music", name: "YouTube Music", color: "#FF0000", hint: "https://music.youtube.com/…" },
  { id: "youtube", name: "YouTube", color: "#FF0000", hint: "https://www.youtube.com/watch?v=…" },
  { id: "amazon", name: "Amazon Music", color: "#25D1DA", hint: "https://music.amazon.com/…" },
  { id: "deezer", name: "Deezer", color: "#A238FF", hint: "https://www.deezer.com/…" },
  { id: "tidal", name: "TIDAL", color: "#cccccc", hint: "https://tidal.com/…" },
  { id: "soundcloud", name: "SoundCloud", color: "#FF5500", hint: "https://soundcloud.com/…" },
  { id: "audiomack", name: "Audiomack", color: "#FFA200", hint: "https://audiomack.com/…" },
  { id: "boomplay", name: "Boomplay", color: "#E21B5A", hint: "https://www.boomplay.com/…" },
  { id: "beatport", name: "Beatport", color: "#01FF95", hint: "https://www.beatport.com/…" },
  { id: "bandcamp", name: "Bandcamp", color: "#1DA0C3", hint: "https://….bandcamp.com/…" },
  { id: "tiktok", name: "TikTok sound", color: "#FE2C55", hint: "https://www.tiktok.com/music/…" },
  { id: "snapchat", name: "Snapchat", color: "#FFFC00", hint: "https://www.snapchat.com/…" },
  { id: "instagram", name: "Instagram", color: "#E1306C", hint: "https://instagram.com/…" },
  { id: "website", name: "Website", color: "#9AA0A6", hint: "https://…" },
];
export const smartUrl = (slug: string) => `${SITE}/l/${slug}`;
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

export async function getSmartLink(releaseId: string) {
  const { data } = await supabase.from("smart_links").select("*").eq("release_id", releaseId).maybeSingle();
  return (data as SmartLink | null) ?? null;
}
export async function listSmartLinks(all = false) {
  const me = useApp.getState().userId;
  let q = supabase.from("smart_links").select("*").order("created_at", { ascending: false }).limit(300);
  if (!all) q = q.eq("owner_id", me);
  const { data } = await q;
  return (data ?? []) as SmartLink[];
}
export async function slugFreeLink(slug: string, linkId?: string) {
  const { data } = await supabase.rpc("smart_link_slug_free", { p_slug: slug, p_link: linkId ?? null });
  return !!data;
}
export async function createSmartLink(r: DistRelease) {
  const base = slugify(`${r.primary_artist_name}-${r.title}`) || "release";
  let slug = base.length >= 3 ? base : `${base}-music`;
  for (let i = 2; !(await slugFreeLink(slug)) && i < 50; i++) slug = `${base}-${i}`;
  const { data, error } = await supabase
    .from("smart_links")
    .insert({ release_id: r.id, owner_id: useApp.getState().userId, slug })
    .select()
    .single();
  if (error) {
    toast(errorText(error), "error");
    return null;
  }
  return data as SmartLink;
}
export async function saveSmartLink(id: string, patch: Partial<SmartLink>) {
  const { data, error } = await supabase
    .from("smart_links")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) {
    toast(errorText(error), "error");
    return null;
  }
  return data as SmartLink;
}
export async function findStoreLinks(releaseId: string): Promise<Record<string, string>> {
  const { data, error } = await supabase.functions.invoke("smartlink", { body: { action: "find", release_id: releaseId } });
  if (error) {
    let msg = errorText(error);
    try {
      const j = await (error as { context?: Response }).context?.json();
      if (j?.error) msg = j.error;
    } catch {
      /* not json */
    }
    throw new Error(msg);
  }
  return (data as { links: Record<string, string> }).links ?? {};
}

export type LinkStatRow = { link_id: string; day: string; kind: "view" | "click"; service: string; country: string; n: number };
export async function linkStats(days = 30, all = false): Promise<LinkStatRow[]> {
  const { data } = await supabase.rpc("smart_link_stats", { p_days: days, p_all: all });
  return ((data ?? []) as LinkStatRow[]).map((r) => ({ ...r, n: Number(r.n) }));
}
export function summarize(rows: LinkStatRow[], linkId?: string) {
  const f = linkId ? rows.filter((r) => r.link_id === linkId) : rows;
  const views = f.filter((r) => r.kind === "view").reduce((a, r) => a + r.n, 0);
  const clicks = f.filter((r) => r.kind === "click").reduce((a, r) => a + r.n, 0);
  const byService: Record<string, number> = {};
  const byCountry: Record<string, number> = {};
  const byDay: Record<string, { v: number; c: number }> = {};
  for (const r of f) {
    if (r.kind === "click") byService[r.service] = (byService[r.service] ?? 0) + r.n;
    if (r.kind === "view" && r.country) byCountry[r.country] = (byCountry[r.country] ?? 0) + r.n;
    const d = (byDay[r.day] ??= { v: 0, c: 0 });
    if (r.kind === "view") d.v += r.n;
    else d.c += r.n;
  }
  return { views, clicks, ctr: views ? clicks / views : 0, byService, byCountry, byDay };
}

// ------------------------------------------------------------------ playlist pitch
export type Pitch = {
  release_id: string;
  owner_id: string;
  focus_track: string | null;
  moods: string[];
  styles: string[];
  instruments: string[];
  description: string | null;
  similar_artists: string | null;
  marketing: string | null;
  hometown: string | null;
  updated_at: string;
};
export const MOODS = ["Chill", "Energetic", "Happy", "Sad", "Romantic", "Dark", "Aggressive", "Dreamy", "Hype", "Melancholic", "Uplifting", "Sexy", "Focused", "Party"];
export const STYLES = ["Phonk", "Trap", "Drill", "Boom Bap", "Lo-Fi", "House", "Tech House", "Melodic Techno", "Afro House", "Amapiano", "Pop", "R&B", "Indie", "Hyperpop", "Jersey Club", "Reggaeton", "Cinematic"];
export const INSTRUMENTS = ["808", "Synth", "Piano", "Guitar", "Bass", "Drums", "Strings", "Vocals", "Vocal chops", "Cowbell", "Brass", "Pads", "Flute", "Sax"];

export async function getPitch(releaseId: string) {
  const { data } = await supabase.from("release_pitches").select("*").eq("release_id", releaseId).maybeSingle();
  return (data as Pitch | null) ?? null;
}
export async function savePitch(releaseId: string, p: Partial<Pitch>) {
  const { data, error } = await supabase
    .from("release_pitches")
    .upsert({ ...p, release_id: releaseId, owner_id: useApp.getState().userId, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) {
    toast(errorText(error), "error");
    return null;
  }
  return data as Pitch;
}

// ------------------------------------------------------------------ defaults (per device) + duplicate
export type ReleaseDefaults = Partial<Pick<DistRelease, "primary_artist_name" | "label_name" | "copyright_holder" | "primary_genre" | "secondary_genre" | "language" | "release_type">>;
const DKEY = "nexus:dist-defaults";
export function getDefaults(): ReleaseDefaults {
  try {
    return JSON.parse(localStorage.getItem(DKEY) ?? "{}") as ReleaseDefaults;
  } catch {
    return {};
  }
}
export function setDefaults(d: ReleaseDefaults) {
  try {
    localStorage.setItem(DKEY, JSON.stringify(d));
  } catch {
    /* private mode */
  }
}

/** copy a release (metadata, tracks, credits, splits, audio + artwork) into a new draft */
export async function duplicateRelease(id: string, title?: string) {
  const { release: r, tracks } = await getRelease(id);
  if (!r) return null;
  const copy = await createRelease({
    title: title || `${r.title} (copy)`,
    primary_artist_name: r.primary_artist_name,
    artist_ids: r.artist_ids,
    release_type: r.release_type,
    primary_genre: r.primary_genre,
    secondary_genre: r.secondary_genre,
    label_name: r.label_name,
    language: r.language,
    explicit: r.explicit,
    copyright_year: new Date().getFullYear(),
    copyright_holder: r.copyright_holder,
    territories_include: r.territories_include,
    territories_exclude: r.territories_exclude,
    artwork_path: r.artwork_path,
  });
  if (!copy) return null;
  for (const t of tracks) {
    const n = await addTrack(copy.id, t.position, t.title);
    if (!n) continue;
    const rest: Partial<DistTrack> = { ...t };
    for (const k of ["id", "release_id", "created_at", "tunearo_track_id", "isrc", "position", "title"] as const) delete rest[k];
    await saveTrack(n.id, { ...rest, audio_sent: false });
  }
  return copy;
}

// ------------------------------------------------------------------ readiness
export type Check = { id: string; label: string; ok: boolean; level: "required" | "recommended"; fix?: string };
export function readiness(r: DistRelease, tracks: DistTrack[], checks: Record<string, AudioCheck>, art: { w: number; h: number } | null, pitch: Pitch | null, link: SmartLink | null) {
  const today = new Date();
  const days = Math.round((new Date(`${r.release_date}T00:00:00`).getTime() - today.getTime()) / 86400000);
  const feat = /\b(feat\.?|ft\.?|featuring)\b/i;
  const out: Check[] = [
    { id: "art", label: "Cover artwork uploaded", ok: !!r.artwork_path, level: "required", fix: "Upload a square JPG or PNG" },
    { id: "art3000", label: "Artwork is 3000×3000 px", ok: !!art && art.w >= 3000 && art.w === art.h, level: "recommended", fix: art ? `Yours is ${art.w}×${art.h}` : "Upload artwork" },
    { id: "tracks", label: "At least one track", ok: tracks.length > 0, level: "required" },
    { id: "audio", label: "Every track has a WAV/FLAC file", ok: tracks.length > 0 && tracks.every((t) => t.audio_path), level: "required" },
    { id: "single", label: "Release type fits the track count", ok: !(r.release_type === "Single" && tracks.length > 3) && !(r.release_type === "EP" && tracks.length > 7), level: "required", fix: "Singles: 1–3 tracks, EPs: up to 6–7" },
    { id: "date", label: "Release date is in the future", ok: days >= 0, level: "required" },
    { id: "lead", label: "Release date at least 3 weeks away (editorial pitching)", ok: days >= 21, level: "recommended", fix: days >= 0 ? `Only ${days} day${days === 1 ? "" : "s"} away` : undefined },
    { id: "feat", label: "No “feat.” in titles (use the Featured artists field)", ok: !feat.test(r.title) && tracks.every((t) => !feat.test(t.title)), level: "required" },
    { id: "caps", label: "Titles aren't ALL CAPS", ok: ![r.title, ...tracks.map((t) => t.title)].some((s) => s.length > 4 && s === s.toUpperCase() && /[A-Z]/.test(s)), level: "recommended" },
    { id: "credits", label: "Songwriter credit on every track", ok: tracks.length > 0 && tracks.every((t) => (t.songwriter || t.composer)?.trim()), level: "recommended", fix: "Stores show and require writer credits" },
    { id: "copyright", label: "℗ / © holder and year filled in", ok: !!r.copyright_holder?.trim() && !!r.copyright_year, level: "required" },
    {
      id: "explicit",
      label: "Explicit flags match the lyrics",
      ok: tracks.every((t) => t.explicit || !lyricsLookExplicit(t.lyrics)),
      level: "required",
      fix: "A track with explicit lyrics isn't marked Explicit",
    },
    { id: "cr", label: "No copyright matches", ok: tracks.every((t) => checks[t.id]?.status !== "match"), level: "required", fix: "A track matched a copyrighted recording" },
    { id: "crdone", label: "Copyright check run on every track", ok: tracks.length > 0 && tracks.every((t) => checks[t.id]), level: "recommended" },
    { id: "loud", label: "Masters aren't clipping (true peak ≤ −1 dBTP)", ok: tracks.every((t) => t.true_peak == null || t.true_peak <= -0.5), level: "recommended" },
    { id: "splits", label: "Split sheet adds up to 100% on every track", ok: tracks.length > 0 && tracks.every((t) => t.splits?.length && Math.round(t.splits.reduce((a, s) => a + s.share, 0)) === 100), level: "recommended" },
    { id: "pitch", label: "Playlist pitch written", ok: !!pitch?.description?.trim(), level: "recommended" },
    { id: "link", label: "Smart link ready to share", ok: !!link, level: "recommended" },
  ];
  const req = out.filter((c) => c.level === "required");
  const score = Math.round((out.filter((c) => c.ok).length / out.length) * 100);
  return { checks: out, score, blocking: req.filter((c) => !c.ok) };
}

/** read artwork size from the stored file */
export function remoteImageSize(url: string): Promise<{ w: number; h: number } | null> {
  return new Promise((res) => {
    const i = new Image();
    i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight });
    i.onerror = () => res(null);
    i.src = url;
  });
}
