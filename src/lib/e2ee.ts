"use client";

/**
 * Opt-in end-to-end encrypted DMs.
 *
 *  - Every user has an ECDH P-256 key pair. The public key is published; the private key never leaves the device
 *    unwrapped. A passphrase-wrapped copy (PBKDF2-SHA256 600k → AES-256-GCM) is stored so a new device can unlock it.
 *  - Per conversation: ECDH(my private, peer public) → HKDF-SHA256 (info = conversation id) → AES-256-GCM.
 *  - Wire format: "nx1:" + base64url(iv(12) ‖ ciphertext), AAD = "<conversation>|<author>".
 *  - First-seen key pinning: if a friend's key changes after you have talked, sending/reading stops until you accept it.
 *
 * Not covered (said plainly in the UI): attachments, groups/servers, who talks to whom and when, and message length.
 */

import { supabase } from "./supabase";
import { toast, useApp } from "@/store/app";
import type { Message } from "./types";
import { cleanAutoLock, lockoutLeft, parseBlob, shouldAutoLock, shouldWipe, unwrapWithPin, validPin, wrapWithPin } from "./e2eePin";

export const E2EE_PREFIX = "nx1:";
export const isEncryptedText = (s: string | null | undefined) => !!s && s.startsWith(E2EE_PREFIX);

const ITER = 600_000;
const enc = new TextEncoder();
const dec = new TextDecoder();
const bs = (u: Uint8Array) => u as unknown as BufferSource;

const b64 = (u: Uint8Array) => {
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64 = (s: string) => {
  const t = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "=".repeat((4 - (t.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

// ------------------------------------------------------------------ local key storage (IndexedDB, non-extractable)
type Stored = { priv: CryptoKey; pub: JsonWebKey };
const DB = "nexus-e2ee";
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("keys");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(k: string): Promise<Stored | null> {
  try {
    const db = await idb();
    return await new Promise((res) => {
      const q = db.transaction("keys").objectStore("keys").get(k);
      q.onsuccess = () => res((q.result as Stored) ?? null);
      q.onerror = () => res(null);
    });
  } catch {
    return null;
  }
}
async function idbPut(k: string, v: Stored | null) {
  const db = await idb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction("keys", "readwrite");
    if (v) tx.objectStore("keys").put(v, k);
    else tx.objectStore("keys").delete(k);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

const myId = () => useApp.getState().userId;
let mine: { id: string; key: Stored } | null = null;
const pubCache = new Map<string, { jwk: JsonWebKey; key: CryptoKey } | null>();
const sharedCache = new Map<string, CryptoKey>();
const peerCache = new Map<string, string | null>();
const listeners = new Set<() => void>();
export const onE2eeChange = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
const emit = () => listeners.forEach((f) => f());

export async function loadLocalKey(): Promise<Stored | null> {
  const id = myId();
  if (!id) return null;
  const cur = mine;
  if (cur && cur.id === id) return cur.key;
  const k = await idbGet(`priv:${id}`);
  mine = k ? { id, key: k } : null;
  return k;
}
export async function e2eeUnlocked() {
  return !!(await loadLocalKey());
}

// ------------------------------------------------------------------ fingerprints & pinning
const canonical = (j: JsonWebKey) => JSON.stringify({ crv: j.crv, kty: j.kty, x: j.x, y: j.y });
export async function fingerprint(j: JsonWebKey) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", bs(enc.encode(canonical(j)))));
  const hex = [...h.slice(0, 15)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.match(/.{1,5}/g)!.join(" ");
}
const pinKey = (peer: string) => `nx-e2ee-pin:${myId()}:${peer}`;
function readPin(peer: string) {
  try {
    return localStorage.getItem(pinKey(peer));
  } catch {
    return null;
  }
}
function writePin(peer: string, fp: string) {
  try {
    localStorage.setItem(pinKey(peer), fp);
  } catch {
    /* private mode */
  }
}
export class KeyChangedError extends Error {
  constructor(public peer: string) {
    super("key-changed");
  }
}
/** Accept a friend's new key after they reset encryption */
export function acceptNewKey(peer: string) {
  try {
    localStorage.removeItem(pinKey(peer));
  } catch {
    /* ignore */
  }
  pubCache.delete(peer);
  for (const k of [...sharedCache.keys()]) if (k.endsWith(`|${peer}`)) sharedCache.delete(k);
}

/** forget every pinned friend key on this device (use after a friend deliberately reset their encryption) */
export function clearPinnedKeys() {
  try {
    const pre = `nx-e2ee-pin:${myId()}:`;
    for (const k of Object.keys(localStorage)) if (k.startsWith(pre)) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
  pubCache.clear();
  sharedCache.clear();
}

async function peerPublic(peer: string, pin = true) {
  if (pubCache.has(peer)) return pubCache.get(peer)!;
  const { data } = await supabase.from("e2ee_public_keys").select("public_jwk").eq("user_id", peer).maybeSingle();
  const jwk = (data as { public_jwk: JsonWebKey } | null)?.public_jwk;
  if (!jwk) return null; // not cached, so a key published later is picked up
  const fp = await fingerprint(jwk);
  const pinned = readPin(peer);
  if (pin && pinned && pinned !== fp) throw new KeyChangedError(peer);
  if (pin && !pinned) writePin(peer, fp);
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const v = { jwk, key };
  pubCache.set(peer, v);
  return v;
}

async function sharedKey(convId: string, peer: string) {
  const id = `${myId()}|${convId}|${peer}`;
  const hit = sharedCache.get(id);
  if (hit) return hit;
  const me = await loadLocalKey();
  const p = await peerPublic(peer);
  if (!me || !p) return null;
  const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: p.key }, me.priv, 256);
  const hk = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  const salt = enc.encode([myId(), peer].sort().join("|"));
  const key = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: bs(salt), info: bs(enc.encode(`nexus-e2ee-v1|${convId}`)) },
    hk,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  sharedCache.set(id, key);
  return key;
}

// ------------------------------------------------------------------ who is the other person in this DM?
export async function dmPeer(convId: string): Promise<string | null> {
  const ck = `${myId()}|${convId}`;
  if (peerCache.has(ck)) return peerCache.get(ck)!;
  const row = useApp.getState().chatList.find((c) => c.id === convId);
  let peer: string | null = null;
  if (row) peer = row.kind === "dm" ? row.other_user_id : null;
  else {
    const { data: conv } = await supabase.from("conversations").select("kind").eq("id", convId).maybeSingle();
    if ((conv as { kind?: string } | null)?.kind === "dm") {
      const { data } = await supabase.from("conversation_members").select("user_id").eq("conversation_id", convId);
      peer = ((data ?? []) as { user_id: string }[]).map((r) => r.user_id).find((u) => u !== myId()) ?? null;
    }
  }
  if (row || peer) peerCache.set(ck, peer);
  return peer;
}

// ------------------------------------------------------------------ setup / unlock / reset
async function wrapKey(pass: string, salt: Uint8Array, usage: KeyUsage[]) {
  const base = await crypto.subtle.importKey("raw", bs(enc.encode(pass.normalize("NFKC"))), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: bs(salt), iterations: ITER }, base, { name: "AES-GCM", length: 256 }, false, usage);
}
async function keepLocal(priv: JsonWebKey, pub: JsonWebKey) {
  const id = myId();
  if (!id) throw new Error("not signed in");
  const key = await crypto.subtle.importKey("jwk", priv, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const s: Stored = { priv: key, pub };
  await idbPut(`priv:${id}`, s);
  mine = { id, key: s };
  sharedCache.clear();
  emit();
}
const pubOnly = (j: JsonWebKey): JsonWebKey => ({ kty: j.kty, crv: j.crv, x: j.x, y: j.y });

export function passphraseProblem(p: string) {
  if (p.length < 10) return "Use at least 10 characters";
  if (new Set(p).size < 5) return "Too repetitive";
  return null;
}

export async function setupE2ee(pass: string) {
  const id = myId();
  if (!id) throw new Error("not signed in");
  const bad = passphraseProblem(pass);
  if (bad) throw new Error(bad);
  const kp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const priv = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const pub = pubOnly(await crypto.subtle.exportKey("jwk", kp.publicKey));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wk = await wrapKey(pass, salt, ["encrypt"]);
  const wrapped = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: bs(iv), additionalData: bs(enc.encode(id)) }, wk, bs(enc.encode(JSON.stringify(priv)))));
  const a = await supabase.from("e2ee_key_backups").upsert({ user_id: id, salt: b64(salt), iv: b64(iv), wrapped: b64(wrapped), iterations: ITER, updated_at: new Date().toISOString() });
  if (a.error) throw new Error(a.error.message);
  const b = await supabase.from("e2ee_public_keys").upsert({ user_id: id, public_jwk: pub });
  if (b.error) throw new Error(b.error.message);
  await keepLocal(priv, pub);
  return fingerprint(pub);
}

/** unlock on this device with the passphrase (new phone / cleared browser) */
export async function unlockE2ee(pass: string) {
  const id = myId();
  if (!id) throw new Error("not signed in");
  const { data, error } = await supabase.from("e2ee_key_backups").select("*").eq("user_id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No encryption key to unlock yet");
  const row = data as { salt: string; iv: string; wrapped: string; iterations: number };
  if (row.iterations < 200_000) throw new Error("Backup uses a weak setting — reset encryption");
  const base = await crypto.subtle.importKey("raw", bs(enc.encode(pass.normalize("NFKC"))), "PBKDF2", false, ["deriveKey"]);
  const wk = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: bs(unb64(row.salt)), iterations: row.iterations }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  let priv: JsonWebKey;
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bs(unb64(row.iv)), additionalData: bs(enc.encode(id)) }, wk, bs(unb64(row.wrapped)));
    priv = JSON.parse(dec.decode(pt));
  } catch {
    throw new Error("Wrong passphrase");
  }
  const pub = pubOnly(priv);
  // the published key must be the one this private key belongs to
  const { data: p } = await supabase.from("e2ee_public_keys").select("public_jwk").eq("user_id", id).maybeSingle();
  const published = (p as { public_jwk: JsonWebKey } | null)?.public_jwk;
  if (published && canonical(published) !== canonical(pub)) throw new Error("Published key doesn't match this backup");
  if (!published) await supabase.from("e2ee_public_keys").upsert({ user_id: id, public_jwk: pub });
  await keepLocal(priv, pub);
  return fingerprint(pub);
}

export async function changePassphrase(oldPass: string, newPass: string) {
  const id = myId();
  if (!id) throw new Error("not signed in");
  const bad = passphraseProblem(newPass);
  if (bad) throw new Error(bad);
  mine = null;
  await idbPut(`priv:${id}`, null);
  await unlockE2ee(oldPass); // proves the old passphrase, re-caches the key
  const { data } = await supabase.from("e2ee_key_backups").select("*").eq("user_id", id).maybeSingle();
  const row = data as { salt: string; iv: string; wrapped: string; iterations: number };
  const oldKey = await wrapKey(oldPass, unb64(row.salt), ["decrypt"]);
  const priv = JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bs(unb64(row.iv)), additionalData: bs(enc.encode(id)) }, oldKey, bs(unb64(row.wrapped)))));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wk = await wrapKey(newPass, salt, ["encrypt"]);
  const wrapped = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: bs(iv), additionalData: bs(enc.encode(id)) }, wk, bs(enc.encode(JSON.stringify(priv)))));
  const { error } = await supabase.from("e2ee_key_backups").upsert({ user_id: id, salt: b64(salt), iv: b64(iv), wrapped: b64(wrapped), iterations: ITER, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

/** forget the key on this device only (the backup stays so you can unlock again) */
export async function lockE2ee() {
  const id = myId();
  if (id) await idbPut(`priv:${id}`, null);
  mine = null;
  sharedCache.clear();
  emit();
}

/** delete the published key and backup: old encrypted messages become unreadable for good */
export async function resetE2ee() {
  const id = myId();
  if (!id) return;
  await supabase.from("e2ee_key_backups").delete().eq("user_id", id);
  await supabase.from("e2ee_public_keys").delete().eq("user_id", id);
  await lockE2ee();
}

export async function myE2eeState(): Promise<{ published: boolean; unlocked: boolean; fingerprint: string | null }> {
  const id = myId();
  if (!id) return { published: false, unlocked: false, fingerprint: null };
  const [{ data }, local] = await Promise.all([supabase.from("e2ee_public_keys").select("public_jwk").eq("user_id", id).maybeSingle(), loadLocalKey()]);
  const jwk = (data as { public_jwk: JsonWebKey } | null)?.public_jwk;
  return { published: !!jwk, unlocked: !!local, fingerprint: jwk ? await fingerprint(jwk) : null };
}

// ------------------------------------------------------------------ strictness preference (device-local)
const STRICT = "nx-e2ee-strict";
export const e2eeStrict = () => {
  try {
    return localStorage.getItem(STRICT) === "1";
  } catch {
    return false;
  }
};
export const setE2eeStrict = (v: boolean) => {
  try {
    localStorage.setItem(STRICT, v ? "1" : "0");
  } catch {
    /* ignore */
  }
};

// ------------------------------------------------------------------ encrypt / decrypt messages
export async function encryptText(convId: string, authorId: string, text: string): Promise<string | null> {
  const peer = await dmPeer(convId);
  if (!peer) return null;
  const key = await sharedKey(convId, peer);
  if (!key) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: bs(iv), additionalData: bs(enc.encode(`${convId}|${authorId}`)) }, key, bs(enc.encode(text))));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return E2EE_PREFIX + b64(out);
}

async function decryptText(convId: string, authorId: string, wire: string): Promise<string> {
  const peer = await dmPeer(convId);
  if (!peer) throw new Error("no peer");
  const key = await sharedKey(convId, peer);
  if (!key) throw new Error("locked");
  const raw = unb64(wire.slice(E2EE_PREFIX.length));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bs(raw.slice(0, 12)), additionalData: bs(enc.encode(`${convId}|${authorId}`)) }, key, bs(raw.slice(12)));
  return dec.decode(pt);
}

export const LOCKED_TEXT = "🔒 Encrypted message — unlock encryption in Settings → Privacy to read it on this device.";

/** Turns an encrypted row into a readable message for this device (no-op for ordinary messages) */
export async function decryptMessage<T extends Pick<Message, "content" | "conversation_id" | "author_id"> & { e2ee?: "ok" | "locked" }>(m: T): Promise<T> {
  if (!isEncryptedText(m.content)) return m;
  try {
    const content = await decryptText(m.conversation_id, m.author_id, m.content);
    return { ...m, content, e2ee: "ok" } as T;
  } catch (e) {
    return { ...m, content: e instanceof KeyChangedError ? "🔒 This person's encryption key changed — open Settings → Privacy to review it." : LOCKED_TEXT, e2ee: "locked" } as T;
  }
}
export const decryptMessages = <T extends Pick<Message, "content" | "conversation_id" | "author_id"> & { e2ee?: "ok" | "locked" }>(ms: T[]) =>
  ms.some((m) => isEncryptedText(m.content)) ? Promise.all(ms.map(decryptMessage)) : Promise.resolve(ms);

/**
 * Decide how an outgoing DM text leaves this device.
 *  - { content } → send this (ciphertext when encryption is on for this chat, otherwise the original text)
 *  - null → blocked (a toast says why)
 */
export async function prepareOutgoing(convId: string, authorId: string, text: string): Promise<{ content: string; encrypted: boolean } | null> {
  if (!text) return { content: text, encrypted: false };
  const local = await loadLocalKey();
  if (!local) return { content: text, encrypted: false };
  const peer = await dmPeer(convId);
  if (!peer) return { content: text, encrypted: false }; // groups / servers are not end-to-end encrypted
  try {
    const wire = await encryptText(convId, authorId, text);
    if (wire) return { content: wire, encrypted: true };
  } catch (e) {
    if (e instanceof KeyChangedError) {
      toast("This person's encryption key changed. Open Settings → Privacy → Encryption to review it before sending.", "error");
      return null;
    }
    toast("Couldn't encrypt this message — not sent.", "error");
    return null;
  }
  if (e2eeStrict()) {
    toast("They haven't turned on encryption yet, so this message wasn't sent (strict mode is on).", "error");
    return null;
  }
  return { content: text, encrypted: false };
}

export const WIRE_OVERHEAD = E2EE_PREFIX.length;
/** characters of wire text produced by `bytes` of plaintext */
export const wireLength = (bytes: number) => WIRE_OVERHEAD + Math.ceil(((bytes + 28) * 4) / 3);


// ------------------------------------------------------------------ PIN quick unlock + auto-lock (this device only)
const pinKeyName = () => `nx-e2ee-quickpin:${myId()}`;
const failKeyName = () => `nx-e2ee-quickpin-fails:${myId()}`;
const autoKeyName = () => `nx-e2ee-autolock:${myId()}`;

export const hasE2eePin = () => {
  try {
    return !!parseBlob(localStorage.getItem(pinKeyName()));
  } catch {
    return false;
  }
};

function readFails(): { n: number; at: number } {
  try {
    const o = JSON.parse(localStorage.getItem(failKeyName()) || "null") as { n?: number; at?: number } | null;
    return { n: Math.max(0, Number(o?.n) || 0), at: Number(o?.at) || 0 };
  } catch {
    return { n: 0, at: 0 };
  }
}
/** Seconds the keypad still has to wait (0 = ready). */
export const e2eePinWait = () => Math.ceil(lockoutLeft(readFails().n, readFails().at, Date.now()) / 1000);

/** Set (or change) the PIN. Needs the passphrase once, to read the key; the PIN copy never leaves this device. */
export async function enableE2eePin(pass: string, pin: string) {
  const id = myId();
  if (!id) throw new Error("not signed in");
  if (!validPin(pin)) throw new Error("PIN must be 4 to 8 digits");
  const { data, error } = await supabase.from("e2ee_key_backups").select("*").eq("user_id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Turn on encrypted DMs first");
  const row = data as { salt: string; iv: string; wrapped: string; iterations: number };
  if (row.iterations < 200_000) throw new Error("Backup uses a weak setting — reset encryption");
  const base = await crypto.subtle.importKey("raw", bs(enc.encode(pass.normalize("NFKC"))), "PBKDF2", false, ["deriveKey"]);
  const wk = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: bs(unb64(row.salt)), iterations: row.iterations }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  let priv: string;
  try {
    priv = dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bs(unb64(row.iv)), additionalData: bs(enc.encode(id)) }, wk, bs(unb64(row.wrapped))));
  } catch {
    throw new Error("Wrong passphrase");
  }
  const blob = await wrapWithPin(pin, priv, id);
  localStorage.setItem(pinKeyName(), JSON.stringify(blob));
  localStorage.removeItem(failKeyName());
  emit();
}

export function disableE2eePin() {
  try {
    localStorage.removeItem(pinKeyName());
    localStorage.removeItem(failKeyName());
  } catch {
    /* ignore */
  }
  emit();
}

/** Open the lock with the PIN. Throws a plain sentence on a wrong PIN, a wait, or a wipe. */
export async function unlockE2eeWithPin(pin: string) {
  const id = myId();
  if (!id) throw new Error("not signed in");
  const blob = parseBlob(localStorage.getItem(pinKeyName()));
  if (!blob) throw new Error("No PIN is set on this device — use your passphrase");
  const f = readFails();
  const wait = Math.ceil(lockoutLeft(f.n, f.at, Date.now()) / 1000);
  if (wait > 0) throw new Error(`Too many tries. Wait ${wait} seconds.`);
  const secret = await unwrapWithPin(pin, blob, id);
  if (!secret) {
    const n = f.n + 1;
    if (shouldWipe(n)) {
      disableE2eePin();
      throw new Error("Too many wrong PINs. The PIN was removed — unlock with your passphrase.");
    }
    localStorage.setItem(failKeyName(), JSON.stringify({ n, at: Date.now() }));
    throw new Error(n >= 5 && n % 5 === 0 ? "Wrong PIN. Wait 30 seconds." : `Wrong PIN (${MAX_TRIES - n} tries left)`);
  }
  const priv = JSON.parse(secret) as JsonWebKey;
  await keepLocal(priv, pubOnly(priv));
  localStorage.removeItem(failKeyName());
  return fingerprint(pubOnly(priv));
}
const MAX_TRIES = 10;

// auto-lock: forget the key on this device after the app was hidden this many minutes
export const e2eeAutoLock = () => {
  try {
    return cleanAutoLock(Number(localStorage.getItem(autoKeyName())));
  } catch {
    return 0;
  }
};
export const setE2eeAutoLock = (m: number) => {
  try {
    localStorage.setItem(autoKeyName(), String(cleanAutoLock(m)));
  } catch {
    /* ignore */
  }
};
let autoStarted = false;
export function startE2eeAutoLock() {
  if (autoStarted || typeof document === "undefined") return;
  autoStarted = true;
  let hiddenAt: number | null = null;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") hiddenAt = Date.now();
    else {
      if (shouldAutoLock(e2eeAutoLock(), hiddenAt, Date.now())) void lockE2ee();
      hiddenAt = null;
    }
  });
}
