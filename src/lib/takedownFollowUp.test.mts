import test from "node:test";
import assert from "node:assert/strict";
import { followUpState, followUpText, followUpSubject, summarize, type NoticeRec } from "./takedownFollowUp.ts";

const NOW = Date.parse("2026-11-26T12:00:00Z");
const ago = (d: number) => new Date(NOW - d * 86400_000).toISOString();
const n = (over: Partial<NoticeRec> = {}): NoticeRec => ({ id: "1", status: "sent", sent_at: ago(0), work_title: "Song", isrc: "QT6HV2600001", infringing: ["https://open.spotify.com/track/abc"], platform: "spotify", contact: { name: "Jane", email: "j@x.io" }, ...over });

test("stages by age", () => {
  assert.equal(followUpState(n({ sent_at: ago(2) }), NOW).stage, "waiting");
  assert.equal(followUpState(n({ sent_at: ago(7) }), NOW).stage, "follow_up");
  assert.equal(followUpState(n({ sent_at: ago(13) }), NOW).stage, "follow_up");
  assert.equal(followUpState(n({ sent_at: ago(14) }), NOW).stage, "escalate");
  assert.equal(followUpState(n({ status: "resolved", sent_at: ago(30) }), NOW).stage, "done");
  assert.equal(followUpState(n({ status: "rejected" }), NOW).stage, "rejected");
  assert.equal(followUpState(n({ status: "draft", sent_at: null }), NOW).stage, "draft");
});

test("follow-up email is polite, specific and complete", () => {
  const t = followUpText(n({ sent_at: ago(9), upc: "123456789012" }), "Spotify", NOW);
  assert.match(t, /Hello Spotify Copyright Team/);
  assert.match(t, /9 days ago/);
  assert.match(t, /ISRC QT6HV2600001, UPC 123456789012/);
  assert.match(t, /1\. https:\/\/open\.spotify\.com\/track\/abc/);
  assert.match(t, /case reference/);
  assert.match(followUpSubject(n({ sent_at: ago(9) })), /^Follow-up: copyright notice sent 2026-11-17 — “Song”$/);
});

test("long link lists are truncated with a count", () => {
  const t = followUpText(n({ sent_at: ago(8), infringing: Array.from({ length: 30 }, (_, i) => `https://x.io/track/${i}aaaa`) }), "Spotify", NOW);
  assert.match(t, /…and 10 more listed in the original notice/);
});

test("summarize counts and lists due notices oldest first", () => {
  const s = summarize([n({ id: "a", sent_at: ago(8) }), n({ id: "b", sent_at: ago(20) }), n({ id: "c", sent_at: ago(1) }), n({ id: "d", status: "resolved" })], NOW);
  assert.deepEqual(s.counts, { waiting: 1, follow_up: 1, escalate: 1, done: 1, rejected: 0, draft: 0 });
  assert.deepEqual(s.due.map((x) => x.id), ["b", "a"]);
});
