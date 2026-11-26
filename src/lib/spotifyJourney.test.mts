import test from "node:test";
import assert from "node:assert/strict";
import { STEPS, computeJourney, parseArtistId, pitchWindow, pitchTemplate, readManual, journeySummary, type Signals } from "./spotifyJourney.ts";

const NOW = Date.parse("2026-11-26T12:00:00Z");
const base: Signals = { found: false, hasImage: false, releases: 0, latestRelease: null, lookalikes: 0, hasNexusLink: false, defenderWatching: false };

test("step ids are unique and every phase has steps", () => {
  assert.equal(new Set(STEPS.map((s) => s.id)).size, STEPS.length);
  for (const p of ["claim", "badge", "grow"]) assert.ok(STEPS.some((s) => s.phase === p));
});

test("nothing known → 0% and first step is next", () => {
  const j = computeJourney(base, {}, NOW);
  assert.equal(j.done, 0);
  assert.equal(j.next?.id, "release");
  assert.equal(j.remaining.length, j.total);
  assert.equal(j.claimed, false);
});

test("signals auto-complete steps", () => {
  const j = computeJourney({ ...base, found: true, hasImage: true, releases: 3, latestRelease: "2026-09-01", hasNexusLink: true, defenderWatching: true }, {}, NOW);
  const done = new Set(j.steps.filter((s) => s.done).map((s) => s.id));
  for (const id of ["release", "find", "photo", "recent", "nexuslink", "lookalikes", "defender"]) assert.ok(done.has(id as never), id);
  assert.ok(!done.has("request"));
  assert.equal(j.next?.id, "request");
});

test("old release is not 'recent'; look-alikes block that step", () => {
  const j = computeJourney({ ...base, found: true, latestRelease: "2024-01-01", lookalikes: 2 }, {}, NOW);
  assert.ok(!j.steps.find((s) => s.id === "recent")!.done);
  assert.ok(!j.steps.find((s) => s.id === "lookalikes")!.done);
});

test("manual ticks count, including claimed", () => {
  const j = computeJourney(base, { approved: true, bio: true }, NOW);
  assert.ok(j.claimed);
  assert.equal(j.done, 2);
  assert.equal(j.pct, Math.round((2 / STEPS.length) * 100));
});

test("full completion", () => {
  const all = Object.fromEntries(STEPS.map((s) => [s.id, true]));
  const j = computeJourney(base, all, NOW);
  assert.equal(j.pct, 100);
  assert.equal(j.next, null);
  assert.deepEqual(j.phasePct, { claim: 100, badge: 100, grow: 100 });
  assert.match(journeySummary("A", j), /All steps done/);
});

test("parseArtistId", () => {
  const id = "4Z8W4fKeB5YxbusRsdQVPb";
  assert.equal(parseArtistId(`https://open.spotify.com/artist/${id}?si=abc`), id);
  assert.equal(parseArtistId(`https://open.spotify.com/intl-de/artist/${id}`), id);
  assert.equal(parseArtistId(`spotify:artist:${id}`), id);
  assert.equal(parseArtistId(` ${id} `), id);
  assert.equal(parseArtistId("https://open.spotify.com/track/" + id), null);
  assert.equal(parseArtistId("hello"), null);
});

test("pitchWindow thresholds", () => {
  assert.equal(pitchWindow("2026-12-31", NOW)!.status, "ideal");
  assert.equal(pitchWindow("2026-12-31", NOW)!.hardDeadline, "2026-12-24");
  assert.equal(pitchWindow("2026-12-31", NOW)!.idealDeadline, "2026-12-03");
  assert.equal(pitchWindow("2026-12-10", NOW)!.status, "ok");
  assert.equal(pitchWindow("2026-12-01", NOW)!.status, "late");
  assert.equal(pitchWindow("2026-11-20", NOW)!.status, "past");
  assert.equal(pitchWindow("2026-12-03", NOW)!.daysLeft, 0);
  assert.equal(pitchWindow("nope", NOW), null);
});

test("pitchTemplate and readManual are safe", () => {
  assert.match(pitchTemplate({ artist: "MA Beats", title: "City Lights", genre: "Pop" }), /MA Beats — "City Lights"/);
  assert.deepEqual(readManual(null), {});
  assert.deepEqual(readManual("not json"), {});
  assert.deepEqual(readManual('{"bio":true,"evil":true,"pick":false}'), { bio: true });
});
