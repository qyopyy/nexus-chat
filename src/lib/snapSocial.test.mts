import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY_STREAK, TIPS, TIP_KEYS, bumpStreak, cleanMessage, cleanSearch, countWord, dayKey, fmtCount, liveStreak, nextFire, nextUnseen, parseReminder, parseSocial, parseTime, reminderLine, tipForMode, tipOfDay } from "./snapSocial.ts";

test("fmtCount and countWord", () => {
  assert.equal(fmtCount(0), "0");
  assert.equal(fmtCount(-4), "0");
  assert.equal(fmtCount(NaN), "0");
  assert.equal(fmtCount(999), "999");
  assert.equal(fmtCount(1000), "1K");
  assert.equal(fmtCount(1250), "1.2K");
  assert.equal(fmtCount(15300), "15K");
  assert.equal(fmtCount(2_400_000), "2.4M");
  assert.equal(countWord(1, "follower"), "1 follower");
  assert.equal(countWord(2, "follower"), "2 followers");
});

test("cleanSearch keeps names, drops filter syntax; cleanMessage trims and caps", () => {
  assert.equal(cleanSearch("  @Max,Dev) "), "MaxDev");
  assert.equal(cleanSearch("Anna  Kovács"), "Anna Kovács");
  assert.equal(cleanSearch("a".repeat(80)).length, 32);
  assert.equal(cleanMessage("  hi\r\n\n\n\nthere  "), "hi\n\nthere");
  assert.equal(cleanMessage("x".repeat(5000)).length, 1000);
});

test("streak: same day, next day, gap, month boundary", () => {
  let s = bumpStreak(EMPTY_STREAK, "2026-11-28");
  assert.deepEqual(s, { count: 1, best: 1, last: "2026-11-28", total: 1 });
  s = bumpStreak(s, "2026-11-28");
  assert.deepEqual(s, { count: 1, best: 1, last: "2026-11-28", total: 2 });
  s = bumpStreak(s, "2026-11-29");
  assert.equal(s.count, 2);
  s = bumpStreak(s, "2026-12-01");
  assert.equal(s.count, 1);
  assert.equal(s.best, 2);
  let t = bumpStreak(EMPTY_STREAK, "2026-02-28");
  t = bumpStreak(t, "2026-03-01");
  assert.equal(t.count, 2);
});

test("liveStreak: done, at risk, broken", () => {
  const s = { count: 4, best: 4, last: "2026-11-27", total: 9 };
  assert.deepEqual(liveStreak(s, "2026-11-27"), { count: 4, doneToday: true, atRisk: false });
  assert.deepEqual(liveStreak(s, "2026-11-28"), { count: 4, doneToday: false, atRisk: true });
  assert.deepEqual(liveStreak(s, "2026-11-30"), { count: 0, doneToday: false, atRisk: false });
  assert.deepEqual(liveStreak(EMPTY_STREAK, "2026-11-28"), { count: 0, doneToday: false, atRisk: false });
});

test("reminder time parsing and next fire", () => {
  assert.deepEqual(parseTime("7:05"), { hour: 7, minute: 5 });
  assert.equal(parseTime("24:00"), null);
  assert.equal(parseTime("nope"), null);
  assert.deepEqual(parseReminder({ on: true, hour: 99, minute: 30 }), { on: true, hour: 18, minute: 30 });
  assert.equal(parseReminder(null).on, false);
  const now = new Date(2026, 10, 28, 17, 0, 0);
  const a = nextFire(now, 18, 0);
  assert.equal(dayKey(a), "2026-11-28");
  const b = nextFire(now, 9, 0);
  assert.equal(dayKey(b), "2026-11-29");
  const c = nextFire(new Date(2026, 11, 31, 23, 0, 0), 8, 0);
  assert.equal(dayKey(c), "2027-01-01");
});

test("reminderLine rotates daily, streak at risk wins from 2 days", () => {
  assert.notDeepEqual(reminderLine("2026-11-28"), reminderLine("2026-11-29"));
  assert.deepEqual(reminderLine("2026-11-28"), reminderLine("2026-11-28"));
  assert.match(reminderLine("2026-11-28", 5).title, /5-day streak/);
  assert.doesNotMatch(reminderLine("2026-11-28", 1).title, /streak at risk/);
});

test("parseSocial survives garbage and clamps", () => {
  assert.equal(parseSocial("{{{").streak.count, 0);
  const s = parseSocial(JSON.stringify({ reminder: { on: true, hour: 8, minute: 15 }, streak: { count: 3, best: 1, last: "2026-11-27", total: 7 }, tipsSeen: ["photo", "bogus", 4], askedReminder: true }));
  assert.deepEqual(s.reminder, { on: true, hour: 8, minute: 15 });
  assert.deepEqual(s.streak, { count: 3, best: 3, last: "2026-11-27", total: 7 });
  assert.deepEqual(s.tipsSeen, ["photo"]);
  assert.equal(s.askedReminder, true);
  assert.equal(parseSocial({ streak: { last: "x" } }).streak.last, "");
});

test("tips: every mode has real steps; mode mapping", () => {
  assert.equal(new Set(TIP_KEYS).size, TIPS.length);
  for (const t of TIPS) {
    assert.ok(t.steps.length >= 3, t.key);
    assert.ok(t.lead.length > 10 && t.title);
  }
  assert.equal(tipForMode({ mode: "video" }).key, "video");
  assert.equal(tipForMode({ mode: "photo", avatar: true }).key, "avatar");
  assert.equal(tipForMode({ mode: "photo", timer: 5 }).key, "timer");
  assert.equal(tipForMode({ mode: "photo", flash: true }).key, "night");
  assert.equal(tipForMode({ mode: "photo", facing: "user" }).key, "selfie");
  assert.equal(tipForMode({ mode: "photo", facing: "environment" }).key, "photo");
  assert.notEqual(tipOfDay("2026-11-28").key, tipOfDay("2026-11-29").key);
  assert.equal(nextUnseen([]).key, "photo");
  assert.equal(nextUnseen(["photo"]).key, "video");
  assert.equal(nextUnseen(TIP_KEYS), null);
});
