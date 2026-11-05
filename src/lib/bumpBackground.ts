"use client";

/**
 * Keeps Wump Live while backgrounded (Capacitor + UIBackgroundModes:location).
 * GPS watch for realtime moving pins + mandatory 5-minute safety republish.
 */

import { supabase } from "./supabase";
import { watchDeviceLocation, type LocationWatchHandle } from "./location";
import { bumpNearby, type BumpNearby, type BumpVisible } from "./bump";
import { isNativeApp } from "./useMobile";
import { haptic } from "./haptics";
import { useApp } from "@/store/app";
import { loadWumpPrivacyLocal } from "./wumpPrivacy";

type CapLN = {
  requestPermissions?: () => Promise<{ display?: string }>;
  schedule?: (o: { notifications: Record<string, unknown>[] }) => Promise<unknown>;
  createChannel?: (o: Record<string, unknown>) => Promise<unknown>;
};

/** Mandatory floor — refresh published pin at least every 5 minutes while Live */
export const WUMP_REFRESH_MS = 5 * 60_000;
/** Throttle continuous GPS watch publishes so we don't spam */
const WATCH_THROTTLE_MS = 8_000;

let watch: LocationWatchHandle | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let nearbyPoll: ReturnType<typeof setInterval> | null = null;
let autoStop: ReturnType<typeof setTimeout> | null = null;
let running = false;
let lastPublish = 0;
let knownNearby = new Set<string>();
let opts: {
  visible: BumpVisible;
  label: string | null;
  alerts: boolean;
  onNearby?: (rows: BumpNearby[]) => void;
  onLocation?: (lat: number, lng: number) => void;
} = { visible: "friends", label: null, alerts: true };

function ln(): CapLN | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: { Plugins?: { LocalNotifications?: CapLN } } }).Capacitor;
  return cap?.Plugins?.LocalNotifications ?? null;
}

async function publishQuiet(lat: number, lng: number, accuracy: number | null, force = false) {
  const now = Date.now();
  if (!force && now - lastPublish < WATCH_THROTTLE_MS) return;
  lastPublish = now;
  const priv = loadWumpPrivacyLocal();
  if (!priv.wump_share_enabled) return;
  await supabase.rpc("bump_publish", {
    p_lat: lat,
    p_lng: lng,
    p_accuracy: accuracy,
    p_visible: opts.visible,
    p_label: opts.label,
    p_precision: priv.wump_precision,
  });
  opts.onLocation?.(lat, lng);
}

async function notifyNearby(rows: BumpNearby[]) {
  if (!opts.alerts) return;
  const fresh = rows.filter((r) => !knownNearby.has(r.user_id));
  for (const r of rows) knownNearby.add(r.user_id);
  if (!fresh.length) return;
  haptic.medium();
  const profiles = useApp.getState().profiles;
  const names = fresh.slice(0, 3).map((r) => profiles[r.user_id]?.display_name || profiles[r.user_id]?.username || "Someone");
  const title = fresh.length === 1 ? `${names[0]} is nearby` : `${fresh.length} people nearby`;
  const body =
    fresh.length === 1
      ? `${Math.round(fresh[0].meters)} m away on Wump`
      : names.join(", ") + (fresh.length > 3 ? "…" : "");

  const api = ln();
  if (!api?.schedule) return;
  try {
    await api.requestPermissions?.();
    await api.createChannel?.({ id: "bump", name: "Wump nearby", importance: 4, vibration: true, sound: "default" });
    await api.schedule({
      notifications: [
        {
          id: 710_000 + (Date.now() % 10_000),
          title,
          body,
          schedule: { at: new Date(Date.now() + 200) },
          channelId: "bump",
          extra: { kind: "bump-nearby" },
        },
      ],
    });
  } catch {
    /* ignore */
  }
}

async function refreshNearby() {
  try {
    const rows = await bumpNearby(800);
    opts.onNearby?.(rows);
    await notifyNearby(rows);
  } catch {
    /* not live yet */
  }
}

export function bumpBackgroundRunning() {
  return running;
}

export async function startBumpBackground(input: {
  visible: BumpVisible;
  label?: string | null;
  alerts?: boolean;
  autoStopMinutes?: number;
  onNearby?: (rows: BumpNearby[]) => void;
  onLocation?: (lat: number, lng: number) => void;
}) {
  await stopBumpBackground({ clearServer: false });
  opts = {
    visible: input.visible,
    label: input.label?.trim() || null,
    alerts: input.alerts !== false,
    onNearby: input.onNearby,
    onLocation: input.onLocation,
  };
  knownNearby = new Set();
  running = true;

  // Continuous GPS → realtime moving pin
  watch = await watchDeviceLocation(
    (loc) => {
      void publishQuiet(loc.lat, loc.lng, loc.accuracy);
    },
    () => {
      /* heartbeat / 5-min floor covers gaps */
    },
    { highAccuracy: true },
  );

  // Mandatory 5-minute floor + faster interim heartbeat on native
  const tickMs = isNativeApp() ? Math.min(60_000, WUMP_REFRESH_MS) : WUMP_REFRESH_MS;
  heartbeat = setInterval(() => {
    if (!running) return;
    void (async () => {
      try {
        const { getDeviceLocation } = await import("./location");
        const loc = await getDeviceLocation({ highAccuracy: false });
        const force = Date.now() - lastPublish >= WUMP_REFRESH_MS - 1_000;
        await publishQuiet(loc.lat, loc.lng, loc.accuracy, force || true);
      } catch {
        /* ignore */
      }
    })();
  }, tickMs);

  nearbyPoll = setInterval(() => {
    if (running) void refreshNearby();
  }, 15_000);
  void refreshNearby();

  if (input.autoStopMinutes && input.autoStopMinutes > 0) {
    autoStop = setTimeout(() => {
      void stopBumpBackground({ clearServer: true });
    }, input.autoStopMinutes * 60_000);
  }
}

export async function stopBumpBackground(optsStop?: { clearServer?: boolean }) {
  running = false;
  watch?.stop();
  watch = null;
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
  if (nearbyPoll) clearInterval(nearbyPoll);
  nearbyPoll = null;
  if (autoStop) clearTimeout(autoStop);
  autoStop = null;
  if (optsStop?.clearServer !== false) {
    try {
      await supabase.rpc("bump_clear");
    } catch {
      /* ignore */
    }
  }
}

export function updateBumpBackgroundOptions(partial: Partial<{ visible: BumpVisible; label: string | null; alerts: boolean; onLocation?: (lat: number, lng: number) => void }>) {
  opts = { ...opts, ...partial };
}
