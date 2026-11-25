import assert from "node:assert/strict";
import test from "node:test";
import * as M from "./music.ts";
import * as B from "./biz.ts";
import * as C from "./chat.ts";
import * as P from "./phone.ts";
import * as L from "./life.ts";

/* ───── music ───── */
test("chords: C major pop progression", () => {
  const c = M.progression(0, "major", ["I", "V", "vi", "IV"]).map((x) => x.chord);
  assert.deepEqual(c, ["C", "G", "Am", "F"]);
});
test("chords: A minor epic + flat keys", () => {
  assert.deepEqual(M.progression(9, "minor", ["i", "bVI", "bIII", "bVII"]).map((x) => x.chord), ["Am", "F", "C", "G"]);
  assert.equal(M.chordFromNumeral(5, "major", "IV"), "B♭");
  assert.equal(M.chordFromNumeral(0, "major", "V7"), "G7");
  assert.equal(M.chordFromNumeral(0, "major", "ii7"), "Dm7");
  assert.equal(M.chordFromNumeral(9, "minor", "VI"), "F");
  assert.equal(M.chordFromNumeral(0, "major", "vii°"), "Bdim");
  assert.equal(M.chordFromNumeral(0, "major", "nonsense"), null);
});
test("note value ms at 120 bpm", () => {
  const rows = M.noteValueMs(120);
  const q = rows.find((r) => r.name === "1/4")!;
  assert.equal(q.straight, 500);
  assert.equal(q.dotted, 750);
  assert.ok(Math.abs(q.triplet - 333.333) < 0.01);
  assert.deepEqual(M.noteValueMs(0), []);
});
test("royalty estimate", () => {
  const r = M.royaltyEstimate({ Spotify: 1000, Tidal: 100 }, M.DEFAULT_RATES);
  assert.ok(Math.abs(r.total - (4 + 1.25)) < 1e-9);
  assert.equal(r.streams, 1100);
});
test("camelot", () => {
  assert.equal(M.keyToCamelot(0, "major"), "8B");
  assert.equal(M.keyToCamelot(9, "minor"), "8A");
  assert.equal(M.keyToCamelot(11, "major"), "1B");
  assert.equal(M.camelotToKey("8A")?.pc, 9);
  assert.equal(M.camelotToKey("13A"), null);
  const codes = M.camelotCompatible("12A").map((x) => x.code);
  assert.deepEqual(codes, ["12A", "1A", "11A", "12B"]);
});
test("loudness + file size", () => {
  assert.equal(M.gainToTarget(-9.5, -14), -4.5);
  assert.equal(M.audioFileBytes(44100, 16, 2, 60), 10_584_000);
  assert.equal(M.formatBytes(10_584_000), "10.6 MB");
});
test("setlist stats and durations", () => {
  const s = M.setlistStats([
    { title: "a", seconds: 180, bpm: 100 },
    { title: "b", seconds: 200, bpm: 140 },
    { title: "c", seconds: 60 },
  ]);
  assert.equal(s.total, 440);
  assert.equal(s.avgBpm, 120);
  assert.deepEqual(s.bigJumps, [1]);
  assert.equal(M.parseDuration("3:25"), 205);
  assert.equal(M.formatDuration(3725), "1:02:05");
});
test("syllables and rhyme", () => {
  assert.equal(M.countSyllables("music"), 2);
  assert.equal(M.countSyllables("the"), 1);
  assert.equal(M.countSyllables("beautiful"), 3);
  assert.equal(M.lineSyllables("hello darkness my old friend"), 7);
  assert.deepEqual(M.rhymeScheme(["I like the night", "under the light", "dancing in the rain", "feeling the pain"]), ["A", "A", "B", "B"]);
});
test("rollout plan", () => {
  const p = M.rolloutPlan("2026-12-11");
  assert.equal(p.find((s) => s.offset === 0)?.date, "2026-12-11");
  assert.equal(p[0].date, "2026-10-30");
  assert.equal(M.addDays("nope", 3), "");
});
test("isrc", () => {
  const ok = M.parseIsrc("us-rc1-76-07839");
  assert.equal(ok.valid, true);
  assert.equal(ok.normalized, "US-RC1-76-07839");
  assert.equal(M.parseIsrc("US-RC1-76-0783").valid, false);
});

/* ───── biz ───── */
test("invoice totals", () => {
  const t = B.invoiceTotals([{ desc: "x", qty: 2, price: 50 }, { desc: "y", qty: 1, price: 19.99 }], 10, 10);
  assert.equal(t.subtotal, 119.99);
  assert.equal(t.discount, 12);
  assert.equal(t.tax, 10.8);
  assert.equal(t.total, 118.79);
});
test("caption limits", () => {
  const s = B.captionStatus("a".repeat(285), "X / Twitter");
  assert.equal(s.over, true);
  assert.equal(s.left, -5);
  assert.equal(B.captionStatus("hi 🎵", "Threads").len, 4);
});
test("merch pricing", () => {
  const m = B.merchMargin(10, 30, 10);
  assert.equal(m.profit, 17);
  assert.equal(m.marginPct, 56.67);
  const price = B.priceForMargin(10, 50, 10);
  assert.equal(price, 25);
  assert.ok(Number.isNaN(B.priceForMargin(10, 95, 10)));
});
test("tour budget", () => {
  const t = B.tourBudget([{ label: "van", amount: 1000 }, { label: "food", amount: 50, perShow: true }], 10, 300);
  assert.equal(t.cost, 1500);
  assert.equal(t.income, 3000);
  assert.equal(t.net, 1500);
  assert.equal(t.breakEvenPerShow, 150);
});
test("goal progress", () => {
  const now = Date.parse("2026-02-01T00:00:00Z");
  const g = B.goalProgress(0, 600, 1000, "2026-01-01", "2026-03-03", now);
  assert.equal(g.pct, 60);
  assert.equal(g.daysLeft, 30);
  assert.equal(g.onTrack, true);
  assert.equal(B.goalProgress(0, 100, 1000, "2026-01-01", "2026-03-03", now).onTrack, false);
});
test("templates, split sheet, hashtags, bio", () => {
  assert.deepEqual(B.templateVars("Hi {{a}} and {{ b }} {{a}}"), ["a", "b"]);
  assert.equal(B.fillTemplate("Hi {{a}} {{b}}", { a: "Zed" }), "Hi Zed {{b}}");
  const s = B.splitSheet("Song", [{ name: "A", role: "writer", pct: 60 }, { name: "B", role: "producer", pct: 40 }], "2026-11-25");
  assert.equal(s.ok, true);
  assert.ok(s.text.includes("A — writer: 60%"));
  assert.equal(B.splitSheet("x", [{ name: "A", role: "w", pct: 70 }], "d").ok, false);
  assert.deepEqual(B.extractHashtags("#Music #music #new_wave!"), ["#music", "#new_wave"]);
  assert.ok(B.bioFrom({ name: "Zed", genre: "hip-hop", city: "Budapest", influences: "", milestone: "", link: "" }, "short").startsWith("Zed — hip-hop artist from Budapest"));
});

/* ───── chat ───── */
test("fancy text", () => {
  assert.equal(C.fancyText("Hi 1", "bold"), "𝐇𝐢 𝟏");
  assert.equal(C.fancyText("h", "italic"), "ℎ");
  assert.equal(C.fancyText("R", "double"), "ℝ");
  assert.equal(C.fancyText("ab", "strike"), "a̶b̶");
});
test("tone check", () => {
  const t = C.toneCheck("WHY ARE YOU LATE!!!! PLEASE ANSWER!!!");
  assert.ok(t.flags.length >= 2);
  assert.ok(C.toneCheck("Thanks, see you at 5.").flags[0].includes("balanced"));
});
test("split expenses settles to zero", () => {
  const r = C.splitExpenses([{ name: "A", paid: 90 }, { name: "B", paid: 30 }, { name: "C", paid: 0 }]);
  assert.equal(r.share, 40);
  const net: Record<string, number> = { A: 90 - 40, B: 30 - 40, C: -40 };
  for (const t of r.transfers) {
    net[t.from] += t.amount;
    net[t.to] -= t.amount;
  }
  for (const k of Object.keys(net)) assert.ok(Math.abs(net[k]) < 0.011, k);
  assert.deepEqual(C.splitExpenses([]).transfers, []);
});
test("shuffle / teams / santa are deterministic with a seed and valid", () => {
  const names = ["a", "b", "c", "d", "e"];
  assert.deepEqual(C.shuffle(names, C.mulberry32(1)), C.shuffle(names, C.mulberry32(1)));
  assert.deepEqual(C.shuffle(names, C.mulberry32(3)).slice().sort(), names);
  const teams = C.teamSplit(names, 2, C.mulberry32(9));
  assert.equal(teams.flat().length, 5);
  const s = C.secretSanta(names, C.mulberry32(5));
  assert.equal(new Set(s.map((x) => x.to)).size, 5);
  assert.ok(s.every((x) => x.from !== x.to));
  assert.deepEqual(C.secretSanta(["solo"]), []);
});
test("chat stats parse", () => {
  const raw = ["12/11/2026, 21:05 - Ana: Hello there friend", "12/11/2026, 21:06 - Bob: hello hello", "[12/11/2026, 9:07 PM] Ana: concert tomorrow concert", "continuation line"].join("\n");
  const s = C.chatStats(raw);
  assert.equal(s.messages, 3);
  assert.deepEqual(s.people[0], ["Ana", 2]);
  assert.equal(s.topWords[0][0], "hello");
  assert.equal(s.busiestHour, 21);
});
test("clean url", () => {
  const r = C.cleanUrl("https://ex.com/p?id=3&utm_source=x&fbclid=abc&si=1");
  assert.equal(r.url, "https://ex.com/p?id=3");
  assert.equal(r.removed, 3);
  assert.equal(C.cleanUrl("not a url").removed, 0);
});
test("meeting slots honour every zone", () => {
  const start = Date.parse("2026-11-25T00:00:00Z");
  const slots = C.meetingSlots(start, ["Europe/Budapest", "America/New_York"], 3);
  assert.ok(slots.length > 0);
  for (const t of slots) for (const z of ["Europe/Budapest", "America/New_York"]) {
    const h = C.hourInZone(t, z);
    assert.ok(h >= 8 && h <= 21, `${z} ${h}`);
  }
  assert.ok(Number.isNaN(C.hourInZone(start, "Nope/Zone")));
});
test("poll + out of office + snippets", () => {
  assert.ok(C.pollText("Pizza?", ["Yes", "No", ""]).includes("2️⃣ No"));
  assert.ok(C.outOfOffice({ name: "Z", from: "", to: "Mon", backup: "Sam", urgent: "x@y" }, "formal").includes("contact Sam"));
  assert.equal(C.applySnippet("Hi {name}, {x}", { name: "Ana" }), "Hi Ana, {x}");
});

/* ───── phone ───── */
test("storage + data + download", () => {
  assert.equal(P.storageFit(10, 5), 2000);
  assert.equal(P.storageFit(10, 0), 0);
  assert.equal(P.monthlyData([{ mbPerHour: 100, hoursPerDay: 2 }], 30), 6);
  assert.equal(P.downloadSeconds(100, 80), 10);
  assert.equal(P.humanDuration(3725), "1h 2m");
  assert.equal(P.humanDuration(NaN), "—");
});
test("password generator guarantees classes and is seedable", () => {
  const o = { length: 16, lower: true, upper: true, digits: true, symbols: true, avoidAmbiguous: true };
  const pw = P.generatePassword(o, P.mulberry(7));
  assert.equal(pw.length, 16);
  assert.match(pw, /[a-z]/);
  assert.match(pw, /[A-Z]/);
  assert.match(pw, /\d/);
  assert.match(pw, /[^A-Za-z0-9]/);
  assert.doesNotMatch(pw, /[O0oIl1|]/);
  assert.equal(P.generatePassword({ ...o, lower: false, upper: false, digits: false, symbols: false }), "");
  assert.equal(P.generatePassword(o).length, 16);
  assert.equal(P.passphrase(P.WORDS, 4, "-", P.mulberry(2)).split("-").length, 4);
});
test("password strength", () => {
  assert.equal(P.passwordStrength("password").label, "Very weak");
  assert.ok(P.passwordStrength("k7#Qm!x9Lp2$vR8z").bits > 80);
  assert.equal(P.passwordStrength("aaaaaaaaaaaa").score, 0);
});
test("wifi payload escaping", () => {
  assert.equal(P.wifiPayload("My;Net", "pa:ss", "WPA", true), "WIFI:T:WPA;S:My\\;Net;P:pa\\:ss;H:true;;");
  assert.equal(P.wifiPayload("Open", "", "nopass", false), "WIFI:T:nopass;S:Open;;");
});
test("display math", () => {
  assert.equal(P.aspectRatio(1920, 1080), "16:9");
  assert.equal(P.aspectRatio(0, 5), "—");
  assert.equal(P.ppi(2556, 1179, 6.1), 461);
});
test("pin order", () => {
  const r = P.pinOrder([{ ts: 1 }, { ts: 3, pinned: true }, { ts: 2 }]);
  assert.deepEqual(r.map((x) => x.ts), [3, 2, 1]);
});

/* ───── life ───── */
test("habit streaks", () => {
  const days = ["2026-11-20", "2026-11-21", "2026-11-23", "2026-11-24", "2026-11-25"];
  const s = L.habitStreak(days, "2026-11-25");
  assert.equal(s.current, 3);
  assert.equal(s.best, 3);
  assert.equal(L.habitStreak(days, "2026-11-27").current, 0);
  assert.equal(L.habitStreak(days, "2026-11-26").current, 3);
});
test("decision matrix ranks by weighted score", () => {
  const r = L.decisionScores([{ name: "cost", weight: 3 }, { name: "fun", weight: 1 }], [{ name: "A", scores: [5, 1] }, { name: "B", scores: [2, 5] }]);
  assert.equal(r[0].name, "A");
  assert.equal(r[0].score, 4);
});
test("eisenhower + budget + loan", () => {
  assert.equal(L.eisenhower(true, true), "Do now");
  assert.equal(L.eisenhower(false, false), "Drop");
  assert.deepEqual(L.budgetSplit(2000), { needs: 1000, wants: 600, savings: 400 });
  const l = L.loanPayment(10000, 6, 12);
  assert.equal(l.monthly, 860.66);
  assert.equal(L.loanPayment(1200, 0, 12).monthly, 100);
  const a = L.amortization(10000, 6, 12, 12);
  assert.ok(a[11].balance < 1);
});
test("date diff + countdown", () => {
  assert.deepEqual(L.dateDiff("2000-01-31", "2026-11-25"), { years: 26, months: 9, days: 25, totalDays: 9795, negative: false });
  assert.equal(L.dateDiff("2026-11-25", "2026-11-20")?.negative, true);
  assert.equal(L.dateDiff("x", "y"), null);
  const c = L.countdownParts(Date.parse("2026-11-27T03:00:00Z"), Date.parse("2026-11-25T00:00:00Z"));
  assert.deepEqual(c, { past: false, days: 2, hours: 3, minutes: 0, seconds: 0 });
});
test("dice, picks, mood, breathing", () => {
  const r = L.rollDice(6, 3, () => 0.999);
  assert.deepEqual(r.rolls, [6, 6, 6]);
  assert.equal(r.sum, 18);
  assert.equal(L.pickOne([], () => 0), undefined);
  assert.equal(L.pickOne(["a", "b"], () => 0.9), "b");
  assert.equal(L.moodAverage([{ mood: 4 }, { mood: 5 }]), 4.5);
  const box = L.BREATH_PATTERNS[0].phases;
  assert.equal(L.breathPhaseAt(box, 0).name, "Inhale");
  assert.equal(L.breathPhaseAt(box, 5).name, "Hold");
  assert.equal(L.breathPhaseAt(box, 17).name, "Inhale");
  assert.equal(L.breathScale(box, 0), 0);
  assert.equal(L.breathScale(box, 2), 0.5);
  assert.equal(L.breathScale(box, 6), 1); // hold after inhale stays full
  assert.equal(L.breathScale(box, 10), 0.5); // mid exhale
  assert.equal(L.breathScale(box, 14), 0); // hold after exhale stays empty
});
