"use client";

/**
 * Tiny ZIP writer (STORE, no compression) — enough to bundle a release's cover, audio and metadata into one download
 * without adding a dependency. Audio/images are already compressed (or WAV/FLAC that barely shrinks), so STORE is fine.
 */
let CRC_TABLE: Uint32Array | null = null;
function crc32(data: Uint8Array, crc = 0xffffffff) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  const t = CRC_TABLE;
  for (let i = 0; i < data.length; i++) crc = t[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return crc;
}

export type ZipEntry = { name: string; data: Blob | string };

function dosTime(d: Date) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

export async function makeZip(entries: ZipEntry[], onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const enc = new TextEncoder();
  const parts: BlobPart[] = [];
  const central: ArrayBuffer[] = [];
  let offset = 0;
  const { time, date } = dosTime(new Date());
  for (let idx = 0; idx < entries.length; idx++) {
    const e = entries[idx];
    const blob = typeof e.data === "string" ? new Blob([e.data], { type: "text/plain" }) : e.data;
    // CRC in 8 MB chunks so big WAVs don't need one giant buffer copy
    let crc = 0xffffffff;
    for (let pos = 0; pos < blob.size; pos += 8 << 20) crc = crc32(new Uint8Array(await blob.slice(pos, pos + (8 << 20)).arrayBuffer()), crc);
    crc = (crc ^ 0xffffffff) >>> 0;
    const name = enc.encode(e.name.replace(/^\/+/, ""));
    const size = blob.size;
    if (size > 0xfffffffe || offset > 0xfffffffe) throw new Error("Zip is too big (over 4 GB) — download the files one by one");
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // STORE
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(local.buffer, new Uint8Array(name).buffer as ArrayBuffer, blob);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, 0, true);
    cen.setUint16(12, time, true);
    cen.setUint16(14, date, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, size, true);
    cen.setUint32(24, size, true);
    cen.setUint16(28, name.length, true);
    cen.setUint32(42, offset, true);
    const c = new Uint8Array(46 + name.length);
    c.set(new Uint8Array(cen.buffer), 0);
    c.set(name, 46);
    central.push(c.buffer as ArrayBuffer);
    offset += 30 + name.length + size;
    onProgress?.(idx + 1, entries.length);
  }
  const cenSize = central.reduce((a, c) => a + c.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cenSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: "application/zip" });
}

export function saveBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
