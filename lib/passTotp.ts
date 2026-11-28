// Nexus Pass · one-time codes (RFC 4226 HOTP / RFC 6238 TOTP) with WebCrypto, plus otpauth:// parsing.

export type TotpAlgo = "SHA-1" | "SHA-256" | "SHA-512";
export type TotpConfig = { secret: string; digits: 6 | 7 | 8; period: number; algo: TotpAlgo; issuer?: string; account?: string };

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32Decode(input: string): Uint8Array | null {
  const s = input.toUpperCase().replace(/[\s-]/g, "").replace(/=+$/, "");
  if (!s || /[^A-Z2-7]/.test(s)) return null;
  const out: number[] = [];
  let bits = 0;
  let val = 0;
  for (const ch of s) {
    val = (val << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((val >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let val = 0;
  let out = "";
  for (const b of bytes) {
    val = (val << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(val >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
export const cleanSecret = (s: string) => s.toUpperCase().replace(/[\s-]/g, "").replace(/=+$/, "");
export const isValidSecret = (s: string) => {
  const d = base32Decode(s);
  return !!d && d.length >= 10;
};

const ALGOS: Record<string, TotpAlgo> = { SHA1: "SHA-1", "SHA-1": "SHA-1", SHA256: "SHA-256", "SHA-256": "SHA-256", SHA512: "SHA-512", "SHA-512": "SHA-512" };

/** otpauth://totp/Issuer:account?secret=...&issuer=...&digits=6&period=30&algorithm=SHA1, or a bare secret. */
export function parseTotp(input: string): TotpConfig | null {
  const raw = input.trim();
  if (!raw) return null;
  if (!/^otpauth:\/\//i.test(raw)) {
    const secret = cleanSecret(raw);
    return isValidSecret(secret) ? { secret, digits: 6, period: 30, algo: "SHA-1" } : null;
  }
  try {
    const u = new URL(raw);
    if (u.hostname.toLowerCase() !== "totp") return null;
    const secret = cleanSecret(u.searchParams.get("secret") ?? "");
    if (!isValidSecret(secret)) return null;
    const label = decodeURIComponent(u.pathname.replace(/^\//, ""));
    const [a, b] = label.includes(":") ? [label.slice(0, label.indexOf(":")), label.slice(label.indexOf(":") + 1)] : ["", label];
    const d = Number(u.searchParams.get("digits") ?? 6);
    const p = Number(u.searchParams.get("period") ?? 30);
    return {
      secret,
      digits: d === 7 || d === 8 ? d : 6,
      period: Number.isInteger(p) && p >= 5 && p <= 300 ? p : 30,
      algo: ALGOS[(u.searchParams.get("algorithm") ?? "SHA1").toUpperCase()] ?? "SHA-1",
      issuer: (u.searchParams.get("issuer") ?? a).trim() || undefined,
      account: b.trim() || undefined,
    };
  } catch {
    return null;
  }
}

export async function hotp(secret: Uint8Array, counter: number, digits: number, algo: TotpAlgo = "SHA-1"): Promise<string> {
  const msg = new Uint8Array(8);
  let c = Math.floor(counter);
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 255;
    c = Math.floor(c / 256);
  }
  const key = await globalThis.crypto.subtle.importKey("raw", secret as BufferSource, { name: "HMAC", hash: algo }, false, ["sign"]);
  const h = new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", key, msg as BufferSource));
  const o = h[h.length - 1] & 15;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export async function totpNow(cfg: Pick<TotpConfig, "secret" | "digits" | "period" | "algo">, nowMs = Date.now()): Promise<string> {
  const key = base32Decode(cfg.secret);
  if (!key) throw new Error("Bad secret");
  return hotp(key, Math.floor(nowMs / 1000 / cfg.period), cfg.digits, cfg.algo);
}

export const secondsLeft = (period: number, nowMs = Date.now()) => period - (Math.floor(nowMs / 1000) % period);
/** 0..1 of the window that has passed (for the ring). */
export const ringFraction = (period: number, nowMs = Date.now()) => ((nowMs / 1000) % period) / period;
/** "123 456" / "1234 5678" */
export const groupCode = (code: string) => (code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : `${code.slice(0, Math.ceil(code.length / 2))} ${code.slice(Math.ceil(code.length / 2))}`);

export function randomSecret(bytes = 20): string {
  return base32Encode(globalThis.crypto.getRandomValues(new Uint8Array(bytes)));
}
