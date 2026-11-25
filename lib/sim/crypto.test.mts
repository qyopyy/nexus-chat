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

import * as K from "./crypto.ts";

const start = Object.fromEntries(K.COINS.map((c) => [c.sym, c.start]));

test("market steps are deterministic, positive and respond to news", () => {
  const a = K.stepMarket(start, seeded(7));
  const b = K.stepMarket(start, seeded(7));
  assert.deepEqual(a, b);
  let p = start;
  const rng = seeded(11);
  for (let i = 0; i < 3000; i++) p = K.stepMarket(p, rng).prices;
  for (const c of K.COINS) assert.ok(Number.isFinite(p[c.sym]) && p[c.sym] >= c.start * 0.02);
  assert.ok(K.stepMarket(start, () => 0.0001, 1).event);
});
test("gaussian is roughly standard normal", () => {
  const rng = seeded(3);
  const xs = Array.from({ length: 20000 }, () => K.gaussian(rng));
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  assert.ok(Math.abs(mean) < 0.03 && Math.abs(sd - 1) < 0.03);
});
test("buying fractional coins with dollars", () => {
  let p = K.newPortfolio(1000);
  const r = K.buyUsd(p, "BTC", 500, 50000);
  assert.ok(!K.isError(r));
  p = r as K.Portfolio;
  assert.equal(p.cash, 500);
  assert.equal(p.fees, 0.5);
  assert.ok(Math.abs(p.positions.BTC.qty - 499.5 / 50000) < 1e-12);
  assert.ok(K.isError(K.buyUsd(p, "BTC", 501, 50000)));
  assert.ok(K.isError(K.buyUsd(p, "BTC", 0.5, 50000)));
  assert.ok(K.isError(K.buyUsd(p, "NOPE", 10, 1)));
  assert.ok(K.isError(K.buyUsd(p, "BTC", 10, 0)));
});
test("selling partial, percent and all", () => {
  let p = K.buyUsd(K.newPortfolio(1000), "ETH", 1000, 2000) as K.Portfolio;
  assert.equal(p.cash, 0);
  const half = K.sellPct(p, "ETH", 0.5, 2000) as K.Portfolio;
  assert.ok(Math.abs(half.positions.ETH.qty - p.positions.ETH.qty / 2) < 1e-12);
  assert.ok(half.cash > 498 && half.cash < 500);
  const all = K.sellPct(half, "ETH", 1, 4000) as K.Portfolio;
  assert.equal(all.positions.ETH, undefined);
  assert.ok(all.realized > 400); // price doubled on the second half
  assert.ok(K.isError(K.sellQty(p, "ETH", 5, 2000)));
  assert.ok(K.isError(K.sellQty(p, "ETH", 0, 2000)));
  assert.ok(K.isError(K.sellPct(p, "BTC", 1, 2000) as { error: string }));
  p = K.newPortfolio(10);
  assert.ok(K.isError(K.sellQty(p, "ETH", 1, 1)));
});
test("net worth and formatting", () => {
  const p = K.buyUsd(K.newPortfolio(1000), "SOL", 400, 100) as K.Portfolio;
  const nw = K.netWorth(p, { SOL: 150 });
  assert.ok(nw > 600 + 599 * 0.999 && nw < 600 + 600);
  assert.equal(K.fmtPrice(68000), "$68,000.00");
  assert.equal(K.fmtPrice(0.1234), "$0.1234");
  assert.equal(K.fmtQty(0.001234567), "0.001235");
});
