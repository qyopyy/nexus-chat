"use client";

import { supabase } from "./supabase";
import { useApp } from "@/store/app";
import { loadProfiles } from "./data";

export type GameId = "streets" | "blocks" | "snake" | "2048" | "beatbird";
export type Row = { user_id: string; best: number; at: string };

export async function submitScore(game: GameId, score: number) {
  const me = useApp.getState().userId;
  if (!me || score <= 0) return;
  await supabase.from("game_scores").insert({ user_id: me, game, score: Math.floor(score) });
}

export async function leaderboard(game: GameId): Promise<Row[]> {
  const { data } = await supabase.rpc("game_leaderboard", { p_game: game, p_limit: 20 });
  const rows = (data ?? []) as Row[];
  void loadProfiles(rows.map((r) => r.user_id));
  return rows;
}

const KEY = (g: GameId) => `nexus:best:${g}`;
export function localBest(g: GameId) {
  try {
    return Number(localStorage.getItem(KEY(g)) ?? 0) || 0;
  } catch {
    return 0;
  }
}
export function saveLocalBest(g: GameId, s: number) {
  try {
    if (s > localBest(g)) localStorage.setItem(KEY(g), String(Math.floor(s)));
  } catch {
    /* private mode */
  }
}
