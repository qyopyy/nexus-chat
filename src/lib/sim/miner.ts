/** Bitcoin-miner simulator core: rigs, power, difficulty, halvings and a mean-reverting price. */

export type Rig = { id: string; name: string; emoji: string; hash: number; watts: number; cost: number };

export const RIGS: Rig[] = [
  { id: "laptop", name: "Old laptop CPU", emoji: "💻", hash: 1, watts: 45, cost: 40 },
  { id: "gpu", name: "GPU rig (6×)", emoji: "🎮", hash: 14, watts: 600, cost: 650 },
  { id: "s9", name: "Used ASIC S9", emoji: "📦", hash: 95, watts: 1300, cost: 2800 },
  { id: "s19", name: "ASIC S19 Pro", emoji: "⚙️", hash: 330, watts: 3250, cost: 9500 },
  { id: "s21", name: "ASIC S21 Hydro", emoji: "💧", hash: 1100, watts: 5300, cost: 31000 },
  { id: "farm", name: "Container farm", emoji: "🏭", hash: 9000, watts: 36000, cost: 240000 },
];

export type MinerUpgrade = { id: string; name: string; desc: string; cost: number; kind: "hash" | "power" | "cap"; value: number };
export const UPGRADES: MinerUpgrade[] = [
  { id: "fans", name: "Better fans", desc: "+8% hashrate (cooler chips)", cost: 600, kind: "hash", value: 0.08 },
  { id: "oc", name: "Overclock firmware", desc: "+20% hashrate", cost: 6000, kind: "hash", value: 0.2 },
  { id: "immersion", name: "Immersion cooling", desc: "+30% hashrate", cost: 60000, kind: "hash", value: 0.3 },
  { id: "psu", name: "Efficient PSUs", desc: "−15% power use", cost: 2500, kind: "power", value: 0.15 },
  { id: "solar", name: "Solar roof", desc: "−35% power cost", cost: 35000, kind: "power", value: 0.35 },
  { id: "pool", name: "Mining pool", desc: "+10% effective hashrate (pool luck)", cost: 1200, kind: "hash", value: 0.1 },
  { id: "storage", name: "Hardware wallet", desc: "Hold more safely: +50 BTC cap", cost: 900, kind: "cap", value: 50 },
];

export const BASE_RATE = 3e-8; // BTC / sec / hash unit at difficulty 1, before halvings
export const BLOCK_SECONDS = 30; // game "blocks" tick every 30s of play
export const HALVING_BLOCKS = 120; // reward halves every hour of play
export const DIFF_GROWTH = 1.006; // per block
export const ELEC_PER_KW_SEC = 0.02; // $ per kW per second
export const START_PRICE = 42000;

export type MinerState = {
  cash: number;
  btc: number;
  counts: Record<string, number>;
  upgrades: string[];
  price: number;
  block: number;
  totalBtc: number;
  ts: number;
};

export function newMiner(now = Date.now()): MinerState {
  return { cash: 120, btc: 0, counts: { laptop: 1 }, upgrades: [], price: START_PRICE, block: 0, totalBtc: 0, ts: now };
}

const sumUp = (s: MinerState, kind: MinerUpgrade["kind"]) => UPGRADES.filter((u) => s.upgrades.includes(u.id) && u.kind === kind).reduce((a, u) => a + u.value, 0);

export function difficulty(block: number) {
  return Math.pow(DIFF_GROWTH, Math.max(0, block));
}
export function rewardFactor(block: number) {
  return Math.pow(0.5, Math.floor(Math.max(0, block) / HALVING_BLOCKS));
}
export function hashPower(s: MinerState) {
  const base = RIGS.reduce((a, r) => a + r.hash * (s.counts[r.id] || 0), 0);
  return base * (1 + sumUp(s, "hash"));
}
export function powerKw(s: MinerState) {
  const w = RIGS.reduce((a, r) => a + r.watts * (s.counts[r.id] || 0), 0);
  return (w / 1000) * (1 - Math.min(0.75, sumUp(s, "power")));
}
export function btcPerSecond(s: MinerState) {
  return (hashPower(s) * BASE_RATE * rewardFactor(s.block)) / difficulty(s.block);
}
export function costPerSecond(s: MinerState) {
  return powerKw(s) * ELEC_PER_KW_SEC;
}
export function walletCap(s: MinerState) {
  return 25 + sumUp(s, "cap");
}

/** Mean-reverting random walk with fat-tail jolts. `rng` returns [0,1). */
export function nextPrice(p: number, rng: () => number, anchor = START_PRICE) {
  const u = rng() || 1e-9;
  const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  const revert = (Math.log(anchor) - Math.log(p)) * 0.004;
  const jolt = rng() < 0.01 ? (rng() - 0.5) * 0.12 : 0;
  const next = p * Math.exp(revert + g * 0.012 + jolt);
  return Math.min(500000, Math.max(3000, Math.round(next * 100) / 100));
}

export function rigCost(r: Rig, owned: number) {
  return Math.ceil(r.cost * Math.pow(1.12, owned));
}

/** Advance by dt seconds (price held steady inside the step; call per second for walks). */
export function stepMiner(s: MinerState, dt: number): MinerState {
  if (!(dt > 0)) return s;
  const mined = Math.min(btcPerSecond(s) * dt, Math.max(0, walletCap(s) - s.btc));
  const bill = costPerSecond(s) * dt;
  const cash = s.cash - bill;
  const block = s.block + dt / BLOCK_SECONDS;
  return { ...s, btc: s.btc + mined, totalBtc: s.totalBtc + mined, cash, block, ts: s.ts };
}

export function sellBtc(s: MinerState, amount: number): MinerState | null {
  if (!(amount > 0) || amount > s.btc + 1e-12) return null;
  return { ...s, btc: Math.max(0, s.btc - amount), cash: s.cash + amount * s.price };
}

export function buyRig(s: MinerState, id: string): MinerState | null {
  const r = RIGS.find((x) => x.id === id);
  if (!r) return null;
  const cost = rigCost(r, s.counts[id] || 0);
  if (s.cash < cost) return null;
  return { ...s, cash: s.cash - cost, counts: { ...s.counts, [id]: (s.counts[id] || 0) + 1 } };
}

export function buyUpgrade(s: MinerState, id: string): MinerState | null {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u || s.upgrades.includes(id) || s.cash < u.cost) return null;
  return { ...s, cash: s.cash - u.cost, upgrades: [...s.upgrades, id] };
}

/** Bankrupt = no cash, no coins and no income to recover. */
export function isStuck(s: MinerState) {
  return s.cash < 0 && s.btc * s.price + s.cash < 0;
}
