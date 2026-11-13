"use client";

import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";
import { sendMessage } from "./data";

export type Poll = { id: string; conversation_id: string; author_id: string; question: string; options: string[]; multi: boolean; closes_at: string | null; created_at: string };
export type Vote = { poll_id: string; user_id: string; option: number };

export const POLL_RE = /\[poll:([0-9a-f-]{36})\]/;

export async function createPoll(conversationId: string, question: string, options: string[], multi: boolean, hours: number | null) {
  const opts = options.map((o) => o.trim().slice(0, 80)).filter(Boolean);
  if (opts.length < 2) throw new Error("Add at least two options");
  const { data, error } = await supabase
    .from("polls")
    .insert({ conversation_id: conversationId, author_id: useApp.getState().userId, question: question.trim().slice(0, 200), options: opts, multi, closes_at: hours ? new Date(Date.now() + hours * 3600_000).toISOString() : null })
    .select("id")
    .single();
  if (error) throw new Error(errorText(error));
  const id = (data as { id: string }).id;
  const sent = await sendMessage(conversationId, `📊 ${question.trim().slice(0, 200)}\n[poll:${id}]`);
  if (!sent) {
    await supabase.from("polls").delete().eq("id", id);
    throw new Error("The poll was not posted");
  }
}

export async function loadPoll(id: string): Promise<{ poll: Poll | null; votes: Vote[] }> {
  const [p, v] = await Promise.all([supabase.from("polls").select("*").eq("id", id).maybeSingle(), supabase.from("poll_votes").select("poll_id,user_id,option").eq("poll_id", id)]);
  return { poll: (p.data as Poll) ?? null, votes: (v.data ?? []) as Vote[] };
}

export async function vote(poll: Poll, option: number, on: boolean) {
  const me = useApp.getState().userId;
  const q = on ? supabase.from("poll_votes").insert({ poll_id: poll.id, user_id: me, option }) : supabase.from("poll_votes").delete().eq("poll_id", poll.id).eq("user_id", me).eq("option", option);
  const { error } = await q;
  if (error) toast(errorText(error), "error");
  return !error;
}

export async function closePoll(poll: Poll) {
  const { error } = await supabase.from("polls").update({ closes_at: new Date().toISOString() }).eq("id", poll.id);
  if (error) toast(errorText(error), "error");
  return !error;
}
