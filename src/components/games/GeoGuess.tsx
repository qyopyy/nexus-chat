"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, Clock, ExternalLink, Globe, Map as MapIcon, Play, Trophy, Users, X } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { useGames } from "@/store/games";
import { leaderboard, submitScore, type Row } from "@/lib/games";
import { dailySeed, fmtKm, km, loadLeaflet, makeRounds, newMap, pinIcon, placeName, points, type GeoRound, type LeafletNS, type LMap } from "@/lib/geo";
import { newRoomCode, openRoom, validRoomCode, type Room, type RoomPlayer } from "@/lib/room";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";
import RoomInvite from "./RoomInvite";

type Guess = { lat: number; lng: number; dist: number; pts: number } | null;
type Phase = "menu" | "lobby" | "loading" | "play" | "reveal" | "final";
const COLORS = ["#ff2bd6", "#2fa8ff", "#ffb02e", "#36d39a", "#8b5cff", "#ff4d6d", "#00e0d0", "#f5c400"];
const EVENTS = ["start", "guess", "next", "hello", "sync", "settings"];

export default function GeoGuess({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const me = useApp((s) => s.userId)!;
  const myName = useApp((s) => s.profiles[s.userId ?? ""]?.display_name ?? "Player");
  const [phase, setPhase] = useState<Phase>("menu");
  const [mode, setMode] = useState<"solo" | "daily" | "multi">("solo");
  const [rounds, setRounds] = useState<GeoRound[]>([]);
  const [ri, setRi] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [nRounds, setNRounds] = useState(5);
  const [timeLimit, setTimeLimit] = useState(0); // seconds, 0 = none
  const [guesses, setGuesses] = useState<Record<string, Guess[]>>({});
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [left, setLeft] = useState(0);
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [joinInput, setJoinInput] = useState("");
  const [board, setBoard] = useState<Row[]>([]);
  const roundStart = useRef(0);
  const state = useRef({ rounds, ri, guesses, phase, timeLimit });
  state.current = { rounds, ri, guesses, phase, timeLimit };

  const loadBoard = useCallback(() => void leaderboard("geo").then(setBoard), []);
  useEffect(loadBoard, [loadBoard]);

  // ---------------------------------------------------------------- multiplayer room
  const host = room?.isHost() ?? true;
  const enterRoom = useCallback(
    (code: string) => {
      const r = openRoom("geo", code, me, myName, EVENTS);
      r.onPlayers(setPlayers);
      r.on("settings", (p) => {
        setNRounds(Number(p.n) || 5);
        setTimeLimit(Number(p.t) || 0);
      });
      r.on("start", (p) => {
        setRounds(p.rounds as GeoRound[]);
        setTimeLimit(Number(p.t) || 0);
        setGuesses({});
        setRi(0);
        setPin(null);
        roundStart.current = Date.now();
        setPhase("play");
      });
      r.on("guess", (p) => {
        const round = Number(p.round);
        setGuesses((g) => {
          const arr = [...(g[p.from] ?? [])];
          arr[round] = p.lat === null ? null : { lat: Number(p.lat), lng: Number(p.lng), dist: Number(p.dist), pts: Number(p.pts) };
          return { ...g, [p.from]: arr };
        });
      });
      r.on("next", (p) => {
        const n = Number(p.round);
        if (n >= state.current.rounds.length) setPhase("final");
        else {
          setRi(n);
          setPin(null);
          roundStart.current = Date.now();
          setPhase("play");
        }
      });
      r.on("hello", () => {
        if (!r.isHost()) return;
        const s = state.current;
        r.send("sync", { rounds: s.rounds, ri: s.ri, guesses: s.guesses, phase: s.phase, t: s.timeLimit });
      });
      r.on("sync", (p) => {
        if (state.current.phase !== "lobby") return;
        const ph = p.phase as Phase;
        if (ph === "lobby" || ph === "menu") return;
        setRounds(p.rounds as GeoRound[]);
        setGuesses(p.guesses as Record<string, Guess[]>);
        setTimeLimit(Number(p.t) || 0);
        setRi(Number(p.ri));
        roundStart.current = Date.now();
        setPhase(ph === "loading" ? "lobby" : ph === "reveal" ? "reveal" : ph);
      });
      r.onReady(() => r.send("hello", {}));
      setRoom(r);
      setMode("multi");
      setPhase("lobby");
    },
    [me, myName],
  );
  useEffect(() => () => room?.leave(), [room]);

  // opened from an invite / link
  const joinCode = useGames((s) => s.joinCode);
  const joinFor = useGames((s) => s.joinGame);
  useEffect(() => {
    if (joinCode && joinFor === "geo") {
      useGames.setState({ joinCode: null });
      enterRoom(joinCode);
    }
  }, [joinCode, joinFor, enterRoom]);

  // ---------------------------------------------------------------- game flow
  const startSolo = async (daily: boolean) => {
    setMode(daily ? "daily" : "solo");
    setPhase("loading");
    setLoaded(0);
    setGuesses({});
    const rs = await makeRounds(5, daily ? dailySeed() : undefined, setLoaded);
    if (rs.length < 3) {
      toast("Couldn't reach the photo library — try again", "error");
      setPhase("menu");
      return;
    }
    setRounds(rs);
    setRi(0);
    setPin(null);
    roundStart.current = Date.now();
    setPhase("play");
  };
  const startMulti = async () => {
    if (!room) return;
    setPhase("loading");
    setLoaded(0);
    const rs = await makeRounds(nRounds, undefined, setLoaded);
    if (rs.length < 2) {
      toast("Couldn't reach the photo library — try again", "error");
      setPhase("lobby");
      return;
    }
    setRounds(rs);
    setGuesses({});
    setRi(0);
    setPin(null);
    roundStart.current = Date.now();
    room.send("start", { rounds: rs, t: timeLimit });
    setPhase("play");
  };

  const myRound = guesses[me]?.[ri];
  const submit = useCallback(
    (p: { lat: number; lng: number } | null) => {
      const r = state.current.rounds[state.current.ri];
      if (!r || state.current.guesses[me]?.[state.current.ri] !== undefined) return;
      const g: Guess = p ? { ...p, dist: km(p.lat, p.lng, r.lat, r.lng), pts: 0 } : null;
      if (g) g.pts = points(g.dist);
      setGuesses((all) => {
        const arr = [...(all[me] ?? [])];
        arr[state.current.ri] = g;
        return { ...all, [me]: arr };
      });
      room?.send("guess", { round: state.current.ri, lat: g?.lat ?? null, lng: g?.lng ?? null, dist: g?.dist ?? 0, pts: g?.pts ?? 0 });
      if (!room) setPhase("reveal");
    },
    [me, room],
  );

  // multiplayer: reveal once everyone present has guessed
  useEffect(() => {
    if (mode !== "multi" || phase !== "play") return;
    const all = players.every((p) => guesses[p.id]?.[ri] !== undefined);
    if (all && players.length) setPhase("reveal");
  }, [guesses, players, ri, phase, mode]);

  // round timer
  useEffect(() => {
    if (phase !== "play" || !timeLimit) return;
    const id = setInterval(() => {
      const l = Math.max(0, timeLimit - Math.floor((Date.now() - roundStart.current) / 1000));
      setLeft(l);
      if (l === 0) {
        clearInterval(id);
        submit(pinRef.current);
        if (room) setTimeout(() => state.current.phase === "play" && setPhase("reveal"), 2500);
      }
    }, 250);
    return () => clearInterval(id);
  }, [phase, timeLimit, ri, submit, room]);
  const pinRef = useRef(pin);
  pinRef.current = pin;

  const next = () => {
    const n = ri + 1;
    if (room) {
      if (!host) return;
      room.send("next", { round: n });
    }
    if (n >= rounds.length) setPhase("final");
    else {
      setRi(n);
      setPin(null);
      roundStart.current = Date.now();
      setPhase("play");
    }
  };

  const totals = useMemo(() => {
    const ids = room ? players.map((p) => p.id) : [me];
    for (const id of Object.keys(guesses)) if (!ids.includes(id)) ids.push(id);
    return ids
      .map((id) => ({ id, total: (guesses[id] ?? []).reduce((s, g) => s + (g?.pts ?? 0), 0) }))
      .sort((a, b) => b.total - a.total);
  }, [guesses, players, room, me]);
  const myTotal = totals.find((t) => t.id === me)?.total ?? 0;

  // save score at the end
  const saved = useRef(false);
  useEffect(() => {
    if (phase !== "final" || saved.current) return;
    saved.current = true;
    if (myTotal > 0) void submitScore("geo", myTotal).then(loadBoard);
  }, [phase, myTotal, loadBoard]);
  useEffect(() => {
    if (phase === "loading") saved.current = false;
  }, [phase]);

  const colorOf = (id: string) => COLORS[Math.max(0, (room ? players.findIndex((p) => p.id === id) : 0)) % COLORS.length];

  // ---------------------------------------------------------------- screens
  const header = (
    <header className={cn("flex shrink-0 items-center gap-2 border-b border-white/10 bg-[#06140e] px-3 text-white", mobile ? "pt-safe-3 pb-2" : "h-12")}>
      <button
        onClick={() => {
          room?.leave();
          setRoom(null);
          if (phase === "menu") onBack();
          else setPhase("menu");
        }}
        className="grid size-9 place-items-center rounded-full hover:bg-white/10"
        aria-label="Back"
      >
        <ArrowLeft className="size-5" />
      </button>
      <Globe className="size-5 text-[#36d39a]" />
      <span className="font-black">GeoGuess</span>
      {(phase === "play" || phase === "reveal") && (
        <span className="ml-auto flex items-center gap-3 text-sm">
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-bold">
            Round {ri + 1}/{rounds.length}
          </span>
          <span className="font-bold tabular-nums">{myTotal.toLocaleString()} pts</span>
          {phase === "play" && timeLimit > 0 && (
            <span className={cn("flex items-center gap-1 font-mono font-bold tabular-nums", left <= 10 && "text-[#ff4d6d]")}>
              <Clock className="size-4" /> {left}s
            </span>
          )}
        </span>
      )}
    </header>
  );

  if (phase === "menu")
    return (
      <div className="flex h-full min-h-0 flex-col bg-[#06140e] text-white">
        {header}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto grid max-w-5xl gap-5 p-4 lg:grid-cols-[1fr_300px]">
            <div>
              <div className="relative overflow-hidden rounded-3xl p-6 sm:p-10" style={{ background: "radial-gradient(120% 120% at 0% 0%, #00c96b 0%, #0b2a5c 60%, #06140e 100%)" }}>
                <div className="text-xs font-bold tracking-widest text-white/80 uppercase">Real photos · real places</div>
                <h1 className="mt-1 text-4xl font-black sm:text-6xl">GeoGuess</h1>
                <p className="mt-2 max-w-md text-white/85">You get dropped somewhere on Earth. Read the clues — signs, plants, cars, buildings — then pin your guess on the map. Closer = more points (5,000 max per round).</p>
                <div className="mt-6 flex flex-wrap gap-2">
                  <button onClick={() => void startSolo(false)} className="flex items-center gap-2 rounded-full bg-white px-5 py-3 font-black text-black">
                    <Play className="size-4 fill-current" /> Play solo
                  </button>
                  <button onClick={() => void startSolo(true)} className="flex items-center gap-2 rounded-full bg-white/15 px-5 py-3 font-bold">
                    <CalendarDays className="size-4" /> Daily challenge
                  </button>
                  <button onClick={() => enterRoom(newRoomCode())} className="flex items-center gap-2 rounded-full bg-[#36d39a] px-5 py-3 font-black text-black">
                    <Users className="size-4" /> Play with friends
                  </button>
                </div>
                <div className="pointer-events-none absolute -right-10 -bottom-12 text-[180px] opacity-25 select-none sm:text-[240px]">🌍</div>
              </div>
              <div className="mt-4 flex gap-2">
                <input
                  value={joinInput}
                  onChange={(e) => setJoinInput(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6))}
                  placeholder="Room code"
                  className="min-w-0 flex-1 rounded-full bg-white/10 px-4 py-2.5 font-mono tracking-widest outline-none placeholder:tracking-normal"
                />
                <button disabled={!validRoomCode(joinInput)} onClick={() => enterRoom(joinInput)} className="rounded-full bg-white px-5 font-bold text-black disabled:opacity-40">
                  Join
                </button>
              </div>
              <p className="mt-3 text-xs text-white/50">Photos: Wikimedia Commons contributors (credited after every round). Map © OpenStreetMap contributors © CARTO.</p>
            </div>
            <Leaderboard rows={board} me={me} />
          </div>
        </div>
      </div>
    );

  if (phase === "lobby" && room)
    return (
      <div className="flex h-full min-h-0 flex-col bg-[#06140e] text-white">
        {header}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto grid max-w-4xl gap-4 p-4 md:grid-cols-2">
            <div className="space-y-4">
              <div className="rounded-2xl bg-white/10 p-4">
                <div className="mb-2 font-bold">Players ({players.length})</div>
                {players.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-2 py-1">
                    <span className="size-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <Avatar userId={p.id} size={28} plain />
                    <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                    {i === 0 && <span className="rounded bg-white/15 px-1.5 text-[10px] font-bold">HOST</span>}
                  </div>
                ))}
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <div className="mb-2 font-bold">Settings</div>
                <div className="flex flex-wrap items-center gap-1.5 text-sm">
                  <span className="w-16 text-white/70">Rounds</span>
                  {[3, 5, 10].map((n) => (
                    <button
                      key={n}
                      disabled={!host}
                      onClick={() => (setNRounds(n), room.send("settings", { n, t: timeLimit }))}
                      className={cn("rounded-full px-3 py-1 font-bold disabled:opacity-60", nRounds === n ? "bg-white text-black" : "bg-white/10")}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
                  <span className="w-16 text-white/70">Timer</span>
                  {[0, 60, 90, 120].map((t) => (
                    <button
                      key={t}
                      disabled={!host}
                      onClick={() => (setTimeLimit(t), room.send("settings", { n: nRounds, t }))}
                      className={cn("rounded-full px-3 py-1 font-bold disabled:opacity-60", timeLimit === t ? "bg-white text-black" : "bg-white/10")}
                    >
                      {t ? `${t}s` : "None"}
                    </button>
                  ))}
                </div>
              </div>
              {host ? (
                <button onClick={() => void startMulti()} className="w-full rounded-full bg-[#36d39a] py-3 text-lg font-black text-black">
                  Start game
                </button>
              ) : (
                <p className="rounded-2xl bg-white/10 p-4 text-center text-sm text-white/80">Waiting for the host to start…</p>
              )}
            </div>
            <RoomInvite game="geo" code={room.code} />
          </div>
        </div>
      </div>
    );

  if (phase === "loading")
    return (
      <div className="flex h-full min-h-0 flex-col bg-[#06140e] text-white">
        {header}
        <div className="grid flex-1 place-items-center p-6 text-center">
          <div>
            <div className="animate-spin text-6xl [animation-duration:3s]">🌍</div>
            <div className="mt-4 text-xl font-black">Finding real places…</div>
            <div className="mt-1 text-sm text-white/70">
              {loaded} / {mode === "multi" ? nRounds : 5} locations ready
            </div>
          </div>
        </div>
      </div>
    );

  const round = rounds[ri];
  if ((phase === "play" || phase === "reveal") && round)
    return (
      <div className="flex h-full min-h-0 flex-col bg-black text-white">
        {header}
        {phase === "play" ? (
          <div className="relative min-h-0 flex-1">
            <PhotoViewer key={round.url} src={round.url} />
            <GuessMap
              key={`m${ri}`}
              pin={pin}
              setPin={setPin}
              locked={myRound !== undefined}
              onGuess={() => submit(pin)}
              waitingFor={room ? players.filter((p) => guesses[p.id]?.[ri] === undefined).length : 0}
              mobile={mobile}
            />
            {room && (
              <div className="absolute top-3 left-3 flex -space-x-2">
                {players.map((p) => (
                  <div key={p.id} className={cn("rounded-full ring-2", guesses[p.id]?.[ri] !== undefined ? "ring-[#36d39a]" : "opacity-50 ring-white/30")} title={p.name}>
                    <Avatar userId={p.id} size={30} plain />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <Reveal
            round={round}
            ri={ri}
            last={ri + 1 >= rounds.length}
            guesses={Object.entries(guesses).map(([id, arr]) => ({ id, g: arr[ri] ?? null, color: colorOf(id), name: players.find((p) => p.id === id)?.name ?? (id === me ? myName : "Player") }))}
            me={me}
            canNext={!room || host}
            onNext={next}
          />
        )}
      </div>
    );

  // final
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#06140e] text-white">
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-4xl gap-4 p-4 md:grid-cols-[1fr_280px]">
          <div className="rounded-3xl p-6 text-center" style={{ background: "radial-gradient(120% 120% at 50% 0%, #00c96b55, transparent 70%), rgba(255,255,255,.06)" }}>
            <div className="text-sm font-bold tracking-widest text-white/70 uppercase">{mode === "daily" ? "Daily challenge" : "Final score"}</div>
            <div className="mt-1 text-6xl font-black tabular-nums">{myTotal.toLocaleString()}</div>
            <div className="text-sm text-white/70">out of {(rounds.length * 5000).toLocaleString()}</div>
            {room && (
              <div className="mx-auto mt-5 max-w-sm space-y-1.5 text-left">
                {totals.map((t, i) => (
                  <div key={t.id} className={cn("flex items-center gap-2 rounded-xl px-3 py-2", t.id === me ? "bg-white/15" : "bg-white/5")}>
                    <span className="w-6 text-center font-black">{["🥇", "🥈", "🥉"][i] ?? i + 1}</span>
                    <Avatar userId={t.id} size={28} plain />
                    <span className="min-w-0 flex-1 truncate">{players.find((p) => p.id === t.id)?.name ?? "Player"}</span>
                    <span className="font-bold tabular-nums">{t.total.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {room ? (
                host && (
                  <button onClick={() => setPhase("lobby")} className="rounded-full bg-white px-6 py-2.5 font-bold text-black">
                    Back to lobby
                  </button>
                )
              ) : (
                <button onClick={() => void startSolo(mode === "daily")} className="rounded-full bg-white px-6 py-2.5 font-bold text-black">
                  {mode === "daily" ? "Replay daily" : "Play again"}
                </button>
              )}
              <button
                onClick={() => {
                  room?.leave();
                  setRoom(null);
                  setPhase("menu");
                }}
                className="rounded-full bg-white/15 px-5 py-2.5 font-semibold"
              >
                Menu
              </button>
            </div>
          </div>
          <Leaderboard rows={board} me={me} />
        </div>
      </div>
    </div>
  );
}

function Leaderboard({ rows, me }: { rows: Row[]; me: string }) {
  return (
    <aside className="rounded-3xl bg-white/5 p-3">
      <div className="mb-2 flex items-center gap-2 px-1 font-bold">
        <Trophy className="size-4 text-[#ffd400]" /> Best games
      </div>
      {rows.length === 0 && <p className="px-1 text-sm text-white/50">No scores yet — be the first.</p>}
      {rows.slice(0, 12).map((r, i) => (
        <div key={r.user_id} className={cn("flex items-center gap-2 rounded-lg px-1.5 py-1", r.user_id === me && "bg-white/10")}>
          <span className="w-5 text-center text-sm font-bold text-white/60">{i + 1}</span>
          <Avatar userId={r.user_id} size={22} plain />
          <span className="min-w-0 flex-1 truncate text-sm">
            <NameTag userId={r.user_id} badges={false} />
          </span>
          <span className="text-sm font-semibold tabular-nums">{r.best.toLocaleString()}</span>
        </div>
      ))}
    </aside>
  );
}

/** drag to pan, wheel / pinch-ish buttons to zoom around the photo */
function PhotoViewer({ src }: { src: string }) {
  const [z, setZ] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [ok, setOk] = useState<boolean | null>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  return (
    <div
      className="absolute inset-0 cursor-grab touch-none overflow-hidden bg-black active:cursor-grabbing"
      onWheel={(e) => setZ((v) => Math.max(1, Math.min(5, v * (e.deltaY < 0 ? 1.15 : 0.87))))}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y };
      }}
      onPointerMove={(e) => drag.current && setOff({ x: drag.current.ox + (e.clientX - drag.current.x), y: drag.current.oy + (e.clientY - drag.current.y) })}
      onPointerUp={() => (drag.current = null)}
      onDoubleClick={() => (setZ(1), setOff({ x: 0, y: 0 }))}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Where is this?"
        draggable={false}
        onLoad={() => setOk(true)}
        onError={() => setOk(false)}
        className="absolute inset-0 h-full w-full object-contain transition-transform duration-75 select-none"
        style={{ transform: `translate(${off.x}px, ${off.y}px) scale(${z})` }}
      />
      {ok === null && <div className="absolute inset-0 grid place-items-center text-white/60">Loading photo…</div>}
      {ok === false && <div className="absolute inset-0 grid place-items-center text-white/60">Photo failed to load — make a wild guess 🙂</div>}
      <div className="absolute bottom-3 left-3 flex gap-1">
        {[
          ["+", () => setZ((v) => Math.min(5, v * 1.3))],
          ["−", () => setZ((v) => Math.max(1, v / 1.3))],
        ].map(([l, f]) => (
          <button key={l as string} onPointerDown={(e) => e.stopPropagation()} onClick={f as () => void} className="grid size-9 place-items-center rounded-full bg-black/60 text-xl font-bold backdrop-blur">
            {l as string}
          </button>
        ))}
      </div>
    </div>
  );
}

function useLeaflet() {
  const [L, setL] = useState<LeafletNS | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    loadLeaflet().then(setL, (e: Error) => setErr(e.message));
  }, []);
  return { L, err };
}

/** the corner map you pin your guess on (expands on hover / tap) */
function GuessMap({ pin, setPin, locked, onGuess, waitingFor, mobile }: { pin: { lat: number; lng: number } | null; setPin: (p: { lat: number; lng: number }) => void; locked: boolean; onGuess: () => void; waitingFor: number; mobile?: boolean }) {
  const { L, err } = useLeaflet();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const marker = useRef<{ remove: () => void } | null>(null);
  const [big, setBig] = useState(false);
  const [open, setOpen] = useState(!mobile);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  useEffect(() => {
    if (!L || !el.current || map.current) return;
    const m = newMap(L, el.current);
    m.on("click", (e) => !lockedRef.current && setPin({ lat: e.latlng.lat, lng: ((((e.latlng.lng + 180) % 360) + 360) % 360) - 180 }));
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, [L, setPin]);
  useEffect(() => {
    if (!L || !map.current) return;
    marker.current?.remove();
    marker.current = pin ? L.marker([pin.lat, pin.lng], { icon: pinIcon(L, "#ff2bd6") }).addTo(map.current) : null;
  }, [L, pin]);
  useEffect(() => {
    const t = setTimeout(() => map.current?.invalidateSize(), 220);
    return () => clearTimeout(t);
  }, [big, open]);

  if (mobile && !open)
    return (
      <button onClick={() => setOpen(true)} className="absolute right-3 bottom-3 flex items-center gap-2 rounded-full bg-[#36d39a] px-5 py-3 font-black text-black shadow-xl">
        <MapIcon className="size-5" /> {pin ? "Guess" : "Open map"}
      </button>
    );
  return (
    <div
      onMouseEnter={() => setBig(true)}
      onMouseLeave={() => setBig(false)}
      className={cn(
        "absolute z-10 flex flex-col overflow-hidden rounded-2xl bg-[#0d1a14] shadow-2xl ring-1 ring-white/15 transition-all duration-200",
        mobile ? "inset-x-2 bottom-2 h-[60%]" : big ? "right-3 bottom-3 h-[62%] w-[min(620px,60%)]" : "right-3 bottom-3 h-56 w-80 opacity-90",
      )}
    >
      <div ref={el} className="min-h-0 flex-1 bg-[#aad3df]" />
      {err && <div className="absolute inset-0 grid place-items-center bg-black/70 p-4 text-center text-sm">{err}</div>}
      <div className="flex gap-2 p-2">
        {mobile && (
          <button onClick={() => setOpen(false)} className="grid size-11 place-items-center rounded-xl bg-white/10" aria-label="Hide map">
            <X className="size-5" />
          </button>
        )}
        <button
          disabled={!pin || locked}
          onClick={onGuess}
          className="flex-1 rounded-xl bg-[#36d39a] py-2.5 font-black text-black uppercase disabled:bg-white/15 disabled:text-white/50"
        >
          {locked ? (waitingFor ? `Waiting for ${waitingFor}…` : "Guessed") : pin ? "Guess" : "Place your pin on the map"}
        </button>
      </div>
    </div>
  );
}

function Reveal({ round, ri, last, guesses, me, canNext, onNext }: { round: GeoRound; ri: number; last: boolean; guesses: { id: string; g: Guess; color: string; name: string }[]; me: string; canNext: boolean; onNext: () => void }) {
  const { L, err } = useLeaflet();
  const el = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState("");
  const mine = guesses.find((x) => x.id === me)?.g ?? null;
  useEffect(() => void placeName(round.lat, round.lng).then(setPlace), [round]);
  useEffect(() => {
    if (!L || !el.current) return;
    const m = newMap(L, el.current);
    const pts: [number, number][] = [[round.lat, round.lng]];
    L.marker([round.lat, round.lng], { icon: pinIcon(L, "#36d39a", "★") }).addTo(m);
    for (const x of guesses) {
      if (!x.g) continue;
      pts.push([x.g.lat, x.g.lng]);
      L.marker([x.g.lat, x.g.lng], { icon: pinIcon(L, x.color, x.name.slice(0, 1).toUpperCase()) }).addTo(m);
      L.polyline(
        [
          [x.g.lat, x.g.lng],
          [round.lat, round.lng],
        ],
        { color: x.color, weight: 3, dashArray: "6 6" },
      ).addTo(m);
    }
    setTimeout(() => {
      m.invalidateSize();
      if (pts.length > 1) m.fitBounds(pts, { padding: [50, 50], maxZoom: 9 });
      else m.setView([round.lat, round.lng], 5);
    }, 80);
    return () => m.remove();
  }, [L, round, guesses]);

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="relative min-h-[45%] flex-1">
        <div ref={el} className="absolute inset-0 bg-[#aad3df]" />
        {err && <div className="absolute inset-0 grid place-items-center bg-black/70 p-4 text-center text-sm">{err}</div>}
      </div>
      <div className="shrink-0 overflow-y-auto bg-[#06140e] p-4 lg:w-80">
        <div className="text-xs font-bold tracking-widest text-white/60 uppercase">Round {ri + 1}</div>
        <div className="mt-1 text-4xl font-black tabular-nums">{mine ? `+${mine.pts.toLocaleString()}` : "+0"}</div>
        <div className="text-sm text-white/80">{mine ? `Your guess was ${fmtKm(mine.dist)} away` : "No guess this round"}</div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-[#ffb02e] to-[#36d39a]" style={{ width: `${((mine?.pts ?? 0) / 5000) * 100}%` }} />
        </div>
        <div className="mt-4 rounded-2xl bg-white/5 p-3 text-sm">
          <div className="font-bold">📍 {place || "Locating…"}</div>
          <div className="mt-2 flex gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={round.url} alt="" className="h-14 w-20 shrink-0 rounded-lg object-cover" />
            <div className="min-w-0 text-xs text-white/70">
              <div className="line-clamp-2 text-white/90">{round.title}</div>
              <a href={round.page} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 underline">
                {round.credit}
                {round.license && ` · ${round.license}`} <ExternalLink className="size-3" />
              </a>
            </div>
          </div>
        </div>
        {guesses.length > 1 && (
          <div className="mt-3 space-y-1">
            {[...guesses]
              .sort((a, b) => (b.g?.pts ?? 0) - (a.g?.pts ?? 0))
              .map((x) => (
                <div key={x.id} className="flex items-center gap-2 text-sm">
                  <span className="size-3 rounded-full" style={{ background: x.color }} />
                  <span className="min-w-0 flex-1 truncate">{x.name}</span>
                  <span className="text-white/60">{x.g ? fmtKm(x.g.dist) : "—"}</span>
                  <span className="w-14 text-right font-bold tabular-nums">{x.g?.pts ?? 0}</span>
                </div>
              ))}
          </div>
        )}
        {canNext ? (
          <button onClick={onNext} className="mt-4 w-full rounded-full bg-white py-3 font-black text-black">
            {last ? "See results" : "Next round"}
          </button>
        ) : (
          <p className="mt-4 text-center text-sm text-white/60">Waiting for the host…</p>
        )}
      </div>
    </div>
  );
}
