"use client";

import { useState } from "react";
import { Gamepad2, X } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { joinGame, type RoomGame } from "@/store/games";
import { startPlayTogether, stopPlayTogether, useCall } from "@/lib/call";
import { GAME_NAMES } from "@/lib/gameInvites";
import { cn } from "@/lib/utils";

/** every multiplayer game in Nexus, in the order they're offered for Play Together */
export const PLAY_LIST: { id: RoomGame; desc: string; players: string }[] = [
  { id: "globalstrike", desc: "CS:GO-style bomb defuse · 3D · teams", players: "2–10" },
  { id: "classicstrike", desc: "CS 1.6-style shooter · buy menu · bombsites", players: "2–10" },
  { id: "streets", desc: "Open-city driving · races · cops", players: "2–8" },
  { id: "geo", desc: "Guess where real photos were taken", players: "2–8" },
  { id: "flappy", desc: "Race through the pipes together", players: "2–8" },
  { id: "four", desc: "Classic four in a row", players: "2" },
];

function startGame(game: RoomGame) {
  const code = startPlayTogether(game);
  if (!code) return toast("Join a call first", "error");
  joinGame(code, game);
}

/** call control: pick a multiplayer game and everyone in the call gets a one-tap Join */
export function PlayButton({ mobile }: { mobile?: boolean }) {
  const [open, setOpen] = useState(false);
  const play = useCall((s) => s.play);
  const panel = (
    <div className="w-[min(92vw,380px)] animate-pop rounded-2xl bg-menu p-3 text-txt shadow-2xl ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2 font-bold">
        <Gamepad2 className="size-4 text-accent" /> Play together
      </div>
      <p className="mt-0.5 text-xs text-sub">Start a game and everyone in the call can jump into the same room.</p>
      {play && (
        <div className="mt-2 flex items-center gap-2 rounded-xl bg-accent/15 p-2.5">
          <span className="text-xl">{GAME_NAMES[play.game].emoji}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold">{GAME_NAMES[play.game].name}</div>
            <div className="font-mono text-[11px] text-sub">Room {play.code}</div>
          </div>
          <button
            onClick={() => {
              joinGame(play.code, play.game);
              setOpen(false);
            }}
            className="rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-white"
          >
            Join
          </button>
          <button onClick={stopPlayTogether} className="grid size-7 place-items-center rounded-full bg-black/25 hover:bg-dnd" aria-label="End for everyone" title="End for everyone">
            <X className="size-3.5" />
          </button>
        </div>
      )}
      <div className="mt-2 max-h-[52vh] space-y-1.5 overflow-y-auto">
        {PLAY_LIST.map((g) => {
          const meta = GAME_NAMES[g.id];
          return (
            <button
              key={g.id}
              onClick={() => {
                startGame(g.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-hover"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl text-2xl" style={{ background: meta.bg }}>
                {meta.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{meta.name}</span>
                <span className="block truncate text-xs text-sub">{g.desc}</span>
              </span>
              <span className="shrink-0 rounded-full bg-black/25 px-2 py-0.5 text-[10px] font-bold text-sub">{g.players}</span>
            </button>
          );
        })}
      </div>
      {!mobile && (
        <a href="steam://run/730" className="mt-2 flex items-center gap-2.5 rounded-xl bg-black/20 p-2.5 text-xs text-sub hover:bg-hover hover:text-txt">
          <span className="text-lg">🎯</span>
          <span className="min-w-0 flex-1">
            Have <b className="text-txt">Counter-Strike 2</b> on Steam? Launch it from here.
          </span>
          <span className="shrink-0 font-bold text-accent">Open Steam →</span>
        </a>
      )}
    </div>
  );
  if (mobile)
    return (
      <>
        <button onClick={() => setOpen(true)} className="flex flex-col items-center gap-1.5" aria-label="Play together">
          <span className={cn("grid size-[52px] place-items-center rounded-full active:scale-90", play ? "bg-accent text-white" : "bg-white/15 text-white")}>
            <Gamepad2 className="size-6" />
          </span>
          <span className="text-[11px] font-medium text-white/80">Play</span>
        </button>
        {open && (
          <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 pb-safe-4" onClick={() => setOpen(false)}>
            <div className="mb-24">{panel}</div>
          </div>
        )}
      </>
    );
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        title="Play together"
        aria-label="Play together"
        className={cn("grid size-14 place-items-center rounded-full text-white transition", play || open ? "bg-accent" : "bg-[#2b2d31] hover:bg-[#3a3c42]")}
      >
        <Gamepad2 className="size-6" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute bottom-16 left-1/2 z-30 -translate-x-1/2">{panel}</div>
        </>
      )}
    </div>
  );
}

/** "qyopy started Global Strike — Join" banner on the call screen */
export function PlayBanner() {
  const play = useCall((s) => s.play);
  const me = useApp((s) => s.userId);
  const who = useApp((s) => (play ? s.profiles[play.by]?.display_name : null));
  const [hidden, setHidden] = useState<string | null>(null);
  if (!play || hidden === play.code) return null;
  const meta = GAME_NAMES[play.game];
  return (
    <div className="pointer-events-auto mx-auto flex w-[min(94%,520px)] items-center gap-2.5 rounded-2xl p-2.5 text-white shadow-xl ring-1 ring-white/15" style={{ background: meta.bg }}>
      <span className="text-2xl">{meta.emoji}</span>
      <div className="min-w-0 flex-1 text-sm">
        <b>{play.by === me ? "You" : (who ?? "Someone")}</b> started <b>{meta.name}</b>
        <div className="font-mono text-[11px] opacity-75">Room {play.code}</div>
      </div>
      <button onClick={() => joinGame(play.code, play.game)} className="rounded-full bg-white px-4 py-1.5 text-sm font-black text-black">
        {play.by === me ? "Open" : "Join"}
      </button>
      <button onClick={() => setHidden(play.code)} className="grid size-7 place-items-center rounded-full bg-black/25" aria-label="Hide">
        <X className="size-3.5" />
      </button>
    </div>
  );
}
