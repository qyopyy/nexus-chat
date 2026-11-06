"use client";

import { joinGame, type RoomGame } from "@/store/games";
import { GAME_NAMES } from "@/lib/gameInvites";

const RE = /[?&]play=([A-Z2-9]{6})(?:&g=(geo|four|streets|flappy|classicstrike|globalstrike))?\b/;

/** chat card for "?play=CODE" invite links → joins the room in the app */
export default function GameInvite({ text }: { text: string }) {
  const m = text.match(RE);
  if (!m) return null;
  const code = m[1];
  const game = (m[2] ?? "streets") as RoomGame;
  const g = GAME_NAMES[game];
  return (
    <div className="mt-1.5 flex max-w-xs items-center gap-3 rounded-2xl p-3 text-white" style={{ background: g.bg }}>
      <span className="text-3xl">{g.emoji}</span>
      <div className="min-w-0 flex-1">
        <div className="font-black">{g.name}</div>
        <div className="font-mono text-sm tracking-widest text-white/85">{code}</div>
      </div>
      <button onClick={() => joinGame(code, game)} className="rounded-full bg-white px-4 py-1.5 text-sm font-black text-black active:scale-95">
        Join
      </button>
    </div>
  );
}
