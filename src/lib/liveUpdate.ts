"use client";

/**
 * Capacitor shells load the live website. After a Vercel deploy, poll /api/version
 * and hard-reload once so users get the new UI without updating the APK/IPA.
 */

import { isNativeApp } from "./useMobile";

const KEY = "nexus.liveBuild";
const POLL_MS = 45_000;

type Version = { build: string; short?: string };

async function fetchVersion(): Promise<Version | null> {
  try {
    const r = await fetch(`/api/version?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as Version;
  } catch {
    return null;
  }
}

function reloadNow() {
  try {
    // Bust any WebView document cache
    const u = new URL(window.location.href);
    u.searchParams.set("_nx", String(Date.now()));
    window.location.replace(u.toString());
  } catch {
    window.location.reload();
  }
}

export function startLiveUpdates() {
  if (typeof window === "undefined") return () => {};

  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const check = async () => {
    if (stopped) return;
    const v = await fetchVersion();
    if (!v?.build || stopped) return;
    const prev = localStorage.getItem(KEY);
    if (!prev) {
      localStorage.setItem(KEY, v.build);
      return;
    }
    if (prev !== v.build) {
      localStorage.setItem(KEY, v.build);
      // Only auto-reload inside the native shell (or when explicitly asked)
      if (isNativeApp() || sessionStorage.getItem("nexus.forceLiveReload") === "1") {
        reloadNow();
      } else {
        // Web tabs: soft signal — next full navigation picks up new assets
        localStorage.setItem(KEY, v.build);
      }
    }
  };

  void check();
  timer = setInterval(() => void check(), POLL_MS);

  const onVis = () => {
    if (document.visibilityState === "visible") void check();
  };
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("focus", onVis);

  // Capacitor resume
  const onResume = () => void check();
  document.addEventListener("resume", onResume);

  return () => {
    stopped = true;
    if (timer) clearInterval(timer);
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("focus", onVis);
    document.removeEventListener("resume", onResume);
  };
}
