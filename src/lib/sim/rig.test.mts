import assert from "node:assert/strict";
import test from "node:test";
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

import * as R from "./rig.ts";

test("starting room mines a little and pays power", () => {
  const s = R.newRig(0);
  assert.equal(R.hashPower(s), 1);
  assert.ok(R.btcPerSecond(s) > 0 && R.costPerSecond(s) > 0);
  assert.equal(R.slots(s), 2);
});
test("buying PCs respects slots, cash and cost scaling", () => {
  let s = { ...R.newRig(0), cash: 1e6 };
  s = R.buyPc(s, "office")!;
  assert.equal(s.pcs.length, 2);
  assert.equal(R.buyPc(s, "office"), null); // room is full (2 slots)
  assert.equal(R.buyPc({ ...R.newRig(0) }, "gamer"), null); // can't afford
  assert.equal(R.buyPc(s, "nope"), null);
  assert.ok(R.pcCost(s, "gamer") > 1200);
});
test("GPUs add hash and power up to the case's slots", () => {
  let s = { ...R.newRig(0), cash: 1e6 };
  const base = R.hashPower(s);
  s = R.buyGpu(s, 0, "gtx")!;
  assert.ok(R.hashPower(s) > base && R.powerKw(s) > 0.05);
  assert.equal(R.buyGpu(s, 0, "gtx"), null); // potato PC has one slot
  assert.equal(R.buyGpu(s, 5, "gtx"), null);
  assert.equal(R.buyGpu(s, 0, "zzz"), null);
  assert.equal(R.buyGpu({ ...s, cash: 0 }, 0, "gtx"), null);
});
test("overheating throttles hash; cooling and bigger rooms fix it", () => {
  let s = { ...R.newRig(0), cash: 1e7, room: 1 };
  s = { ...s, pcs: Array.from({ length: 4 }, () => ({ case: "gamer", gpus: ["rtx", "rtx", "rtx", "rtx"], dust: 0 })) };
  assert.ok(R.heatEff(s) < 1);
  const hot = R.hashPower(s);
  const cooled = R.buyCooling(s, "immersion")!;
  assert.equal(R.heatEff(cooled), 1);
  assert.ok(R.hashPower(cooled) > hot);
  assert.ok(R.heatEff({ ...s, room: 4 }) > R.heatEff(s));
  assert.ok(R.heatEff(s) >= 0.2);
});
test("dust builds up, cuts hash and can be cleaned", () => {
  let s = R.newRig(0);
  const clean = R.hashPower(s);
  s = R.stepRig({ ...s, cash: 1000 }, 900);
  assert.equal(s.pcs[0].dust, 1);
  assert.ok(R.hashPower(s) < clean);
  assert.ok(R.cleanCost(s) > 0);
  const c = R.cleanAll(s)!;
  assert.equal(c.pcs[0].dust, 0);
  assert.equal(R.cleanAll(c), null); // nothing to clean
  assert.equal(R.cleanAll({ ...s, cash: 0 }), null);
});
test("halving and difficulty reduce income over time", () => {
  assert.equal(R.rewardFactor(0), 1);
  assert.equal(R.rewardFactor(R.HALVING_BLOCKS), 0.5);
  assert.equal(R.rewardFactor(R.HALVING_BLOCKS * 2 + 5), 0.25);
  assert.ok(R.difficulty(100) > R.difficulty(10));
  const a = R.newRig(0);
  assert.ok(R.btcPerSecond({ ...a, block: 300 }) < R.btcPerSecond(a));
});
test("stepping mines, bills power, respects the wallet cap and outages", () => {
  const s = { ...R.newRig(0), cash: 500, pcs: [{ case: "rack", gpus: Array(8).fill("asic"), dust: 0 }], room: 4 };
  const t = R.stepRig(s, 10);
  assert.ok(t.btc > 0 && t.cash < s.cash && t.block > s.block);
  assert.equal(R.stepRig({ ...s, btc: R.walletCap(s) }, 100).btc, R.walletCap(s));
  assert.equal(R.stepRig(s, 0), s);
  const out = R.stepRig({ ...s, outage: 10 }, 10);
  assert.equal(out.btc, 0);
  assert.equal(out.cash, 500);
  assert.equal(out.outage, 0);
  const half = R.stepRig({ ...s, outage: 5 }, 10);
  assert.ok(half.btc > 0 && half.btc < t.btc);
});
test("rooms, upgrades, scrapping and selling", () => {
  let s = { ...R.newRig(0), cash: 1e6 };
  s = R.upgradeRoom(s)!;
  assert.equal(R.slots(s), 4);
  assert.equal(R.upgradeRoom({ ...s, room: 4 }), null);
  assert.equal(R.upgradeRoom({ ...s, cash: 0 }), null);
  s = R.buyUpgrade(s, "pool")!;
  assert.ok(Math.abs(R.hashPower(s) - 1.1) < 1e-9);
  assert.equal(R.buyUpgrade(s, "pool"), null);
  const kw = R.powerKw(s);
  s = R.buyUpgrade(s, "psu")!;
  assert.ok(R.powerKw(s) < kw);
  assert.equal(R.walletCap(s), 25);
  s = R.buyUpgrade(s, "wallet")!;
  assert.equal(R.walletCap(s), 75);
  s = R.buyPc(s, "office")!;
  const before = s.cash;
  const scr = R.scrapPc(s, 1)!;
  assert.equal(scr.cash, before + 120);
  assert.equal(R.scrapPc(R.newRig(0), 0), null); // can't scrap the last PC
  const sold = R.sellBtc({ ...s, btc: 2, price: 50000, cash: 0 }, 1.5)!;
  assert.equal(sold.cash, 75000);
  assert.equal(R.sellBtc(s, 1), null);
});
test("random events are bounded and deterministic", () => {
  const s = { ...R.newRig(0), cash: 100 };
  assert.equal(R.rollEvent(s, () => 0.99), null);
  const seen = new Set<string>();
  const rng = seeded(21);
  for (let i = 0; i < 400; i++) {
    const e = R.rollEvent(s, rng, 1);
    if (e) {
      seen.add(e.text.slice(0, 2));
      assert.ok(e.state.price >= 3000 && e.state.price <= 500000 && e.state.cash >= 100);
      assert.ok(e.state.pcs.every((p) => p.dust <= 1));
    }
  }
  assert.ok(seen.size >= 4);
});
test("price walk stays bounded and mean-reverts", () => {
  const rng = seeded(5);
  let p = R.START_PRICE;
  let lo = Infinity;
  let hi = 0;
  for (let i = 0; i < 20000; i++) {
    p = R.nextPrice(p, rng);
    lo = Math.min(lo, p);
    hi = Math.max(hi, p);
  }
  assert.ok(lo >= 3000 && hi <= 500000);
  const calm = () => {
    const seq = [0.5, 0.25, 0.5];
    let i = 0;
    return () => seq[i++ % 3];
  };
  assert.ok(R.nextPrice(400000, calm()) < 400000);
  assert.ok(R.nextPrice(6000, calm()) > 6000);
});
