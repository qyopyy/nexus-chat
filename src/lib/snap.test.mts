import test from "node:test";
import assert from "node:assert/strict";
import { snapFileName, parseExpiry, expiryKey, snapShareText, isSnapShell, cameraErrorMessage, fitWithin, SNAP_EXPIRY, SNAP_FOLDER } from "./snap.ts";

test("file names are sortable and mark selfies", () => {
  const d = new Date(2026, 10, 27, 22, 1, 5);
  assert.equal(snapFileName(d), "snap-2026-11-27-22-01-05.jpg");
  assert.equal(snapFileName(d, "user"), "snap-2026-11-27-22-01-05-selfie.jpg");
  assert.equal(SNAP_FOLDER, "Snap");
});

test("expiry choice round-trips and bad values fall back to 7 days", () => {
  for (const o of SNAP_EXPIRY) assert.equal(parseExpiry(expiryKey(o.hours)), o.hours);
  assert.equal(parseExpiry(null), 168);
  assert.equal(parseExpiry("12345"), 168);
  assert.equal(parseExpiry("never"), null);
});

test("chat text is the link with a camera mark; shell detection by user agent", () => {
  assert.equal(snapShareText("https://nexusproject.cc/s/abc"), "📸 https://nexusproject.cc/s/abc");
  assert.ok(isSnapShell("Mozilla/5.0 (iPhone) NexusSnap NexusApp"));
  assert.ok(!isSnapShell("Mozilla/5.0 (iPhone) Safari"));
  assert.ok(!isSnapShell(undefined));
});

test("camera errors turn into plain advice", () => {
  assert.match(cameraErrorMessage({ name: "NotAllowedError" }), /blocked/i);
  assert.match(cameraErrorMessage({ name: "NotFoundError" }), /No camera/);
  assert.match(cameraErrorMessage({ name: "NotReadableError" }), /busy/);
  assert.match(cameraErrorMessage({ name: "NotAllowedError" }, false), /https/);
  assert.match(cameraErrorMessage(null), /Couldn't start/);
});

test("photos are capped to 2560px on the long edge without upscaling", () => {
  assert.deepEqual(fitWithin(4032, 3024), { w: 2560, h: 1920 });
  assert.deepEqual(fitWithin(1280, 720), { w: 1280, h: 720 });
  assert.deepEqual(fitWithin(0, 0), { w: 0, h: 0 });
});

import { SNAP_QUALITY, qualityByKey, SNAP_RATIOS, ratioByKey, cropRect, SNAP_EFFECTS, effectByKey, applyEffect, pickVideoMime, baseMime, formatDuration, needsCanvasPipeline, isVideoMime, parseRecipient, cameraConstraints } from "./snap.ts";

test("file names take an extension; share text marks videos", () => {
  const d = new Date(2026, 10, 27, 1, 2, 3);
  assert.equal(snapFileName(d, "user", "mp4"), "snap-2026-11-27-01-02-03-selfie.mp4");
  assert.equal(snapFileName(d, "environment", ".webm"), "snap-2026-11-27-01-02-03.webm");
  assert.equal(snapShareText("x", "video"), "🎥 x");
});

test("quality presets get bigger and unknown keys fall back to High", () => {
  assert.ok(SNAP_QUALITY[0].maxEdge < SNAP_QUALITY[1].maxEdge && SNAP_QUALITY[1].maxEdge < SNAP_QUALITY[2].maxEdge);
  assert.ok(SNAP_QUALITY[0].videoBps < SNAP_QUALITY[2].videoBps);
  assert.equal(qualityByKey("nope").key, "high");
  assert.equal(qualityByKey("max").key, "max");
});

test("crop is centered, in bounds, and hits the requested ratio", () => {
  assert.deepEqual(cropRect(1000, 1000, null), { sx: 0, sy: 0, sw: 1000, sh: 1000 });
  const sq = cropRect(1920, 1080, 1);
  assert.deepEqual(sq, { sx: 420, sy: 0, sw: 1080, sh: 1080 });
  const wide = cropRect(1080, 1920, 16 / 9);
  assert.equal(wide.sw, 1080);
  assert.ok(Math.abs(wide.sw / wide.sh - 16 / 9) < 0.01);
  assert.ok(wide.sy >= 0 && wide.sy + wide.sh <= 1920);
  assert.deepEqual(cropRect(0, 0, 1), { sx: 0, sy: 0, sw: 0, sh: 0 });
  for (const r of SNAP_RATIOS) {
    const c = cropRect(4032, 3024, r.r);
    assert.ok(c.sx >= 0 && c.sy >= 0 && c.sx + c.sw <= 4032 && c.sy + c.sh <= 3024);
  }
  assert.equal(ratioByKey("zzz").key, "full");
});

test("every effect changes a colourful pixel, none does not, and values stay in 0..255", () => {
  for (const e of SNAP_EFFECTS) {
    const px = new Uint8ClampedArray([200, 80, 40, 255, 0, 255, 0, 255]);
    const before = Array.from(px);
    applyEffect(px, e.key);
    if (e.key === "none") assert.deepEqual(Array.from(px), before);
    else assert.notDeepEqual(Array.from(px), before, e.key);
    assert.equal(px[3], 255);
    assert.equal(px[7], 255);
  }
  const g = new Uint8ClampedArray([200, 80, 40, 255]);
  applyEffect(g, "mono");
  assert.ok(g[0] === g[1] && g[1] === g[2]);
  const plain = [10, 20, 30, 255];
  applyEffect(plain, "does-not-exist");
  assert.deepEqual(plain, [10, 20, 30, 255]);
  assert.equal(effectByKey("x").key, "none");
  assert.ok(SNAP_EFFECTS.every((e) => e.css.length > 0));
});

test("video format: mp4 first, webm next, null when nothing is supported", () => {
  assert.equal(pickVideoMime(() => true)?.ext, "mp4");
  assert.equal(pickVideoMime((m) => m.startsWith("video/webm"))?.ext, "webm");
  assert.equal(pickVideoMime((m) => m === "video/webm")?.mime, "video/webm");
  assert.equal(pickVideoMime(() => false), null);
  assert.equal(pickVideoMime(() => { throw new Error("x"); }), null);
  assert.equal(baseMime("video/webm;codecs=vp9,opus"), "video/webm");
  assert.ok(isVideoMime("video/mp4") && !isVideoMime("image/jpeg") && !isVideoMime(null));
});

test("durations read like a timer", () => {
  assert.equal(formatDuration(0), "0:00");
  assert.equal(formatDuration(7400), "0:07");
  assert.equal(formatDuration(62_000), "1:02");
  assert.equal(formatDuration(3_723_000), "1:02:03");
  assert.equal(formatDuration(-5), "0:00");
});

test("canvas pipeline only when an effect or a crop is chosen", () => {
  assert.equal(needsCanvasPipeline("none", "full"), false);
  assert.equal(needsCanvasPipeline("mono", "full"), true);
  assert.equal(needsCanvasPipeline("none", "1:1"), true);
});

test("recipients: usernames (with or without @) and emails; junk is rejected", () => {
  assert.deepEqual(parseRecipient(" @Martin "), { kind: "username", value: "martin" });
  assert.deepEqual(parseRecipient("qyopy"), { kind: "username", value: "qyopy" });
  assert.deepEqual(parseRecipient("Me@Example.COM"), { kind: "email", value: "me@example.com" });
  assert.equal(parseRecipient(""), null);
  assert.equal(parseRecipient("a"), null);
  assert.equal(parseRecipient("two words"), null);
  assert.equal(parseRecipient("a@b"), null);
});

test("camera constraints ask for audio only in video mode", () => {
  const v = cameraConstraints("user", SNAP_QUALITY[1], true);
  assert.ok(v.audio);
  assert.equal(cameraConstraints("environment", SNAP_QUALITY[0], false).audio, false);
});

import { fitBox, isMissingRpc } from "./snap.ts";
test("preview box fits the container at the chosen ratio", () => {
  assert.deepEqual(fitBox(400, 800, null), { w: 400, h: 800 });
  assert.deepEqual(fitBox(400, 800, 1), { w: 400, h: 400 });
  assert.deepEqual(fitBox(400, 300, 1), { w: 300, h: 300 });
  assert.deepEqual(fitBox(400, 800, 9 / 16), { w: 400, h: 711 });
  assert.deepEqual(fitBox(0, 5, 1), { w: 0, h: 0 });
});
test("missing database function is recognised", () => {
  assert.ok(isMissingRpc({ code: "PGRST202" }));
  assert.ok(isMissingRpc({ message: "Could not find the function public.snap_find_user" }));
  assert.ok(!isMissingRpc({ code: "42501", message: "permission denied" }));
  assert.ok(!isMissingRpc(null));
});

import { SNAP_TIMERS, parseTimer, nextTimer } from "./snap.ts";
import { cleanCaption, stampText, overlayKey, stickerKey, hasDeco, SNAP_OVERLAYS, SNAP_STICKERS, CAPTION_MAX } from "./snapFx.ts";
import { SCENES, normalizeSceneKey, sceneByKey, coverRect, avatarSize, legsOf, shade, bodyLayout, PANTS_LABEL, SHOES_LABEL } from "./snapScenes.ts";
import { PANTS, SHOES, DEFAULT_AVATAR, normalizeAvatar } from "./vavatar.ts";

test("self-timer cycles off → 3 → 10 → off and rejects junk", () => {
  assert.deepEqual([...SNAP_TIMERS], [0, 3, 10]);
  assert.equal(nextTimer(0), 3);
  assert.equal(nextTimer(3), 10);
  assert.equal(nextTimer(10), 0);
  assert.equal(nextTimer(7), 3);
  assert.equal(parseTimer("10"), 10);
  assert.equal(parseTimer("5"), 0);
  assert.equal(parseTimer(null), 0);
  assert.equal(SNAP_EXPIRY[0].hours, 1);
});

test("captions are cleaned and capped; stamps and overlay/sticker keys are validated", () => {
  assert.equal(cleanCaption("  hi\n\tthere  "), "hi there");
  assert.equal(cleanCaption(42), "");
  assert.equal(cleanCaption("x".repeat(200)).length, CAPTION_MAX);
  assert.equal(stampText(new Date(2026, 10, 27)), "27 11 '26");
  assert.equal(overlayKey("nope"), "none");
  assert.ok(SNAP_OVERLAYS.every((o) => overlayKey(o.key) === o.key));
  assert.equal(stickerKey("🔥"), "🔥");
  assert.equal(stickerKey("x"), "");
  assert.ok(SNAP_STICKERS.length >= 8);
  assert.equal(hasDeco({ overlay: "none", caption: " ", sticker: "" }), false);
  assert.equal(hasDeco({ overlay: "film", caption: "", sticker: "" }), true);
});

test("scenes: 999 and Ksubi packs exist, unknown keys fall back, custom is kept", () => {
  for (const k of ["ksubi999", "ksubiBlack", "ksubiPink", "ksubiBlood", "ksubiDenim", "ksubiBone", "ksubiAcid"]) assert.ok(sceneByKey(k), k);
  assert.equal(new Set(SCENES.map((s) => s.key)).size, SCENES.length);
  assert.equal(normalizeSceneKey("???"), "ksubi999");
  assert.equal(normalizeSceneKey(null), "ksubi999");
  assert.equal(normalizeSceneKey("custom"), "custom");
  assert.equal(normalizeSceneKey("neon"), "neon");
});

test("custom background is cropped to fill, never stretched", () => {
  assert.deepEqual(coverRect(2000, 1000, 500, 1000), { sx: 750, sy: 0, sw: 500, sh: 1000 });
  assert.deepEqual(coverRect(1000, 2000, 1000, 1000), { sx: 0, sy: 500, sw: 1000, sh: 1000 });
  assert.deepEqual(coverRect(0, 0, 10, 10), { sx: 0, sy: 0, sw: 0, sh: 0 });
});

test("avatar canvas: portrait by default, even sizes, phone cap", () => {
  const a = avatarSize(null, 1920, false);
  assert.ok(a.h > a.w && a.w % 2 === 0 && a.h % 2 === 0 && Math.abs(a.w / a.h - 9 / 16) < 0.01);
  assert.equal(avatarSize(1, 2560, true).w, 1280);
  const wide = avatarSize(16 / 9, 1920, false);
  assert.ok(wide.w > wide.h);
});

test("full-body avatar: legs fields survive normalize, junk is dropped, defaults apply", () => {
  const n = normalizeAvatar({ ...DEFAULT_AVATAR, pants: "baggy", pantsColor: "#111111", shoes: "boots", shoesColor: "#ff0000" });
  assert.equal(n.pants, "baggy");
  assert.equal(n.shoes, "boots");
  const bad = normalizeAvatar({ ...DEFAULT_AVATAR, pants: "<script>", pantsColor: "red", shoes: 5, shoesColor: null });
  assert.equal(bad.pants, undefined);
  assert.equal(bad.pantsColor, undefined);
  assert.equal(bad.shoes, undefined);
  assert.deepEqual(legsOf(bad), { pants: "jeans", pantsColor: "#26345a", shoes: "sneakers", shoesColor: "#f4f4f8" });
  assert.deepEqual(legsOf(n), { pants: "baggy", pantsColor: "#111111", shoes: "boots", shoesColor: "#ff0000" });
  assert.ok(PANTS.every((p) => PANTS_LABEL[p]) && SHOES.every((s) => SHOES_LABEL[s]));
  assert.equal(shade("#808080", 1), "#ffffff");
  assert.equal(shade("#808080", -1), "#000000");
  assert.equal(shade("bad", 0.5), "bad");
});

test("body layout keeps the feet on the floor and the head inside the frame", () => {
  const L = bodyLayout(540, 960);
  assert.ok(L.feetPx > L.floorY && L.feetPx < 960);
  assert.ok(L.cy > 0 && L.cy < 1 && L.k > 0.3 && L.k < 0.7);
});

import { OneEuro, PoseSmoother, NEUTRAL, POSE_FILTER } from "./vavatar.ts";
const std = (a: number[]) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };

test("One Euro filter removes jitter when still, and keeps up when you move", () => {
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  const f = new OneEuro(1.3, 1.6);
  const raw: number[] = [], out: number[] = [];
  for (let i = 0; i < 240; i++) { const v = 0.5 + rnd() * 0.1; raw.push(v); out.push(f.filter(v, i * 16)); }
  assert.ok(std(out.slice(60)) < std(raw.slice(60)) * 0.5, "jitter cut by half");
  const g = new OneEuro(1.3, 1.6);
  let y = 0;
  for (let i = 0; i < 12; i++) y = g.filter(i < 2 ? 0 : 1, i * 16); // step to 1.0, ~170 ms later
  assert.ok(y > 0.8, `fast move tracked (got ${y})`);
  assert.equal(new OneEuro(1, 1).filter(0.7, 0), 0.7);
});

test("pose smoother glides between detections instead of stepping, and resets cleanly", () => {
  const sm = new PoseSmoother();
  const a = { ...NEUTRAL, yaw: 0 };
  const b = { ...NEUTRAL, yaw: 1 };
  assert.equal(sm.ready, false);
  assert.deepEqual(sm.sample(0, NEUTRAL), NEUTRAL);
  sm.push(a, 0);
  assert.equal(sm.sample(10, NEUTRAL).yaw, 0);
  sm.push(b, 66); // one-euro already softens the first jump, so just check monotone gliding
  const samples = [66, 80, 100, 120, 140].map((t) => sm.sample(t, NEUTRAL).yaw);
  for (let i = 1; i < samples.length; i++) assert.ok(samples[i] >= samples[i - 1] - 1e-9, "monotone");
  assert.ok(samples[0] < samples[samples.length - 1]);
  assert.ok(samples[samples.length - 1] <= 1);
  sm.reset({ ...NEUTRAL, yaw: 0.4 });
  assert.equal(sm.sample(5000, NEUTRAL).yaw, 0.4);
  assert.deepEqual(Object.keys(POSE_FILTER).sort(), Object.keys(NEUTRAL).sort());
  assert.ok(POSE_FILTER.blinkL[0] > POSE_FILTER.yaw[0], "blinks stay snappier than head");
});

import { pickAudioMime, voiceFileName, isVoiceName, formatTimer, formatClock, rmsLevel, levelToBar, resamplePeaks, peaksFromChannel, barsForDuration, seekFromDrag, SLICE_MS } from "./snapVoice.ts";

test("voice: audio format picks mp4/aac first, then opus, null if nothing", () => {
  assert.equal(pickAudioMime(() => true)?.ext, "m4a");
  assert.equal(pickAudioMime((m) => m.startsWith("audio/webm"))?.ext, "webm");
  assert.equal(pickAudioMime((m) => m.startsWith("audio/ogg"))?.ext, "ogg");
  assert.equal(pickAudioMime(() => false), null);
  assert.equal(pickAudioMime(() => { throw new Error("x"); }), null);
});

test("voice: file names are recognised by Nexus chat as voice messages", () => {
  const n = voiceFileName(new Date(1790000000000), ".m4a");
  assert.equal(n, "voice-1790000000000.m4a");
  assert.ok(isVoiceName(n) && !isVoiceName("photo.jpg") && !isVoiceName(null));
});

test("voice: timer reads like Voice Memos", () => {
  assert.equal(formatTimer(0), "0:00.00");
  assert.equal(formatTimer(7430), "0:07.43");
  assert.equal(formatTimer(62_000), "1:02.00");
  assert.equal(formatTimer(3_723_400), "1:02:03.40");
  assert.equal(formatTimer(-1), "0:00.00");
  assert.equal(formatClock(7.9), "0:07");
  assert.equal(formatClock(125), "2:05");
});

test("voice: loudness and bar heights behave", () => {
  assert.equal(rmsLevel(new Uint8Array(256).fill(128)), 0);
  assert.equal(rmsLevel([]), 0);
  const loud = new Uint8Array(256).map((_, i) => (i % 2 ? 255 : 0));
  assert.ok(rmsLevel(loud) > 0.9);
  assert.equal(levelToBar(0), 0.04);
  assert.equal(levelToBar(1), 1);
  assert.ok(levelToBar(0.1) > levelToBar(0.02));
});

test("voice: resampling keeps spikes, sizes are exact, empty input is a flat line", () => {
  assert.deepEqual(resamplePeaks([0.1, 0.9, 0.1, 0.1], 2), [0.9, 0.1]);
  assert.equal(resamplePeaks([0.5], 5).length, 5);
  assert.deepEqual(resamplePeaks([], 3), [0.04, 0.04, 0.04]);
  assert.deepEqual(resamplePeaks([1], 0), []);
  const sine = Float32Array.from({ length: 8000 }, (_, i) => Math.sin(i / 20) * (i < 4000 ? 0.1 : 0.8));
  const p = peaksFromChannel(sine, 20);
  assert.equal(p.length, 20);
  assert.ok(p.every((x) => x >= 0.04 && x <= 1));
  assert.ok(p[15] > p[3]);
  assert.equal(Math.max(...p), 1);
  assert.equal(barsForDuration(2), 2000 / SLICE_MS);
});

test("voice: dragging the waveform left moves forward and stays inside the clip", () => {
  assert.equal(seekFromDrag(5, -40, 4, 60), 5.5);
  assert.equal(seekFromDrag(5, 40, 4, 60), 4.5);
  assert.equal(seekFromDrag(1, 400, 4, 60), 0);
  assert.equal(seekFromDrag(59, -400, 4, 60), 60);
});
