/** Minimal ZIP reader (store + deflate) for voice-model packs — no dependency. */

export type ZipFile = { name: string; data: Uint8Array };

function u16(v: DataView, o: number) {
  return v.getUint16(o, true);
}
function u32(v: DataView, o: number) {
  return v.getUint32(o, true);
}

async function inflate(raw: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") throw new Error("Deflate not supported in this browser");
  const ds = new DecompressionStream("deflate-raw");
  const copy = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  const ab = await new Response(new Blob([copy]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(ab);
}

/** Parse a .zip ArrayBuffer into named files (skips directories). */
export async function readZip(buf: ArrayBuffer): Promise<ZipFile[]> {
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const out: ZipFile[] = [];
  let o = 0;
  while (o + 30 < bytes.length) {
    if (u32(view, o) !== 0x04034b50) break; // local file header
    const method = u16(view, o + 8);
    const compSize = u32(view, o + 18);
    const nameLen = u16(view, o + 26);
    const extraLen = u16(view, o + 28);
    const nameStart = o + 30;
    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLen));
    const dataStart = nameStart + nameLen + extraLen;
    const comp = bytes.subarray(dataStart, dataStart + compSize);
    o = dataStart + compSize;
    if (name.endsWith("/")) continue;
    let data: Uint8Array;
    if (method === 0) data = comp.slice();
    else if (method === 8) data = await inflate(comp);
    else throw new Error(`Unsupported zip method ${method} for ${name}`);
    out.push({ name: name.replace(/^\/+/, ""), data });
  }
  if (!out.length) throw new Error("Empty or invalid zip");
  return out;
}

export function zipFind(files: ZipFile[], re: RegExp) {
  return files.find((f) => re.test(f.name.split("/").pop() || f.name));
}
