"use client";

/**
 * Capacitor shells load the live website. After a Vercel deploy, poll /api/version
 * and hard-reload once so users get the new UI without updating the APK/IPA.
 */

import { isNativeApp } from "./useMobile";
import { checkCapgoUpdate, notifyCapgoAppReady } from "./capgo";
import { supabase } from "./supabase";

/** tell every open Nexus (over Supabase Realtime) that this build is live — they re-check /api/version */
function announce(build: string) {
  if (!build || build === "dev") return;
  void supabase.rpc("announce_release", { p_build: build.slice(0, 64) }).then(
    () => undefined,
    () => undefined,
  );
}

/** web: show the "new version ready" pill (UpdateReadyPill listens) */
function signalReady(build: string) {
  try {
    window.dispatchEvent(new CustomEvent("nexus:update-ready", { detail: { build } }));
  } catch {
    /* old browsers */
  }
}

export function reloadToUpdate() {
  sessionStorage.removeItem("nexus.pendingLiveReload");
  reloadNow();
}

const KEY = "nexus.liveBuild";
const CACHE_HOUR_KEY = "nexus.clientCacheHour";
/** Native shells poll aggressively so Capgo + Vercel deploys hit devices fast. */
const POLL_MS_NATIVE = 12_000;
const POLL_MS_WEB = 30_000;
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
  const native = isNativeApp();
  const pollMs = native ? POLL_MS_NATIVE : POLL_MS_WEB;

  if (native) {
    void notifyCapgoAppReady();
  }

  const check = async () => {
    if (stopped) return;
    if (native) void checkCapgoUpdate();
    const v = await fetchVersion();
    if (!v?.build || stopped) return;
    const prev = localStorage.getItem(KEY);
    if (!prev) {
      localStorage.setItem(KEY, v.build);
      announce(v.build);
      return;
    }
    if (prev !== v.build) {
      localStorage.setItem(KEY, v.build);
      announce(v.build);
      // Native shells + force flag: hard reload so realtime UI matches production.
      if (native || sessionStorage.getItem("nexus.forceLiveReload") === "1") {
        reloadNow();
        return;
      }
      // Web: apply on next focus so deploys feel live without interrupting mid-type.
      sessionStorage.setItem("nexus.pendingLiveReload", "1");
      signalReady(v.build);
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
  timer = setInterval(() => void check(), pollMs);

  // realtime: a new deploy announced by the Vercel webhook or the first client that loads it
  let debounce: ReturnType<typeof setTimeout> | null = null;
  const channel = supabase
    .channel("nexus-app-releases")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "app_releases" }, () => {
      if (debounce) clearTimeout(debounce);
      // tiny jitter so thousands of clients don't hit /api/version in the same millisecond
      debounce = setTimeout(() => void check(), 300 + Math.random() * 2500);
    })
    .subscribe();
  const hourTimer = setInterval(() => clearClientCaches(), HOUR_MS);

  const onVis = () => {
    if (document.visibilityState === "visible") {
      if (sessionStorage.getItem("nexus.pendingLiveReload") === "1") {
        sessionStorage.removeItem("nexus.pendingLiveReload");
        reloadNow();
        return;
      }
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
    if (debounce) clearTimeout(debounce);
    void supabase.removeChannel(channel);
    if (timer) clearInterval(timer);
    clearInterval(hourTimer);
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("focus", onVis);
    document.removeEventListener("resume", onResume);
    disarmChunk();
  };
}
