"use client";

// Score duels for solo arcade games — delivered as parseable DMs, resolved locally (no DB schema).

import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";
import { openSoloGame, useGames, type ActiveScoreChallenge, type ScoreChallengeInvite } from "@/store/games";
import { isSoloScoreGame, SOLO_GAME_META, type SoloScoreGame } from "./games";
import { loadProfiles, sendMessage } from "./data";
import { sfx } from "./sounds";

/** e.g. "🎯 Beat my score: 420 in orbit" */
export const SCORE_CHALLENGE_RE = /🎯\s*Beat my score:\s*(\d+)\s+in\s+([a-z0-9]+)/i;

export function formatScoreChallenge(game: SoloScoreGame, score: number) {
  const n = Math.floor(score);
  const meta = SOLO_GAME_META[game];
  return `🎯 Beat my score: ${n} in ${game}\n${meta.emoji} ${meta.name} — can you top it?`;
}

export function parseScoreChallenge(text: string): { game: SoloScoreGame; target: number } | null {
  const m = text.match(SCORE_CHALLENGE_RE);
  if (!m) return null;
  const target = Number(m[1]);
  const game = m[2].toLowerCase();
  if (!Number.isFinite(target) || target <= 0 || !isSoloScoreGame(game)) return null;
  return { game, target: Math.floor(target) };
}

/** DM friends a score challenge; returns how many were sent. */
export async function sendScoreChallenges(game: SoloScoreGame, score: number, to: string[]) {
  if (!to.length || score <= 0) return 0;
  const body = formatScoreChallenge(game, score);
  let n = 0;
  for (const uid of to) {
    const { data, error } = await supabase.rpc("get_or_create_dm", { p_user: uid });
    if (error) {
      toast(errorText(error), "error");
      continue;
    }
    await sendMessage(data as string, body);
    n++;
  }
  return n;
}

/** Incoming DM → floating invite card (same surface as room Join? popups). */
export function onScoreChallengeMessage(fromId: string, content: string, messageId: string, createdAt: string) {
  const parsed = parseScoreChallenge(content);
  if (!parsed) return;
  const me = useApp.getState().userId;
  if (!me || fromId === me) return;
  if (Date.now() - new Date(createdAt).getTime() > 10 * 60_000) return;
  void loadProfiles([fromId]);
  const row: ScoreChallengeInvite = {
    id: messageId,
    from_id: fromId,
    game: parsed.game,
    target: parsed.target,
    created_at: createdAt,
  };
  useGames.setState((s) => ({
    scoreInvites: [row, ...s.scoreInvites.filter((i) => i.id !== row.id)].slice(0, 3),
  }));
  sfx.join();
}

export function answerScoreChallenge(inv: ScoreChallengeInvite, accept: boolean) {
  useGames.setState((s) => ({ scoreInvites: s.scoreInvites.filter((i) => i.id !== inv.id) }));
  if (!accept) return;
  const active: ActiveScoreChallenge = { from_id: inv.from_id, game: inv.game, target: inv.target };
  useGames.setState({ activeScoreChallenge: active });
  openSoloGame(inv.game);
}

/** After a solo run finishes — toast win/lose if this was a duel attempt. */
export function resolveScoreChallenge(game: SoloScoreGame, score: number) {
  const active = useGames.getState().activeScoreChallenge;
  if (!active || active.game !== game) return;
  useGames.setState({ activeScoreChallenge: null });
  const who = useApp.getState().profiles[active.from_id]?.display_name ?? "your friend";
  const n = Math.floor(score);
  if (n > active.target) toast(`You beat ${who}'s ${active.target.toLocaleString()}! (${n.toLocaleString()})`, "success");
  else if (n === active.target) toast(`Tie with ${who} at ${n.toLocaleString()}`, "info");
  else toast(`${who} keeps the crown — ${n.toLocaleString()} vs ${active.target.toLocaleString()}`, "info");
}
