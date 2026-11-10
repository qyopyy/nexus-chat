/** Zip central-directory listing. Does not inflate file contents (safer on APKs). */

export type ZipEntryName = { name: string; method: number; compressed: number; uncompressed: number; flags: number };

export function listZipEntries(buf: ArrayBuffer, maxEntries = 4000): ZipEntryName[] {
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let eocd = -1;
  const start = Math.max(0, bytes.length - 22 - 0xffff);
  for (let i = bytes.length - 22; i >= start; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a zip archive");
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const out: ZipEntryName[] = [];
  const n = Math.min(count, maxEntries);
  for (let i = 0; i < n; i += 1) {
    if (offset + 46 > bytes.length) break;
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true);
    const uncompressed = view.getUint32(offset + 24, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLen));
    out.push({ name, method, compressed, uncompressed, flags });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
