/** Stock-market simulator core: fictional tickers, random-walk prices, news shocks, portfolio maths. */

export type Stock = { sym: string; name: string; sector: string; start: number; vol: number; drift: number };

export const STOCKS: Stock[] = [
  { sym: "NXS", name: "Nexus Corp", sector: "Tech", start: 120, vol: 0.018, drift: 0.0004 },
  { sym: "AUDI", name: "Audia Records", sector: "Media", start: 48, vol: 0.022, drift: 0.0003 },
  { sym: "BEAT", name: "BeatBox Audio", sector: "Consumer", start: 75, vol: 0.02, drift: 0.0002 },
  { sym: "SOLR", name: "SolarWave Energy", sector: "Energy", start: 32, vol: 0.026, drift: 0.0004 },
  { sym: "BANK", name: "Danube Bank", sector: "Finance", start: 210, vol: 0.011, drift: 0.0002 },
  { sym: "FOOD", name: "FreshBite Foods", sector: "Staples", start: 64, vol: 0.009, drift: 0.00015 },
  { sym: "AIAI", name: "NeuralNet AI", sector: "Tech", start: 300, vol: 0.032, drift: 0.0005 },
  { sym: "MEME", name: "MoonRocket Inc", sector: "Speculative", start: 8, vol: 0.07, drift: 0 },
];

export const NEWS: { text: string; shock: number; sectors?: string[] }[] = [
  { text: "beats earnings expectations", shock: 0.09 },
  { text: "misses earnings and cuts guidance", shock: -0.1 },
  { text: "announces a huge buyback", shock: 0.06 },
  { text: "faces a regulatory investigation", shock: -0.12 },
  { text: "unveils a breakthrough product", shock: 0.14 },
  { text: "CEO resigns unexpectedly", shock: -0.08 },
  { text: "lands a major partnership", shock: 0.07 },
  { text: "suffers a data breach", shock: -0.09 },
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
    const s = STOCKS[Math.floor(rng() * STOCKS.length)];
    const n = NEWS[Math.floor(rng() * NEWS.length)];
    event = { sym: s.sym, text: n.text, shock: n.shock };
  }
  const next: Record<string, number> = {};
  for (const s of STOCKS) {
    const p = prices[s.sym] ?? s.start;
    let r = s.drift - (s.vol * s.vol) / 2 + s.vol * gaussian(rng) + market;
    if (event && event.sym === s.sym) r += event.shock;
    next[s.sym] = Math.max(0.5, round2(p * Math.exp(r)));
  }
  return { prices: next, event };
}

export type Position = { qty: number; avg: number };
export type Portfolio = { cash: number; positions: Record<string, Position>; fees: number; realized: number };

export function newPortfolio(cash = 10000): Portfolio {
  return { cash, positions: {}, fees: 0, realized: 0 };
}

export function buy(p: Portfolio, sym: string, qty: number, price: number): Portfolio | { error: string } {
  if (!Number.isInteger(qty) || qty < 1) return { error: "Enter a whole number of shares" };
  const gross = qty * price;
  const fee = round2(gross * FEE_RATE);
  if (gross + fee > p.cash + 1e-9) return { error: "Not enough cash" };
  const cur = p.positions[sym] ?? { qty: 0, avg: 0 };
  const newQty = cur.qty + qty;
  const avg = (cur.avg * cur.qty + gross) / newQty;
  return { ...p, cash: round2(p.cash - gross - fee), fees: round2(p.fees + fee), positions: { ...p.positions, [sym]: { qty: newQty, avg } } };
}

export function sell(p: Portfolio, sym: string, qty: number, price: number): Portfolio | { error: string } {
  const cur = p.positions[sym];
  if (!Number.isInteger(qty) || qty < 1) return { error: "Enter a whole number of shares" };
  if (!cur || cur.qty < qty) return { error: "You don't own that many shares" };
  const gross = qty * price;
  const fee = round2(gross * FEE_RATE);
  const positions = { ...p.positions };
  if (cur.qty === qty) delete positions[sym];
  else positions[sym] = { qty: cur.qty - qty, avg: cur.avg };
  return { ...p, cash: round2(p.cash + gross - fee), fees: round2(p.fees + fee), realized: round2(p.realized + (price - cur.avg) * qty - fee), positions };
}

export function netWorth(p: Portfolio, prices: Record<string, number>) {
  return round2(p.cash + Object.entries(p.positions).reduce((a, [sym, pos]) => a + pos.qty * (prices[sym] ?? 0), 0));
}

export function maxBuyable(cash: number, price: number) {
  if (!(price > 0)) return 0;
  return Math.max(0, Math.floor(cash / (price * (1 + FEE_RATE))));
}

export function isError(x: Portfolio | { error: string }): x is { error: string } {
  return "error" in x;
}
