"use client";

/**
 * Keeps Bump Live while the app is backgrounded (Capacitor + UIBackgroundModes:location).
 * Republishes on watch updates + a safety heartbeat; optional nearby local notifications.
 */

import { supabase } from "./supabase";
import { watchDeviceLocation, type LocationWatchHandle } from "./location";
import { bumpNearby, type BumpNearby, type BumpVisible } from "./bump";
import { isNativeApp } from "./useMobile";
import { haptic } from "./haptics";
import { useApp } from "@/store/app";

type CapLN = {
  requestPermissions?: () => Promise<{ display?: string }>;
  schedule?: (o: { notifications: Record<string, unknown>[] }) => Promise<unknown>;
  createChannel?: (o: Record<string, unknown>) => Promise<unknown>;
};

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
} = { visible: "friends", label: null, alerts: true };

function ln(): CapLN | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: { Plugins?: { LocalNotifications?: CapLN } } }).Capacitor;
  return cap?.Plugins?.LocalNotifications ?? null;
}

async function publishQuiet(lat: number, lng: number, accuracy: number | null) {
  const now = Date.now();
  // iOS may fire watch often — throttle publishes
  if (now - lastPublish < 12_000) return;
  lastPublish = now;
  await supabase.rpc("bump_publish", {
    p_lat: lat,
    p_lng: lng,
    p_accuracy: accuracy,
    p_visible: opts.visible,
    p_label: opts.label,
  });
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
      ? `${Math.round(fresh[0].meters)} m away on Bump`
      : names.join(", ") + (fresh.length > 3 ? "…" : "");

  const api = ln();
  if (!api?.schedule) return;
  try {
    await api.requestPermissions?.();
    await api.createChannel?.({ id: "bump", name: "Bump nearby", importance: 4, vibration: true, sound: "default" });
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
  /** Auto-stop after this many minutes (0 = until manual stop) */
  autoStopMinutes?: number;
  onNearby?: (rows: BumpNearby[]) => void;
}) {
  await stopBumpBackground({ clearServer: false });
  opts = {
    visible: input.visible,
    label: input.label?.trim() || null,
    alerts: input.alerts !== false,
    onNearby: input.onNearby,
  };
  knownNearby = new Set();
  running = true;

  watch = await watchDeviceLocation(
    (loc) => {
      void publishQuiet(loc.lat, loc.lng, loc.accuracy);
    },
    () => {
      /* keep heartbeat as fallback */
    },
    { highAccuracy: true },
  );

  heartbeat = setInterval(() => {
    if (!running) return;
    void (async () => {
      try {
        const { getDeviceLocation } = await import("./location");
        const loc = await getDeviceLocation({ highAccuracy: false });
        await publishQuiet(loc.lat, loc.lng, loc.accuracy);
      } catch {
        /* ignore */
      }
    })();
  }, isNativeApp() ? 45_000 : 60_000);

  nearbyPoll = setInterval(() => {
    if (running) void refreshNearby();
  }, 25_000);
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

export function updateBumpBackgroundOptions(partial: Partial<{ visible: BumpVisible; label: string | null; alerts: boolean }>) {
  opts = { ...opts, ...partial };
}
