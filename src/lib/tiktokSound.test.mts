import assert from "node:assert/strict";
import test from "node:test";
import * as T from "./tiktokSound.ts";

const RATE = 8000;
function song() {
  // 40 s: 10 s quiet intro, 10 s loud chorus, 20 s medium
  const x = new Float32Array(RATE * 40);
  for (let i = 0; i < x.length; i++) {
    const t = i / RATE;
    const a = t < 10 ? 0.05 : t < 20 ? 0.8 : 0.3;
    x[i] = a * Math.sin(2 * Math.PI * 220 * t);
  }
  return x;
}

test("findHook picks the loud section", () => {
  const h = T.findHook(song(), RATE, 8);
  assert.ok(h >= 9 && h <= 12.5, `hook at ${h}`);
  assert.equal(T.findHook(new Float32Array(RATE * 5), RATE, 8), 0); // shorter than the window
});
test("peaks", () => {
  const p = T.peaksOf(song(), 40);
  assert.equal(p.length, 40);
  assert.ok(p[15] > p[2] * 5);
  assert.deepEqual(T.peaksOf(new Float32Array(0), 4), [0, 0, 0, 0]);
});
test("renderClip cuts, fades and normalises", () => {
  const s = song();
  const [c] = T.renderClip([s], RATE, 12, 4, { fadeIn: 0.5, fadeOut: 1, normalize: true });
  assert.equal(c.length, 4 * RATE);
  assert.ok(Math.abs(c[0]) < 0.01 && Math.abs(c[c.length - 1]) < 0.01);
  const peak = c.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  assert.ok(peak > 0.88 && peak <= 0.892);
  const [q] = T.renderClip([s], RATE, 12, 4, { fadeIn: 0.1, fadeOut: 0.1, normalize: false });
  assert.ok(q.reduce((m, v) => Math.max(m, Math.abs(v)), 0) <= 0.8001);
  // window past the end is clamped
  assert.equal(T.renderClip([s], RATE, 38, 10, { fadeIn: 0.1, fadeOut: 0.1, normalize: false })[0].length, 2 * RATE);
  assert.equal(T.renderClip([new Float32Array(0)], RATE, 0, 5, { fadeIn: 0, fadeOut: 0, normalize: true })[0].length, 0);
});
test("wav encoding", () => {
  const b = T.wavBytes([new Float32Array([0, 1, -1]), new Float32Array([0, 0.5, -0.5])], 44100);
  assert.equal(b.length, 44 + 3 * 2 * 2);
  assert.equal(String.fromCharCode(...b.slice(0, 4)), "RIFF");
  assert.equal(String.fromCharCode(...b.slice(8, 12)), "WAVE");
  const v = new DataView(b.buffer);
  assert.equal(v.getUint16(22, true), 2);
  assert.equal(v.getUint32(24, true), 44100);
  assert.equal(v.getInt16(44 + 4, true), 32767);
  assert.equal(v.getInt16(44 + 8, true), -32768);
});
test("file names and hand-off text", () => {
  assert.equal(T.safeFile('a/b:c*"d?'), "abcd");
  assert.equal(T.safeFile("   "), "sound");
  const t = T.handoffText({ name: "Moon (hook)", artist: "Martin", isrc: "QZ1234500001", seconds: 29.6 });
  assert.match(t, /Sound name: Moon \(hook\)/);
  assert.match(t, /Length: 0:30/);
  assert.match(t, /ISRC: QZ1234500001/);
  assert.ok(!/ISRC/.test(T.handoffText({ name: "x", artist: "", seconds: 5 })));
});
