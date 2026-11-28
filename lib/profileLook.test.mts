import test from "node:test";
import assert from "node:assert/strict";
import { bannerBackground, bannerStyle, isAnimatedWebp, normalizeHex, planProfileImage, uploadable } from "./profileLook.ts";

test("banner colour: hex, gradient, junk", () => {
  assert.equal(normalizeHex("#ABC"), "#aabbcc");
  assert.equal(normalizeHex("red"), null);
  assert.equal(bannerBackground("#5865f2"), "linear-gradient(135deg, #5865f2, #5865f266)");
  const g = "linear-gradient(135deg,#2aabee,#5865f2)";
  assert.equal(bannerBackground(g), g);
  assert.equal(bannerBackground("rgb(10, 20, 30)"), "rgb(10, 20, 30)");
  assert.equal(bannerBackground("url(javascript:alert(1))", "#112233"), "linear-gradient(135deg, #112233, #1e1f22)");
  assert.equal(bannerBackground(null, "#112233"), "linear-gradient(135deg, #112233, #1e1f22)");
});

test("banner style: picture wins, hostile urls are cleaned", () => {
  const s = bannerStyle("https://x.test/a.png", "#fff");
  assert.match(s.backgroundImage!, /url\("https:\/\/x\.test\/a\.png"\)/);
  assert.equal(s.backgroundSize, "cover");
  assert.ok(!("background" in bannerStyle("https://x.test/a\".png", null) && false));
  assert.doesNotMatch(bannerStyle('https://x.test/a"b.png', null).backgroundImage!, /a"b/);
  assert.equal(bannerStyle("javascript:alert(1)", "#fff").background, "linear-gradient(135deg, #ffffff, #ffffff66)");
});

test("upload plan: animated kept, heic refused, big refused", () => {
  assert.deepEqual(planProfileImage({ type: "image/gif", size: 2e6 }), { ok: true, keepOriginal: true, ext: "gif" });
  assert.equal((planProfileImage({ type: "image/gif", size: 9e6 }) as { ok: false }).ok, false);
  assert.deepEqual(planProfileImage({ type: "image/png", size: 2e6 }), { ok: true, keepOriginal: false, ext: "jpg" });
  assert.deepEqual(planProfileImage({ type: "image/webp", size: 2e6 }, true), { ok: true, keepOriginal: true, ext: "webp" });
  assert.match((planProfileImage({ type: "image/heic", size: 2e6 }) as { error: string }).error, /HEIC/);
  assert.equal(planProfileImage({ type: "image/png", size: 50e6 }).ok, false);
  assert.equal(planProfileImage({ type: "application/pdf", size: 10 }).ok, false);
  assert.equal(uploadable("image/heic"), null);
  assert.equal(uploadable("image/jpeg"), "jpg");
});

test("animated webp detection", () => {
  const mk = (anim: boolean) => {
    const b = new Uint8Array(40);
    [..."RIFF"].forEach((c, i) => (b[i] = c.charCodeAt(0)));
    [..."WEBP"].forEach((c, i) => (b[8 + i] = c.charCodeAt(0)));
    [..."VP8X"].forEach((c, i) => (b[12 + i] = c.charCodeAt(0)));
    if (anim) [..."ANIM"].forEach((c, i) => (b[30 + i] = c.charCodeAt(0)));
    return b;
  };
  assert.equal(isAnimatedWebp(mk(true)), true);
  assert.equal(isAnimatedWebp(mk(false)), false);
  assert.equal(isAnimatedWebp(new Uint8Array(4)), false);
});
