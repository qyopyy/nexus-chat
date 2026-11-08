/** Incremental MD5 (RFC 1321) — DDEX deliveries carry MD5 hash sums for every file; Web Crypto has no MD5. */
const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
const K = new Uint32Array(64);
for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0;

export class Md5 {
  private h = new Uint32Array([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476]);
  private buf = new Uint8Array(64);
  private bufLen = 0;
  private total = 0;
  private w = new Uint32Array(16);

  private block(b: Uint8Array, o: number) {
    const w = this.w;
    for (let i = 0; i < 16; i++) w[i] = b[o + i * 4] | (b[o + i * 4 + 1] << 8) | (b[o + i * 4 + 2] << 16) | (b[o + i * 4 + 3] << 24);
    let [a, bb, c, d] = this.h;
    for (let i = 0; i < 64; i++) {
      let f: number, g: number;
      if (i < 16) {
        f = (bb & c) | (~bb & d);
        g = i;
      } else if (i < 32) {
        f = (d & bb) | (~d & c);
        g = (5 * i + 1) & 15;
      } else if (i < 48) {
        f = bb ^ c ^ d;
        g = (3 * i + 5) & 15;
      } else {
        f = c ^ (bb | ~d);
        g = (7 * i) & 15;
      }
      const t = d;
      d = c;
      c = bb;
      const x = (a + f + K[i] + w[g]) | 0;
      bb = (bb + ((x << S[i]) | (x >>> (32 - S[i])))) | 0;
      a = t;
    }
    this.h[0] = (this.h[0] + a) | 0;
    this.h[1] = (this.h[1] + bb) | 0;
    this.h[2] = (this.h[2] + c) | 0;
    this.h[3] = (this.h[3] + d) | 0;
  }

  update(data: Uint8Array) {
    let i = 0;
    this.total += data.length;
    if (this.bufLen) {
      const n = Math.min(64 - this.bufLen, data.length);
      this.buf.set(data.subarray(0, n), this.bufLen);
      this.bufLen += n;
      i = n;
      if (this.bufLen === 64) {
        this.block(this.buf, 0);
        this.bufLen = 0;
      }
    }
    for (; i + 64 <= data.length; i += 64) this.block(data, i);
    if (i < data.length) {
      this.buf.set(data.subarray(i), 0);
      this.bufLen = data.length - i;
    }
    return this;
  }

  hex() {
    const bits = this.total * 8;
    const pad = new Uint8Array((this.bufLen < 56 ? 56 : 120) - this.bufLen + 8);
    pad[0] = 0x80;
    const lo = bits >>> 0;
    const hi = Math.floor(bits / 2 ** 32) >>> 0;
    const n = pad.length;
    for (let k = 0; k < 4; k++) {
      pad[n - 8 + k] = (lo >>> (8 * k)) & 255;
      pad[n - 4 + k] = (hi >>> (8 * k)) & 255;
    }
    const keep = this.total;
    this.update(pad);
    this.total = keep;
    let out = "";
    for (const v of this.h) for (let k = 0; k < 4; k++) out += ((v >>> (8 * k)) & 255).toString(16).padStart(2, "0");
    return out;
  }
}

/** MD5 of a Blob, read in 4 MB slices so big WAVs don't need one huge buffer */
export async function md5Blob(blob: Blob, onProgress?: (done: number) => void) {
  const m = new Md5();
  const step = 4 << 20;
  for (let pos = 0; pos < blob.size; pos += step) {
    m.update(new Uint8Array(await blob.slice(pos, pos + step).arrayBuffer()));
    onProgress?.(Math.min(blob.size, pos + step));
  }
  return m.hex();
}
