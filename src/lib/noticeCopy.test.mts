import test from "node:test";
import assert from "node:assert/strict";
import { buildStatement, evidenceLine, reviewNotice, REASONS, type NoticeLike } from "./noticeCopy.ts";

const good: NoticeLike = {
  platform: "spotify", work_title: "Song", isrc: "QT6HV2600001", upc: null, original_url: "https://open.spotify.com/track/" + "a".repeat(22),
  infringing: ["https://open.spotify.com/track/" + "b".repeat(22)], description: "",
  contact: { name: "Jane Doe", email: "j@x.io", phone: "+1", address: "1 Main", country: "US" }, signature: "Jane Doe",
};

test("every reason produces a factual statement with owner, date and ask", () => {
  for (const r of REASONS) {
    const s = buildStatement({ reason: r.id, owner: "Audia Music Recordings LLC", platform: "Spotify", count: 3, firstReleased: "2026-03-01", originalUrl: "https://open.spotify.com/album/x", evidence: ["distributor", "isrc"] });
    assert.match(s, /I am Audia Music Recordings LLC/);
    assert.match(s, /first published on 2026-03-01/);
    assert.match(s, /authorized release is available at https:\/\/open\.spotify\.com\/album\/x/);
    assert.match(s, /Supporting documentation is available on request, including the distributor delivery receipt for the original release and the ISRC\/UPC registration/);
    assert.match(s, /I request that Spotify remove or disable access/);
    assert.ok(!/(scam|thief|stole)/i.test(s), r.id);
  }
});

test("singular vs plural and optional parts", () => {
  const one = buildStatement({ reason: "reupload", owner: "Jane", count: 1 });
  assert.match(one, /the sound recording identified/);
  assert.match(one, /recording reproduces my master/);
  assert.ok(!/first published/.test(one) && !/Supporting documentation/.test(one));
  assert.match(buildStatement({ reason: "reupload", owner: "Jane", count: 4 }), /sound recordings identified/);
  assert.match(buildStatement({ reason: "sample", owner: "J", matching: "0:12–0:48" }), /\(0:12–0:48\)/);
  assert.equal(evidenceLine([]), "");
});

test("a complete notice scores strong, an empty one weak", () => {
  const desc = buildStatement({ reason: "reupload", owner: "Jane Doe", platform: "Spotify", firstReleased: "2026-03-01", originalUrl: good.original_url!, evidence: ["isrc"] });
  const strong = reviewNotice({ ...good, description: desc });
  assert.equal(strong.grade, "strong");
  assert.equal(strong.score, 100);
  const weak = reviewNotice({ ...good, isrc: null, original_url: null, infringing: ["https://open.spotify.com/"], description: "this is a scam!!! they STOLE my song", contact: { ...good.contact, phone: "" } });
  assert.equal(weak.grade, "weak");
  const ids = weak.todo.map((c) => c.id);
  for (const k of ["links", "ids", "orig", "date", "specific", "tone", "contact"]) assert.ok(ids.includes(k), k);
});

test("tone check catches shouting and accusations only", () => {
  const t = (description: string) => reviewNotice({ ...good, description }).checks.find((c) => c.id === "tone")!.ok;
  assert.equal(t("This recording is a thief's copy"), false);
  assert.equal(t("PLEASE REMOVE THIS NOW BECAUSE IT IS MINE"), false);
  assert.equal(t("It reproduces my master without a license."), true);
});

test("multi-work notices count as identified without a single ISRC", () => {
  const r = reviewNotice({ ...good, isrc: null }, { works: 5 });
  assert.ok(r.checks.find((c) => c.id === "ids")!.ok);
});
