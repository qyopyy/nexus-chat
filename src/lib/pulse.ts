"use client";

// Nexus Pulse — Twitter-style microblogging.

import { create } from "zustand";
import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";
import { loadProfiles } from "./data";

export type PulsePost = {
  id: string;
  author_id: string;
  body: string;
  reply_to: string | null;
  repost_of: string | null;
  like_count: number;
  reply_count: number;
  repost_count: number;
  created_at: string;
  liked?: boolean;
};

export type PulseRoute = { view: "home" } | { view: "profile"; username: string } | { view: "post"; id: string };

export const usePulse = create<{ stack: PulseRoute[] }>(() => ({ stack: [{ view: "home" }] }));
export const pulseGo = (r: PulseRoute) => usePulse.setState((s) => ({ stack: [...s.stack, r].slice(-20) }));
export const pulseBack = () => usePulse.setState((s) => ({ stack: s.stack.length > 1 ? s.stack.slice(0, -1) : s.stack }));
export const pulseHome = () => usePulse.setState({ stack: [{ view: "home" }] });

export function openPulse(r?: PulseRoute) {
  if (r) usePulse.setState({ stack: [r] });
  else pulseHome();
  const mobile = typeof window !== "undefined" && window.innerWidth < 768;
  useApp.setState(mobile ? { mobileTab: "gram", hub: "pulse" } : { hub: "pulse" });
}

const me = () => useApp.getState().userId!;

export async function pulseFeed(before?: string | null) {
  let q = supabase.from("pulse_posts").select("*").is("reply_to", null).order("created_at", { ascending: false }).limit(40);
  if (before) q = q.lt("created_at", before);
  const { data, error } = await q;
  if (error) {
    toast(errorText(error), "error");
    return [];
  }
  const rows = (data ?? []) as PulsePost[];
  const ids = rows.map((r) => r.id);
  let liked = new Set<string>();
  if (ids.length) {
    const { data: likes } = await supabase.from("pulse_likes").select("post_id").eq("user_id", me()).in("post_id", ids);
    liked = new Set((likes ?? []).map((l) => l.post_id as string));
  }
  void loadProfiles([...new Set(rows.map((r) => r.author_id))]);
  return rows.map((r) => ({ ...r, liked: liked.has(r.id) }));
}

export async function pulseCreate(body: string, replyTo?: string | null) {
  const text = body.trim().slice(0, 500);
  if (!text) throw new Error("Write something first");
  const { data, error } = await supabase
    .from("pulse_posts")
    .insert({ author_id: me(), body: text, reply_to: replyTo ?? null })
    .select()
    .single();
  if (error) throw new Error(errorText(error));
  if (replyTo) {
    const { data: parent } = await supabase.from("pulse_posts").select("reply_count").eq("id", replyTo).maybeSingle();
    if (parent) await supabase.from("pulse_posts").update({ reply_count: (parent.reply_count as number) + 1 }).eq("id", replyTo);
  }
  return data as PulsePost;
}

export async function pulseLike(id: string, on: boolean) {
  const q = on ? supabase.from("pulse_likes").insert({ post_id: id, user_id: me() }) : supabase.from("pulse_likes").delete().eq("post_id", id).eq("user_id", me());
  const { error } = await q;
  if (error && !/duplicate/i.test(error.message)) {
    toast(errorText(error), "error");
    return false;
  }
  const { data: row } = await supabase.from("pulse_posts").select("like_count").eq("id", id).maybeSingle();
  if (row) {
    const next = Math.max(0, ((row.like_count as number) ?? 0) + (on ? 1 : -1));
    await supabase.from("pulse_posts").update({ like_count: next }).eq("id", id);
  }
  return true;
}

export async function pulseRepost(id: string) {
  const { data: orig } = await supabase.from("pulse_posts").select("*").eq("id", id).maybeSingle();
  if (!orig) return toast("Post not found", "error");
  const { error } = await supabase.from("pulse_posts").insert({
    author_id: me(),
    body: (orig as PulsePost).body,
    repost_of: id,
  });
  if (error) return toast(errorText(error), "error");
  await supabase.from("pulse_posts").update({ repost_count: ((orig as PulsePost).repost_count ?? 0) + 1 }).eq("id", id);
  toast("Reposted", "success");
}

export async function pulseDelete(id: string) {
  const { error } = await supabase.from("pulse_posts").delete().eq("id", id);
  if (error) toast(errorText(error), "error");
  return !error;
}

export async function pulseReplies(id: string) {
  const { data } = await supabase.from("pulse_posts").select("*").eq("reply_to", id).order("created_at").limit(100);
  const rows = (data ?? []) as PulsePost[];
  void loadProfiles(rows.map((r) => r.author_id));
  return rows;
}

export async function pulseSetFollow(userId: string, on: boolean) {
  const q = on
    ? supabase.from("pulse_follows").insert({ follower_id: me(), followee_id: userId })
    : supabase.from("pulse_follows").delete().eq("follower_id", me()).eq("followee_id", userId);
  const { error } = await q;
  if (error && !/duplicate/i.test(error.message)) {
    toast(errorText(error), "error");
    return false;
  }
  return true;
}

export async function pulseProfile(username: string) {
  const { data: u } = await supabase.from("profiles").select("id, username, display_name, avatar_url, avatar_color, bio").ilike("username", username).maybeSingle();
  if (!u) return null;
  const id = u.id as string;
  const [{ count: followers }, { count: following }, { data: posts }, follow] = await Promise.all([
    supabase.from("pulse_follows").select("*", { count: "exact", head: true }).eq("followee_id", id),
    supabase.from("pulse_follows").select("*", { count: "exact", head: true }).eq("follower_id", id),
    supabase.from("pulse_posts").select("*").eq("author_id", id).is("reply_to", null).order("created_at", { ascending: false }).limit(50),
    supabase.from("pulse_follows").select("follower_id").eq("follower_id", me()).eq("followee_id", id).maybeSingle(),
  ]);
  void loadProfiles([id]);
  return {
    ...u,
    followers: followers ?? 0,
    following: following ?? 0,
    is_following: !!follow,
    posts: (posts ?? []) as PulsePost[],
  };
}

export const pulseAgo = (d: string) => {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  return s < 60 ? `${Math.floor(s)}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
};
