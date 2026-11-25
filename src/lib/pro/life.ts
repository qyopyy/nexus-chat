/** Pure helpers behind the Nexus Pro life & productivity tools. */

const DAY = 86400000;
const dayNum = (iso: string) => Math.floor(Date.parse(iso + "T00:00:00Z") / DAY);

export function isoDay(ms: number, offsetMin = 0) {
  return new Date(ms - offsetMin * 60000).toISOString().slice(0, 10);
}

export function habitStreak(days: string[], todayIso: string) {
  const set = new Set(days.map(dayNum));
  const today = dayNum(todayIso);
  let cur = 0;
  let d = set.has(today) ? today : today - 1;
  while (set.has(d)) {
    cur++;
    d--;
  }
  const sorted = [...set].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let prev = -Infinity;
  for (const n of sorted) {
    run = n === prev + 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = n;
  }
  return { current: cur, best, total: set.size };
}

export type Criterion = { name: string; weight: number };
export function decisionScores(criteria: Criterion[], options: { name: string; scores: number[] }[]) {
  const wsum = criteria.reduce((a, c) => a + Math.max(0, c.weight), 0) || 1;
  const rows = options.map((o) => ({
    name: o.name,
    score: Math.round((criteria.reduce((a, c, i) => a + Math.max(0, c.weight) * (o.scores[i] || 0), 0) / wsum) * 100) / 100,
  }));
  return rows.sort((a, b) => b.score - a.score);
}

export function eisenhower(urgent: boolean, important: boolean) {
  if (urgent && important) return "Do now";
  if (!urgent && important) return "Schedule";
  if (urgent && !important) return "Delegate";
  return "Drop";
}

export function budgetSplit(income: number, needs = 50, wants = 30, savings = 20) {
  const t = needs + wants + savings || 1;
  const r = (x: number) => Math.round(((income * x) / t) * 100) / 100;
  return { needs: r(needs), wants: r(wants), savings: r(savings) };
}

export function loanPayment(principal: number, annualRatePct: number, months: number) {
  if (!(principal > 0) || !(months > 0)) return { monthly: 0, total: 0, interest: 0 };
  const r = annualRatePct / 100 / 12;
  const monthly = r === 0 ? principal / months : (principal * r) / (1 - Math.pow(1 + r, -months));
  const total = monthly * months;
  return { monthly: Math.round(monthly * 100) / 100, total: Math.round(total * 100) / 100, interest: Math.round((total - principal) * 100) / 100 };
}

export function amortization(principal: number, annualRatePct: number, months: number, rows = 12) {
  const { monthly } = loanPayment(principal, annualRatePct, months);
  const r = annualRatePct / 100 / 12;
  let bal = principal;
  const out: { n: number; interest: number; principal: number; balance: number }[] = [];
  for (let i = 1; i <= Math.min(rows, months); i++) {
    const interest = bal * r;
    const pr = monthly - interest;
    bal = Math.max(0, bal - pr);
    out.push({ n: i, interest: Math.round(interest * 100) / 100, principal: Math.round(pr * 100) / 100, balance: Math.round(bal * 100) / 100 });
  }
  return out;
}

export function dateDiff(fromIso: string, toIso: string) {
  let a = new Date(fromIso + "T00:00:00Z");
  let b = new Date(toIso + "T00:00:00Z");
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const negative = a > b;
  if (negative) [a, b] = [b, a];
  let years = b.getUTCFullYear() - a.getUTCFullYear();
  let months = b.getUTCMonth() - a.getUTCMonth();
  let days = b.getUTCDate() - a.getUTCDate();
  if (days < 0) {
    months--;
    days += new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 0)).getUTCDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }
  return { years, months, days, totalDays: Math.round((b.getTime() - a.getTime()) / DAY), negative };
}

export function countdownParts(targetMs: number, nowMs = Date.now()) {
  const diff = targetMs - nowMs;
  const abs = Math.abs(diff);
  return { past: diff < 0, days: Math.floor(abs / DAY), hours: Math.floor((abs % DAY) / 3600000), minutes: Math.floor((abs % 3600000) / 60000), seconds: Math.floor((abs % 60000) / 1000) };
}

export function rollDice(sides: number, count: number, rng: () => number = Math.random) {
  const s = Math.max(2, Math.floor(sides));
  const c = Math.max(1, Math.min(50, Math.floor(count)));
  const rolls = Array.from({ length: c }, () => 1 + Math.floor(rng() * s));
  return { rolls, sum: rolls.reduce((a, b) => a + b, 0) };
}

export function pickOne<T>(items: T[], rng: () => number = Math.random): T | undefined {
  return items.length ? items[Math.floor(rng() * items.length)] : undefined;
}

export const MOODS = ["😞", "😕", "😐", "🙂", "😄"];

export function moodAverage(entries: { mood: number }[]) {
  return entries.length ? Math.round((entries.reduce((a, e) => a + e.mood, 0) / entries.length) * 10) / 10 : 0;
}

export const BREATH_PATTERNS: { name: string; phases: [string, number][] }[] = [
  { name: "Box 4-4-4-4", phases: [["Inhale", 4], ["Hold", 4], ["Exhale", 4], ["Hold", 4]] },
  { name: "Relax 4-7-8", phases: [["Inhale", 4], ["Hold", 7], ["Exhale", 8]] },
  { name: "Calm 5-5", phases: [["Inhale", 5], ["Exhale", 5]] },
];

export function breathPhaseAt(pattern: [string, number][], elapsedSec: number) {
  const cycle = pattern.reduce((a, p) => a + p[1], 0);
  let t = ((elapsedSec % cycle) + cycle) % cycle;
  for (const [name, dur] of pattern) {
    if (t < dur) return { name, left: Math.ceil(dur - t), progress: t / dur };
    t -= dur;
  }
  return { name: pattern[0][0], left: pattern[0][1], progress: 0 };
}

/** 0 (lungs empty) … 1 (full): inhale rises, exhale falls, holds keep the previous size. */
export function breathScale(pattern: [string, number][], elapsedSec: number) {
  const cycle = pattern.reduce((a, p) => a + p[1], 0);
  let t = ((elapsedSec % cycle) + cycle) % cycle;
  let level = 0;
  for (const [name, dur] of pattern) {
    if (t < dur) {
      if (name === "Inhale") return t / dur;
      if (name === "Exhale") return 1 - t / dur;
      return level;
    }
    t -= dur;
    level = name === "Inhale" ? 1 : name === "Exhale" ? 0 : level;
  }
  return level;
}
