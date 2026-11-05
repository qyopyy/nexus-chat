"use client";

/**
 * Capacitor shells load the live website. After a Vercel deploy, poll /api/version
 * and hard-reload once so users get the new UI without updating the APK/IPA.
 */

import { isNativeApp } from "./useMobile";

const KEY = "nexus.liveBuild";
const CACHE_HOUR_KEY = "nexus.clientCacheHour";
const POLL_MS = 45_000;
const HOUR_MS = 60 * 60_000;

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

/** One-shot recovery when a deploy invalidates an in-memory chunk (Arc/Chrome show a blank "couldn't load" page). */
function armChunkReload() {
  const FLAG = "nexus.chunkReload";
  const onErr = (ev: ErrorEvent) => {
    const msg = String(ev.message || ev.error || "");
    const isChunk =
      /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
        msg,
      );
    if (!isChunk) return;
    const last = Number(sessionStorage.getItem(FLAG) || 0);
    if (Date.now() - last < 20_000) return; // avoid reload loops
    sessionStorage.setItem(FLAG, String(Date.now()));
    reloadNow();
  };
  const onRej = (ev: PromiseRejectionEvent) => {
    const reason = ev.reason;
    const msg = typeof reason === "string" ? reason : String(reason?.message ?? reason ?? "");
    onErr(new ErrorEvent("error", { message: msg }));
  };
  window.addEventListener("error", onErr);
  window.addEventListener("unhandledrejection", onRej);
  return () => {
    window.removeEventListener("error", onErr);
    window.removeEventListener("unhandledrejection", onRej);
  };
}

export function startLiveUpdates() {
  if (typeof window === "undefined") return () => {};

  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  const disarmChunk = armChunkReload();

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

  /** Soft client cache reset every hour — drops link-preview / follower memo and nudges freshness. */
  const clearClientCaches = () => {
    try {
      const mark = Number(localStorage.getItem(CACHE_HOUR_KEY) || 0);
      if (Date.now() - mark < HOUR_MS) return;
      localStorage.setItem(CACHE_HOUR_KEY, String(Date.now()));
      // Drop ephemeral preview caches kept in sessionStorage by hubs
      const doomed: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && /^(nexus\.(unfurl|followers|preview|cache))/i.test(k)) doomed.push(k);
      }
      for (const k of doomed) sessionStorage.removeItem(k);
    } catch {
      /* private mode */
    }
  };

  void check();
  clearClientCaches();
  timer = setInterval(() => void check(), POLL_MS);
  const hourTimer = setInterval(() => clearClientCaches(), HOUR_MS);

  const onVis = () => {
    if (document.visibilityState === "visible") {
      void check();
      clearClientCaches();
    }
  };
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("focus", onVis);

  // Capacitor resume
  const onResume = () => void check();
  document.addEventListener("resume", onResume);

  return () => {
    stopped = true;
    if (timer) clearInterval(timer);
    clearInterval(hourTimer);
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("focus", onVis);
    document.removeEventListener("resume", onResume);
    disarmChunk();
  };
}
