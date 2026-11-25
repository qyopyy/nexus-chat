/** Pure helpers behind the Nexus Pro business tools. */

export type Line = { desc: string; qty: number; price: number };

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function invoiceTotals(lines: Line[], taxPct: number, discountPct: number) {
  const subtotal = cents(lines.reduce((a, l) => a + (l.qty || 0) * (l.price || 0), 0));
  const discount = cents((subtotal * Math.min(100, Math.max(0, discountPct || 0))) / 100);
  const taxable = subtotal - discount;
  const tax = cents((taxable * Math.max(0, taxPct || 0)) / 100);
  return { subtotal, discount, tax, total: cents(taxable + tax) };
}

export function money(n: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export const PLATFORM_LIMITS: Record<string, number> = {
  "X / Twitter": 280,
  Instagram: 2200,
  TikTok: 4000,
  "YouTube title": 100,
  "YouTube description": 5000,
  LinkedIn: 3000,
  Threads: 500,
  "Spotify bio": 1500,
  "Bluesky": 300,
};

export function captionStatus(text: string, platform: string) {
  const limit = PLATFORM_LIMITS[platform] ?? 0;
  const len = [...text].length;
  return { len, limit, left: limit - len, over: limit > 0 && len > limit, pct: limit ? Math.min(100, Math.round((len / limit) * 100)) : 0 };
}

export function merchMargin(cost: number, price: number, feesPct: number) {
  const fees = (price * (feesPct || 0)) / 100;
  const profit = price - cost - fees;
  return { fees: cents(fees), profit: cents(profit), marginPct: price > 0 ? cents((profit / price) * 100) : 0, markupPct: cost > 0 ? cents((profit / cost) * 100) : 0 };
}

/** Price needed to hit a target margin after percentage fees. */
export function priceForMargin(cost: number, marginPct: number, feesPct: number) {
  const keep = 1 - (feesPct || 0) / 100 - (marginPct || 0) / 100;
  return keep > 0 ? cents(cost / keep) : NaN;
}

export type Expense = { label: string; amount: number; perShow?: boolean };
export function tourBudget(expenses: Expense[], shows: number, expectedPerShow: number) {
  const n = Math.max(1, shows || 1);
  const fixed = expenses.filter((e) => !e.perShow).reduce((a, e) => a + (e.amount || 0), 0);
  const variable = expenses.filter((e) => e.perShow).reduce((a, e) => a + (e.amount || 0), 0) * n;
  const cost = fixed + variable;
  const income = (expectedPerShow || 0) * n;
  return { cost: cents(cost), income: cents(income), net: cents(income - cost), breakEvenPerShow: cents(cost / n) };
}

const DAY = 86400000;
export function goalProgress(start: number, current: number, target: number, startIso: string, endIso: string, nowMs = Date.now()) {
  const span = target - start;
  const pct = span === 0 ? 100 : Math.max(0, Math.min(100, ((current - start) / span) * 100));
  const s = Date.parse(startIso);
  const e = Date.parse(endIso);
  const daysLeft = Number.isFinite(e) ? Math.max(0, Math.ceil((e - nowMs) / DAY)) : 0;
  const perDay = daysLeft > 0 ? Math.max(0, (target - current) / daysLeft) : Math.max(0, target - current);
  let onTrack = true;
  if (Number.isFinite(s) && Number.isFinite(e) && e > s) {
    const expected = start + span * Math.min(1, Math.max(0, (nowMs - s) / (e - s)));
    onTrack = current >= expected;
  }
  return { pct: Math.round(pct * 10) / 10, daysLeft, perDay: Math.ceil(perDay * 10) / 10, onTrack };
}

export function templateVars(tpl: string) {
  const out: string[] = [];
  for (const m of tpl.matchAll(/\{\{\s*([\w ]+?)\s*\}\}/g)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

export function fillTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{\s*([\w ]+?)\s*\}\}/g, (_, k: string) => (vars[k] ? vars[k] : `{{${k}}}`));
}

export const OUTREACH_TEMPLATES: { name: string; body: string }[] = [
  {
    name: "Playlist curator pitch",
    body: "Hi {{curator}},\n\nI'm {{artist}} — my new track \"{{track}}\" fits the vibe of {{playlist}}. {{hook}}\n\nListen here: {{link}}\n\nThanks for your time,\n{{artist}}",
  },
  {
    name: "Venue booking",
    body: "Hello {{contact}},\n\nI'm {{artist}} ({{genre}}) and would love to play {{venue}} around {{date}}. We typically draw {{draw}} people. Press kit: {{link}}\n\nBest,\n{{artist}}",
  },
  {
    name: "Collab request",
    body: "Hey {{name}},\n\nBig fan of {{their_work}}. I'm working on a {{genre}} track and think your sound would be perfect on it. Want to hear a demo?\n\n{{artist}}",
  },
  {
    name: "Press / blog",
    body: "Hi {{editor}},\n\n{{artist}} is releasing \"{{track}}\" on {{date}}. {{hook}} Private stream: {{link}}\n\nHappy to send photos, a bio or answer questions.\n\n{{artist}}",
  },
];

export function splitSheet(title: string, parties: { name: string; role: string; pct: number }[], dateIso: string) {
  const total = parties.reduce((a, p) => a + (p.pct || 0), 0);
  const lines = parties.map((p) => `- ${p.name || "(name)"} — ${p.role || "writer"}: ${p.pct || 0}%`);
  return {
    total: cents(total),
    ok: Math.abs(total - 100) < 0.001,
    text: `SPLIT SHEET\nWork: ${title || "(title)"}\nDate: ${dateIso}\n\nOwnership:\n${lines.join("\n")}\n\nTotal: ${cents(total)}%\n\nBy signing below each party confirms the splits above for composition and master ownership.\n\n${parties.map((p) => `${p.name || "(name)"}: ______________________`).join("\n")}\n`,
  };
}

export function extractHashtags(text: string) {
  const tags = (text.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((t) => t.toLowerCase());
  return [...new Set(tags)];
}

export function bioFrom(f: { name: string; genre: string; city: string; influences: string; milestone: string; link: string }, style: "short" | "long") {
  const city = f.city ? ` from ${f.city}` : "";
  const inf = f.influences ? ` Influenced by ${f.influences}.` : "";
  const ms = f.milestone ? ` ${f.milestone}` : "";
  const link = f.link ? ` Listen: ${f.link}` : "";
  if (style === "short") return `${f.name || "Artist"} — ${f.genre || "music"} artist${city}.${link}`.trim();
  return `${f.name || "Artist"} is a ${f.genre || "music"} artist${city}.${inf}${ms}${link}`.replace(/\s+/g, " ").trim();
}
