"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bot, RotateCcw, Users } from "lucide-react";
import { useApp } from "@/store/app";
import { useGames } from "@/store/games";
import { submitScore, localBest, saveLocalBest } from "@/lib/games";
import { newRoomCode, openRoom, validRoomCode, type Room, type RoomPlayer } from "@/lib/room";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import RoomInvite from "./RoomInvite";

const COLS = 7,
  ROWS = 6;
type Cell = 0 | 1 | 2;
const empty = () => Array.from({ length: COLS * ROWS }, () => 0 as Cell);
const at = (b: Cell[], c: number, r: number) => b[r * COLS + c];

function drop(b: Cell[], c: number, who: 1 | 2): Cell[] | null {
  for (let r = ROWS - 1; r >= 0; r--)
    if (!at(b, c, r)) {
      const n = [...b];
      n[r * COLS + c] = who;
      return n;
    }
  return null;
}
function winner(b: Cell[]): { who: 1 | 2; cells: number[] } | null {
  const dirs = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const w = at(b, c, r);
      if (!w) continue;
      for (const [dc, dr] of dirs) {
        const cells = [0, 1, 2, 3].map((k) => [c + dc * k, r + dr * k]);
        if (cells.every(([cc, rr]) => cc >= 0 && cc < COLS && rr >= 0 && rr < ROWS && at(b, cc, rr) === w)) return { who: w as 1 | 2, cells: cells.map(([cc, rr]) => rr * COLS + cc) };
      }
    }
  return null;
}
const full = (b: Cell[]) => b.every(Boolean);

// ---- computer player: minimax with alpha-beta (depth 5)
function scoreWindow(w: Cell[], me: 1 | 2) {
  const opp = me === 1 ? 2 : 1;
  const m = w.filter((x) => x === me).length,
    o = w.filter((x) => x === opp).length,
    e = w.filter((x) => !x).length;
  if (m === 4) return 1000;
  if (m === 3 && e === 1) return 6;
  if (m === 2 && e === 2) return 2;
  if (o === 3 && e === 1) return -8;
  return 0;
}
function evaluate(b: Cell[], me: 1 | 2) {
  let s = 0;
  for (let r = 0; r < ROWS; r++) if (at(b, 3, r) === me) s += 3;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      for (const [dc, dr] of [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, -1],
      ]) {
        const cells = [0, 1, 2, 3].map((k) => [c + dc * k, r + dr * k]);
        if (cells.every(([cc, rr]) => cc >= 0 && cc < COLS && rr >= 0 && rr < ROWS)) s += scoreWindow(cells.map(([cc, rr]) => at(b, cc, rr)), me);
      }
  return s;
}
function minimax(b: Cell[], depth: number, a: number, beta: number, max: boolean, me: 1 | 2): [number, number] {
  const w = winner(b);
  if (w) return [w.who === me ? 100000 + depth : -100000 - depth, -1];
  if (full(b) || depth === 0) return [evaluate(b, me), -1];
  const order = [3, 2, 4, 1, 5, 0, 6];
  let best = -1;
  if (max) {
    let v = -Infinity;
    for (const c of order) {
      const n = drop(b, c, me);
      if (!n) continue;
      const [s] = minimax(n, depth - 1, a, beta, false, me);
      if (s > v) ((v = s), (best = c));
      a = Math.max(a, v);
      if (a >= beta) break;
    }
    return [v, best];
  }
  let v = Infinity;
  for (const c of order) {
    const n = drop(b, c, me === 1 ? 2 : 1);
    if (!n) continue;
    const [s] = minimax(n, depth - 1, a, beta, true, me);
    if (s < v) ((v = s), (best = c));
    beta = Math.min(beta, v);
    if (a >= beta) break;
  }
  return [v, best];
}

export default function FourInRow({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const me = useApp((s) => s.userId)!;
  const myName = useApp((s) => s.profiles[s.userId ?? ""]?.display_name ?? "Player");
  const [mode, setMode] = useState<"menu" | "ai" | "room">("menu");
  const [board, setBoard] = useState<Cell[]>(empty);
  const [turn, setTurn] = useState<1 | 2>(1);
  const [first, setFirst] = useState<1 | 2>(1);
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [hover, setHover] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [code, setCode] = useState("");
  const st = useRef({ board, turn });
  st.current = { board, turn };

  const win = useMemo(() => winner(board), [board]);
  const draw = !win && full(board);
  // in a room: first two players are red (1) and yellow (2), everyone else watches
  const mySide: 1 | 2 | 0 = mode === "ai" ? 1 : (() => {
    const i = players.findIndex((p) => p.id === me);
    return i === 0 ? 1 : i === 1 ? 2 : 0;
  })();
  const name = (side: 1 | 2) => (mode === "ai" ? (side === 1 ? myName : "Nexus Bot") : (players[side - 1]?.name ?? "Waiting…"));
  const idOf = (side: 1 | 2) => (mode === "ai" ? (side === 1 ? me : null) : (players[side - 1]?.id ?? null));

  const reset = useCallback((starter: 1 | 2) => {
    setBoard(empty());
    setTurn(starter);
    setFirst(starter);
  }, []);

  const play = useCallback(
    (c: number, side: 1 | 2, remote = false) => {
      const { board: b, turn: t } = st.current;
      if (t !== side || winner(b) || full(b)) return;
      const n = drop(b, c, side);
      if (!n) return;
      setBoard(n);
      setTurn(side === 1 ? 2 : 1);
      if (!remote && room) room.send("move", { c, side });
    },
    [room],
  );

  // computer move
  useEffect(() => {
    if (mode !== "ai" || turn !== 2 || win || draw) return;
    const id = setTimeout(() => {
      const [, c] = minimax(st.current.board, 5, -Infinity, Infinity, true, 2);
      if (c >= 0) play(c, 2);
    }, 450);
    return () => clearTimeout(id);
  }, [mode, turn, win, draw, play]);

  // streak vs computer → leaderboard
  useEffect(() => {
    if (mode !== "ai" || (!win && !draw)) return;
    if (win?.who === 1) {
      const s = streak + 1;
      setStreak(s);
      if (s > localBest("four")) saveLocalBest("four", s);
      void submitScore("four", s);
    } else if (win?.who === 2) setStreak(0);
  }, [win, draw]); // eslint-disable-line react-hooks/exhaustive-deps

  const enter = useCallback(
    (c: string) => {
      const r = openRoom("four", c, me, myName, ["move", "reset", "hello", "sync"]);
      r.onPlayers(setPlayers);
      r.on("move", (p) => play(Number(p.c), Number(p.side) as 1 | 2, true));
      r.on("reset", (p) => reset(Number(p.first) as 1 | 2));
      r.on("hello", () => r.isHost() && r.send("sync", { board: st.current.board, turn: st.current.turn }));
      r.on("sync", (p) => {
        setBoard(p.board as Cell[]);
        setTurn(Number(p.turn) as 1 | 2);
      });
      r.onReady(() => r.send("hello", {}));
      setRoom(r);
      reset(1);
      setMode("room");
    },
    [me, myName, play, reset],
  );
  useEffect(() => () => room?.leave(), [room]);

  const joinCode = useGames((s) => s.joinCode);
  const joinFor = useGames((s) => s.joinGame);
  useEffect(() => {
    if (joinCode && joinFor === "four") {
      useGames.setState({ joinCode: null });
      enter(joinCode);
    }
  }, [joinCode, joinFor, enter]);

  const header = (
    <header className={cn("flex shrink-0 items-center gap-2 border-b border-white/10 px-3 text-white", mobile ? "pt-safe-3 pb-2" : "h-12")}>
      <button
        onClick={() => {
          room?.leave();
          setRoom(null);
          if (mode === "menu") onBack();
          else setMode("menu");
        }}
        className="grid size-9 place-items-center rounded-full hover:bg-white/10"
        aria-label="Back"
      >
        <ArrowLeft className="size-5" />
      </button>
      <span className="text-lg">🔴</span>
      <span className="font-black">Four in a Row</span>
      {mode === "ai" && <span className="ml-auto text-sm text-white/70">Win streak: {streak}</span>}
    </header>
  );

  if (mode === "menu")
    return (
      <div className="flex h-full min-h-0 flex-col bg-[#14070d] text-white">
        {header}
        <div className="grid flex-1 place-items-center p-6">
          <div className="w-full max-w-sm text-center">
            <div className="text-7xl">🔴🟡</div>
            <h1 className="mt-2 text-4xl font-black">Four in a Row</h1>
            <p className="mt-2 text-white/75">Drop discs, connect four in a line — across, down or diagonally.</p>
            <div className="mt-6 space-y-2">
              <button onClick={() => (reset(1), setMode("ai"))} className="flex w-full items-center justify-center gap-2 rounded-full bg-white py-3 font-black text-black">
                <Bot className="size-5" /> Play vs computer
              </button>
              <button onClick={() => enter(newRoomCode())} className="flex w-full items-center justify-center gap-2 rounded-full bg-[#ff4d6d] py-3 font-black">
                <Users className="size-5" /> Play with a friend
              </button>
              <div className="flex gap-2 pt-2">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6))}
                  placeholder="Room code"
                  className="min-w-0 flex-1 rounded-full bg-white/10 px-4 py-2.5 font-mono tracking-widest outline-none placeholder:tracking-normal"
                />
                <button disabled={!validRoomCode(code)} onClick={() => enter(code)} className="rounded-full bg-white/15 px-5 font-bold disabled:opacity-40">
                  Join
                </button>
              </div>
            </div>
            <p className="mt-4 text-xs text-white/50">Best win streak vs the computer: {localBest("four")}</p>
          </div>
        </div>
      </div>
    );

  const myTurn = mySide !== 0 && turn === mySide && !win && !draw && (mode === "ai" || players.length >= 2);
  const status = win
    ? `${name(win.who)} wins!`
    : draw
      ? "Draw!"
      : mode === "room" && players.length < 2
        ? "Waiting for a friend to join…"
        : myTurn
          ? "Your turn"
          : `${name(turn)}'s turn`;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#14070d] text-white">
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 md:flex-row md:items-start">
          <div className="flex-1">
            <div className="mb-3 flex items-center justify-between gap-2">
              {([1, 2] as const).map((side) => (
                <div key={side} className={cn("flex items-center gap-2 rounded-full px-3 py-1.5 transition", turn === side && !win && !draw ? "bg-white/15 ring-2 ring-white/40" : "bg-white/5")}>
                  <span className={cn("size-4 rounded-full", side === 1 ? "bg-[#ff4d6d]" : "bg-[#ffd400]")} />
                  {idOf(side) ? <Avatar userId={idOf(side)!} size={22} plain /> : <Bot className="size-5" />}
                  <span className="max-w-[110px] truncate text-sm font-semibold">{name(side)}</span>
                </div>
              ))}
            </div>
            <div className="text-center text-xl font-black">{status}</div>
            <div className="relative mx-auto mt-3 w-full max-w-[520px] rounded-3xl bg-[#2b5cff] p-2 shadow-2xl sm:p-3" onMouseLeave={() => setHover(null)}>
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                {Array.from({ length: ROWS * COLS }, (_, i) => {
                  const c = i % COLS;
                  const v = board[i];
                  const winning = win?.cells.includes(i);
                  return (
                    <button
                      key={i}
                      disabled={!myTurn}
                      onMouseEnter={() => setHover(c)}
                      onClick={() => play(c, mySide as 1 | 2)}
                      className={cn("aspect-square rounded-full transition", hover === c && myTurn ? "bg-[#14070d]/80" : "bg-[#14070d]")}
                      aria-label={`Column ${c + 1}`}
                    >
                      {v !== 0 && (
                        <span
                          className={cn("block size-full animate-pop rounded-full shadow-[inset_0_-6px_0_rgba(0,0,0,.25)]", v === 1 ? "bg-[#ff4d6d]" : "bg-[#ffd400]", winning && "ring-4 ring-white")}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            {(win || draw) && (mode === "ai" || mySide !== 0) && (
              <div className="mt-4 text-center">
                <button
                  onClick={() => {
                    const starter: 1 | 2 = first === 1 ? 2 : 1;
                    reset(mode === "ai" ? 1 : starter);
                    room?.send("reset", { first: starter });
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-2.5 font-bold text-black"
                >
                  <RotateCcw className="size-4" /> Rematch
                </button>
              </div>
            )}
            {mode === "room" && mySide === 0 && <p className="mt-3 text-center text-sm text-white/60">You&apos;re watching — the first two players play.</p>}
          </div>
          {mode === "room" && room && (
            <div className="md:w-80">
              <RoomInvite game="four" code={room.code} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

