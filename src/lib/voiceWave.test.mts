import { levelFromBytes, elapsedMs, clock } from "./voiceWave.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { VOICE_BARS, decodePeaks, downsamplePeaks, encodePeaks, isFlat, parseVoiceName, voiceName } from "./voiceWave.ts";

test("voice wave: levels become 36 bars, loudest full height, never below the floor", () => {
  const levels = Array.from({ length: 200 }, (_, i) => (i % 20 === 0 ? 0.9 : 0.2));
  const p = downsamplePeaks(levels);
  assert.equal(p.length, VOICE_BARS);
  assert.equal(Math.max(...p), 1);
  assert.ok(Math.min(...p) >= 0.12);
  assert.equal(downsamplePeaks([]).length, VOICE_BARS);
  assert.equal(downsamplePeaks([0.5]).length, VOICE_BARS);
  assert.ok(downsamplePeaks([NaN, 0.4, 0.8]).every(Number.isFinite));
});

test("voice wave: survives the trip through the file name", () => {
  const p = downsamplePeaks(Array.from({ length: 120 }, (_, i) => 0.1 + 0.9 * Math.abs(Math.sin(i / 7))));
  const name = voiceName(1764300000000, 63.4, p, "m4a");
  assert.match(name, /^voice-1764300000000-d63-p[0-9a-z]{36}\.m4a$/);
  const back = parseVoiceName(name)!;
  assert.equal(back.duration, 63);
  assert.equal(back.peaks.length, VOICE_BARS);
  back.peaks.forEach((v, i) => assert.ok(Math.abs(v - p[i]) < 0.04, `bar ${i}`));
  // the upload step only keeps [\w.-], so the name must already be made of those
  assert.equal(name, name.replace(/[^\w.\-]+/g, "_"));
});

test("voice wave: old or odd names give null instead of a wrong waveform", () => {
  assert.equal(parseVoiceName("voice-1764300000000.webm"), null);
  assert.equal(parseVoiceName("song.mp3"), null);
  assert.equal(parseVoiceName(null), null);
  assert.equal(parseVoiceName("voice-1-d5-pXYZ.m4a"), null);
  assert.equal(decodePeaks("short"), null);
  assert.equal(encodePeaks([1, 0]).length, VOICE_BARS);
});

test("voice wave: a silent or broken decode counts as flat", () => {
  assert.equal(isFlat(Array(36).fill(0.12)), true);
  assert.equal(isFlat([NaN, 0.5]), true);
  assert.equal(isFlat([]), true);
  assert.equal(isFlat([0.12, 0.9, 0.3]), false);
});

test("level from samples", () => {
  assert.equal(levelFromBytes(new Uint8Array(64).fill(128)), 0.08);
  const loud = new Uint8Array(64).map((_, i) => (i % 2 ? 250 : 6));
  assert.ok(levelFromBytes(loud) > 0.9);
  const soft = new Uint8Array(64).map((_, i) => (i % 2 ? 138 : 118));
  const l = levelFromBytes(soft);
  assert.ok(l > 0.08 && l < 0.7);
  assert.equal(levelFromBytes([]), 0.08);
});
test("elapsed ignores pauses", () => {
  assert.equal(elapsedMs(1000, 0, null, 6000), 5000);
  assert.equal(elapsedMs(1000, 2000, null, 6000), 3000);
  assert.equal(elapsedMs(1000, 0, 4000, 9000), 3000, "frozen while paused");
  assert.equal(clock(65_400), "1:05");
});
