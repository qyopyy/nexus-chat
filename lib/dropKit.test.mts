import test from "node:test";
import assert from "node:assert/strict";
import { agoText, batchPercent, cleanUsername, dropKind, fmtSize, friendlyDropError, niceFileName, planBatch, timeLeft } from "./dropKit.ts";

test("dropKind: mime first, extension fallback", () => {
  assert.equal(dropKind("image/heic", "a.bin"), "image");
  assert.equal(dropKind(null, "clip.MOV"), "video");
  assert.equal(dropKind("", "song.flac"), "audio");
  assert.equal(dropKind("application/pdf", "x"), "pdf");
  assert.equal(dropKind(null, "notes.docx"), "doc");
  assert.equal(dropKind(null, "mystery"), "file");
});

test("fmtSize and timeLeft read cleanly", () => {
  assert.equal(fmtSize(0), "0 KB");
  assert.equal(fmtSize(500), "1 KB");
  assert.equal(fmtSize(2 * 1048576), "2.0 MB");
  assert.equal(fmtSize(50 * 1048576), "50 MB");
  const now = Date.parse("2026-11-28T12:00:00Z");
  assert.equal(timeLeft("2026-11-28T11:59:00Z", now), "expired");
  assert.equal(timeLeft("2026-11-28T12:40:00Z", now), "40 min left");
  assert.equal(timeLeft("2026-11-28T14:30:00Z", now), "2 h 30 min left");
  assert.equal(timeLeft("2026-11-29T09:00:00Z", now), "21 h left");
  assert.equal(timeLeft("garbage", now), "");
  assert.equal(agoText("2026-11-28T11:59:40Z", now), "just now");
  assert.equal(agoText("2026-11-28T10:00:00Z", now), "2 h ago");
});

test("friendlyDropError maps raw failures to actions", () => {
  assert.match(friendlyDropError(new Error("Object not found")), /removed/);
  assert.match(friendlyDropError("Only a pending, unexpired Drop can be claimed"), /expired/);
  assert.match(friendlyDropError(new Error("Failed to fetch")), /Connection/);
  assert.match(friendlyDropError("The object exceeded the maximum allowed size"), /100 MB/);
  assert.match(friendlyDropError("new row violates row-level security policy"), /permission/);
  assert.equal(friendlyDropError(undefined), "Something went wrong. Try again.");
  assert.ok(friendlyDropError("x".repeat(400)).length <= 140);
});

test("planBatch rejects empty, huge and surplus files with reasons", () => {
  const files = [
    { name: "a", size: 10 },
    { name: "empty", size: 0 },
    { name: "huge", size: 101 * 1024 * 1024 },
    { name: "b", size: 20 },
    { name: "c", size: 30 },
  ];
  const r = planBatch(files, 2);
  assert.deepEqual(r.ok, [0, 3]);
  assert.deepEqual(r.rejected.map((x) => x.name), ["empty", "huge", "c"]);
  assert.match(r.rejected[2].reason, /2 files/);
});

test("cleanUsername, batchPercent and niceFileName", () => {
  assert.equal(cleanUsername("  @@Max Dev "), "MaxDev");
  assert.equal(batchPercent([]), 0);
  assert.equal(batchPercent([1, 0.5, NaN, 2]), 63);
  const d = new Date(2026, 10, 28, 9, 5, 7);
  assert.equal(niceFileName("image.png", "image/png", d), "Nexus 2026-11-28 09.05.07.png");
  assert.equal(niceFileName("holiday.jpg", "image/jpeg", d), "holiday.jpg");
  assert.equal(niceFileName("", "image/jpeg", d), "Nexus 2026-11-28 09.05.07.jpg");
});
