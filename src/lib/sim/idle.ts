/** Shared engine for the Nexus idle / tycoon games (pure, deterministic, testable). */

export type Gen = { id: string; name: string; emoji: string; baseCost: number; growth: number; rate: number };
export type Upg = { id: string; name: string; desc: string; cost: number; mult: number; gen?: string; needs?: number };
export type IdleConfig = {
  id: string;
  title: string;
  emoji: string;
  unit: string; // e.g. "$", "★"
  tapName: string;
  tapValue: number;
  gens: Gen[];
  upgrades: Upg[];
  prestigeName: string;
  prestigeBase: number; // lifetime earnings needed for the first prestige point
};
export type IdleState = { cash: number; total: number; counts: Record<string, number>; upgrades: string[]; prestige: number; ts: number; taps: number };

export const OFFLINE_CAP_SEC = 8 * 3600;
export const OFFLINE_EFFICIENCY = 0.5;
export const PRESTIGE_BONUS = 0.15;

export function newState(now = Date.now()): IdleState {
  return { cash: 0, total: 0, counts: {}, upgrades: [], prestige: 0, ts: now, taps: 0 };
}

/** Cost of buying `qty` more of a generator when `owned` are already held. */
export function genCost(g: Gen, owned: number, qty = 1) {
  if (qty <= 0) return 0;
  if (g.growth === 1) return g.baseCost * qty;
  return (g.baseCost * Math.pow(g.growth, owned) * (Math.pow(g.growth, qty) - 1)) / (g.growth - 1);
}

export function maxAffordable(g: Gen, owned: number, cash: number) {
  let lo = 0;
  let hi = 1;
  while (genCost(g, owned, hi) <= cash && hi < 1e6) hi *= 2;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (genCost(g, owned, mid) <= cash) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function prestigeMult(prestige: number) {
  return 1 + PRESTIGE_BONUS * prestige;
}

function upgradeMult(cfg: IdleConfig, s: IdleState, genId?: string) {
  let m = 1;
  for (const u of cfg.upgrades) {
    if (!s.upgrades.includes(u.id)) continue;
    if (u.gen === undefined || u.gen === genId) m *= u.mult;
  }
  return m;
}

/** Income per second. Global upgrades (no `gen`) apply to everything. */
export function perSecond(cfg: IdleConfig, s: IdleState) {
  let total = 0;
  for (const g of cfg.gens) {
    const n = s.counts[g.id] || 0;
    if (!n) continue;
    const specific = cfg.upgrades.reduce((m, u) => (s.upgrades.includes(u.id) && u.gen === g.id ? m * u.mult : m), 1);
    total += g.rate * n * specific;
  }
  const global = cfg.upgrades.reduce((m, u) => (s.upgrades.includes(u.id) && u.gen === undefined ? m * u.mult : m), 1);
  return total * global * prestigeMult(s.prestige);
}

export function tapGain(cfg: IdleConfig, s: IdleState) {
  return cfg.tapValue * upgradeMult(cfg, s) * prestigeMult(s.prestige) + perSecond(cfg, s) * 0.05;
}

export function tick(cfg: IdleConfig, s: IdleState, dtSec: number): IdleState {
  if (!(dtSec > 0)) return s;
  const gain = perSecond(cfg, s) * dtSec;
  return { ...s, cash: s.cash + gain, total: s.total + gain };
}

export function offlineGain(cfg: IdleConfig, s: IdleState, now: number) {
  const sec = Math.max(0, Math.min(OFFLINE_CAP_SEC, (now - s.ts) / 1000));
  return { seconds: sec, gain: perSecond(cfg, s) * sec * OFFLINE_EFFICIENCY };
}

export function buyGen(cfg: IdleConfig, s: IdleState, genId: string, qty: number): IdleState | null {
  const g = cfg.gens.find((x) => x.id === genId);
  if (!g || qty < 1) return null;
  const cost = genCost(g, s.counts[genId] || 0, qty);
  if (cost > s.cash + 1e-9) return null;
  return { ...s, cash: s.cash - cost, counts: { ...s.counts, [genId]: (s.counts[genId] || 0) + qty } };
}

export function upgradeAvailable(u: Upg, s: IdleState) {
  if (s.upgrades.includes(u.id)) return false;
  if (u.gen && (s.counts[u.gen] || 0) < (u.needs ?? 1)) return false;
  return true;
}

export function buyUpgrade(cfg: IdleConfig, s: IdleState, id: string): IdleState | null {
  const u = cfg.upgrades.find((x) => x.id === id);
  if (!u || !upgradeAvailable(u, s) || u.cost > s.cash) return null;
  return { ...s, cash: s.cash - u.cost, upgrades: [...s.upgrades, id] };
}

/** Lifetime prestige points earned so far (never decreases). */
export function prestigeEarned(cfg: IdleConfig, total: number) {
  return Math.floor(Math.sqrt(Math.max(0, total) / cfg.prestigeBase));
}

export function prestigeAvailable(cfg: IdleConfig, s: IdleState) {
  return Math.max(0, prestigeEarned(cfg, s.total) - s.prestige);
}

export function doPrestige(cfg: IdleConfig, s: IdleState, now = Date.now()): IdleState | null {
  if (prestigeAvailable(cfg, s) < 1) return null;
  return { ...newState(now), prestige: prestigeEarned(cfg, s.total), taps: s.taps };
}

const SUFFIX = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
export function fmt(n: number) {
  if (!Number.isFinite(n)) return "∞";
  const neg = n < 0;
  let v = Math.abs(n);
  if (v < 1000) return (neg ? "-" : "") + (v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : v.toFixed(0)).replace(/\.0+$|(\.\d*[1-9])0+$/, "$1");
  let i = 0;
  while (v >= 1000 && i < SUFFIX.length - 1) {
    v /= 1000;
    i++;
  }
  return (neg ? "-" : "") + (v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : v.toFixed(0)) + SUFFIX[i];
}
