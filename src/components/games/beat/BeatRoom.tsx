"use client";

import { useEffect, useRef, useState } from "react";
import { Crown, Loader2, LogOut, Music2, Play, Users } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { useGames } from "@/store/games";
import { newRoomCode, openRoom, validRoomCode, type Room, type RoomPlayer } from "@/lib/room";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import RoomInvite from "../RoomInvite";
import type { Song } from "./songs";

export type RoomSong = { id: string; title: string; credit: string; diff: string; chart: string; inst: string; voices?: string; color: string };
export type RivalState = { id: string; name: string; score: number; combo: number; done: boolean; acc?: number };

const EVENTS = ["pick", "start", "score", "done"];

/** Everyone in the room plays the same chart at the same time; scores sync live. */
export default function BeatRoom({
  code,
  songs,
  onPlay,
  onLeave,
  mobile,
}: {
  code: string;
  /** songs this device can share (built-in + anything added to the list that has a public URL) */
  songs: Song[];
  onPlay: (song: Song, room: Room) => void;
  onLeave: () => void;
  mobile?: boolean;
}) {
  const me = useApp((s) => s.userId) ?? "me";
  const myName = useApp((s) => s.profiles[s.userId ?? ""]?.display_name || s.profiles[s.userId ?? ""]?.username || "Player");
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [pick, setPick] = useState<Song | null>(songs[0] ?? null);
  const [starting, setStarting] = useState<number | null>(null);
  const room = useRef<Room | null>(null);
  const shareable = songs.filter((s) => /^https?:/.test(s.chart) || s.chart.startsWith("/"));

  useEffect(() => {
    const r = openRoom("beat", code, me, myName, EVENTS);
    room.current = r;
    r.onPlayers(setPlayers);
    r.on("pick", (p) => {
      const s = p.song as RoomSong | undefined;
      if (s) setPick({ ...s, ranked: false, source: "community" } as Song);
    });
    r.on("start", (p) => {
      const s = p.song as RoomSong | undefined;
      const at = Number(p.at) || Date.now() + 3000;
      if (s) setPick({ ...s, ranked: false, source: "community" } as Song);
      setStarting(at);
    });
    return () => {
      r.leave();
      room.current = null;
    };
  }, [code, me, myName]);

  // host picked a different song → tell the room
  const choose = (s: Song) => {
    setPick(s);
    room.current?.send("pick", { song: { id: s.id, title: s.title, credit: s.credit, diff: s.diff, chart: s.chart, inst: s.inst, voices: s.voices, color: s.color } });
  };

  const isHost = room.current?.isHost() ?? players[0]?.id === me;

  const begin = () => {
    if (!pick) return;
    if (!/^https?:/.test(pick.chart) && !pick.chart.startsWith("/")) return toast("That song only exists on your device — pick a built-in or community song so everyone can load it", "error");
    const at = Date.now() + 3500;
    room.current?.send("start", { song: { id: pick.id, title: pick.title, credit: pick.credit, diff: pick.diff, chart: pick.chart, inst: pick.inst, voices: pick.voices, color: pick.color }, at });
    setStarting(at);
  };

  // countdown → launch
  useEffect(() => {
    if (!starting || !pick) return;
    const t = setTimeout(() => {
      if (room.current) onPlay(pick, room.current);
      setStarting(null);
    }, Math.max(0, starting - Date.now()));
    return () => clearTimeout(t);
  }, [starting, pick, onPlay]);

  const left = starting ? Math.max(0, Math.ceil((starting - Date.now()) / 1000)) : 0;
  const [, force] = useState(0);
  useEffect(() => {
    if (!starting) return;
    const i = setInterval(() => force((x) => x + 1), 250);
    return () => clearInterval(i);
  }, [starting]);

  return (
    <div className={cn("mx-auto w-full max-w-2xl space-y-4 p-4", mobile && "pb-safe-4")}>
      <div className="flex items-center gap-2">
        <Users className="size-5 text-[#c9a6ff]" />
        <h2 className="text-xl font-black">Room battle</h2>
        <button onClick={onLeave} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/20">
          <LogOut className="size-4" /> Leave
        </button>
      </div>

      <RoomInvite game="beat" code={code} />

      <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
        <div className="mb-2 flex items-center gap-2 text-sm font-bold">
          <Users className="size-4" /> Players ({players.length})
        </div>
        <ul className="space-y-1">
          {players.map((p, i) => (
            <li key={p.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm">
              <Avatar userId={p.id} size={26} plain />
              <span className="min-w-0 flex-1 truncate font-semibold">
                {p.name}
                {p.id === me && " (you)"}
              </span>
              {i === 0 && <Crown className="size-4 text-[#ffd400]" aria-label="Host" />}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
        <div className="mb-2 flex items-center gap-2 text-sm font-bold">
          <Music2 className="size-4" /> {isHost ? "Pick the song" : "Song"}
        </div>
        {!shareable.length ? (
          <p className="text-sm text-white/60">No shareable songs here yet — add a community song from the library first.</p>
        ) : (
          <div className="max-h-60 space-y-1 overflow-y-auto">
            {shareable.map((s) => (
              <button
                key={s.id}
                disabled={!isHost}
                onClick={() => choose(s)}
                className={cn("flex w-full items-center gap-3 rounded-xl p-2.5 text-left ring-1 transition", pick?.id === s.id ? "bg-white/15 ring-[#aa00ff]" : "bg-black/25 ring-white/5", isHost ? "hover:bg-white/10" : "cursor-default")}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg" style={{ background: `linear-gradient(135deg, ${s.color}, #2a0b4a)` }}>
                  <Music2 className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{s.title}</span>
                  <span className="block truncate text-[11px] text-white/55">
                    {s.credit} · {s.diff}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
        {!isHost && <p className="mt-2 text-xs text-white/50">The host starts the battle — everyone plays the same chart and scores update live.</p>}
      </div>

      {starting ? (
        <div className="grid place-items-center rounded-2xl bg-[#aa00ff]/20 py-6 ring-1 ring-[#aa00ff]">
          <div className="text-sm font-bold text-white/80">Starting in</div>
          <div className="text-6xl font-black tabular-nums">{left || "GO"}</div>
        </div>
      ) : (
        isHost && (
          <button onClick={begin} disabled={!pick || !shareable.length} className="flex w-full items-center justify-center gap-2 rounded-full bg-white py-3 text-base font-black text-black disabled:opacity-40">
            <Play className="size-5 fill-current" /> Start battle ({players.length} {players.length === 1 ? "player" : "players"})
          </button>
        )
      )}
      <p className="text-center text-xs text-white/45">Room scores aren&apos;t ranked on the solo leaderboard.</p>
    </div>
  );
}

/** Lobby entry: create a room or type/paste a code. */
export function BeatRoomStart({ onOpen }: { onOpen: (code: string) => void }) {
  const [code, setCode] = useState("");
  const joinCode = useGames((s) => s.joinCode);
  const joinFor = useGames((s) => s.joinGame);
  const consumed = useRef(false);
  useEffect(() => {
    if (consumed.current || !joinCode || joinFor !== "beat") return;
    consumed.current = true;
    useGames.setState({ joinCode: null });
    onOpen(joinCode);
  }, [joinCode, joinFor, onOpen]);
  return (
    <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
      <div className="mb-2 flex items-center gap-2 text-sm font-bold">
        <Users className="size-4" /> Battle a friend in a room
      </div>
      <p className="mb-2 text-xs text-white/55">Same chart, live scoreboard. Share the room link or invite friends straight from the lobby.</p>
      <div className="flex gap-2">
        <button onClick={() => onOpen(newRoomCode())} className="flex-1 rounded-full bg-[#aa00ff] py-2 text-sm font-bold">
          Create room
        </button>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
          onKeyDown={(e) => e.key === "Enter" && validRoomCode(code) && onOpen(code)}
          placeholder="CODE"
          className="w-28 rounded-full bg-black/30 px-3 text-center font-mono text-sm tracking-[0.2em] outline-none"
        />
        <button disabled={!validRoomCode(code)} onClick={() => onOpen(code)} className="rounded-full bg-white/10 px-4 text-sm font-bold disabled:opacity-40">
          Join
        </button>
      </div>
    </div>
  );
}

/** Results table after a room battle. */
export function BeatRoomResults({ rivals, mine, onAgain, onLeave }: { rivals: RivalState[]; mine: RivalState; onAgain: () => void; onLeave: () => void }) {
  const rows = [...rivals, mine].sort((a, b) => b.score - a.score);
  const win = rows[0]?.id === mine.id && rows.length > 1;
  return (
    <div className="mx-auto w-full max-w-md space-y-3 p-4 text-center">
      <div className="text-xs font-bold tracking-[.4em] text-[#c9a6ff] uppercase">Room battle</div>
      <h2 className="text-4xl font-black italic">{rows.length < 2 ? "Finished" : win ? "YOU WIN" : "YOU LOSE"}</h2>
      <ul className="space-y-1 text-left">
        {rows.map((r, i) => (
          <li key={r.id} className={cn("flex items-center gap-2 rounded-xl px-3 py-2", r.id === mine.id ? "bg-white/15" : "bg-white/5")}>
            <span className="w-5 text-center font-black text-white/60">{i + 1}</span>
            <Avatar userId={r.id} size={26} plain />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
              {r.name}
              {r.id === mine.id && " (you)"}
            </span>
            <span className="font-mono text-sm font-bold tabular-nums">{r.score.toLocaleString()}</span>
            {!r.done && <Loader2 className="size-3.5 animate-spin text-white/40" />}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button onClick={onAgain} className="flex-1 rounded-full bg-white py-2.5 font-bold text-black">
          Back to lobby
        </button>
        <button onClick={onLeave} className="rounded-full bg-white/10 px-5 font-semibold">
          Leave
        </button>
      </div>
    </div>
  );
}
