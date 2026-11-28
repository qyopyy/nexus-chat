"use client";

// Nexus Drop Center: one store behind every Drop screen (Share & Link, Phone Link, the sidebar).
// Send queue (progress, cancel, retry, two at a time), live inbox / received / sent lists, save + re-download,
// thumbnails, and an iPhone-safe "Save" that keeps the share sheet inside the tap.

import { create } from "zustand";
import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";
import { claimDrop, incomingDrops, openAndClaimDrop, openDrop, sendDrop, type NexusDrop } from "./nexusDrop";
import { DROP_MAX_FILES, cleanUsername, dropKind, friendlyDropError, niceFileName, planBatch } from "./dropKit";

export type QStatus = "queued" | "sending" | "done" | "error" | "cancelled";
export type QItem = {
  id: string;
  file: File;
  to: string;
  status: QStatus;
  progress: number;
  error?: string;
};
export type SentDrop = NexusDrop & { to_name: string | null };
export type PersonHit = { id: string; username: string; display_name: string | null; avatar_url: string | null };

type HubState = {
  queue: QItem[];
  incoming: NexusDrop[];
  received: NexusDrop[];
  sent: SentDrop[];
  loading: boolean;
  error: string | null;
};

export const useDropHub = create<HubState>(() => ({ queue: [], incoming: [], received: [], sent: [], loading: false, error: null }));
const set = useDropHub.setState;
const get = useDropHub.getState;

const controllers = new Map<string, AbortController>();
const CONCURRENCY = 2;
const MAX_PREFETCH = 25 * 1024 * 1024;

const isIosLike = () => typeof navigator !== "undefined" && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
const meId = () => useApp.getState().userId;

// ------------------------------------------------------------------ lists
let known: Set<string> | null = null;

export async function refreshHub(): Promise<void> {
  const me = meId();
  if (!me) {
    set({ incoming: [], received: [], sent: [], loading: false, error: null });
    return;
  }
  set({ loading: true });
  const nowIso = new Date().toISOString();
  const [inc, rec, snt] = await Promise.allSettled([
    incomingDrops(),
    supabase.from("nexus_drops").select("*").eq("to_user", me).not("claimed_at", "is", null).gt("expires_at", nowIso).order("claimed_at", { ascending: false }).limit(20),
    supabase.from("nexus_drops").select("*").eq("from_user", me).gt("expires_at", nowIso).order("created_at", { ascending: false }).limit(20),
  ]);
  const next: Partial<HubState> = { loading: false };
  const problems: string[] = [];
  if (inc.status === "fulfilled") {
    next.incoming = inc.value;
    const ids = new Set(inc.value.map((d) => d.id));
    if (known) {
      const fresh = inc.value.filter((d) => !known!.has(d.id));
      if (fresh.length) toast(fresh.length === 1 ? `New drop: ${fresh[0].name}` : `${fresh.length} new drops waiting`, "info");
    }
    known = ids;
    if (isIosLike()) for (const row of inc.value.slice(0, 3)) void prefetchBlob(row);
  } else problems.push(friendlyDropError(inc.reason));
  if (rec.status === "fulfilled" && !rec.value.error) next.received = (rec.value.data ?? []) as NexusDrop[];
  else problems.push(rec.status === "fulfilled" ? friendlyDropError(errorText(rec.value.error)) : friendlyDropError(rec.reason));
  if (snt.status === "fulfilled" && !snt.value.error) {
    const rows = (snt.value.data ?? []) as NexusDrop[];
    const ids = [...new Set(rows.map((r) => r.to_user).filter((id) => id !== me))];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data } = await supabase.from("profiles").select("id, username").in("id", ids);
      for (const p of (data ?? []) as { id: string; username: string }[]) names.set(p.id, p.username);
    }
    next.sent = rows.map((r) => ({ ...r, to_name: r.to_user === me ? null : names.get(r.to_user) ?? null }));
  } else problems.push(snt.status === "fulfilled" ? friendlyDropError(errorText(snt.value.error)) : friendlyDropError(snt.reason));
  next.error = problems.length ? problems[0] : null;
  set(next);
}

let watchers = 0;
let channel: ReturnType<typeof supabase.channel> | null = null;
let watchedUser: string | null = null;
let poll: ReturnType<typeof setInterval> | null = null;

function onVisible() {
  if (document.visibilityState === "visible") void refreshHub();
}

/** Keep the hub live while a Drop screen is mounted. Returns a stop function (call it on unmount). */
export function startDropHub(userId: string): () => void {
  watchers++;
  if (!channel || watchedUser !== userId) {
    if (channel) void supabase.removeChannel(channel);
    watchedUser = userId;
    known = null;
    channel = supabase
      .channel(`drop-hub:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "nexus_drops", filter: `to_user=eq.${userId}` }, () => void refreshHub())
      .on("postgres_changes", { event: "*", schema: "public", table: "nexus_drops", filter: `from_user=eq.${userId}` }, () => void refreshHub())
      .subscribe();
    poll = setInterval(() => void refreshHub(), 45_000);
    document.addEventListener("visibilitychange", onVisible);
  }
  void refreshHub();
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    watchers = Math.max(0, watchers - 1);
    if (watchers === 0) {
      if (channel) void supabase.removeChannel(channel);
      channel = null;
      watchedUser = null;
      if (poll) clearInterval(poll);
      poll = null;
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}

// ------------------------------------------------------------------ sending
const patch = (id: string, change: Partial<QItem>) => set((s) => ({ queue: s.queue.map((q) => (q.id === id ? { ...q, ...change } : q)) }));

function pump() {
  const { queue } = get();
  let active = queue.filter((q) => q.status === "sending").length;
  for (const item of queue) {
    if (active >= CONCURRENCY) break;
    if (item.status !== "queued") continue;
    active++;
    void run(item);
  }
}

async function run(item: QItem) {
  const ctrl = new AbortController();
  controllers.set(item.id, ctrl);
  patch(item.id, { status: "sending", progress: 0, error: undefined });
  try {
    await sendDrop(item.file, item.to || undefined, { signal: ctrl.signal, onProgress: (r) => patch(item.id, { progress: r }) });
    patch(item.id, { status: "done", progress: 1 });
    void refreshHub();
    setTimeout(() => set((s) => ({ queue: s.queue.filter((q) => !(q.id === item.id && q.status === "done")) })), 6000);
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") patch(item.id, { status: "cancelled" });
    else patch(item.id, { status: "error", error: friendlyDropError(error) });
  } finally {
    controllers.delete(item.id);
    pump();
  }
}

/** Add files to the send queue. `to` is a username, or empty for your own other screens. */
export function enqueue(files: File[], to = ""): number {
  if (!meId()) {
    toast("Sign in to send drops", "error");
    return 0;
  }
  const renamed = files.map((f) => {
    const name = niceFileName(f.name, f.type);
    return name === f.name ? f : new File([f], name, { type: f.type, lastModified: f.lastModified });
  });
  const room = DROP_MAX_FILES - get().queue.filter((q) => q.status === "queued" || q.status === "sending").length;
  const plan = planBatch(renamed, Math.max(0, room));
  if (plan.rejected.length) {
    const first = plan.rejected[0];
    toast(plan.rejected.length === 1 ? `Skipped ${first.name}: ${first.reason}` : `Skipped ${plan.rejected.length} files (${first.reason}…)`, "error");
  }
  const target = cleanUsername(to);
  const items: QItem[] = plan.ok.map((i) => ({ id: crypto.randomUUID(), file: renamed[i], to: target, status: "queued", progress: 0 }));
  if (!items.length) return 0;
  set((s) => ({ queue: [...s.queue, ...items] }));
  pump();
  return items.length;
}

export function cancelItem(id: string) {
  const ctrl = controllers.get(id);
  if (ctrl) ctrl.abort();
  else patch(id, { status: "cancelled" });
}

export function retryItem(id: string) {
  patch(id, { status: "queued", progress: 0, error: undefined });
  pump();
}

export function clearFinished() {
  set((s) => ({ queue: s.queue.filter((q) => q.status === "queued" || q.status === "sending") }));
}

// ------------------------------------------------------------------ receiving
const thumbs = new Map<string, { url: string; at: number }>();
const blobs = new Map<string, Blob>();

/** A short-lived inline URL for image thumbnails (not a download link). */
export async function thumbUrl(row: NexusDrop): Promise<string | null> {
  if (dropKind(row.mime, row.name) !== "image" || row.bytes > 15 * 1024 * 1024) return null;
  const hit = thumbs.get(row.id);
  if (hit && Date.now() - hit.at < 240_000) return hit.url;
  const { data, error } = await supabase.storage.from("nexus-drops").createSignedUrl(row.path, 300);
  if (error || !data?.signedUrl) return null;
  thumbs.set(row.id, { url: data.signedUrl, at: Date.now() });
  return data.signedUrl;
}

async function fetchBlob(row: NexusDrop): Promise<Blob> {
  const cached = blobs.get(row.id);
  if (cached) return cached;
  const url = await openDrop(row);
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status === 400 || res.status === 404 ? "Object not found" : `Download failed (${res.status})`);
  const blob = await res.blob();
  blobs.set(row.id, blob);
  while (blobs.size > 3) blobs.delete(blobs.keys().next().value as string);
  return blob;
}

/** iPhone: have the bytes ready so the share sheet can open inside the tap. */
export async function prefetchBlob(row: NexusDrop): Promise<void> {
  if (row.bytes > MAX_PREFETCH || blobs.has(row.id)) return;
  try {
    await fetchBlob(row);
  } catch {
    /* best effort; Save fetches again */
  }
}

function anchorDownload(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 1000);
}

export type SaveResult = "saved" | "ready";

/**
 * Save a drop. `claim` marks a pending drop as taken once the save starts; pass false to re-download one you already took.
 * "ready" (iPhone only) means the file is downloaded but Safari wanted a fresh tap: tap Save once more and it opens instantly.
 */
export async function saveDrop(row: NexusDrop, claim = true): Promise<SaveResult> {
  try {
    if (isIosLike()) {
      const blob = await fetchBlob(row);
      const file = new File([blob], row.name, { type: row.mime || blob.type || "application/octet-stream" });
      if (typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: row.name });
        } catch (error) {
          const name = (error as Error).name;
          if (name === "AbortError") throw new Error("Save cancelled. The file is still in your inbox.");
          if (name === "NotAllowedError") return "ready";
          throw error;
        }
        if (claim) await claimDrop(row.id);
        blobs.delete(row.id);
        return "saved";
      }
      anchorDownload(URL.createObjectURL(blob), row.name);
      if (claim) await claimDrop(row.id);
      return "saved";
    }
    if (claim) {
      try {
        await openAndClaimDrop(row);
        return "saved";
      } catch (error) {
        if (!/pop-ups/i.test(error instanceof Error ? error.message : "")) throw error;
        // Pop-ups are blocked: a plain download needs no new tab.
        anchorDownload(await openDrop(row), row.name);
        await claimDrop(row.id);
        return "saved";
      }
    }
    anchorDownload(await openDrop(row), row.name);
    return "saved";
  } catch (error) {
    throw new Error(friendlyDropError(error));
  }
}

/** Save every waiting drop (desktop and Android; on iPhone each save needs its own tap). */
export async function saveAll(rows: NexusDrop[]): Promise<number> {
  let n = 0;
  for (const row of rows) {
    try {
      await saveDrop(row, true);
      n++;
      await new Promise((r) => setTimeout(r, 450));
    } catch (error) {
      toast((error as Error).message, "error");
      break;
    }
  }
  await refreshHub();
  return n;
}

/** "Not now": mark it taken so it leaves the inbox. It stays under Received until it expires. */
export async function dismissDrop(row: NexusDrop) {
  await claimDrop(row.id).catch((error) => {
    throw new Error(friendlyDropError(error));
  });
  await refreshHub();
}

/** Sender-side unsend: delete the uploaded file, so the recipient can no longer open it. */
export async function unsendDrop(row: NexusDrop) {
  const { error } = await supabase.storage.from("nexus-drops").remove([row.path]);
  if (error) throw new Error(friendlyDropError(errorText(error)));
  await refreshHub();
}

// ------------------------------------------------------------------ people
export async function searchPeople(query: string): Promise<PersonHit[]> {
  const q = cleanUsername(query).replace(/[\\%_]/g, "");
  if (q.length < 2) return [];
  const me = meId();
  const { data } = await supabase.from("profiles").select("id, username, display_name, avatar_url").ilike("username", `${q}%`).limit(6);
  return ((data ?? []) as PersonHit[]).filter((p) => p.id !== me);
}
