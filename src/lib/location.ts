"use client";

/** Best-effort device location — Capacitor Geolocation on iPhone/Android shells, else browser Geolocation. */

export type DeviceLocation = {
  lat: number;
  lng: number;
  accuracy: number | null;
  source: "capacitor" | "browser";
};

type CapGeo = {
  getCurrentPosition: (opts?: {
    enableHighAccuracy?: boolean;
    timeout?: number;
    maximumAge?: number;
  }) => Promise<{
    coords: { latitude: number; longitude: number; accuracy?: number };
  }>;
  requestPermissions?: () => Promise<{ location: string; coarseLocation?: string }>;
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
          source: "browser",
        }),
      (err) => reject(new Error(err.message || "Location permission denied")),
      { enableHighAccuracy: high, timeout, maximumAge: 10_000 },
    );
  });
}

export function formatMeters(m: number) {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}
