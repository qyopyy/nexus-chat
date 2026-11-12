"use client";

import { useEffect } from "react";
import { supabase, errorText } from "./supabase";
import { useApp } from "@/store/app";
import { getDeviceLocation, requestLocationPermission, watchDeviceLocation, type DeviceLocation } from "./location";
import { isNativeApp } from "./useMobile";
import { thisDeviceId, type Handset } from "./handset";
import { loadFeatureFlags } from "./featureFlags";

const SHARE_KEY = "nexus:locator-share";

export function locatorOptIn() {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(SHARE_KEY) === "1";
}

export async function setLocatorOptIn(on: boolean) {
  const userId = useApp.getState().userId;
  if (!userId) throw new Error("Sign in required");
  if (on) {
    const flags = await loadFeatureFlags();
    if (!flags.locator) throw new Error("Locator is turned off");
    const perm = await requestLocationPermission();
    if (perm === "denied") throw new Error("Location permission was denied");
    await getDeviceLocation({ highAccuracy: true });
  }
  localStorage.setItem(SHARE_KEY, on ? "1" : "0");
  const patch = on
    ? { share_location: true }
    : { share_location: false, lat: null, lng: null, accuracy_m: null, loc_at: null };
  const { error } = await supabase.from("nexus_handsets").update(patch).eq("user_id", userId).eq("device_id", thisDeviceId());
  if (error) throw new Error(errorText(error));
}

export async function setPlaceAlerts(on: boolean) {
  const userId = useApp.getState().userId;
  if (!userId) return;
  await supabase.from("nexus_handsets").update({ place_alerts: on }).eq("user_id", userId).eq("device_id", thisDeviceId());
}

async function writeLocation(loc: DeviceLocation) {
  const userId = useApp.getState().userId;
  if (!userId || !locatorOptIn()) return;
  await supabase
    .from("nexus_handsets")
    .update({
      share_location: true,
      lat: loc.lat,
      lng: loc.lng,
      accuracy_m: loc.accuracy,
      loc_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("device_id", thisDeviceId());
}

/** Foreground on the web. The installed app can keep the watch running with the system location permission. */
export function useLocatorReporter(userId: string | null) {
  useEffect(() => {
    if (!userId || !locatorOptIn()) return;
    let stop = () => {};
    let timer = 0;
    const native = isNativeApp();
    void watchDeviceLocation((loc) => void writeLocation(loc), () => undefined, { highAccuracy: true }).then((handle) => {
      stop = handle.stop;
    });
    if (!native) {
      const tick = () => {
        if (document.hidden) return;
        void getDeviceLocation({ highAccuracy: true }).then((loc) => writeLocation(loc)).catch(() => undefined);
      };
      tick();
      timer = window.setInterval(tick, 45_000);
      const onHide = () => {
        if (document.hidden) stop();
      };
      document.addEventListener("visibilitychange", onHide);
      return () => {
        document.removeEventListener("visibilitychange", onHide);
        window.clearInterval(timer);
        stop();
      };
    }
    return () => {
      window.clearInterval(timer);
      stop();
    };
  }, [userId]);
}

export async function myDevices() {
  const userId = useApp.getState().userId;
  if (!userId) return [] as Handset[];
  const { data, error } = await supabase.from("nexus_handsets").select("*").eq("user_id", userId).order("last_seen", { ascending: false });
  if (error) throw new Error(errorText(error));
  return (data ?? []) as Handset[];
}

export async function renameDevice(deviceId: string, label: string) {
  const userId = useApp.getState().userId;
  if (!userId) return;
  const { error } = await supabase.from("nexus_handsets").update({ label: label.trim().slice(0, 40) || "This device" }).eq("user_id", userId).eq("device_id", deviceId);
  if (error) throw new Error(errorText(error));
}

export async function setDeviceFlags(deviceId: string, patch: { lost?: boolean; trusted?: boolean; lost_message?: string | null }) {
  const userId = useApp.getState().userId;
  if (!userId) return;
  const { error } = await supabase.from("nexus_handsets").update(patch).eq("user_id", userId).eq("device_id", deviceId);
  if (error) throw new Error(errorText(error));
}

export async function deviceHistory(deviceId: string) {
  const userId = useApp.getState().userId;
  if (!userId) return [];
  const { data } = await supabase
    .from("nexus_locator_points")
    .select("id, lat, lng, accuracy_m, recorded_at")
    .eq("user_id", userId)
    .eq("device_id", deviceId)
    .order("recorded_at", { ascending: false })
    .limit(40);
  return (data ?? []) as { id: number; lat: number; lng: number; accuracy_m: number | null; recorded_at: string }[];
}

export async function clearDeviceHistory(deviceId: string) {
  const userId = useApp.getState().userId;
  if (!userId) return;
  await supabase.from("nexus_locator_points").delete().eq("user_id", userId).eq("device_id", deviceId);
  await supabase.from("nexus_handsets").update({ lat: null, lng: null, accuracy_m: null, loc_at: null }).eq("user_id", userId).eq("device_id", deviceId);
}

export async function locatorAlerts() {
  const userId = useApp.getState().userId;
  if (!userId) return [];
  const { data } = await supabase.from("nexus_locator_alerts").select("id, device_id, place_name, kind, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(20);
  return (data ?? []) as { id: number; device_id: string; place_name: string; kind: "arrive" | "leave"; created_at: string }[];
}

export async function startDeviceShare(deviceId: string, minutes: number) {
  const { data, error } = await supabase.rpc("nexus_locator_share_start", { p_device: deviceId, p_minutes: minutes });
  if (error) throw new Error(errorText(error));
  return data as { id: string; token: string; expires_at: string };
}

export async function openDeviceShare(token: string) {
  const { data, error } = await supabase.rpc("nexus_locator_share_open", { p_token: token });
  if (error) throw new Error(errorText(error));
  return data as { ok: boolean; label?: string; model?: string | null; lat?: number; lng?: number; accuracy_m?: number | null; loc_at?: string; expires_at?: string };
}

export function subscribeDevices(userId: string, onChange: () => void) {
  const channel = supabase
    .channel(`locator:${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "nexus_handsets", filter: `user_id=eq.${userId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "nexus_locator_alerts", filter: `user_id=eq.${userId}` }, onChange)
    .subscribe();
  return () => void supabase.removeChannel(channel);
}
