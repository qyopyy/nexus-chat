"use client";

// Nexus-only chat features: shared beat "Jams", sealed time capsules, live high fives.

import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";
import { sendMessage } from "./data";
import { BEAT_PRESETS, type Pattern } from "@/components/music/Tools2";

export const JAM_RE = /\[jam:([0-9a-f-]{36})\]/;
export const CAPSULE_RE = /\[capsule:([0-9a-f-]{36})\]/;
/** Live Bump pin shared into a DM / chat: [bump-pin:lat,lng] */
export const BUMP_PIN_RE = /\[bump-pin:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\]/;

export type Jam = { id: string; conversation_id: string; created_by: string; pattern: Pattern; bpm: number; root: number; updated_by: string | null; updated_at: string };

export async function startJam(conversationId: string, preset = "Trap") {
  const pr = BEAT_PRESETS[preset] ?? BEAT_PRESETS.Trap;
  const { data, error } = await supabase
    .from("jams")
    .insert({ conversation_id: conversationId, created_by: useApp.getState().userId, pattern: pr.p, bpm: pr.bpm, root: 0 })
    .select("id")
    .single();
  if (error) return toast(errorText(error), "error");
  await sendMessage(conversationId, `🥁 Started a Jam — tap the grid to add to the beat\n[jam:${(data as { id: string }).id}]`);
}
export async function loadJam(id: string) {
  const { data } = await supabase.from("jams").select("*").eq("id", id).maybeSingle();
  return (data as Jam) ?? null;
}
export async function saveJam(id: string, patch: Partial<Pick<Jam, "pattern" | "bpm" | "root">>) {
  const { error } = await supabase
    .from("jams")
    .update({ ...patch, updated_by: useApp.getState().userId, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) toast(errorText(error), "error");
}

export type CapsuleInfo = { id: string; author_id: string; unlock_at: string; created_at: string; body: string | null };
export async function createCapsule(conversationId: string, body: string, unlockAt: Date) {
  const { data, error } = await supabase
    .from("capsules")
    .insert({ conversation_id: conversationId, author_id: useApp.getState().userId, body: body.trim().slice(0, 4000), unlock_at: unlockAt.toISOString() })
    .select("id")
    .single();
  if (error) throw new Error(errorText(error));
  const when = unlockAt.toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  await sendMessage(conversationId, `⏳ Time capsule — opens ${when}\n[capsule:${(data as { id: string }).id}]`);
}
export async function capsuleInfo(id: string): Promise<CapsuleInfo | null> {
  const { data } = await supabase.rpc("capsule_info", { p_id: id });
  return (data as CapsuleInfo) ?? null;
}
