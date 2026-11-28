"use client";

// Nexus Pass · the vault on this device: create / unlock / lock, items, quick unlock (PIN, biometrics), auto-lock, clipboard clean-up.
// The master password, the vault key and the decrypted items only ever exist in this tab's memory.
// Crypto rules live in passCrypto.ts; item shapes and import/export in passItems.ts.

import { create } from "zustand";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase, errorText } from "@/lib/supabase";
import { useApp, toast } from "@/store/app";
import { KDF_PIN, KDF_STRONG, b64, checkKdf, decryptExport, encryptExport, newKdf, newVaultKey, openJson, sealJson, unb64, unwrapVaultKey, wrapVaultKey, type EncryptedExport, type Kdf } from "@/lib/passCrypto";
import { cleanItem, dedupe, exportCsv, exportJson, type PassItem } from "@/lib/passItems";

export type PassStatus = "loading" | "none" | "locked" | "unlocked" | "error";
type PassState = {
  status: PassStatus;
  items: PassItem[];
  /** items that could not be opened (wrong key or damaged), shown as a count only */
  broken: number;
  progress: number | null;
  hasPin: boolean;
  hasBio: boolean;
  error: string;
};
export const usePass = create<PassState>(() => ({ status: "loading", items: [], broken: 0, progress: null, hasPin: false, hasBio: false, error: "" }));
const set = (p: Partial<PassState>) => usePass.setState(p);

let vk: Uint8Array | null = null;
let meta: { kdf: Kdf; wrapped: string } | null = null;
let channel: RealtimeChannel | null = null;
let channelUser: string | null = null;
let loaded = false;

const me = () => useApp.getState().userId;
const progress = (f: number) => set({ progress: f });

// ------------------------------------------------------------------ settings kept on this device
export type PassSettings = { autoLockMin: number; clipSec: number; lockOnHide: boolean };
const SETTINGS_KEY = "nexus.pass.settings.v1";
export const DEFAULT_SETTINGS: PassSettings = { autoLockMin: 5, clipSec: 30, lockOnHide: false };
export function getSettings(): PassSettings {
  try {
    const o = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<PassSettings>;
    const min = [0, 1, 5, 15, 60].includes(o.autoLockMin as number) ? (o.autoLockMin as number) : DEFAULT_SETTINGS.autoLockMin;
    const clip = [0, 15, 30, 60, 120].includes(o.clipSec as number) ? (o.clipSec as number) : DEFAULT_SETTINGS.clipSec;
    return { autoLockMin: min, clipSec: clip, lockOnHide: o.lockOnHide === true };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
export function saveSettings(p: Partial<PassSettings>) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...getSettings(), ...p }));
  } catch {
    /* private mode */
  }
}

// ------------------------------------------------------------------ quick unlock config (this device only)
type Quick = { pin?: { kdf: Kdf; wrapped: string; fails: number }; bio?: { cred: string; iv: string; ct: string } };
const quickKey = () => `nexus.pass.quick.${me()}`;
function readQuick(): Quick {
  try {
    return JSON.parse(localStorage.getItem(quickKey()) ?? "{}") as Quick;
  } catch {
    return {};
  }
}
function writeQuick(q: Quick) {
  try {
    if (!q.pin && !q.bio) localStorage.removeItem(quickKey());
    else localStorage.setItem(quickKey(), JSON.stringify(q));
  } catch {
    /* private mode */
  }
  set({ hasPin: !!q.pin, hasBio: !!q.bio });
}
export const MAX_PIN_TRIES = 5;

// ------------------------------------------------------------------ start up
export async function initPass(force = false) {
  const uid = me();
  if (!uid) return;
  if (loaded && !force) return;
  loaded = true;
  set({ status: "loading", error: "" });
  const { data, error } = await supabase.from("pass_vaults").select("kdf,wrapped_vk").eq("owner_id", uid).maybeSingle();
  if (error) {
    loaded = false;
    set({ status: "error", error: errorText(error) });
    return;
  }
  const q = readQuick();
  set({ hasPin: !!q.pin, hasBio: !!q.bio });
  if (!data) {
    meta = null;
    set({ status: "none" });
    return;
  }
  try {
    meta = { kdf: checkKdf(data.kdf), wrapped: data.wrapped_vk as string };
    set({ status: vk ? "unlocked" : "locked" });
  } catch (e) {
    set({ status: "error", error: e instanceof Error ? e.message : "Unreadable vault" });
  }
}

// ------------------------------------------------------------------ create / unlock / lock
export const MIN_MASTER = 10;

export async function createVault(password: string): Promise<boolean> {
  const uid = me();
  if (!uid) return false;
  if (password.length < MIN_MASTER) {
    set({ error: `Use at least ${MIN_MASTER} characters. A passphrase of 4+ words is great.` });
    return false;
  }
  set({ error: "", progress: 0 });
  try {
    const kdf = newKdf(KDF_STRONG);
    const key = newVaultKey();
    const wrapped = await wrapVaultKey(key, password, kdf, progress);
    const { error } = await supabase.from("pass_vaults").insert({ owner_id: uid, kdf, wrapped_vk: wrapped });
    if (error) throw new Error(errorText(error));
    vk = key;
    meta = { kdf, wrapped };
    loaded = true;
    set({ status: "unlocked", items: [], broken: 0, progress: null });
    touch();
    watch();
    return true;
  } catch (e) {
    set({ progress: null, error: e instanceof Error ? e.message : "Couldn't create the vault." });
    return false;
  }
}

let failCount = 0;
let lockedUntil = 0;

export async function unlockWithPassword(password: string): Promise<boolean> {
  if (!meta) return false;
  const wait = lockedUntil - Date.now();
  if (wait > 0) {
    set({ error: `Too many tries. Wait ${Math.ceil(wait / 1000)} s.` });
    return false;
  }
  set({ error: "", progress: 0 });
  const key = await unwrapVaultKey(meta.wrapped, password, meta.kdf, progress);
  set({ progress: null });
  if (!key) {
    failCount++;
    if (failCount >= 3) lockedUntil = Date.now() + Math.min(30_000, 2 ** (failCount - 2) * 1000);
    set({ error: "Wrong master password." });
    return false;
  }
  failCount = 0;
  await open(key);
  return true;
}

async function open(key: Uint8Array) {
  vk = key;
  set({ status: "unlocked", error: "" });
  touch();
  await loadItems();
  watch();
}

export function lockVault() {
  vk = null;
  if (channel) void supabase.removeChannel(channel);
  channel = null;
  channelUser = null;
  set({ status: meta ? "locked" : "none", items: [], broken: 0, progress: null, error: "" });
}

/** Sign-out or account switch: forget everything about the previous person. */
export function resetPass() {
  lockVault();
  meta = null;
  loaded = false;
  set({ status: "loading", hasPin: false, hasBio: false });
}

// ------------------------------------------------------------------ items
export async function loadItems() {
  const uid = me();
  if (!vk || !uid) return;
  const key = vk;
  const { data, error } = await supabase.from("pass_items").select("id,blob").eq("owner_id", uid).limit(10000);
  if (error) {
    toast(errorText(error), "error");
    return;
  }
  const items: PassItem[] = [];
  let broken = 0;
  for (const r of (data ?? []) as { id: string; blob: string }[]) {
    try {
      const it = cleanItem(await openJson(key, r.blob, r.id));
      if (it) items.push({ ...it, id: r.id });
      else broken++;
    } catch {
      broken++;
    }
  }
  if (vk === key) set({ items, broken });
}

export async function saveItem(it: PassItem): Promise<boolean> {
  const uid = me();
  if (!vk || !uid) return false;
  const next: PassItem = { ...it, title: it.title.trim() || "Untitled", updated: Date.now() };
  const blob = await sealJson(vk, next, next.id);
  const { error } = await supabase.from("pass_items").upsert({ id: next.id, owner_id: uid, blob });
  if (error) {
    toast(errorText(error), "error");
    return false;
  }
  usePass.setState((s) => ({ items: s.items.some((x) => x.id === next.id) ? s.items.map((x) => (x.id === next.id ? next : x)) : [next, ...s.items] }));
  touch();
  return true;
}

export async function removeItem(id: string): Promise<boolean> {
  const { error } = await supabase.from("pass_items").delete().eq("id", id);
  if (error) {
    toast(errorText(error), "error");
    return false;
  }
  usePass.setState((s) => ({ items: s.items.filter((x) => x.id !== id) }));
  return true;
}

/** Add many items (import). Returns how many were new. */
export async function addItems(list: PassItem[]): Promise<{ added: number; dupes: number }> {
  const uid = me();
  if (!vk || !uid) return { added: 0, dupes: 0 };
  const { fresh, dupes } = dedupe(usePass.getState().items, list);
  const key = vk;
  const rows: { id: string; owner_id: string; blob: string }[] = [];
  for (const it of fresh) rows.push({ id: it.id, owner_id: uid, blob: await sealJson(key, it, it.id) });
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await supabase.from("pass_items").upsert(rows.slice(i, i + 100));
    if (error) throw new Error(errorText(error));
  }
  usePass.setState((s) => ({ items: [...fresh, ...s.items] }));
  touch();
  return { added: fresh.length, dupes };
}

function watch() {
  const uid = me();
  if (!uid || (channel && channelUser === uid)) return;
  if (channel) void supabase.removeChannel(channel);
  channelUser = uid;
  channel = supabase
    .channel(`pass-items:${uid}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "pass_items", filter: `owner_id=eq.${uid}` }, () => void loadItems())
    .subscribe();
}

// ------------------------------------------------------------------ master password, export
export async function changeMasterPassword(oldPw: string, newPw: string): Promise<boolean> {
  const uid = me();
  if (!meta || !vk || !uid) return false;
  if (newPw.length < MIN_MASTER) {
    set({ error: `Use at least ${MIN_MASTER} characters.` });
    return false;
  }
  set({ error: "", progress: 0 });
  const check = await unwrapVaultKey(meta.wrapped, oldPw, meta.kdf, (f) => progress(f / 2));
  if (!check) {
    set({ progress: null, error: "The current master password is wrong." });
    return false;
  }
  const kdf = newKdf(KDF_STRONG);
  const wrapped = await wrapVaultKey(vk, newPw, kdf, (f) => progress(0.5 + f / 2));
  const { error } = await supabase.from("pass_vaults").update({ kdf, wrapped_vk: wrapped }).eq("owner_id", uid);
  set({ progress: null });
  if (error) {
    set({ error: errorText(error) });
    return false;
  }
  meta = { kdf, wrapped };
  return true;
}

export const exportPlain = (format: "json" | "csv") => (format === "json" ? exportJson(usePass.getState().items) : exportCsv(usePass.getState().items));
export async function exportProtected(password: string): Promise<EncryptedExport> {
  set({ progress: 0 });
  try {
    return await encryptExport(exportJson(usePass.getState().items), password, progress);
  } finally {
    set({ progress: null });
  }
}
export async function readProtected(file: EncryptedExport, password: string): Promise<string | null> {
  set({ progress: 0 });
  try {
    return await decryptExport(file, password, progress);
  } finally {
    set({ progress: null });
  }
}

// ------------------------------------------------------------------ PIN
export async function setPin(pin: string): Promise<boolean> {
  if (!vk || !/^\d{4,12}$/.test(pin)) return false;
  set({ progress: 0 });
  const kdf = newKdf(KDF_PIN);
  const wrapped = await wrapVaultKey(vk, pin, kdf, progress);
  set({ progress: null });
  writeQuick({ ...readQuick(), pin: { kdf, wrapped, fails: 0 } });
  return true;
}
export function clearPin() {
  const { pin: _pin, ...rest } = readQuick();
  void _pin;
  writeQuick(rest);
}
/** 5 wrong PINs wipe the PIN from this device. The master password always still works. */
export async function unlockWithPin(pin: string): Promise<boolean> {
  const q = readQuick();
  if (!q.pin) return false;
  set({ error: "", progress: 0 });
  const key = await unwrapVaultKey(q.pin.wrapped, pin, q.pin.kdf, progress);
  set({ progress: null });
  if (!key) {
    const fails = q.pin.fails + 1;
    if (fails >= MAX_PIN_TRIES) {
      clearPin();
      set({ error: "Too many wrong PINs. Use your master password." });
    } else {
      writeQuick({ ...q, pin: { ...q.pin, fails } });
      set({ error: `Wrong PIN. ${MAX_PIN_TRIES - fails} tries left.` });
    }
    return false;
  }
  writeQuick({ ...q, pin: { ...q.pin, fails: 0 } });
  await open(key);
  return true;
}

// ------------------------------------------------------------------ biometrics (Face ID / Touch ID / Windows Hello via WebAuthn)
// The screen lock is a WebAuthn user-verification. The vault key is wrapped with a non-extractable key kept in IndexedDB, released only after it succeeds.
const IDB = "nexus-pass";
function idb<T>(fn: (s: IDBObjectStore) => IDBRequest<T>, mode: IDBTransactionMode = "readonly"): Promise<T> {
  return new Promise((res, rej) => {
    const o = indexedDB.open(IDB, 1);
    o.onupgradeneeded = () => o.result.createObjectStore("k");
    o.onerror = () => rej(o.error);
    o.onsuccess = () => {
      const r = fn(o.result.transaction("k", mode).objectStore("k"));
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    };
  });
}
export const biometricsAvailable = async (): Promise<boolean> => {
  try {
    return typeof window !== "undefined" && !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch {
    return false;
  }
};
const rnd = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export async function enableBiometrics(): Promise<boolean> {
  const uid = me();
  if (!vk || !uid) return false;
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        rp: { name: "Nexus Pass" },
        user: { id: new TextEncoder().encode(uid), name: "nexus-pass", displayName: "Nexus Pass" },
        challenge: rnd(32),
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    if (!cred) return false;
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await idb((s) => s.put(key, `bio.${uid}`), "readwrite");
    const iv = rnd(12);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, vk as BufferSource));
    writeQuick({ ...readQuick(), bio: { cred: b64(new Uint8Array(cred.rawId)), iv: b64(iv), ct: b64(ct) } });
    return true;
  } catch (e) {
    toast(e instanceof Error && e.name === "NotAllowedError" ? "Biometrics were cancelled." : "This device couldn't set up biometrics.", "error");
    return false;
  }
}
export function disableBiometrics() {
  const uid = me();
  const { bio: _bio, ...rest } = readQuick();
  void _bio;
  writeQuick(rest);
  if (uid) void idb((s) => s.delete(`bio.${uid}`), "readwrite").catch(() => {});
}
export async function unlockWithBiometrics(): Promise<boolean> {
  const uid = me();
  const q = readQuick();
  if (!uid || !q.bio) return false;
  try {
    const got = await navigator.credentials.get({ publicKey: { challenge: rnd(32), allowCredentials: [{ type: "public-key", id: unb64(q.bio.cred) as BufferSource }], userVerification: "required", timeout: 60_000 } });
    if (!got) return false;
    const key = (await idb((s) => s.get(`bio.${uid}`))) as CryptoKey | undefined;
    if (!key) throw new Error("missing key");
    const raw = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(q.bio.iv) as BufferSource }, key, unb64(q.bio.ct) as BufferSource));
    await open(raw);
    return true;
  } catch (e) {
    if (!(e instanceof Error && e.name === "NotAllowedError")) {
      disableBiometrics();
      set({ error: "Biometric unlock stopped working on this device. Use your master password." });
    }
    return false;
  }
}

// ------------------------------------------------------------------ auto-lock + clipboard clean-up
let lastActive = Date.now();
let hiddenAt = 0;
let lockTimer: ReturnType<typeof setInterval> | null = null;
export const touch = () => {
  lastActive = Date.now();
};

/** Start the idle timer and tab-hidden lock. Returns a stop function. */
export function startAutoLock(): () => void {
  if (lockTimer) clearInterval(lockTimer);
  lockTimer = setInterval(() => {
    const { autoLockMin } = getSettings();
    if (vk && autoLockMin > 0 && Date.now() - lastActive > autoLockMin * 60_000) lockVault();
  }, 10_000);
  const vis = () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (vk && hiddenAt) {
      const s = getSettings();
      if (s.lockOnHide || (s.autoLockMin > 0 && Date.now() - hiddenAt > s.autoLockMin * 60_000)) lockVault();
      hiddenAt = 0;
    }
  };
  const act = () => touch();
  document.addEventListener("visibilitychange", vis);
  window.addEventListener("pointerdown", act, true);
  window.addEventListener("keydown", act, true);
  return () => {
    if (lockTimer) clearInterval(lockTimer);
    lockTimer = null;
    document.removeEventListener("visibilitychange", vis);
    window.removeEventListener("pointerdown", act, true);
    window.removeEventListener("keydown", act, true);
  };
}

let clipTimer: ReturnType<typeof setTimeout> | null = null;
/** Copy a secret, then clear the clipboard after the chosen time (only if it still holds what we put there). */
export async function copySecret(text: string, label = "Copied", secret = true): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    toast("Couldn't copy. Allow clipboard access.", "error");
    return false;
  }
  touch();
  const sec = secret ? getSettings().clipSec : 0;
  toast(sec ? `${label}. Clears in ${sec} s` : label, "success");
  if (clipTimer) clearTimeout(clipTimer);
  if (sec) {
    clipTimer = setTimeout(async () => {
      try {
        const now = await navigator.clipboard.readText();
        if (now === text) await navigator.clipboard.writeText("");
      } catch {
        try {
          await navigator.clipboard.writeText("");
        } catch {
          /* tab in background: nothing more to do */
        }
      }
    }, sec * 1000);
  }
  return true;
}

// A different account (or a sign-out) on this device must never see the previous vault.
if (typeof window !== "undefined") {
  let lastUid = useApp.getState().userId;
  useApp.subscribe((s) => {
    if (s.userId !== lastUid) {
      lastUid = s.userId;
      resetPass();
    }
  });
}
