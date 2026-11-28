import test from "node:test";
import assert from "node:assert/strict";
import { wrapWithPin, unwrapWithPin, validPin, lockoutLeft, shouldWipe, parseBlob, cleanAutoLock, shouldAutoLock } from "./e2eePin.ts";

test("pin shape", () => {
  assert.equal(validPin("1234"), true);
  assert.equal(validPin("12345678"), true);
  assert.equal(validPin("123"), false);
  assert.equal(validPin("12a4"), false);
  assert.equal(validPin(1234), false);
});
test("wrap and unwrap", async () => {
  const b = await wrapWithPin("4821", '{"d":"secret"}', "user-1", 100_000);
  assert.equal(await unwrapWithPin("4821", b, "user-1"), '{"d":"secret"}');
  assert.equal(await unwrapWithPin("4822", b, "user-1"), null);
  assert.equal(await unwrapWithPin("4821", b, "user-2"), null, "blob is bound to its account");
  assert.deepEqual(parseBlob(JSON.stringify(b)), b);
  assert.equal(parseBlob("{bad"), null);
  await assert.rejects(() => wrapWithPin("12", "x", "u"));
});
test("lockout and wipe", () => {
  assert.equal(lockoutLeft(4, 0, 1), 0);
  assert.equal(lockoutLeft(5, 1000, 11_000), 20_000);
  assert.equal(lockoutLeft(5, 1000, 40_000), 0);
  assert.equal(lockoutLeft(6, 1000, 2000), 0);
  assert.equal(shouldWipe(9), false);
  assert.equal(shouldWipe(10), true);
});
test("auto lock", () => {
  assert.equal(cleanAutoLock(5), 5);
  assert.equal(cleanAutoLock(7), 0);
  assert.equal(shouldAutoLock(5, 0, 5 * 60_000), true);
  assert.equal(shouldAutoLock(5, 0, 4 * 60_000), false);
  assert.equal(shouldAutoLock(0, 0, 1e9), false);
  assert.equal(shouldAutoLock(5, null, 1e9), false);
});
