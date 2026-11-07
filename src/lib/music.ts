"use client";

import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";
import { loadProfiles } from "./data";
import type { ArtistClaim, ArtistComment, ArtistPage, ArtistPost } from "./types";

// ------------------------------------------------------------------ Spotify proxy (edge function)
export type SpArtist = { id: string; name: string; image: string | null; url: string; followers: number | null; genres: string[]; popularity: number | null };
export type SpAlbum = {
  id: string | null;
  name: string;
  image: string | null;
  url: string | null;
  type: string;
  release_date: string;
  total_tracks: number;
  upc: string | null;
  label: string | null;
  artists: { id: string | null; name: string }[];
  search_url?: string;
  source?: string;
};
export type SpTrack = {
  id: string | null;
  name: string;
  url: string | null;
  isrc: string | null;
  duration_ms: number;
  explicit: boolean;
  preview_url: string | null;
  album: { id: string | null; name: string; image: string | null; release_date: string } | null;
  artists: { id: string | null; name: string }[];
  search_url?: string;
  source?: string;
};

export class SpotifyError extends Error {
  notConfigured = false;
}

export async function sp<T>(action: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("spotify", { body: { action, ...args } });
  if (error) {
    const e = new SpotifyError(errorText(error));
    try {
      const j = await (error as { context?: Response }).context?.json();
      if (j?.error) e.message = j.error;
      if (j?.not_configured) e.notConfigured = true;
    } catch {
      /* not json */
    }
    throw e;
  }
  return data as T;
}

let configCache: { configured: boolean; client_id: string | null } | null = null;
export async function spotifyConfig() {
  if (configCache) return configCache;
  try {
    configCache = await sp<{ configured: boolean; client_id: string | null }>("config");
  } catch {
    configCache = { configured: false, client_id: null };
  }
  return configCache;
}

/** Resolve a Spotify track/album URL or ISRC into takedown notice fields (uses server Spotify keys). */
export type TakedownLookup = {
  work_title: string;
  work_artist: string;
  isrc: string | null;
  upc: string | null;
  infringing: string[];
  description: string;
  track: SpTrack | null;
  album: SpAlbum | null;
};

export function spotifyTakedownLookup(input: { url?: string; isrc?: string }) {
  return sp<TakedownLookup>("takedown_lookup", input);
}

export const fmtDate = (d: string | null | undefined) => {
  if (!d) return "";
  const parts = d.split("-");
  if (parts.length === 1) return d;
  const dt = new Date(d.length === 7 ? `${d}-01` : d);
  return dt.toLocaleDateString([], parts.length === 2 ? { year: "numeric", month: "short" } : { year: "numeric", month: "short", day: "numeric" });
};
export const fmtDur = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
export const fmtNum = (n: number | null | undefined) =>
  n == null ? "" : n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K` : String(n);

// ------------------------------------------------------------------ artist pages / posts
export async function listArtistPages(): Promise<ArtistPage[]> {
  const { data } = await supabase.from("artist_pages").select("*").order("created_at", { ascending: false }).limit(60);
  return (data ?? []) as ArtistPage[];
}

export async function pageForSpotify(spotifyId: string): Promise<ArtistPage | null> {
  const { data } = await supabase.from("artist_pages").select("*").eq("spotify_id", spotifyId).maybeSingle();
  return (data as ArtistPage) ?? null;
}

export async function pageByHandle(handle: string): Promise<ArtistPage | null> {
  const { data } = await supabase.from("artist_pages").select("*").eq("handle", handle.toLowerCase()).maybeSingle();
  return (data as ArtistPage) ?? null;
}

export async function myPages(): Promise<ArtistPage[]> {
  const me = useApp.getState().userId;
  if (!me) return [];
  const { data } = await supabase.from("artist_pages").select("*").eq("owner_id", me);
  return (data ?? []) as ArtistPage[];
}

export async function loadPosts(pageId: string | null, limit = 30): Promise<ArtistPost[]> {
  let q = supabase.from("artist_posts").select("*").is("deleted_at", null).order("created_at", { ascending: false }).limit(limit);
  if (pageId) q = q.eq("page_id", pageId);
  const { data } = await q;
  const posts = (data ?? []) as ArtistPost[];
  void loadProfiles([...new Set(posts.map((p) => p.author_id))]);
  return posts;
}

export async function loadComments(postId: string): Promise<ArtistComment[]> {
  const { data } = await supabase.from("artist_post_comments").select("*").eq("post_id", postId).is("deleted_at", null).order("created_at").limit(200);
  const list = (data ?? []) as ArtistComment[];
  void loadProfiles([...new Set(list.map((c) => c.author_id))]);
  return list;
}

export async function commentCounts(postIds: string[]): Promise<Record<string, number>> {
  if (!postIds.length) return {};
  const { data } = await supabase.from("artist_post_comments").select("post_id").in("post_id", postIds).is("deleted_at", null);
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as { post_id: string }[]) out[r.post_id] = (out[r.post_id] ?? 0) + 1;
  return out;
}

const MAX_MEDIA = 50 * 1024 * 1024;

export async function createPost(page: ArtistPage, content: string, file: File | null, link: string | null) {
  const me = useApp.getState().userId!;
  let media_url: string | null = null;
  let media_type: string | null = null;
  if (file) {
    if (file.size > MAX_MEDIA) {
      toast("Media can be up to 50 MB", "error");
      return null;
    }
    const path = `${page.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
    const { error } = await supabase.storage.from("artist-media").upload(path, file, { contentType: file.type });
    if (error) {
      toast(`Upload failed: ${errorText(error)}`, "error");
      return null;
    }
    media_url = supabase.storage.from("artist-media").getPublicUrl(path).data.publicUrl;
    media_type = file.type;
  }
  const { data, error } = await supabase
    .from("artist_posts")
    .insert({ page_id: page.id, author_id: me, content: content.trim(), media_url, media_type, link_url: link?.trim() || null })
    .select()
    .single();
  if (error) {
    toast(errorText(error), "error");
    return null;
  }
  return data as ArtistPost;
}

export async function addComment(postId: string, content: string) {
  const me = useApp.getState().userId!;
  const { data, error } = await supabase.from("artist_post_comments").insert({ post_id: postId, author_id: me, content: content.trim() }).select().single();
  if (error) {
    toast(errorText(error), "error");
    return null;
  }
  return data as ArtistComment;
}

async function rpc<T = unknown>(fn: string, args: Record<string, unknown>, ok?: string): Promise<T | null> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    toast(errorText(error), "error");
    return null;
  }
  if (ok) toast(ok, "success");
  return (data as T) ?? (true as unknown as T);
}

export const removePost = (id: string) => rpc("remove_artist_post", { p_post: id }, "Post removed");
export const removeComment = (id: string) => rpc("remove_artist_comment", { p_comment: id });
export const updatePage = (id: string, bio: string, image: string) => rpc("update_artist_page", { p_page: id, p_bio: bio, p_image: image }, "Artist page updated");

export async function requestClaim(a: SpArtist, handle: string, proof: string) {
  return rpc<string>("request_artist_claim", { p_spotify_id: a.id, p_name: a.name, p_image: a.image, p_handle: handle, p_proof: proof }, "Claim sent — an admin will review it");
}

export async function myClaims(): Promise<ArtistClaim[]> {
  const me = useApp.getState().userId;
  const { data } = await supabase.from("artist_claims").select("*").eq("user_id", me).order("created_at", { ascending: false });
  return (data ?? []) as ArtistClaim[];
}

export async function pendingClaims(): Promise<ArtistClaim[]> {
  const { data } = await supabase.from("artist_claims").select("*").eq("status", "pending").order("created_at");
  const list = (data ?? []) as ArtistClaim[];
  void loadProfiles([...new Set(list.map((c) => c.user_id))]);
  return list;
}

// ------------------------------------------------------------------ watchlist
export type Watch = { spotify_id: string; name: string; image_url: string | null; active: boolean; notify?: boolean };

export async function loadWatchlist(): Promise<Watch[]> {
  const { data } = await supabase.from("artist_watch").select("spotify_id,name,image_url,active,notify").eq("active", true).order("created_at", { ascending: false });
  return (data ?? []) as Watch[];
}

export async function setWatch(a: { id: string; name: string; image: string | null }, on: boolean) {
  const me = useApp.getState().userId!;
  const { error } = await supabase
    .from("artist_watch")
    .upsert({ user_id: me, spotify_id: a.id, name: a.name.slice(0, 120), image_url: a.image, active: on, ...(on ? { notify: true } : {}) }, { onConflict: "user_id,spotify_id" });
  if (error) toast(errorText(error), "error");
  else toast(on ? `Following ${a.name} — Nexus Bot will message you when they drop something new` : `Unfollowed ${a.name}`, "success");
  return !error;
}

/** turn Nexus Bot release DMs on/off for one followed artist */
export async function setWatchNotify(spotifyId: string, notify: boolean) {
  const me = useApp.getState().userId!;
  const { error } = await supabase.from("artist_watch").update({ notify }).eq("user_id", me).eq("spotify_id", spotifyId);
  if (error) toast(errorText(error), "error");
  return !error;
}

// ------------------------------------------------------------------ mentions
/** "@username" → profile ids (looks up unknown usernames) */
export async function resolveMentions(text: string) {
  const names = [...new Set([...text.matchAll(/(^|\s)@([a-z0-9_.]{1,32})/gi)].map((m) => m[2].toLowerCase()))];
  if (!names.length) return;
  const known = new Set(Object.values(useApp.getState().profiles).map((p) => p.username));
  const missing = names.filter((n) => !known.has(n));
  if (!missing.length) return;
  const { data } = await supabase.from("profiles").select("*").in("username", missing);
  if (data?.length) {
    useApp.setState((s) => {
      const profiles = { ...s.profiles };
      for (const p of data as { id: string }[]) profiles[p.id] = p as never;
      return { profiles };
    });
  }
}

export async function searchUsers(q: string) {
  const s = q.replace(/[^a-z0-9_.]/gi, "");
  if (!s) return [];
  const { data } = await supabase.from("profiles").select("id,username,display_name,avatar_color,avatar_url").ilike("username", `${s}%`).limit(6);
  return (data ?? []) as { id: string; username: string; display_name: string }[];
}
