"use client";

// Beat Battle versus rooms over Supabase Realtime (same shape as Neon Streets' net.ts).
// Room = channel "beat-<CODE>". The host picks the song and starts the round; everyone plays the
// same chart at the same time and broadcasts score/combo ~5×/s so the HUD can show a live race.

import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Song } from "./songs";

export type BeatPeer = { id: string; name: string; joined: number; score: number; combo: number; acc: number; misses: number; done: boolean; died: boolean; seen: number };
/** what the host sends so everyone loads the same chart (only server/public URLs travel) */
export type RoomSong = Pick<Song, "id" | "title" | "credit" | "diff" | "chart" | "inst" | "voices" | "color" | "source"> & { communityId?: string };
export type StartMsg = { song: RoomSong; at: number; round: number };
export type ScoreMsg = { id: string; score: number; combo: number; acc: number; misses: number; done: boolean; died: boolean };

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const newBeatCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => ALPHA[b % ALPHA.length]).join("");
export const validBeatCode = (c: string) => /^[A-Z2-9]{6}$/.test(c);
/** object URLs only exist on the device that made them — those songs can't be played together */
export const shareableSong = (s: Song) => /^https?:/i.test(s.chart) || s.chart.startsWith("/");

export type BeatNet = {
  code: string;
  me: string;
  peers: Map<string, BeatPeer>;
  isHost: () => boolean;
  /** host: everyone loads this song and starts together */
  start: (song: RoomSong, inMs?: number) => void;
  score: (s: Omit<ScoreMsg, "id">) => void;
  on: (h: { start?: (m: StartMsg) => void; peers?: () => void; score?: () => void }) => void;
  leave: () => void;
  status: () => "connecting" | "live" | "error";
};

export function joinBeatRoom(code: string, me: string, name: string): BeatNet {
  const peers = new Map<string, BeatPeer>();
  const joined = Date.now();
  let st: "connecting" | "live" | "error" = "connecting";
  let handlers: Parameters<BeatNet["on"]>[0] = {};
  let round = 0;
  const ch: RealtimeChannel = supabase.channel(`beat-${code}`, { config: { broadcast: { self: false, ack: false }, presence: { key: me } } });

  const peer = (id: string): BeatPeer => {
    let p = peers.get(id);
    if (!p) {
      p = { id, name: "Player", joined: Date.now(), score: 0, combo: 0, acc: 100, misses: 0, done: false, died: false, seen: Date.now() };
      peers.set(id, p);
    }
    return p;
  };

  ch.on("broadcast", { event: "score" }, ({ payload }) => {
    const s = payload as ScoreMsg;
    if (!s?.id || s.id === me) return;
    const p = peer(s.id);
    Object.assign(p, { score: s.score, combo: s.combo, acc: s.acc, misses: s.misses, done: s.done, died: s.died, seen: Date.now() });
    handlers.score?.();
  })
    .on("broadcast", { event: "start" }, ({ payload }) => {
      const m = payload as StartMsg;
      if (!m?.song) return;
      round = m.round;
      for (const p of peers.values()) Object.assign(p, { score: 0, combo: 0, acc: 100, misses: 0, done: false, died: false });
      handlers.start?.(m);
    })
    .on("presence", { event: "sync" }, () => {
      const state = ch.presenceState<{ name: string; joined: number }>();
      const live = new Set(Object.keys(state));
      for (const [id, metas] of Object.entries(state)) {
        const p = peer(id);
        p.name = metas[0]?.name || p.name;
        p.joined = metas[0]?.joined ?? p.joined;
      }
      for (const id of [...peers.keys()]) if (!live.has(id)) peers.delete(id);
      handlers.peers?.();
    });

  void ch.subscribe((s) => {
    if (s === "SUBSCRIBED") {
      st = "live";
      void ch.track({ name, joined });
    } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") st = "error";
    handlers.peers?.();
  });

  // earliest member in the room hosts
  const isHost = () => ![...peers.values()].some((p) => p.id !== me && p.joined < joined);

  return {
    code,
    me,
    peers,
    isHost,
    start: (song, inMs = 4000) => {
      round++;
      void ch.send({ type: "broadcast", event: "start", payload: { song, at: Date.now() + inMs, round } satisfies StartMsg });
    },
    score: (s) => void ch.send({ type: "broadcast", event: "score", payload: { ...s, id: me } satisfies ScoreMsg }),
    on: (h) => {
      handlers = { ...handlers, ...h };
    },
    leave: () => void supabase.removeChannel(ch),
    status: () => st,
  };
}
