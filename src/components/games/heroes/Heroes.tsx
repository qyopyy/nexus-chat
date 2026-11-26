"use client";

// Cul-de-Sac Heroes — original co-op tactics. Solo (you run a squad) or 2–4 friends over a room code.
// Host-authoritative: the room's host runs the rules (src/lib/heroes.ts) and broadcasts the full state.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, RotateCcw, Swords, Users } from "lucide-react";
import { useApp } from "@/store/app";
import { useGames } from "@/store/games";
import { localBest, saveLocalBest } from "@/lib/games";
import { newRoomCode, openRoom, validRoomCode, type Room, type RoomPlayer } from "@/lib/room";
import { cn } from "@/lib/utils";
import RoomInvite from "../RoomInvite";
import {
  FOES, HEROES, MAX_WAVE, H, W, act, byId, canUse, createBattle, livingHeroes, moveTiles, skillTiles, skillsOf, waitingOn,
  type Action, type Battle, type FoeKind, type HeroKind, type PartyEntry, type Skill, type Unit,
} from "@/lib/heroes";

type Mode = "menu" | "solo" | "lobby" | "battle";
const KINDS = Object.keys(HEROES) as HeroKind[];
const EVENTS = ["pick", "hello", "state", "act", "lobby"];
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0]!;

export default function Heroes({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const me = useApp((s) => s.userId)!;
  const myName = useApp((s) => s.profiles[s.userId ?? ""]?.display_name ?? "Player");
  const [mode, setMode] = useState<Mode>("menu");
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [picks, setPicks] = useState<Record<string, HeroKind>>({});
  const [squad, setSquad] = useState<HeroKind[]>(["kettle", "sparkplug", "marsh"]);
  const [party, setParty] = useState<PartyEntry[]>([]);
  const [state, setState] = useState<Battle | null>(null);
  const [code, setCode] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [aim, setAim] = useState<string | null>(null);
  const [inspect, setInspect] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const stRef = useRef<Battle | null>(null);
  const partyRef = useRef<PartyEntry[]>([]);
  const picksRef = useRef<Record<string, HeroKind>>({});
  const roomRef = useRef<Room | null>(null);
  const scored = useRef(false);

  const commit = useCallback((s: Battle | null, p?: PartyEntry[]) => {
    stRef.current = s;
    setState(s);
    if (p) {
      partyRef.current = p;
      setParty(p);
    }
    setErr("");
  }, []);

  const names = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of players) m[p.id] = p.name;
    for (const p of party) m[p.player] = p.name;
    m[me] = myName;
    return m;
  }, [players, party, me, myName]);

  // ---- host-side: apply an action and tell everyone
  const apply = useCallback(
    (from: string, a: Action) => {
      const cur = stRef.current;
      if (!cur) return;
      const r = act(cur, from, a);
      if (r.error) {
        if (from === me) setErr(r.error);
        return;
      }
      commit(r.state);
      roomRef.current?.send("state", { state: r.state, party: partyRef.current });
    },
    [commit, me],
  );

  const doAct = useCallback(
    (a: Action) => {
      const r = roomRef.current;
      if (r && !r.isHost()) r.send("act", { action: a });
      else apply(me, a);
    },
    [apply, me],
  );

  const enter = useCallback(
    (c: string) => {
      const r = openRoom("heroes", c, me, myName, EVENTS);
      roomRef.current = r;
      r.onPlayers(setPlayers);
      const mine = () => picksRef.current[me] ?? "kettle";
      r.on("pick", (p) => {
        const hero = String(p.hero) as HeroKind;
        if (hero in HEROES) {
          picksRef.current = { ...picksRef.current, [p.from]: hero };
          setPicks(picksRef.current);
        }
      });
      r.on("hello", () => {
        r.send("pick", { hero: mine() });
        if (r.isHost() && stRef.current) r.send("state", { state: stRef.current, party: partyRef.current });
      });
      r.on("state", (p) => {
        if (p.from !== r.hostId() || !p.state) return;
        commit(p.state as Battle, Array.isArray(p.party) ? (p.party as PartyEntry[]) : undefined);
        setMode("battle");
      });
      r.on("act", (p) => {
        if (!r.isHost()) return;
        try {
          apply(String(p.from), p.action as Action);
        } catch {
          /* ignore malformed action */
        }
      });
      r.on("lobby", (p) => {
        if (p.from !== r.hostId()) return;
        commit(null);
        setMode("lobby");
      });
      r.onReady(() => {
        picksRef.current = { ...picksRef.current, [me]: mine() };
        setPicks(picksRef.current);
        r.send("hello", {});
        r.send("pick", { hero: mine() });
      });
      setRoom(r);
      commit(null);
      setMode("lobby");
    },
    [apply, commit, me, myName],
  );

  useEffect(() => () => roomRef.current?.leave(), []);

  const joinCode = useGames((s) => s.joinCode);
  const joinFor = useGames((s) => s.joinGame);
  useEffect(() => {
    if (joinCode && joinFor === "heroes") {
      useGames.setState({ joinCode: null });
      enter(joinCode);
    }
  }, [joinCode, joinFor, enter]);

  const leave = () => {
    roomRef.current?.leave();
    roomRef.current = null;
    setRoom(null);
    setPlayers([]);
    picksRef.current = {};
    setPicks({});
    commit(null);
    setMode("menu");
  };

  const pickHero = (hero: HeroKind) => {
    picksRef.current = { ...picksRef.current, [me]: hero };
    setPicks(picksRef.current);
    room?.send("pick", { hero });
  };

  const startSolo = () => {
    const p: PartyEntry[] = squad.map((hero) => ({ player: me, name: myName, hero }));
    scored.current = false;
    commit(createBattle(p, seed()), p);
    setSel(null);
    setAim(null);
    setMode("battle");
  };
  const startRoom = () => {
    const p: PartyEntry[] = players.slice(0, 4).map((pl) => ({ player: pl.id, name: pl.name, hero: picksRef.current[pl.id] ?? "kettle" }));
    const s = createBattle(p, seed());
    scored.current = false;
    commit(s, p);
    setSel(null);
    setAim(null);
    setMode("battle");
    roomRef.current?.send("state", { state: s, party: p });
  };
  const backToLobby = () => {
    commit(null);
    setMode("lobby");
    roomRef.current?.send("lobby", {});
  };

  // local best + reset selection when a new turn begins
  useEffect(() => {
    if (state && state.phase !== "heroes" && !scored.current) {
      scored.current = true;
      if (state.score > localBest("heroes")) saveLocalBest("heroes", state.score);
    }
  }, [state]);
  const round = state ? `${state.wave}:${state.round}` : "";
  useEffect(() => {
    setAim(null);
    setInspect(null);
  }, [round]);

  const unit = state && sel ? byId(state, sel) : undefined;
  const mine = state ? livingHeroes(state).filter((h) => h.owner === me) : [];
  const myTurnLeft = state?.phase === "heroes" && mine.some((h) => !(h.done || (h.moved && h.acted)));

  const moves = useMemo(() => (state && unit && aim === "move" ? moveTiles(state, unit) : []), [state, unit, aim]);
  const skill = unit && aim && aim !== "move" ? skillsOf(unit).find((k) => k.id === aim) : undefined;
  const targets = useMemo(() => (state && unit && skill ? skillTiles(state, unit, skill) : []), [state, unit, skill]);

  const pickUnit = (u: Unit) => {
    setSel(u.id);
    setAim(u.moved || u.done ? null : "move");
    setInspect(null);
  };
  const clickCell = (x: number, y: number) => {
    if (!state) return;
    const u = state.units.find((q) => q.hp > 0 && q.x === x && q.y === y);
    if (unit && aim === "move" && moves.some((m) => m.x === x && m.y === y)) {
      doAct({ t: "move", unit: unit.id, to: { x, y } });
      setAim(null);
      return;
    }
    if (unit && skill && targets.some((m) => m.x === x && m.y === y)) {
      doAct({ t: "skill", unit: unit.id, skill: skill.id, at: { x, y } });
      setAim(null);
      return;
    }
    if (u && u.team === "hero" && u.owner === me) return pickUnit(u);
    if (u) {
      setInspect(u.id);
      return;
    }
    setAim(null);
    setInspect(null);
  };
  const chooseSkill = (k: Skill) => {
    if (!unit || !canUse(unit, k)) return;
    if (k.aim === "self") {
      doAct({ t: "skill", unit: unit.id, skill: k.id });
      setAim(null);
    } else setAim(aim === k.id ? null : k.id);
  };

  const header = (
    <header className={cn("flex shrink-0 items-center gap-2 border-b border-white/10 px-3 text-white", mobile ? "pt-safe-3 pb-2" : "h-12")}>
      <button onClick={() => (mode === "menu" ? onBack() : leave())} className="grid size-9 place-items-center rounded-full hover:bg-white/10" aria-label="Back">
        <ArrowLeft className="size-5" />
      </button>
      <span className="text-lg">🦸</span>
      <span className="font-black">Cul-de-Sac Heroes</span>
      {state && mode === "battle" && (
        <span className="ml-auto text-sm text-white/70">
          Wave {state.wave}/{MAX_WAVE} · Round {state.round} · {state.score} pts
        </span>
      )}
    </header>
  );
  const shell = "flex h-full min-h-0 flex-col bg-[#0d1424] text-white";

  // ---------------- menu
  if (mode === "menu")
    return (
      <div className={shell}>
        {header}
        <div className="grid flex-1 place-items-center overflow-y-auto p-6">
          <div className="w-full max-w-sm text-center">
            <div className="text-7xl">🫖⚡🍡🌀</div>
            <h1 className="mt-2 text-3xl font-black">Cul-de-Sac Heroes</h1>
            <p className="mt-2 text-white/75">Four kids in homemade hero gear defend the street from rogue yard machines. Turn-based co-op tactics — {MAX_WAVE} waves and a Mega Mower boss.</p>
            <div className="mt-6 space-y-2">
              <button onClick={() => setMode("solo")} className="flex w-full items-center justify-center gap-2 rounded-full bg-white py-3 font-black text-black">
                <Swords className="size-5" /> Solo squad
              </button>
              <button onClick={() => enter(newRoomCode())} className="flex w-full items-center justify-center gap-2 rounded-full bg-[#7c5cff] py-3 font-black">
                <Users className="size-5" /> Co-op with friends (2–4)
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
            <p className="mt-4 text-xs text-white/50">Best score: {localBest("heroes")}</p>
          </div>
        </div>
      </div>
    );

  // ---------------- solo squad pick
  if (mode === "solo")
    return (
      <div className={shell}>
        {header}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mx-auto max-w-lg">
            <h2 className="text-xl font-black">Pick your squad (up to 3)</h2>
            <p className="text-sm text-white/60">You control every hero. Tap to add or remove.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {KINDS.map((k) => {
                const on = squad.includes(k);
                return (
                  <button
                    key={k}
                    onClick={() => setSquad((s) => (s.includes(k) ? (s.length > 1 ? s.filter((x) => x !== k) : s) : s.length < 3 ? [...s, k] : s))}
                    className={cn("rounded-2xl p-3 text-left transition", on ? "bg-[#7c5cff]/40 ring-2 ring-[#7c5cff]" : "bg-white/5 hover:bg-white/10")}
                  >
                    <HeroCard kind={k} />
                  </button>
                );
              })}
            </div>
            <button onClick={startSolo} className="mt-5 w-full rounded-full bg-white py-3 font-black text-black">
              Start battle
            </button>
          </div>
        </div>
      </div>
    );

  // ---------------- lobby
  if (mode === "lobby")
    return (
      <div className={shell}>
        {header}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mx-auto grid max-w-3xl gap-4 md:grid-cols-[1fr_300px]">
            <div>
              <h2 className="text-xl font-black">Choose your hero</h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {KINDS.map((k) => (
                  <button key={k} onClick={() => pickHero(k)} className={cn("rounded-2xl p-3 text-left transition", picks[me] === k ? "bg-[#7c5cff]/40 ring-2 ring-[#7c5cff]" : "bg-white/5 hover:bg-white/10")}>
                    <HeroCard kind={k} />
                  </button>
                ))}
              </div>
              <h3 className="mt-5 text-sm font-bold tracking-widest text-white/60 uppercase">Party ({Math.min(players.length, 4)}/4)</h3>
              <ul className="mt-2 space-y-1.5">
                {players.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
                    <span className="text-xl">{HEROES[picks[p.id] ?? "kettle"].emoji}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{p.name}{p.id === me ? " (you)" : ""}</span>
                    {i === 0 && <span className="text-xs text-white/50">host</span>}
                    {i >= 4 && <span className="text-xs text-white/50">watching</span>}
                  </li>
                ))}
              </ul>
              {room?.isHost() ? (
                <button onClick={startRoom} className="mt-4 w-full rounded-full bg-white py-3 font-black text-black">
                  Start battle{players.length < 2 ? " (solo in room)" : ""}
                </button>
              ) : (
                <p className="mt-4 text-center text-sm text-white/60">Waiting for the host to start…</p>
              )}
            </div>
            {room && <RoomInvite game="heroes" code={room.code} />}
          </div>
        </div>
      </div>
    );

  // ---------------- battle
  if (!state) return <div className={shell}>{header}</div>;
  const over = state.phase !== "heroes";
  const waiting = waitingOn(state);
  const isMine = (u: Unit) => u.team === "hero" && u.owner === me;
  const insp = inspect ? byId(state, inspect) : undefined;
  const isHost = !room || room.isHost();

  return (
    <div className={shell}>
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 p-3 md:flex-row md:items-start">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
              {Array.from(new Set<string>(party.map((p) => p.player))).map((id: string) => (
                <span key={id} className={cn("flex items-center gap-1 rounded-full px-2.5 py-1", waiting.includes(id) ? "bg-white/10" : "bg-emerald-500/20 text-emerald-200")}>
                  {!waiting.includes(id) && !over && <Check className="size-3" />}
                  {names[id] ?? "Player"}
                  {id === me ? " (you)" : ""}
                </span>
              ))}
            </div>
            <div className="mx-auto w-full max-w-[680px] rounded-2xl bg-[#1d2b45] p-1.5 shadow-2xl sm:p-2" onMouseLeave={() => undefined}>
              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${W}, minmax(0, 1fr))` }}>
                {Array.from({ length: W * H }, (_, i) => {
                  const x = i % W;
                  const y = Math.floor(i / W);
                  const u = state.units.find((q) => q.hp > 0 && q.x === x && q.y === y);
                  const canMove = moves.some((m) => m.x === x && m.y === y);
                  const tgt = targets.find((m) => m.x === x && m.y === y);
                  const friendly = skill && (skill.heal || skill.shield);
                  return (
                    <button
                      key={i}
                      onClick={() => clickCell(x, y)}
                      className={cn(
                        "relative aspect-square rounded-md text-center transition",
                        (x + y) % 2 ? "bg-[#26375a]" : "bg-[#2b3e66]",
                        canMove && "bg-sky-500/50 ring-1 ring-sky-300",
                        tgt && (friendly ? "bg-emerald-500/50 ring-2 ring-emerald-300" : "bg-rose-500/50 ring-2 ring-rose-300"),
                        u && sel === u.id && "ring-2 ring-yellow-300",
                      )}
                      aria-label={u ? u.name : `Tile ${x + 1},${y + 1}`}
                    >
                      {u && (
                        <>
                          <span className={cn("absolute inset-0 grid place-items-center text-[min(7vw,2.2rem)] leading-none sm:text-3xl", u.team === "foe" && "-scale-x-100")}>{u.emoji}</span>
                          {u.stun > 0 && <span className="absolute top-0 right-0 text-xs">💫</span>}
                          {u.shield > 0 && <span className="absolute top-0 left-0 text-xs">🛡️</span>}
                          {isMine(u) && !(u.done || (u.moved && u.acted)) && <span className="absolute bottom-1.5 left-0.5 size-1.5 rounded-full bg-yellow-300" />}
                          <span className="absolute right-0.5 bottom-0.5 left-0.5 h-1 overflow-hidden rounded-full bg-black/50">
                            <span className={cn("block h-full", u.team === "hero" ? "bg-emerald-400" : "bg-rose-400")} style={{ width: `${(u.hp / u.max) * 100}%` }} />
                          </span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            {err && <p className="mt-2 text-center text-sm text-rose-300">{err}</p>}

            {over ? (
              <div className="mt-4 rounded-2xl bg-white/10 p-4 text-center">
                <div className="text-3xl font-black">{state.phase === "won" ? "🎉 Neighborhood saved!" : "💀 Game over"}</div>
                <p className="mt-1 text-white/80">
                  Score {state.score} · {state.kills} machines scrapped · best {Math.max(localBest("heroes"), state.score)}
                </p>
                <div className="mt-3 flex justify-center gap-2">
                  {isHost ? (
                    <>
                      <button onClick={room ? startRoom : startSolo} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 font-bold text-black">
                        <RotateCcw className="size-4" /> Play again
                      </button>
                      {room && (
                        <button onClick={backToLobby} className="rounded-full bg-white/15 px-5 py-2.5 font-bold">
                          Lobby
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="text-sm text-white/60">Waiting for the host…</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-3 rounded-2xl bg-white/5 p-3">
                {unit && isMine(unit) ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{unit.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-bold">{unit.name}</div>
                        <div className="text-xs text-white/60">
                          HP {unit.hp}/{unit.max}
                          {unit.shield ? ` · 🛡️${unit.shield}` : ""} · Hype {unit.hype}%
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/40">
                          <div className="h-full bg-amber-400" style={{ width: `${unit.hype}%` }} />
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                      <button
                        disabled={unit.moved || unit.done}
                        onClick={() => setAim(aim === "move" ? null : "move")}
                        className={cn("rounded-xl px-2 py-2 text-sm font-bold disabled:opacity-35", aim === "move" ? "bg-sky-500" : "bg-white/10")}
                      >
                        👣 Move
                      </button>
                      {skillsOf(unit).map((k) => {
                        const ok = canUse(unit, k);
                        const cd = unit.cds[k.id] ?? 0;
                        return (
                          <button
                            key={k.id}
                            disabled={!ok}
                            title={k.info}
                            onClick={() => chooseSkill(k)}
                            className={cn("rounded-xl px-2 py-2 text-left text-sm font-bold disabled:opacity-35", aim === k.id ? "bg-rose-500" : k.ult ? "bg-amber-500/30" : "bg-white/10")}
                          >
                            {k.ult ? "★ " : ""}
                            {k.name}
                            {cd > 0 && <span className="ml-1 text-xs font-normal opacity-70">({cd})</span>}
                          </button>
                        );
                      })}
                    </div>
                    {(skill || aim === "move") && <p className="mt-2 text-xs text-white/70">{skill ? skill.info : "Tap a highlighted tile to walk there."}</p>}
                  </>
                ) : (
                  <p className="text-sm text-white/70">
                    {mine.length === 0 ? "You're out — your team fights on." : insp ? "" : "Tap one of your heroes to give orders. Tap a machine to inspect it."}
                  </p>
                )}
                {insp && (
                  <p className="mt-1 text-sm text-white/80">
                    {insp.emoji} <b>{insp.name}</b> — HP {insp.hp}/{insp.max}
                    {insp.team === "foe" ? ` · hits for ~${FOES[insp.kind as FoeKind].dmg}, range ${FOES[insp.kind as FoeKind].range}${FOES[insp.kind as FoeKind].armor ? `, armor ${FOES[insp.kind as FoeKind].armor}` : ""}` : insp.owner ? ` · ${names[insp.owner] ?? ""}` : ""}
                  </p>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <button
                    disabled={!myTurnLeft}
                    onClick={() => doAct({ t: "end" })}
                    className="flex-1 rounded-full bg-white py-2.5 font-black text-black disabled:opacity-40"
                  >
                    {myTurnLeft ? "End my turn" : waiting.length ? `Waiting for ${waiting.map((id) => names[id] ?? "player").join(", ")}…` : "…"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="md:w-72">
            <div className="rounded-2xl bg-white/5 p-3">
              <div className="mb-1 text-xs font-bold tracking-widest text-white/50 uppercase">Heroes</div>
              <ul className="space-y-1">
                {state.units
                  .filter((u) => u.team === "hero")
                  .map((u) => (
                    <li key={u.id} className={cn("flex items-center gap-2 text-sm", u.hp <= 0 && "opacity-40")}>
                      <span>{u.emoji}</span>
                      <span className="min-w-0 flex-1 truncate">{u.owner ? names[u.owner] ?? u.name : u.name}</span>
                      <span className="text-xs text-white/60">
                        {u.hp}/{u.max}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
            <div className="mt-3 max-h-48 overflow-y-auto rounded-2xl bg-black/30 p-3 text-xs leading-relaxed text-white/80">
              {[...state.log].reverse().map((l, i) => (
                <div key={i} className={i === 0 ? "font-semibold text-white" : ""}>
                  {l}
                </div>
              ))}
            </div>
            {room && (
              <div className="mt-3">
                <RoomInvite game="heroes" code={room.code} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroCard({ kind }: { kind: HeroKind }) {
  const k = HEROES[kind];
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-3xl">{k.emoji}</span>
        <div className="font-black">{k.name}</div>
      </div>
      <p className="mt-1 text-xs text-white/70">{k.blurb}</p>
      <p className="mt-1 text-[11px] text-white/45">
        HP {k.hp} · Move {k.move}
      </p>
    </div>
  );
}
