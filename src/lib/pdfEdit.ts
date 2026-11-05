import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont } from "pdf-lib";

export type PdfFontId = "helvetica" | "helveticaBold" | "helveticaOblique" | "helveticaBoldOblique";

export type PdfAnnotation = {
  id: string;
  /** Index into the original document, before reorder or delete. Use -1 for blank inserted pages. */
  page: number;
  text: string;
  /** PDF user space. Origin is the bottom-left of the page; y is the text baseline. */
  x: number;
  y: number;
  size: number;
  color: string;
  font?: PdfFontId;
  opacity?: number;
};

export class PdfEditError extends Error {}

/** Any negative index in `order` is a blank US Letter page (unique ids for notes). */
export const isBlankPage = (i: number) => i < 0;

let blankSeq = -1;
export function nextBlankPageId() {
  blankSeq -= 1;
  return blankSeq;
}

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

async function embedFonts(out: PDFDocument) {
  const [helvetica, helveticaBold, helveticaOblique, helveticaBoldOblique] = await Promise.all([
    out.embedFont(StandardFonts.Helvetica),
    out.embedFont(StandardFonts.HelveticaBold),
    out.embedFont(StandardFonts.HelveticaOblique),
    out.embedFont(StandardFonts.HelveticaBoldOblique),
  ]);
  return { helvetica, helveticaBold, helveticaOblique, helveticaBoldOblique } as const;
}

export type BuildPdfOptions = {
  /** Drawn lightly on every kept page (for example CONFIDENTIAL). */
  watermark?: string;
  /** Footer page numbers like “1 / 12”. */
  pageNumbers?: boolean;
  /** Rotation for original page indexes (0 / 90 / 180 / 270). */
  rotations?: Record<number, number>;
};

function normalizeRotate(deg: number | undefined) {
  const n = ((Math.round(deg ?? 0) % 360) + 360) % 360;
  if (n === 90 || n === 180 || n === 270) return n;
  return 0;
}

/** Copy pages in `order`, drop the rest, and draw annotations that still belong to a kept page. */
export async function buildEditedPdf(src: Uint8Array, order: number[], annotations: PdfAnnotation[], opts: BuildPdfOptions = {}) {
  if (order.length === 0) throw new PdfEditError("The document needs at least one page.");
  const input = await PDFDocument.load(src);
  const pageCount = input.getPageCount();
  if (order.some((i) => !isBlankPage(i) && (i < 0 || i >= pageCount))) throw new PdfEditError("A page in this edit no longer exists.");

  const out = await PDFDocument.create();
  const fonts = await embedFonts(out);
  const defaultFont = fonts.helvetica;

  for (const note of annotations) {
    if (!order.includes(note.page)) continue;
    const font = fonts[note.font ?? "helvetica"] ?? defaultFont;
    for (const line of note.text.split(/\r?\n/)) {
      if (line) assertEncodable(font, line);
    }
  }
  const watermark = opts.watermark?.trim();
  if (watermark) assertEncodable(defaultFont, watermark);

  for (const srcIndex of order) {
    if (isBlankPage(srcIndex)) {
      out.addPage([612, 792]);
      continue;
    }
    const [page] = await out.copyPages(input, [srcIndex]);
    const rot = normalizeRotate(opts.rotations?.[srcIndex]);
    if (rot) page.setRotation(degrees(rot));
    out.addPage(page);
  }

  out.getPages().forEach((page, index) => {
    const srcIndex = order[index];
    const notes = annotations.filter((note) => note.page === srcIndex);
    for (const note of notes) {
      const lines = note.text.split(/\r?\n/);
      const color = hexToRgb(note.color);
      const font = fonts[note.font ?? "helvetica"] ?? defaultFont;
      const opacity = Math.max(0.15, Math.min(1, note.opacity ?? 1));
      lines.forEach((line, lineIndex) => {
        if (!line) return;
        page.drawText(line, {
          x: note.x,
          y: note.y - lineIndex * note.size * 1.25,
          size: note.size,
          font,
          color: rgb(color.r, color.g, color.b),
          opacity,
        });
      });
    }
    if (watermark) {
      const { width, height } = page.getSize();
      page.drawText(watermark, {
        x: Math.max(24, width * 0.18),
        y: height * 0.45,
        size: Math.min(42, width * 0.08),
        font: defaultFont,
        color: rgb(0.55, 0.55, 0.58),
        opacity: 0.22,
        rotate: degrees(32),
      });
    }
    if (opts.pageNumbers) {
      const { width } = page.getSize();
      const label = `${index + 1} / ${order.length}`;
      const size = 10;
      const textWidth = defaultFont.widthOfTextAtSize(label, size);
      page.drawText(label, {
        x: Math.max(24, (width - textWidth) / 2),
        y: 18,
        size,
        font: defaultFont,
        color: rgb(0.35, 0.35, 0.38),
        opacity: 0.85,
      });
    }
  });

  return out.save();
}
