"use client";

/** Wump social: songs you upload and share with friends, Spotify shares, and saved-place folders. */
import { supabase, errorText } from "./supabase";
import { toast, useApp } from "@/store/app";
import { bumpSendMessage } from "./bump";
import { loadProfiles } from "./data";

export type WumpTrack = { id: string; owner_id: string; title: string; artist: string | null; path: string; mime: string | null; bytes: number | null; duration: number | null; created_at?: string; shared_at?: string };

const BUCKET = "wump-music";
const MAX = 50 * 1024 * 1024;
export const WUMP_TRACK_TOKEN = /wump-track:([0-9a-f-]{36})/i;

const safeName = (n: string) => (n.normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").slice(-80) || "song").replace(/^\.+/, "");

async function audioDuration(file: Blob) {
  return new Promise<number | null>((res) => {
    try {
      const a = new Audio();
      const u = URL.createObjectURL(file);
      a.preload = "metadata";
      a.onloadedmetadata = () => {
        URL.revokeObjectURL(u);
        res(Number.isFinite(a.duration) ? a.duration : null);
      };
      a.onerror = () => res(null);
      a.src = u;
      setTimeout(() => res(null), 4000);
    } catch {
      res(null);
    }
  });
}

/** Upload one of your songs so you can send it to friends. */
export async function uploadWumpTrack(file: Blob, name: string, artist?: string | null): Promise<WumpTrack | null> {
  const me = useApp.getState().userId;
  if (!me) return null;
  if (file.size > MAX) {
    toast("Songs up to 50 MB", "error");
    return null;
  }
  const type = file.type || "audio/mpeg";
  if (!type.startsWith("audio/")) {
    toast("That isn't an audio file", "error");
    return null;
  }
  const title = name.replace(/\.[a-z0-9]{2,4}$/i, "").trim().slice(0, 120) || "Untitled";
  const path = `${me}/${crypto.randomUUID().slice(0, 8)}-${safeName(name)}`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: type, upsert: false });
  if (up.error) {
    toast(errorText(up.error) || "Upload failed", "error");
    return null;
  }
  const duration = await audioDuration(file);
  const { data, error } = await supabase
    .from("wump_tracks")
    .insert({ owner_id: me, title, artist: artist?.trim().slice(0, 120) || null, path, mime: type, bytes: file.size, duration })
    .select()
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    toast(errorText(error) || "Couldn't save the song", "error");
    return null;
  }
  return data as WumpTrack;
}

export async function myWumpTracks() {
  const me = useApp.getState().userId;
  if (!me) return [] as WumpTrack[];
  const { data } = await supabase.from("wump_tracks").select("*").eq("owner_id", me).order("created_at", { ascending: false }).limit(200);
  return (data ?? []) as WumpTrack[];
}

export async function sharedWithMe() {
  const { data, error } = await supabase.rpc("wump_shared_with_me", { p_limit: 100 });
  if (error) return [] as WumpTrack[];
  const rows = (data ?? []) as WumpTrack[];
  if (rows.length) await loadProfiles([...new Set(rows.map((r) => r.owner_id))]);
  return rows;
}

export async function getWumpTrack(id: string) {
  const { data } = await supabase.from("wump_tracks").select("*").eq("id", id).maybeSingle();
  return (data as WumpTrack | null) ?? null;
}

const urlCache = new Map<string, { url: string; at: number }>();
export async function wumpTrackUrl(t: Pick<WumpTrack, "path">) {
  const c = urlCache.get(t.path);
  if (c && Date.now() - c.at < 50 * 60_000) return c.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(t.path, 3600);
  if (error || !data?.signedUrl) return null;
  urlCache.set(t.path, { url: data.signedUrl, at: Date.now() });
  return data.signedUrl;
}

export async function shareWumpTrack(trackId: string, friendIds: string[], note?: string) {
  const { data, error } = await supabase.rpc("wump_share_track", { p_track: trackId, p_to: friendIds, p_note: note ?? null });
  if (error) {
    toast(errorText(error) || "Couldn't share", "error");
    return 0;
  }
  const n = Number(data) || 0;
  toast(n ? `Sent to ${n} friend${n === 1 ? "" : "s"}` : "Already shared with them (only friends can receive songs)", n ? "success" : "info");
  return n;
}

export async function deleteWumpTrack(t: WumpTrack) {
  const { error } = await supabase.from("wump_tracks").delete().eq("id", t.id);
  if (error) {
    toast(errorText(error), "error");
    return false;
  }
  await supabase.storage.from(BUCKET).remove([t.path]);
  return true;
}

/** Send a Spotify track link to friends as Wump DMs (renders as a playable player in the chat). */
export async function shareSpotifyToFriends(url: string, label: string, friendIds: string[]) {
  let n = 0;
  for (const id of friendIds.slice(0, 30)) {
    const row = await bumpSendMessage(id, `🎧 ${label}\n${url}`.slice(0, 1000));
    if (row) n++;
  }
  if (n) toast(`Sent to ${n} friend${n === 1 ? "" : "s"}`, "success");
  return n;
}

// ------------------------------------------------------------------ saved place folders
export type WumpPlaceFolder = { id: string; name: string; emoji: string | null; color: string | null; position: number };

export async function listPlaceFolders() {
  const { data } = await supabase.from("wump_place_folders").select("id, name, emoji, color, position").order("position").order("created_at");
  return (data ?? []) as WumpPlaceFolder[];
}
export async function createPlaceFolder(name: string, emoji?: string | null, color?: string | null) {
  const { data, error } = await supabase
    .from("wump_place_folders")
    .insert({ name: name.trim().slice(0, 40), emoji: emoji || null, color: color || null })
    .select("id, name, emoji, color, position")
    .single();
  if (error) {
    toast(errorText(error) || "Couldn't create folder", "error");
    return null;
  }
  return data as WumpPlaceFolder;
}
export async function renamePlaceFolder(id: string, patch: Partial<Pick<WumpPlaceFolder, "name" | "emoji" | "color">>) {
  const { error } = await supabase.from("wump_place_folders").update(patch).eq("id", id);
  if (error) toast(errorText(error), "error");
  return !error;
}
export async function deletePlaceFolder(id: string) {
  const { error } = await supabase.from("wump_place_folders").delete().eq("id", id);
  if (error) toast(errorText(error), "error");
  return !error;
}
export async function setPlaceFolder(placeId: string, folderId: string | null) {
  const { error } = await supabase.rpc("wump_set_place_folder", { p_place: placeId, p_folder: folderId });
  if (error) toast(errorText(error) || "Couldn't move place", "error");
  return !error;
}
