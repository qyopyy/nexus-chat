import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PREFS, parsePrefs, serializePrefs, roundPosition, mapsUrl, snapNote, sendText, validPin, hashPin, checkPin, lockoutLeft, shouldRelock, RELOCK_AFTER_MS } from "./snapPrefs.ts";
import { autoQualityKey, effectiveQualityKey, isCompactHeight, targetSize, constraintLadder, upgradeTo, tapToVideoPoint, pinchZoom, rollFromGravity, isLevel } from "./snapDevice.ts";
import { qualityByKey } from "./snap.ts";

test("settings: defaults survive bad, partial and hostile input", () => {
  assert.deepEqual(parsePrefs(null), DEFAULT_PREFS);
  assert.deepEqual(parsePrefs("{nope"), DEFAULT_PREFS);
  assert.deepEqual(parsePrefs("[1,2]"), DEFAULT_PREFS);
  const p = parsePrefs({ tapFocus: false, gridStyle: "golden", maxVideoSec: 60, geoTag: "precise", maxDownloads: 7, nearbyMinutes: "5", startFacing: "user", evil: 1, appLock: "yes" });
  assert.equal(p.tapFocus, false);
  assert.equal(p.gridStyle, "golden");
  assert.equal(p.maxVideoSec, 60);
  assert.equal(p.geoTag, "precise");
  assert.equal(p.maxDownloads, 0, "7 is not a choice");
  assert.equal(p.nearbyMinutes, 10, "a string is not a choice");
  assert.equal(p.startFacing, "user");
  assert.equal(p.appLock, false, "only real booleans count");
  assert.equal("evil" in p, false);
});

test("settings round-trip and the privacy defaults are the safe ones", () => {
  const p = parsePrefs({ leftHanded: true, shutterSound: true });
  assert.deepEqual(parsePrefs(serializePrefs(p)), p);
  assert.equal(DEFAULT_PREFS.geoTag, "off");
  assert.equal(DEFAULT_PREFS.locationInSend, false);
  assert.equal(DEFAULT_PREFS.appLock, false);
  assert.equal(DEFAULT_PREFS.privacyScreen, true);
});

test("location: approximate is ~1 km, precise ~1 m, off or garbage is nothing", () => {
  assert.deepEqual(roundPosition(47.497912, 19.040235, "approx"), { lat: 47.5, lng: 19.04 });
  assert.deepEqual(roundPosition(47.497912, 19.040235, "precise"), { lat: 47.49791, lng: 19.04024 });
  assert.equal(roundPosition(47.4, 19, "off"), null);
  assert.equal(roundPosition(NaN, 19, "precise"), null);
  assert.equal(roundPosition(91, 19, "precise"), null);
  const p = { lat: 47.5, lng: 19.04 };
  assert.equal(mapsUrl(p), "https://maps.google.com/?q=47.5,19.04");
  assert.equal(snapNote(null), "Nexus Snap");
  assert.equal(snapNote(p), "Nexus Snap · 47.5,19.04");
  assert.equal(sendText("📸 L", p, false), "📸 L");
  assert.equal(sendText("📸 L", null, true), "📸 L");
  assert.equal(sendText("📸 L", p, true), "📸 L\n📍 https://maps.google.com/?q=47.5,19.04");
});

test("PIN: only 4-8 digits, stored salted, checked, locks out after 5 misses", async () => {
  assert.equal(validPin("1234"), true);
  assert.equal(validPin("123"), false);
  assert.equal(validPin("12345678"), true);
  assert.equal(validPin("123456789"), false);
  assert.equal(validPin("12a4"), false);
  const a = await hashPin("4821");
  const b = await hashPin("4821");
  assert.notEqual(a, b, "different salts");
  assert.equal(a.includes("4821"), false);
  assert.equal(await checkPin("4821", a), true);
  assert.equal(await checkPin("4822", a), false);
  assert.equal(await checkPin("4821", null), false);
  assert.equal(await checkPin("4821", "garbage"), false);
  assert.equal(lockoutLeft(4, 0, 1000), 0);
  assert.equal(lockoutLeft(5, 1000, 11_000), 20_000);
  assert.equal(lockoutLeft(5, 1000, 40_000), 0);
  assert.equal(lockoutLeft(6, 1000, 2000), 0, "the wait only follows every 5th miss");
  assert.equal(lockoutLeft(10, 1000, 2000), 29_000);
  assert.equal(shouldRelock(null, 99999), false);
  assert.equal(shouldRelock(0, RELOCK_AFTER_MS - 1), false);
  assert.equal(shouldRelock(0, RELOCK_AFTER_MS), true);
});

const phone = (o = {}) => ({ screenW: 390, screenH: 844, dpr: 3, ...o });
test("auto resolution by device", () => {
  assert.equal(autoQualityKey(phone({ cores: 6 })), "max"); // 844*3 = 2532 physical, no memory info (iPhone)
  assert.equal(autoQualityKey(phone({ memoryGb: 8, cores: 8 })), "max");
  assert.equal(autoQualityKey(phone({ memoryGb: 4, cores: 8 })), "high");
  assert.equal(autoQualityKey(phone({ memoryGb: 2 })), "standard");
  assert.equal(autoQualityKey(phone({ saveData: true })), "standard");
  assert.equal(autoQualityKey(phone({ effectiveType: "3g" })), "standard");
  assert.equal(autoQualityKey(phone({ effectiveType: "4g" })), "max");
  assert.equal(autoQualityKey({ screenW: 320, screenH: 480, dpr: 2 }), "standard"); // old small iPhone: 960 px
  assert.equal(autoQualityKey({ screenW: 375, screenH: 667, dpr: 2 }), "high"); // SE 2/3: 1334 px
  assert.equal(effectiveQualityKey("max", true, true, phone()), "standard", "data saver wins");
  assert.equal(effectiveQualityKey("standard", true, false, phone()), "max", "auto beats the stored pick");
  assert.equal(effectiveQualityKey("standard", false, false, phone()), "standard");
  assert.equal(effectiveQualityKey("bogus", false, false, phone()), "high");
});

test("small screens and capture sizes", () => {
  assert.equal(isCompactHeight(667), true);
  assert.equal(isCompactHeight(844), false);
  assert.equal(isCompactHeight(0), false);
  const max = qualityByKey("max");
  assert.deepEqual(targetSize(max), { w: 3840, h: 2880 });
  assert.deepEqual(targetSize(max, { width: { max: 1280 }, height: { max: 720 } }), { w: 1280, h: 960 }, "never more than the camera can do");
  assert.deepEqual(targetSize(qualityByKey("standard")), { w: 1280, h: 960 });
  const ladder = constraintLadder("user", qualityByKey("high"), true);
  assert.equal(ladder.length, 3);
  assert.equal(ladder[2].video, true);
  assert.ok(ladder[0].audio && ladder[2].audio);
  assert.equal(constraintLadder("user", qualityByKey("high"), false)[0].audio, false);
  const hi = qualityByKey("high");
  assert.deepEqual(upgradeTo(hi, { width: 640, height: 480 }, { width: { max: 4032 }, height: { max: 3024 } }), { width: 1920, height: 1440 });
  assert.equal(upgradeTo(hi, { width: 1920, height: 1080 }, { width: { max: 4032 } }), null, "already there");
  assert.equal(upgradeTo(hi, { width: 640, height: 480 }, undefined), null);
  assert.equal(upgradeTo(hi, {}, { width: { max: 4032 } }), null);
});

test("tap to focus maps preview coordinates to the camera", () => {
  // box 300x600 showing a 1920x1080 landscape video with object-cover: the sides are cropped
  const c = tapToVideoPoint(150, 300, 300, 600, 1920, 1080, false)!;
  assert.ok(Math.abs(c.x - 0.5) < 1e-9 && Math.abs(c.y - 0.5) < 1e-9, "centre stays centre");
  const l = tapToVideoPoint(0, 0, 300, 600, 1920, 1080, false)!;
  assert.ok(l.x > 0.35 && l.x < 0.37, `left edge sits inside the video (${l.x})`);
  assert.equal(l.y, 0);
  const m = tapToVideoPoint(0, 300, 300, 600, 1920, 1080, true)!;
  assert.ok(Math.abs(m.x - (1 - l.x)) < 1e-9, "front camera is mirrored");
  const full = tapToVideoPoint(300, 600, 300, 600, 1920, 1080, false)!;
  assert.ok(full.x < 0.7 && full.y === 1);
  assert.equal(tapToVideoPoint(1, 1, 0, 600, 1920, 1080, false), null);
  assert.deepEqual(tapToVideoPoint(100, 50, 400, 300, 800, 600, false), { x: 0.25, y: 50 / 300 });
});

test("pinch zoom and level guide", () => {
  assert.equal(pinchZoom(1, 2, 1, 5), 2);
  assert.equal(pinchZoom(2, 10, 1, 5), 5);
  assert.equal(pinchZoom(2, 0.01, 1, 5), 1);
  assert.equal(pinchZoom(2, NaN, 1, 5), 2);
  assert.equal(rollFromGravity(0, 9.8), 0);
  assert.ok(Math.abs(rollFromGravity(9.8, 9.8) - 45) < 1e-9);
  assert.equal(rollFromGravity(0, 0), 0);
  assert.equal(isLevel(1), true);
  assert.equal(isLevel(-2), false);
});
