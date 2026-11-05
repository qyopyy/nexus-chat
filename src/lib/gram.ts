"use client";

// NexusGram — photo posts, Shorts, 24 h / 48 h stories, follows. Media lives in the public "gram" bucket.

import { create } from "zustand";
import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";
import { loadProfiles } from "./data";
import { compressImage, compressVideo } from "./compressMedia";

export type Media = {
  path: string;
  type: "image" | "video";
  w?: number;
  h?: number;
  dur?: number;
  poster?: string | null;
  /** client compression generation — 2 = hq 60fps pipeline */
  v?: number;
  fps?: number;
};
export type Post = { id: string; author_id: string; kind: "post" | "short"; media: Media[]; caption: string; like_count: number; comment_count: number; view_count: number; created_at: string; liked?: boolean; following?: boolean; saved?: boolean };
export type Story = { id: string; author_id: string; media: Media; caption: string; duration_h: 24 | 48; expires_at: string; like_count: number; view_count: number; created_at: string };
export type TrayItem = { author_id: string; latest: string; count: number; unseen: number };
export type GramProfile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_color: string;
  banner_url: string | null;
  banner_color: string | null;
  bio: string | null;
  verified: boolean;
  role: string;
  followers: number;
  following: number;
  posts: number;
  likes: number;
  is_following: boolean;
  follows_you: boolean;
  grid: { id: string; kind: "post" | "short"; cover: Media; count: number; like_count: number; comment_count: number; view_count: number; created_at: string }[];
  stories: { id: string; media: Media; caption: string; created_at: string; expires_at: string; like_count: number }[];
};
export type Comment = { id: number; post_id: string; author_id: string; body: string; created_at: string };

export type GramRoute =
  | { view: "home" }
  | { view: "shorts"; start?: string }
  | { view: "profile"; username: string }
  | { view: "post"; id: string }
  | { view: "explore" }
  | { view: "saved" }
  | { view: "admin" };
export const useGram = create<{ stack: GramRoute[]; story: { authors: string[]; index: number } | null; create: null | "post" | "short" | "story"; trayEpoch: number }>(() => ({
  stack: [{ view: "home" }],
  story: null,
  create: null,
  trayEpoch: 0,
}));
export const gramGo = (r: GramRoute) => useGram.setState((s) => ({ stack: [...s.stack, r] }));
export const gramBack = () => useGram.setState((s) => ({ stack: s.stack.length > 1 ? s.stack.slice(0, -1) : s.stack }));
export const gramHome = (r: GramRoute = { view: "home" }) => useGram.setState({ stack: [r] });
export const bumpStoryTray = () => useGram.setState((s) => ({ trayEpoch: s.trayEpoch + 1 }));
/** open NexusGram (desktop hub or phone tab) at a route */
export function openGram(r?: GramRoute) {
  if (r) gramHome(r);
  const mobile = typeof window !== "undefined" && window.innerWidth < 768;
  useApp.setState(mobile ? { mobileTab: "gram", mobileSidebar: true } : { hub: "gram" });
}

export const mediaUrl = (path?: string | null) => (path ? (/^https?:/.test(path) ? path : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/gram/${path.split("/").map(encodeURIComponent).join("/")}`) : "");
export const publicProfileUrl = (username: string) => `${typeof window !== "undefined" ? window.location.origin : "https://nexusproject.cc"}/u/${username}`;
/** Public shareable content link — /n/<id> works for posts and stories */
export const publicContentUrl = (id: string) => `${typeof window !== "undefined" ? window.location.origin : "https://nexusproject.cc"}/n/${id}`;
export const appContentUrl = (id: string) => `${typeof window !== "undefined" ? window.location.origin : "https://nexusproject.cc"}/n/${id}`;
/** Legacy aliases — /g and /gram/p still work */
export const publicPostUrl = (id: string) => publicContentUrl(id);
export const appPostUrl = (id: string) => `${typeof window !== "undefined" ? window.location.origin : "https://nexusproject.cc"}/gram/c/${id}`;
export const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K` : String(n));
export const ago = (d: string) => {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  return s < 60 ? "now" : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : s < 604800 ? `${Math.floor(s / 86400)}d` : new Date(d).toLocaleDateString([], { month: "short", day: "numeric" });
};
const me = () => useApp.getState().userId!;

const VIDEO_EXT = /^(mp4|m4v|mov|webm|mkv|avi|3gp|3g2)$/i;
const IMAGE_EXT = /^(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i;

/** browsers (esp. iOS) often leave File.type empty — infer from the name */
export function mediaKind(file: File): "video" | "image" | null {
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("image/")) return "image";
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (VIDEO_EXT.test(ext)) return "video";
  if (IMAGE_EXT.test(ext)) return "image";
  return null;
}
function mimeFor(file: File, kind: "video" | "image") {
  if (file.type) return file.type;
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (kind === "video") {
    if (ext === "mov") return "video/quicktime";
    if (ext === "webm") return "video/webm";
    if (ext === "m4v") return "video/x-m4v";
    return "video/mp4";
  }
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  if (ext === "heic" || ext === "heif") return "image/heic";
  return "image/jpeg";
}

// ------------------------------------------------------------------ media upload
/** XHR upload — fetch-based supabase.storage.upload hangs after CORS OPTIONS on iOS for large .mov/.mp4 */
async function put(blob: Blob, ext: string, type: string, onProgress?: (p: number) => void) {
  const path = `${me()}/${crypto.randomUUID()}.${ext}`;
  const { data: s } = await supabase.auth.getSession();
  const token = s.session?.access_token;
  if (!token) throw new Error("Sign in again to upload");
  await new Promise<void>((res, rej) => {
    const x = new XMLHttpRequest();
    x.open("POST", `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/gram/${path.split("/").map(encodeURIComponent).join("/")}`);
    x.setRequestHeader("Authorization", `Bearer ${token}`);
    x.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "");
    x.setRequestHeader("Content-Type", type || "application/octet-stream");
    x.setRequestHeader("x-upsert", "false");
    x.setRequestHeader("cache-control", "31536000");
    x.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    x.onload = () => {
      if (x.status < 300) return res();
      let msg = `Upload failed (${x.status})`;
      try {
        const j = JSON.parse(x.responseText) as { message?: string; error?: string };
        msg = j.message || j.error || msg;
      } catch {
        /* */
      }
      rej(new Error(msg));
    };
    x.onerror = () => rej(new Error("Network error while uploading — check your connection and try again"));
    x.ontimeout = () => rej(new Error("Upload timed out — try a shorter clip"));
    x.timeout = 5 * 60 * 1000;
    x.send(blob);
  });
  return path;
}
export async function uploadMedia(file: File, onStep?: (s: string) => void): Promise<Media> {
  const kind = mediaKind(file);
  if (kind === "video") {
    if (file.size > 100 * 1024 * 1024) throw new Error("Videos can be up to 100 MB");
    // Re-encode HEVC/.mov (and large clips) so stories/posts play on every device
    const progress = (label: string, ratio?: number) => {
      if (ratio == null) onStep?.(label);
      else onStep?.(`${label} ${Math.round(ratio * 100)}%`);
    };
    let compressed;
    try {
      compressed = await compressVideo(file, { maxEdge: 1440, maxFps: 60, onProgress: progress });
    } catch {
      onStep?.("Compression failed — uploading original…");
      const ext = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
      compressed = {
        blob: file as Blob,
        w: 720,
        h: 1280,
        dur: 0,
        fps: 30,
        mime: mimeFor(file, "video"),
        ext,
        poster: null as Blob | null,
        skipped: true,
      };
    }
    onStep?.("Uploading video…");
    const path = await put(compressed.blob, compressed.ext, compressed.mime || "video/mp4", (p) => onStep?.(`Uploading video… ${Math.round(p * 100)}%`));
    let poster: string | null = null;
    if (compressed.poster) {
      onStep?.("Uploading cover…");
      poster = await put(compressed.poster, "jpg", "image/jpeg").catch(() => null);
    }
    return {
      path,
      type: "video",
      w: compressed.w,
      h: compressed.h,
      dur: Math.round(compressed.dur * 10) / 10,
      poster,
      v: compressed.skipped ? 1 : 2,
      fps: compressed.fps,
    };
  }
  if (kind !== "image") throw new Error("Pick a photo or a video");
  onStep?.("Compressing photo…");
  const { blob, w, h } = await compressImage(file, 1600, 0.9);
  if ((blob === file || blob.size === 0) && /heic|heif/i.test(file.type || file.name)) {
    throw new Error("This HEIC photo can't be used here — export it as JPEG first");
  }
  onStep?.("Uploading photo…");
  const path = await put(blob, blob.type === "image/png" ? "png" : "jpg", blob.type || "image/jpeg", (p) => onStep?.(`Uploading photo… ${Math.round(p * 100)}%`));
  return { path, type: "image", w, h, v: 2 };
}

// ------------------------------------------------------------------ posts
export async function createPost(kind: "post" | "short", media: Media[], caption: string) {
  const { data, error } = await supabase.from("gram_posts").insert({ author_id: me(), kind, media, caption: caption.trim().slice(0, 2200) }).select().single();
  if (error) throw new Error(errorText(error));
  return data as Post;
}
export async function feed(scope: "following" | "discover", kind: "post" | "short" | null, before?: string | null) {
  const { data, error } = await supabase.rpc("gram_feed", { p_scope: scope, p_kind: kind, p_before: before ?? null, p_limit: 15 });
  if (error) {
    toast(errorText(error), "error");
    return [];
  }
  const rows = (data ?? []) as Post[];
  void loadProfiles([...new Set(rows.map((r) => r.author_id))]);
  return rows;
}
export async function getPost(id: string) {
  const { data } = await supabase.from("gram_posts").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const { data: l } = await supabase.from("gram_likes").select("post_id").eq("post_id", id).eq("user_id", me()).maybeSingle();
  void loadProfiles([data.author_id as string]);
  return { ...(data as Post), liked: !!l };
}
export async function removePost(id: string) {
  const { error } = await supabase.from("gram_posts").delete().eq("id", id);
  if (error) toast(errorText(error), "error");
  return !error;
}
export async function setLike(id: string, on: boolean) {
  const q = on ? supabase.from("gram_likes").insert({ post_id: id, user_id: me() }) : supabase.from("gram_likes").delete().eq("post_id", id).eq("user_id", me());
  const { error } = await q;
  if (error && !/duplicate/i.test(error.message)) toast(errorText(error), "error");
}
export const countView = (id: string) => void supabase.rpc("gram_view", { p_post: id });

export async function comments(postId: string) {
  const { data } = await supabase.from("gram_comments").select("*").eq("post_id", postId).order("created_at").limit(300);
  const rows = (data ?? []) as Comment[];
  void loadProfiles([...new Set(rows.map((r) => r.author_id))]);
  return rows;
}
export async function addComment(postId: string, body: string) {
  const { data, error } = await supabase.from("gram_comments").insert({ post_id: postId, author_id: me(), body: body.trim().slice(0, 1000) }).select().single();
  if (error) {
    toast(errorText(error), "error");
    return null;
  }
  return data as Comment;
}
export async function removeComment(id: number) {
  const { error } = await supabase.from("gram_comments").delete().eq("id", id);
  if (error) toast(errorText(error), "error");
  return !error;
}

// ------------------------------------------------------------------ follows & profiles
export async function profile(username: string) {
  const { data, error } = await supabase.rpc("gram_profile", { p_username: username });
  if (error) toast(errorText(error), "error");
  return (data ?? null) as GramProfile | null;
}
export async function setFollow(userId: string, on: boolean) {
  const q = on ? supabase.from("gram_follows").insert({ follower_id: me(), followee_id: userId }) : supabase.from("gram_follows").delete().eq("follower_id", me()).eq("followee_id", userId);
  const { error } = await q;
  if (error && !/duplicate/i.test(error.message)) {
    toast(errorText(error), "error");
    return false;
  }
  return true;
}
export async function followList(userId: string, which: "followers" | "following") {
  const col = which === "followers" ? "followee_id" : "follower_id";
  const other = which === "followers" ? "follower_id" : "followee_id";
  const { data } = await supabase.from("gram_follows").select(`${other}, created_at`).eq(col, userId).order("created_at", { ascending: false }).limit(500);
  const ids = (data ?? []).map((r) => (r as Record<string, string>)[other]);
  await loadProfiles(ids);
  return ids;
}
export async function changeUsername(name: string) {
  const { data, error } = await supabase.rpc("change_username", { p_username: name });
  if (error) throw new Error(errorText(error));
  const u = data as string;
  const id = useApp.getState().userId!;
  useApp.setState((s) => ({ profiles: { ...s.profiles, [id]: { ...s.profiles[id], username: u } } }));
  return u;
}

// ------------------------------------------------------------------ stories
export async function createStory(media: Media, caption: string, hours: 24 | 48) {
  const { data, error } = await supabase.from("gram_stories").insert({ author_id: me(), media, caption: caption.trim().slice(0, 200), duration_h: hours }).select().single();
  if (error) throw new Error(errorText(error));
  bumpStoryTray();
  return data as Story;
}
export async function storyTray() {
  const { data } = await supabase.rpc("gram_story_tray");
  const rows = (data ?? []) as TrayItem[];
  void loadProfiles(rows.map((r) => r.author_id));
  return rows;
}
export async function storiesOf(authorId: string) {
  const { data } = await supabase.from("gram_stories").select("*").eq("author_id", authorId).gt("expires_at", new Date().toISOString()).order("created_at");
  return (data ?? []) as Story[];
}
export async function myStoryState(ids: string[]) {
  if (!ids.length) return { seen: new Set<string>(), liked: new Set<string>() };
  const [v, l] = await Promise.all([
    supabase.from("gram_story_views").select("story_id").eq("viewer_id", me()).in("story_id", ids),
    supabase.from("gram_story_likes").select("story_id").eq("user_id", me()).in("story_id", ids),
  ]);
  return { seen: new Set((v.data ?? []).map((r) => r.story_id as string)), liked: new Set((l.data ?? []).map((r) => r.story_id as string)) };
}
export const viewStory = (id: string) => void supabase.rpc("gram_view_story", { p_story: id });
export async function likeStory(id: string, on: boolean) {
  const q = on ? supabase.from("gram_story_likes").insert({ story_id: id, user_id: me() }) : supabase.from("gram_story_likes").delete().eq("story_id", id).eq("user_id", me());
  const { error } = await q;
  if (error && !/duplicate/i.test(error.message)) toast(errorText(error), "error");
  return !error || /duplicate/i.test(error?.message ?? "");
}
export async function storyViewers(id: string) {
  const { data } = await supabase.from("gram_story_views").select("viewer_id, at").eq("story_id", id).order("at", { ascending: false }).limit(300);
  const ids = (data ?? []).map((r) => r.viewer_id as string);
  await loadProfiles(ids);
  return ids;
}
export async function removeStory(id: string) {
  const { error } = await supabase.from("gram_stories").delete().eq("id", id);
  if (error) toast(errorText(error), "error");
  return !error;
}

// ------------------------------------------------------------------ saves, reports, admin
export async function setSave(postId: string, on: boolean) {
  const q = on ? supabase.from("gram_saves").insert({ post_id: postId, user_id: me() }) : supabase.from("gram_saves").delete().eq("post_id", postId).eq("user_id", me());
  const { error } = await q;
  if (error && !/duplicate/i.test(error.message)) {
    toast(errorText(error), "error");
    return false;
  }
  return true;
}
export async function isSaved(postId: string) {
  const { data } = await supabase.from("gram_saves").select("post_id").eq("post_id", postId).eq("user_id", me()).maybeSingle();
  return !!data;
}
export async function savedFeed(before?: string | null) {
  let q = supabase.from("gram_saves").select("post_id, created_at, gram_posts(*)").eq("user_id", me()).order("created_at", { ascending: false }).limit(30);
  if (before) q = q.lt("created_at", before);
  const { data, error } = await q;
  if (error) {
    toast(errorText(error), "error");
    return [];
  }
  const rows = (data ?? [])
    .map((r) => {
      const p = (r as { gram_posts: Post | Post[] | null }).gram_posts;
      const post = Array.isArray(p) ? p[0] : p;
      return post ? ({ ...post, liked: false, saved: true } as Post) : null;
    })
    .filter(Boolean) as Post[];
  void loadProfiles([...new Set(rows.map((r) => r.author_id))]);
  return rows;
}
export async function reportPost(postId: string, reason: string) {
  const { error } = await supabase.from("gram_reports").insert({ post_id: postId, reporter_id: me(), reason: reason.trim().slice(0, 500) });
  if (error) {
    toast(errorText(error), "error");
    return false;
  }
  toast("Report sent — thanks", "success");
  return true;
}
export async function adminSetUsername(userId: string, username: string) {
  const { data, error } = await supabase.rpc("admin_set_username", { p_user: userId, p_username: username });
  if (error) throw new Error(errorText(error));
  const u = data as string;
  useApp.setState((s) => ({ profiles: { ...s.profiles, [userId]: { ...s.profiles[userId], username: u } } }));
  return u;
}
export async function modRemoveGramPost(postId: string, reason = "") {
  const { error } = await supabase.rpc("mod_remove_gram_post", { p_post: postId, p_reason: reason });
  if (error) {
    toast(errorText(error), "error");
    return false;
  }
  toast("Post removed", "success");
  return true;
}
export async function gramAdminStats() {
  const { data, error } = await supabase.rpc("gram_admin_stats");
  if (error) return null;
  return data as Record<string, number>;
}
export async function listOpenReports() {
  const { data, error } = await supabase.from("gram_reports").select("*").eq("status", "open").order("created_at", { ascending: false }).limit(50);
  if (error) {
    toast(errorText(error), "error");
    return [];
  }
  return (data ?? []) as { id: number; post_id: string | null; story_id: string | null; reporter_id: string; reason: string; created_at: string }[];
}
export async function reviewReport(id: number, status: "reviewed" | "dismissed" | "removed") {
  const { error } = await supabase
    .from("gram_reports")
    .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: me() })
    .eq("id", id);
  if (error) toast(errorText(error), "error");
  return !error;
}
export async function recentGramPosts(limit = 40) {
  const { data, error } = await supabase.from("gram_posts").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) {
    toast(errorText(error), "error");
    return [];
  }
  const rows = (data ?? []) as Post[];
  void loadProfiles([...new Set(rows.map((r) => r.author_id))]);
  return rows;
}

/** Recompress every live video story for the current user (hq / 60fps pipeline). */
export async function repairMyLiveStories(onStep?: (s: string) => void): Promise<{ fixed: number; skipped: number; failed: number }> {
  const uid = me();
  const { data, error } = await supabase.from("gram_stories").select("*").eq("author_id", uid).gt("expires_at", new Date().toISOString()).order("created_at");
  if (error) {
    toast(errorText(error), "error");
    return { fixed: 0, skipped: 0, failed: 0 };
  }
  const stories = (data ?? []) as Story[];
  let fixed = 0,
    skipped = 0,
    failed = 0;
  for (const [idx, s] of stories.entries()) {
    if (s.media.type !== "video") {
      skipped++;
      continue;
    }
    if ((s.media.v ?? 0) >= 2) {
      skipped++;
      continue;
    }
    onStep?.(`Upgrading story ${idx + 1}/${stories.length}…`);
    try {
      const url = mediaUrl(s.media.path);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const raw = await res.blob();
      const file = new File([raw], s.media.path.split("/").pop() || "story.mp4", { type: raw.type || "video/mp4" });
      const compressed = await compressVideo(file, {
        maxEdge: 1440,
        maxFps: 60,
        force: true,
        onProgress: (label, ratio) => {
          if (ratio == null) onStep?.(label);
          else onStep?.(`${label} ${Math.round(ratio * 100)}%`);
        },
      });
      const path = await put(compressed.blob, compressed.ext, compressed.mime || "video/mp4");
      let poster = s.media.poster ?? null;
      if (compressed.poster) poster = await put(compressed.poster, "jpg", "image/jpeg").catch(() => poster);
      const media: Media = {
        path,
        type: "video",
        w: compressed.w,
        h: compressed.h,
        dur: Math.round(compressed.dur * 10) / 10,
        poster,
        v: 2,
        fps: compressed.fps,
      };
      const { error: upErr } = await supabase.from("gram_stories").update({ media }).eq("id", s.id).eq("author_id", uid);
      if (upErr) throw new Error(errorText(upErr));
      fixed++;
    } catch (e) {
      console.warn("story repair failed", s.id, e);
      failed++;
    }
  }
  if (fixed) {
    bumpStoryTray();
    toast(`Upgraded ${fixed} stor${fixed === 1 ? "y" : "ies"} to HD`, "success");
  }
  return { fixed, skipped, failed };
}

const REPAIR_KEY = "nexus:gram-story-repair-v2";
/** Run once per browser session when opening NexusGram */
export function scheduleStoryRepair() {
  if (typeof window === "undefined") return;
  if (sessionStorage.getItem(REPAIR_KEY)) return;
  sessionStorage.setItem(REPAIR_KEY, "1");
  void repairMyLiveStories().catch(() => {});
}
