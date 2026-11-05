/** On-device canvas image helpers for Apps → Image studio. */

export type ImageFormat = "image/png" | "image/jpeg" | "image/webp";

export type FilterAdjust = {
  brightness: number; // 0–200, 100 = none
  contrast: number;
  saturate: number;
  blur: number; // px
  grayscale: number; // 0–100
  sepia: number;
  hue: number; // deg
  invert: number; // 0–100
};

export const DEFAULT_FILTERS: FilterAdjust = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  blur: 0,
  grayscale: 0,
  sepia: 0,
  hue: 0,
  invert: 0,
};

export type CropRect = { x: number; y: number; w: number; h: number };

export type UpscaleExtras = {
  sharpen?: number; // 0–1.5
  denoise?: number; // 0–1 light pre-blur
  edgeEnhance?: number; // 0–1
  flipH?: boolean;
  flipV?: boolean;
  /** Keep transparent pixels (PNG). JPEG always composites on jpegBg. */
  preserveAlpha?: boolean;
  /** Background used when flattening for JPEG (or when preserveAlpha is false). */
  jpegBg?: string;
};

export function filterCss(f: FilterAdjust) {
  return [
    `brightness(${f.brightness}%)`,
    `contrast(${f.contrast}%)`,
    `saturate(${f.saturate}%)`,
    f.blur > 0 ? `blur(${f.blur}px)` : "",
    f.grayscale > 0 ? `grayscale(${f.grayscale}%)` : "",
    f.sepia > 0 ? `sepia(${f.sepia}%)` : "",
    f.hue ? `hue-rotate(${f.hue}deg)` : "",
    f.invert > 0 ? `invert(${f.invert}%)` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function extFor(format: ImageFormat) {
  if (format === "image/jpeg") return "jpg";
  if (format === "image/webp") return "webp";
  return "png";
}

export function loadImageFromFile(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => {
      URL.revokeObjectURL(url);
      resolve(el);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    el.src = url;
  });
}

function dimsOf(source: HTMLCanvasElement | HTMLImageElement) {
  const w = "naturalWidth" in source && source.naturalWidth ? source.naturalWidth : source.width;
  const h = "naturalHeight" in source && source.naturalHeight ? source.naturalHeight : source.height;
  return { w, h };
}

export function drawImage(
  canvas: HTMLCanvasElement,
  img: CanvasImageSource,
  opts: {
    width: number;
    height: number;
    rotation?: number;
    crop?: CropRect | null;
    filters?: FilterAdjust | null;
    jpegFill?: boolean;
    fillColor?: string;
    flipH?: boolean;
    flipV?: boolean;
  },
) {
  const rot = ((opts.rotation ?? 0) % 360 + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const outW = swap ? opts.height : opts.width;
  const outH = swap ? opts.width : opts.height;
  canvas.width = Math.max(1, Math.round(outW));
  canvas.height = Math.max(1, Math.round(outH));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  if (opts.jpegFill) {
    ctx.fillStyle = opts.fillColor || "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (opts.filters) ctx.filter = filterCss(opts.filters);
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.scale(opts.flipH ? -1 : 1, opts.flipV ? -1 : 1);
  if (opts.crop) {
    const { x, y, w, h } = opts.crop;
    ctx.drawImage(img, x, y, w, h, -opts.width / 2, -opts.height / 2, opts.width, opts.height);
  } else {
    ctx.drawImage(img, -opts.width / 2, -opts.height / 2, opts.width, opts.height);
  }
  ctx.restore();
  ctx.filter = "none";
}

/** Light denoise (box blur) before upscaling — helps JPEG blockiness. */
function denoiseCanvas(src: HTMLCanvasElement, amount: number) {
  if (amount <= 0) return src;
  const r = Math.max(1, Math.round(amount * 2));
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d")!;
  ctx.filter = `blur(${r * 0.35}px)`;
  ctx.drawImage(src, 0, 0);
  ctx.filter = "none";
  // blend original back so it doesn't go too soft
  ctx.globalAlpha = Math.max(0.25, 1 - amount * 0.55);
  ctx.drawImage(src, 0, 0);
  ctx.globalAlpha = 1;
  return out;
}

function edgeEnhance(src: HTMLCanvasElement, amount: number) {
  if (amount <= 0) return src;
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const data = img.data;
  const copy = new Uint8ClampedArray(data);
  const w = out.width;
  const h = out.height;
  const a = Math.max(0, Math.min(1.2, amount));
  // Laplacian-ish sharpen kernel
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const lap =
          -copy[i - w * 4 + c] - copy[i - 4 + c] + 5 * copy[i + c] - copy[i + 4 + c] - copy[i + w * 4 + c];
        data[i + c] = Math.max(0, Math.min(255, copy[i + c] * (1 - a) + lap * a));
      }
      // leave alpha untouched
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function unsharp(src: HTMLCanvasElement, amount: number, preserveAlpha: boolean) {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const data = img.data;
  const copy = new Uint8ClampedArray(data);
  const w = out.width;
  const h = out.height;
  const a = Math.max(0, Math.min(1.5, amount));
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const blur =
          (copy[i + c] * 4 +
            copy[i - 4 + c] +
            copy[i + 4 + c] +
            copy[i - w * 4 + c] +
            copy[i + w * 4 + c]) /
          8;
        data[i + c] = Math.max(0, Math.min(255, copy[i + c] + (copy[i + c] - blur) * a));
      }
      if (preserveAlpha) data[i + 3] = copy[i + 3];
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function flipCanvas(src: HTMLCanvasElement, flipH: boolean, flipV: boolean) {
  if (!flipH && !flipV) return src;
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d")!;
  ctx.translate(flipH ? out.width : 0, flipV ? out.height : 0);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.drawImage(src, 0, 0);
  return out;
}

function flattenOnBg(src: HTMLCanvasElement, bg: string) {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = bg || "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(src, 0, 0);
  return out;
}

/** Bicubic-ish upscale via stepwise high-quality draw + optional extras. */
export function upscaleImage(
  source: HTMLCanvasElement | HTMLImageElement,
  scale: number,
  extras: number | UpscaleExtras = 0.55,
): HTMLCanvasElement {
  const opts: UpscaleExtras = typeof extras === "number" ? { sharpen: extras, preserveAlpha: true } : extras;
  const factor = Math.max(1, Math.min(4, scale));
  const { w: srcW, h: srcH } = dimsOf(source);
  const targetW = Math.max(1, Math.round(srcW * factor));
  const targetH = Math.max(1, Math.round(srcH * factor));
  const preserveAlpha = opts.preserveAlpha !== false;

  let cur = document.createElement("canvas");
  cur.width = srcW;
  cur.height = srcH;
  const c0 = cur.getContext("2d", { willReadFrequently: true })!;
  c0.imageSmoothingEnabled = true;
  c0.imageSmoothingQuality = "high";
  if (!preserveAlpha) {
    c0.fillStyle = opts.jpegBg || "#ffffff";
    c0.fillRect(0, 0, srcW, srcH);
  } else {
    c0.clearRect(0, 0, srcW, srcH);
  }
  c0.drawImage(source, 0, 0);

  cur = flipCanvas(cur, !!opts.flipH, !!opts.flipV);
  cur = denoiseCanvas(cur, Math.max(0, Math.min(1, opts.denoise ?? 0)));

  let w = cur.width;
  let h = cur.height;
  while (w < targetW || h < targetH) {
    const nw = Math.min(targetW, Math.max(w + 1, Math.round(w * 1.75)));
    const nh = Math.min(targetH, Math.max(h + 1, Math.round(h * 1.75)));
    const next = document.createElement("canvas");
    next.width = nw;
    next.height = nh;
    const ctx = next.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    if (!preserveAlpha) {
      ctx.fillStyle = opts.jpegBg || "#ffffff";
      ctx.fillRect(0, 0, nw, nh);
    }
    ctx.drawImage(cur, 0, 0, nw, nh);
    cur = next;
    w = nw;
    h = nh;
  }

  cur = edgeEnhance(cur, Math.max(0, Math.min(1, opts.edgeEnhance ?? 0)));
  const sharpen = opts.sharpen ?? 0;
  if (sharpen > 0) cur = unsharp(cur, sharpen, preserveAlpha);
  return cur;
}

/** Scale so the long edge hits `longEdge` (clamped). */
export function scaleForLongEdge(srcW: number, srcH: number, longEdge: number, maxEdge = 8192) {
  const longest = Math.max(srcW, srcH);
  if (longest <= 0) return 1;
  const target = Math.max(1, Math.min(maxEdge, longEdge));
  return Math.max(1, Math.min(4, target / longest));
}

/** Encode the same upscaled canvas as PNG and/or JPEG with correct flattening. */
export async function exportUpscaled(
  upscaled: HTMLCanvasElement,
  formats: ImageFormat[],
  quality = 0.92,
  jpegBg = "#ffffff",
): Promise<{ format: ImageFormat; blob: Blob; ext: string }[]> {
  const out: { format: ImageFormat; blob: Blob; ext: string }[] = [];
  for (const format of formats) {
    const canvas = format === "image/jpeg" ? flattenOnBg(upscaled, jpegBg) : upscaled;
    const blob = await canvasToBlob(canvas, format, quality);
    out.push({ format, blob, ext: extFor(format) });
  }
  return out;
}

export function canvasToBlob(canvas: HTMLCanvasElement, format: ImageFormat, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("This browser couldn't encode that format. Try PNG."))),
      format,
      format === "image/png" ? undefined : quality,
    );
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
