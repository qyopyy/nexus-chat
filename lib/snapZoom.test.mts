import test from "node:test";
import assert from "node:assert/strict";
import { DIGITAL_ZOOM, activeStop, clampZoom, dialZoom, digitalCrop, easeZoom, fmtZoom, magnet, tickOffset, wheelFactor, zoomStops, zoomTicks } from "./snapZoom.ts";

test("zoom: chips follow what the camera can do", () => {
  assert.deepEqual(zoomStops({ min: 1, max: 10 }), [1, 2, 3, 5]);
  assert.deepEqual(zoomStops({ min: 0.5, max: 8 }), [0.5, 1, 2, 3, 5]);
  assert.deepEqual(zoomStops({ min: 1, max: 2 }), [1, 2]);
  assert.deepEqual(zoomStops(DIGITAL_ZOOM), [1, 2, 3, 5]);
  assert.deepEqual(zoomStops({ min: 1, max: 1.4 }), [1]);
});

test("zoom: labels and active chip", () => {
  assert.equal(fmtZoom(1), "1×");
  assert.equal(fmtZoom(2.44), "2.4×");
  assert.equal(fmtZoom(0.5), "0.5×");
  assert.equal(fmtZoom(NaN), "1×");
  const st = [0.5, 1, 2, 3];
  assert.equal(activeStop(0.5, st), 0);
  assert.equal(activeStop(1.4, st), 1);
  assert.equal(activeStop(2.4, st), 2);
  assert.equal(activeStop(9, st), 3);
});

test("zoom: easing glides, never overshoots, lands exactly", () => {
  let z = 1;
  for (let i = 0; i < 4; i++) {
    const next = easeZoom(z, 3, 16);
    assert.ok(next > z && next < 3);
    z = next;
  }
  for (let i = 0; i < 200; i++) z = easeZoom(z, 3, 16);
  assert.equal(z, 3);
  assert.equal(easeZoom(NaN, 2, 16), 2);
  // same distance covered whether it runs at 30 or 120 fps
  let a = 1;
  for (let i = 0; i < 3; i++) a = easeZoom(a, 4, 40);
  let b = 1;
  for (let i = 0; i < 12; i++) b = easeZoom(b, 4, 10);
  assert.ok(Math.abs(a - b) < 0.02);
});

test("zoom: dial drags on a log scale and stays inside the range", () => {
  const r = { min: 1, max: 5 };
  assert.equal(dialZoom(2, 0, r), 2);
  assert.ok(dialZoom(2, -100, r) > 2); // finger left = zoom in
  assert.ok(dialZoom(2, 100, r) < 2);
  assert.equal(dialZoom(2, -9999, r), 5);
  assert.equal(dialZoom(2, 9999, r), 1);
  assert.equal(clampZoom(NaN, r), 1);
  assert.equal(tickOffset(2, 2), 0);
  assert.ok(tickOffset(3, 2) > 0 && tickOffset(1, 2) < 0);
});

test("zoom: detents and ticks", () => {
  assert.equal(magnet(1.97, [1, 2, 3]), 2);
  assert.equal(magnet(2.3, [1, 2, 3]), 2.3);
  const t = zoomTicks({ min: 1, max: 3 });
  assert.equal(t[0].z, 1);
  assert.equal(t[0].major, true);
  assert.equal(t.at(-1)?.z, 3);
  assert.ok(t.some((x) => x.z === 2.5 && !x.major));
  assert.ok(!t.some((x) => x.z === 2.1));
});

test("zoom: digital crop keeps the centre", () => {
  assert.deepEqual(digitalCrop(0, 0, 1000, 500, 1), { sx: 0, sy: 0, sw: 1000, sh: 500 });
  assert.deepEqual(digitalCrop(0, 0, 1000, 500, 2), { sx: 250, sy: 125, sw: 500, sh: 250 });
  assert.deepEqual(digitalCrop(100, 50, 1000, 500, 2), { sx: 350, sy: 175, sw: 500, sh: 250 });
});

test("zoom: wheel is gentle and capped", () => {
  assert.ok(wheelFactor(-100) > 1);
  assert.ok(wheelFactor(100) < 1);
  assert.equal(wheelFactor(-5000), wheelFactor(-240));
});
