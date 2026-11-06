"use client";

/** Best-effort device location — Capacitor Geolocation on iPhone/Android shells, else browser Geolocation. */

export type DeviceLocation = {
  lat: number;
  lng: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  source: "capacitor" | "browser";
};

type CapGeo = {
  getCurrentPosition: (opts?: {
    enableHighAccuracy?: boolean;
    timeout?: number;
    maximumAge?: number;
  }) => Promise<{
    coords: {
      latitude: number;
      longitude: number;
      accuracy?: number;
      heading?: number | null;
      speed?: number | null;
    };
  }>;
  watchPosition?: (
    opts: { enableHighAccuracy?: boolean; timeout?: number; maximumAge?: number },
    cb: (
      pos: {
        coords: {
          latitude: number;
          longitude: number;
          accuracy?: number;
          heading?: number | null;
          speed?: number | null;
        };
      } | null,
      err?: { message?: string },
    ) => void,
  ) => Promise<string> | string;
  clearWatch?: (opts: { id: string }) => Promise<void>;
  requestPermissions?: () => Promise<{ location: string; coarseLocation?: string }>;
  checkPermissions?: () => Promise<{ location: string; coarseLocation?: string }>;
};

function capGeo(): CapGeo | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: { Plugins?: { Geolocation?: CapGeo }; isNativePlatform?: () => boolean } }).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.Geolocation ?? null;
}

export async function requestLocationPermission(): Promise<"granted" | "denied" | "prompt"> {
  const geo = capGeo();
  if (geo?.requestPermissions) {
    try {
      const r = await geo.requestPermissions();
      const s = (r.location || r.coarseLocation || "").toLowerCase();
      if (s.includes("grant") || s === "granted") return "granted";
      if (s.includes("den")) return "denied";
      return "prompt";
    } catch {
      /* fall through */
    }
  }
  if (typeof navigator !== "undefined" && "permissions" in navigator) {
    try {
      const st = await navigator.permissions.query({ name: "geolocation" as PermissionName });
      if (st.state === "granted" || st.state === "denied" || st.state === "prompt") return st.state;
    } catch {
      /* ignore */
    }
  }
  return "prompt";
}

export async function getDeviceLocation(opts?: { highAccuracy?: boolean; timeoutMs?: number }): Promise<DeviceLocation> {
  const high = opts?.highAccuracy !== false;
  const timeout = opts?.timeoutMs ?? 15_000;
  const geo = capGeo();
  if (geo) {
    try {
      await geo.requestPermissions?.();
      const pos = await geo.getCurrentPosition({ enableHighAccuracy: high, timeout, maximumAge: 10_000 });
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null,
        heading: Number.isFinite(pos.coords.heading as number) ? Number(pos.coords.heading) : null,
        speed: Number.isFinite(pos.coords.speed as number) ? Number(pos.coords.speed) : null,
        source: "capacitor",
      };
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : "Location unavailable — enable Location Services for Nexus");
    }
  }
  if (!navigator?.geolocation) throw new Error("Location isn’t available in this browser");
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
          heading: Number.isFinite(pos.coords.heading) ? pos.coords.heading : null,
          speed: Number.isFinite(pos.coords.speed) ? pos.coords.speed : null,
          source: "browser",
        }),
      (err) => reject(new Error(err.message || "Location permission denied")),
      { enableHighAccuracy: high, timeout, maximumAge: 10_000 },
    );
  });
}

export type LocationWatchHandle = { stop: () => void };

/**
 * Continuous location updates. On Capacitor + UIBackgroundModes:location this can
 * keep refreshing while Bump is Live in the background. Falls back to browser watch.
 */
export async function watchDeviceLocation(
  onLoc: (loc: DeviceLocation) => void,
  onErr?: (msg: string) => void,
  opts?: { highAccuracy?: boolean },
): Promise<LocationWatchHandle> {
  const high = opts?.highAccuracy !== false;
  const geo = capGeo();
  if (geo?.watchPosition) {
    try {
      await geo.requestPermissions?.();
      const id = await geo.watchPosition({ enableHighAccuracy: high, timeout: 30_000, maximumAge: 15_000 }, (pos, err) => {
        if (err || !pos) {
          onErr?.(err?.message || "Location watch failed");
          return;
        }
        onLoc({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
          heading: Number.isFinite(pos.coords.heading as number) ? Number(pos.coords.heading) : null,
          speed: Number.isFinite(pos.coords.speed as number) ? Number(pos.coords.speed) : null,
          source: "capacitor",
        });
      });
      const watchId = String(id);
      return {
        stop: () => {
          void geo.clearWatch?.({ id: watchId });
        },
      };
    } catch (e) {
      onErr?.(e instanceof Error ? e.message : "Could not start location watch");
    }
  }
  if (!navigator?.geolocation) {
    onErr?.("Location isn’t available");
    return { stop: () => {} };
  }
  const wid = navigator.geolocation.watchPosition(
    (pos) =>
      onLoc({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null,
        heading: Number.isFinite(pos.coords.heading) ? pos.coords.heading : null,
        speed: Number.isFinite(pos.coords.speed) ? pos.coords.speed : null,
        source: "browser",
      }),
    (err) => onErr?.(err.message || "Location permission denied"),
    { enableHighAccuracy: high, maximumAge: 5_000, timeout: 30_000 },
  );
  return {
    stop: () => {
      navigator.geolocation.clearWatch(wid);
    },
  };
}

export function formatMeters(m: number) {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}
