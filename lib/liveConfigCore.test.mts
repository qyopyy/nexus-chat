import test from "node:test";
import assert from "node:assert/strict";
import { cleanLive, liveGet, toMap, snapLimits, withSnapLimits, capSeconds } from "./liveConfigCore.ts";

test("clean values", () => {
  assert.equal(cleanLive("snap.camera_enabled", false), false);
  assert.equal(cleanLive("snap.camera_enabled", "no"), true);
  assert.equal(cleanLive("snap.max_video_sec", 60), 60);
  assert.equal(cleanLive("snap.max_video_sec", 61), 180);
  assert.equal(cleanLive("snap.notice", "  hi\u0000there "), "hi there");
  assert.equal(cleanLive("snap.notice", "x".repeat(500)).length, 140);
  assert.equal(cleanLive("nope", 1), null);
});
test("map and defaults", () => {
  const m = toMap([{ key: "snap.max_video_sec", value: 30 }, { key: "evil", value: 1 }, { key: "snap.notice", value: 5 }]);
  assert.deepEqual(Object.keys(m).sort(), ["snap.max_video_sec", "snap.notice"]);
  assert.equal(liveGet(m, "snap.max_video_sec"), 30);
  assert.equal(liveGet({}, "snap.camera_enabled"), true);
  assert.equal(snapLimits(m).notice, "");
});
test("limits only lower", () => {
  assert.equal(capSeconds(180, 60), 60);
  assert.equal(capSeconds(30, 180), 30);
  const p = { zoomEnhance: true, maxVideoSec: 180 as 30 | 60 | 180 };
  assert.equal(withSnapLimits(p, { "snap.max_video_sec": 60 }).maxVideoSec, 60);
  assert.equal(withSnapLimits(p, { "snap.max_video_sec": 300 }).maxVideoSec, 180);
  assert.equal(withSnapLimits({ ...p, maxVideoSec: 30 }, { "snap.max_video_sec": 300 }).maxVideoSec, 30);
  assert.equal(withSnapLimits(p, { "snap.zoom_enhance": false }).zoomEnhance, false);
  assert.equal(withSnapLimits({ ...p, zoomEnhance: false }, {}).zoomEnhance, false);
});
