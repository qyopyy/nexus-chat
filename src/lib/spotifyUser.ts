"use client";

import { create } from "zustand";
import { spotifyConfig } from "./music";
import { updateMyProfile } from "./data";
import { useApp } from "@/store/app";

// Per-user Spotify login (Authorization Code + PKCE — no secret in the browser).
// Tokens stay in this browser's localStorage; nothing is sent to our database except the optional "now playing".

const KEY = "nexus:spotify";
const VERIFIER = "nexus:spotify-verifier";
const SHARE = "nexus:spotify-share";
const SCOPES = [
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-read-recently-played",
  "user-library-read",
  "user-top-read",
  "playlist-read-private",
  "user-follow-read",
].join(" ");

type Tok = { access: string; refresh: string | null; exp: number; client: string };

export const useSpotifyUser = create<{ connected: boolean; share: boolean; me: { name: string; image: string | null; product: string | null } | null }>(() => ({
  connected: false,
  share: false,
  me: null,
}));

function read(): Tok | null {
  try {
    const v = localStorage.getItem(KEY);
    return v ? (JSON.parse(v) as Tok) : null;
  } catch {
    return null;
  }
}
function write(t: Tok | null) {
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify(t));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
  useSpotifyUser.setState({ connected: !!t });
}

export const redirectUri = () => `${window.location.origin}/spotify-callback`;

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export async function connectSpotify() {
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

/** Called by /spotify-callback */
export async function finishSpotifyLogin(code: string) {
  const saved = JSON.parse(localStorage.getItem(VERIFIER) ?? "null") as { verifier: string; client: string } | null;
  if (!saved) throw new Error("Login expired — start again from Settings");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      client_id: saved.client,
      code_verifier: saved.verifier,
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error_description || j.error || "Spotify login failed");
  localStorage.removeItem(VERIFIER);
  write({ access: j.access_token, refresh: j.refresh_token ?? null, exp: Date.now() + j.expires_in * 1000, client: saved.client });
}

async function token(): Promise<string | null> {
  const t = read();
  if (!t) return null;
  if (t.exp > Date.now() + 60_000) return t.access;
  if (!t.refresh) {
    write(null);
    return null;
  }
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: t.refresh, client_id: t.client }),
  });
  if (!res.ok) {
    write(null);
    return null;
  }
  const j = await res.json();
  write({ access: j.access_token, refresh: j.refresh_token ?? t.refresh, exp: Date.now() + j.expires_in * 1000, client: t.client });
  return j.access_token;
}

/** GET against the Spotify Web API as the signed-in user */
export async function me<T = any>(path: string): Promise<T | null> {
  const tk = await token();
  if (!tk) return null;
  const res = await fetch(`https://api.spotify.com/v1${path}`, { headers: { Authorization: `Bearer ${tk}` } });
  if (res.status === 204) return null;
  if (res.status === 401) {
    write(null);
    return null;
  }
  if (!res.ok) throw new Error(`Spotify ${res.status}`);
  return (await res.json()) as T;
}

export function disconnectSpotify() {
  write(null);
  setShare(false);
  useSpotifyUser.setState({ me: null });
}

export function setShare(on: boolean) {
  try {
    localStorage.setItem(SHARE, on ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
  useSpotifyUser.setState({ share: on });
  if (!on && useApp.getState().userId) void updateMyProfile({ now_playing: null }, true);
  else if (on) void pushNowPlaying();
}

let lastKey = "";
async function pushNowPlaying() {
  if (!useSpotifyUser.getState().share || !useApp.getState().userId) return;
  try {
    const cur = await me<any>("/me/player/currently-playing");
    const item = cur?.is_playing ? cur.item : null;
    const key = item?.id ?? "";
    if (key === lastKey) return;
    lastKey = key;
    await updateMyProfile(
      {
        now_playing: item
          ? {
              title: item.name,
              artist: (item.artists ?? (item.show ? [item.show] : [])).map((a: { name: string }) => a.name).join(", ") || "",
              url: item.external_urls?.spotify ?? null,
              image: item.album?.images?.[0]?.url ?? item.images?.[0]?.url ?? null,
              at: new Date().toISOString(),
            }
          : null,
      },
      true,
    );
  } catch {
    /* offline / rate limited */
  }
}

let started = false;
/** Boot: restore login state and keep "now playing" fresh while sharing is on */
export function startSpotifySync() {
  if (started || typeof window === "undefined") return;
  started = true;
  useSpotifyUser.setState({ connected: !!read(), share: localStorage.getItem(SHARE) === "1" });
  if (read()) {
    void me<{ display_name: string; images?: { url: string }[]; product?: string }>("/me")
      .then((u) => u && useSpotifyUser.setState({ me: { name: u.display_name, image: u.images?.[0]?.url ?? null, product: u.product ?? null } }))
      .catch(() => {});
  }
  setInterval(() => void pushNowPlaying(), 30_000);
  void pushNowPlaying();
}
