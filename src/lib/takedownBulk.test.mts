import test from "node:test";
import assert from "node:assert/strict";
import { parseBulkInput, buildBulkDraft, bulkProblems, bulkTitle, describeWorks, pickedWorks, selectAll, releaseToWork, allUrls, MAX_LINKS, type BulkWork, type Contactish } from "./takedownBulk.ts";

const contact: Contactish = { name: "Jane Doe", company: "", role: "owner", email: "j@x.io", phone: "+1 555", address: "1 Main St", country: "US" };
const w = (n: number, over: Partial<BulkWork> = {}): BulkWork => ({ key: `k${n}`, title: `Song ${n}`, artist: "Fake Artist", isrc: `QT6HV26000${String(n).padStart(2, "0")}`, urls: [`https://open.spotify.com/track/${String(n).padStart(22, "a")}`], ...over });

test("parseBulkInput splits links and ISRCs, dedups, reports junk", () => {
  const r = parseBulkInput("https://open.spotify.com/track/abc?si=1\nhttps://open.spotify.com/track/abc/ , QT6HV2600001\nqt6-hv-26-00001 hello https://evil.com/x");
  assert.deepEqual(r.links, ["https://open.spotify.com/track/abc"]);
  assert.deepEqual(r.isrcs, ["QT6HV2600001"]);
  assert.deepEqual(r.ignored.sort(), ["hello", "https://evil.com/x", "qt6-hv-26-00001"].sort().filter((x) => x !== "qt6-hv-26-00001"));
});

test("title, description and links for several songs", () => {
  const works = [w(1), w(2), w(3)];
  assert.equal(bulkTitle(works), "3 works by Fake Artist");
  assert.equal(bulkTitle([w(1)]), "Song 1");
  const d = buildBulkDraft({ kind: "songs", works, statement: "These are unauthorized re-uploads of my masters.", contact, signature: "Jane Doe" });
  assert.equal(d.infringing.length, 3);
  assert.equal(d.work_artist, "Fake Artist");
  assert.equal(d.isrc, null);
  assert.match(d.description, /3 works, listed below/);
  assert.match(d.description, /1\. “Song 1” — by Fake Artist · ISRC QT6HV2600001/);
  assert.ok(d.description.includes("unauthorized re-uploads"));
});

test("single-work draft keeps ISRC; artist draft adds profile link first-class", () => {
  const one = buildBulkDraft({ kind: "songs", works: [w(1)], statement: "Re-upload of my master.", contact, signature: "Jane Doe" });
  assert.equal(one.isrc, "QT6HV2600001");
  const profile = "https://open.spotify.com/artist/" + "b".repeat(22);
  const a = buildBulkDraft({ kind: "artist", works: [w(1), w(2)], profileUrl: profile, artistName: "Fake Artist", statement: "Impersonation.", contact, signature: "Jane Doe" });
  assert.ok(a.infringing.includes(profile));
  assert.equal(a.infringing.length, 3);
  assert.match(a.work_title, /Artist profile “Fake Artist” \+ 2 releases/);
  assert.match(a.description, /artist profile “Fake Artist” and the 2 releases/);
});

test("allUrls dedups and drops non-http", () => {
  assert.deepEqual(allUrls([w(1), w(1)], ["javascript:alert(1)", "https://a.b/c"]), [w(1).urls[0], "https://a.b/c"]);
});

test("problems: needs ownership tick, contact, signature", () => {
  const base = { kind: "songs" as const, works: [w(1)], ownsAll: true, contact, signature: "Jane Doe" };
  assert.deepEqual(bulkProblems(base), []);
  assert.ok(bulkProblems({ ...base, ownsAll: false }).some((x) => /own/.test(x)));
  assert.ok(bulkProblems({ ...base, works: [] }).length);
  assert.ok(bulkProblems({ ...base, signature: "Jane" }).some((x) => /Signature/.test(x)));
  assert.ok(bulkProblems({ ...base, contact: { ...contact, address: "" } }).some((x) => /address/.test(x)));
  assert.ok(bulkProblems({ ...base, contact: { ...contact, role: "agent" } }).some((x) => /Company/.test(x)));
});

test("problems: whole-artist needs the artist name typed", () => {
  const base = { kind: "artist" as const, works: [w(1)], artistName: "Fake Artist", ownsAll: true, contact, signature: "Jane Doe" };
  assert.ok(bulkProblems(base).some((x) => /Type the artist name/.test(x)));
  assert.ok(bulkProblems({ ...base, typedArtist: "fake artist " }).length === 0);
  assert.ok(bulkProblems({ ...base, typedArtist: "Someone Else" }).some((x) => /Type the artist name/.test(x)));
});

test("problems: more than MAX_LINKS is refused, draft is capped", () => {
  const many = Array.from({ length: MAX_LINKS + 3 }, (_, i) => w(i));
  assert.ok(bulkProblems({ kind: "songs", works: many, ownsAll: true, contact, signature: "Jane Doe" }).some((x) => /Too many links/.test(x)));
  assert.equal(buildBulkDraft({ kind: "songs", works: many, statement: "x".repeat(12), contact, signature: "Jane Doe" }).infringing.length, MAX_LINKS);
});

test("release picker: tick boxes → works", () => {
  const rels = [
    { id: "r1", name: "EP", url: "https://open.spotify.com/album/r1", type: "single", release_date: "2026-01-02" },
    { id: "r2", name: "LP", url: "https://open.spotify.com/album/r2", type: "album", release_date: "2025-05-05" },
    { id: null, name: "broken", url: null },
  ];
  const all = selectAll(["r1", "r2"], true);
  assert.equal(pickedWorks(rels, all, "A").length, 2);
  assert.deepEqual(pickedWorks(rels, { r2: true }, "A").map((x) => x.title), ["LP"]);
  assert.equal(pickedWorks(rels, selectAll(["r1", "r2"], false), "A").length, 0);
  assert.equal(releaseToWork(rels[2]!, "A"), null);
  assert.match(describeWorks(pickedWorks(rels, all, "A")), /“EP” — by A · single · 2026-01-02/);
});

test("label is listed in the works description when known", () => {
  assert.match(describeWorks([w(1, { label: "Foo Records" })]), /ISRC QT6HV2600001 · Label Foo Records/);
  assert.ok(!/Label/.test(describeWorks([w(1)])));
});
