"use client";

/**
 * Classic Strike multiplayer — Supabase Realtime broadcast + presence.
 * Channel: classicstrike-<CODE>. Pose ~12×/s; host drives round phase.
 */

import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type Team = "T" | "CT";

export type PoseState = {
  id: string;
  x: number;
  y: number;
  a: number;
  hp: number;
  armor: number;
  team: Team;
  wep: string;
  alive: boolean;
  t: number;
};

export type Peer = {
  id: string;
  name: string;
  team: Team;
  joined: number;
  prev?: PoseState;
  last?: PoseState;
  seen: number;
};

export type ShotMsg = { id: string; x: number; y: number; a: number; team: Team; wep: string; dmg: number };
export type HitMsg = { from: string; to: string; dmg: number };
export type PlantMsg = { id: string; x: number; y: number; t: number };
export type DefuseMsg = { id: string };
export type RoundMsg = {
  round: number;
  phase: "buy" | "live" | "planted" | "over";
  phaseT: number;
  bombPlanted: boolean;
  bombX: number;
  bombY: number;
  bombT: number;
  seed: number;
};
export type TeamMsg = { id: string; team: Team };

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => ALPHA[b % ALPHA.length]).join("");
export const validCode = (c: string) => /^[A-Z2-9]{6}$/.test(c);

export type CsNet = {
  code: string;
  me: string;
  peers: Map<string, Peer>;
  isHost: () => boolean;
  send: (s: Omit<PoseState, "id" | "t">) => void;
  shot: (s: Omit<ShotMsg, "id">) => void;
  hit: (to: string, dmg: number) => void;
  plant: (x: number, y: number, t: number) => void;
  defuse: () => void;
  round: (r: RoundMsg) => void;
  setTeam: (team: Team) => void;
  on: (h: {
    shot?: (s: ShotMsg) => void;
    hit?: (h: HitMsg) => void;
    plant?: (p: PlantMsg) => void;
    defuse?: (d: DefuseMsg) => void;
    round?: (r: RoundMsg) => void;
    team?: (t: TeamMsg) => void;
    peers?: () => void;
  }) => void;
  leave: () => void;
  status: () => "connecting" | "live" | "error";
};

export function joinRoom(code: string, me: string, name: string, team: Team = "T"): CsNet {
  const peers = new Map<string, Peer>();
  const joined = Date.now();
  let myTeam = team;
  let st: "connecting" | "live" | "error" = "connecting";
  let handlers: Parameters<CsNet["on"]>[0] = {};
  const ch: RealtimeChannel = supabase.channel(`classicstrike-${code}`, {
    config: { broadcast: { self: false, ack: false }, presence: { key: me } },
  });

  const peer = (id: string) => {
    let p = peers.get(id);
    if (!p) {
      p = { id, name: "Player", team: "T", joined: Date.now(), seen: Date.now() };
      peers.set(id, p);
    }
    return p;
  };

  const track = () => void ch.track({ name, team: myTeam, joined });

  ch.on("broadcast", { event: "s" }, ({ payload }) => {
    const s = payload as PoseState;
    if (!s?.id || s.id === me) return;
    const p = peer(s.id);
    p.team = s.team;
    p.prev = p.last ? { ...p.last, t: p.seen } : { ...s, t: performance.now() };
    p.last = s;
    p.seen = performance.now();
  })
    .on("broadcast", { event: "shot" }, ({ payload }) => handlers.shot?.(payload as ShotMsg))
    .on("broadcast", { event: "hit" }, ({ payload }) => handlers.hit?.(payload as HitMsg))
    .on("broadcast", { event: "plant" }, ({ payload }) => handlers.plant?.(payload as PlantMsg))
    .on("broadcast", { event: "defuse" }, ({ payload }) => handlers.defuse?.(payload as DefuseMsg))
    .on("broadcast", { event: "round" }, ({ payload }) => handlers.round?.(payload as RoundMsg))
    .on("broadcast", { event: "team" }, ({ payload }) => {
      const t = payload as TeamMsg;
      if (!t?.id || t.id === me) return;
      const p = peer(t.id);
      p.team = t.team;
      handlers.team?.(t);
      handlers.peers?.();
    })
    .on("presence", { event: "sync" }, () => {
      const state = ch.presenceState() as unknown as Record<string, { name: string; team: Team; joined: number }[]>;
      const ids = new Set(Object.keys(state));
      for (const id of [...peers.keys()]) if (!ids.has(id)) peers.delete(id);
      for (const [id, metas] of Object.entries(state)) {
        if (id === me) continue;
        const m = metas[0];
        const p = peer(id);
        p.name = m?.name ?? "Player";
        p.team = m?.team === "CT" ? "CT" : "T";
        p.joined = m?.joined ?? Date.now();
      }
      handlers.peers?.();
    })
    .subscribe(async (s) => {
      if (s === "SUBSCRIBED") {
        st = "live";
        await track();
        handlers.peers?.();
      } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") st = "error";
    });

  let lastSend = 0;
  return {
    code,
    me,
    peers,
    isHost: () => [...peers.values()].every((p) => p.joined > joined || (p.joined === joined && p.id > me)),
    send: (s) => {
      const now = performance.now();
      if (now - lastSend < 80 || st !== "live") return;
      lastSend = now;
      void ch.send({ type: "broadcast", event: "s", payload: { ...s, id: me, t: Date.now() } });
    },
    shot: (s) => void ch.send({ type: "broadcast", event: "shot", payload: { ...s, id: me } }),
    hit: (to, dmg) => void ch.send({ type: "broadcast", event: "hit", payload: { from: me, to, dmg } }),
    plant: (x, y, t) => void ch.send({ type: "broadcast", event: "plant", payload: { id: me, x, y, t } }),
    defuse: () => void ch.send({ type: "broadcast", event: "defuse", payload: { id: me } }),
    round: (r) => void ch.send({ type: "broadcast", event: "round", payload: r }),
    setTeam: (team) => {
      myTeam = team;
      void ch.send({ type: "broadcast", event: "team", payload: { id: me, team } });
      if (st === "live") void track();
    },
    on: (h) => (handlers = { ...handlers, ...h }),
    leave: () => {
      void ch.untrack().catch(() => {});
      void supabase.removeChannel(ch);
    },
    status: () => st,
  };
}

/** Interpolated remote pose for drawing / hit tests */
export function peerPose(p: Peer, now: number) {
  if (!p.last) return null;
  const prev = p.prev ?? p.last;
  const span = Math.max(40, p.seen - (prev.t ?? p.seen));
  const k = Math.min(1.6, (now - p.seen) / span + 0.5);
  let da = p.last.a - prev.a;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da < -Math.PI) da += 2 * Math.PI;
  return {
    x: prev.x + (p.last.x - prev.x) * k,
    y: prev.y + (p.last.y - prev.y) * k,
    a: prev.a + da * k,
    hp: p.last.hp,
    armor: p.last.armor,
    team: p.last.team,
    wep: p.last.wep,
    alive: p.last.alive,
    stale: now - p.seen > 4000,
  };
}
