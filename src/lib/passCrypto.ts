// Nexus Pass · client-side crypto. The server only ever stores salts, KDF settings and ciphertext.
//   master password --Argon2id--> key-encryption key (KEK) --AES-256-GCM--> wraps a random 256-bit vault key (VK)
//   VK --AES-256-GCM--> every item (the item id is bound in as additional data, so rows can't be swapped)
// A PIN or biometric unlock keeps a second wrapping of the VK on this device only.


// ================================================================== Argon2id (RFC 9106, v0x13) + BLAKE2b, plain TypeScript, 32-bit maths only.
// Verified against RFC 9106 test vector 5.3 and the reference implementation (see passCrypto.test.mts).
// ------------------------------------------------------------------ BLAKE2b (64-bit words as hi/lo u32 pairs)
const IV = new Uint32Array([
  0xf3bcc908, 0x6a09e667, 0x84caa73b, 0xbb67ae85, 0xfe94f82b, 0x3c6ef372, 0x5f1d36f1, 0xa54ff53a, 0xade682d1, 0x510e527f, 0x2b3e6c1f, 0x9b05688c, 0xfb41bd6b, 0x1f83d9ab, 0x137e2179, 0x5be0cd19,
]); // lo, hi, lo, hi ...

const SIGMA = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
  [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4],
  [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
  [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13],
  [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
  [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11],
  [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
  [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5],
  [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0],
];

const v = new Uint32Array(32); // 16 words: lo at 2i, hi at 2i+1
const m = new Uint32Array(32);

function g(a: number, b: number, c: number, d: number, x: number, y: number) {
  // v[a] = v[a] + v[b] + x
  const s1 = v[2 * a] + v[2 * b];
  const l1 = s1 >>> 0;
  const c2 = l1 + m[2 * x] > 0xffffffff ? 1 : 0;
  const hi = (v[2 * a + 1] + v[2 * b + 1] + (s1 > 0xffffffff ? 1 : 0) + m[2 * x + 1] + c2) >>> 0;
  const lo = (l1 + m[2 * x]) >>> 0;
  v[2 * a] = lo;
  v[2 * a + 1] = hi;
  // v[d] = rotr64(v[d] ^ v[a], 32)
  let dl = v[2 * d] ^ v[2 * a];
  let dh = v[2 * d + 1] ^ v[2 * a + 1];
  v[2 * d] = dh >>> 0;
  v[2 * d + 1] = dl >>> 0;
  // v[c] += v[d]
  let t = v[2 * c] + v[2 * d];
  v[2 * c + 1] = (v[2 * c + 1] + v[2 * d + 1] + (t > 0xffffffff ? 1 : 0)) >>> 0;
  v[2 * c] = t >>> 0;
  // v[b] = rotr64(v[b] ^ v[c], 24)
  let bl = v[2 * b] ^ v[2 * c];
  let bh = v[2 * b + 1] ^ v[2 * c + 1];
  v[2 * b] = ((bl >>> 24) | (bh << 8)) >>> 0;
  v[2 * b + 1] = ((bh >>> 24) | (bl << 8)) >>> 0;
  // v[a] += v[b] + y
  t = v[2 * a] + v[2 * b];
  const l2 = t >>> 0;
  const c3 = l2 + m[2 * y] > 0xffffffff ? 1 : 0;
  v[2 * a + 1] = (v[2 * a + 1] + v[2 * b + 1] + (t > 0xffffffff ? 1 : 0) + m[2 * y + 1] + c3) >>> 0;
  v[2 * a] = (l2 + m[2 * y]) >>> 0;
  // v[d] = rotr64(v[d] ^ v[a], 16)
  dl = v[2 * d] ^ v[2 * a];
  dh = v[2 * d + 1] ^ v[2 * a + 1];
  v[2 * d] = ((dl >>> 16) | (dh << 16)) >>> 0;
  v[2 * d + 1] = ((dh >>> 16) | (dl << 16)) >>> 0;
  // v[c] += v[d]
  t = v[2 * c] + v[2 * d];
  v[2 * c + 1] = (v[2 * c + 1] + v[2 * d + 1] + (t > 0xffffffff ? 1 : 0)) >>> 0;
  v[2 * c] = t >>> 0;
  // v[b] = rotr64(v[b] ^ v[c], 63)
  bl = v[2 * b] ^ v[2 * c];
  bh = v[2 * b + 1] ^ v[2 * c + 1];
  v[2 * b] = ((bl << 1) | (bh >>> 31)) >>> 0;
  v[2 * b + 1] = ((bh << 1) | (bl >>> 31)) >>> 0;
}

function compress(h: Uint32Array, block: Uint8Array, t: number, last: boolean) {
  for (let i = 0; i < 32; i++) m[i] = (block[4 * i] | (block[4 * i + 1] << 8) | (block[4 * i + 2] << 16) | (block[4 * i + 3] << 24)) >>> 0;
  for (let i = 0; i < 16; i++) v[i] = h[i];
  for (let i = 0; i < 16; i++) v[16 + i] = IV[i];
  v[24] ^= t >>> 0;
  v[25] ^= Math.floor(t / 4294967296) >>> 0;
  if (last) {
    v[28] ^= 0xffffffff;
    v[29] ^= 0xffffffff;
  }
  for (let r = 0; r < 12; r++) {
    const s = SIGMA[r % 10];
    g(0, 4, 8, 12, s[0], s[1]);
    g(1, 5, 9, 13, s[2], s[3]);
    g(2, 6, 10, 14, s[4], s[5]);
    g(3, 7, 11, 15, s[6], s[7]);
    g(0, 5, 10, 15, s[8], s[9]);
    g(1, 6, 11, 12, s[10], s[11]);
    g(2, 7, 8, 13, s[12], s[13]);
    g(3, 4, 9, 14, s[14], s[15]);
  }
  for (let i = 0; i < 16; i++) h[i] ^= v[i] ^ v[16 + i];
}

/** BLAKE2b with an output of `outLen` bytes (1..64), no key. */
export function blake2b(input: Uint8Array, outLen = 64): Uint8Array {
  const h = new Uint32Array(IV);
  h[0] ^= 0x01010000 ^ outLen; // fanout 1, depth 1, digest length
  const block = new Uint8Array(128);
  let off = 0;
  let counted = 0;
  while (input.length - off > 128) {
    block.set(input.subarray(off, off + 128));
    off += 128;
    counted += 128;
    compress(h, block, counted, false);
  }
  block.fill(0);
  block.set(input.subarray(off));
  counted += input.length - off;
  compress(h, block, counted, true);
  const out = new Uint8Array(64);
  for (let i = 0; i < 16; i++) {
    out[4 * i] = h[i];
    out[4 * i + 1] = h[i] >>> 8;
    out[4 * i + 2] = h[i] >>> 16;
    out[4 * i + 3] = h[i] >>> 24;
  }
  return out.slice(0, outLen);
}

// ------------------------------------------------------------------ Argon2
const le32 = (n: number) => new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);
const concat = (...p: Uint8Array[]) => {
  const out = new Uint8Array(p.reduce((a, b) => a + b.length, 0));
  let o = 0;
  for (const x of p) {
    out.set(x, o);
    o += x.length;
  }
  return out;
};

/** H': BLAKE2b stretched to any output length. */
function hPrime(input: Uint8Array, T: number): Uint8Array {
  const head = concat(le32(T), input);
  if (T <= 64) return blake2b(head, T);
  const r = Math.ceil(T / 32) - 2;
  const out = new Uint8Array(T);
  let vi = blake2b(head, 64);
  out.set(vi.subarray(0, 32), 0);
  for (let i = 2; i <= r; i++) {
    vi = blake2b(vi, 64);
    out.set(vi.subarray(0, 32), (i - 1) * 32);
  }
  out.set(blake2b(vi, T - 32 * r), r * 32);
  return out;
}

// 64-bit helpers on a Uint32Array block (128 words of 64 bits = 256 u32: lo at 2i, hi at 2i+1)
let mh = 0;
let ml = 0;
/** lo32(a) * lo32(b) as a 64-bit number into mh/ml */
function mul32(a: number, b: number) {
  const a0 = a & 0xffff;
  const a1 = a >>> 16;
  const b0 = b & 0xffff;
  const b1 = b >>> 16;
  const p00 = a0 * b0;
  const p01 = a0 * b1;
  const p10 = a1 * b0;
  const p11 = a1 * b1;
  const mid = p01 + p10; // < 2^33
  const lo = p00 + (mid % 65536) * 65536; // < 2^49, exact
  ml = lo >>> 0;
  mh = (p11 + Math.floor(mid / 65536) + Math.floor(lo / 4294967296)) >>> 0;
}

/** a = a + b + 2 * lo(a) * lo(b), all on word indexes into `z` */
function fBlaMka(z: Uint32Array, ia: number, ib: number) {
  const al = z[ia];
  const ah = z[ia + 1];
  const bl = z[ib];
  const bh = z[ib + 1];
  mul32(al, bl);
  // 2 * product
  const pl = (ml << 1) >>> 0;
  const ph = ((mh << 1) | (ml >>> 31)) >>> 0;
  let lo = al + bl;
  let hi = ah + bh + (lo > 0xffffffff ? 1 : 0);
  lo = lo >>> 0;
  let lo2 = lo + pl;
  hi = hi + ph + (lo2 > 0xffffffff ? 1 : 0);
  z[ia] = lo2 >>> 0;
  z[ia + 1] = hi >>> 0;
}

function gb(z: Uint32Array, a: number, b: number, c: number, d: number) {
  const A = 2 * a;
  const B = 2 * b;
  const C = 2 * c;
  const D = 2 * d;
  fBlaMka(z, A, B);
  // d = rotr(d ^ a, 32)
  let l = z[D] ^ z[A];
  let h = z[D + 1] ^ z[A + 1];
  z[D] = h;
  z[D + 1] = l;
  fBlaMka(z, C, D);
  // b = rotr(b ^ c, 24)
  l = z[B] ^ z[C];
  h = z[B + 1] ^ z[C + 1];
  z[B] = (l >>> 24) | (h << 8);
  z[B + 1] = (h >>> 24) | (l << 8);
  fBlaMka(z, A, B);
  // d = rotr(d ^ a, 16)
  l = z[D] ^ z[A];
  h = z[D + 1] ^ z[A + 1];
  z[D] = (l >>> 16) | (h << 16);
  z[D + 1] = (h >>> 16) | (l << 16);
  fBlaMka(z, C, D);
  // b = rotr(b ^ c, 63)
  l = z[B] ^ z[C];
  h = z[B + 1] ^ z[C + 1];
  z[B] = (l << 1) | (h >>> 31);
  z[B + 1] = (h << 1) | (l >>> 31);
}

function perm(z: Uint32Array, i0: number, i1: number, i2: number, i3: number, i4: number, i5: number, i6: number, i7: number, i8: number, i9: number, i10: number, i11: number, i12: number, i13: number, i14: number, i15: number) {
  // indexes are 64-bit word numbers into z
  gb(z, i0, i4, i8, i12);
  gb(z, i1, i5, i9, i13);
  gb(z, i2, i6, i10, i14);
  gb(z, i3, i7, i11, i15);
  gb(z, i0, i5, i10, i15);
  gb(z, i1, i6, i11, i12);
  gb(z, i2, i7, i8, i13);
  gb(z, i3, i4, i9, i14);
}

const R = new Uint32Array(256);
const Q = new Uint32Array(256);

/** out = G(x, y) (or out ^= G(x, y) when `xor`), blocks are 256 u32 starting at the given offsets in `mem` */
function fillBlock(mem: Uint32Array, ox: number, oy: number, oz: number, xor: boolean) {
  for (let i = 0; i < 256; i++) {
    R[i] = mem[ox + i] ^ mem[oy + i];
    Q[i] = R[i];
  }
  for (let r = 0; r < 8; r++) {
    const b = 16 * r;
    perm(Q, b, b + 1, b + 2, b + 3, b + 4, b + 5, b + 6, b + 7, b + 8, b + 9, b + 10, b + 11, b + 12, b + 13, b + 14, b + 15);
  }
  for (let c = 0; c < 8; c++) {
    const b = 2 * c;
    perm(Q, b, b + 1, b + 16, b + 17, b + 32, b + 33, b + 48, b + 49, b + 64, b + 65, b + 80, b + 81, b + 96, b + 97, b + 112, b + 113);
  }
  if (xor) for (let i = 0; i < 256; i++) mem[oz + i] ^= R[i] ^ Q[i];
  else for (let i = 0; i < 256; i++) mem[oz + i] = R[i] ^ Q[i];
}

export type Argon2Opts = {
  /** memory in KiB */
  m: number;
  /** passes */
  t: number;
  /** lanes (parallelism) */
  p: number;
  /** tag length in bytes */
  len?: number;
  secret?: Uint8Array;
  ad?: Uint8Array;
};

/** Argon2id. Returns the raw tag. `yieldEvery` lets a UI breathe: await a macrotask every N blocks. */
export async function argon2id(password: Uint8Array, salt: Uint8Array, o: Argon2Opts, onProgress?: (f: number) => void): Promise<Uint8Array> {
  const { t, p } = o;
  const T = o.len ?? 32;
  if (!(o.m >= 8 * p) || t < 1 || p < 1 || p > 255 || salt.length < 8) throw new Error("Bad Argon2 parameters");
  const secret = o.secret ?? new Uint8Array(0);
  const ad = o.ad ?? new Uint8Array(0);
  const mPrime = 4 * p * Math.floor(o.m / (4 * p));
  const q = mPrime / p;
  const seg = q / 4;
  const mem = new Uint32Array(mPrime * 256);
  const h0 = blake2b(
    concat(le32(p), le32(T), le32(o.m), le32(t), le32(0x13), le32(2), le32(password.length), password, le32(salt.length), salt, le32(secret.length), secret, le32(ad.length), ad),
    64,
  );
  for (let l = 0; l < p; l++) {
    for (let k = 0; k < 2; k++) {
      const b = hPrime(concat(h0, le32(k), le32(l)), 1024);
      const off = (l * q + k) * 256;
      for (let i = 0; i < 256; i++) mem[off + i] = (b[4 * i] | (b[4 * i + 1] << 8) | (b[4 * i + 2] << 16) | (b[4 * i + 3] << 24)) >>> 0;
    }
  }

  const addr = new Uint32Array(256);
  const zero = new Uint32Array(256);
  const inp = new Uint32Array(256);
  const scratch = new Uint32Array(256 * 3); // [zero | inp/addr work | out]
  const total = t * 4 * p * seg;
  let done = 0;
  let sinceYield = 0;

  for (let pass = 0; pass < t; pass++) {
    for (let slice = 0; slice < 4; slice++) {
      const independent = pass === 0 && slice < 2;
      for (let lane = 0; lane < p; lane++) {
        let counter = 0;
        const nextAddr = () => {
          counter++;
          inp.fill(0);
          inp[0] = pass;
          inp[2] = lane;
          inp[4] = slice;
          inp[6] = mPrime;
          inp[8] = t;
          inp[10] = 2;
          inp[12] = counter;
          // addr = G(0, G(0, inp))
          scratch.fill(0);
          scratch.set(zero, 0);
          scratch.set(inp, 256);
          fillBlock(scratch, 0, 256, 512, false);
          scratch.copyWithin(256, 512, 768);
          fillBlock(scratch, 0, 256, 512, false);
          addr.set(scratch.subarray(512, 768));
        };
        let start = 0;
        if (pass === 0 && slice === 0) start = 2;
        if (independent) nextAddr();
        for (let i = start; i < seg; i++) {
          const cur = lane * q + slice * seg + i;
          const prev = i === 0 && slice === 0 ? lane * q + q - 1 : cur - 1;
          let j1: number;
          let j2: number;
          if (independent) {
            if (i % 128 === 0 && i !== start) nextAddr();
            const a = 2 * (i % 128);
            j1 = addr[a];
            j2 = addr[a + 1];
          } else {
            j1 = mem[prev * 256];
            j2 = mem[prev * 256 + 1];
          }
          const rl = pass === 0 && slice === 0 ? lane : j2 % p;
          let area: number;
          if (pass === 0) {
            if (slice === 0) area = i - 1;
            else if (rl === lane) area = slice * seg + i - 1;
            else area = slice * seg + (i === 0 ? -1 : 0);
          } else if (rl === lane) area = q - seg + i - 1;
          else area = q - seg + (i === 0 ? -1 : 0);
          // x = j1^2 >> 32 ; y = (area * x) >> 32 ; z = area - 1 - y
          mul32(j1, j1);
          const x = mh;
          mul32(area, x);
          const y = mh;
          const zpos = area - 1 - y;
          const startPos = pass === 0 ? 0 : slice === 3 ? 0 : (slice + 1) * seg;
          const refIdx = (startPos + zpos) % q;
          fillBlock(mem, prev * 256, (rl * q + refIdx) * 256, cur * 256, pass > 0);
          done++;
        }
        sinceYield += seg;
        if (sinceYield >= 2048) {
          sinceYield = 0;
          onProgress?.(done / total);
          await new Promise<void>((r) => setTimeout(r, 0));
        }
      }
    }
  }
  const fin = new Uint32Array(256);
  for (let l = 0; l < p; l++) {
    const off = (l * q + q - 1) * 256;
    for (let i = 0; i < 256; i++) fin[i] ^= mem[off + i];
  }
  const bytes = new Uint8Array(1024);
  for (let i = 0; i < 256; i++) {
    bytes[4 * i] = fin[i];
    bytes[4 * i + 1] = fin[i] >>> 8;
    bytes[4 * i + 2] = fin[i] >>> 16;
    bytes[4 * i + 3] = fin[i] >>> 24;
  }
  onProgress?.(1);
  return hPrime(bytes, T);
}

// ================================================================== Nexus Pass crypto
export type Kdf = { alg: "argon2id"; m: number; t: number; p: number; salt: string };
/** 64 MiB, 3 passes: about 1-3 s on a phone. The settings travel with the vault so they can be raised later. */
export const KDF_STRONG = { m: 65536, t: 3, p: 1 } as const;
/** For a short device PIN: the device lock-out after wrong tries is the real protection. */
export const KDF_PIN = { m: 16384, t: 2, p: 1 } as const;

const enc = new TextEncoder();
const dec = new TextDecoder();
const subtle = () => globalThis.crypto.subtle;
const rand = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));

export function b64(u: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
export function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const newKdf = (p: { m: number; t: number; p: number } = KDF_STRONG): Kdf => ({ alg: "argon2id", ...p, salt: b64(rand(16)) });

/** Settings that came from a server row: only accept sane numbers (a hostile row must not make the app hang or run out of memory). */
export function checkKdf(k: unknown): Kdf {
  const o = (k && typeof k === "object" ? k : {}) as Record<string, unknown>;
  const n = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : null);
  const m = n(o.m, 8192, 1_048_576);
  const t = n(o.t, 1, 12);
  const p = n(o.p, 1, 8);
  if (o.alg !== "argon2id" || m === null || t === null || p === null || typeof o.salt !== "string" || o.salt.length < 8 || o.salt.length > 100) throw new Error("This vault uses settings this app can't read.");
  return { alg: "argon2id", m, t, p, salt: o.salt };
}

export async function deriveKey(secret: string, kdf: Kdf, onProgress?: (f: number) => void): Promise<Uint8Array> {
  return argon2id(enc.encode(secret.normalize("NFKC")), unb64(kdf.salt), { m: kdf.m, t: kdf.t, p: kdf.p, len: 32 }, onProgress);
}

const aesKey = (raw: Uint8Array) => subtle().importKey("raw", raw as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);

async function gcmSeal(raw: Uint8Array, data: Uint8Array, aad?: string): Promise<string> {
  const iv = rand(12);
  const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv: iv as BufferSource, additionalData: aad ? (enc.encode(aad) as BufferSource) : undefined }, await aesKey(raw), data as BufferSource));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return "v1." + b64(out);
}
async function gcmOpen(raw: Uint8Array, sealed: string, aad?: string): Promise<Uint8Array> {
  if (!sealed.startsWith("v1.")) throw new Error("Unknown format");
  const all = unb64(sealed.slice(3));
  if (all.length < 29) throw new Error("Damaged data");
  return new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv: all.slice(0, 12) as BufferSource, additionalData: aad ? (enc.encode(aad) as BufferSource) : undefined }, await aesKey(raw), all.slice(12) as BufferSource));
}

export const newVaultKey = () => rand(32);

/** Wrap the vault key with a secret (master password or PIN). */
export async function wrapVaultKey(vk: Uint8Array, secret: string, kdf: Kdf, onProgress?: (f: number) => void): Promise<string> {
  return gcmSeal(await deriveKey(secret, kdf, onProgress), vk, "nexus-pass:vk");
}
/** Returns the vault key, or null when the secret is wrong. */
export async function unwrapVaultKey(wrapped: string, secret: string, kdf: Kdf, onProgress?: (f: number) => void): Promise<Uint8Array | null> {
  try {
    return await gcmOpen(await deriveKey(secret, kdf, onProgress), wrapped, "nexus-pass:vk");
  } catch {
    return null;
  }
}

export async function sealJson(vk: Uint8Array, value: unknown, aad: string): Promise<string> {
  return gcmSeal(vk, enc.encode(JSON.stringify(value)), aad);
}
export async function openJson<T = unknown>(vk: Uint8Array, sealed: string, aad: string): Promise<T> {
  return JSON.parse(dec.decode(await gcmOpen(vk, sealed, aad))) as T;
}

// ------------------------------------------------------------------ password-protected export file
export type EncryptedExport = { format: "nexus-pass-encrypted"; version: 1; kdf: Kdf; data: string };
export async function encryptExport(text: string, password: string, onProgress?: (f: number) => void): Promise<EncryptedExport> {
  const kdf = newKdf();
  const key = await deriveKey(password, kdf, onProgress);
  return { format: "nexus-pass-encrypted", version: 1, kdf, data: await gcmSeal(key, enc.encode(text), "nexus-pass:export") };
}
export async function decryptExport(file: EncryptedExport, password: string, onProgress?: (f: number) => void): Promise<string | null> {
  try {
    const key = await deriveKey(password, checkKdf(file.kdf), onProgress);
    return dec.decode(await gcmOpen(key, file.data, "nexus-pass:export"));
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ small guards
/** Fixed-time-ish string compare for local checks. */
export function sameText(a: string, b: string): boolean {
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
