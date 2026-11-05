"use client";

import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";
import { loadProfiles } from "./data";
import type { Video } from "./types";

export type VideoChapter = { t: number; title: string };
export type VideoPlaylist = {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  visibility: "public" | "unlisted" | "private";
  created_at: string;
  updated_at: string;
  count?: number;
};

const me = () => useApp.getState().userId!;

export async function myPlaylists() {
  const { data, error } = await supabase.from("video_playlists").select("*").eq("owner_id", me()).order("updated_at", { ascending: false });
  if (error) {
    toast(errorText(error), "error");
    return [];
  }
  return (data ?? []) as VideoPlaylist[];
}

export async function playlistsOf(userId: string) {
  const { data, error } = await supabase
    .from("video_playlists")
    .select("*")
    .eq("owner_id", userId)
    .neq("visibility", "private")
    .order("updated_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as VideoPlaylist[];
}

export async function createPlaylist(title: string, visibility: VideoPlaylist["visibility"] = "public") {
  const { data, error } = await supabase
    .from("video_playlists")
    .insert({ owner_id: me(), title: title.trim().slice(0, 120) || "Untitled playlist", visibility })
    .select()
    .single();
  if (error) {
    toast(errorText(error), "error");
    return null;
  }
  toast("Playlist created", "success");
  return data as VideoPlaylist;
}

export async function renamePlaylist(id: string, title: string) {
  const { error } = await supabase.from("video_playlists").update({ title: title.trim().slice(0, 120), updated_at: new Date().toISOString() }).eq("id", id).eq("owner_id", me());
  if (error) toast(errorText(error), "error");
  return !error;
}

export async function deletePlaylist(id: string) {
  const { error } = await supabase.from("video_playlists").delete().eq("id", id).eq("owner_id", me());
  if (error) toast(errorText(error), "error");
  return !error;
}

export async function addToPlaylist(playlistId: string, videoId: string) {
  const { count } = await supabase.from("video_playlist_items").select("*", { count: "exact", head: true }).eq("playlist_id", playlistId);
  const { error } = await supabase.from("video_playlist_items").insert({ playlist_id: playlistId, video_id: videoId, position: (count ?? 0) + 1 });
  if (error && !/duplicate|unique/i.test(error.message)) {
    toast(errorText(error), "error");
    return false;
  }
  await supabase.from("video_playlists").update({ updated_at: new Date().toISOString() }).eq("id", playlistId);
  toast("Added to playlist", "success");
  return true;
}

export async function removeFromPlaylist(playlistId: string, videoId: string) {
  const { error } = await supabase.from("video_playlist_items").delete().eq("playlist_id", playlistId).eq("video_id", videoId);
  if (error) toast(errorText(error), "error");
  return !error;
}

export async function getPlaylist(id: string) {
  const { data: pl, error } = await supabase.from("video_playlists").select("*").eq("id", id).maybeSingle();
  if (error || !pl) return null;
  const { data: items } = await supabase.from("video_playlist_items").select("video_id, position").eq("playlist_id", id).order("position");
  const ids = (items ?? []).map((i) => i.video_id as string);
  const videos: Video[] = [];
  if (ids.length) {
    const { data: vids } = await supabase.from("videos").select("*").in("id", ids).is("removed_at", null);
    const map = Object.fromEntries(((vids ?? []) as Video[]).map((v) => [v.id, v]));
    for (const idv of ids) if (map[idv]) videos.push(map[idv]!);
    void loadProfiles([...new Set(videos.map((v) => v.owner_id))]);
  }
  void loadProfiles([(pl as VideoPlaylist).owner_id]);
  return { playlist: pl as VideoPlaylist, videos };
}

export async function setVideoChapters(videoId: string, chapters: VideoChapter[]) {
  const clean = chapters
    .filter((c) => Number.isFinite(c.t) && c.t >= 0 && c.title.trim())
    .map((c) => ({ t: Math.round(c.t), title: c.title.trim().slice(0, 80) }))
    .sort((a, b) => a.t - b.t)
    .slice(0, 40);
  const { error } = await supabase.from("videos").update({ chapters: clean, updated_at: new Date().toISOString() }).eq("id", videoId);
  if (error) {
    toast(errorText(error), "error");
    return false;
  }
  return true;
}
