"use client";

import { useEffect } from "react";
import { supabase } from "./supabase";
import { useApp } from "@/store/app";

export type HandsetPlatform = "ios" | "ipados" | "macos" | "android" | "web" | "desktop";

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
  platform?: HandsetPlatform | null;
  model?: string | null;
  os_name?: string | null;
  storage_bytes?: number | null;
  share_location?: boolean;
  lat?: number | null;
  lng?: number | null;
  accuracy_m?: number | null;
  loc_at?: string | null;
  lost?: boolean;
  trusted?: boolean;
  lost_message?: string | null;
  control_enabled?: boolean;
  focus_until?: string | null;
  place_alerts?: boolean;
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

export function detectPlatform(): HandsetPlatform {
  if (typeof navigator === "undefined") return "web";
  const ua = navigator.userAgent;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
  if (/Electron|NexusDesktop/i.test(ua)) return "desktop";
  if (cap?.isNativePlatform?.() && cap.getPlatform?.() === "ios") return /iPad/i.test(ua) ? "ipados" : "ios";
  if (cap?.isNativePlatform?.() && cap.getPlatform?.() === "android") return "android";
  if (/iPad/i.test(ua)) return "ipados";
  if (/iPhone|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "web";
}

export function platformLabel(platform?: string | null) {
  if (platform === "ios") return "iPhone app";
  if (platform === "ipados") return "iPad app";
  if (platform === "macos") return "Mac app";
  if (platform === "android") return "Android app";
  if (platform === "desktop") return "Desktop app";
  return "Web";
}

type DeviceInfo = { model?: string; name?: string; operatingSystem?: string; osVersion?: string };

async function deviceFacts() {
  const platform = detectPlatform();
  const cap = (window as unknown as { Capacitor?: { Plugins?: { Device?: { getInfo?: () => Promise<DeviceInfo> } } } }).Capacitor;
  try {
    const info = await cap?.Plugins?.Device?.getInfo?.();
    if (!info) return { platform, model: null as string | null, os_name: null as string | null };
    const os = [info.operatingSystem, info.osVersion].filter(Boolean).join(" ");
    return { platform, model: info.model || info.name || null, os_name: os || null };
  } catch {
    return { platform, model: null as string | null, os_name: null as string | null };
  }
}

async function storageBytes() {
  try {
    const est = await navigator.storage?.estimate?.();
    return typeof est?.usage === "number" ? Math.round(est.usage) : null;
  } catch {
    return null;
  }
}

async function writeHandset(battery: number | null, charging: boolean, full_in_sec: number | null) {
  const userId = useApp.getState().userId;
  if (!userId) return;
  const facts = await deviceFacts();
  const patch = {
    kind: isPhoneDevice() ? "phone" as const : "computer" as const,
    battery,
    charging,
    full_in_sec,
    platform: facts.platform,
    model: facts.model,
    os_name: facts.os_name,
    storage_bytes: await storageBytes(),
    last_seen: new Date().toISOString(),
  };
  const device_id = thisDeviceId();
  const updated = await supabase.from("nexus_handsets").update(patch).eq("user_id", userId).eq("device_id", device_id).select("device_id");
  if (updated.error) return;
  if ((updated.data ?? []).length > 0) return;
  await supabase.from("nexus_handsets").insert({
    ...patch,
    user_id: userId,
    device_id,
    label: facts.model || (patch.kind === "phone" ? "Phone" : "This browser"),
  });
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
    let dead = false;
    let manager: BatteryManager | null = null;
    let battery: number | null = null;
    let charging = false;
    let full_in_sec: number | null = null;

    const push = async () => {
      if (dead) return;
      await writeHandset(battery, charging, full_in_sec);
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
  await writeHandset(row.battery, row.charging, row.full_in_sec);
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
