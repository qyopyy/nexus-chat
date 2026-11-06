"use client";

import { useState } from "react";
import { Check, Send, Swords, UserPlus, X } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { friendIds } from "@/lib/gameInvites";
import { answerScoreChallenge, parseScoreChallenge, sendScoreChallenges } from "@/lib/scoreChallenges";
import { SOLO_GAME_META, type SoloScoreGame } from "@/lib/games";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";

/** Pick friends to DM a "beat my score" challenge — same shape as RoomInvite. */
export function ScoreChallengeInvite({ game, score, dark = true, onDone }: { game: SoloScoreGame; score: number; dark?: boolean; onDone?: () => void }) {
  const presence = useApp((s) => s.presence);
  useApp((s) => s.friendships);
  const ids = friendIds();
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const meta = SOLO_GAME_META[game];

  const invite = async (to: string[]) => {
    const todo = to.filter((id) => !sent[id]);
    if (!todo.length) return;
    setBusy(true);
    const n = await sendScoreChallenges(game, score, todo);
    setBusy(false);
    if (n) {
      setSent((s) => ({ ...s, ...Object.fromEntries(todo.map((id) => [id, true])) }));
      toast(n === 1 ? "Challenge sent" : `${n} friends challenged`, "success");
      onDone?.();
    }
  };

  return (
    <div className={cn("rounded-2xl p-3", dark ? "bg-white/10" : "bg-side")}>
      <div className="flex items-center gap-2">
        <span className="text-2xl">{meta.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold tracking-widest uppercase opacity-70">Score challenge</div>
          <div className="truncate font-black">
            Beat {score.toLocaleString()} in {meta.name}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center">
        <span className="flex-1 text-sm font-bold">Challenge friends</span>
        {ids.length > 1 && (
          <button disabled={busy} onClick={() => void invite(ids)} className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-bold disabled:opacity-50">
            <Send className="size-3.5" /> Challenge all
          </button>
        )}
      </div>
      <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
        {ids.length === 0 && (
          <p className="flex items-center gap-2 text-sm opacity-70">
            <UserPlus className="size-4" /> Add friends to challenge them.
          </p>
        )}
        {ids.map((id) => (
          <div key={id} className="flex items-center gap-2 rounded-xl px-1.5 py-1">
            <div className="relative">
              <Avatar userId={id} size={30} plain />
              {presence[id] && <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full bg-ok ring-2 ring-black/60" />}
            </div>
            <span className="min-w-0 flex-1 truncate text-sm">
              <NameTag userId={id} badges={false} />
            </span>
            <button
              disabled={sent[id] || busy}
              onClick={() => void invite([id])}
              className={cn("flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold", sent[id] ? "bg-white/10 opacity-70" : "bg-white text-black")}
            >
              {sent[id] ? (
                <>
                  <Check className="size-3.5" /> Sent
                </>
              ) : (
                "Challenge"
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Modal sheet wrapper used from GamesHub game-over / hub. */
export function ScoreChallengeSheet({ game, score, onClose }: { game: SoloScoreGame; score: number; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] grid place-items-end bg-black/60 sm:place-items-center" onClick={onClose}>
      <div className="max-h-[70vh] w-full overflow-y-auto rounded-t-3xl bg-[#14141f] p-4 pb-safe-4 text-white sm:max-w-sm sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <Swords className="size-5 text-[#ffd400]" />
          <span className="flex-1 text-lg font-bold">Challenge a friend</span>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-full bg-white/10" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <ScoreChallengeInvite game={game} score={score} onDone={onClose} />
      </div>
    </div>
  );
}

/** Chat card for parseable score-challenge DMs. */
export function ScoreChallengeCard({ text, fromId }: { text: string; fromId: string }) {
  const parsed = parseScoreChallenge(text);
  if (!parsed) return null;
  const meta = SOLO_GAME_META[parsed.game];
  const me = useApp.getState().userId;
  if (fromId === me) {
    return (
      <div className="mt-1.5 flex max-w-xs items-center gap-3 rounded-2xl p-3 text-white" style={{ background: meta.bg }}>
        <span className="text-3xl">{meta.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold tracking-wide text-white/75 uppercase">Score challenge</div>
          <div className="font-black">{meta.name}</div>
          <div className="text-sm text-white/85">Beat {parsed.target.toLocaleString()}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-1.5 flex max-w-xs items-center gap-3 rounded-2xl p-3 text-white" style={{ background: meta.bg }}>
      <span className="text-3xl">{meta.emoji}</span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold tracking-wide text-white/75 uppercase">Score challenge</div>
        <div className="font-black">{meta.name}</div>
        <div className="text-sm text-white/85">Beat {parsed.target.toLocaleString()}</div>
      </div>
      <button
        onClick={() =>
          answerScoreChallenge(
            { id: `chat-${parsed.game}-${parsed.target}-${fromId}`, from_id: fromId, game: parsed.game, target: parsed.target, created_at: new Date().toISOString() },
            true,
          )
        }
        className="rounded-full bg-white px-4 py-1.5 text-sm font-black text-black active:scale-95"
      >
        Accept
      </button>
    </div>
  );
}
