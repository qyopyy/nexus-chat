"use client";

import { isNativeApp } from "@/lib/useMobile";

let notified = false;
let checking = false;

type CapgoPlugin = {
  notifyAppReady?: () => Promise<unknown>;
  getLatest?: () => Promise<{ bundle?: { version?: string; url?: string }; version?: string; url?: string }>;
  download?: (opts: { url: string; version: string }) => Promise<{ id?: string; version?: string }>;
  set?: (opts: { id: string }) => Promise<unknown>;
  current?: () => Promise<{ bundle?: { version?: string }; native?: string }>;
};

function capgoPlugin(): CapgoPlugin | null {
  if (typeof window === "undefined") return null;
  const cap = (
    window as unknown as {
      Capacitor?: { Plugins?: Record<string, CapgoPlugin> };
    }
  ).Capacitor;
  return cap?.Plugins?.CapacitorUpdater ?? null;
}

/**
 * Tell Capgo the live web shell finished booting so OTA bundles are not rolled back.
 * Safe no-op on browsers / when the Capgo plugin is missing.
 * Capgo CLI also scans for: CapacitorUpdater.notifyAppReady()
 */
export async function notifyCapgoAppReady() {
  if (typeof window === "undefined" || notified) return;
  if (!isNativeApp()) return;
  try {
    const updater = capgoPlugin();
    if (updater && typeof updater.notifyAppReady === "function") {
      // CapacitorUpdater.notifyAppReady()
      await updater.notifyAppReady();
      notified = true;
    }
  } catch {
    /* plugin not in this shell */
  }
}

/**
 * Pull the latest Capgo OTA (if any) and apply on next cold start.
 * Works alongside /api/version live reloads for web-shell content.
 */
export async function checkCapgoUpdate() {
  if (typeof window === "undefined" || checking) return;
  if (!isNativeApp()) return;
  const updater = capgoPlugin();
  if (!updater?.getLatest || !updater.download || !updater.set) return;
  checking = true;
  try {
    const latest = await updater.getLatest();
    const version = latest?.bundle?.version || latest?.version;
    const url = latest?.bundle?.url || latest?.url;
    if (!version || !url) return;
    let current = "";
    try {
      const cur = await updater.current?.();
      current = cur?.bundle?.version || "";
    } catch {
      /* ignore */
    }
    if (current && current === version) return;
    const downloaded = await updater.download({ url, version });
    const id = downloaded?.id || version;
    if (id) await updater.set({ id });
  } catch {
    /* offline / channel empty */
  } finally {
    checking = false;
  }
}

/** Boot Capgo: ready ping + background OTA check. */
export function startCapgo() {
  if (typeof window === "undefined") return () => {};
  if (!isNativeApp()) return () => {};
  void notifyCapgoAppReady();
  void checkCapgoUpdate();
  const onVis = () => {
    if (document.visibilityState === "visible") {
      void notifyCapgoAppReady();
      void checkCapgoUpdate();
    }
  };
  document.addEventListener("visibilitychange", onVis);
  document.addEventListener("resume", onVis);
  return () => {
    document.removeEventListener("visibilitychange", onVis);
    document.removeEventListener("resume", onVis);
  };
}
