"use client";

import { create } from "zustand";
import * as tus from "tus-js-client";
import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";
import { loadProfiles } from "./data";
import type { Video, VideoComment } from "./types";

// ------------------------------------------------------------------ helpers
export function qualityLabel(h: number | null | undefined, w?: number | null) {
  const s = Math.min(h ?? 0, w ?? Infinity) || h || 0; // portrait videos: use the short side
  if (s >= 2160) return "4K";
  if (s >= 1440) return "1440p";
  if (s >= 1080) return "1080p HD";
  if (s >= 720) return "720p HD";
  if (s > 0) return `${s}p`;
  return "";
}
export const isHD = (v: Pick<Video, "height" | "width">) => Math.min(v.height ?? 0, v.width ?? 0) >= 720;

export function fmtDuration(sec: number | null | undefined) {
  if (!sec || !Number.isFinite(sec)) return "0:00";
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
export function fmtViews(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(n);
}
export function timeAgo(iso: string | null | undefined) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  const units: [number, string][] = [
    [31536000, "year"],
    [2592000, "month"],
    [604800, "week"],
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ];
  for (const [n, u] of units) if (s >= n) return `${Math.floor(s / n)} ${u}${Math.floor(s / n) > 1 ? "s" : ""} ago`;
  return "just now";
}
export const slugify = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

export function videoLink(v: Pick<Video, "id" | "slug">) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/v/${v.slug ?? v.id}`;
}

/** /v/<slug-or-id> links inside chat messages */
export const VIDEO_LINK_RE = /\/v\/([a-z0-9][a-z0-9-]{2,60}|[0-9a-f-]{36})(?=$|[?#\s])/i;

// ------------------------------------------------------------------ reads
const COLS = "*";

export async function feed(opts: { q?: string; owner?: string; limit?: number; subsOnly?: boolean } = {}): Promise<Video[]> {
  let q = supabase.from("videos").select(COLS).eq("status", "ready").is("removed_at", null).order("published_at", { ascending: false, nullsFirst: false }).limit(opts.limit ?? 48);
  if (opts.owner) q = q.eq("owner_id", opts.owner);
  else q = q.eq("visibility", "public");
  if (opts.q?.trim()) {
    const s = opts.q.trim().replace(/[%,()]/g, " ");
    q = q.or(`title.ilike.%${s}%,description.ilike.%${s}%`);
  }
  if (opts.subsOnly) {
    const me = useApp.getState().userId;
    const { data: subs } = await supabase.from("channel_subs").select("channel_id").eq("subscriber_id", me);
    const ids = (subs ?? []).map((x: { channel_id: string }) => x.channel_id);
    if (!ids.length) return [];
    q = q.in("owner_id", ids);
  }
  const { data } = await q;
  const list = (data ?? []) as Video[];
  void loadProfiles([...new Set(list.map((v) => v.owner_id))]);
  return list;
}

export async function getVideo(key: string): Promise<Video | null> {
  const isId = /^[0-9a-f-]{36}$/i.test(key);
  const { data } = await supabase.from("videos").select(COLS).eq(isId ? "id" : "slug", key.toLowerCase()).maybeSingle();
  if (data) void loadProfiles([(data as Video).owner_id]);
  return (data as Video) ?? null;
}

export async function myVideos(): Promise<Video[]> {
  const me = useApp.getState().userId;
  const { data } = await supabase.from("videos").select(COLS).eq("owner_id", me).order("created_at", { ascending: false }).limit(500);
  return (data ?? []) as Video[];
}

const playCache = new Map<string, { url: string; exp: number }>();
export async function playbackUrl(v: Pick<Video, "video_path">) {
  if (!v.video_path) return null;
  const hit = playCache.get(v.video_path);
  if (hit && hit.exp > Date.now() + 120_000) return hit.url;
  const { data, error } = await supabase.storage.from("videos").createSignedUrl(v.video_path, 4 * 3600);
  if (error || !data) return null;
  playCache.set(v.video_path, { url: data.signedUrl, exp: Date.now() + 4 * 3600_000 });
  return data.signedUrl;
}

export async function myReaction(videoId: string): Promise<number> {
  const me = useApp.getState().userId;
  const { data } = await supabase.from("video_reactions").select("value").eq("video_id", videoId).eq("user_id", me).maybeSingle();
  return (data?.value as number) ?? 0;
}

export async function react(videoId: string, value: number) {
  const { data, error } = await supabase.rpc("react_video", { p_video: videoId, p_value: value });
  if (error) toast(errorText(error), "error");
  return data as { likes: number; dislikes: number; mine: number } | null;
}

export async function recordView(videoId: string, watched: number) {
  await supabase.rpc("record_view", { p_video: videoId, p_watched: watched });
}

export async function comments(videoId: string): Promise<VideoComment[]> {
  const { data } = await supabase
    .from("video_comments")
    .select("*")
    .eq("video_id", videoId)
    .is("deleted_at", null)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(300);
  const list = (data ?? []) as VideoComment[];
  void loadProfiles([...new Set(list.map((c) => c.author_id))]);
  return list;
}

export async function comment(videoId: string, content: string, parent: string | null = null) {
  const { data, error } = await supabase.rpc("add_video_comment", { p_video: videoId, p_content: content, p_parent: parent });
  if (error) {
    toast(errorText(error), "error");
    return null;
  }
  return data as string;
}
export async function removeComment(id: string) {
  const { error } = await supabase.rpc("remove_video_comment", { p_comment: id });
  if (error) toast(errorText(error), "error");
  return !error;
}
export async function pinComment(id: string, pin: boolean) {
  const { error } = await supabase.rpc("pin_video_comment", { p_comment: id, p_pin: pin });
  if (error) toast(errorText(error), "error");
  return !error;
}

export async function subscription(channelId: string) {
  const me = useApp.getState().userId;
  const [{ count }, { data: mine }] = await Promise.all([
    supabase.from("channel_subs").select("channel_id", { count: "exact", head: true }).eq("channel_id", channelId),
    supabase.from("channel_subs").select("channel_id").eq("channel_id", channelId).eq("subscriber_id", me).maybeSingle(),
  ]);
  return { count: count ?? 0, subscribed: !!mine };
}
export async function setSubscribed(channelId: string, on: boolean) {
  const me = useApp.getState().userId!;
  const { error } = on
    ? await supabase.from("channel_subs").insert({ channel_id: channelId, subscriber_id: me })
    : await supabase.from("channel_subs").delete().eq("channel_id", channelId).eq("subscriber_id", me);
  if (error) toast(errorText(error), "error");
  return !error;
}

export async function dailyViews(days: number, videoId?: string) {
  const { data } = await supabase.rpc("channel_daily_views", { p_days: days, p_video: videoId ?? null });
  return (data ?? []) as { day: string; views: number; watch_seconds: number }[];
}

export async function updateVideo(id: string, patch: Partial<Video>) {
  const { data, error } = await supabase.from("videos").update(patch).eq("id", id).select().single();
  if (error) {
    toast(error.message.includes("videos_slug_key") ? "That custom link is already taken" : errorText(error), "error");
    return null;
  }
  return data as Video;
}

export async function deleteVideo(v: Video) {
  if (v.video_path) await supabase.storage.from("videos").remove([v.video_path]);
  const { error } = await supabase.from("videos").delete().eq("id", v.id);
  if (error) toast(errorText(error), "error");
  return !error;
}

export async function slugFree(slug: string, videoId: string) {
  const { data } = await supabase.rpc("slug_free", { p_slug: slug, p_video: videoId });
  return !!data;
}

export async function removeVideoAsMod(id: string, reason: string) {
  const { error } = await supabase.rpc("mod_remove_video", { p_video: id, p_reason: reason });
  if (error) toast(errorText(error), "error");
  else toast("Video removed", "success");
  return !error;
}

// ------------------------------------------------------------------ local file inspection
export type FileInfo = { width: number; height: number; duration: number };

export function inspectVideo(file: File): Promise<FileInfo> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;
    const url = URL.createObjectURL(file);
    let finished = false;
    const done = (info: FileInfo) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      v.removeAttribute("src");
      URL.revokeObjectURL(url);
      resolve(info);
    };
    // Safari/iPhone often never fires loadedmetadata for big or HEVC files → never block the upload
    const timer = setTimeout(() => done({ width: v.videoWidth || 0, height: v.videoHeight || 0, duration: Number.isFinite(v.duration) ? v.duration : 0 }), 4000);
    v.onloadedmetadata = () => done({ width: v.videoWidth, height: v.videoHeight, duration: Number.isFinite(v.duration) ? v.duration : 0 });
    v.onerror = () => done({ width: 0, height: 0, duration: 0 });
    v.src = url;
    v.load();
  });
}

/** Auto-thumbnails: frames at 15%, 50% and 85% of the video, 1280px wide JPEGs */
export async function autoThumbnails(file: File, count = 3): Promise<Blob[]> {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = url;
  try {
    await new Promise<void>((res, rej) => {
      v.onloadeddata = () => res();
      v.onerror = () => rej(new Error("unreadable"));
      setTimeout(() => rej(new Error("timeout")), 15000);
    });
    const out: Blob[] = [];
    const marks = [0.15, 0.5, 0.85].slice(0, count);
    for (const m of marks) {
      await new Promise<void>((res) => {
        v.onseeked = () => res();
        v.currentTime = Math.max(0.1, (v.duration || 1) * m);
        setTimeout(res, 4000);
      });
      const w = 1280;
      const h = Math.round((w * (v.videoHeight || 720)) / (v.videoWidth || 1280));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d")!.drawImage(v, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85));
      if (blob) out.push(blob);
    }
    return out;
  } catch {
    return [];
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadThumb(videoId: string, blob: Blob) {
  const me = useApp.getState().userId!;
  const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${me}/${videoId}.${ext}`;
  const { error } = await supabase.storage.from("video-thumbs").upload(path, blob, { upsert: true, contentType: blob.type || "image/jpeg" });
  if (error) {
    toast(`Thumbnail upload failed: ${errorText(error)}`, "error");
    return null;
  }
  return `${supabase.storage.from("video-thumbs").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
}

// ------------------------------------------------------------------ resumable uploads (keeps going while you browse)
export type UploadItem = {
  videoId: string;
  name: string;
  bytes: number;
  sent: number;
  speed: number;
  status: "uploading" | "done" | "error" | "paused";
  error?: string;
};

export const useUploads = create<{ items: Record<string, UploadItem> }>(() => ({ items: {} }));
const running = new Map<string, tus.Upload>();

const MAX_VIDEO = 50 * 1024 ** 3; // 50 GB hard stop; the Supabase project limit applies first

export async function startVideoUpload(file: File, info: FileInfo): Promise<Video | null> {
  const me = useApp.getState().userId!;
  if (file.size > MAX_VIDEO) {
    toast("That file is over 50 GB", "error");
    return null;
  }
  const title = file.name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").slice(0, 100) || "Untitled";
  const { data: row, error } = await supabase
    .from("videos")
    .insert({
      owner_id: me,
      title,
      status: "uploading",
      visibility: "private",
      mime: file.type || "video/mp4",
      width: info.width || null,
      height: info.height || null,
      duration: info.duration || null,
      bytes: file.size,
    })
    .select()
    .single();
  if (error || !row) {
    toast(errorText(error), "error");
    return null;
  }
  const v = row as Video;
  const ext = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
  const path = `${me}/${v.id}/source.${ext}`;
  await supabase.from("videos").update({ video_path: path }).eq("id", v.id);

  const { data: s } = await supabase.auth.getSession();
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(".supabase.co", ".storage.supabase.co");
  useUploads.setState((st) => ({ items: { ...st.items, [v.id]: { videoId: v.id, name: file.name, bytes: file.size, sent: 0, speed: 0, status: "uploading" } } }));
  let last = { t: Date.now(), b: 0 };

  const up = new tus.Upload(file, {
    endpoint: `${base}/storage/v1/upload/resumable`,
    retryDelays: [0, 2000, 5000, 10000, 20000, 30000],
    headers: {
      authorization: `Bearer ${s.session?.access_token}`,
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      // each upload gets a fresh path; upsert would also need an UPDATE policy and fails RLS
      "x-upsert": "false",
    },
    uploadDataDuringCreation: true,
    removeFingerprintOnSuccess: true,
    chunkSize: 6 * 1024 * 1024, // Supabase requires exactly 6 MB chunks
    metadata: { bucketName: "videos", objectName: path, contentType: file.type || "video/mp4", cacheControl: "3600" },
    onProgress(sent, total) {
      const now = Date.now();
      const dt = (now - last.t) / 1000;
      const speed = dt > 0.8 ? (sent - last.b) / dt : undefined;
      if (speed !== undefined) last = { t: now, b: sent };
      useUploads.setState((st) => {
        const cur = st.items[v.id];
        return cur ? { items: { ...st.items, [v.id]: { ...cur, sent, bytes: total, speed: speed ?? cur.speed } } } : st;
      });
    },
    async onSuccess() {
      running.delete(v.id);
      await supabase.from("videos").update({ status: "ready" }).eq("id", v.id);
      useUploads.setState((st) => ({ items: { ...st.items, [v.id]: { ...st.items[v.id], sent: file.size, status: "done" } } }));
      window.dispatchEvent(new CustomEvent("nexus:video-ready", { detail: v.id }));
    },
    async onError(err) {
      running.delete(v.id);
      const msg = String(err?.message ?? err);
      const tooBig = /413|too large|exceeded the maximum allowed size|Payload too large/i.test(msg);
      const nice = tooBig ? "File is bigger than the server's upload limit — raise it in Supabase → Storage → Settings." : msg.slice(0, 200);
      await supabase.from("videos").update({ status: "failed" }).eq("id", v.id);
      useUploads.setState((st) => ({ items: { ...st.items, [v.id]: { ...st.items[v.id], status: "error", error: nice } } }));
      toast(`Upload failed: ${nice}`, "error");
    },
  });
  running.set(v.id, up);
  const prev = await up.findPreviousUploads();
  if (prev.length) up.resumeFromPreviousUpload(prev[0]);
  up.start();
  return { ...v, video_path: path };
}

export function cancelUpload(videoId: string) {
  const up = running.get(videoId);
  if (up) void up.abort(true);
  running.delete(videoId);
  useUploads.setState((st) => {
    const items = { ...st.items };
    delete items[videoId];
    return { items };
  });
}

export function uploadingNow() {
  return Object.values(useUploads.getState().items).some((i) => i.status === "uploading");
}
