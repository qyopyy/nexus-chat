import test from "node:test";
import assert from "node:assert/strict";
import { matchDistributor, contactSearchUrl, parseEmails, ccMailto, upstreamBody, uniqueLabels, ccStoreKey } from "./distributors.ts";

test("matchDistributor recognises common label strings", () => {
  assert.equal(matchDistributor("DistroKid")?.id, "distrokid");
  assert.equal(matchDistributor("Distro Kid Records")?.id, "distrokid");
  assert.equal(matchDistributor("CD Baby")?.id, "cdbaby");
  assert.equal(matchDistributor("Tune Core")?.id, "tunecore");
  assert.equal(matchDistributor("Some Small Label"), null);
  assert.equal(matchDistributor(""), null);
  assert.equal(matchDistributor(null), null);
  assert.ok(matchDistributor("DistroKid")?.takedownPage?.startsWith("https://support.distrokid.com/"));
});

test("contact search URL uses the distributor name or the raw label", () => {
  assert.match(contactSearchUrl("DistroKid"), /q=DistroKid%20DMCA%20copyright%20takedown%20notice%20contact/);
  assert.match(contactSearchUrl("Foo Records"), /q=Foo%20Records%20DMCA/);
});

test("parseEmails keeps only valid, unique, lower-case addresses", () => {
  assert.deepEqual(parseEmails("Legal <Legal@Label.com>, bad@, a@b.co ; legal@label.com\nx y z"), ["legal@label.com", "a@b.co"]);
  assert.deepEqual(parseEmails("javascript:alert(1)"), []);
  assert.equal(parseEmails(Array.from({ length: 20 }, (_, i) => `u${i}@x.io`).join(" ")).length, 10);
});

test("ccMailto builds To/CC/Subject/Body and flags long notices", () => {
  const p = { to: "infringement-claim@spotify.com", subject: "Notice — “Song”", body: "hello world", ownerEmail: "me@x.io" };
  const r = ccMailto(p, ["a@b.co", "c@d.co"]);
  assert.equal(r.tooLong, false);
  assert.ok(r.url.startsWith("mailto:infringement-claim@spotify.com?cc=a%40b.co,c%40d.co&subject="));
  assert.ok(r.url.includes("body=hello%20world"));
  assert.ok(!ccMailto(p, []).url.includes("cc="));
  const long = ccMailto({ ...p, body: "x".repeat(8000) }, ["a@b.co"]);
  assert.equal(long.tooLong, true);
  assert.ok(long.url.length < 1000);
});

test("upstreamBody quotes the notice and asks for confirmation", () => {
  const b = upstreamBody({ label: "DistroKid", platformName: "Spotify", titles: "“Song”", notice: "NOTICE TEXT", owner: "Jane" });
  assert.match(b, /DistroKid is listed as the label for “Song” on Spotify/);
  assert.match(b, /NOTICE TEXT/);
  assert.match(b, /take the content down at source/);
});

test("uniqueLabels / ccStoreKey", () => {
  assert.deepEqual(uniqueLabels(["DistroKid", "distrokid ", null, "", "Foo"]), ["DistroKid", "Foo"]);
  assert.equal(ccStoreKey("  DistroKid "), "nexus.takedown.cc.distrokid");
});
