"use client";

// Small multiplayer rooms for turn/round-based games over Supabase Realtime (broadcast + presence).
// Channel "<prefix>-<CODE>"; the player who joined first is the host.

import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type RoomPlayer = { id: string; name: string; joined: number };
export type Room = {
  code: string;
  me: string;
  players: () => RoomPlayer[];
  hostId: () => string;
  isHost: () => boolean;
  send: (event: string, payload: Record<string, unknown>) => void;
  on: (event: string, fn: (payload: Record<string, unknown> & { from: string }) => void) => void;
  onPlayers: (fn: (p: RoomPlayer[]) => void) => void;
  onReady: (fn: () => void) => void;
  leave: () => void;
};

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const newRoomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => ALPHA[b % ALPHA.length]).join("");
export const validRoomCode = (c: string) => /^[A-Z2-9]{6}$/.test(c);
export const roomLink = (code: string, game: string) => `${typeof window !== "undefined" ? window.location.origin : "https://nexusproject.cc"}/?play=${code}&g=${game}`;

export function openRoom(prefix: string, code: string, me: string, name: string, events: string[]): Room {
  const joined = Date.now();
  const handlers = new Map<string, ((p: Record<string, unknown> & { from: string }) => void)[]>();
  let playersFn: ((p: RoomPlayer[]) => void) | null = null;
  let readyFn: (() => void) | null = null;
  let list: RoomPlayer[] = [{ id: me, name, joined }];
  let ready = false;
  const ch: RealtimeChannel = supabase.channel(`${prefix}-${code}`, { config: { broadcast: { self: false, ack: false }, presence: { key: me } } });

  const sync = () => {
    const state = ch.presenceState() as unknown as Record<string, { name: string; joined: number }[]>;
    const next: RoomPlayer[] = Object.entries(state).map(([id, metas]) => ({ id, name: metas[0]?.name ?? "Player", joined: metas[0]?.joined ?? Date.now() }));
    if (!next.some((p) => p.id === me)) next.push({ id: me, name, joined });
    list = next.sort((a, b) => a.joined - b.joined || a.id.localeCompare(b.id));
    playersFn?.(list);
  };
  ch.on("presence", { event: "sync" }, sync);
  for (const event of events)
    ch.on("broadcast", { event }, ({ payload }) => {
      const p = payload as Record<string, unknown> & { from: string };
      if (!p || p.from === me) return;
      for (const fn of handlers.get(event) ?? []) fn(p);
    });
  ch.subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      await ch.track({ name, joined });
      ready = true;
      readyFn?.();
    }
  });

  return {
    code,
    me,
    players: () => list,
    hostId: () => list[0]?.id ?? me,
    isHost: () => (list[0]?.id ?? me) === me,
    send: (event, payload) => void ch.send({ type: "broadcast", event, payload: { ...payload, from: me } }),
    on: (event, fn) => handlers.set(event, [...(handlers.get(event) ?? []), fn]),
    onPlayers: (fn) => {
      playersFn = fn;
      fn(list);
    },
    onReady: (fn) => {
      readyFn = fn;
      if (ready) fn();
    },
    leave: () => {
      void ch.untrack().catch(() => {});
      void supabase.removeChannel(ch);
    },
  };
}
