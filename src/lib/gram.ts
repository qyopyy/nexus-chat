"use client";

// NexusGram — photo posts, Shorts, 24 h / 48 h stories, follows. Media lives in the public "gram" bucket.

import { create } from "zustand";
import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";
import { loadProfiles } from "./data";

export type Media = { path: string; type: "image" | "video"; w?: number; h?: number; dur?: number; poster?: string | null };
export type Post = { id: string; author_id: string; kind: "post" | "short"; media: Media[]; caption: string; like_count: number; comment_count: number; view_count: number; created_at: string; liked?: boolean; following?: boolean };
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

export type GramRoute = { view: "home" } | { view: "shorts"; start?: string } | { view: "profile"; username: string } | { view: "post"; id: string } | { view: "explore" };
export const useGram = create<{ stack: GramRoute[]; story: { authors: string[]; index: number } | null; create: null | "post" | "short" | "story" }>(() => ({
  stack: [{ view: "home" }],
  story: null,
  create: null,
}));
export const gramGo = (r: GramRoute) => useGram.setState((s) => ({ stack: [...s.stack, r] }));
export const gramBack = () => useGram.setState((s) => ({ stack: s.stack.length > 1 ? s.stack.slice(0, -1) : s.stack }));
export const gramHome = (r: GramRoute = { view: "home" }) => useGram.setState({ stack: [r] });
/** open NexusGram (desktop hub or phone tab) at a route */
export function openGram(r?: GramRoute) {
  if (r) gramHome(r);
  const mobile = typeof window !== "undefined" && window.innerWidth < 768;
  useApp.setState(mobile ? { mobileTab: "gram", mobileSidebar: true } : { hub: "gram" });
}

export const mediaUrl = (path?: string | null) => (path ? (/^https?:/.test(path) ? path : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/gram/${path.split("/").map(encodeURIComponent).join("/")}`) : "");
export const publicProfileUrl = (username: string) => `${typeof window !== "undefined" ? window.location.origin : "https://nexusproject.cc"}/u/${username}`;
export const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K` : String(n));
export const ago = (d: string) => {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  return s < 60 ? "now" : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : s < 604800 ? `${Math.floor(s / 86400)}d` : new Date(d).toLocaleDateString([], { month: "short", day: "numeric" });
};
const me = () => useApp.getState().userId!;

// ------------------------------------------------------------------ media upload
async function downscale(file: File, max = 1440): Promise<{ blob: Blob; w: number; h: number }> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return { blob: file, w: 0, h: 0 };
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k);
  const h = Math.round(bmp.height * k);
  if (k === 1 && file.size < 1.5e6 && /jpe?g|webp/.test(file.type)) return { blob: file, w, h };
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b ?? file), "image/jpeg", 0.88));
  return { blob, w, h };
}
/** grab a frame from a video for the cover image */
async function videoInfo(file: File): Promise<{ w: number; h: number; dur: number; poster: Blob | null }> {
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = url;
    await new Promise<void>((res, rej) => {
      v.onloadeddata = () => res();
      v.onerror = () => rej(new Error("Can't read this video"));
      setTimeout(() => res(), 8000);
    });
    v.currentTime = Math.min(0.5, (v.duration || 1) / 3);
    await new Promise<void>((res) => {
      v.onseeked = () => res();
      setTimeout(res, 3000);
    });
    const w = v.videoWidth || 720;
    const h = v.videoHeight || 1280;
    const k = Math.min(1, 720 / Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = Math.round(w * k);
    c.height = Math.round(h * k);
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    const poster = await new Promise<Blob | null>((res) => c.toBlob((b) => res(b), "image/jpeg", 0.82));
    return { w, h, dur: v.duration || 0, poster };
  } finally {
    URL.revokeObjectURL(url);
  }
}
async function put(blob: Blob, ext: string, type: string) {
  const path = `${me()}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("gram").upload(path, blob, { contentType: type, upsert: false, cacheControl: "31536000" });
  if (error) throw new Error(errorText(error));
  return path;
}
export async function uploadMedia(file: File, onStep?: (s: string) => void): Promise<Media> {
  if (file.type.startsWith("video/")) {
    if (file.size > 100 * 1024 * 1024) throw new Error("Videos can be up to 100 MB");
    onStep?.("Reading video…");
    const info = await videoInfo(file);
    onStep?.("Uploading video…");
    const ext = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
    const path = await put(file, ext, file.type || "video/mp4");
    const poster = info.poster ? await put(info.poster, "jpg", "image/jpeg") : null;
    return { path, type: "video", w: info.w, h: info.h, dur: Math.round(info.dur * 10) / 10, poster };
  }
  if (!file.type.startsWith("image/")) throw new Error("Pick a photo or a video");
  onStep?.("Uploading photo…");
  const { blob, w, h } = await downscale(file);
  const path = await put(blob, blob.type === "image/png" ? "png" : "jpg", blob.type || "image/jpeg");
  return { path, type: "image", w, h };
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
  await q;
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
