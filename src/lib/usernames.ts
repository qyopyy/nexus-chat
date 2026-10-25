"use client";

import { create } from "zustand";
import { supabase, errorText } from "./supabase";
import { useApp } from "@/store/app";

// Extra usernames: one account can own several @names. Friend requests, DMs and lookups work with any of them.

export const useAliases = create<{ byUser: Record<string, string[]> }>(() => ({ byUser: {} }));

export async function loadAliases(userId: string) {
  const { data } = await supabase.from("username_aliases").select("username,created_at").eq("user_id", userId).order("created_at");
  const list = (data ?? []).map((r: { username: string }) => r.username);
  useAliases.setState((s) => ({ byUser: { ...s.byUser, [userId]: list } }));
  return list;
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(errorText(error));
  return data;
}

export async function claimUsername(name: string) {
  const v = (await rpc("claim_username", { p_username: name })) as string;
  await loadAliases(useApp.getState().userId!);
  return v;
}
export async function releaseUsername(name: string) {
  await rpc("release_username", { p_username: name });
  await loadAliases(useApp.getState().userId!);
}
export async function makePrimary(name: string) {
  const v = (await rpc("make_primary_username", { p_username: name })) as string;
  const id = useApp.getState().userId!;
  useApp.setState((s) => ({ profiles: { ...s.profiles, [id]: { ...s.profiles[id], username: v } } }));
  await loadAliases(id);
  return v;
}
/** account id for any of a person's usernames */
export async function userIdFor(name: string) {
  const { data } = await supabase.rpc("user_by_username", { p_username: name });
  return (data as string | null) ?? null;
}
