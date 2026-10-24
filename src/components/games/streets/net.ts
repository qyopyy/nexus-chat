"use client";

// Neon Streets multiplayer over Supabase Realtime broadcast + presence.
// Room = channel "streets-<CODE>". Everyone sends their car ~12×/s; others interpolate.
// The earliest player in the room is host (starts races).

import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type CarState = { id: string; x: number; y: number; a: number; v: number; w: number; t: number };
export type Peer = { id: string; name: string; color: string; joined: number; prev?: CarState; last?: CarState; seen: number; honk?: number; emote?: { text: string; t: number } };
export type RaceMsg = { seed: number; at: number; laps: number };
export type FinishMsg = { id: string; ms: number };

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => ALPHA[b % ALPHA.length]).join("");
export const validCode = (c: string) => /^[A-Z2-9]{6}$/.test(c);

export type Net = {
  code: string;
  me: string;
  peers: Map<string, Peer>;
  isHost: () => boolean;
  send: (s: Omit<CarState, "id" | "t">) => void;
  race: (r: RaceMsg) => void;
  finish: (ms: number) => void;
  honk: () => void;
  emote: (text: string) => void;
  on: (h: { race?: (r: RaceMsg) => void; finish?: (f: FinishMsg) => void; peers?: () => void }) => void;
  leave: () => void;
  status: () => "connecting" | "live" | "error";
};

export function joinRoom(code: string, me: string, name: string, color: string): Net {
  const peers = new Map<string, Peer>();
  const joined = Date.now();
  let st: "connecting" | "live" | "error" = "connecting";
  let handlers: Parameters<Net["on"]>[0] = {};
  const ch: RealtimeChannel = supabase.channel(`streets-${code}`, { config: { broadcast: { self: false, ack: false }, presence: { key: me } } });

  const peer = (id: string) => {
    let p = peers.get(id);
    if (!p) {
      p = { id, name: "Player", color: "#00e5ff", joined: Date.now(), seen: Date.now() };
      peers.set(id, p);
    }
    return p;
  };

  ch.on("broadcast", { event: "s" }, ({ payload }) => {
    const s = payload as CarState;
    if (!s?.id || s.id === me) return;
    const p = peer(s.id);
    p.prev = p.last ? { ...p.last, t: p.seen } : { ...s, t: performance.now() };
    p.last = s;
    p.seen = performance.now();
  })
    .on("broadcast", { event: "race" }, ({ payload }) => handlers.race?.(payload as RaceMsg))
    .on("broadcast", { event: "fin" }, ({ payload }) => handlers.finish?.(payload as FinishMsg))
    .on("broadcast", { event: "honk" }, ({ payload }) => {
      const p = peers.get((payload as { id: string }).id);
      if (p) p.honk = performance.now();
    })
    .on("broadcast", { event: "emote" }, ({ payload }) => {
      const e = payload as { id: string; text: string };
      const p = peers.get(e.id);
      if (p) p.emote = { text: e.text.slice(0, 4), t: performance.now() };
    })
    .on("presence", { event: "sync" }, () => {
      const state = ch.presenceState() as unknown as Record<string, { name: string; color: string; joined: number }[]>;
      const ids = new Set(Object.keys(state));
      for (const id of [...peers.keys()]) if (!ids.has(id)) peers.delete(id);
      for (const [id, metas] of Object.entries(state)) {
        if (id === me) continue;
        const m = metas[0];
        const p = peer(id);
        p.name = m?.name ?? "Player";
        p.color = m?.color ?? "#00e5ff";
        p.joined = m?.joined ?? Date.now();
      }
      handlers.peers?.();
    })
    .subscribe(async (s) => {
      if (s === "SUBSCRIBED") {
        st = "live";
        await ch.track({ name, color, joined });
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
    race: (r) => void ch.send({ type: "broadcast", event: "race", payload: r }),
    finish: (ms) => void ch.send({ type: "broadcast", event: "fin", payload: { id: me, ms } }),
    honk: () => void ch.send({ type: "broadcast", event: "honk", payload: { id: me } }),
    emote: (text) => void ch.send({ type: "broadcast", event: "emote", payload: { id: me, text } }),
    on: (h) => (handlers = { ...handlers, ...h }),
    leave: () => {
      void ch.untrack().catch(() => {});
      void supabase.removeChannel(ch);
    },
    status: () => st,
  };
}

/** where to draw a remote car right now (interpolated between its last two updates) */
export function peerPose(p: Peer, now: number) {
  if (!p.last) return null;
  const prev = p.prev ?? p.last;
  const span = Math.max(40, p.seen - (prev.t ?? p.seen));
  const k = Math.min(1.6, (now - p.seen) / span + 0.5); // slight extrapolation keeps it smooth
  let da = p.last.a - prev.a;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da < -Math.PI) da += 2 * Math.PI;
  return { x: prev.x + (p.last.x - prev.x) * k, y: prev.y + (p.last.y - prev.y) * k, a: prev.a + da * k, v: p.last.v, w: p.last.w, stale: now - p.seen > 4000 };
}
