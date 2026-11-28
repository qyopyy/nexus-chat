import test from "node:test";
import assert from "node:assert/strict";
import { classify, normalizeColor, looksLikePassword, expiryFor, isExpired, secondsLeft, shouldPush, buildPayload, mediaTimeFromUrl, withTime, buildHandoff, searchClips, sortClips, preview, clock, DEFAULT_RULES, type ClipItem } from "./clipCore.ts";

test("classify: urls, colours, codes, secrets", () => {
  assert.deepEqual(classify("https://nexusproject.cc/ipa"), { kind: "url", sensitive: false });
  assert.deepEqual(classify("  #FFAA00 "), { kind: "color", sensitive: false });
  assert.deepEqual(classify("rgb(12, 34, 56)"), { kind: "color", sensitive: false });
  assert.equal(classify("123456").sensitive, true);
  assert.equal(classify("123 456").why, "one-time code");
  assert.equal(classify("otpauth://totp/x?secret=ABC").why, "2FA setup link");
  assert.equal(classify("-----BEGIN OPENSSH PRIVATE KEY-----\nabc").why, "private key");
  assert.equal(classify("ghp_" + "a".repeat(36)).why, "access token");
  assert.equal(classify("sk-" + "A1b2".repeat(8)).why, "API key");
  assert.equal(classify("api_key = abcdef123456").sensitive, true);
  assert.equal(classify("eyJhbGciOiJI.eyJzdWIiOiIx.SflKxwRJSMeKKF2QT4").why, "login token");
  assert.equal(classify("Xk9#mP2$vL7!qR").why, "password");
  assert.equal(classify("{ a: 1 }\nfunction f() {}").kind, "code");
});
test("classify: ordinary text is not flagged", () => {
  for (const s of ["hello world", "Meeting at 5pm tomorrow", "pasta", "https://a.test/x", "1234", "#ff0000", "Nexus"]) assert.equal(classify(s).sensitive, false, s);
  assert.equal(classify("two words 123456").sensitive, false);
  assert.ok(!looksLikePassword("https://example.com/Abc123!x"));
  assert.ok(!looksLikePassword("abcdefghij"));
});
test("colour normalising", () => {
  assert.equal(normalizeColor("#abc"), "#aabbcc");
  assert.equal(normalizeColor("ABCDEF"), "#abcdef");
  assert.equal(normalizeColor("#abcd"), "#aabbccdd");
  assert.equal(normalizeColor("zzz"), null);
  assert.equal(normalizeColor("12345"), null);
});
test("expiry: sensitive items vanish after 60 s unless pinned", () => {
  const now = 1_000_000;
  assert.equal(expiryFor("text", true, false, now), now + 60_000);
  assert.equal(expiryFor("text", true, true, now), null);
  assert.equal(expiryFor("text", false, false, now), null);
  assert.equal(expiryFor("handoff", false, false, now), now + 24 * 3600_000);
  assert.equal(expiryFor("text", false, false, now, { ...DEFAULT_RULES, historyDays: 7 }), now + 7 * 86_400_000);
  assert.equal(expiryFor("text", true, false, now, { ...DEFAULT_RULES, sensitiveSec: 0 }), null);
  assert.ok(isExpired({ expiresAt: now }, now) && !isExpired({ expiresAt: now + 1 }, now) && !isExpired({ expiresAt: null }, now));
  assert.equal(secondsLeft({ expiresAt: now + 59_001 }, now), 60);
  assert.equal(secondsLeft({ expiresAt: null }, now), null);
});
test("shouldPush: no empties, no echoes, no giants", () => {
  assert.equal(shouldPush("  ", []).ok, false);
  assert.deepEqual(shouldPush("a", ["a"]), { ok: false, why: "same" });
  assert.deepEqual(shouldPush("x".repeat(200_001), []), { ok: false, why: "too_big" });
  assert.deepEqual(shouldPush("a\r\nb", []), { ok: true, text: "a\nb" });
});
test("buildPayload", () => {
  const u = buildPayload("https://a.test/x", "Mac");
  assert.equal(u.payload.url, "https://a.test/x");
  assert.equal(u.payload.text, undefined);
  const s = buildPayload("482913", "Phone");
  assert.ok(s.sensitive && s.payload.text === "482913" && s.payload.why === "one-time code");
});
test("media time in links", () => {
  assert.equal(mediaTimeFromUrl("https://youtu.be/abc?t=95"), 95);
  assert.equal(mediaTimeFromUrl("https://www.youtube.com/watch?v=abc&t=1h2m3s"), 3723);
  assert.equal(mediaTimeFromUrl("https://x.test/v.mp4#t=42"), 42);
  assert.equal(mediaTimeFromUrl("https://x.test/p?start=120"), 120);
  assert.equal(mediaTimeFromUrl("https://x.test/p"), null);
  assert.equal(mediaTimeFromUrl("nonsense"), null);
});
test("opening a link at a position", () => {
  assert.equal(withTime("https://youtu.be/abc", 95), "https://youtu.be/abc?t=95");
  assert.equal(withTime("https://youtu.be/abc?t=5&x=1", 95), "https://youtu.be/abc?t=95&x=1");
  assert.equal(withTime("https://x.test/a/song.flac", 61), "https://x.test/a/song.flac#t=61");
  assert.equal(withTime("https://vimeo.com/123", 30), "https://vimeo.com/123#t=30s");
  assert.equal(withTime("https://www.youtube.com/watch?v=abc&start=9", 20), "https://www.youtube.com/watch?v=abc&t=20");
});
test("handoff", () => {
  const h = buildHandoff({ url: "https://youtu.be/abc", title: " Song ", at: 90.7 }, "Mac")!;
  assert.deepEqual([h.kind, h.url, h.at, h.title], ["handoff", "https://youtu.be/abc?t=90", 90, "Song"]);
  assert.equal(buildHandoff({ url: "https://x.test/p?t=30" }, "Mac")!.at, 30);
  assert.equal(buildHandoff({ url: "javascript:alert(1)" }, "Mac"), null);
  assert.equal(buildHandoff({ url: "ftp://x" }, "Mac"), null);
  assert.equal(clock(3723), "1:02:03");
  assert.equal(clock(65), "1:05");
});
const it = (id: string, p: Partial<ClipItem> & { text?: string }): ClipItem => ({ id, kind: "text", pinned: false, sensitive: false, expiresAt: null, createdAt: 1, payload: { v: 1, kind: "text", text: p.text ?? id, from: "Mac" }, ...p });
test("list: pinned first, newest first, search skips secrets and handoffs", () => {
  const list = [it("old", { createdAt: 1 }), it("new", { createdAt: 5 }), it("pin", { createdAt: 2, pinned: true }), it("otp", { createdAt: 9, sensitive: true, text: "482913" }), it("h", { kind: "handoff", createdAt: 10 })];
  assert.deepEqual(searchClips(list, "").map((x) => x.id), ["pin", "otp", "new", "old"]);
  assert.deepEqual(searchClips(list, "482").map((x) => x.id), [], "secrets never match a search");
  assert.deepEqual(searchClips(list, "", "pinned").map((x) => x.id), ["pin"]);
  assert.deepEqual(searchClips(list, "ol").map((x) => x.id), ["old"]);
  assert.equal(sortClips([it("a", { createdAt: 1 }), it("b", { createdAt: 2 })])[0]!.id, "b");
  assert.ok(!preview(it("o", { sensitive: true, text: "482913" })).includes("482913"));
  assert.equal(preview(it("x", { text: "a\n\n b" })), "a b");
});

import { deviceLabel } from "./clipCore.ts";
test("device labels", () => {
  assert.equal(deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"), "Safari on Mac");
  assert.equal(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36 Edg/120"), "Edge on Windows");
  assert.equal(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Mobile Safari/604"), "iPhone");
  assert.equal(deviceLabel("Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537"), "Chrome on Android");
  assert.equal(deviceLabel(""), "Device");
});
