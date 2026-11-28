"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { supabase } from "./supabase";
import { cleanLive, isLiveKey, toMap, type LiveMap } from "./liveConfigCore";

// Live Control store: loads the owner's settings once, then follows changes over Supabase Realtime, so a change
// made in the admin panel shows up in every open app within a second, with no update to install.

type S = { map: LiveMap; ready: boolean };
export const useLive = create<S>(() => ({ map: {}, ready: false }));

let started = false;
let retry: ReturnType<typeof setTimeout> | null = null;

async function load() {
  const { data, error } = await supabase.from("live_config").select("key,value");
  if (error) return; // table not created yet: everything stays on its defaults
  useLive.setState({ map: toMap(data as { key: string; value: unknown }[]), ready: true });
}

export function startLiveConfig() {
  if (started || typeof window === "undefined") return;
  started = true;
  void load();
  const ch = supabase
    .channel("live_config")
    .on("postgres_changes", { event: "*", schema: "public", table: "live_config" }, (p) => {
      const row = (p.eventType === "DELETE" ? p.old : p.new) as { key?: string; value?: unknown } | null;
      if (!row?.key || !isLiveKey(row.key)) return;
      useLive.setState((s) => {
        const map = { ...s.map };
        if (p.eventType === "DELETE") delete map[row.key!];
        else map[row.key!] = cleanLive(row.key!, row.value);
        return { map, ready: true };
      });
    })
    .subscribe((status) => {
      if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") && !retry) {
        retry = setTimeout(() => {
          retry = null;
          void load(); // catch up on anything missed while offline
        }, 8000);
      }
    });
  window.addEventListener("online", () => void load());
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && void load());
  void ch;
}

/** React hook: start following and return the current map. */
export function useLiveMap(): LiveMap {
  useEffect(() => startLiveConfig(), []);
  return useLive((s) => s.map);
}

/** Owner only (the database refuses anyone else). */
export async function setLive(key: string, value: boolean | number | string): Promise<string | null> {
  if (!isLiveKey(key)) return "Unknown setting";
  const clean = cleanLive(key, value);
  const { error } = await supabase.from("live_config").upsert({ key, value: clean, updated_at: new Date().toISOString() });
  return error ? error.message : null;
}
