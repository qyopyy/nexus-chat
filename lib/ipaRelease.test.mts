import test from "node:test";
import assert from "node:assert/strict";
import { pickAsset, tagMatcher, cleanNotes, versionOf, fetchReleases, signedAssetUrl, type GhRelease, type Fetch } from "./ipaRelease.ts";

const asset = (id: number, name: string, size = 100) => ({ id, name, size, browser_download_url: `https://github.com/x/releases/download/${name}` });
const rel = (tag: string, at: string, assets: ReturnType<typeof asset>[], extra: Partial<GhRelease> = {}): GhRelease => ({ tag_name: tag, name: null, published_at: at, assets, ...extra });
const rels = [
  rel("ios-appstore-9", "2026-11-20T10:00:00Z", [asset(1, "Nexus-AppStore.ipa")]),
  rel("ios-12", "2026-11-25T10:00:00Z", [asset(2, "Nexus.ipa", 5000)]),
  rel("ios-13", "2026-11-27T10:00:00Z", [asset(3, "Nexus.ipa", 6000)], { draft: true }),
  rel("ios-11", "2026-11-10T10:00:00Z", [asset(4, "Nexus.ipa")]),
  rel("wump-ios-3", "2026-11-26T10:00:00Z", [asset(5, "Wump.ipa")]),
  rel("v2.1.0", "2026-11-26T12:00:00Z", [asset(6, "Nexus-2.1.0.apk"), asset(7, "Nexus Setup.exe"), asset(8, "Nexus.dmg")]),
  rel("ios-14", "2026-11-28T10:00:00Z", []),
];
const nexus = { match: tagMatcher("nexus", "ios-"), assetHint: "Nexus.ipa", exts: [".ipa"] };

test("newest matching release wins; drafts, empty releases and look-alike tags are skipped", () => {
  const h = pickAsset(rels, nexus)!;
  assert.equal(h.tag, "ios-12");
  assert.equal(h.asset.id, 2);
  assert.equal(h.asset.size, 5000);
});
test("tag matching never mixes the sideload build with the App Store build", () => {
  assert.ok(!tagMatcher("nexus", "ios-")("ios-appstore-9"));
  assert.ok(tagMatcher("appstore", "ios-appstore-")("ios-appstore-9"));
  assert.ok(!tagMatcher("nexus", "ios-")("wump-ios-3"));
});
test("platform builds are found by extension", () => {
  const any = () => true;
  assert.equal(pickAsset(rels, { match: any, exts: [".apk"] })!.asset.name, "Nexus-2.1.0.apk");
  assert.equal(pickAsset(rels, { match: any, exts: [".exe"] })!.asset.id, 7);
  assert.equal(pickAsset(rels, { match: any, exts: [".dmg"] })!.asset.id, 8);
  assert.equal(pickAsset(rels, { match: any, exts: [".msi"] }), null);
});
test("falls back to any .ipa when the hinted name is not there", () => {
  const h = pickAsset([rel("link-ios-2", "2026-01-01T00:00:00Z", [asset(9, "Renamed.ipa")])], { match: tagMatcher("link", ""), assetHint: "NexusLink.ipa", exts: [".ipa"] });
  assert.equal(h?.asset.id, 9);
});
test("notes are cleaned and shortened", () => {
  assert.equal(cleanNotes("## What's new\n\n- [Fix](http://x) things <b>now</b>"), "What's new\n\n- Fix things now");
  assert.ok(cleanNotes("word ".repeat(300)).length < 520);
  assert.equal(cleanNotes(null), "");
  assert.equal(versionOf("ios-57"), "57");
  assert.equal(versionOf("v2.1.0"), "2.1.0");
});

const res = (status: number, body: unknown = [], h: Record<string, string> = {}) => ({ ok: status < 300, status, json: async () => body, headers: { get: (n: string) => h[n.toLowerCase()] ?? null } });
test("token goes in the Authorization header, and only to api.github.com", async () => {
  const seen: { url: string; auth?: string }[] = [];
  const f: Fetch = async (url, init) => (seen.push({ url, auth: init?.headers?.Authorization }), res(200, rels));
  const r = await fetchReleases(f, "secret-token");
  assert.ok(r.ok);
  assert.equal(seen[0]!.auth, "Bearer secret-token");
  assert.ok(seen[0]!.url.startsWith("https://api.github.com/repos/"));
});
test("a private repo with no token is reported as 'needs_token', with a token as 'bad_token'", async () => {
  assert.deepEqual(await fetchReleases(async () => res(404)), { ok: false, error: "needs_token", status: 404 });
  assert.deepEqual(await fetchReleases(async () => res(404), "t"), { ok: false, error: "bad_token", status: 404 });
  assert.deepEqual(await fetchReleases(async () => res(401), "t"), { ok: false, error: "bad_token", status: 401 });
  assert.equal((await fetchReleases(async () => res(403, [], { "x-ratelimit-remaining": "0" })) as { error: string }).error, "rate_limited");
  assert.equal((await fetchReleases(async () => res(500))  as { error: string }).error, "github_unavailable");
  assert.equal((await fetchReleases(async () => { throw new Error("net"); }) as { error: string }).error, "github_unavailable");
});
test("signed link: private repo gets GitHub's own short-lived URL; the token is never part of it", async () => {
  const hit = pickAsset(rels, nexus)!;
  let init: { headers?: Record<string, string>; redirect?: string } | undefined;
  let url = "";
  const f: Fetch = async (u, i) => ((url = u), (init = i), res(302, null, { location: "https://objects.githubusercontent.com/signed?X-Amz-Signature=abc" }));
  const out = await signedAssetUrl(f, hit, "secret-token");
  assert.equal(out, "https://objects.githubusercontent.com/signed?X-Amz-Signature=abc");
  assert.ok(!out!.includes("secret-token"));
  assert.ok(url.endsWith("/releases/assets/2"));
  assert.equal(init!.redirect, "manual");
  assert.equal(init!.headers!.Accept, "application/octet-stream");
});
test("signed link: no redirect means no link; no token uses the public URL", async () => {
  const hit = pickAsset(rels, nexus)!;
  assert.equal(await signedAssetUrl(async () => res(404), hit, "t"), null);
  assert.equal(await signedAssetUrl(async () => { throw new Error("x"); }, hit, "t"), null);
  assert.equal(await signedAssetUrl(async () => res(200), hit, undefined), hit.asset.publicUrl);
});
