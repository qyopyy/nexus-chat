"use client";

import { create } from "zustand";
import { loadJSON, saveJSON } from "@/lib/utils";

export type YtChannel = {
  id: string;
  title: string;
  handle?: string | null;
  thumb?: string | null;
};

export type YtVideo = {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  thumb: string | null;
  publishedAt: string;
  url: string;
  embedUrl: string;
  isShort: boolean;
};

type YtState = {
  channel: YtChannel | null;
};

const KEY = "nexus.youtube.channel";

export const useYouTube = create<YtState>(() => {
  if (typeof window === "undefined") return { channel: null };
  return { channel: loadJSON<YtChannel | null>(KEY, null) };
});

export function linkYouTubeChannel(ch: YtChannel) {
  useYouTube.setState({ channel: ch });
  saveJSON(KEY, ch);
}

export function unlinkYouTubeChannel() {
  useYouTube.setState({ channel: null });
  saveJSON(KEY, null);
}

export function youtubeWatchUrl(id: string) {
  return `https://www.youtube.com/watch?v=${id}`;
}

export function youtubeShortUrl(id: string) {
  return `https://www.youtube.com/shorts/${id}`;
}

export function youtubeEmbedUrl(id: string, opts?: { autoplay?: boolean; mute?: boolean }) {
  const q = new URLSearchParams({
    autoplay: opts?.autoplay ? "1" : "0",
    mute: opts?.mute === false ? "0" : "1",
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
    enablejsapi: "1",
  });
  return `https://www.youtube.com/embed/${id}?${q.toString()}`;
}

async function api<T>(params: Record<string, string>): Promise<T> {
  const q = new URLSearchParams(params);
  const res = await fetch(`/api/youtube?${q}`);
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error((data as { error?: string }).error || "YouTube request failed");
  return data;
}

export async function resolveYouTubeChannel(query: string) {
  return api<{ channel: YtChannel }>({ action: "resolve", q: query });
}

export async function fetchYouTubeFeed(channelId: string, shortsOnly = true) {
  return api<{ videos: YtVideo[]; source: string }>({
    action: "feed",
    channelId,
    shorts: shortsOnly ? "1" : "0",
  });
}

export async function searchYouTubeShorts(q: string) {
  return api<{ videos: YtVideo[]; source: string }>({ action: "search", q });
}

/** Optional Google OAuth URL when NEXT_PUBLIC_GOOGLE_CLIENT_ID is configured. */
export function youtubeGoogleAuthUrl() {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId || typeof window === "undefined") return null;
  const redirect = `${window.location.origin}/api/youtube/oauth`;
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirect);
  u.searchParams.set("response_type", "token");
  u.searchParams.set("scope", "https://www.googleapis.com/auth/youtube.readonly");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("prompt", "consent");
  return u.toString();
}
