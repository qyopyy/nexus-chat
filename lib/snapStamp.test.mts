import test from "node:test";
import assert from "node:assert/strict";
import { stampText, stampSize } from "./snapStamp.ts";

test("stamp text", () => {
  assert.equal(stampText(new Date(2026, 10, 28, 9, 5)), "2026-11-28  09:05");
});
test("stamp size", () => {
  assert.equal(stampSize(100), 12);
  assert.equal(stampSize(3800), 100);
});
