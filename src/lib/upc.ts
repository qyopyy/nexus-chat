/** GS1 UPC-A / EAN-13 helpers (client-side). */

export type UpcMode = "upc-a" | "ean-13";

export function gs1CheckDigit(bodyWithoutCheck: string): number {
  const digits = bodyWithoutCheck.replace(/\D/g, "").split("").map(Number);
  let sum = 0;
  // From the right: odd positions ×3, even ×1 (GS1)
  for (let i = 0; i < digits.length; i++) {
    const fromRight = digits.length - i;
    sum += digits[i]! * (fromRight % 2 === 1 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

export function normalizeUpcInput(raw: string) {
  return raw.replace(/\D/g, "");
}

/** Build a full code with check digit. body length: UPC-A=11, EAN-13=12. */
export function completeCode(mode: UpcMode, body: string): string | null {
  const digits = normalizeUpcInput(body);
  const need = mode === "upc-a" ? 11 : 12;
  if (digits.length !== need) return null;
  return digits + String(gs1CheckDigit(digits));
}

export function validateCode(code: string): { ok: boolean; mode?: UpcMode; reason?: string } {
  const d = normalizeUpcInput(code);
  if (d.length !== 12 && d.length !== 13) return { ok: false, reason: "Need 12 (UPC-A) or 13 (EAN-13) digits" };
  const mode: UpcMode = d.length === 12 ? "upc-a" : "ean-13";
  const body = d.slice(0, -1);
  const check = Number(d.slice(-1));
  if (gs1CheckDigit(body) !== check) return { ok: false, reason: "Invalid check digit" };
  return { ok: true, mode };
}

/** Sequential body from company prefix + counter (no check digit). */
export function sequentialBody(mode: UpcMode, prefix: string, seq: number): string | null {
  const p = normalizeUpcInput(prefix);
  const need = mode === "upc-a" ? 11 : 12;
  if (p.length < 4 || p.length > need - 1) return null;
  const restLen = need - p.length;
  const max = 10 ** restLen;
  if (seq < 0 || seq >= max) return null;
  return p + String(seq).padStart(restLen, "0");
}

/** Draw a simple Code128-like bars from digits as UPC-A visual (modular bars). */
export function drawUpcBars(canvas: HTMLCanvasElement, code: string, opts?: { height?: number; fg?: string; bg?: string }) {
  const d = normalizeUpcInput(code);
  const h = opts?.height ?? 120;
  const fg = opts?.fg ?? "#111827";
  const bg = opts?.bg ?? "#ffffff";
  const ctx = canvas.getContext("2d");
  if (!ctx || !d) return;
  // Each digit → 7 modules pattern (simplified UPC-A left patterns for preview)
  const L = [
    "0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011",
  ];
  const R = [
    "1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100",
  ];
  let pattern = "101"; // start
  const mid = d.length === 12 ? 6 : 7;
  for (let i = 0; i < d.length; i++) {
    if (i === mid) pattern += "01010";
    const dig = Number(d[i]);
    pattern += i < mid ? L[dig]! : R[dig]!;
  }
  pattern += "101";
  const moduleW = Math.max(2, Math.floor(420 / pattern.length));
  canvas.width = pattern.length * moduleW;
  canvas.height = h + 28;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = fg;
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === "1") ctx.fillRect(i * moduleW, 8, moduleW, h);
  }
  ctx.fillStyle = fg;
  ctx.font = "14px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText(d.replace(/(\d{1})(\d{5})(\d{5})(\d?)/, (_, a, b, c, e) => [a, b, c, e].filter(Boolean).join(" ")), canvas.width / 2, h + 22);
}
