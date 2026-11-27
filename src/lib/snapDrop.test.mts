import { test } from "node:test";
import assert from "node:assert/strict";
import {
  geohashEncode, geohashBox, geohashAround, dropCell, cellTopic, isUuid, nearbyFromPresence, statusLabel, isHardDropError, canShareFile, isShareCancel,
} from "./snapDrop.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

test("geohash matches the well-known reference vectors", () => {
  assert.equal(geohashEncode(57.64911, 10.40744, 11), "u4pruydqqvj");
  assert.equal(geohashEncode(42.605, -5.603, 5), "ezs42");
  assert.equal(dropCell(57.64911, 10.40744), "u4pruy");
});
test("geohash handles the date line, poles and bad input", () => {
  assert.equal(geohashEncode(10, 190, 5), geohashEncode(10, -170, 5));
  assert.equal(geohashEncode(95, 0, 4).length, 4);
  assert.throws(() => geohashEncode(NaN, 0));
  assert.throws(() => geohashBox("a"));
});
test("box centre re-encodes to the same cell", () => {
  const b = geohashBox("u4pruy");
  assert.equal(geohashEncode(b.lat, b.lng, 6), "u4pruy");
  assert.ok(b.dLat > 0.004 && b.dLat < 0.007 && b.dLng > 0.009 && b.dLng < 0.014);
});
test("around gives the cell first plus 8 distinct neighbours that all touch it", () => {
  const n = geohashAround("u4pruy");
  assert.equal(n[0], "u4pruy");
  assert.equal(n.length, 9);
  assert.equal(new Set(n).size, 9);
  const c = geohashBox("u4pruy");
  for (const h of n) {
    const b = geohashBox(h);
    assert.ok(Math.abs(b.lat - c.lat) <= c.dLat * 1.01 && Math.abs(b.lng - c.lng) <= c.dLng * 1.01);
  }
  // being neighbours is symmetric
  for (const h of n) assert.ok(geohashAround(h).includes("u4pruy"));
});
test("around wraps over the date line and has fewer cells at the pole", () => {
  const wrap = geohashAround(geohashEncode(0, 179.9999, 6));
  assert.equal(wrap.length, 9);
  assert.ok(geohashAround(geohashEncode(89.9999, 10, 4)).length < 9);
});
test("topics", () => {
  assert.equal(cellTopic("u4pruy"), "snap-drop:u4pruy");
});

test("isUuid", () => {
  assert.ok(isUuid(A));
  assert.ok(!isUuid("123"));
  assert.ok(!isUuid(undefined));
});

test("nearbyFromPresence filters, dedupes, drops me, sorts, only keeps https avatars", () => {
  const out = nearbyFromPresence(
    [
      { id: B, username: "zed", name: "Zed", avatar: "https://x.cc/a.png" },
      { id: C, username: "amy", name: "", avatar: "javascript:alert(1)" },
      { id: A, username: "me", name: "Me" },
      { id: B, username: "zed", name: "Zed Two" },
      { id: "bad", username: "x" },
      { id: "44444444-4444-4444-8444-444444444444", username: "" },
      null,
      "str",
    ],
    A,
  );
  assert.deepEqual(out.map((p) => p.username), ["amy", "zed"]);
  assert.equal(out[0].name, "amy");
  assert.equal(out[0].avatar, null);
  assert.equal(out[1].name, "Zed Two");
});

test("status labels name the person and stay silent when idle", () => {
  assert.match(statusLabel("sent", "Amy"), /Amy.*Nexus Drop inbox/);
  assert.match(statusLabel("link", "Amy"), /Drive link/);
  assert.equal(statusLabel("sending", "Amy"), "Sending…");
  assert.equal(statusLabel("error", "Amy"), "Couldn't send");
  assert.equal(statusLabel("idle", "Amy"), "");
});
test("only missing-user / signed-out errors stop the Drive-link fallback", () => {
  assert.ok(isHardDropError("No Nexus user with that name"));
  assert.ok(isHardDropError("Sign in required"));
  for (const soft of ["Drops are limited to 100 MB", "storage exploded", "new row violates row-level security", ""]) assert.ok(!isHardDropError(soft));
});

test("canShareFile needs share + canShare to accept the file", () => {
  const f = new File(["x"], "a.jpg", { type: "image/jpeg" });
  assert.ok(canShareFile({ share: () => {}, canShare: () => true }, f));
  assert.ok(!canShareFile({ share: () => {}, canShare: () => false }, f));
  assert.ok(!canShareFile({ share: () => {} }, f));
  assert.ok(!canShareFile({ canShare: () => true }, f));
  assert.ok(!canShareFile(undefined, f));
  assert.ok(!canShareFile({ share: () => {}, canShare: () => true }, null));
  assert.ok(!canShareFile({ share: () => {}, canShare: () => { throw new Error("x"); } }, f));
});
test("isShareCancel", () => {
  assert.ok(isShareCancel({ name: "AbortError" }));
  assert.ok(!isShareCancel(new Error("x")));
  assert.ok(!isShareCancel(null));
});
