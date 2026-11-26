import assert from "node:assert/strict";
import test from "node:test";
import * as I from "./idle.ts";
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
