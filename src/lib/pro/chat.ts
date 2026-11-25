/** Pure helpers behind the Nexus Pro chat tools. */

type Range = { upper: number; lower: number; digit: number; exceptions?: Record<string, number> };
const STYLES: Record<string, Range> = {
  bold: { upper: 0x1d400, lower: 0x1d41a, digit: 0x1d7ce },
  italic: { upper: 0x1d434, lower: 0x1d44e, digit: -1, exceptions: { h: 0x210e } },
  boldItalic: { upper: 0x1d468, lower: 0x1d482, digit: -1 },
  mono: { upper: 0x1d670, lower: 0x1d68a, digit: 0x1d7f6 },
  double: {
    upper: 0x1d538,
    lower: 0x1d552,
    digit: 0x1d7d8,
    exceptions: { C: 0x2102, H: 0x210d, N: 0x2115, P: 0x2119, Q: 0x211a, R: 0x211d, Z: 0x2124 },
  },
};
export const FANCY_STYLES = [...Object.keys(STYLES), "strike", "underline"] as const;
export type FancyStyle = (typeof FANCY_STYLES)[number];

export function fancyText(text: string, style: FancyStyle) {
  if (style === "strike") return [...text].map((c) => (c === " " ? c : c + "̶")).join("");
  if (style === "underline") return [...text].map((c) => (c === " " ? c : c + "̲")).join("");
  const r = STYLES[style];
  return [...text]
    .map((c) => {
      if (r.exceptions && r.exceptions[c]) return String.fromCodePoint(r.exceptions[c]);
      if (c >= "A" && c <= "Z") return String.fromCodePoint(r.upper + c.charCodeAt(0) - 65);
      if (c >= "a" && c <= "z") return String.fromCodePoint(r.lower + c.charCodeAt(0) - 97);
      if (c >= "0" && c <= "9" && r.digit >= 0) return String.fromCodePoint(r.digit + c.charCodeAt(0) - 48);
      return c;
    })
    .join("");
}

export function toneCheck(text: string) {
  const words = text.match(/[\p{L}\p{N}'’]+/gu) ?? [];
  const caps = words.filter((w) => w.length > 2 && w === w.toUpperCase() && /\p{L}/u.test(w));
  const exclaims = (text.match(/!/g) ?? []).length;
  const questions = (text.match(/\?/g) ?? []).length;
  const flags: string[] = [];
  if (caps.length >= 2) flags.push("Several ALL-CAPS words can read as shouting.");
  if (exclaims >= 4) flags.push("Lots of exclamation marks — consider toning down.");
  if (/(.)\1{4,}/.test(text)) flags.push("Long repeated letters (soooo) may look unprofessional.");
  if (words.length > 120) flags.push("Long message — consider a short summary first.");
  if (!flags.length && words.length) flags.push("Tone looks balanced.");
  return { words: words.length, readSeconds: Math.max(1, Math.round((words.length / 200) * 60)), caps: caps.length, exclaims, questions, flags };
}

export function splitExpenses(people: { name: string; paid: number }[]) {
  const n = people.length;
  if (!n) return { share: 0, balances: [] as { name: string; balance: number }[], transfers: [] as { from: string; to: string; amount: number }[] };
  const total = people.reduce((a, p) => a + (p.paid || 0), 0);
  const share = total / n;
  const balances = people.map((p) => ({ name: p.name, balance: Math.round(((p.paid || 0) - share) * 100) / 100 }));
  const debtors = balances.filter((b) => b.balance < -0.004).map((b) => ({ ...b }));
  const creditors = balances.filter((b) => b.balance > 0.004).map((b) => ({ ...b }));
  debtors.sort((a, b) => a.balance - b.balance);
  creditors.sort((a, b) => b.balance - a.balance);
  const transfers: { from: string; to: string; amount: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(-debtors[i].balance, creditors[j].balance);
    const a = Math.round(amt * 100) / 100;
    if (a > 0) transfers.push({ from: debtors[i].name, to: creditors[j].name, amount: a });
    debtors[i].balance += amt;
    creditors[j].balance -= amt;
    if (Math.abs(debtors[i].balance) < 0.005) i++;
    if (Math.abs(creditors[j].balance) < 0.005) j++;
  }
  return { share: Math.round(share * 100) / 100, balances, transfers };
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rng: () => number = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function teamSplit(names: string[], teams: number, rng: () => number = Math.random) {
  const n = Math.max(1, Math.min(teams, names.length || 1));
  const out: string[][] = Array.from({ length: n }, () => []);
  shuffle(names, rng).forEach((nm, i) => out[i % n].push(nm));
  return out;
}

/** Secret-santa: everyone gives to someone else, nobody to themselves. */
export function secretSanta(names: string[], rng: () => number = Math.random) {
  if (names.length < 2) return [] as { from: string; to: string }[];
  for (let tries = 0; tries < 200; tries++) {
    const to = shuffle(names, rng);
    if (to.every((t, i) => t !== names[i])) return names.map((from, i) => ({ from, to: to[i] }));
  }
  // deterministic fallback: rotate by one
  return names.map((from, i) => ({ from, to: names[(i + 1) % names.length] }));
}

const STOP = new Set("the a an and or but to of in on at for is it i you me my we he she they this that with was are be so do not no yes if just have has had as by from me your our".split(" "));
export function chatStats(raw: string) {
  const re = /^\[?(\d{1,4}[./-]\d{1,2}[./-]\d{1,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][Mm])?)\]?\s*(?:-\s*)?([^:]{1,40}):\s?(.*)$/;
  const perPerson: Record<string, number> = {};
  const words: Record<string, number> = {};
  const hours = new Array(24).fill(0) as number[];
  let messages = 0;
  for (const line of raw.split(/\r?\n/)) {
    const m = re.exec(line.trim());
    if (!m) continue;
    messages++;
    perPerson[m[3]] = (perPerson[m[3]] || 0) + 1;
    const hm = /^(\d{1,2}):/.exec(m[2]);
    if (hm) {
      let h = Number(hm[1]) % 24;
      if (/pm/i.test(m[2]) && h < 12) h += 12;
      if (/am/i.test(m[2]) && h === 12) h = 0;
      hours[h]++;
    }
    for (const w of m[4].toLowerCase().match(/[\p{L}']{3,}/gu) ?? []) if (!STOP.has(w)) words[w] = (words[w] || 0) + 1;
  }
  const top = (o: Record<string, number>, n: number) =>
    Object.entries(o)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);
  const busiest = hours.indexOf(Math.max(...hours));
  return { messages, people: top(perPerson, 10), topWords: top(words, 10), busiestHour: messages ? busiest : -1 };
}

const TRACKING = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|igshid|igsh|mc_cid|mc_eid|si|ref_src|ref|_hsenc|_hsmi|yclid|twclid|ttclid)$/i;
export function cleanUrl(input: string) {
  try {
    const u = new URL(input.trim());
    const del: string[] = [];
    u.searchParams.forEach((_, k) => {
      if (TRACKING.test(k)) del.push(k);
    });
    del.forEach((k) => u.searchParams.delete(k));
    return { url: u.toString(), removed: del.length };
  } catch {
    return { url: input.trim(), removed: 0, invalid: true as const };
  }
}

export function formatInZone(ms: number, tz: string) {
  try {
    return new Intl.DateTimeFormat("en", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false, month: "short", day: "numeric" }).format(ms);
  } catch {
    return "invalid zone";
  }
}

export function hourInZone(ms: number, tz: string) {
  try {
    const h = new Intl.DateTimeFormat("en", { timeZone: tz, hour: "2-digit", hour12: false }).format(ms);
    return Number(h) % 24;
  } catch {
    return NaN;
  }
}

/** Candidate meeting times (hourly, from `startMs`) that land in 8:00–21:59 for every zone. */
export function meetingSlots(startMs: number, zones: string[], count = 6, lookaheadHours = 72) {
  const out: number[] = [];
  const base = Math.ceil(startMs / 3600000) * 3600000;
  for (let i = 0; i < lookaheadHours && out.length < count; i++) {
    const t = base + i * 3600000;
    if (zones.every((z) => {
      const h = hourInZone(t, z);
      return h >= 8 && h <= 21;
    })) out.push(t);
  }
  return out;
}

const NUM = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
export function pollText(question: string, options: string[]) {
  const opts = options.map((o) => o.trim()).filter(Boolean).slice(0, 10);
  return `📊 ${question.trim() || "Poll"}\n\n${opts.map((o, i) => `${NUM[i]} ${o}`).join("\n")}\n\nReply with a number to vote.`;
}

export function outOfOffice(f: { name: string; from: string; to: string; backup: string; urgent: string }, tone: "formal" | "friendly") {
  const back = f.to ? `I'll be back on ${f.to}` : "I'll be back soon";
  const away = f.from ? ` (away since ${f.from})` : "";
  const help = f.backup ? ` For anything urgent, please contact ${f.backup}${f.urgent ? ` (${f.urgent})` : ""}.` : "";
  return tone === "formal"
    ? `Thank you for your message. I am currently out of office${away}. ${back} and will reply then.${help}\n\nKind regards,\n${f.name}`
    : `Hey! Thanks for reaching out — I'm away right now${away}. ${back} and I'll get back to you as soon as I can.${help}\n\n— ${f.name}`;
}

export function applySnippet(body: string, vars: Record<string, string>) {
  return body.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] ?? m));
}
