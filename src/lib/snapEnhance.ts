// "Zoom enhance" for photos taken with digital zoom (the picture is a cropped, enlarged part of the frame).
// It is classic image processing that runs on the phone, not a neural network, and nothing is uploaded:
//   1. enlarge in several gentle steps instead of one big jump (cleaner edges),
//   2. sharpen only the brightness of real edges, so flat areas stay smooth and colours don't fringe.

/** Zoom above this gets enhanced; below it the crop is barely smaller than the full frame. */
export const ENHANCE_FROM_ZOOM = 1.25;
/** Largest picture we sharpen on the phone (pixels). Bigger ones keep the smooth upscale only. */
export const ENHANCE_MAX_PIXELS = 12_000_000;

/** Sizes to enlarge through, each at most `maxStep`× the last, ending exactly at the target. */
export function upscaleSteps(sw: number, sh: number, tw: number, th: number, maxStep = 1.6): { w: number; h: number }[] {
  if (!(sw > 0 && sh > 0 && tw > 0 && th > 0)) return [];
  const out: { w: number; h: number }[] = [];
  let w = sw;
  let h = sh;
  const k = Math.max(tw / sw, th / sh);
  if (k <= 1) return [{ w: Math.round(tw), h: Math.round(th) }];
  const n = Math.max(1, Math.ceil(Math.log(k) / Math.log(maxStep)));
  const f = Math.pow(tw / sw, 1 / n);
  const g = Math.pow(th / sh, 1 / n);
  for (let i = 1; i <= n; i++) {
    w = i === n ? tw : sw * Math.pow(f, i);
    h = i === n ? th : sh * Math.pow(g, i);
    out.push({ w: Math.round(w), h: Math.round(h) });
  }
  return out;
}

/** How hard to sharpen for a given zoom: gentle at 1.3×, firmer by 5×, never harsh. */
export function sharpenAmount(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 1) return 0;
  return Math.min(0.85, 0.22 + 0.16 * (zoom - 1));
}

/**
 * Edge-aware luma sharpening, in place on RGBA bytes. Brightness detail is boosted where there is a real edge
 * (gradient between `lo` and `hi`), flat areas and noise are left alone, colours keep their balance.
 */
export function sharpenEdges(data: Uint8ClampedArray, w: number, h: number, amount: number, lo = 4, hi = 28): void {
  if (!(amount > 0) || w < 3 || h < 3) return;
  const n = w * h;
  const luma = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) luma[i] = data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114;
  // blur: [1 2 1]/4 across, then down
  const tmp = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const a = luma[row + (x > 0 ? x - 1 : 0)];
      const b = luma[row + x];
      const c = luma[row + (x < w - 1 ? x + 1 : x)];
      tmp[row + x] = (a + 2 * b + c) * 0.25;
    }
  }
  const blur = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    const up = (y > 0 ? y - 1 : 0) * w;
    const mid = y * w;
    const dn = (y < h - 1 ? y + 1 : y) * w;
    for (let x = 0; x < w; x++) blur[mid + x] = (tmp[up + x] + 2 * tmp[mid + x] + tmp[dn + x]) * 0.25;
  }
  const span = Math.max(1, hi - lo);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = luma[i + 1] - luma[i - 1];
      const gy = luma[i + w] - luma[i - w];
      const grad = Math.abs(gx) + Math.abs(gy);
      const edge = grad <= lo ? 0 : grad >= hi ? 1 : (grad - lo) / span;
      if (edge === 0) continue;
      const d = (luma[i] - blur[i]) * amount * edge;
      const p = i * 4;
      data[p] += d;
      data[p + 1] += d;
      data[p + 2] += d;
    }
  }
}

/**
 * Draws `src` (cropped to sx,sy,sw,sh) into `dest` at w×h with stepwise enlargement, and sharpens when it was zoomed.
 * Returns true when the sharpening ran.
 */
export function drawEnhanced(
  src: CanvasImageSource,
  crop: { sx: number; sy: number; sw: number; sh: number },
  dest: CanvasRenderingContext2D,
  w: number,
  h: number,
  zoom: number,
  mirror: boolean,
): boolean {
  const steps = upscaleSteps(crop.sw, crop.sh, w, h);
  let from: CanvasImageSource = src;
  let sx = crop.sx;
  let sy = crop.sy;
  let sw = crop.sw;
  let sh = crop.sh;
  for (let i = 0; i < steps.length - 1; i++) {
    const c = document.createElement("canvas");
    c.width = steps[i].w;
    c.height = steps[i].h;
    const g = c.getContext("2d");
    if (!g) break;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(from, sx, sy, sw, sh, 0, 0, c.width, c.height);
    from = c;
    sx = 0;
    sy = 0;
    sw = c.width;
    sh = c.height;
  }
  dest.imageSmoothingEnabled = true;
  dest.imageSmoothingQuality = "high";
  if (mirror) {
    dest.translate(w, 0);
    dest.scale(-1, 1);
  }
  dest.drawImage(from, sx, sy, sw, sh, 0, 0, w, h);
  dest.setTransform(1, 0, 0, 1, 0, 0);
  if (zoom < ENHANCE_FROM_ZOOM || w * h > ENHANCE_MAX_PIXELS) return false;
  const img = dest.getImageData(0, 0, w, h);
  sharpenEdges(img.data, w, h, sharpenAmount(zoom));
  dest.putImageData(img, 0, 0);
  return true;
}
