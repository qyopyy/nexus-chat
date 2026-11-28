import test from "node:test";
import assert from "node:assert/strict";
import { cleanFolder, joinPath, breadcrumbs, filesIn, childFolders, fingerprint, planSync, syncKey, playableKind, isLossless, parseStreamUrl, isHls } from "./driveFolders.ts";

test("cleanFolder", () => {
  assert.equal(cleanFolder("  /Music\\Masters// "), "Music/Masters");
  assert.equal(cleanFolder("../../etc"), "etc");
  assert.equal(cleanFolder("a/./b/"), "a/b");
  assert.equal(cleanFolder("x".repeat(150)).length, 100);
  assert.equal(joinPath("A", "", "b/c"), "A/b/c");
});
test("breadcrumbs", () => assert.deepEqual(breadcrumbs("A/B"), [{ name: "A", path: "A" }, { name: "B", path: "A/B" }]));
test("folders and files at a level", () => {
  const f = [{ folder: "" }, { folder: "Music" }, { folder: "Music/Masters" }, { folder: "Music/Masters/2026" }, { folder: "Snap" }];
  assert.equal(filesIn(f, "Music").length, 1);
  assert.equal(filesIn(f, "").length, 1);
  assert.deepEqual(childFolders(f, ""), [{ name: "Music", path: "Music", count: 3 }, { name: "Snap", path: "Snap", count: 1 }]);
  assert.deepEqual(childFolders(f, "Music"), [{ name: "Masters", path: "Music/Masters", count: 2 }]);
  assert.deepEqual(childFolders(f, "Music", ["Music/New"]).map((x) => x.name), ["Masters", "New"]);
  assert.equal(childFolders(f, "Music/Masters/2026").length, 0);
});
test("fingerprint is stable and folder-aware", () => {
  const a = { name: "a.wav", size: 5, lastModified: 9 };
  assert.equal(fingerprint(a, "/X/"), fingerprint(a, "X"));
  assert.notEqual(fingerprint(a, "X"), fingerprint(a, "Y"));
});
test("planSync skips what is already there or already synced", () => {
  const local = [
    { rel: "song.wav", size: 10, mtime: 1 },
    { rel: "sub/a.flac", size: 20, mtime: 1 },
    { rel: "sub/b.flac", size: 30, mtime: 1 },
    { rel: "sub/c.flac", size: 40, mtime: 1 },
  ];
  const remote = [{ name: "song.wav", folder: "Sync", bytes: 10 }, { name: "a.flac", folder: "Sync/sub", bytes: 21 }];
  const todo = planSync(local, remote, "Sync", new Set([syncKey(local[3]!)]));
  assert.deepEqual(todo.map((x) => x.rel), ["sub/a.flac", "sub/b.flac"]); // a.flac differs in size; c.flac done before
});
test("file kinds", () => {
  assert.equal(playableKind("x.FLAC"), "audio");
  assert.equal(playableKind("clip.mkv"), "video");
  assert.equal(playableKind("a", "image/png"), "image");
  assert.equal(playableKind("a.zip"), "other");
  assert.ok(isLossless("x.wav") && isLossless("x", "audio/flac") && !isLossless("x.mp3"));
});
test("stream urls", () => {
  assert.deepEqual(parseStreamUrl(" https://a.test/p/Song%20One.flac?x=1 "), { url: "https://a.test/p/Song%20One.flac?x=1", kind: "audio", name: "Song One.flac" });
  assert.equal(parseStreamUrl("https://a.test/v.mp4")?.kind, "video");
  assert.equal(parseStreamUrl("javascript:alert(1)"), null);
  assert.equal(parseStreamUrl("file:///etc/passwd"), null);
  assert.equal(parseStreamUrl("not a url"), null);
  assert.ok(isHls("https://a/x.m3u8?t=1") && !isHls("https://a/x.mp4"));
});
