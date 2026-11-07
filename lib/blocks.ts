"use client";

import { create } from "zustand";
import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";

/** people you've blocked: they can't DM you, call you or send friend requests, and their server messages are hidden for you */
type BlockState = { ids: Record<string, true>; loaded: boolean; loadedFor: string | null };
export const useBlocks = create<BlockState>(() => ({ ids: {}, loaded: false, loadedFor: null }));

export async function loadBlocks(force = false) {
  const me = useApp.getState().userId;
  if (!me) return;
  if (!force && useBlocks.getState().loadedFor === me) return;
  useBlocks.setState({ loadedFor: me });
  const { data } = await supabase.from("user_blocks").select("blocked_id").eq("blocker_id", me).limit(1000);
  const ids: Record<string, true> = {};
  for (const r of (data ?? []) as { blocked_id: string }[]) ids[r.blocked_id] = true;
  useBlocks.setState({ ids, loaded: true });
}

export const useIsBlocked = (id: string | null | undefined) => useBlocks((s) => (id ? !!s.ids[id] : false));

export async function blockUser(id: string, name?: string) {
  const { error } = await supabase.rpc("block_user", { p_user: id });
  if (error) {
    toast(errorText(error), "error");
    return false;
  }
  useBlocks.setState((s) => ({ ids: { ...s.ids, [id]: true } }));
  toast(`${name ?? "They"} can't message, call or friend you now`, "success");
  return true;
}

export async function unblockUser(id: string, name?: string) {
  const me = useApp.getState().userId;
  if (!me) return false;
  const { error } = await supabase.from("user_blocks").delete().eq("blocker_id", me).eq("blocked_id", id);
  if (error) {
    toast(errorText(error), "error");
    return false;
  }
  useBlocks.setState((s) => {
    const ids = { ...s.ids };
    delete ids[id];
    return { ids };
  });
  toast(`Unblocked ${name ?? ""}`.trim(), "success");
  return true;
}

/** muted words → does this text contain any (whole words / phrases, case-insensitive) */
export function matchesMutedWord(text: string | null | undefined, words: string[]) {
  if (!text || !words.length) return null;
  const low = text.toLowerCase();
  for (const w of words) {
    const t = w.trim().toLowerCase();
    if (!t) continue;
    const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^\\p{L}\\p{N}])${esc}($|[^\\p{L}\\p{N}])`, "u").test(low)) return w;
  }
  return null;
}
