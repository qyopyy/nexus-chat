"use client";

// Nexus Clip · universal clipboard and tab handoff between a person's own devices.
//
// Every item is sealed on this device (AES-256-GCM, key wrapped by a passphrase with Argon2id) before it is sent.
// The server relays and stores ciphertext and can't read any of it. Devices hear about new items instantly over
// Supabase Realtime (WebSocket). The same crypto as Nexus Pass is used (passCrypto.ts).

import { create } from "zustand";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase, errorText } from "@/lib/supabase";
import { useApp, toast } from "@/store/app";
import { KDF_STRONG, checkKdf, newKdf, newVaultKey, openJson, sealJson, unb64, b64, unwrapVaultKey, wrapVaultKey, type Kdf } from "@/lib/passCrypto";
import { DEFAULT_RULES, MAX_IMAGE, buildHandoff, buildPayload, deviceLabel, expiryFor, isExpired, shouldPush, sortClips, type ClipItem, type ClipKind, type ClipPayload } from "@/lib/clipCore";

export type ClipStatus = "loading" | "none" | "locked" | "unlocked" | "error";
export type Device = { id: string; name: string };
type State = {
  status: ClipStatus;
  items: ClipItem[];
  progress: number | null;
  error: string;
  /** devices online right now (this one included) */
  devices: Device[];
  live: boolean;
  remembered: boolean;
  /** the clipboard watcher: "on", "off", or "blocked" when the browser said no */
  watch: "on" | "off" | "blocked";
  /** bumped when a handoff arrives from another device */
  incoming: number;
};
export const useClip = create<State>(() => ({ status: "loading", items: [], progress: null, error: "", devices: [], live: false, remembered: false, watch: "off", incoming: 0 }));
const set = (p: Partial<State>) => useClip.setState(p);

let ck: Uint8Array | null = null;
let meta: { kdf: Kdf; wrapped: string } | null = null;
let channel: RealtimeChannel | null = null;
let channelUser: string | null = null;
let loaded = false;
let sweep: ReturnType<typeof setInterval> | null = null;
const known: string[] = []; // what we last sent or received, so we never bounce an item back
const remember = (t: string) => (known.unshift(t), known.length > 8 && (known.length = 8));
const me = () => useApp.getState().userId;

// ------------------------------------------------------------------ settings and identity (this device)
export type ClipSettings = { watch: boolean; autoCopy: boolean; wipe: boolean; sensitiveSec: number; historyDays: number };
export const DEFAULT_SETTINGS: ClipSettings = { watch: true, autoCopy: false, wipe: true, sensitiveSec: 60, historyDays: 0 };
const SKEY = "nexus.clip.settings.v1";
export function getSettings(): ClipSettings {
  try {
    const o = JSON.parse(localStorage.getItem(SKEY) ?? "{}") as Partial<ClipSettings>;
    return {
      watch: o.watch !== false,
      autoCopy: o.autoCopy === true,
      wipe: o.wipe !== false,
      sensitiveSec: [15, 30, 60, 120, 300].includes(o.sensitiveSec as number) ? (o.sensitiveSec as number) : DEFAULT_SETTINGS.sensitiveSec,
      historyDays: [0, 1, 7, 30].includes(o.historyDays as number) ? (o.historyDays as number) : 0,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
export function saveSettings(p: Partial<ClipSettings>) {
  try {
    localStorage.setItem(SKEY, JSON.stringify({ ...getSettings(), ...p }));
  } catch {
    /* private mode */
  }
  if (ck) restartWatch();
}
const rules = () => ({ ...DEFAULT_RULES, sensitiveSec: getSettings().sensitiveSec, historyDays: getSettings().historyDays });

const DKEY = "nexus.clip.device.v1";
let device: Device | null = null;
export function getDevice(): Device {
  if (device) return device;
  try {
    const o = JSON.parse(localStorage.getItem(DKEY) ?? "null") as Device | null;
    if (o?.id && o.name) return (device = o);
  } catch {
    /* fall through */
  }
  const d = { id: crypto.randomUUID(), name: deviceLabel(typeof navigator === "undefined" ? "" : navigator.userAgent) };
  try {
    localStorage.setItem(DKEY, JSON.stringify(d));
  } catch {
    /* ignore */
  }
  return (device = d);
}
export function renameDevice(name: string) {
  const d = { ...getDevice(), name: name.trim().slice(0, 40) || getDevice().name };
  device = d;
  try {
    localStorage.setItem(DKEY, JSON.stringify(d));
  } catch {
    /* ignore */
  }
  void channel?.track(d);
}

// ------------------------------------------------------------------ "keep unlocked on this device"
const IDB = "nexus-clip";
const idb = <T,>(f: (s: IDBObjectStore) => IDBRequest<T>, mode: IDBTransactionMode = "readonly") =>
  new Promise<T>((res, rej) => {
    const o = indexedDB.open(IDB, 1);
    o.onupgradeneeded = () => o.result.createObjectStore("k");
    o.onerror = () => rej(o.error);
    o.onsuccess = () => {
      const r = f(o.result.transaction("k", mode).objectStore("k"));
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    };
  });
const rkey = (uid: string) => `nexus.clip.remember.${uid}`;
async function rememberKey(uid: string, key: Uint8Array) {
  const dk = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await idb((s) => s.put(dk, `dk.${uid}`), "readwrite");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, dk, key as BufferSource));
  localStorage.setItem(rkey(uid), JSON.stringify({ iv: b64(iv), ct: b64(ct) }));
}
async function recallKey(uid: string): Promise<Uint8Array | null> {
  try {
    const o = JSON.parse(localStorage.getItem(rkey(uid)) ?? "null") as { iv: string; ct: string } | null;
    const dk = (await idb((s) => s.get(`dk.${uid}`))) as CryptoKey | undefined;
    if (!o || !dk) return null;
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(o.iv) as BufferSource }, dk, unb64(o.ct) as BufferSource));
  } catch {
    return null;
  }
}
export function forgetDeviceKey() {
  const uid = me();
  if (!uid) return;
  try {
    localStorage.removeItem(rkey(uid));
  } catch {
    /* ignore */
  }
  void idb((s) => s.delete(`dk.${uid}`), "readwrite").catch(() => {});
  set({ remembered: false });
}

// ------------------------------------------------------------------ start up / create / unlock / lock
export async function initClip(force = false) {
  const uid = me();
  if (!uid || (loaded && !force)) return;
  loaded = true;
  set({ status: "loading", error: "" });
  const { data, error } = await supabase.from("clip_keys").select("kdf,wrapped_key").eq("owner_id", uid).maybeSingle();
  if (error) {
    loaded = false;
    return set({ status: "error", error: errorText(error) });
  }
  if (!data) {
    meta = null;
    return set({ status: "none" });
  }
  try {
    meta = { kdf: checkKdf(data.kdf), wrapped: data.wrapped_key as string };
  } catch (e) {
    return set({ status: "error", error: e instanceof Error ? e.message : "Unreadable key" });
  }
  const had = !!localStorage.getItem(rkey(uid));
  set({ status: ck ? "unlocked" : "locked", remembered: had });
  if (!ck && had) {
    const k = await recallKey(uid);
    if (k) await open(k);
    else forgetDeviceKey();
  }
}

export const MIN_PASS = 8;
const progress = (f: number) => set({ progress: f });

export async function createClipKey(passphrase: string, keep: boolean): Promise<boolean> {
  const uid = me();
  if (!uid) return false;
  if (passphrase.length < MIN_PASS) return set({ error: `Use at least ${MIN_PASS} characters.` }), false;
  set({ error: "", progress: 0 });
  try {
    const kdf = newKdf(KDF_STRONG);
    const key = newVaultKey();
    const wrapped = await wrapVaultKey(key, passphrase, kdf, progress);
    const { error } = await supabase.from("clip_keys").insert({ owner_id: uid, kdf, wrapped_key: wrapped });
    if (error) throw new Error(errorText(error));
    meta = { kdf, wrapped };
    if (keep) await rememberKey(uid, key).then(() => set({ remembered: true })).catch(() => {});
    set({ progress: null });
    await open(key);
    return true;
  } catch (e) {
    set({ progress: null, error: e instanceof Error ? e.message : "Couldn't set up Nexus Clip." });
    return false;
  }
}

let fails = 0;
let lockedUntil = 0;
export async function unlockClip(passphrase: string, keep: boolean): Promise<boolean> {
  const uid = me();
  if (!meta || !uid) return false;
  const wait = lockedUntil - Date.now();
  if (wait > 0) return set({ error: `Too many tries. Wait ${Math.ceil(wait / 1000)} s.` }), false;
  set({ error: "", progress: 0 });
  const key = await unwrapVaultKey(meta.wrapped, passphrase, meta.kdf, progress);
  set({ progress: null });
  if (!key) {
    fails++;
    if (fails >= 3) lockedUntil = Date.now() + Math.min(30_000, 2 ** (fails - 2) * 1000);
    set({ error: "Wrong passphrase." });
    return false;
  }
  fails = 0;
  if (keep) await rememberKey(uid, key).then(() => set({ remembered: true })).catch(() => {});
  await open(key);
  return true;
}

async function open(key: Uint8Array) {
  ck = key;
  set({ status: "unlocked", error: "" });
  await loadItems();
  void supabase.rpc("clip_purge");
  subscribe();
  startSweep();
  restartWatch();
}

export function lockClip() {
  ck = null;
  stopWatch();
  if (sweep) clearInterval(sweep);
  sweep = null;
  if (channel) void supabase.removeChannel(channel);
  channel = null;
  channelUser = null;
  set({ status: meta ? "locked" : "none", items: [], progress: null, error: "", devices: [], live: false });
}
export function resetClip() {
  lockClip();
  meta = null;
  loaded = false;
  known.length = 0;
  set({ status: "loading", remembered: false });
}

/** Forgot the passphrase? Nothing can be recovered (that is the point), so start over with an empty clipboard history. */
export async function resetClipKey(): Promise<boolean> {
  const uid = me();
  if (!uid) return false;
  const a = await supabase.from("clip_items").delete().eq("owner_id", uid);
  const b = await supabase.from("clip_keys").delete().eq("owner_id", uid);
  if (a.error || b.error) return toast(errorText(a.error ?? b.error), "error"), false;
  forgetDeviceKey();
  resetClip();
  await initClip(true);
  return true;
}

// ------------------------------------------------------------------ items
type Row = { id: string; kind: ClipKind; blob: string; pinned: boolean; sensitive: boolean; expires_at: string | null; created_at: string };
async function toItem(r: Row): Promise<ClipItem | null> {
  if (!ck) return null;
  try {
    const payload = await openJson<ClipPayload>(ck, r.blob, "clip:" + r.id);
    if (payload?.v !== 1) return null;
    return { id: r.id, kind: r.kind, pinned: r.pinned, sensitive: r.sensitive, expiresAt: r.expires_at ? +new Date(r.expires_at) : null, createdAt: +new Date(r.created_at), payload };
  } catch {
    return null; // not sealed with our key
  }
}
export async function loadItems() {
  const uid = me();
  const key = ck;
  if (!uid || !key) return;
  const { data, error } = await supabase.from("clip_items").select("id,kind,blob,pinned,sensitive,expires_at,created_at").eq("owner_id", uid).order("created_at", { ascending: false }).limit(400);
  if (error) return void toast(errorText(error), "error");
  const out: ClipItem[] = [];
  for (const r of (data ?? []) as Row[]) {
    const it = await toItem(r);
    if (it && !isExpired(it, Date.now())) out.push(it);
  }
  if (ck === key) set({ items: sortClips(out) });
}

const upsertLocal = (it: ClipItem) => useClip.setState((s) => ({ items: sortClips([it, ...s.items.filter((x) => x.id !== it.id)]) }));

async function push(payload: ClipPayload, sensitive: boolean, pinned = false): Promise<ClipItem | null> {
  const uid = me();
  if (!ck || !uid) return null;
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const expiresAt = expiryFor(payload.kind, sensitive, pinned, createdAt, rules());
  const blob = await sealJson(ck, payload, "clip:" + id);
  const item: ClipItem = { id, kind: payload.kind, pinned, sensitive, expiresAt, createdAt, payload };
  upsertLocal(item);
  const { error } = await supabase.from("clip_items").insert({ id, owner_id: uid, kind: payload.kind, blob, pinned, sensitive, expires_at: expiresAt ? new Date(expiresAt).toISOString() : null });
  if (error) {
    useClip.setState((s) => ({ items: s.items.filter((x) => x.id !== id) }));
    toast(errorText(error), "error");
    return null;
  }
  return item;
}

export async function sendText(text: string): Promise<ClipItem | null> {
  const ok = shouldPush(text, []);
  if (!ok.ok) {
    toast(ok.why === "too_big" ? "That's too big to sync (200,000 characters max)." : "Nothing to send.", "error");
    return null;
  }
  remember(ok.text);
  const b = buildPayload(ok.text, getDevice().name);
  return push(b.payload, b.sensitive);
}

export async function sendHandoff(o: { url: string; title?: string; at?: number | null }): Promise<boolean> {
  const p = buildHandoff(o, getDevice().name);
  if (!p) {
    toast("Paste a full web link (https://…).", "error");
    return false;
  }
  return !!(await push(p, false));
}

/** Shrink a picture so it syncs fast and fits the limit. */
export async function shrinkImage(blob: Blob): Promise<string | null> {
  try {
    const bmp = await createImageBitmap(blob);
    for (const [max, q] of [[1600, 0.85], [1280, 0.75], [960, 0.7], [720, 0.6]] as const) {
      const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(bmp.width * k));
      c.height = Math.max(1, Math.round(bmp.height * k));
      c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
      const url = c.toDataURL("image/webp", q);
      const out = url.startsWith("data:image/webp") ? url : c.toDataURL("image/jpeg", q);
      if (out.length <= MAX_IMAGE) return out;
    }
  } catch {
    /* not an image */
  }
  return null;
}
export async function sendImage(blob: Blob): Promise<boolean> {
  const image = await shrinkImage(blob);
  if (!image) return toast("Couldn't shrink that picture enough to sync.", "error"), false;
  return !!(await push({ v: 1, kind: "image", image, from: getDevice().name }, false));
}

export async function setPinned(id: string, pinned: boolean) {
  const it = useClip.getState().items.find((x) => x.id === id);
  if (!it) return;
  const expiresAt = expiryFor(it.kind, it.sensitive, pinned, Date.now(), rules());
  upsertLocal({ ...it, pinned, expiresAt });
  const { error } = await supabase.from("clip_items").update({ pinned, expires_at: expiresAt ? new Date(expiresAt).toISOString() : null }).eq("id", id);
  if (error) {
    upsertLocal(it);
    toast(errorText(error), "error");
  }
}
export async function removeClip(id: string) {
  const prev = useClip.getState().items;
  useClip.setState({ items: prev.filter((x) => x.id !== id) });
  const { error } = await supabase.from("clip_items").delete().eq("id", id);
  if (error) {
    useClip.setState({ items: prev });
    toast(errorText(error), "error");
  }
}
export async function clearHistory(keepPinned = true) {
  const uid = me();
  if (!uid) return;
  const gone = useClip.getState().items.filter((x) => !(keepPinned && x.pinned)).map((x) => x.id);
  if (!gone.length) return;
  useClip.setState((s) => ({ items: s.items.filter((x) => keepPinned && x.pinned) }));
  const { error } = await supabase.from("clip_items").delete().in("id", gone);
  if (error) {
    toast(errorText(error), "error");
    void loadItems();
  }
}

/** Put an item on this device's clipboard. */
export async function copyItem(it: ClipItem): Promise<boolean> {
  try {
    if (it.kind === "image" && it.payload.image) {
      const blob = await (await fetch(it.payload.image)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    } else {
      const t = it.payload.url ?? it.payload.text ?? "";
      remember(t);
      await navigator.clipboard.writeText(t);
    }
    toast(it.sensitive ? `Copied. It disappears in ${getSettings().sensitiveSec} s.` : "Copied", "success");
    return true;
  } catch {
    toast("Couldn't copy. Allow clipboard access.", "error");
    return false;
  }
}

// ------------------------------------------------------------------ live sync
function subscribe() {
  const uid = me();
  if (!uid || (channel && channelUser === uid)) return;
  if (channel) void supabase.removeChannel(channel);
  channelUser = uid;
  const dev = getDevice();
  channel = supabase
    .channel(`clip:${uid}`, { config: { presence: { key: dev.id } } })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "clip_items", filter: `owner_id=eq.${uid}` }, (p) => void onRow(p.new as Row))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "clip_items", filter: `owner_id=eq.${uid}` }, (p) => void onRow(p.new as Row))
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "clip_items" }, (p) => {
      const id = (p.old as { id?: string })?.id;
      if (id) useClip.setState((s) => ({ items: s.items.filter((x) => x.id !== id) }));
    })
    .on("presence", { event: "sync" }, () => {
      const st = channel?.presenceState() as Record<string, { id?: string; name?: string }[]> | undefined;
      const list: Device[] = [];
      for (const metas of Object.values(st ?? {})) for (const m of metas) if (m.id && m.name && !list.some((d) => d.id === m.id)) list.push({ id: m.id, name: m.name });
      set({ devices: list });
    })
    .subscribe((s: string) => {
      set({ live: s === "SUBSCRIBED" });
      if (s === "SUBSCRIBED") {
        void channel?.track(getDevice());
        void loadItems(); // catch up on anything sent while we were offline
      }
    });
}

async function onRow(r: Row) {
  const it = await toItem(r);
  if (!it || isExpired(it, Date.now())) return;
  const had = useClip.getState().items.some((x) => x.id === it.id);
  upsertLocal(it);
  if (had) return;
  // our own sends are already in the list, so anything new here came from another device
  if (it.kind === "handoff") return void set({ incoming: useClip.getState().incoming + 1 });
  if (getSettings().autoCopy && it.kind !== "image" && !it.sensitive) {
    try {
      const t = it.payload.url ?? it.payload.text ?? "";
      remember(t);
      await navigator.clipboard.writeText(t);
    } catch {
      /* page not focused: the item is still in the list */
    }
  }
}

// ------------------------------------------------------------------ expiry sweep
function startSweep() {
  if (sweep) clearInterval(sweep);
  sweep = setInterval(() => {
    const now = Date.now();
    const gone = useClip.getState().items.filter((x) => isExpired(x, now));
    if (!gone.length) return;
    useClip.setState((s) => ({ items: s.items.filter((x) => !isExpired(x, now)) }));
    if (getSettings().wipe) {
      void (async () => {
        try {
          const cur = await navigator.clipboard.readText();
          if (gone.some((g) => g.sensitive && (g.payload.text ?? "") === cur)) await navigator.clipboard.writeText("");
        } catch {
          /* tab in background */
        }
      })();
    }
    void supabase.rpc("clip_purge");
  }, 1000);
}

// ------------------------------------------------------------------ clipboard watcher
let poll: ReturnType<typeof setInterval> | null = null;
let busy = false;
let denied = false;
async function check() {
  if (busy || !ck || document.visibilityState !== "visible" || !document.hasFocus()) return;
  busy = true;
  try {
    const text = await navigator.clipboard.readText();
    denied = false;
    if (useClip.getState().watch === "blocked") set({ watch: "on" });
    const ok = shouldPush(text, known);
    if (ok.ok) {
      remember(ok.text);
      const b = buildPayload(ok.text, getDevice().name);
      await push(b.payload, b.sensitive);
    } else if (ok.why === "empty") {
      // maybe a picture
      try {
        for (const ci of await navigator.clipboard.read()) {
          const type = ci.types.find((t) => t.startsWith("image/"));
          if (!type) continue;
          const blob = await ci.getType(type);
          const sig = `img:${blob.size}:${blob.type}`;
          if (known.includes(sig)) break;
          remember(sig);
          await sendImage(blob);
          break;
        }
      } catch {
        /* no image or not allowed */
      }
    }
  } catch (e) {
    if (!denied && (e as Error)?.name === "NotAllowedError") {
      denied = true;
      set({ watch: "blocked" });
    }
  } finally {
    busy = false;
  }
}
const onCopy = () => setTimeout(() => void check(), 50);
export function startWatch() {
  if (poll || typeof window === "undefined") return;
  set({ watch: denied ? "blocked" : "on" });
  poll = setInterval(() => void check(), 1500);
  window.addEventListener("focus", onCopy);
  document.addEventListener("copy", onCopy);
  document.addEventListener("cut", onCopy);
  void check();
}
export function stopWatch() {
  if (poll) clearInterval(poll);
  poll = null;
  if (typeof window !== "undefined") {
    window.removeEventListener("focus", onCopy);
    document.removeEventListener("copy", onCopy);
    document.removeEventListener("cut", onCopy);
  }
  set({ watch: "off" });
}
function restartWatch() {
  stopWatch();
  if (getSettings().watch) startWatch();
}

// A different account (or a sign-out) on this device must never see the previous person's clipboard.
if (typeof window !== "undefined") {
  let last = useApp.getState().userId;
  useApp.subscribe((s: { userId: string | null }) => {
    if (s.userId !== last) {
      last = s.userId;
      resetClip();
    }
  });
}
