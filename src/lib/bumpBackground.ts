"use client";

/**
 * Keeps Wump Live while backgrounded (Capacitor + UIBackgroundModes:location).
 * GPS watch for realtime moving pins + mandatory 5-minute safety republish.
 */

import { supabase } from "./supabase";
import { watchDeviceLocation, type DeviceLocation, type LocationWatchHandle } from "./location";
import { bumpExpireStale, bumpNearby, bumpPublishSample, type BumpNearby, type BumpVisible } from "./bump";
import { wumpExploreMark } from "./wumpPlaces";
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
/** Moving: publish often so friends see you live */
const WATCH_THROTTLE_MOVING_MS = 3_000;
/** Stationary: slower publishes to save battery */
const WATCH_THROTTLE_IDLE_MS = 12_000;
/** Treat as moving above this ground speed (m/s ≈ walking) */
const MOVING_SPEED_MPS = 0.6;

let watch: LocationWatchHandle | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let nearbyPoll: ReturnType<typeof setInterval> | null = null;
let autoStop: ReturnType<typeof setTimeout> | null = null;
let running = false;
let lastPublish = 0;
let lastLat: number | null = null;
let lastLng: number | null = null;
let knownNearby = new Set<string>();
let opts: {
  visible: BumpVisible;
  label: string | null;
  alerts: boolean;
  radiusM: number;
  onNearby?: (rows: BumpNearby[]) => void;
  onLocation?: (lat: number, lng: number, meta?: { heading: number | null; speed: number | null; accuracy: number | null }) => void;
  onExplore?: () => void;
} = { visible: "friends", label: null, alerts: true, radiusM: 800 };

function ln(): CapLN | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: { Plugins?: { LocalNotifications?: CapLN } } }).Capacitor;
  return cap?.Plugins?.LocalNotifications ?? null;
}

function movedEnough(lat: number, lng: number) {
  if (lastLat == null || lastLng == null) return true;
  const dLat = (lat - lastLat) * 111_320;
  const dLng = (lng - lastLng) * 111_320 * Math.cos((lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng) >= 8; // ≥ ~8 m
}

let lastGeocodeAt = 0;
let lastGeocodeLat: number | null = null;
let lastGeocodeLng: number | null = null;

function shouldGeocode(lat: number, lng: number, force: boolean) {
  if (force) return true;
  if (lastGeocodeLat == null || lastGeocodeLng == null) return true;
  if (Date.now() - lastGeocodeAt < 45_000) return false;
  const dLat = (lat - lastGeocodeLat) * 111_320;
  const dLng = (lng - lastGeocodeLng) * 111_320 * Math.cos((lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng) >= 80; // ~80 m before re-resolving place name
}

async function publishQuiet(loc: DeviceLocation, force = false) {
  const now = Date.now();
  const moving = (loc.speed != null && loc.speed >= MOVING_SPEED_MPS) || movedEnough(loc.lat, loc.lng);
  const throttle = moving ? WATCH_THROTTLE_MOVING_MS : WATCH_THROTTLE_IDLE_MS;
  if (!force && now - lastPublish < throttle) return;
  lastPublish = now;
  const geocode = shouldGeocode(loc.lat, loc.lng, force);
  if (geocode) {
    lastGeocodeAt = now;
    lastGeocodeLat = loc.lat;
    lastGeocodeLng = loc.lng;
  }
  lastLat = loc.lat;
  lastLng = loc.lng;
  const priv = loadWumpPrivacyLocal();
  if (!priv.wump_share_enabled) return;
  const ok = await bumpPublishSample(loc, opts.visible, opts.label, { geocode });
  if (ok) {
    opts.onLocation?.(loc.lat, loc.lng, { heading: loc.heading, speed: loc.speed, accuracy: loc.accuracy });
    // Fog-of-war style exploration cells (server-side, no IPA)
    void wumpExploreMark(loc.lat, loc.lng).then((r) => {
      if (r?.new) opts.onExplore?.();
    });
  }
}

async function notifyNearby(rows: BumpNearby[]) {
  if (!opts.alerts) return;
  const priv = loadWumpPrivacyLocal();
  if (!priv.wump_allow_nearby_alerts) return;
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
    const rows = await bumpNearby(opts.radiusM);
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
  radiusM?: number;
  onNearby?: (rows: BumpNearby[]) => void;
  onLocation?: (lat: number, lng: number, meta?: { heading: number | null; speed: number | null; accuracy: number | null }) => void;
  onExplore?: () => void;
}) {
  await stopBumpBackground({ clearServer: false });
  opts = {
    visible: input.visible,
    label: input.label?.trim() || null,
    alerts: input.alerts !== false,
    radiusM: input.radiusM ?? 800,
    onNearby: input.onNearby,
    onLocation: input.onLocation,
    onExplore: input.onExplore,
  };
  knownNearby = new Set();
  lastLat = null;
  lastLng = null;
  running = true;
  void bumpExpireStale();

  // Continuous GPS → realtime moving pin
  watch = await watchDeviceLocation(
    (loc) => {
      void publishQuiet(loc);
    },
    () => {
      /* heartbeat / 5-min floor covers gaps */
    },
    { highAccuracy: true },
  );

  // Mandatory 5-minute floor + faster interim heartbeat on native
  const tickMs = isNativeApp() ? Math.min(45_000, WUMP_REFRESH_MS) : WUMP_REFRESH_MS;
  heartbeat = setInterval(() => {
    if (!running) return;
    void (async () => {
      try {
        const { getDeviceLocation } = await import("./location");
        const loc = await getDeviceLocation({ highAccuracy: false });
        await publishQuiet(loc, true);
      } catch {
        /* ignore */
      }
    })();
  }, tickMs);

  // Nearby poll — fast enough to feel live when friends move
  nearbyPoll = setInterval(() => {
    if (running) void refreshNearby();
  }, isNativeApp() ? 8_000 : 10_000);
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

export function updateBumpBackgroundOptions(
  partial: Partial<{
    visible: BumpVisible;
    label: string | null;
    alerts: boolean;
    radiusM: number;
    onLocation?: (lat: number, lng: number, meta?: { heading: number | null; speed: number | null; accuracy: number | null }) => void;
    onExplore?: () => void;
  }>,
) {
  opts = { ...opts, ...partial };
}
