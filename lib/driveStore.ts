"use client";

// Nexus Drive: the upload queue. Big files go up in 6 MB pieces over TUS so a drop, a pause or a closed tab
// never costs more than the piece in flight. Everything is stored exactly as given: no compression, so
// lossless audio and camera originals stay lossless.

import { create } from "zustand";
import { supabase, errorText } from "./supabase";
import { useApp, toast } from "@/store/app";
import { fingerprint, cleanFolder } from "./driveFolders";
import { tusUpload, tusCancel, makeMeter, TusAbort, type TusReq, type TusRes } from "./driveTus";
import { guessVaultKind, probeMediaDuration, vaultUsage, vaultIsUnlimited, fmtBytes, type VaultFile } from "./protect";

const BUCKET = "user-vault";
const RESUME_KEY = "nexus.drive.resume.v1";
const MAX_PARALLEL = 2;

export type TState = "queued" | "uploading" | "paused" | "done" | "error";
export type Transfer = {
  key: string; // fingerprint
  name: string;
  size: number;
  folder: string;
  state: TState;
  sent: number;
  rate: number;
  error?: string;
  fileId?: string;
};
type Saved = { id: string; path: string; url?: string; name: string; size: number; folder: string; mime: string; ts: number };

const me = () => useApp.getState().userId!;

// ------------------------------------------------------------------ what a reload remembers
function readSaved(): Record<string, Saved> {
  try {
    const raw = JSON.parse(localStorage.getItem(`${RESUME_KEY}.${me()}`) ?? "{}") as Record<string, Saved>;
    const week = 7 * 86400_000; // the server drops idle uploads after about a day; keep notes for a week at most
    return Object.fromEntries(Object.entries(raw).filter(([, v]) => Date.now() - v.ts < week));
  } catch {
    return {};
  }
}
function writeSaved(m: Record<string, Saved>) {
  try {
    localStorage.setItem(`${RESUME_KEY}.${me()}`, JSON.stringify(m));
  } catch {
    /* private mode: uploads still work, they just can't continue after a reload */
  }
}
export const unfinished = () => Object.entries(readSaved()).map(([key, v]) => ({ key, name: v.name, size: v.size, folder: v.folder }));
export function forgetUnfinished(key: string) {
  const m = readSaved();
  const s = m[key];
  delete m[key];
  writeSaved(m);
  if (s?.url) void tusCancel(s.url, authHeaders, xhrTransport);
}

// ------------------------------------------------------------------ network
export const resumableEndpoint = () => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`;
export async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" };
}
export const xhrTransport = (r: TusReq): Promise<TusRes> =>
  new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open(r.method, r.url);
    for (const [k, v] of Object.entries(r.headers)) x.setRequestHeader(k, v);
    if (r.onProgress) x.upload.onprogress = (e) => e.lengthComputable && r.onProgress!(e.loaded);
    x.onload = () => resolve({ status: x.status, header: (n) => x.getResponseHeader(n) });
    x.onerror = () => resolve({ status: 0, header: () => null });
    x.ontimeout = () => resolve({ status: 0, header: () => null });
    x.onabort = () => reject(new DOMException("aborted", "AbortError"));
    r.signal?.addEventListener("abort", () => x.abort(), { once: true });
    x.send(r.body ?? null);
  });

// ------------------------------------------------------------------ store
type S = {
  items: Transfer[];
  /** bumped whenever a file lands, so lists know to reload */
  landed: number;
};
export const useDrive = create<S>(() => ({ items: [], landed: 0 }));
const files = new Map<string, File>();
const ctls = new Map<string, AbortController>();
const meters = new Map<string, ReturnType<typeof makeMeter>>();

const patch = (key: string, p: Partial<Transfer>) => useDrive.setState((s) => ({ items: s.items.map((t) => (t.key === key ? { ...t, ...p } : t)) }));

export function addFiles(list: { file: File; folder: string }[]) {
  const saved = readSaved();
  const fresh: Transfer[] = [];
  for (const { file, folder } of list) {
    const f = cleanFolder(folder);
    const key = fingerprint(file, f);
    const existing = useDrive.getState().items.find((t) => t.key === key);
    if (existing && existing.state !== "done" && existing.state !== "error") continue; // already in the queue
    files.set(key, file);
    if (!saved[key]) saved[key] = { id: crypto.randomUUID(), path: "", name: file.name, size: file.size, folder: f, mime: file.type || "application/octet-stream", ts: Date.now() };
    const s = saved[key]!;
    if (!s.path) s.path = `${me()}/${s.id}/${file.name.replace(/[^\w.\- ()]+/g, "_").slice(-120) || "file"}`;
    s.ts = Date.now();
    fresh.push({ key, name: file.name, size: file.size, folder: f, state: "queued", sent: 0, rate: 0 });
  }
  writeSaved(saved);
  useDrive.setState((s) => ({ items: [...s.items.filter((t) => !fresh.some((n) => n.key === t.key)), ...fresh] }));
  pump();
  return fresh.length;
}

export function pause(key: string) {
  ctls.get(key)?.abort();
  const t = useDrive.getState().items.find((x) => x.key === key);
  if (t?.state === "queued") patch(key, { state: "paused" });
}
export function resume(key: string) {
  const t = useDrive.getState().items.find((x) => x.key === key);
  if (!t || (t.state !== "paused" && t.state !== "error")) return;
  if (!files.has(key)) return toast("Add this file again to continue", "info");
  patch(key, { state: "queued", error: undefined });
  pump();
}
export function cancel(key: string) {
  ctls.get(key)?.abort();
  forgetUnfinished(key);
  files.delete(key);
  useDrive.setState((s) => ({ items: s.items.filter((t) => t.key !== key) }));
}
export const pauseAll = () => useDrive.getState().items.forEach((t) => (t.state === "uploading" || t.state === "queued") && pause(t.key));
export const resumeAll = () => useDrive.getState().items.forEach((t) => t.state === "paused" && resume(t.key));
export const clearFinished = () => useDrive.setState((s) => ({ items: s.items.filter((t) => t.state !== "done") }));

function pump() {
  const { items } = useDrive.getState();
  let running = items.filter((t) => t.state === "uploading").length;
  for (const t of items) {
    if (running >= MAX_PARALLEL) break;
    if (t.state === "queued") {
      running++;
      void run(t.key);
    }
  }
}

async function run(key: string) {
  const file = files.get(key);
  const saved = readSaved()[key];
  if (!file || !saved) return patch(key, { state: "error", error: "File is no longer available" });
  const ctl = new AbortController();
  ctls.set(key, ctl);
  const meter = makeMeter();
  meters.set(key, meter);
  patch(key, { state: "uploading", error: undefined });
  try {
    // space check before any bytes move (the database enforces it again when the file is registered)
    const u = await vaultUsage();
    if (!vaultIsUnlimited(u.limit) && u.used + file.size > u.limit) throw new Error(`Not enough space: ${fmtBytes(file.size)} needed, ${fmtBytes(Math.max(0, u.limit - u.used))} free.`);
    const mime = saved.mime || "application/octet-stream";
    await tusUpload({
      endpoint: resumableEndpoint(),
      file,
      bucket: BUCKET,
      objectName: saved.path,
      contentType: mime,
      headers: authHeaders,
      transport: xhrTransport,
      resumeUrl: saved.url,
      signal: ctl.signal,
      onUrl: (url) => {
        const m = readSaved();
        if (m[key]) m[key] = { ...m[key]!, url };
        writeSaved(m);
      },
      onProgress: (sent) => {
        meter.push(sent);
        patch(key, { sent, rate: meter.rate() });
      },
    });
    patch(key, { sent: file.size, rate: 0 });
    // register it in the drive only now that every byte is stored, so nothing half-finished ever shows in the list
    let duration_ms: number | null = null;
    if (/^(audio|video)\//.test(mime) || /\.(mp3|wav|flac|aiff?|m4a|ogg|mp4|mov|webm|mkv)$/i.test(file.name)) duration_ms = await probeMediaDuration(file).catch(() => null);
    const { error } = await supabase.from("vault_files").insert({
      id: saved.id,
      owner_id: me(),
      path: saved.path,
      name: file.name.slice(0, 300),
      mime: mime || null,
      bytes: file.size,
      folder: saved.folder,
      kind: guessVaultKind(file),
      duration_ms,
    });
    if (error) {
      await supabase.storage.from(BUCKET).remove([saved.path]);
      throw new Error(errorText(error));
    }
    const m = readSaved();
    delete m[key];
    writeSaved(m);
    files.delete(key);
    patch(key, { state: "done", fileId: saved.id });
    useDrive.setState((s) => ({ landed: s.landed + 1 }));
  } catch (e) {
    if (e instanceof TusAbort || (e as Error)?.name === "AbortError") patch(key, { state: "paused", rate: 0 });
    else patch(key, { state: "error", rate: 0, error: e instanceof Error ? e.message : "Upload failed" });
  } finally {
    ctls.delete(key);
    meters.delete(key);
    pump();
  }
}

/** Warn before closing the tab while bytes are moving. */
export function guardUnload() {
  const h = (e: BeforeUnloadEvent) => {
    if (useDrive.getState().items.some((t) => t.state === "uploading")) {
      e.preventDefault();
      e.returnValue = "";
    }
  };
  window.addEventListener("beforeunload", h);
  return () => window.removeEventListener("beforeunload", h);
}

export type { VaultFile };
