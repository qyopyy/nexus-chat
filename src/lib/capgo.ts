"use client";

import { isNativeApp } from "@/lib/useMobile";

let notified = false;

/**
 * Tell Capgo the live web shell finished booting so OTA bundles are not rolled back.
 * Safe no-op on browsers / when the Capgo plugin is missing.
 * Capgo CLI also scans for: CapacitorUpdater.notifyAppReady()
 */
export async function notifyCapgoAppReady() {
  if (typeof window === "undefined" || notified) return;
  if (!isNativeApp()) return;
  try {
    const cap = (
      window as unknown as {
        Capacitor?: { Plugins?: Record<string, { notifyAppReady?: () => Promise<unknown> }> };
      }
    ).Capacitor;
    const updater = cap?.Plugins?.CapacitorUpdater;
    if (updater && typeof updater.notifyAppReady === "function") {
      // CapacitorUpdater.notifyAppReady()
      await updater.notifyAppReady();
      notified = true;
    }
  } catch {
    /* plugin not in this shell */
  }
}
