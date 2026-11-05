"use client";

// Untitled — WIP music projects, share links, listens, profiles.

import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";
import { create } from "zustand";

export type Visibility = "private" | "unlisted" | "public";
export type SharePermission = "listen" | "download" | "edit";

export type UntitledProject = {
  id: string;
  owner_id: string;
  title: string;
  note: string | null;
  color: string;
  visibility: Visibility;
  cover_path: string | null;
  track_count: number;
  listen_count: number;
  created_at: string;
  updated_at: string;
};

export type UntitledTrack = {
  id: string;
  project_id: string;
  owner_id: string;
  title: string;
  path: string;
  mime: string | null;
  bytes: number;
  duration: number | null;
  position: number;
  note: string | null;
  folder: string | null;
  version: number;
  listen_count: number;
  created_at: string;
};

export type UntitledTrackVersion = {
  id: string;
  track_id: string;
  owner_id: string;
  path: string;
  mime: string | null;
  bytes: number;
  duration: number | null;
  version: number;
  created_at: string;
};

export type UntitledShare = {
  id: string;
  project_id: string;
  owner_id: string;
  token: string;
  permission: SharePermission;
  label: string | null;
  pass_hash: string | null;
  expires_at: string | null;
  revoked: boolean;
  views: number;
  listens: number;
  last_at: string | null;
  created_at: string;
};

export type UntitledListen = {
  id: number;
  project_id: string;
  track_id: string | null;
  share_id: string | null;
  listener_id: string | null;
  guest_name: string | null;
  created_at: string;
};

export type UntitledProfile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_color: string;
  bio: string | null;
  followers: number;
  following: number;
  is_following: boolean;
  follows_you: boolean;
  projects: {
    id: string;
    title: string;
    color: string;
    note: string | null;
    track_count: number;
    listen_count: number;
    visibility: Visibility;
    updated_at: string;
  }[];
};

export type UntitledRoute =
  | { view: "home" }
  | { view: "project"; id: string }
  | { view: "profile"; username: string }
  | { view: "explore" };

export type PlayingState = {
  projectId: string;
  trackId: string;
  title: string;
  url: string;
  queue: string[];
};

export const useUntitled = create<{
  stack: UntitledRoute[];
  playing: PlayingState | null;
  rate: number;
}>(() => ({ stack: [{ view: "home" }], playing: null, rate: 1 }));

export const untitledGo = (r: UntitledRoute) => useUntitled.setState((s) => ({ stack: [...s.stack, r].slice(-20) }));
export const untitledBack = () => useUntitled.setState((s) => ({ stack: s.stack.length > 1 ? s.stack.slice(0, -1) : s.stack }));
export const untitledHome = (r: UntitledRoute = { view: "home" }) => useUntitled.setState({ stack: [r] });

export function openUntitled(r?: UntitledRoute) {
  if (r) untitledHome(r);
  const mobile = typeof window !== "undefined" && window.innerWidth < 768;
  useApp.setState(mobile ? { mobileTab: "music", hub: "untitled" } : { hub: "untitled" });
}

const me = () => useApp.getState().userId!;

export const shareUrl = (token: string) => `${typeof window !== "undefined" ? window.location.origin : "https://nexusproject.cc"}/t/${token}`;
export const profileUrl = (username: string) => `${typeof window !== "undefined" ? window.location.origin : "https://nexusproject.cc"}/m/${username}`;
export const fmtDur = (s?: number | null) => {
  if (s == null || !Number.isFinite(s)) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};
export const fmtBytes = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
export const fmtCount = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n));

export async function listMyProjects() {
  const { data, error } = await supabase.from("untitled_projects").select("*").eq("owner_id", me()).order("updated_at", { ascending: false });
  if (error) throw new Error(errorText(error));
  return (data ?? []) as UntitledProject[];
}

export async function getProject(id: string) {
  const { data, error } = await supabase.from("untitled_projects").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(errorText(error));
  return data as UntitledProject | null;
}

export async function createProject(title = "Untitled") {
  const { data, error } = await supabase
    .from("untitled_projects")
    .insert({ owner_id: me(), title: title.trim().slice(0, 120) || "Untitled" })
    .select()
    .single();
  if (error) throw new Error(errorText(error));
  return data as UntitledProject;
}

export async function updateProject(id: string, patch: Partial<Pick<UntitledProject, "title" | "note" | "color" | "visibility">>) {
  const { error } = await supabase.from("untitled_projects").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).eq("owner_id", me());
  if (error) toast(errorText(error), "error");
  return !error;
}

export async function deleteProject(id: string) {
  const tracks = await listTracks(id);
  if (tracks.length) await supabase.storage.from("untitled").remove(tracks.map((t) => t.path));
  const { error } = await supabase.from("untitled_projects").delete().eq("id", id).eq("owner_id", me());
  if (error) toast(errorText(error), "error");
  return !error;
}

export async function listTracks(projectId: string) {
  const { data, error } = await supabase.from("untitled_tracks").select("*").eq("project_id", projectId).order("position").order("created_at");
  if (error) throw new Error(errorText(error));
  return (data ?? []) as UntitledTrack[];
}

async function audioDuration(file: File): Promise<number | null> {
  const url = URL.createObjectURL(file);
  try {
    const a = new Audio();
    a.preload = "metadata";
    a.src = url;
    await new Promise<void>((res) => {
      a.onloadedmetadata = () => res();
      a.onerror = () => res();
      setTimeout(res, 4000);
    });
    return Number.isFinite(a.duration) ? a.duration : null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function putAudio(projectId: string, file: File, onProgress?: (p: number) => void) {
  if (!file.type.startsWith("audio/") && !/\.(mp3|wav|flac|m4a|aac|ogg|webm)$/i.test(file.name)) {
    throw new Error("Upload an audio file");
  }
  if (file.size > 200 * 1024 * 1024) throw new Error("Tracks can be up to 200 MB");
  const id = crypto.randomUUID();
  const ext = (file.name.split(".").pop() || "mp3").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp3";
  const path = `${me()}/${projectId}/${id}.${ext}`;
  const duration = await audioDuration(file);
  const { data: s } = await supabase.auth.getSession();
  await new Promise<void>((res, rej) => {
    const x = new XMLHttpRequest();
    x.open("POST", `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/untitled/${path.split("/").map(encodeURIComponent).join("/")}`);
    x.setRequestHeader("Authorization", `Bearer ${s.session?.access_token}`);
    x.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "");
    x.setRequestHeader("Content-Type", file.type || "audio/mpeg");
    x.setRequestHeader("x-upsert", "true");
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onload = () => (x.status < 300 ? res() : rej(new Error(`Upload failed (${x.status})`)));
    x.onerror = () => rej(new Error("Network error while uploading"));
    x.send(file);
  });
  return { id, path, duration, mime: file.type || null, bytes: file.size };
}

export async function uploadTrack(projectId: string, file: File, onProgress?: (p: number) => void, folder?: string | null) {
  const existing = await listTracks(projectId);
  const uploaded = await putAudio(projectId, file, onProgress);
  const title = file.name.replace(/\.[^.]+$/, "").slice(0, 200) || "Untitled track";

  const { data, error } = await supabase
    .from("untitled_tracks")
    .insert({
      id: uploaded.id,
      project_id: projectId,
      owner_id: me(),
      title,
      path: uploaded.path,
      mime: uploaded.mime,
      bytes: uploaded.bytes,
      duration: uploaded.duration,
      position: existing.length + 1,
      folder: folder?.trim().slice(0, 80) || null,
      version: 1,
    })
    .select()
    .single();
  if (error) {
    await supabase.storage.from("untitled").remove([uploaded.path]);
    throw new Error(errorText(error));
  }
  await supabase.from("untitled_projects").update({ updated_at: new Date().toISOString() }).eq("id", projectId);
  return data as UntitledTrack;
}

export async function uploadMany(projectId: string, files: File[], folder?: string | null, onProgress?: (done: number, total: number) => void) {
  const out: UntitledTrack[] = [];
  for (let i = 0; i < files.length; i++) {
    out.push(await uploadTrack(projectId, files[i]!, (p) => onProgress?.((i + p) / files.length, 1), folder));
  }
  return out;
}

export async function renameTrack(id: string, title: string) {
  const { error } = await supabase.from("untitled_tracks").update({ title: title.trim().slice(0, 200) || "Untitled track" }).eq("id", id).eq("owner_id", me());
  if (error) toast(errorText(error), "error");
  return !error;
}

export async function setTrackFolder(id: string, folder: string | null) {
  const { error } = await supabase
    .from("untitled_tracks")
    .update({ folder: folder?.trim().slice(0, 80) || null })
    .eq("id", id)
    .eq("owner_id", me());
  if (error) toast(errorText(error), "error");
  return !error;
}

export async function moveTrack(projectId: string, trackId: string, dir: -1 | 1) {
  const tracks = await listTracks(projectId);
  const i = tracks.findIndex((t) => t.id === trackId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= tracks.length) return false;
  const a = tracks[i]!;
  const b = tracks[j]!;
  await supabase.from("untitled_tracks").update({ position: b.position }).eq("id", a.id);
  await supabase.from("untitled_tracks").update({ position: a.position }).eq("id", b.id);
  // normalize
  const refreshed = await listTracks(projectId);
  await Promise.all(refreshed.map((t, idx) => supabase.from("untitled_tracks").update({ position: idx + 1 }).eq("id", t.id)));
  return true;
}

export async function replaceTrackAudio(track: UntitledTrack, file: File, onProgress?: (p: number) => void) {
  // archive current version
  await supabase.from("untitled_track_versions").insert({
    track_id: track.id,
    owner_id: me(),
    path: track.path,
    mime: track.mime,
    bytes: track.bytes,
    duration: track.duration,
    version: track.version,
  });
  const uploaded = await putAudio(track.project_id, file, onProgress);
  const next = track.version + 1;
  const { data, error } = await supabase
    .from("untitled_tracks")
    .update({
      path: uploaded.path,
      mime: uploaded.mime,
      bytes: uploaded.bytes,
      duration: uploaded.duration,
      version: next,
    })
    .eq("id", track.id)
    .eq("owner_id", me())
    .select()
    .single();
  if (error) throw new Error(errorText(error));
  await supabase.from("untitled_projects").update({ updated_at: new Date().toISOString() }).eq("id", track.project_id);
  return data as UntitledTrack;
}

export async function listTrackVersions(trackId: string) {
  const { data, error } = await supabase.from("untitled_track_versions").select("*").eq("track_id", trackId).order("version", { ascending: false });
  if (error) throw new Error(errorText(error));
  return (data ?? []) as UntitledTrackVersion[];
}

export async function restoreTrackVersion(track: UntitledTrack, ver: UntitledTrackVersion) {
  await supabase.from("untitled_track_versions").insert({
    track_id: track.id,
    owner_id: me(),
    path: track.path,
    mime: track.mime,
    bytes: track.bytes,
    duration: track.duration,
    version: track.version,
  });
  const next = Math.max(track.version, ver.version) + 1;
  const { error } = await supabase
    .from("untitled_tracks")
    .update({ path: ver.path, mime: ver.mime, bytes: ver.bytes, duration: ver.duration, version: next })
    .eq("id", track.id)
    .eq("owner_id", me());
  if (error) toast(errorText(error), "error");
  return !error;
}

export async function removeTrack(t: UntitledTrack) {
  const versions = await listTrackVersions(t.id).catch(() => [] as UntitledTrackVersion[]);
  const paths = [t.path, ...versions.map((v) => v.path)];
  await supabase.storage.from("untitled").remove(paths);
  const { error } = await supabase.from("untitled_tracks").delete().eq("id", t.id).eq("owner_id", me());
  if (error) toast(errorText(error), "error");
  return !error;
}

export async function trackUrl(path: string, downloadName?: string) {
  const { data } = await supabase.storage.from("untitled").createSignedUrl(path, 3600, downloadName ? { download: downloadName } : undefined);
  return data?.signedUrl ?? null;
}

export async function listShares(projectId: string) {
  const { data, error } = await supabase.from("untitled_shares").select("*").eq("project_id", projectId).eq("revoked", false).order("created_at", { ascending: false });
  if (error) throw new Error(errorText(error));
  return (data ?? []) as UntitledShare[];
}

export async function createShare(
  projectId: string,
  o: { permission: SharePermission; password?: string; expiresInHours?: number | null; label?: string },
) {
  const { data, error } = await supabase.rpc("untitled_share_create", {
    p_project: projectId,
    p_permission: o.permission,
    p_password: o.password || null,
    p_expires: o.expiresInHours ? new Date(Date.now() + o.expiresInHours * 3600_000).toISOString() : null,
    p_label: o.label || null,
  });
  if (error) throw new Error(errorText(error));
  return data as UntitledShare;
}

export async function updateSharePermission(id: string, permission: SharePermission) {
  const { error } = await supabase.from("untitled_shares").update({ permission }).eq("id", id).eq("owner_id", me());
  if (error) toast(errorText(error), "error");
  return !error;
}

export async function revokeShare(id: string) {
  const { error } = await supabase.from("untitled_shares").update({ revoked: true }).eq("id", id).eq("owner_id", me());
  if (error) toast(errorText(error), "error");
  return !error;
}

export async function listListens(projectId: string) {
  const { data, error } = await supabase.from("untitled_listens").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(errorText(error));
  return (data ?? []) as UntitledListen[];
}

export async function recordListen(projectId: string, trackId?: string, shareId?: string) {
  await supabase.rpc("untitled_record_listen", {
    p_project: projectId,
    p_track: trackId ?? null,
    p_share: shareId ?? null,
    p_guest: null,
  });
}

export async function loadUntitledProfile(username: string) {
  const { data, error } = await supabase.rpc("untitled_profile", { p_username: username });
  if (error) throw new Error(errorText(error));
  return (data ?? null) as UntitledProfile | null;
}

export async function setUntitledFollow(userId: string, on: boolean) {
  const q = on
    ? supabase.from("untitled_follows").insert({ follower_id: me(), followee_id: userId })
    : supabase.from("untitled_follows").delete().eq("follower_id", me()).eq("followee_id", userId);
  const { error } = await q;
  if (error) {
    toast(errorText(error), "error");
    return false;
  }
  return true;
}

export async function untitledFollowList(userId: string, which: "followers" | "following") {
  const { data, error } = await supabase.rpc("untitled_follow_list", { p_user: userId, p_which: which });
  if (error) throw new Error(errorText(error));
  const ids = (data ?? []) as string[];
  if (ids.length) await loadProfilesSafe(ids);
  return ids;
}

async function loadProfilesSafe(ids: string[]) {
  try {
    const { loadProfiles } = await import("./data");
    await loadProfiles(ids);
  } catch {
    /* ignore */
  }
}

export async function explorePublic(limit = 24) {
  const { data, error } = await supabase
    .from("untitled_projects")
    .select("id, owner_id, title, color, note, track_count, listen_count, updated_at, visibility")
    .eq("visibility", "public")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(errorText(error));
  return (data ?? []) as UntitledProject[];
}

export async function playTrack(projectId: string, track: UntitledTrack, queue?: UntitledTrack[]) {
  const url = await trackUrl(track.path);
  if (!url) {
    toast("Couldn't load this track", "error");
    return;
  }
  const q = (queue ?? [track]).map((t) => t.id);
  useUntitled.setState({ playing: { projectId, trackId: track.id, title: track.title, url, queue: q } });
  void recordListen(projectId, track.id);
}

export async function playNextInQueue(tracks: UntitledTrack[]) {
  const playing = useUntitled.getState().playing;
  if (!playing) return;
  const idx = playing.queue.indexOf(playing.trackId);
  const nextId = playing.queue[idx + 1];
  const next = tracks.find((t) => t.id === nextId);
  if (next) await playTrack(playing.projectId, next, tracks.filter((t) => playing.queue.includes(t.id)));
}

export async function playPrevInQueue(tracks: UntitledTrack[]) {
  const playing = useUntitled.getState().playing;
  if (!playing) return;
  const idx = playing.queue.indexOf(playing.trackId);
  const prevId = playing.queue[idx - 1];
  const prev = tracks.find((t) => t.id === prevId);
  if (prev) await playTrack(playing.projectId, prev, tracks.filter((t) => playing.queue.includes(t.id)));
}

export function setPlaybackRate(rate: number) {
  useUntitled.setState({ rate: Math.min(2, Math.max(0.5, rate)) });
}
