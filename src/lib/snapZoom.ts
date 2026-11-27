// Camera zoom maths (pure, no DOM). The camera component runs these inside an animation loop so zoom glides
// instead of jumping, and draws the iPhone-style lens chips and zoom dial from them.

export type ZoomRange = { min: number; max: number };

/** Digital zoom range used when the camera has no hardware zoom (most iPhone web views). */
export const DIGITAL_ZOOM: ZoomRange = { min: 1, max: 5 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const clampZoom = (z: number, r: ZoomRange) => (Number.isFinite(z) ? clamp(z, r.min, r.max) : r.min);

/** The lens chips: 0.5× (only if the camera goes that wide), 1×, 2×, 3×, 5× inside the camera's range. */
export function zoomStops(r: ZoomRange): number[] {
  const out = [0.5, 1, 2, 3, 5].filter((s) => s >= r.min - 0.001 && s <= r.max + 0.001);
  if (!out.length) return [Number(r.min.toFixed(1))];
  if (r.min < 0.95 && !out.includes(r.min) && r.min > 0.5) out.unshift(Number(r.min.toFixed(1)));
  return out;
}

/** "1×", "2.4×", "0.5×". */
export function fmtZoom(z: number): string {
  if (!Number.isFinite(z)) return "1×";
  const r = Math.round(z * 10) / 10;
  return `${Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1)}×`;
}

/** Index of the chip the current zoom belongs to: the last chip at or below it (so 2.4× lights the 2× chip). */
export function activeStop(z: number, stops: number[]): number {
  let idx = 0;
  stops.forEach((s, i) => {
    if (z >= s - 0.05) idx = i;
  });
  return idx;
}

/** Eases `current` toward `target` over time; frame-rate independent, and lands exactly when close. */
export function easeZoom(current: number, target: number, dtMs: number, tauMs = 90): number {
  if (!Number.isFinite(current)) return target;
  if (Math.abs(target - current) < 0.003) return target;
  const k = 1 - Math.exp(-Math.max(0, dtMs) / tauMs);
  return current + (target - current) * k;
}

/** How far the dial moves per unit of ln(zoom), in px. Same scale for ticks and for dragging. */
export const DIAL_PX_PER_LN = 130;

/** Dragging the dial by `dx` px (finger moves left = zoom in) from `start`. */
export function dialZoom(start: number, dx: number, r: ZoomRange): number {
  return clampZoom(start * Math.exp(-dx / DIAL_PX_PER_LN), r);
}

/** Pulls the zoom onto a chip when it is within `tol` (relative), like the lens detents on an iPhone. */
export function magnet(z: number, stops: number[], tol = 0.04): number {
  for (const s of stops) if (Math.abs(z - s) / s <= tol) return s;
  return z;
}

export type Tick = { z: number; major: boolean; label: string | null };

/** Dial ticks inside the range: major on whole numbers, minor every 0.1 below 2× and every 0.5 above. */
export function zoomTicks(r: ZoomRange): Tick[] {
  const out: Tick[] = [];
  for (let n = Math.ceil(r.min * 10); n <= Math.floor(r.max * 10 + 0.001); n++) {
    const z = n / 10;
    const whole = Number.isInteger(z);
    if (z >= 2 && !whole && Math.abs(z * 2 - Math.round(z * 2)) > 0.001) continue;
    out.push({ z, major: whole, label: whole ? `${z}` : null });
  }
  return out;
}

/** Horizontal offset of a tick from the dial centre (px) when the camera is at `current`. */
export const tickOffset = (tick: number, current: number) => Math.log(tick / current) * DIAL_PX_PER_LN;

/** Part of a `cw`×`ch` frame that stays visible with digital zoom `z`, centred. */
export function digitalCrop(sx: number, sy: number, sw: number, sh: number, z: number): { sx: number; sy: number; sw: number; sh: number } {
  const k = Number.isFinite(z) && z > 1 ? z : 1;
  if (k === 1) return { sx, sy, sw, sh };
  const w = sw / k;
  const h = sh / k;
  return { sx: sx + (sw - w) / 2, sy: sy + (sh - h) / 2, sw: w, sh: h };
}

/** Mouse wheel / trackpad: a step factor, so one notch is about 8% and a hard spin is bigger but capped. */
export function wheelFactor(deltaY: number): number {
  const d = clamp(deltaY, -240, 240);
  return Math.exp(-d * 0.0009);
}
