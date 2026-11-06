"use client";

import { supabase } from "./supabase";
import { useApp } from "@/store/app";
import { loadProfiles } from "./data";

export type GameId =
  | "streets"
  | "blocks"
  | "snake"
  | "2048"
  | "beatbird"
  | "geo"
  | "swing"
  | "four"
  | "bay"
  | "flappy"
  | "pinball"
  | "bricks"
  | "pong"
  | "memory"
  | "tictactoe"
  | "reaction"
  | "whack"
  | "runner"
  | "mines"
  | "orbit"
  | "drift"
  | "classicstrike"
  | "globalstrike";
export type Row = { user_id: string; best: number; at: string };

/** Solo arcade titles that track scores via submitScore / GameScreen (not room multiplayer). */
export const SOLO_SCORE_GAMES = [
  "orbit",
  "drift",
  "runner",
  "whack",
  "reaction",
  "tictactoe",
  "mines",
  "pinball",
  "bricks",
  "pong",
  "memory",
  "swing",
  "blocks",
  "beatbird",
  "snake",
  "2048",
] as const satisfies readonly GameId[];

export type SoloScoreGame = (typeof SOLO_SCORE_GAMES)[number];

export function isSoloScoreGame(g: string): g is SoloScoreGame {
  return (SOLO_SCORE_GAMES as readonly string[]).includes(g);
}

export const SOLO_GAME_META: Record<SoloScoreGame, { name: string; emoji: string; bg: string }> = {
  orbit: { name: "Orbit Strike", emoji: "🚀", bg: "linear-gradient(135deg,#0ea5e9,#312e81 55%,#020617)" },
  drift: { name: "Drift Rush", emoji: "🏎️", bg: "linear-gradient(135deg,#22c55a,#0f172a)" },
  runner: { name: "Neon Runner", emoji: "🏃", bg: "linear-gradient(135deg,#ff2bd6,#0b0b2a)" },
  whack: { name: "Whack Dash", emoji: "🐹", bg: "linear-gradient(135deg,#facc15,#5c0b3a)" },
  reaction: { name: "Reaction Rush", emoji: "⚡", bg: "linear-gradient(135deg,#22c55e,#0b2a1a)" },
  tictactoe: { name: "Tic Tac Toe", emoji: "⭕", bg: "linear-gradient(135deg,#60a5fa,#1e3a5f)" },
  mines: { name: "Mini Mines", emoji: "💣", bg: "linear-gradient(135deg,#64748b,#0f172a)" },
  pinball: { name: "Sky Pinball", emoji: "🌀", bg: "linear-gradient(135deg,#7c3aed,#0b1a5c)" },
  bricks: { name: "Brick Bash", emoji: "🧱", bg: "linear-gradient(135deg,#ef4444,#7c2d12)" },
  pong: { name: "Pong Duel", emoji: "🏓", bg: "linear-gradient(135deg,#38bdf8,#f472b6)" },
  memory: { name: "Memory Flip", emoji: "🃏", bg: "linear-gradient(135deg,#a855f7,#1e293b)" },
  swing: { name: "Web Swing", emoji: "🕸️", bg: "linear-gradient(135deg,#8b5cff,#ff2bd6)" },
  blocks: { name: "Neon Blocks", emoji: "🧱", bg: "linear-gradient(135deg,#00e5ff,#0b1a5c)" },
  beatbird: { name: "Beat Bird", emoji: "🐦", bg: "linear-gradient(135deg,#ffd400,#5c0b3a)" },
  snake: { name: "Snake", emoji: "🐍", bg: "linear-gradient(135deg,#00ff9c,#0b3a2a)" },
  "2048": { name: "2048", emoji: "🔢", bg: "linear-gradient(135deg,#ff9f2b,#5c2b0b)" },
};

export async function submitScore(game: GameId, score: number) {
  const me = useApp.getState().userId;
  if (!me || score <= 0) return;
  // newer game ids may not be in the live check constraint yet — local best still works
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
