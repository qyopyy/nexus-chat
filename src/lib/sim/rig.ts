/** Mining-room tycoon core: build PCs, add GPUs, outgrow rooms, fight heat/dust/power bills, difficulty and halvings. */

export type CaseDef = { id: string; name: string; emoji: string; cpu: number; watts: number; slots: number; cost: number };
export const CASES: CaseDef[] = [
  { id: "potato", name: "Potato PC", emoji: "🥔", cpu: 1, watts: 50, slots: 1, cost: 0 },
  { id: "office", name: "Office PC", emoji: "🖥️", cpu: 2, watts: 80, slots: 2, cost: 300 },
  { id: "gamer", name: "Gamer tower", emoji: "🎮", cpu: 3, watts: 150, slots: 4, cost: 1200 },
  { id: "work", name: "Workstation", emoji: "🧰", cpu: 5, watts: 250, slots: 6, cost: 4500 },
  { id: "rack", name: "Server rack", emoji: "🗄️", cpu: 8, watts: 400, slots: 8, cost: 16000 },
];

export type GpuDef = { id: string; name: string; emoji: string; hash: number; watts: number; cost: number };
export const GPUS: GpuDef[] = [
  { id: "gtx", name: "GTX 1060", emoji: "🟩", hash: 4, watts: 120, cost: 400 },
  { id: "rtx", name: "RTX 3070", emoji: "🟦", hash: 14, watts: 220, cost: 1500 },
  { id: "pro", name: "Pro 4090", emoji: "🟪", hash: 45, watts: 320, cost: 6000 },
  { id: "asic", name: "ASIC board", emoji: "🟥", hash: 160, watts: 500, cost: 22000 },
];

export type RoomDef = { id: string; name: string; emoji: string; slots: number; cool: number; cost: number };
export const ROOMS: RoomDef[] = [
  { id: "bedroom", name: "Bedroom corner", emoji: "🛏️", slots: 2, cool: 0.6, cost: 0 },
  { id: "garage", name: "Garage", emoji: "🚗", slots: 4, cool: 0.8, cost: 2500 },
  { id: "basement", name: "Basement", emoji: "🏚️", slots: 8, cool: 2.5, cost: 12000 },
  { id: "warehouse", name: "Warehouse", emoji: "🏭", slots: 16, cool: 8, cost: 60000 },
  { id: "dc", name: "Data center", emoji: "🏢", slots: 32, cool: 30, cost: 300000 },
];

export type Cooling = { id: string; name: string; emoji: string; kw: number; cost: number };
export const COOLING: Cooling[] = [
  { id: "fan", name: "Desk fan", emoji: "🌀", kw: 0.3, cost: 200 },
  { id: "ac", name: "Air conditioner", emoji: "❄️", kw: 1.5, cost: 2500 },
  { id: "chiller", name: "Industrial chiller", emoji: "🧊", kw: 6, cost: 20000 },
  { id: "immersion", name: "Immersion tank", emoji: "🛢️", kw: 20, cost: 120000 },
];

export type Upgrade = { id: string; name: string; desc: string; cost: number; kind: "hash" | "power" | "cap"; value: number };
export const UPGRADES: Upgrade[] = [
  { id: "pool", name: "Mining pool", desc: "+10% hashrate (pool luck)", cost: 1000, kind: "hash", value: 0.1 },
  { id: "oc", name: "Overclock firmware", desc: "+20% hashrate", cost: 8000, kind: "hash", value: 0.2 },
  { id: "psu", name: "Efficient PSUs", desc: "−15% power use", cost: 3000, kind: "power", value: 0.15 },
  { id: "solar", name: "Solar roof", desc: "−35% power use", cost: 40000, kind: "power", value: 0.35 },
  { id: "wallet", name: "Hardware wallet", desc: "+50 BTC wallet cap", cost: 900, kind: "cap", value: 50 },
];

export const BASE_RATE = 2e-8; // BTC / sec / hash at difficulty 1, before halvings
export const BLOCK_SECONDS = 30;
export const HALVING_BLOCKS = 120; // reward halves every hour of play
export const DIFF_GROWTH = 1.006;
export const ELEC_PER_KW_SEC = 0.004;
export const START_PRICE = 42000;
export const DUST_PER_SEC = 1 / 900; // fully dusty after 15 minutes
export const CLEAN_COST = 25; // per PC

export type Pc = { case: string; gpus: string[]; dust: number };
export type RigState = {
  cash: number;
  btc: number;
  price: number;
  block: number;
  totalBtc: number;
  room: number;
  pcs: Pc[];
  cooling: Record<string, number>;
  upgrades: string[];
  outage: number;
  ts: number;
};

export function newRig(now = Date.now()): RigState {
  return { cash: 150, btc: 0, price: START_PRICE, block: 0, totalBtc: 0, room: 0, pcs: [{ case: "potato", gpus: [], dust: 0 }], cooling: {}, upgrades: [], outage: 0, ts: now };
}

const caseOf = (id: string) => CASES.find((c) => c.id === id)!;
const gpuOf = (id: string) => GPUS.find((g) => g.id === id)!;
const sumUp = (s: RigState, kind: Upgrade["kind"]) => UPGRADES.filter((u) => s.upgrades.includes(u.id) && u.kind === kind).reduce((a, u) => a + u.value, 0);

export function slots(s: RigState) {
  return ROOMS[s.room].slots;
}
export function pcHash(pc: Pc) {
  const raw = caseOf(pc.case).cpu + pc.gpus.reduce((a, g) => a + gpuOf(g).hash, 0);
  return raw * (1 - Math.min(1, Math.max(0, pc.dust)) * 0.3);
}
export function pcWatts(pc: Pc) {
  return caseOf(pc.case).watts + pc.gpus.reduce((a, g) => a + gpuOf(g).watts, 0);
}
export function rawPowerKw(s: RigState) {
  return s.pcs.reduce((a, p) => a + pcWatts(p), 0) / 1000;
}
export function powerKw(s: RigState) {
  return rawPowerKw(s) * (1 - Math.min(0.75, sumUp(s, "power")));
}
export function coolCapacity(s: RigState) {
  return ROOMS[s.room].cool + COOLING.reduce((a, c) => a + c.kw * (s.cooling[c.id] || 0), 0);
}
/** 1 = fully cooled; below 1 the chips throttle. */
export function heatEff(s: RigState) {
  const load = rawPowerKw(s);
  if (load <= 0 || load <= coolCapacity(s)) return 1;
  return Math.max(0.2, Math.pow(coolCapacity(s) / load, 1.5));
}
export function hashPower(s: RigState) {
  return s.pcs.reduce((a, p) => a + pcHash(p), 0) * (1 + sumUp(s, "hash")) * heatEff(s);
}
export function difficulty(block: number) {
  return Math.pow(DIFF_GROWTH, Math.max(0, block));
}
export function rewardFactor(block: number) {
  return Math.pow(0.5, Math.floor(Math.max(0, block) / HALVING_BLOCKS));
}
export function btcPerSecond(s: RigState) {
  if (s.outage > 0) return 0;
  return (hashPower(s) * BASE_RATE * rewardFactor(s.block)) / difficulty(s.block);
}
export function costPerSecond(s: RigState) {
  if (s.outage > 0) return 0;
  return powerKw(s) * ELEC_PER_KW_SEC;
}
export function walletCap(s: RigState) {
  return 25 + sumUp(s, "cap");
}
export function avgDust(s: RigState) {
  return s.pcs.length ? s.pcs.reduce((a, p) => a + p.dust, 0) / s.pcs.length : 0;
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

/** Advance by dt seconds. */
export function stepRig(s: RigState, dt: number): RigState {
  if (!(dt > 0)) return s;
  const running = Math.max(0, dt - Math.min(dt, s.outage)); // seconds with power
  const mined = Math.min((btcPerSecond({ ...s, outage: 0 }) * running), Math.max(0, walletCap(s) - s.btc));
  const bill = costPerSecond({ ...s, outage: 0 }) * running;
  return {
    ...s,
    btc: s.btc + mined,
    totalBtc: s.totalBtc + mined,
    cash: s.cash - bill,
    block: s.block + dt / BLOCK_SECONDS,
    outage: Math.max(0, s.outage - dt),
    pcs: s.pcs.map((p) => ({ ...p, dust: Math.min(1, p.dust + dt * DUST_PER_SEC) })),
  };
}

export function pcCost(s: RigState, caseId: string) {
  const c = CASES.find((x) => x.id === caseId);
  return c ? Math.ceil(c.cost * (1 + 0.08 * s.pcs.length)) : Infinity;
}
export function buyPc(s: RigState, caseId: string): RigState | null {
  const c = CASES.find((x) => x.id === caseId);
  if (!c || s.pcs.length >= slots(s)) return null;
  const cost = pcCost(s, caseId);
  if (s.cash < cost) return null;
  return { ...s, cash: s.cash - cost, pcs: [...s.pcs, { case: caseId, gpus: [], dust: 0 }] };
}
export function buyGpu(s: RigState, pcIdx: number, gpuId: string): RigState | null {
  const pc = s.pcs[pcIdx];
  const g = GPUS.find((x) => x.id === gpuId);
  if (!pc || !g || pc.gpus.length >= caseOf(pc.case).slots || s.cash < g.cost) return null;
  return { ...s, cash: s.cash - g.cost, pcs: s.pcs.map((p, i) => (i === pcIdx ? { ...p, gpus: [...p.gpus, gpuId] } : p)) };
}
/** Sell a PC for 40% of what its parts cost (frees the slot). */
export function scrapPc(s: RigState, pcIdx: number): RigState | null {
  const pc = s.pcs[pcIdx];
  if (!pc || s.pcs.length <= 1) return null;
  const value = Math.floor(0.4 * (caseOf(pc.case).cost + pc.gpus.reduce((a, g) => a + gpuOf(g).cost, 0)));
  return { ...s, cash: s.cash + value, pcs: s.pcs.filter((_, i) => i !== pcIdx) };
}
export function cleanCost(s: RigState) {
  return s.pcs.filter((p) => p.dust > 0.05).length * CLEAN_COST;
}
export function cleanAll(s: RigState): RigState | null {
  const c = cleanCost(s);
  if (c <= 0 || s.cash < c) return null;
  return { ...s, cash: s.cash - c, pcs: s.pcs.map((p) => ({ ...p, dust: 0 })) };
}
export function nextRoom(s: RigState) {
  return ROOMS[s.room + 1];
}
export function upgradeRoom(s: RigState): RigState | null {
  const r = nextRoom(s);
  if (!r || s.cash < r.cost) return null;
  return { ...s, cash: s.cash - r.cost, room: s.room + 1 };
}
export function coolingCost(c: Cooling, owned: number) {
  return Math.ceil(c.cost * Math.pow(1.25, owned));
}
export function buyCooling(s: RigState, id: string): RigState | null {
  const c = COOLING.find((x) => x.id === id);
  if (!c) return null;
  const cost = coolingCost(c, s.cooling[id] || 0);
  if (s.cash < cost) return null;
  return { ...s, cash: s.cash - cost, cooling: { ...s.cooling, [id]: (s.cooling[id] || 0) + 1 } };
}
export function buyUpgrade(s: RigState, id: string): RigState | null {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u || s.upgrades.includes(id) || s.cash < u.cost) return null;
  return { ...s, cash: s.cash - u.cost, upgrades: [...s.upgrades, id] };
}
export function sellBtc(s: RigState, amount: number): RigState | null {
  if (!(amount > 0) || amount > s.btc + 1e-12) return null;
  return { ...s, btc: Math.max(0, s.btc - amount), cash: s.cash + amount * s.price };
}

export type RigEvent = { text: string; state: RigState } | null;
/** Random event roll (call about once per second; `chance` is the per-call probability). */
export function rollEvent(s: RigState, rng: () => number, chance = 0.004): RigEvent {
  if (rng() >= chance) return null;
  const k = Math.floor(rng() * 5);
  if (k === 0 && s.outage <= 0) {
    const secs = 15 + Math.floor(rng() * 20);
    return { text: `⚡ Power cut! Rigs are offline for ${secs}s.`, state: { ...s, outage: secs } };
  }
  if (k === 1) return { text: "📈 Crypto bull run — BTC jumps 12%!", state: { ...s, price: Math.min(500000, Math.round(s.price * 1.12 * 100) / 100) } };
  if (k === 2) return { text: "📉 Market dip — BTC drops 10%.", state: { ...s, price: Math.max(3000, Math.round(s.price * 0.9 * 100) / 100) } };
  if (k === 3) {
    const bonus = Math.round(40 + Math.sqrt(Math.max(1, s.totalBtc * s.price)) * 2);
    return { text: `🎬 Your mining-room video went viral — sponsor pays $${bonus}!`, state: { ...s, cash: s.cash + bonus } };
  }
  if (k === 4 && s.pcs.length) {
    const i = Math.floor(rng() * s.pcs.length);
    return { text: `🌫️ PC #${i + 1} got extra dusty.`, state: { ...s, pcs: s.pcs.map((p, j) => (j === i ? { ...p, dust: Math.min(1, p.dust + 0.3) } : p)) } };
  }
  return null;
}
