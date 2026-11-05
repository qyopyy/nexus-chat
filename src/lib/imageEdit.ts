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
    ctx.fillStyle = "#ffffff";
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
  if (opts.crop) {
    const { x, y, w, h } = opts.crop;
    ctx.drawImage(img, x, y, w, h, -opts.width / 2, -opts.height / 2, opts.width, opts.height);
  } else {
    ctx.drawImage(img, -opts.width / 2, -opts.height / 2, opts.width, opts.height);
  }
  ctx.restore();
  ctx.filter = "none";
}

/** Bicubic-ish upscale via stepwise high-quality draw + unsharp mask. */
export function upscaleImage(
  source: HTMLCanvasElement | HTMLImageElement,
  scale: number,
  sharpen = 0.55,
): HTMLCanvasElement {
  const factor = Math.max(1, Math.min(4, scale));
  const srcW = "naturalWidth" in source && source.naturalWidth ? source.naturalWidth : source.width;
  const srcH = "naturalHeight" in source && source.naturalHeight ? source.naturalHeight : source.height;
  const targetW = Math.max(1, Math.round(srcW * factor));
  const targetH = Math.max(1, Math.round(srcH * factor));

  // Step up ≤2× at a time for cleaner interpolation
  let cur = document.createElement("canvas");
  cur.width = srcW;
  cur.height = srcH;
  const c0 = cur.getContext("2d")!;
  c0.imageSmoothingEnabled = true;
  c0.imageSmoothingQuality = "high";
  c0.drawImage(source, 0, 0);

  let w = srcW;
  let h = srcH;
  while (w < targetW || h < targetH) {
    const nw = Math.min(targetW, Math.max(w + 1, Math.round(w * 1.75)));
    const nh = Math.min(targetH, Math.max(h + 1, Math.round(h * 1.75)));
    const next = document.createElement("canvas");
    next.width = nw;
    next.height = nh;
    const ctx = next.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(cur, 0, 0, nw, nh);
    cur = next;
    w = nw;
    h = nh;
  }

  if (sharpen <= 0) return cur;
  return unsharp(cur, sharpen);
}

function unsharp(src: HTMLCanvasElement, amount: number) {
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
    }
  }
  ctx.putImageData(img, 0, 0);
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
