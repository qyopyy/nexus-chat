/**
 * Read a Friday-Night-Funkin'-style mod zip (base game / Psych / Kade / Codename folder layout) on the device and
 * list its playable songs: a chart json (…/data/<song>/<song>-hard.json etc.) + Inst / Voices audio.
 * Zero dependencies — stored + deflate entries via the browser's DecompressionStream.
 */

export type ZipFile = { name: string; size: number; blob: () => Promise<Blob> };

const td = new TextDecoder();

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") throw new Error("This browser can't unzip (no DecompressionStream)");
  const ds = new DecompressionStream("deflate-raw");
  const buf = await new Response(new Blob([data as BlobPart]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(buf);
}

/** Parse the central directory of a zip; entries are read lazily. */
export async function readZip(file: Blob): Promise<ZipFile[]> {
  const size = file.size;
  const tailLen = Math.min(size, 65_557);
  const tail = new Uint8Array(await file.slice(size - tailLen).arrayBuffer());
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a zip file");
  const dv = new DataView(tail.buffer, tail.byteOffset + eocd);
  const count = dv.getUint16(10, true);
  const cdSize = dv.getUint32(12, true);
  const cdOff = dv.getUint32(16, true);
  if (cdOff === 0xffffffff) throw new Error("Zip64 archives aren't supported — re-zip the mod folder");
  const cd = new Uint8Array(await file.slice(cdOff, cdOff + cdSize).arrayBuffer());
  const out: ZipFile[] = [];
  let p = 0;
  for (let i = 0; i < count && p + 46 <= cd.length; i++) {
    const v = new DataView(cd.buffer, cd.byteOffset + p);
    if (v.getUint32(0, true) !== 0x02014b50) break;
    const method = v.getUint16(10, true);
    const csize = v.getUint32(20, true);
    const usize = v.getUint32(24, true);
    const nLen = v.getUint16(28, true);
    const eLen = v.getUint16(30, true);
    const cLen = v.getUint16(32, true);
    const lho = v.getUint32(42, true);
    const name = td.decode(cd.subarray(p + 46, p + 46 + nLen)).replace(/\\/g, "/");
    p += 46 + nLen + eLen + cLen;
    if (name.endsWith("/") || name.includes("__MACOSX/")) continue;
    if (method !== 0 && method !== 8) continue;
    out.push({
      name,
      size: usize,
      blob: async () => {
        const lh = new DataView(await file.slice(lho, lho + 30).arrayBuffer());
        if (lh.getUint32(0, true) !== 0x04034b50) throw new Error("Corrupt zip entry");
        const start = lho + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
        const raw = new Uint8Array(await file.slice(start, start + csize).arrayBuffer());
        const bytes = method === 8 ? await inflate(raw) : raw;
        const ext = name.split(".").pop()?.toLowerCase() ?? "";
        const type = ext === "json" ? "application/json" : ext === "ogg" ? "audio/ogg" : ext === "mp3" ? "audio/mpeg" : ext === "m4a" ? "audio/mp4" : ext === "wav" ? "audio/wav" : "application/octet-stream";
        return new Blob([bytes as BlobPart], { type });
      },
    });
  }
  return out;
}

export type ModSong = {
  /** folder key, e.g. "bopeebo" */
  key: string;
  title: string;
  charts: { label: string; file: ZipFile }[];
  inst: ZipFile | null;
  voices: ZipFile | null;
  /** credits.txt / mod name when present */
  credit: string | null;
};

const AUDIO = /\.(ogg|mp3|m4a|wav)$/i;
const slug = (s: string) => s.toLowerCase().replace(/[\s_]+/g, "-");

/** Group a mod's files into songs. Works with data/<song>/<song>-<diff>.json + songs/<song>/Inst.ogg layouts (and loose folders). */
export function findModSongs(files: ZipFile[], modName: string): ModSong[] {
  const songs = new Map<string, ModSong>();
  const get = (key: string) => {
    let s = songs.get(key);
    if (!s) {
      s = { key, title: key.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), charts: [], inst: null, voices: null, credit: modName || null };
      songs.set(key, s);
    }
    return s;
  };
  for (const f of files) {
    const parts = f.name.split("/");
    const base = parts[parts.length - 1];
    const dir = parts.length > 1 ? parts[parts.length - 2] : "";
    if (/\.json$/i.test(base)) {
      // data/<song>/<song>-hard.json | data/<song>/<song>.json | charts/<song>/normal.json
      const stem = base.replace(/\.json$/i, "");
      if (/^(events|meta|metadata|dialogue|_meta|preferences|config|credits)/i.test(stem)) continue;
      let key = slug(dir || stem);
      let label = "Normal";
      const m = stem.match(/^(.*?)-(easy|normal|hard|erect|nightmare|insane|expert|[a-z]+)$/i);
      if (m && slug(m[1]) === key) label = m[2].replace(/\b\w/g, (c) => c.toUpperCase());
      else if (!dir) key = slug(stem);
      else if (/^(easy|normal|hard|erect|nightmare)$/i.test(stem)) label = stem.replace(/\b\w/g, (c) => c.toUpperCase());
      if (f.size > 6_000_000) continue;
      get(key).charts.push({ label, file: f });
    } else if (AUDIO.test(base)) {
      const key = slug(dir || base.replace(AUDIO, ""));
      const s = get(key);
      if (/^inst/i.test(base)) s.inst = s.inst && !/\.ogg$/i.test(s.inst.name) ? s.inst : f;
      else if (/^voices/i.test(base)) s.voices = s.voices && !/\.ogg$/i.test(s.voices.name) ? s.voices : f;
    }
  }
  const order = ["Easy", "Normal", "Hard", "Erect", "Nightmare"];
  return [...songs.values()]
    .filter((s) => s.charts.length && s.inst)
    .map((s) => ({ ...s, charts: s.charts.sort((a, b) => (order.indexOf(a.label) + 1 || 99) - (order.indexOf(b.label) + 1 || 99)) }))
    .sort((a, b) => a.title.localeCompare(b.title));
}
