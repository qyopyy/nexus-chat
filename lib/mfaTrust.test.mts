import test from "node:test";
import assert from "node:assert/strict";
import { TRUST_MS, TRUST_DAYS, parseTrust, isTrusted, trust, forget } from "./mfaTrust.ts";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const NOW = 1_800_000_000_000;

test("30 days, remembered per account", () => {
  assert.equal(TRUST_DAYS, 30);
  const m = trust({}, U1, NOW);
  assert.equal(m[U1], NOW + TRUST_MS);
  assert.equal(isTrusted(m, U1, NOW + 1), true);
  assert.equal(isTrusted(m, U2, NOW + 1), false, "another account on this device still gets asked");
  assert.equal(isTrusted(m, U1, NOW + TRUST_MS), false, "ends after 30 days");
  assert.equal(isTrusted(m, U1, NOW + TRUST_MS - 1), true);
  assert.equal(isTrusted(m, null, NOW), false);
  assert.equal(isTrusted(m, undefined, NOW), false);
});

test("forget removes only that account", () => {
  const m = trust(trust({}, U1, NOW), U2, NOW);
  const f = forget(m, U1);
  assert.equal(isTrusted(f, U1, NOW + 1), false);
  assert.equal(isTrusted(f, U2, NOW + 1), true);
  assert.deepEqual(forget(m, null), m);
});

test("stored data is cleaned on the way in", () => {
  assert.deepEqual(parseTrust(null, NOW), {});
  assert.deepEqual(parseTrust("{nope", NOW), {});
  assert.deepEqual(parseTrust("[1]", NOW), {});
  const far = NOW + TRUST_MS * 5;
  const raw = JSON.stringify({ [U1]: NOW + 1000, [U2]: NOW - 1, "not-an-id": NOW + 1000, "33333333-3333-4333-8333-333333333333": far, "44444444-4444-4444-8444-444444444444": "soon" });
  assert.deepEqual(parseTrust(raw, NOW), { [U1]: NOW + 1000 }, "ended, unknown ids, absurdly long and non-numbers are all dropped");
  assert.deepEqual(parseTrust(JSON.stringify(trust({}, U1, NOW)), NOW), trust({}, U1, NOW));
  assert.deepEqual(trust({}, "bad", NOW), {});
});
