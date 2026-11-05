import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont } from "pdf-lib";

export type PdfAnnotation = {
  id: string;
  /** Index into the original document, before reorder or delete. */
  page: number;
  text: string;
  /** PDF user space. Origin is the bottom-left of the page; y is the text baseline. */
  x: number;
  y: number;
  size: number;
  color: string;
};

export class PdfEditError extends Error {}

function hexToRgb(hex: string) {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  if (!Number.isFinite(n)) return { r: 0.07, g: 0.09, b: 0.15 };
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

function assertEncodable(font: PDFFont, text: string) {
  try {
    font.encodeText(text);
  } catch {
    throw new PdfEditError("That text uses characters the standard PDF font can't draw. Use letters, numbers, and basic punctuation.");
  }
}

export type BuildPdfOptions = {
  /** Drawn lightly on every kept page (for example CONFIDENTIAL). */
  watermark?: string;
};

/** Copy pages in `order`, drop the rest, and draw annotations that still belong to a kept page. */
export async function buildEditedPdf(src: Uint8Array, order: number[], annotations: PdfAnnotation[], opts: BuildPdfOptions = {}) {
  if (order.length === 0) throw new PdfEditError("The document needs at least one page.");
  const input = await PDFDocument.load(src);
  const pageCount = input.getPageCount();
  if (order.some((i) => i < 0 || i >= pageCount)) throw new PdfEditError("A page in this edit no longer exists.");

  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  for (const note of annotations) {
    if (!order.includes(note.page)) continue;
    for (const line of note.text.split(/\r?\n/)) {
      if (line) assertEncodable(font, line);
    }
  }
  const watermark = opts.watermark?.trim();
  if (watermark) assertEncodable(font, watermark);

  const copied = await out.copyPages(input, order);
  copied.forEach((page) => out.addPage(page));

  out.getPages().forEach((page, index) => {
    const srcIndex = order[index];
    const notes = annotations.filter((note) => note.page === srcIndex);
    for (const note of notes) {
      const lines = note.text.split(/\r?\n/);
      const color = hexToRgb(note.color);
      lines.forEach((line, lineIndex) => {
        if (!line) return;
        page.drawText(line, {
          x: note.x,
          y: note.y - lineIndex * note.size * 1.25,
          size: note.size,
          font,
          color: rgb(color.r, color.g, color.b),
        });
      });
    }
    if (watermark) {
      const { width, height } = page.getSize();
      page.drawText(watermark, {
        x: Math.max(24, width * 0.18),
        y: height * 0.45,
        size: Math.min(42, width * 0.08),
        font,
        color: rgb(0.55, 0.55, 0.58),
        opacity: 0.22,
        rotate: degrees(32),
      });
    }
  });

  return out.save();
}
