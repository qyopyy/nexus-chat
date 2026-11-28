import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { argon2id, blake2b } from "./passCrypto.ts";

const hex = (u: Uint8Array) => Buffer.from(u).toString("hex");
const fill = (n: number, b: number) => new Uint8Array(n).fill(b);

test("blake2b-512 matches node for several lengths", () => {
  for (const n of [0, 1, 3, 127, 128, 129, 255, 256, 1000]) {
    const data = new Uint8Array(n).map((_, i) => (i * 7 + 3) & 255);
    assert.equal(hex(blake2b(data, 64)), createHash("blake2b512").update(data).digest("hex"), `len ${n}`);
  }
});

test("RFC 9106 section 5.3 Argon2id vector (secret + associated data, 4 lanes)", async () => {
  const tag = await argon2id(fill(32, 1), fill(16, 2), { m: 32, t: 3, p: 4, len: 32, secret: fill(8, 3), ad: fill(12, 4) });
  assert.equal(hex(tag), "0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659");
});

test("reference vector: password/somesalt, m=64 MiB, t=2, p=1", async () => {
  const enc = new TextEncoder();
  const tag = await argon2id(enc.encode("password"), enc.encode("somesalt"), { m: 65536, t: 2, p: 1, len: 32 });
  assert.equal(hex(tag), "09316115d5cf24ed5a15a31a3ba326e5cf32edc24702987c02b6566f61913cf7");
});

test("different salt or password gives a different key; long tag works", async () => {
  const enc = new TextEncoder();
  const a = await argon2id(enc.encode("pw"), enc.encode("saltsalt"), { m: 64, t: 1, p: 1 });
  const b = await argon2id(enc.encode("pw"), enc.encode("saltsal2"), { m: 64, t: 1, p: 1 });
  const c = await argon2id(enc.encode("px"), enc.encode("saltsalt"), { m: 64, t: 1, p: 1 });
  assert.notEqual(hex(a), hex(b));
  assert.notEqual(hex(a), hex(c));
  const long = await argon2id(enc.encode("pw"), enc.encode("saltsalt"), { m: 64, t: 1, p: 1, len: 100 });
  assert.equal(long.length, 100);
  await assert.rejects(() => argon2id(enc.encode("pw"), enc.encode("short"), { m: 64, t: 1, p: 1 }));
});
