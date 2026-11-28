// PIN quick-unlock for encrypted DMs (pure, Web Crypto only).
// The long passphrase still protects the server backup. The PIN only wraps a copy of the key on THIS device,
// so a lock can be opened with 4-8 digits. Five wrong tries wait 30 s, ten wipe the PIN (the passphrase still works).

export type PinBlob = { v: 1; salt: string; iv: string; wrapped: string; iter: number };

export const PIN_ITER = 600_000;
export const MAX_FAILS = 10;

export const validPin = (s: unknown): s is string => typeof s === "string" && /^\d{4,8}$/.test(s);

const enc = new TextEncoder();
const dec = new TextDecoder();
const bs = (u: Uint8Array) => u as unknown as BufferSource;
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function pinKey(pin: string, salt: Uint8Array, iter: number, usage: KeyUsage[]) {
  const base = await crypto.subtle.importKey("raw", bs(enc.encode(`nexus-pin:${pin}`)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: bs(salt), iterations: iter }, base, { name: "AES-GCM", length: 256 }, false, usage);
}

/** Wrap a private key (JSON text) with a PIN. `bind` (the user id) is authenticated so a blob can't be moved to another account. */
export async function wrapWithPin(pin: string, secret: string, bind: string, iter = PIN_ITER): Promise<PinBlob> {
  if (!validPin(pin)) throw new Error("PIN must be 4 to 8 digits");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await pinKey(pin, salt, iter, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: bs(iv), additionalData: bs(enc.encode(bind)) }, k, bs(enc.encode(secret))));
  return { v: 1, salt: b64(salt), iv: b64(iv), wrapped: b64(ct), iter };
}

/** The secret, or null when the PIN is wrong / the blob is damaged. */
export async function unwrapWithPin(pin: string, blob: PinBlob, bind: string): Promise<string | null> {
  if (!validPin(pin) || !blob || blob.v !== 1 || blob.iter < 100_000) return null;
  try {
    const k = await pinKey(pin, unb64(blob.salt), blob.iter, ["decrypt"]);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bs(unb64(blob.iv)), additionalData: bs(enc.encode(bind)) }, k, bs(unb64(blob.wrapped)));
    return dec.decode(pt);
  } catch {
    return null;
  }
}

export function parseBlob(raw: string | null): PinBlob | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<PinBlob>;
    return o && o.v === 1 && typeof o.salt === "string" && typeof o.iv === "string" && typeof o.wrapped === "string" && typeof o.iter === "number" ? (o as PinBlob) : null;
  } catch {
    return null;
  }
}

/** After every 5th wrong try the keypad waits 30 s. */
export function lockoutLeft(fails: number, lastFailAt: number, now: number): number {
  if (fails < 5 || fails % 5 !== 0) return 0;
  return Math.max(0, 30_000 - (now - lastFailAt));
}

export const shouldWipe = (fails: number) => fails >= MAX_FAILS;

/** Auto-lock choices in minutes (0 = never). */
export const AUTO_LOCK_CHOICES = [0, 1, 5, 15, 60] as const;
export const cleanAutoLock = (v: unknown): (typeof AUTO_LOCK_CHOICES)[number] => (AUTO_LOCK_CHOICES.includes(v as never) ? (v as (typeof AUTO_LOCK_CHOICES)[number]) : 0);
export const shouldAutoLock = (minutes: number, hiddenAt: number | null, now: number) => minutes > 0 && hiddenAt !== null && now - hiddenAt >= minutes * 60_000;
