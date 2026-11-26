import assert from "node:assert/strict";
import test from "node:test";
import * as P from "./shieldPro.ts";

test("credits are cleaned, de-duplicated and capped", () => {
  const c = P.cleanCredits([
    { name: "  Martin   Csattos ", role: "Primary artist", split: 50.456, ipi: "00 123-456 789" },
    { name: "martin csattos", role: "primary artist" },
    { name: "", role: "Producer" },
    { name: "Lia", role: "" },
    { name: "Bo", role: "Producer", split: 250 },
  ]);
  assert.deepEqual(c.map((x) => [x.name, x.role]), [["Martin Csattos", "Primary artist"], ["Lia", "Primary artist"], ["Bo", "Producer"]]);
  assert.equal(c[0].split, 50.46);
  assert.equal(c[0].ipi, "00123456789");
  assert.equal(c[2].split, 100);
  assert.equal(P.cleanCredits(Array.from({ length: 50 }, (_, i) => ({ name: `A${i}`, role: "Producer" }))).length, 30);
  assert.deepEqual(P.cleanCredits(null), []);
});
test("multi-artist strings become credits", () => {
  const c = P.creditsFromArtist("Martin, Lia & Bo feat. Kira x Zed");
  assert.deepEqual(c.map((x) => `${x.name}:${x.role}`), ["Martin:Primary artist", "Lia:Primary artist", "Bo:Primary artist", "Kira:Featured artist", "Zed:Featured artist"]);
  assert.equal(P.artistLine(c), "Martin, Lia, Bo feat. Kira, Zed");
  assert.deepEqual(P.creditsFromArtist(""), []);
  assert.equal(P.creditsFromArtist("Solo")[0].role, "Primary artist");
  assert.equal(P.artistLine([]), "");
});
test("credit issues", () => {
  assert.deepEqual(P.creditIssues([{ name: "A", role: "Primary artist", split: 60 }, { name: "B", role: "Producer", split: 40 }]), []);
  assert.match(P.creditIssues([{ name: "A", role: "Primary artist", split: 60 }, { name: "B", role: "Producer", split: 30 }])[0], /90%/);
  assert.match(P.creditIssues([{ name: "B", role: "Producer" }])[0], /primary artist/i);
  assert.match(P.creditIssues([{ name: "A", role: "Primary artist", ipi: "123" }])[0], /IPI/);
});
test("platform modes", () => {
  assert.equal(P.platformMode({ spotify: "block" }, "spotify"), "block");
  assert.equal(P.platformMode({ spotify: "claim" }, "spotify"), "off"); // spotify can't claim
  assert.equal(P.platformMode({ youtube: "claim" }, "youtube"), "claim");
  assert.equal(P.platformMode(null, "tiktok"), "off");
  assert.deepEqual(P.setPlatformMode({ a: "x" }, "tiktok", "watch"), { a: "x", tiktok: "watch" });
  assert.deepEqual(P.setPlatformMode({ tiktok: "watch" }, "tiktok", "off"), {});
  assert.deepEqual(P.setPlatformMode({}, "spotify", "claim"), {});
  const all = P.allPlatforms("claim");
  assert.equal(all.youtube, "claim");
  assert.equal(all.spotify, "block");
  assert.equal(P.platformsActive(all), P.SHIELD_PLATFORMS.length);
  assert.equal(P.platformsActive(P.allPlatforms("off")), 0);
  assert.ok(new Set(P.SHIELD_PLATFORMS.map((p) => p.id)).size === P.SHIELD_PLATFORMS.length);
  assert.ok(P.SHIELD_PLATFORMS.every((p) => p.modes[0] === "off" && p.search("a b").startsWith("https://") && (p.takedown || p.form)));
  assert.equal(P.SHIELD_PLATFORMS.find((p) => p.id === "spotify")!.search("a b"), "https://open.spotify.com/search/a%20b");
});
test("protection score rewards every layer", () => {
  const bare = P.protectionScore({ status: "unlocked" });
  assert.ok(bare.score < 30 && bare.todo.length > 6);
  const full = P.protectionScore({
    status: "locked", policy: "block", content_id: true, strict: true, notify_owner: true, isrc: "QZ1234500001", file_path: "u/x/original.wav",
    meta_seal: "abc", credits: [{ name: "A", role: "Primary artist" }], platforms: P.allPlatforms("block"), acr_status: "ready",
  });
  assert.equal(full.score, 100);
  assert.deepEqual(full.todo, []);
  const expired = P.protectionScore({ status: "locked", unlock_at: "2020-01-01" }, Date.parse("2026-01-01"));
  assert.ok(expired.todo.includes("Lock the song"));
  assert.ok(P.protectionScore({ status: "locked", block_where: ["chat"] }).score < P.protectionScore({ status: "locked" }).score);
});
test("instagram profile parsing", () => {
  for (const v of ["@ma.beats", "ma.beats", "https://www.instagram.com/ma.beats/", "instagram.com/ma.beats?igsh=abc", "http://instagram.com/ma.beats/reels/"]) {
    const r = P.parseInstagramProfile(v);
    assert.ok(r.ok, v);
    if (r.ok) assert.equal(r.url, "https://www.instagram.com/ma.beats/");
  }
  for (const v of ["", "https://example.com/ma", "https://instagram.com/reels/audio/123456/", "bad name", "a..b", ".abc", "x".repeat(31), "https://www.instagram.com/p/Cabc/"])
    assert.ok(!P.parseInstagramProfile(v).ok, v);
});
test("instagram song link parsing", () => {
  const r = P.parseInstagramSong("https://www.instagram.com/reels/audio/1234567890123/?igsh=xyz");
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.url, "https://www.instagram.com/reels/audio/1234567890123/");
    assert.equal(r.value, "1234567890123");
  }
  assert.ok(P.parseInstagramSong("instagram.com/reels/audio/55555/").ok);
  for (const v of ["", "nope", "https://www.instagram.com/ma.beats/", "https://evil.com/reels/audio/12345678/", "https://www.instagram.com/reels/audio/abc/", "https://www.instagram.com/reels/audio/12/", "https://instagram.com.evil.com/reels/audio/123456/"])
    assert.ok(!P.parseInstagramSong(v).ok, v);
});
test("caption", () => {
  const t = P.igCaption({ title: "Moon", artist: "Martin", songUrl: "https://www.instagram.com/reels/audio/1/", profileUrl: "https://www.instagram.com/m/" });
  assert.match(t, /🎵 Moon — Martin/);
  assert.match(t, /Use the sound:/);
  assert.equal(P.igCaption({ title: "x" }), "🎵 x");
});
