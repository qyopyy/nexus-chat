/** Crypto-trading simulator core: simulated coins, random-walk prices, news shocks, fractional portfolio maths. No real money. */

export type Coin = { sym: string; name: string; emoji: string; start: number; vol: number; drift: number };

export const COINS: Coin[] = [
  { sym: "BTC", name: "Bitcoin", emoji: "₿", start: 68000, vol: 0.011, drift: 0.0002 },
  { sym: "ETH", name: "Ether", emoji: "Ξ", start: 3400, vol: 0.015, drift: 0.0002 },
  { sym: "SOL", name: "Solana", emoji: "◎", start: 160, vol: 0.022, drift: 0.0002 },
  { sym: "BNB", name: "BNB", emoji: "🔶", start: 580, vol: 0.013, drift: 0.0001 },
  { sym: "XRP", name: "Ripple", emoji: "✕", start: 0.55, vol: 0.019, drift: 0 },
  { sym: "ADA", name: "Cardano", emoji: "🔵", start: 0.45, vol: 0.02, drift: 0 },
  { sym: "AVAX", name: "Avalanche", emoji: "🔺", start: 36, vol: 0.024, drift: 0.0001 },
  { sym: "DOGE", name: "Dogecoin", emoji: "🐕", start: 0.16, vol: 0.034, drift: 0 },
];

export const NEWS: { text: string; shock: number }[] = [
  { text: "gets a spot ETF approval", shock: 0.1 },
  { text: "is hit by an exchange hack", shock: -0.13 },
  { text: "is adopted by a big retailer", shock: 0.07 },
  { text: "faces a regulator crackdown", shock: -0.11 },
  { text: "ships a major network upgrade", shock: 0.12 },
  { text: "sees a whale dump", shock: -0.08 },
  { text: "trends on social media", shock: 0.09 },
  { text: "suffers a network outage", shock: -0.07 },
];

export const FEE_RATE = 0.001;

export function gaussian(rng: () => number) {
  let u = 0;
  while (u === 0) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type MarketEvent = { sym: string; text: string; shock: number } | null;

/** One tick: shared market factor + idiosyncratic noise, occasional news shock. */
export function stepMarket(prices: Record<string, number>, rng: () => number, newsChance = 0.03) {
  const market = gaussian(rng) * 0.004;
  let event: MarketEvent = null;
  if (rng() < newsChance) {
    const c = COINS[Math.floor(rng() * COINS.length)];
    const n = NEWS[Math.floor(rng() * NEWS.length)];
    event = { sym: c.sym, text: n.text, shock: n.shock };
  }
  const next: Record<string, number> = {};
  for (const c of COINS) {
    const p = prices[c.sym] ?? c.start;
    let r = c.drift - (c.vol * c.vol) / 2 + c.vol * gaussian(rng) + market;
    if (event && event.sym === c.sym) r += event.shock;
    next[c.sym] = Math.max(c.start * 0.02, Math.round(p * Math.exp(r) * 1e6) / 1e6);
  }
  return { prices: next, event };
}

export type Position = { qty: number; avg: number };
export type Portfolio = { cash: number; positions: Record<string, Position>; fees: number; realized: number };

export function newPortfolio(cash = 10000): Portfolio {
  return { cash, positions: {}, fees: 0, realized: 0 };
}

/** Spend `usd` dollars (fee included) on a coin — fractional amounts allowed. */
export function buyUsd(p: Portfolio, sym: string, usd: number, price: number): Portfolio | { error: string } {
  if (!COINS.some((c) => c.sym === sym)) return { error: "Unknown coin" };
  if (!(usd >= 1)) return { error: "Minimum order is $1" };
  if (!(price > 0)) return { error: "No price available" };
  if (usd > p.cash + 1e-9) return { error: "Not enough cash" };
  const fee = round2(usd * FEE_RATE);
  const qty = (usd - fee) / price;
  const cur = p.positions[sym] ?? { qty: 0, avg: 0 };
  const newQty = cur.qty + qty;
  const avg = (cur.avg * cur.qty + (usd - fee)) / newQty;
  return { ...p, cash: round2(p.cash - usd), fees: round2(p.fees + fee), positions: { ...p.positions, [sym]: { qty: newQty, avg } } };
}

export function sellQty(p: Portfolio, sym: string, qty: number, price: number): Portfolio | { error: string } {
  const cur = p.positions[sym];
  if (!(qty > 0)) return { error: "Enter an amount to sell" };
  if (!cur || cur.qty < qty - 1e-12) return { error: "You don't own that much" };
  const all = qty >= cur.qty - 1e-12;
  const sold = all ? cur.qty : qty;
  const gross = sold * price;
  const fee = round2(gross * FEE_RATE);
  const positions = { ...p.positions };
  if (all) delete positions[sym];
  else positions[sym] = { qty: cur.qty - sold, avg: cur.avg };
  return { ...p, cash: round2(p.cash + gross - fee), fees: round2(p.fees + fee), realized: round2(p.realized + (price - cur.avg) * sold - fee), positions };
}

/** Sell a fraction (0–1] of the position. */
export function sellPct(p: Portfolio, sym: string, pct: number, price: number) {
  const cur = p.positions[sym];
  if (!cur) return { error: "You don't own that coin" } as const;
  return sellQty(p, sym, cur.qty * Math.min(1, pct), price);
}

export function netWorth(p: Portfolio, prices: Record<string, number>) {
  return round2(p.cash + Object.entries(p.positions).reduce((a, [sym, pos]) => a + pos.qty * (prices[sym] ?? 0), 0));
}

export function isError(x: Portfolio | { error: string }): x is { error: string } {
  return "error" in x;
}

/** Price formatting that keeps cheap coins readable. */
export function fmtPrice(n: number) {
  const d = n >= 100 ? 2 : n >= 1 ? 3 : 4;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}
export function fmtQty(q: number) {
  return q >= 100 ? q.toFixed(2) : q >= 1 ? q.toFixed(4) : q.toFixed(6);
}
