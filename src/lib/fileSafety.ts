/** Client-side file guards for Apps tools. Not a virus scanner — just rejects unsafe/odd files early. */

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46];
const GIF_MAGIC = [0x47, 0x49, 0x46];

export function sanitizeDownloadName(name: string, fallback = "file") {
  const base = name
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return base || fallback;
}

function startsWith(bytes: Uint8Array, magic: number[]) {
  if (bytes.length < magic.length) return false;
  return magic.every((b, i) => bytes[i] === b);
}

export async function sniffImage(file: File) {
  const buf = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const name = file.name.toLowerCase();
  if (name.endsWith(".svg") || file.type === "image/svg+xml") {
    throw new Error("SVG files aren't allowed here — they can run script. Use PNG, JPEG, WebP, or GIF.");
  }
  if (startsWith(buf, PNG_MAGIC)) return "image/png";
  if (startsWith(buf, JPEG_MAGIC)) return "image/jpeg";
  if (startsWith(buf, GIF_MAGIC)) return "image/gif";
  if (startsWith(buf, WEBP_RIFF) && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
    return "image/webp";
  }
  throw new Error("That doesn't look like a supported image (PNG, JPEG, WebP, or GIF).");
}

export async function sniffPdf(file: File) {
  const buf = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  if (!startsWith(buf, PDF_MAGIC)) throw new Error("That file doesn't start with a PDF header.");
}
