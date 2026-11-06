"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { useApp } from "@/store/app";
import { useGames } from "@/store/games";
import { GAME_NAMES, answerInvite } from "@/lib/gameInvites";
import { answerScoreChallenge } from "@/lib/scoreChallenges";
import { SOLO_GAME_META } from "@/lib/games";
import Avatar from "@/components/ui/Avatar";

/** floating "Join?" / "Beat my score?" cards for invites from friends */
export default function InvitePopup() {
  const invites = useGames((s) => s.invites);
  const scoreInvites = useGames((s) => s.scoreInvites);
  const profiles = useApp((s) => s.profiles);
  // auto-expire after 2 minutes on screen
  useEffect(() => {
    if (!invites.length) return;
    const t = setTimeout(() => useGames.setState((s) => ({ invites: s.invites.slice(0, -1) })), 120_000);
    return () => clearTimeout(t);
  }, [invites]);
  useEffect(() => {
    if (!scoreInvites.length) return;
    const t = setTimeout(() => useGames.setState((s) => ({ scoreInvites: s.scoreInvites.slice(0, -1) })), 120_000);
    return () => clearTimeout(t);
  }, [scoreInvites]);
  if (!invites.length && !scoreInvites.length) return null;
  return (
    <div className="pointer-events-none fixed top-3 right-3 z-[120] flex w-[min(360px,calc(100vw-24px))] flex-col gap-2 pt-safe">
      {scoreInvites.map((inv) => {
        const g = SOLO_GAME_META[inv.game];
        const who = profiles[inv.from_id];
        return (
          <div key={`score-${inv.id}`} className="pointer-events-auto animate-pop overflow-hidden rounded-2xl text-white shadow-2xl ring-1 ring-white/15" style={{ background: g.bg }}>
            <div className="flex items-center gap-3 p-3">
              <div className="relative">
                <Avatar userId={inv.from_id} size={44} plain />
                <span className="absolute -right-1 -bottom-1 text-lg">{g.emoji}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">
                  <b>{who?.display_name ?? "A friend"}</b> challenged you
                </div>
                <div className="truncate text-lg leading-tight font-black">{g.name}</div>
                <div className="text-xs text-white/75">Beat {inv.target.toLocaleString()}?</div>
              </div>
              <button onClick={() => answerScoreChallenge(inv, false)} className="grid size-7 place-items-center self-start rounded-full bg-black/25" aria-label="Dismiss">
                <X className="size-4" />
              </button>
            </div>
            <div className="flex gap-2 px-3 pb-3">
              <button onClick={() => answerScoreChallenge(inv, true)} className="flex-1 rounded-full bg-white py-2 text-sm font-black text-black active:scale-95">
                Accept challenge
              </button>
              <button onClick={() => answerScoreChallenge(inv, false)} className="rounded-full bg-black/25 px-4 py-2 text-sm font-semibold">
                Not now
              </button>
            </div>
          </div>
        );
      })}
      {invites.map((inv) => {
        const g = GAME_NAMES[inv.game];
        const who = profiles[inv.from_id];
        return (
          <div key={inv.id} className="pointer-events-auto animate-pop overflow-hidden rounded-2xl text-white shadow-2xl ring-1 ring-white/15" style={{ background: g.bg }}>
            <div className="flex items-center gap-3 p-3">
              <div className="relative">
                <Avatar userId={inv.from_id} size={44} plain />
                <span className="absolute -right-1 -bottom-1 text-lg">{g.emoji}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">
                  <b>{who?.display_name ?? "A friend"}</b> is playing
                </div>
                <div className="truncate text-lg leading-tight font-black">{g.name}</div>
                <div className="text-xs text-white/75">Want to join?</div>
              </div>
              <button onClick={() => void answerInvite(inv, false)} className="grid size-7 place-items-center self-start rounded-full bg-black/25" aria-label="Dismiss">
                <X className="size-4" />
              </button>
            </div>
            <div className="flex gap-2 px-3 pb-3">
              <button onClick={() => void answerInvite(inv, true)} className="flex-1 rounded-full bg-white py-2 text-sm font-black text-black active:scale-95">
                Join game
              </button>
              <button onClick={() => void answerInvite(inv, false)} className="rounded-full bg-black/25 px-4 py-2 text-sm font-semibold">
                Not now
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
