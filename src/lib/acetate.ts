"use client";

import { supabase, errorText, isConfigured } from "./supabase";
import { xhrStorageUpload, resumableStorageUpload } from "./storageUpload";
import { scanUpload } from "./malwareGuard";
import { toast, useApp } from "@/store/app";
import { artExt, asPeaks, audioExt, describeAudio, mimeForExt } from "./acetateAudio";

export type AcetateKind = "project" | "album" | "playlist";
export type AcetateLibrary = "shelf" | "vault";
export type AcetateStatus = "idea" | "demo" | "mix" | "master";

export const ACETATE_STATUSES: { id: AcetateStatus; label: string }[] = [
  { id: "idea", label: "Idea" },
  { id: "demo", label: "Demo" },
  { id: "mix", label: "Mix" },
  { id: "master", label: "Master" },
];

export const ACETATE_KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B", "Cm", "C#m", "Dm", "D#m", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "A#m", "Bm"];

export type AcetateProject = {
  id: string;
  owner_id: string;
  kind: AcetateKind;
  title: string;
  note: string | null;
  artwork_path: string | null;
  library?: AcetateLibrary;
  created_at: string;
  updated_at: string;
  shared_role?: "listener" | "editor" | null;
};

export type AcetateTrack = {
  id: string;
  owner_id: string;
  title: string;
  note: string | null;
  artwork_path: string | null;
  library?: AcetateLibrary;
  starred?: boolean;
  status?: AcetateStatus;
  bpm?: number | null;
  musical_key?: string | null;
  folder?: string | null;
  artist?: string | null;
  source_url?: string | null;
  source_kind?: "soundcloud" | null;
  external_art?: string | null;
  lyrics?: string | null;
  lyrics_on_share?: boolean;
  lyric_cues?: { t: number; line: string }[] | null;
  created_at: string;
  updated_at: string;
};

export type AcetateListen = {
  id: number;
  owner_id: string;
  track_id: string | null;
  share_id: string | null;
  listener_id: string | null;
  created_at: string;
};

export type AcetateMembership = {
  project_id: string;
  track_id: string;
  position: number;
  created_at: string;
};

export type AcetateVersion = {
  id: string;
  track_id: string;
  owner_id: string;
  label: string | null;
  version: number;
  path: string;
  mime: string | null;
  bytes: number;
  duration: number | null;
  peaks: number[] | null;
  created_at: string;
};

export type AcetateComment = {
  id: string;
  track_id: string;
  version_id: string | null;
  author_id: string | null;
  guest_name: string | null;
  at_seconds: number;
  body: string;
  created_at: string;
};

export type AcetateShare = {
  id: string;
  owner_id: string;
  kind: "track" | "project";
  track_id: string | null;
  project_id: string | null;
  token: string;
  listing: "public" | "unlisted";
  expires_at: string | null;
  revoked: boolean;
  allow_download: boolean;
  views: number;
  created_at: string;
};

export type AcetateStorage = {
  bytes: number;
  limit: number | null;
  premium: boolean;
  lifetime: boolean;
  source: "none" | "admin" | "checkout";
  tier: "free" | "premium";
  vault_bytes?: number;
  vault_limit?: number | null;
  music_bytes?: number;
  cover_bytes?: number;
  file_bytes?: number;
};

export type AcetateAdminRow = {
  id: string;
  username: string;
  display_name: string;
  tier: "free" | "premium";
  lifetime: boolean;
  source: string;
  bytes: number;
};

export type SharedVersion = {
  id: string;
  label: string | null;
  version: number;
  mime: string | null;
  bytes: number;
  duration: number | null;
  peaks: number[] | null;
  url: string | null;
};

export type SharedComment = {
  id: string;
  at: number;
  body: string;
  name: string;
  created_at: string;
};

export type SharedTrack = {
  id: string;
  title: string;
  note: string | null;
  position?: number;
  art: string | null;
  lyrics?: string | null;
  versions: SharedVersion[];
  comments: SharedComment[];
};

export type SharedOpen = {
  ok: true;
  kind: "track" | "project";
  listing: "public" | "unlisted";
  download: boolean;
  title: string;
  note: string | null;
  owner: string | null;
  owner_name: string | null;
  art: string | null;
  tracks: SharedTrack[];
};

const SHARE_COLUMNS =
  "id, owner_id, kind, track_id, project_id, token, listing, expires_at, revoked, allow_download, views, created_at";

const urlCache = new Map<string, { url: string; exp: number }>();

function me() {
  const id = useApp.getState().userId;
  if (!id) throw new Error("Sign in required");
  return id;
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(errorText(error));
  return data as T;
}

function normalizeVersion(row: AcetateVersion): AcetateVersion {
  return { ...row, peaks: asPeaks(row.peaks) };
}

export async function acetateSigned(path: string | null | undefined, downloadName?: string) {
  if (!path) return null;
  const key = `${path}:${downloadName ?? ""}`;
  const hit = urlCache.get(key);
  if (hit && hit.exp > Date.now() + 20_000) return hit.url;
  const { data, error } = await supabase.storage.from("acetate").createSignedUrl(path, downloadName ? 120 : 3600, downloadName ? { download: downloadName } : undefined);
  if (error || !data?.signedUrl) return null;
  urlCache.set(key, { url: data.signedUrl, exp: Date.now() + (downloadName ? 90_000 : 3_000_000) });
  return data.signedUrl;
}

export async function loadLibrary() {
  const owner = me();
  const [projects, tracks, memberships, storage, shares, collabs] = await Promise.all([
    supabase.from("acetate_projects").select("*").eq("owner_id", owner).order("updated_at", { ascending: false }),
    supabase.from("acetate_tracks").select("*").eq("owner_id", owner).order("updated_at", { ascending: false }),
    supabase.from("acetate_memberships").select("*").order("position", { ascending: true }),
    supabase.rpc("acetate_my_storage"),
    supabase.from("acetate_shares").select(SHARE_COLUMNS).eq("owner_id", owner).eq("revoked", false).order("created_at", { ascending: false }),
    supabase.from("acetate_collaborators").select("project_id, user_id, role").eq("user_id", owner),
  ]);
  const err = projects.error || tracks.error || memberships.error || storage.error || shares.error || collabs.error;
  if (err) throw new Error(errorText(err));
  const ownedProjects = (projects.data ?? []) as AcetateProject[];
  const ownedIds = new Set(ownedProjects.map((project) => project.id));
  const invites = (collabs.data ?? []) as { project_id: string; role: "listener" | "editor" }[];
  const sharedIds = [...new Set(invites.map((row) => row.project_id).filter((id) => !ownedIds.has(id)))];
  let sharedProjects: AcetateProject[] = [];
  if (sharedIds.length) {
    const extra = await supabase.from("acetate_projects").select("*").in("id", sharedIds);
    if (extra.error) throw new Error(errorText(extra.error));
    sharedProjects = (extra.data ?? []) as AcetateProject[];
  }
  const roleOf = new Map(invites.map((row) => [row.project_id, row.role]));
  const ownedTracks = (tracks.data ?? []) as AcetateTrack[];
  const trackIds = new Set(ownedTracks.map((track) => track.id));
  const missing = [...new Set(((memberships.data ?? []) as AcetateMembership[]).map((row) => row.track_id).filter((id) => !trackIds.has(id)))];
  let sharedTracks: AcetateTrack[] = [];
  if (missing.length) {
    const extra = await supabase.from("acetate_tracks").select("*").in("id", missing);
    if (extra.error) throw new Error(errorText(extra.error));
    sharedTracks = (extra.data ?? []) as AcetateTrack[];
  }
  return {
    projects: [...ownedProjects, ...sharedProjects].map((project) => ({
      ...project,
      shared_role: project.owner_id === owner ? null : roleOf.get(project.id) ?? "listener",
    })),
    tracks: [...ownedTracks, ...sharedTracks],
    memberships: (memberships.data ?? []) as AcetateMembership[],
    storage: (storage.data ?? { bytes: 0, limit: 5368709120, premium: false, lifetime: false, source: "none", tier: "free" }) as AcetateStorage,
    shares: (shares.data ?? []) as AcetateShare[],
  };
}

export async function loadTrackDetail(trackId: string) {
  const [versions, comments] = await Promise.all([
    supabase.from("acetate_versions").select("*").eq("track_id", trackId).order("version", { ascending: false }),
    supabase.from("acetate_comments").select("*").eq("track_id", trackId).order("at_seconds", { ascending: true }),
  ]);
  if (versions.error) throw new Error(errorText(versions.error));
  if (comments.error) throw new Error(errorText(comments.error));
  return {
    versions: ((versions.data ?? []) as AcetateVersion[]).map(normalizeVersion),
    comments: (comments.data ?? []) as AcetateComment[],
  };
}

export async function createProject(kind: AcetateKind, title: string, note?: string, library: AcetateLibrary = "shelf") {
  const owner = me();
  const { data, error } = await supabase
    .from("acetate_projects")
    .insert({ owner_id: owner, kind, title: title.trim().slice(0, 140) || "Untitled cut", note: note?.trim() || null, library })
    .select("*")
    .single();
  if (error) throw new Error(errorText(error));
  return data as AcetateProject;
}

export async function updateProject(id: string, patch: { title?: string; note?: string | null; kind?: AcetateKind }) {
  const { error } = await supabase.from("acetate_projects").update(patch).eq("id", id);
  if (error) throw new Error(errorText(error));
}

export async function deleteProject(id: string) {
  const { data } = await supabase.from("acetate_projects").select("artwork_path").eq("id", id).maybeSingle();
  const { error } = await supabase.from("acetate_projects").delete().eq("id", id);
  if (error) throw new Error(errorText(error));
  if (data?.artwork_path) await supabase.storage.from("acetate").remove([data.artwork_path]);
}

export async function updateTrack(
  id: string,
  patch: {
    title?: string;
    note?: string | null;
    starred?: boolean;
    status?: AcetateStatus;
    bpm?: number | null;
    musical_key?: string | null;
    folder?: string | null;
    artist?: string | null;
    source_url?: string | null;
    source_kind?: "soundcloud" | null;
    external_art?: string | null;
    lyrics?: string | null;
    lyrics_on_share?: boolean;
    lyric_cues?: { t: number; line: string }[] | null;
  },
) {
  const { error } = await supabase.from("acetate_tracks").update(patch).eq("id", id);
  if (error) throw new Error(errorText(error));
}

export async function moveInProject(projectId: string, trackId: string, dir: -1 | 1, memberships: Pick<AcetateMembership, "project_id" | "track_id" | "position">[]) {
  const rows = memberships.filter((row) => row.project_id === projectId).sort((a, b) => a.position - b.position || a.track_id.localeCompare(b.track_id));
  const index = rows.findIndex((row) => row.track_id === trackId);
  const swap = rows[index + dir];
  const current = rows[index];
  if (!current || !swap) return;
  const first = await supabase.from("acetate_memberships").update({ position: swap.position }).eq("project_id", projectId).eq("track_id", current.track_id);
  if (first.error) throw new Error(errorText(first.error));
  const second = await supabase.from("acetate_memberships").update({ position: current.position }).eq("project_id", projectId).eq("track_id", swap.track_id);
  if (second.error) throw new Error(errorText(second.error));
}

export async function loadListens() {
  const { data, error } = await supabase.from("acetate_listens").select("id, owner_id, track_id, share_id, listener_id, created_at").order("created_at", { ascending: false }).limit(20);
  if (error) return [] as AcetateListen[];
  return (data ?? []) as AcetateListen[];
}

export async function recordListen(trackId: string, token?: string | null, password?: string | null) {
  const { error } = await supabase.rpc("acetate_record_listen", {
    p_track: trackId,
    p_token: token || null,
    p_password: password || null,
  });
  if (error) throw new Error(errorText(error));
}

export async function deleteTrack(id: string) {
  const { data } = await supabase.from("acetate_versions").select("path").eq("track_id", id);
  const art = await supabase.from("acetate_tracks").select("artwork_path").eq("id", id).maybeSingle();
  const paths = [...(data ?? []).map((r) => r.path as string), art.data?.artwork_path].filter((p): p is string => !!p);
  if (paths.length) {
    const removed = await supabase.storage.from("acetate").remove(paths);
    if (removed.error) throw new Error(errorText(removed.error));
  }
  const { error } = await supabase.from("acetate_tracks").delete().eq("id", id);
  if (error) throw new Error(errorText(error));
}

export async function addTrackToProject(projectId: string, trackId: string) {
  const { count } = await supabase.from("acetate_memberships").select("track_id", { count: "exact", head: true }).eq("project_id", projectId);
  const { error } = await supabase.from("acetate_memberships").insert({ project_id: projectId, track_id: trackId, position: (count ?? 0) + 1 });
  if (error) throw new Error(errorText(error));
}

export async function removeTrackFromProject(projectId: string, trackId: string) {
  const { error } = await supabase.from("acetate_memberships").delete().eq("project_id", projectId).eq("track_id", trackId);
  if (error) throw new Error(errorText(error));
}

export async function deleteVersion(version: AcetateVersion) {
  const removed = await supabase.storage.from("acetate").remove([version.path]);
  if (removed.error) throw new Error(errorText(removed.error));
  const { error } = await supabase.from("acetate_versions").delete().eq("id", version.id);
  if (error) throw new Error(errorText(error));
}

async function uploadReserved(file: File, kind: "audio" | "art", ext: string, library: AcetateLibrary, onProgress?: (ratio: number) => void) {
  const path = await rpc<string>("acetate_reserve_upload", { p_kind: kind, p_bytes: file.size, p_ext: ext, p_library: library });
  const upload = file.size > 6 * 1024 * 1024 ? resumableStorageUpload : xhrStorageUpload;
  try {
    await upload({
      bucket: "acetate",
      path,
      blob: file,
      contentType: file.type || mimeForExt(ext),
      timeoutMs: 20 * 60 * 1000,
      onProgress,
    });
  } catch (e) {
    throw new Error((e as Error).message || "Upload failed");
  }
  return path;
}

export async function uploadAudio(
  file: File,
  opts: { trackId?: string; title?: string; projectId?: string; label?: string; library?: AcetateLibrary; onProgress?: (ratio: number) => void },
) {
  const scan = await scanUpload(file, { fileName: file.name, context: "audio" });
  if (!scan.ok) throw new Error(scan.reason);
  const ext = audioExt(file.name);
  if (!ext) throw new Error("Use mp3, wav, aiff, flac, aac, m4a, ogg, opus, or webm");
  if (!file.type.startsWith("audio/") && file.type && file.type !== "application/octet-stream") {
    throw new Error("That isn't an audio file");
  }
  let library = opts.library ?? "shelf";
  if (opts.trackId) {
    const existing = await supabase.from("acetate_tracks").select("library").eq("id", opts.trackId).maybeSingle();
    if (existing.data?.library === "vault") library = "vault";
  }
  const meta = await describeAudio(file);
  const path = await uploadReserved(file, "audio", ext, library, opts.onProgress);
  let trackId = opts.trackId ?? null;
  let created = false;
  try {
    if (!trackId) {
      const title = (opts.title || file.name.replace(/\.[^.]+$/, "")).trim().slice(0, 200) || "Untitled cut";
      const { data, error } = await supabase.from("acetate_tracks").insert({ owner_id: me(), title, library }).select("id").single();
      if (error || !data) throw new Error(errorText(error));
      trackId = data.id as string;
      created = true;
      if (opts.projectId) await addTrackToProject(opts.projectId, trackId);
    }
    const version = normalizeVersion(
      await rpc<AcetateVersion>("acetate_commit_version", {
        p_track: trackId,
        p_label: opts.label?.trim() || null,
        p_path: path,
        p_mime: file.type || mimeForExt(ext),
        p_bytes: file.size,
        p_duration: meta.duration,
        p_peaks: meta.peaks.length ? meta.peaks : null,
      }),
    );
    return { trackId, version };
  } catch (e) {
    await supabase.storage.from("acetate").remove([path]);
    if (created && trackId) await supabase.from("acetate_tracks").delete().eq("id", trackId);
    throw e instanceof Error ? e : new Error("Couldn't save that version");
  }
}

export async function uploadArtwork(file: File, target: "track" | "project", id: string) {
  const scan = await scanUpload(file, { fileName: file.name, context: "image" });
  if (!scan.ok) throw new Error(scan.reason);
  const ext = artExt(file.name);
  if (!ext) throw new Error("Artwork must be jpg, png, or webp");
  if (file.size > 8 * 1024 * 1024) throw new Error("Artwork must be under 8 MB");
  const table = target === "track" ? "acetate_tracks" : "acetate_projects";
  const existing = await supabase.from(table).select("library").eq("id", id).maybeSingle();
  const library: AcetateLibrary = existing.data?.library === "vault" ? "vault" : "shelf";
  const path = await uploadReserved(file, "art", ext, library);
  try {
    const oldPath = await rpc<string | null>("acetate_commit_art", { p_target: target, p_id: id, p_path: path });
    if (oldPath) await supabase.storage.from("acetate").remove([oldPath]);
    return path;
  } catch (e) {
    await supabase.storage.from("acetate").remove([path]);
    throw e instanceof Error ? e : new Error("Couldn't save artwork");
  }
}

export async function addComment(trackId: string, atSeconds: number, body: string, versionId?: string | null) {
  const text = body.trim();
  if (!text) throw new Error("Write a comment");
  const { error } = await supabase.from("acetate_comments").insert({
    track_id: trackId,
    version_id: versionId ?? null,
    author_id: me(),
    at_seconds: Math.max(0, atSeconds),
    body: text.slice(0, 500),
  });
  if (error) throw new Error(errorText(error));
}

export async function deleteComment(id: string) {
  const { error } = await supabase.from("acetate_comments").delete().eq("id", id);
  if (error) throw new Error(errorText(error));
}

export async function createShare(opts: {
  kind: "track" | "project";
  id: string;
  listing: "public" | "unlisted";
  password?: string;
  expiresAt?: string | null;
  download: boolean;
}) {
  const row = await rpc<AcetateShare>("acetate_share_create", {
    p_kind: opts.kind,
    p_id: opts.id,
    p_listing: opts.listing,
    p_password: opts.password?.trim() || null,
    p_expires: opts.expiresAt || null,
    p_download: opts.download,
  });
  return row;
}

export async function revokeShare(id: string) {
  await rpc<void>("acetate_share_revoke", { p_id: id });
}

export async function shareInfo(token: string) {
  if (!isConfigured) throw new Error("Acetate isn't connected to Supabase yet.");
  const { data, error } = await supabase.rpc("acetate_share_info", { p_token: token });
  if (error) throw new Error(errorText(error));
  return data as {
    ok: boolean;
    reason?: string;
    password?: boolean;
    listing?: "public" | "unlisted";
    download?: boolean;
    kind?: "track" | "project";
    title?: string;
    note?: string | null;
    owner?: string | null;
    owner_name?: string | null;
    track_count?: number;
  };
}

type SignerFailure = { ok: false; reason?: string; message?: string };

export async function openShare(token: string, password?: string | null, touch = true): Promise<SharedOpen> {
  return callSigner({ action: touch ? "open" : "preview", token, password: password || null });
}

export async function downloadShare(token: string, versionId: string, password?: string | null) {
  const data = await callSigner({ action: "download", token, password: password || null, version_id: versionId });
  return data as { ok: true; url: string; name: string };
}

async function callSigner(body: Record<string, unknown>) {
  const res = await fetch("/api/acetate/share", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let data = (await res.json().catch(() => null)) as (SharedOpen & { url?: string; name?: string }) | SignerFailure | null;
  if (res.status === 501) {
    const invoked = await supabase.functions.invoke("acetate", { body });
    if (invoked.error) {
      throw new Error("Playback links need the Acetate signer. Set SUPABASE_SERVICE_ROLE_KEY or deploy the acetate function.");
    }
    data = invoked.data as SharedOpen | SignerFailure;
  }
  if (!data || data.ok === false) {
    const reason = data && "reason" in data ? data.reason : undefined;
    if (reason === "password") throw new Error("Wrong password");
    if (reason === "expired") throw new Error("This link has expired");
    if (reason === "too_many") throw new Error("Too many tries. Wait a few minutes.");
    if (reason === "signer") throw new Error(data?.message || "Playback signing isn't set up yet");
    throw new Error((data && "message" in data && data.message) || "This link isn't available");
  }
  return data;
}

export async function commentOnShare(opts: {
  token: string;
  password?: string | null;
  trackId: string;
  versionId?: string | null;
  at: number;
  body: string;
  guest?: string;
}) {
  const { data, error } = await supabase.rpc("acetate_share_comment", {
    p_token: opts.token,
    p_password: opts.password || null,
    p_track: opts.trackId,
    p_version: opts.versionId || null,
    p_at: opts.at,
    p_body: opts.body,
    p_guest: opts.guest || null,
  });
  if (error) throw new Error(errorText(error));
  const row = data as { ok: boolean; reason?: string };
  if (!row?.ok) {
    if (row?.reason === "password") throw new Error("Wrong password");
    if (row?.reason === "too_many") throw new Error("Slow down — too many comments");
    throw new Error("Couldn't post that comment");
  }
}

export async function startCheckout() {
  const data = await rpc<{ ok: boolean; stub?: boolean; message?: string }>("acetate_start_checkout", {});
  return data;
}

export async function searchAcetateUsers(q: string) {
  const { data, error } = await supabase.rpc("acetate_admin_search", { p_q: q });
  if (error) throw new Error(errorText(error));
  return (data ?? []) as AcetateAdminRow[];
}

export async function setAcetatePremium(userId: string, on: boolean) {
  const { error } = await supabase.rpc("acetate_admin_set_premium", { p_user: userId, p_on: on });
  if (error) throw new Error(errorText(error));
}

export async function sendToNexusChat(conversationId: string, title: string, url: string) {
  const author = me();
  const content = `${title}\n${url}`.slice(0, 2000);
  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    author_id: author,
    content,
  });
  if (error) throw new Error(errorText(error));
}

export async function toggleLike(trackId: string) {
  return rpc<{ liked: boolean; count: number }>("acetate_toggle_like", { p_track: trackId });
}

export async function setFollow(userId: string, on: boolean) {
  await rpc<void>("acetate_set_follow", { p_user: userId, p_on: on });
}

export async function inviteCollaborator(projectId: string, username: string, role: "listener" | "editor") {
  await rpc<void>("acetate_invite_collaborator", { p_project: projectId, p_username: username, p_role: role });
}

export async function removeCollaborator(projectId: string, userId: string) {
  await rpc<void>("acetate_remove_collaborator", { p_project: projectId, p_user: userId });
}

export type AcetateCollaborator = { project_id: string; user_id: string; role: "listener" | "editor"; created_at: string };
export type AcetateNotice = { id: number; user_id: string; kind: "comment" | "collab"; track_id: string | null; project_id: string | null; body: string; read_at: string | null; created_at: string };

export async function loadCollaborators(projectId: string) {
  const { data, error } = await supabase.from("acetate_collaborators").select("project_id, user_id, role, created_at").eq("project_id", projectId);
  if (error) return [] as AcetateCollaborator[];
  return (data ?? []) as AcetateCollaborator[];
}

export async function loadNotices() {
  const { data, error } = await supabase.from("acetate_notifications").select("id, user_id, kind, track_id, project_id, body, read_at, created_at").order("created_at", { ascending: false }).limit(30);
  if (error) return [] as AcetateNotice[];
  return (data ?? []) as AcetateNotice[];
}

export async function markNotices(id?: number) {
  await rpc<void>("acetate_mark_notifications", { p_id: id ?? null });
}

export type AcetatePublicProfile = {
  ok: boolean;
  id?: string;
  username?: string;
  display_name?: string;
  followers?: number;
  following?: number;
  is_following?: boolean;
  tracks?: { id: string; title: string; status: string | null; likes: number; liked: boolean; lyrics?: string | null; comments?: number }[];
};

export async function loadPublicProfile(username: string) {
  const { data, error } = await supabase.rpc("acetate_public_profile", { p_username: username });
  if (error) throw new Error(errorText(error));
  return data as AcetatePublicProfile;
}

export function reportAcetateError(e: unknown) {
  toast(e instanceof Error ? e.message : errorText(e), "error");
}
