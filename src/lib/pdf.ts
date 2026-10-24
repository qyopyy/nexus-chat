// Tiny dependency-free PDF writer: Helvetica text with bold/italic runs, word wrap, headings,
// bullet lists, bordered tables, automatic page breaks and "Page x of y" footers.
import { BOLD, REG } from "./pdfMetrics";

export type Run = { t: string; b?: boolean; i?: boolean };
export type Rich = string | Run[];

const WIN: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e,
  "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};
const FALLBACK: Record<string, string> = { "ő": "ö", "Ő": "Ö", "ű": "ü", "Ű": "Ü", "→": "->", "←": "<-", "✓": "v", "≥": ">=", "≤": "<=" };

/** unicode → WinAnsi byte string (chars 0–255) */
export function winAnsi(s: string) {
  let out = "";
  for (const ch of s.normalize("NFC")) {
    const c = ch.codePointAt(0)!;
    if (c >= 32 && c < 127) out += ch;
    else if (c >= 160 && c <= 255) out += ch;
    else if (WIN[ch] != null) out += String.fromCharCode(WIN[ch]);
    else if (FALLBACK[ch]) out += FALLBACK[ch];
    else if (ch === "\t") out += " ";
    else {
      const base = ch.normalize("NFD")[0];
      out += base && base.charCodeAt(0) < 127 ? base : "?";
    }
  }
  return out;
}
const width = (s: string, size: number, bold: boolean) => {
  const w = bold ? BOLD : REG;
  let n = 0;
  for (let i = 0; i < s.length; i++) n += w[s.charCodeAt(i)] ?? 556;
  return (n * size) / 1000;
};
const pdfStr = (s: string) => {
  let o = "(";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 40 || c === 41 || c === 92) o += "\\" + s[i];
    else if (c > 126 || c < 32) o += "\\" + c.toString(8).padStart(3, "0");
    else o += s[i];
  }
  return o + ")";
};
/** PDF text string for the document info (UTF-16BE, any language) */
const infoStr = (s: string) => {
  let h = "<FEFF";
  for (let i = 0; i < s.length; i++) h += s.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
  return h + ">";
};
const font = (r: Run) => (r.b && r.i ? "F4" : r.b ? "F2" : r.i ? "F3" : "F1");
const runs = (x: Rich): Run[] => (typeof x === "string" ? [{ t: x }] : x).map((r) => ({ ...r, t: winAnsi(r.t) }));
const f2 = (n: number) => (Math.round(n * 100) / 100).toString();

type Word = { t: string; r: Run; w: number; space: number };
type Line = { segs: { t: string; r: Run; x: number }[]; w: number };

export class Pdf {
  private pages: string[][] = [];
  private y = 0;
  readonly W: number;
  readonly H: number;
  readonly M: number;
  private color = "0.11 0.11 0.13";
  constructor(opts: { width?: number; height?: number; margin?: number; title?: string; author?: string } = {}) {
    this.W = opts.width ?? 612; // US Letter
    this.H = opts.height ?? 792;
    this.M = opts.margin ?? 56;
    this.title = opts.title ?? "Document";
    this.author = opts.author ?? "Nexus";
    this.newPage();
  }
  title: string;
  author: string;
  footer = "";
  get contentWidth() {
    return this.W - this.M * 2;
  }
  private get page() {
    return this.pages[this.pages.length - 1];
  }
  private newPage() {
    this.pages.push([]);
    this.y = this.H - this.M;
  }
  private ensure(h: number) {
    if (this.y - h < this.M + 18) this.newPage();
  }
  spacer(h: number) {
    this.y -= h;
  }

  /** break rich text into lines that fit maxW */
  wrap(text: Rich, size: number, maxW: number): Line[] {
    const words: Word[] = [];
    for (const r of runs(text)) {
      const parts = r.t.split(/(\s+|\n)/);
      for (const p of parts) {
        if (p === "") continue;
        if (p === "\n" || /\n/.test(p)) {
          words.push({ t: "\n", r, w: 0, space: 0 });
          continue;
        }
        if (/^\s+$/.test(p)) {
          if (words.length) words[words.length - 1].space += width(" ", size, !!r.b);
          continue;
        }
        words.push({ t: p, r, w: width(p, size, !!r.b), space: 0 });
      }
    }
    const lines: Line[] = [];
    let cur: Line = { segs: [], w: 0 };
    let pendingSpace = 0;
    const push = () => {
      lines.push(cur);
      cur = { segs: [], w: 0 };
      pendingSpace = 0;
    };
    for (const wd of words) {
      if (wd.t === "\n") {
        push();
        continue;
      }
      // a single word wider than the line: hard-split it
      if (wd.w > maxW) {
        let chunk = "";
        for (const ch of wd.t) {
          if (width(chunk + ch, size, !!wd.r.b) > maxW - cur.w - pendingSpace && chunk) {
            cur.segs.push({ t: chunk, r: wd.r, x: cur.w + pendingSpace });
            cur.w += pendingSpace + width(chunk, size, !!wd.r.b);
            push();
            chunk = "";
          }
          chunk += ch;
        }
        cur.segs.push({ t: chunk, r: wd.r, x: cur.w + pendingSpace });
        cur.w += pendingSpace + width(chunk, size, !!wd.r.b);
        pendingSpace = wd.space;
        continue;
      }
      if (cur.segs.length && cur.w + pendingSpace + wd.w > maxW) push();
      const x = cur.segs.length ? cur.w + pendingSpace : 0;
      const last = cur.segs[cur.segs.length - 1];
      // merge with the previous segment when the style matches (fewer text operators)
      if (last && last.r.b === wd.r.b && last.r.i === wd.r.i && pendingSpace > 0 && Math.abs(pendingSpace - width(" ", size, !!wd.r.b)) < 0.01) {
        last.t += " " + wd.t;
      } else cur.segs.push({ t: wd.t, r: wd.r, x });
      cur.w = x + wd.w;
      pendingSpace = wd.space;
    }
    if (cur.segs.length || !lines.length) push();
    return lines;
  }

  private drawLines(lines: Line[], x: number, size: number, lh: number, color = this.color) {
    for (const ln of lines) {
      this.ensure(lh);
      this.y -= lh;
      const base = this.y + (lh - size) / 2 + size * 0.22;
      for (const s of ln.segs) this.page.push(`BT ${color} rg /${font(s.r)} ${size} Tf ${f2(x + s.x)} ${f2(base)} Td ${pdfStr(s.t)} Tj ET`);
    }
  }

  para(text: Rich, o: { size?: number; gap?: number; indent?: number; color?: string; lh?: number } = {}) {
    const size = o.size ?? 10.5;
    const lh = o.lh ?? size * 1.42;
    const ind = o.indent ?? 0;
    this.drawLines(this.wrap(text, size, this.contentWidth - ind), this.M + ind, size, lh, o.color);
    this.y -= o.gap ?? 6;
  }
  h1(text: string) {
    this.ensure(40);
    this.para([{ t: text, b: true }], { size: 19, gap: 4, lh: 26 });
  }
  h2(text: string) {
    this.ensure(46);
    this.y -= 8;
    this.para([{ t: text, b: true }], { size: 12.5, gap: 4, lh: 18 });
  }
  bullets(items: Rich[], o: { size?: number } = {}) {
    const size = o.size ?? 10.5;
    const lh = size * 1.42;
    for (const it of items) {
      const lines = this.wrap(it, size, this.contentWidth - 18);
      this.ensure(lh);
      const yTop = this.y;
      this.page.push(`BT ${this.color} rg /F1 ${size} Tf ${f2(this.M + 5)} ${f2(yTop - lh + (lh - size) / 2 + size * 0.22)} Td ${pdfStr(winAnsi("•"))} Tj ET`);
      this.drawLines(lines, this.M + 18, size, lh);
      this.y -= 2;
    }
    this.y -= 4;
  }
  rule(gap = 8) {
    this.ensure(gap * 2);
    this.y -= gap;
    this.page.push(`0.8 0.8 0.82 RG 0.6 w ${f2(this.M)} ${f2(this.y)} m ${f2(this.W - this.M)} ${f2(this.y)} l S`);
    this.y -= gap;
  }
  /** bordered table; widths are fractions of the content width */
  table(rows: Rich[][], o: { widths?: number[]; header?: boolean; size?: number; minRow?: number; rowMin?: Record<number, number> } = {}) {
    const size = o.size ?? 9.5;
    const lh = size * 1.38;
    const pad = 5;
    const cols = rows[0]?.length ?? 1;
    const fr = o.widths ?? Array(cols).fill(1 / cols);
    const cw = fr.map((f) => f * this.contentWidth);
    this.y -= 2;
    rows.forEach((row, ri) => {
      const head = !!o.header && ri === 0;
      const cells = row.map((c, ci) => this.wrap(head ? runs(c).map((r) => ({ ...r, b: true })) : c, size, cw[ci] - pad * 2));
      const h = Math.max(o.rowMin?.[ri] ?? o.minRow ?? 0, ...cells.map((l) => l.length * lh)) + pad * 2;
      this.ensure(h);
      const top = this.y;
      let x = this.M;
      if (head) this.page.push(`0.94 0.94 0.96 rg ${f2(this.M)} ${f2(top - h)} ${f2(this.contentWidth)} ${f2(h)} re f`);
      cells.forEach((lines, ci) => {
        this.page.push(`0.78 0.78 0.8 RG 0.6 w ${f2(x)} ${f2(top - h)} ${f2(cw[ci])} ${f2(h)} re S`);
        let yy = top - pad;
        for (const ln of lines) {
          yy -= lh;
          const base = yy + (lh - size) / 2 + size * 0.22;
          for (const s of ln.segs) this.page.push(`BT ${this.color} rg /${font(s.r)} ${size} Tf ${f2(x + pad + s.x)} ${f2(base)} Td ${pdfStr(s.t)} Tj ET`);
        }
        x += cw[ci];
      });
      this.y = top - h;
    });
    this.y -= 10;
  }

  output(): Uint8Array {
    const n = this.pages.length;
    const objs: string[] = [];
    const F = ["Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique"];
    // 1 catalog, 2 pages, 3-6 fonts, 7 info, then page + content pairs
    const pageIds = this.pages.map((_, i) => 8 + i * 2);
    objs[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
    objs[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${n} >>`;
    F.forEach((f, i) => (objs[3 + i] = `<< /Type /Font /Subtype /Type1 /BaseFont /${f} /Encoding /WinAnsiEncoding >>`));
    const d = new Date();
    const pd = `D:${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}00Z`;
    objs[7] = `<< /Title ${infoStr(this.title)} /Author ${infoStr(this.author)} /Producer (Nexus License Maker) /CreationDate (${pd}) >>`;
    this.pages.forEach((ops, i) => {
      const foot = `BT 0.5 0.5 0.53 rg /F1 8 Tf ${f2(this.M)} ${f2(this.M - 24)} Td ${pdfStr(winAnsi(this.footer))} Tj ET BT 0.5 0.5 0.53 rg /F1 8 Tf ${f2(this.W - this.M - width(`Page ${i + 1} of ${n}`, 8, false))} ${f2(this.M - 24)} Td (Page ${i + 1} of ${n}) Tj ET`;
      const stream = [...ops, foot].join("\n");
      objs[pageIds[i]] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.W} ${this.H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`;
      objs[pageIds[i] + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    });
    let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
    const offs: number[] = [];
    for (let i = 1; i < objs.length; i++) {
      offs[i] = out.length;
      out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
    }
    const xref = out.length;
    out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
    for (let i = 1; i < objs.length; i++) out += `${String(offs[i]).padStart(10, "0")} 00000 n \n`;
    out += `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }
}
