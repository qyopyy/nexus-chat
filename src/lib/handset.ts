"use client";

import { useEffect } from "react";
import { supabase } from "./supabase";
import { useApp } from "@/store/app";

export type Handset = {
  user_id: string;
  device_id: string;
  label: string;
  kind: "phone" | "computer";
  battery: number | null;
  charging: boolean;
  full_in_sec: number | null;
  note: string | null;
  link_url: string | null;
  ping_at: string | null;
  last_seen: string;
};

const KEY = "nexus:device";

export function thisDeviceId() {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID().replace(/-/g, "");
    localStorage.setItem(KEY, id);
  }
  return id;
}

export function isPhoneDevice() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|Android|Mobile/i.test(navigator.userAgent);
}

type BatteryManager = {
  level: number;
  charging: boolean;
  chargingTime: number;
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
};

async function nativeBattery(): Promise<{ battery: number | null; charging: boolean } | null> {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { Device?: { getBatteryInfo: () => Promise<{ batteryLevel?: number; isCharging?: boolean }> } } } }).Capacitor;
  if (!cap?.isNativePlatform?.() || !cap.Plugins?.Device?.getBatteryInfo) return null;
  try {
    const info = await cap.Plugins.Device.getBatteryInfo();
    const level = typeof info.batteryLevel === "number" ? Math.round(info.batteryLevel * 100) : null;
    return { battery: level != null && level >= 0 && level <= 100 ? level : null, charging: !!info.isCharging };
  } catch {
    return null;
  }
}

async function readBattery(): Promise<{ battery: number | null; charging: boolean; full_in_sec: number | null; manager: BatteryManager | null }> {
  const native = await nativeBattery();
  if (native) return { ...native, full_in_sec: null, manager: null };
  const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> };
  if (typeof nav.getBattery !== "function") return { battery: null, charging: false, full_in_sec: null, manager: null };
  try {
    const manager = await nav.getBattery();
    const full = Number.isFinite(manager.chargingTime) && manager.chargingTime < 86400 ? Math.round(manager.chargingTime) : null;
    return { battery: Math.round(Math.max(0, Math.min(1, manager.level)) * 100), charging: !!manager.charging, full_in_sec: full, manager };
  } catch {
    return { battery: null, charging: false, full_in_sec: null, manager: null };
  }
}

/** Report this browser to the signed-in account. Phones include battery when the browser allows it. */
export function useHandsetReporter(userId: string | null) {
  useEffect(() => {
    if (!userId || typeof window === "undefined") return;
    const device_id = thisDeviceId();
    const kind = isPhoneDevice() ? "phone" : "computer";
    const label = kind === "phone" ? "Phone" : "This browser";
    let dead = false;
    let manager: BatteryManager | null = null;
    let battery: number | null = null;
    let charging = false;
    let full_in_sec: number | null = null;

    const push = async () => {
      if (dead) return;
      await supabase.from("nexus_handsets").upsert({
        user_id: userId,
        device_id,
        label,
        kind,
        battery,
        charging,
        full_in_sec,
        last_seen: new Date().toISOString(),
      });
    };

    const onBat = () => {
      if (!manager) return;
      battery = Math.round(Math.max(0, Math.min(1, manager.level)) * 100);
      charging = !!manager.charging;
      full_in_sec = Number.isFinite(manager.chargingTime) && manager.chargingTime < 86400 ? Math.round(manager.chargingTime) : null;
      void push();
    };

    void readBattery().then((row) => {
      battery = row.battery;
      charging = row.charging;
      full_in_sec = row.full_in_sec;
      manager = row.manager;
      manager?.addEventListener("levelchange", onBat);
      manager?.addEventListener("chargingchange", onBat);
      manager?.addEventListener("chargingtimechange", onBat);
      void push();
    });

    const timer = window.setInterval(() => void push(), 20000);
    const onVis = () => void push();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      dead = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
      manager?.removeEventListener("levelchange", onBat);
      manager?.removeEventListener("chargingchange", onBat);
      manager?.removeEventListener("chargingtimechange", onBat);
    };
  }, [userId]);
}

/** Read battery again and write this device's row. iPhone Safari leaves the level empty; the installed app can fill it. */
export async function refreshHandset() {
  const userId = useApp.getState().userId;
  if (!userId) return null;
  const row = await readBattery();
  await supabase.from("nexus_handsets").upsert({
    user_id: userId,
    device_id: thisDeviceId(),
    label: isPhoneDevice() ? "Phone" : "This browser",
    kind: isPhoneDevice() ? "phone" : "computer",
    battery: row.battery,
    charging: row.charging,
    full_in_sec: row.full_in_sec,
    last_seen: new Date().toISOString(),
  });
  return row;
}

export async function sendHandsetNote(note: string) {
  const userId = useApp.getState().userId;
  if (!userId) return;
  await supabase.from("nexus_handsets").update({ note: note.trim().slice(0, 280) || null }).eq("user_id", userId).eq("device_id", thisDeviceId());
}

export async function sendHandsetLink(url: string) {
  const userId = useApp.getState().userId;
  if (!userId) return;
  if (!/^https?:\/\//i.test(url)) throw new Error("Use a full http or https link");
  await supabase.from("nexus_handsets").update({ link_url: url.slice(0, 500) }).eq("user_id", userId).eq("device_id", thisDeviceId());
}

export async function pingOtherComputers() {
  const userId = useApp.getState().userId;
  if (!userId) return;
  await supabase.from("nexus_handsets").update({ ping_at: new Date().toISOString() }).eq("user_id", userId).eq("kind", "computer");
}

export async function clearHandsetLink() {
  const userId = useApp.getState().userId;
  if (!userId) return;
  await supabase.from("nexus_handsets").update({ link_url: null }).eq("user_id", userId).eq("device_id", thisDeviceId());
}

export async function forgetHandset(deviceId: string) {
  const userId = useApp.getState().userId;
  if (!userId) return;
  await supabase.from("nexus_handsets").delete().eq("user_id", userId).eq("device_id", deviceId);
}
