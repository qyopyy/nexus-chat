"use client";

// "qyopy is playing GeoGuess — Join?" — invites between friends, delivered live via Realtime.

import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";
import { useGames, type GameInvite, type RoomGame } from "@/store/games";
import { loadProfiles } from "./data";
import { sfx } from "./sounds";

export const GAME_NAMES: Record<RoomGame, { name: string; emoji: string; bg: string }> = {
  flappy: { name: "Flappy Race", emoji: "🐤", bg: "linear-gradient(135deg,#38bdf8,#4ade80)" },
  streets: { name: "Neon Streets", emoji: "🚗", bg: "linear-gradient(135deg,#ff2bd6,#2b0b5c)" },
  geo: { name: "GeoGuess", emoji: "🌍", bg: "linear-gradient(135deg,#00c96b,#0b2a5c)" },
  four: { name: "Four in a Row", emoji: "🔴", bg: "linear-gradient(135deg,#ff4d6d,#5c0b2b)" },
  classicstrike: { name: "Classic Strike", emoji: "🔫", bg: "linear-gradient(135deg,#365314,#7c2d12)" },
};

/** accepted friends, online ones first */
export function friendIds(): string[] {
  const s = useApp.getState();
  const me = s.userId;
  const ids = s.friendships.filter((f) => f.status === "accepted").map((f) => (f.requester_id === me ? f.addressee_id : f.requester_id));
  return ids.sort((a, b) => Number(!!s.presence[b]) - Number(!!s.presence[a]));
}

export async function sendGameInvites(game: RoomGame, code: string, to: string[]) {
  if (!to.length) return 0;
  const { error, count } = await supabase.from("game_invites").insert(
    to.map((id) => ({ to_id: id, game, code })),
    { count: "exact" },
  );
  if (error) {
    // one bad row (e.g. already invited) fails the batch → retry one by one
    let n = 0;
    for (const id of to) {
      const r = await supabase.from("game_invites").insert({ to_id: id, game, code });
      if (!r.error) n++;
    }
    if (!n) toast(errorText(error), "error");
    return n;
  }
  return count ?? to.length;
}

export function onInviteRow(row: GameInvite & { to_id?: string; status?: string }) {
  const me = useApp.getState().userId;
  if (!row || row.to_id !== me || row.status !== "pending") return;
  if (Date.now() - new Date(row.created_at).getTime() > 10 * 60_000) return;
  void loadProfiles([row.from_id]);
  useGames.setState((s) => ({ invites: [row, ...s.invites.filter((i) => i.code !== row.code || i.from_id !== row.from_id)].slice(0, 3) }));
  sfx.join();
}

export async function answerInvite(inv: GameInvite, accept: boolean) {
  useGames.setState((s) => ({ invites: s.invites.filter((i) => i.id !== inv.id) }));
  await supabase.from("game_invites").update({ status: accept ? "accepted" : "declined" }).eq("id", inv.id);
  if (accept) {
    const { joinGame } = await import("@/store/games");
    joinGame(inv.code, inv.game);
  }
}

/** pending invites from the last 10 minutes (e.g. after a reload) */
export async function loadPendingInvites() {
  const me = useApp.getState().userId;
  if (!me) return;
  const { data } = await supabase
    .from("game_invites")
    .select("id,from_id,to_id,game,code,status,created_at")
    .eq("to_id", me)
    .eq("status", "pending")
    .gt("created_at", new Date(Date.now() - 10 * 60_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(3);
  for (const r of (data ?? []).reverse()) onInviteRow(r as GameInvite & { to_id: string; status: string });
}
