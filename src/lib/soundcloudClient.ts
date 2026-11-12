"use client";

import { supabase } from "./supabase";
import { soundCloudPage } from "./acetateImportParse";

export type SoundCloudCard = {
  id: string;
  title: string;
  artist: string;
  artwork: string | null;
  durationMs: number | null;
  permalink: string;
  own: boolean;
  canImport: boolean;
  reason: string | null;
};

export type SoundCloudStatus = {
  configured: boolean;
  connected: boolean;
  disabled?: boolean;
  username?: string;
  tracks?: SoundCloudCard[];
  error?: string;
};

async function bearer() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in required");
  return token;
}

async function readJson(res: Response) {
  const data = (await res.json().catch(() => ({}))) as SoundCloudStatus & { error?: string; url?: string; track?: SoundCloudCard };
  if (!res.ok && !data.disabled && data.configured !== false) throw new Error(data.error || "SoundCloud isn't available");
  return data;
}

export async function soundCloudStatus(library = false) {
  const token = await bearer();
  const res = await fetch(library ? "/api/acetate/soundcloud?view=library" : "/api/acetate/soundcloud", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return readJson(res);
}

export async function connectSoundCloud() {
  const token = await bearer();
  const res = await fetch("/api/acetate/soundcloud/connect", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  const data = await readJson(res);
  if (!data.url) throw new Error("SoundCloud not configured");
  window.location.assign(data.url);
}

export async function disconnectSoundCloud() {
  await fetch("/api/acetate/soundcloud", { method: "DELETE" });
}

export async function resolveSoundCloud(url: string) {
  const page = soundCloudPage(url);
  if (!page) throw new Error("Paste a SoundCloud track page. Acetate does not read stream URLs.");
  const token = await bearer();
  const res = await fetch("/api/acetate/soundcloud/resolve", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url: page }),
  });
  const data = await readJson(res);
  if (!data.track) throw new Error("SoundCloud didn't return that track");
  return data.track;
}

export async function downloadSoundCloud(id: string) {
  if (!/^[0-9]{1,20}$/.test(id)) throw new Error("Unknown SoundCloud track");
  const token = await bearer();
  const res = await fetch(`/api/acetate/soundcloud/file?id=${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "SoundCloud didn't provide that download");
  }
  const header = (name: string) => decodeURIComponent(res.headers.get(name) || "");
  const ext = header("x-acetate-ext") || "mp3";
  const title = header("x-acetate-title") || "SoundCloud";
  const blob = await res.blob();
  const safe = title.replace(/[^\w .()'#-]+/g, "").trim().slice(0, 80) || "SoundCloud";
  return {
    file: new File([blob], `${safe}.${ext}`, { type: blob.type || "application/octet-stream" }),
    title,
    artist: header("x-acetate-artist"),
    source: header("x-acetate-source"),
    artwork: header("x-acetate-art") || null,
  };
}
