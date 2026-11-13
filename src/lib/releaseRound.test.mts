import assert from "node:assert/strict";
import test from "node:test";
import { offlinePath } from "./acetateOffline.ts";
import { pinAgeSeconds, pinIsLive } from "./wumpMapStyle.ts";
import { pickVoiceMime, voiceMemoExt } from "./voiceMemo.ts";
import { wildCell, wildSpawns } from "./wumpWildsPlan.ts";
import { ACETATE_RELEASE, NEXUS_RELEASE } from "./releaseNotes.ts";

test("offline audio stays inside the Acetate service worker scope", () => {
  const path = offlinePath("11111111-1111-1111-1111-111111111111");
  assert.equal(path.startsWith("/acetate/offline/"), true);
  assert.equal(path.includes("/acetate-offline/"), false);
});

test("a pin with no age is not counted as live", () => {
  const now = Date.parse("2026-11-12T12:00:00Z");
  assert.equal(pinAgeSeconds({}), null);
  assert.equal(pinIsLive({}), false);
  assert.equal(pinIsLive({ age_seconds: 0 }), true);
  assert.equal(pinIsLive({ age_seconds: 120 }), false);
  assert.equal(pinIsLive({ updated_at: "2026-11-12T11:59:30Z" }, now), true);
  assert.equal(pinIsLive({ updated_at: "2026-11-12T11:50:00Z" }, now), false);
});

test("phone memos prefer a format iOS can play", () => {
  const mime = pickVoiceMime((type) => type === "audio/mp4" || type === "audio/webm");
  assert.equal(mime, "audio/mp4");
  assert.equal(voiceMemoExt("audio/mp4"), "m4a");
  assert.equal(voiceMemoExt("audio/webm;codecs=opus"), "webm");
});

test("wild spawns stay on the rounded block and are stable", () => {
  const cell = wildCell(47.49791, 19.04023);
  assert.equal(cell.lat, 47.498);
  assert.equal(cell.lng, 19.04);
  const a = wildSpawns(47.49791, 19.04023, Date.parse("2026-11-12T12:00:00Z"));
  const b = wildSpawns(47.4982, 19.0404, Date.parse("2026-11-12T12:04:00Z"));
  assert.equal(a.length, 4);
  assert.deepEqual(a.map((row) => row.species), b.map((row) => row.species));
  assert.equal(a.every((row) => row.meters < 200), true);
});

test("release notes match the shells", () => {
  assert.equal(NEXUS_RELEASE.version, "1.9.0");
  assert.equal(ACETATE_RELEASE.version, "1.2.0");
  assert.equal(NEXUS_RELEASE.items.length >= 4, true);
  assert.equal(ACETATE_RELEASE.items.length >= 3, true);
});
