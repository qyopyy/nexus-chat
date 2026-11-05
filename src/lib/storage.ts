"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";

// Chat attachments live in a PRIVATE bucket. Messages keep a stable storage link; whoever views the chat
// gets a short-lived signed URL (RLS only signs files from conversations you're a member of).
// Raw storage links therefore don't open for anyone — admins can still open any file through the vault.

const PRIVATE_BUCKETS = new Set(["attachments", "space-music", "nexus-radio"]);
const TTL = 60 * 60; // seconds
const cache = new Map<string, { url: string; exp: number }>();
const inflight = new Map<string, Promise<string | null>>();

export function parseStorageUrl(url: string | null | undefined): { bucket: string; path: string } | null {
  if (!url) return null;
  if (url.startsWith("sb://")) {
    const [bucket, ...rest] = url.slice(5).split("/");
    return { bucket, path: rest.join("/") };
  }
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^?#]+)/);
  return m ? { bucket: m[1], path: decodeURIComponent(m[2]) } : null;
}

/** Stable reference saved in the database for a private object */
export const storageRef = (bucket: string, path: string) => `sb://${bucket}/${path}`;

export function isPrivateRef(url: string | null | undefined) {
  const p = parseStorageUrl(url);
  return !!p && PRIVATE_BUCKETS.has(p.bucket);
}

export async function signedUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const p = parseStorageUrl(url);
  if (!p || !PRIVATE_BUCKETS.has(p.bucket)) return url; // blob:, public buckets, external links
  const key = `${p.bucket}/${p.path}`;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now() + 60_000) return hit.url;
  const running = inflight.get(key);
  if (running) return running;
  const job = (async () => {
    const { data, error } = await supabase.storage.from(p.bucket).createSignedUrl(p.path, TTL);
    inflight.delete(key);
    if (error || !data?.signedUrl) return null;
    cache.set(key, { url: data.signedUrl, exp: Date.now() + TTL * 1000 });
    return data.signedUrl;
  })();
  inflight.set(key, job);
  return job;
}

/** Remember a local blob URL for a freshly uploaded object so the sender never waits for signing */
export function primeSignedUrl(ref: string, localUrl: string) {
  const p = parseStorageUrl(ref);
  if (p) cache.set(`${p.bucket}/${p.path}`, { url: localUrl, exp: Date.now() + 6 * 3600_000 });
}

/** React hook: resolves a stored attachment reference into a viewable URL */
export function useSignedUrl(url: string | null | undefined) {
  const p = parseStorageUrl(url);
  const needs = !!p && PRIVATE_BUCKETS.has(p.bucket);
  const [resolved, setResolved] = useState<string | null>(() => {
    if (!url) return null;
    if (!needs) return url;
    const hit = cache.get(`${p!.bucket}/${p!.path}`);
    return hit && hit.exp > Date.now() + 60_000 ? hit.url : null;
  });
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!url) {
      setResolved(null);
      return;
    }
    if (!needs) {
      setResolved(url);
      return;
    }
    void signedUrl(url).then((u) => {
      if (!alive) return;
      setResolved(u);
      setFailed(!u);
    });
    return () => {
      alive = false;
    };
  }, [url, needs]);
  return { url: resolved, loading: needs && !resolved && !failed, failed };
}
