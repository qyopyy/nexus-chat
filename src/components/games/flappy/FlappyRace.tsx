"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Play, Users } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { useGames } from "@/store/games";
import { newRoomCode, openRoom, roomLink, validRoomCode, type Room, type RoomPlayer } from "@/lib/room";
import { cn } from "@/lib/utils";
import RoomInvite from "../RoomInvite";
import { FlappyFrameHeader } from "./ui";

type Ghost = { id: string; name: string; y: number; score: number; alive: boolean; bird: string; finished?: number };
type Phase = "lobby" | "countdown" | "play" | "results";

const BIRD_COLORS: Record<string, string> = {
  classic: "#facc15",
  bluejay: "#38bdf8",
  cardinal: "#ef4444",
  gold: "#fbbf24",
  cyber: "#06b6d4",
  ghost: "#e2e8f0",
  ninja: "#1e293b",
  alien: "#10b981",
  emo: "#7c3aed",
  lucid: "#c084fc",
  phoenix: "#fb923c",
  candy: "#fb7185",
  frost: "#a5f3fc",
};

function mulberry32(a: number) {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function FlappyRace({
  birdId,
  onBack,
  onFinish,
  mobile,
}: {
  birdId: string;
  onBack: () => void;
  onFinish: (place: number, score: number) => void;
  mobile?: boolean;
}) {
  const me = useApp((s) => s.userId)!;
  const myName = useApp((s) => s.profiles[s.userId ?? ""]?.display_name ?? "Player");
  const joinCode = useGames((s) => (s.joinGame === "flappy" ? s.joinCode : null));
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [codeIn, setCodeIn] = useState("");
  const [phase, setPhase] = useState<Phase>("lobby");
  const [count, setCount] = useState(3);
  const [ghosts, setGhosts] = useState<Record<string, Ghost>>({});
  const [myScore, setMyScore] = useState(0);
  const [place, setPlace] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const roomRef = useRef<Room | null>(null);
  const stateRef = useRef({
    y: 0,
    v: 0,
    score: 0,
    alive: true,
    pipes: [] as { x: number; gap: number; passed: boolean }[],
    seed: 1,
    rand: mulberry32(1),
    started: false,
    finishedAt: 0,
  });
  const ghostsRef = useRef(ghosts);
  ghostsRef.current = ghosts;
  const finishedRef = useRef(false);

  const leaveRoom = useCallback(() => {
    roomRef.current?.leave();
    roomRef.current = null;
    setRoom(null);
    setPlayers([]);
    setPhase("lobby");
    setGhosts({});
  }, []);

  useEffect(() => () => leaveRoom(), [leaveRoom]);

  const attach = useCallback(
    (r: Room) => {
      roomRef.current = r;
      setRoom(r);
      r.onPlayers(setPlayers);
      r.on("start", (p) => {
        const seed = Number(p.seed) || 1;
        stateRef.current = {
          y: 0,
          v: 0,
          score: 0,
          alive: true,
          pipes: [],
          seed,
          rand: mulberry32(seed),
          started: false,
          finishedAt: 0,
        };
        setMyScore(0);
        setPlace(0);
        setGhosts({});
        finishedRef.current = false;
        setPhase("countdown");
        setCount(3);
      });
      r.on("state", (p) => {
        const id = p.from;
        setGhosts((g) => ({
          ...g,
          [id]: {
            id,
            name: String(p.name ?? "Player"),
            y: Number(p.y) || 0,
            score: Number(p.score) || 0,
            alive: !!p.alive,
            bird: String(p.bird ?? "classic"),
            finished: typeof p.finished === "number" ? p.finished : g[id]?.finished,
          },
        }));
      });
      r.on("done", (p) => {
        const id = p.from;
        setGhosts((g) => ({
          ...g,
          [id]: {
            ...(g[id] ?? { id, name: String(p.name ?? "Player"), y: 0, score: 0, alive: false, bird: "classic" }),
            score: Number(p.score) || 0,
            alive: false,
            finished: Number(p.finished) || Date.now(),
          },
        }));
      });
    },
    [],
  );

  const host = useCallback(async () => {
    if (!me) return;
    leaveRoom();
    const code = newRoomCode();
    const r = openRoom("flappy", code, me, myName, ["start", "state", "done"]);
    attach(r);
    useGames.setState({ joinCode: null });
  }, [attach, leaveRoom, me, myName]);

  const join = useCallback(
    async (code: string) => {
      if (!me || !validRoomCode(code)) {
        toast("Enter a 6-character room code", "error");
        return;
      }
      leaveRoom();
      const r = openRoom("flappy", code, me, myName, ["start", "state", "done"]);
      attach(r);
      useGames.setState({ joinCode: null });
    },
    [attach, leaveRoom, me, myName],
  );

  useEffect(() => {
    if (joinCode && validRoomCode(joinCode) && !room) void join(joinCode);
  }, [join, joinCode, room]);

  useEffect(() => {
    if (phase !== "countdown") return;
    if (count <= 0) {
      setPhase("play");
      stateRef.current.y = (canvasRef.current?.clientHeight ?? 400) * 0.4;
      stateRef.current.started = true;
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 700);
    return () => clearTimeout(t);
  }, [phase, count]);

  const startRace = () => {
    const r = roomRef.current;
    if (!r?.isHost()) return;
    const seed = (Date.now() % 1e9) | 0;
    r.send("start", { seed });
    // host also receives via local apply
    stateRef.current = {
      y: 0,
      v: 0,
      score: 0,
      alive: true,
      pipes: [],
      seed,
      rand: mulberry32(seed),
      started: false,
      finishedAt: 0,
    };
    setMyScore(0);
    setPlace(0);
    setGhosts({});
    finishedRef.current = false;
    setPhase("countdown");
    setCount(3);
  };

  // game loop
  useEffect(() => {
    if (phase !== "play" && phase !== "countdown") return;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    let raf = 0;
    let last = performance.now();
    let sendAcc = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = cv.clientWidth;
      const H = cv.clientHeight;
      cv.width = W * dpr;
      cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);

    const flap = () => {
      const s = stateRef.current;
      if (phase !== "play" || !s.alive) return;
      s.v = -340;
      s.started = true;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        flap();
      }
    };
    window.addEventListener("keydown", onKey);
    cv.addEventListener("pointerdown", flap);

    const finish = (score: number) => {
      const s = stateRef.current;
      if (!s.alive || finishedRef.current) return;
      finishedRef.current = true;
      s.alive = false;
      s.finishedAt = Date.now();
      roomRef.current?.send("done", { score, name: myName, finished: s.finishedAt, bird: birdId });
      // compute place among known finishes + self
      const others = Object.values(ghostsRef.current);
      const board = [
        ...others.map((g) => ({ id: g.id, score: g.score, finished: g.finished ?? (g.alive ? Infinity : 0), alive: g.alive })),
        { id: me, score, finished: s.finishedAt, alive: false },
      ].sort((a, b) => b.score - a.score || a.finished - b.finished);
      const p = board.findIndex((x) => x.id === me) + 1;
      setPlace(p);
      setPhase("results");
      onFinish(p, score);
    };

    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const W = cv.clientWidth;
      const H = cv.clientHeight;
      const s = stateRef.current;
      const ground = 56;

      // sky
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#7dd3fc");
      g.addColorStop(0.55, "#86efac");
      g.addColorStop(1, "#4ade80");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      if (phase === "play" && s.alive && s.started) {
        s.v += 980 * dt;
        s.y += s.v * dt;
        const speed = 170 + Math.min(120, s.score * 3);
        if (!s.pipes.length || s.pipes[s.pipes.length - 1].x < W - 180) {
          const gap = 100 + s.rand() * (H - ground - 220);
          s.pipes.push({ x: W + 40, gap, passed: false });
        }
        for (const p of s.pipes) {
          p.x -= speed * dt;
          if (!p.passed && p.x + 44 < W * 0.28) {
            p.passed = true;
            s.score++;
            setMyScore(s.score);
          }
        }
        s.pipes = s.pipes.filter((p) => p.x > -60);

        const bx = W * 0.28;
        const by = s.y;
        const br = 14;
        for (const p of s.pipes) {
          const topH = p.gap;
          const botY = p.gap + 120;
          if (bx + br > p.x && bx - br < p.x + 52) {
            if (by - br < topH || by + br > botY) {
              finish(s.score);
              break;
            }
          }
        }
        if (by + br > H - ground || by - br < 0) finish(s.score);
      }

      // pipes
      for (const p of s.pipes) {
        ctx.fillStyle = "#16a34a";
        ctx.fillRect(p.x, 0, 52, p.gap);
        ctx.fillRect(p.x, p.gap + 120, 52, H);
        ctx.fillStyle = "#15803d";
        ctx.fillRect(p.x - 4, p.gap - 18, 60, 18);
        ctx.fillRect(p.x - 4, p.gap + 120, 60, 18);
      }

      // ground
      ctx.fillStyle = "#15803d";
      ctx.fillRect(0, H - ground, W, ground);
      ctx.fillStyle = "#4ade80";
      ctx.fillRect(0, H - ground, W, 10);

      // ghosts
      for (const g of Object.values(ghostsRef.current)) {
        if (g.id === me) continue;
        ctx.globalAlpha = g.alive ? 0.55 : 0.25;
        ctx.fillStyle = BIRD_COLORS[g.bird] ?? "#facc15";
        ctx.beginPath();
        ctx.arc(W * 0.28, g.y || H * 0.4, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.font = "600 10px system-ui";
        ctx.fillText(g.name.slice(0, 10), W * 0.28 - 18, (g.y || H * 0.4) - 18);
      }

      // me
      ctx.fillStyle = BIRD_COLORS[birdId] ?? "#facc15";
      ctx.beginPath();
      ctx.arc(W * 0.28, s.y || H * 0.4, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(W * 0.28 + 5, (s.y || H * 0.4) - 3, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.arc(W * 0.28 + 6, (s.y || H * 0.4) - 3, 2, 0, Math.PI * 2);
      ctx.fill();

      // score
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.lineWidth = 6;
      ctx.font = "900 48px system-ui";
      ctx.textAlign = "center";
      ctx.strokeText(String(s.score), W / 2, 54);
      ctx.fillText(String(s.score), W / 2, 54);

      if (phase === "countdown") {
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#fff";
        ctx.font = "900 84px system-ui";
        ctx.fillText(count > 0 ? String(count) : "GO!", W / 2, H / 2);
      }

      sendAcc += dt;
      if (sendAcc > 0.1 && roomRef.current && phase === "play") {
        sendAcc = 0;
        roomRef.current.send("state", {
          y: s.y,
          score: s.score,
          alive: s.alive,
          name: myName,
          bird: birdId,
          finished: s.finishedAt || undefined,
        });
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", onKey);
      cv.removeEventListener("pointerdown", flap);
    };
  }, [phase, count, birdId, me, myName, onFinish]);

  const copy = async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(roomLink(room.code, "flappy"));
      toast("Invite link copied", "success");
    } catch {
      toast(room.code, "info");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#090d16] text-white">
      <FlappyFrameHeader title="Flappy Race" onBack={() => { leaveRoom(); onBack(); }} mobile={mobile} />
      {!room || phase === "lobby" ? (
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4">
          <div className="rounded-3xl p-5" style={{ background: "linear-gradient(135deg,#38bdf8,#4ade80)" }}>
            <div className="text-xs font-bold tracking-widest text-white/85 uppercase">Multiplayer · Win Top 3</div>
            <div className="mt-1 text-3xl font-black">Race the pipes</div>
            <p className="mt-2 text-sm text-white/90">Same pipe seed for everyone. Highest score when you crash ranks the lobby — top 3 earn a chest.</p>
          </div>
          <button onClick={() => void host()} className="flex items-center justify-center gap-2 rounded-2xl bg-[#facc15] py-3.5 font-black text-black">
            <Users className="size-5" /> Host a race
          </button>
          <div className="flex gap-2">
            <input
              value={codeIn}
              onChange={(e) => setCodeIn(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6))}
              placeholder="ROOM CODE"
              className="min-w-0 flex-1 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 font-mono tracking-widest outline-none"
            />
            <button onClick={() => void join(codeIn)} className="rounded-2xl bg-white px-4 font-bold text-black">
              Join
            </button>
          </div>
          {room && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center gap-2">
                <span className="font-mono text-2xl font-black tracking-[0.2em]">{room.code}</span>
                <button onClick={() => void copy()} className="ml-auto grid size-9 place-items-center rounded-full bg-white/10" aria-label="Copy link">
                  <Copy className="size-4" />
                </button>
              </div>
              <RoomInvite code={room.code} game="flappy" />
              <div className="mt-3 space-y-1">
                {players.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 text-sm">
                    <span className="size-2 rounded-full bg-[#4ade80]" />
                    {p.name}
                    {p.id === room.hostId() && <span className="text-[10px] font-bold text-[#facc15]">HOST</span>}
                  </div>
                ))}
              </div>
              {room.isHost() ? (
                <button disabled={players.length < 1} onClick={startRace} className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#22c55e] py-3 font-black disabled:opacity-40">
                  <Play className="size-4 fill-current" /> Start race ({players.length})
                </button>
              ) : (
                <p className="mt-3 text-center text-sm text-white/60">Waiting for host to start…</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
          <canvas ref={canvasRef} className="absolute inset-0 size-full touch-none" />
          <div className="pointer-events-none absolute top-3 right-3 left-3 flex flex-wrap gap-1.5">
            {players.map((p) => {
              const g = ghosts[p.id];
              const score = p.id === me ? myScore : g?.score ?? 0;
              return (
                <span key={p.id} className={cn("rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-bold backdrop-blur", g && !g.alive && p.id !== me && "opacity-50")}>
                  {p.name} · {score}
                </span>
              );
            })}
          </div>
          {phase === "results" && (
            <div className="absolute inset-0 z-10 grid place-items-center bg-black/65 p-6 text-center">
              <div>
                <div className="text-sm font-bold tracking-widest text-white/60 uppercase">Finished</div>
                <div className="text-5xl font-black">#{place || "—"}</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">Score {myScore}</div>
                {place > 0 && place <= 3 && <div className="mt-2 font-bold text-[#facc15]">Top 3 — chest unlocked!</div>}
                <div className="mt-5 flex justify-center gap-2">
                  {room.isHost() && (
                    <button onClick={startRace} className="rounded-full bg-white px-5 py-2.5 font-bold text-black">
                      Race again
                    </button>
                  )}
                  <button
                    onClick={() => {
                      leaveRoom();
                      onBack();
                    }}
                    className="rounded-full bg-white/15 px-5 py-2.5 font-semibold"
                  >
                    Lobby
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
