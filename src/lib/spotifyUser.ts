"use client";

import { create } from "zustand";
import { spotifyConfig } from "./music";
import { supabase } from "./supabase";
import { useApp, toast } from "@/store/app";

// Per-user Spotify login (Authorization Code + PKCE, no secret in the browser).
// The login is kept on our server (nowplaying function) so "Listening to" on your profile keeps
// updating every minute even when Nexus is closed. The browser only ever holds short-lived access tokens.

const LEGACY = "nexus:spotify"; // old browser-only login, moved to the server on first run
const VERIFIER = "nexus:spotify-verifier";
const SCOPES = [
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-read-recently-played",
  "user-library-read",
  "user-top-read",
  "playlist-read-private",
  "user-follow-read",
].join(" ");

export type SpotifyLink = { name: string | null; avatar: string | null; product: string | null; share: boolean; since: string };

export const useSpotifyUser = create<{
  connected: boolean;
  share: boolean;
  me: { name: string; image: string | null; product: string | null } | null;
  link: SpotifyLink | null;
  loaded: boolean;
}>(() => ({ connected: false, share: false, me: null, link: null, loaded: false }));

function applyLink(l: SpotifyLink | null) {
  useSpotifyUser.setState({
    link: l,
    connected: !!l,
    share: !!l?.share,
    me: l ? { name: l.name ?? "Spotify", image: l.avatar, product: l.product } : null,
    loaded: true,
  });
}

export async function refreshLink() {
  const { data } = await supabase.rpc("my_music_link");
  applyLink((data as SpotifyLink | null) ?? null);
}

async function fn<T = Record<string, unknown>>(action: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("nowplaying", { body: { action, ...args } });
  if (error) {
    let msg = error.message;
    try {
      const j = await (error as { context?: Response }).context?.json();
      if (j?.error) msg = j.error;
    } catch {
      /* not json */
    }
    throw new Error(msg);
  }
  return data as T;
}

export const redirectUri = () => `${window.location.origin}/spotify-callback`;

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const RETURN_KEY = "nexus:spotify-return";

/** where /spotify-callback sends you afterwards (same-site paths only) */
export function spotifyReturnPath() {
  try {
    const v = localStorage.getItem(RETURN_KEY);
    localStorage.removeItem(RETURN_KEY);
    return v && /^\/(?!\/)/.test(v) ? v : null;
  } catch {
    return null;
  }
}

export async function connectSpotify(returnTo?: string) {
  try {
    if (returnTo && /^\/(?!\/)/.test(returnTo)) localStorage.setItem(RETURN_KEY, returnTo);
    else localStorage.removeItem(RETURN_KEY);
  } catch {
    /* storage unavailable */
  }
  const cfg = await spotifyConfig();
  if (!cfg.client_id) throw new Error("Spotify isn't set up on this server yet (an admin needs to add the Spotify app keys).");
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  try {
    localStorage.setItem(VERIFIER, JSON.stringify({ verifier, client: cfg.client_id }));
  } catch {
    /* storage unavailable */
  }
  const q = new URLSearchParams({
    client_id: cfg.client_id,
    response_type: "code",
    redirect_uri: redirectUri(),
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: SCOPES,
  });
  window.location.href = `https://accounts.spotify.com/authorize?${q}`;
}

/** Called by /spotify-callback: the server swaps the code for tokens and keeps them */
export async function finishSpotifyLogin(code: string) {
  const saved = JSON.parse(localStorage.getItem(VERIFIER) ?? "null") as { verifier: string; client: string } | null;
  if (!saved) throw new Error("Login expired — start again from Settings");
  await fn("link", { code, verifier: saved.verifier, redirect_uri: redirectUri() });
  localStorage.removeItem(VERIFIER);
}

let tok: { value: string; exp: number } | null = null;
async function token(): Promise<string | null> {
  if (tok && tok.exp > Date.now() + 60_000) return tok.value;
  try {
    const r = await fn<{ linked: boolean; access_token?: string; expires_at?: string }>("token");
    if (!r.linked || !r.access_token) {
      tok = null;
      if (useSpotifyUser.getState().connected) applyLink(null);
      return null;
    }
    tok = { value: r.access_token, exp: r.expires_at ? new Date(r.expires_at).getTime() : Date.now() + 30 * 60_000 };
    return tok.value;
  } catch {
    return null;
  }
}

/** GET against the Spotify Web API as the signed-in user */
export async function me<T = any>(path: string): Promise<T | null> {
  if (!useSpotifyUser.getState().connected) return null;
  const tk = await token();
  if (!tk) return null;
  const res = await fetch(`https://api.spotify.com/v1${path}`, { headers: { Authorization: `Bearer ${tk}` } });
  if (res.status === 204) return null;
  if (res.status === 401) {
    tok = null;
    return null;
  }
  if (!res.ok) throw new Error(`Spotify ${res.status}`);
  return (await res.json()) as T;
}

export async function disconnectSpotify() {
  tok = null;
  try {
    await fn("unlink");
  } catch (e) {
    toast((e as Error).message, "error");
  }
  applyLink(null);
}

export async function setShare(on: boolean) {
  useSpotifyUser.setState({ share: on });
  const { error } = await supabase.rpc("set_music_share", { p_share: on });
  if (error) {
    useSpotifyUser.setState({ share: !on });
    return toast(error.message, "error");
  }
  if (on) void syncNow(true);
}

/** ask the server to look at Spotify right now (used on open/focus so it feels instant) */
export async function syncNow(force = false) {
  if (!useSpotifyUser.getState().connected || !useApp.getState().userId) return;
  try {
    await fn("now", { force });
  } catch {
    /* offline / rate limited */
  }
}

let started = false;
/** Boot: load link state, move any old browser-only login to the server, nudge a sync on focus */
export function startSpotifySync() {
  if (started || typeof window === "undefined") return;
  started = true;
  void (async () => {
    await refreshLink();
    // migrate an old local login
    try {
      const old = JSON.parse(localStorage.getItem(LEGACY) ?? "null") as { refresh?: string | null } | null;
      if (old) {
        localStorage.removeItem(LEGACY);
        localStorage.removeItem("nexus:spotify-share");
        if (old.refresh && !useSpotifyUser.getState().connected) {
          await fn("adopt", { refresh_token: old.refresh }).catch(() => {});
          await refreshLink();
        }
      }
    } catch {
      /* storage unavailable */
    }
    void syncNow();
  })();
  let last = 0;
  const nudge = () => {
    if (document.visibilityState !== "visible" || Date.now() - last < 20_000) return;
    last = Date.now();
    void syncNow();
  };
  document.addEventListener("visibilitychange", nudge);
  window.addEventListener("focus", nudge);
  // while the app is open, check a bit faster than the server's 1-minute cycle
  setInterval(nudge, 25_000);
}
