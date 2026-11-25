import assert from "node:assert/strict";
import test from "node:test";
import * as I from "./idle.ts";
import * as K from "./market.ts";
import * as M from "./miner.ts";
import * as Lm from "./lemonade.ts";

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CFG: I.IdleConfig = {
  id: "t",
  title: "T",
  emoji: "x",
  unit: "$",
  tapName: "tap",
  tapValue: 1,
  gens: [
    { id: "a", name: "A", emoji: "a", baseCost: 10, growth: 1.15, rate: 1 },
    { id: "b", name: "B", emoji: "b", baseCost: 100, growth: 1.2, rate: 10 },
  ],
  upgrades: [
    { id: "u1", name: "A x2", desc: "", cost: 50, mult: 2, gen: "a", needs: 2 },
    { id: "g1", name: "All x3", desc: "", cost: 500, mult: 3 },
  ],
  prestigeName: "p",
  prestigeBase: 1000,
};

/* ───── idle ───── */
test("genCost matches repeated single purchases", () => {
  const g = CFG.gens[0];
  let sum = 0;
  for (let i = 0; i < 5; i++) sum += I.genCost(g, 3 + i, 1);
  assert.ok(Math.abs(sum - I.genCost(g, 3, 5)) < 1e-9);
  assert.equal(I.genCost(g, 0, 0), 0);
});
test("maxAffordable is the exact maximum", () => {
  const g = CFG.gens[0];
  for (const cash of [0, 9, 10, 100, 12345]) {
    const n = I.maxAffordable(g, 2, cash);
    assert.ok(I.genCost(g, 2, n) <= cash);
    assert.ok(I.genCost(g, 2, n + 1) > cash);
  }
});
test("production, upgrades and prestige multiply", () => {
  let s = I.newState(0);
  s = { ...s, cash: 1e6, counts: { a: 2, b: 1 } };
  assert.equal(I.perSecond(CFG, s), 12);
  s = I.buyUpgrade(CFG, s, "u1")!;
  assert.equal(I.perSecond(CFG, s), 2 * 2 + 10);
  s = I.buyUpgrade(CFG, s, "g1")!;
  assert.equal(I.perSecond(CFG, s), 14 * 3);
  assert.equal(I.perSecond(CFG, { ...s, prestige: 2 }), 14 * 3 * 1.3);
  assert.equal(I.buyUpgrade(CFG, s, "u1"), null); // already owned
});
test("upgrade requirements and affordability", () => {
  const s = { ...I.newState(0), cash: 1000, counts: { a: 1 } };
  assert.equal(I.buyUpgrade(CFG, s, "u1"), null); // needs 2 of A
  assert.equal(I.buyUpgrade({ ...CFG }, { ...s, cash: 1, counts: { a: 5 } }, "u1"), null); // too poor
  assert.equal(I.buyGen(CFG, { ...s, cash: 5 }, "a", 1), null);
  const bought = I.buyGen(CFG, s, "a", 3)!;
  assert.equal(bought.counts.a, 4);
  assert.ok(Math.abs(bought.cash - (1000 - I.genCost(CFG.gens[0], 1, 3))) < 1e-9);
});
test("tick, tap and offline progress", () => {
  const s = { ...I.newState(1000), counts: { a: 10 } };
  const t = I.tick(CFG, s, 2);
  assert.equal(t.cash, 20);
  assert.equal(t.total, 20);
  assert.equal(I.tick(CFG, s, -5), s);
  assert.equal(I.tapGain(CFG, s), 1 + 0.5);
  const off = I.offlineGain(CFG, s, 1000 + 100 * 1000);
  assert.equal(off.seconds, 100);
  assert.equal(off.gain, 10 * 100 * 0.5);
  assert.equal(I.offlineGain(CFG, s, 1000 + 99 * 3600 * 1000).seconds, I.OFFLINE_CAP_SEC);
  assert.equal(I.offlineGain(CFG, s, 0).seconds, 0);
});
test("prestige", () => {
  const s = { ...I.newState(0), total: 4000 };
  assert.equal(I.prestigeEarned(CFG, 4000), 2);
  assert.equal(I.prestigeAvailable(CFG, s), 2);
  const p = I.doPrestige(CFG, { ...s, cash: 99, counts: { a: 3 }, upgrades: ["g1"] }, 5)!;
  assert.equal(p.prestige, 2);
  assert.equal(p.cash, 0);
  assert.deepEqual(p.counts, {});
  assert.equal(I.prestigeAvailable(CFG, { ...p, total: 4000 }), 0);
  assert.equal(I.doPrestige(CFG, I.newState(0)), null);
});
test("number formatting", () => {
  assert.equal(I.fmt(0), "0");
  assert.equal(I.fmt(5.5), "5.5");
  assert.equal(I.fmt(999), "999");
  assert.equal(I.fmt(1500), "1.50K");
  assert.equal(I.fmt(2_500_000), "2.50M");
  assert.equal(I.fmt(1e12), "1.00T");
  assert.equal(I.fmt(-1500), "-1.50K");
  assert.equal(I.fmt(Infinity), "∞");
});

/* ───── market ───── */
test("market steps are deterministic, positive and respond to news", () => {
  const start = Object.fromEntries(K.STOCKS.map((s) => [s.sym, s.start]));
  const a = K.stepMarket(start, seeded(7));
  const b = K.stepMarket(start, seeded(7));
  assert.deepEqual(a, b);
  for (const v of Object.values(a.prices)) assert.ok(v >= 0.5);
  let p = start;
  const rng = seeded(11);
  for (let i = 0; i < 2000; i++) p = K.stepMarket(p, rng).prices;
  for (const v of Object.values(p)) assert.ok(Number.isFinite(v) && v >= 0.5);
  // force a news event
  const forced = K.stepMarket(start, () => 0.0001, 1);
  assert.ok(forced.event);
});
test("gaussian is roughly standard normal", () => {
  const rng = seeded(3);
  const xs = Array.from({ length: 20000 }, () => K.gaussian(rng));
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  assert.ok(Math.abs(mean) < 0.03);
  assert.ok(Math.abs(sd - 1) < 0.03);
});
test("buying and selling shares", () => {
  let p = K.newPortfolio(1000);
  const r1 = K.buy(p, "NXS", 5, 100);
  assert.ok(!K.isError(r1));
  p = r1 as K.Portfolio;
  assert.equal(p.cash, 1000 - 500 - 0.5);
  assert.equal(p.positions.NXS.qty, 5);
  p = K.buy(p, "NXS", 5, 80) as K.Portfolio;
  assert.equal(p.positions.NXS.avg, 90);
  assert.ok(K.isError(K.buy(p, "NXS", 1000, 100)));
  assert.ok(K.isError(K.buy(p, "NXS", 0, 100)));
  assert.ok(K.isError(K.buy(p, "NXS", 1.5, 100)));
  assert.ok(K.isError(K.sell(p, "NXS", 11, 100)));
  assert.ok(K.isError(K.sell(p, "AIAI", 1, 100)));
  const s = K.sell(p, "NXS", 10, 110) as K.Portfolio;
  assert.equal(s.positions.NXS, undefined);
  assert.ok(s.realized > 190 && s.realized < 200); // (110-90)*10 minus fee
  assert.ok(s.cash > p.cash + 1090);
});
test("net worth and max buyable", () => {
  const p = K.buy(K.newPortfolio(1000), "BEAT", 4, 50) as K.Portfolio;
  assert.equal(K.netWorth(p, { BEAT: 60 }), p.cash + 240);
  assert.equal(K.maxBuyable(1000, 100), 9);
  assert.equal(K.maxBuyable(1000, 0), 0);
  assert.ok(K.maxBuyable(K.round2(100 * (1 + K.FEE_RATE)), 100) >= 1);
});

/* ───── miner ───── */
test("miner economics", () => {
  const s = M.newMiner(0);
  assert.equal(M.hashPower(s), 1);
  assert.ok(M.btcPerSecond(s) > 0);
  assert.ok(M.costPerSecond(s) > 0);
  const gpu = M.buyRig({ ...s, cash: 5000 }, "gpu")!;
  assert.ok(M.hashPower(gpu) > M.hashPower(s));
  assert.ok(M.powerKw(gpu) > M.powerKw(s));
  assert.equal(M.buyRig(s, "gpu"), null); // can't afford
  assert.equal(M.buyRig(s, "nope"), null);
});
test("halving and difficulty reduce income over time", () => {
  assert.equal(M.rewardFactor(0), 1);
  assert.equal(M.rewardFactor(M.HALVING_BLOCKS), 0.5);
  assert.equal(M.rewardFactor(M.HALVING_BLOCKS * 2 + 5), 0.25);
  assert.ok(M.difficulty(100) > M.difficulty(10));
  const a = M.newMiner(0);
  const b = { ...a, block: 500 };
  assert.ok(M.btcPerSecond(b) < M.btcPerSecond(a));
});
test("upgrades stack and power savings are capped", () => {
  let s = { ...M.newMiner(0), cash: 1e9 };
  const base = M.hashPower(s);
  s = M.buyUpgrade(s, "fans")!;
  assert.ok(Math.abs(M.hashPower(s) - base * 1.08) < 1e-9);
  assert.equal(M.buyUpgrade(s, "fans"), null);
  const kw = M.powerKw(s);
  s = M.buyUpgrade(s, "psu")!;
  assert.ok(M.powerKw(s) < kw);
  assert.equal(M.walletCap(s), 25);
  s = M.buyUpgrade(s, "storage")!;
  assert.equal(M.walletCap(s), 75);
});
test("stepping mines coins, pays power, respects the wallet cap", () => {
  const s = { ...M.newMiner(0), counts: { farm: 5 }, cash: 0 };
  const t = M.stepMiner(s, 10);
  assert.ok(t.btc > 0 && t.cash < 0);
  assert.ok(t.block > s.block);
  const full = { ...s, btc: M.walletCap(s) };
  assert.equal(M.stepMiner(full, 100).btc, M.walletCap(s));
  assert.equal(M.stepMiner(s, 0), s);
});
test("selling coins", () => {
  const s = { ...M.newMiner(0), btc: 2, price: 50000, cash: 0 };
  const t = M.sellBtc(s, 1.5)!;
  assert.equal(t.cash, 75000);
  assert.equal(t.btc, 0.5);
  assert.equal(M.sellBtc(s, 3), null);
  assert.equal(M.sellBtc(s, 0), null);
});
test("price walk stays bounded and mean-reverts", () => {
  const rng = seeded(5);
  let p = M.START_PRICE;
  let lo = Infinity;
  let hi = 0;
  for (let i = 0; i < 20000; i++) {
    p = M.nextPrice(p, rng);
    lo = Math.min(lo, p);
    hi = Math.max(hi, p);
  }
  assert.ok(lo >= 3000 && hi <= 500000);
  const calm = () => {
    const seq = [0.5, 0.25, 0.5]; // zero-noise draw: cos(2π·0.25) = 0, no jolt
    let i = 0;
    return () => seq[i++ % 3];
  };
  assert.ok(M.nextPrice(400000, calm()) < 400000); // pulled back down
  assert.ok(M.nextPrice(6000, calm()) > 6000); // pulled back up
});

/* ───── lemonade ───── */
test("lemonade demand falls with price and rain", () => {
  assert.ok(Lm.demand("Sunny", 0.5, 50, 0) > Lm.demand("Sunny", 2, 50, 0));
  assert.ok(Lm.demand("Hot", 1, 50, 0) > Lm.demand("Rainy", 1, 50, 0));
  assert.ok(Lm.demand("Sunny", 1, 90, 0) > Lm.demand("Sunny", 1, 10, 0));
  assert.ok(Lm.demand("Sunny", 1, 50, 3) > Lm.demand("Sunny", 1, 50, 0));
  assert.equal(Lm.demand("Sunny", 5, 50, 0), 0);
});
test("lemonade day simulation", () => {
  let s = Lm.newStand();
  s = Lm.buyPacks(s, 2)!;
  assert.equal(s.supplies, 50);
  assert.equal(s.cash, 30 - 9);
  assert.equal(Lm.buyPacks(s, 100), null);
  const r = Lm.simulateDay(s, { weather: "Hot", price: 1, marketing: 0 }, () => 0.5);
  assert.ok(r.sold > 0 && r.sold <= 50);
  assert.equal(r.stand.supplies, 50 - r.sold);
  assert.equal(r.stand.day, 2);
  assert.ok(r.stand.cash > s.cash);
  const broke = Lm.simulateDay({ ...s, supplies: 0 }, { weather: "Hot", price: 1, marketing: 0 }, () => 0.5);
  assert.equal(broke.sold, 0);
  assert.ok(broke.missed > 0);
  assert.ok(broke.stand.reputation <= s.reputation);
  assert.ok(Lm.WEATHERS.includes(Lm.pickWeather(() => 0.99)));
});
