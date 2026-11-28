import test from "node:test";
import assert from "node:assert/strict";
import { ENHANCE_FROM_ZOOM, sharpenAmount, sharpenEdges, upscaleSteps } from "./snapEnhance.ts";

test("enhance: enlarges in gentle steps and lands exactly on the target", () => {
  const s = upscaleSteps(1000, 500, 4000, 2000);
  assert.ok(s.length >= 3);
  assert.deepEqual(s.at(-1), { w: 4000, h: 2000 });
  let prevW = 1000;
  for (const x of s) {
    assert.ok(x.w / prevW <= 1.65 + 0.01);
    prevW = x.w;
  }
  assert.deepEqual(upscaleSteps(2000, 1000, 1000, 500), [{ w: 1000, h: 500 }]);
  assert.deepEqual(upscaleSteps(0, 0, 10, 10), []);
});

test("enhance: sharpening grows with zoom and stays gentle", () => {
  assert.equal(sharpenAmount(1), 0);
  assert.ok(sharpenAmount(2) < sharpenAmount(4));
  assert.ok(sharpenAmount(50) <= 0.85);
  assert.equal(sharpenAmount(NaN), 0);
  assert.ok(ENHANCE_FROM_ZOOM > 1);
});

function img(w: number, h: number, f: (x: number, y: number) => number) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = f(x, y);
    const p = (y * w + x) * 4;
    d[p] = v; d[p + 1] = v; d[p + 2] = v; d[p + 3] = 255;
  }
  return d;
}

test("enhance: a soft edge gets crisper, a flat area and noise stay untouched", () => {
  const w = 40, h = 20;
  // soft ramp edge across the middle
  const soft = img(w, h, (x) => (x < 17 ? 60 : x > 22 ? 190 : 60 + ((x - 17) / 5) * 130));
  const before = Array.from(soft);
  sharpenEdges(soft, w, h, 0.8);
  const row = 10 * w;
  const at = (arr: ArrayLike<number>, x: number) => arr[(row + x) * 4];
  assert.ok(at(soft, 17) < at(before, 17), "dark side gets darker next to the edge");
  assert.ok(at(soft, 22) > at(before, 22), "bright side gets brighter next to the edge");
  assert.equal(at(soft, 3), at(before, 3), "flat dark area unchanged");
  assert.equal(at(soft, 36), at(before, 36), "flat bright area unchanged");
  // faint noise below the edge threshold is not amplified
  const noisy = img(w, h, (x, y) => 120 + ((x * 7 + y * 13) % 3));
  const nb = Array.from(noisy);
  sharpenEdges(noisy, w, h, 0.8);
  assert.deepEqual(Array.from(noisy), nb);
  // alpha is never touched, values stay in range
  assert.ok(soft.every((v, i) => (i % 4 === 3 ? v === 255 : v >= 0 && v <= 255)));
});

test("enhance: zero amount or tiny images do nothing", () => {
  const a = img(2, 2, () => 100);
  const b = Array.from(a);
  sharpenEdges(a, 2, 2, 0.8);
  sharpenEdges(a, 2, 2, 0);
  assert.deepEqual(Array.from(a), b);
});
