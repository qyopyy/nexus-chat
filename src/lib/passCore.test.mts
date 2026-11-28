import test from "node:test";
import assert from "node:assert/strict";
import { KDF_PIN, checkKdf, decryptExport, encryptExport, newKdf, newVaultKey, openJson, sameText, sealJson, unwrapVaultKey, wrapVaultKey } from "./passCrypto.ts";
import { base32Decode, base32Encode, groupCode, hotp, parseTotp, ringFraction, secondsLeft, totpNow } from "./passTotp.ts";
import { WORDS, DEFAULT_PHRASE, DEFAULT_PW, genPassphrase, genPassword, passphraseBits, passwordBits, randomInt, strengthOf } from "./passGen.ts";
import { blankItem, cleanItem, dedupe, exportCsv, exportJson, filterItems, hostOf, importAny, parseCsv, safeUrl } from "./passItems.ts";

const fast = { m: 64, t: 1, p: 1 };

test("vault key wrap: right password opens, wrong does not; items bound to their id", async () => {
  const kdf = newKdf(fast);
  const vk = newVaultKey();
  const wrapped = await wrapVaultKey(vk, "correct horse", kdf);
  assert.deepEqual(await unwrapVaultKey(wrapped, "correct horse", kdf), vk);
  assert.equal(await unwrapVaultKey(wrapped, "wrong", kdf), null);
  const sealed = await sealJson(vk, { a: 1, s: "é☃" }, "item-1");
  assert.deepEqual(await openJson(vk, sealed, "item-1"), { a: 1, s: "é☃" });
  await assert.rejects(() => openJson(vk, sealed, "item-2"));
  const flipped = sealed.slice(0, -4) + (sealed.endsWith("AAAA") ? "BBBB" : "AAAA");
  await assert.rejects(() => openJson(vk, flipped, "item-1"));
  assert.notEqual(await sealJson(vk, { a: 1 }, "x"), await sealJson(vk, { a: 1 }, "x"), "fresh nonce every time");
});

test("password normalisation and KDF checks", async () => {
  const kdf = newKdf(fast);
  const vk = newVaultKey();
  const w = await wrapVaultKey(vk, "café", kdf);
  assert.deepEqual(await unwrapVaultKey(w, "café", kdf), vk, "NFKC: composed and decomposed é match");
  assert.throws(() => checkKdf({ alg: "argon2id", m: 1e9, t: 3, p: 1, salt: "AAAAAAAAAAAAAAAAAAAAAA==" }));
  assert.throws(() => checkKdf({ alg: "pbkdf2", m: 65536, t: 3, p: 1, salt: "AAAAAAAAAAAAAAAAAAAAAA==" }));
  assert.equal(checkKdf({ ...kdf, m: 8192 }).m, 8192);
  assert.ok(KDF_PIN.m >= 8192);
  assert.ok(sameText("abc", "abc") && !sameText("abc", "abd") && !sameText("abc", "abcd"));
});

test("password-protected export round trip", async () => {
  const f = await encryptExport("secret stuff", "pw-1", undefined);
  assert.equal(f.format, "nexus-pass-encrypted");
  assert.equal(await decryptExport(f, "pw-1"), "secret stuff");
  assert.equal(await decryptExport(f, "pw-2"), null);
}, { timeout: 60000 });

test("RFC 6238 vectors (SHA-1, SHA-256, SHA-512) and RFC 4226", async () => {
  const s1 = new TextEncoder().encode("12345678901234567890");
  const s256 = new TextEncoder().encode("12345678901234567890123456789012");
  const s512 = new TextEncoder().encode("1234567890123456789012345678901234567890123456789012345678901234");
  for (const [t, a, b, c] of [[59, "94287082", "46119246", "90693936"], [1111111109, "07081804", "68084774", "25091201"], [20000000000, "65353130", "77737706", "47863826"]] as const) {
    assert.equal(await hotp(s1, Math.floor(t / 30), 8, "SHA-1"), a);
    assert.equal(await hotp(s256, Math.floor(t / 30), 8, "SHA-256"), b);
    assert.equal(await hotp(s512, Math.floor(t / 30), 8, "SHA-512"), c);
  }
  const exp = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
  for (let i = 0; i < 10; i++) assert.equal(await hotp(s1, i, 6), exp[i]);
});

test("base32, otpauth parsing, countdown maths", async () => {
  const bytes = new TextEncoder().encode("Hello!\xde\xad\xbe\xef");
  assert.deepEqual(base32Decode(base32Encode(bytes)), bytes);
  assert.equal(base32Decode("not base32!"), null);
  const c = parseTotp("otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example&digits=8&period=60&algorithm=SHA256");
  assert.deepEqual(c, { secret: "JBSWY3DPEHPK3PXP", digits: 8, period: 60, algo: "SHA-256", issuer: "Example", account: "alice@example.com" });
  assert.equal(parseTotp("jbsw y3dp ehpk 3pxp")?.secret, "JBSWY3DPEHPK3PXP");
  assert.equal(parseTotp("otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP"), null);
  assert.equal(parseTotp("otpauth://totp/x?secret=AB"), null);
  assert.equal(parseTotp(""), null);
  assert.equal(await totpNow({ secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", digits: 8, period: 30, algo: "SHA-1" }, 59000), "94287082");
  assert.equal(secondsLeft(30, 59000), 1);
  assert.equal(secondsLeft(30, 60000), 30);
  assert.equal(ringFraction(30, 15000), 0.5);
  assert.equal(groupCode("123456"), "123 456");
  assert.equal(groupCode("12345678"), "1234 5678");
});

test("generator: lengths, every chosen kind present, unbiased range, passphrases", () => {
  assert.equal(new Set(WORDS).size, 4096);
  assert.ok(WORDS.every((w) => /^[a-z]{4,7}$/.test(w)));
  for (let i = 0; i < 200; i++) {
    const p = genPassword({ ...DEFAULT_PW, length: 12 });
    assert.equal(p.length, 12);
    assert.ok(/[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p));
  }
  assert.ok(!/[Il1O0o]/.test(genPassword({ ...DEFAULT_PW, length: 100, avoidAmbiguous: true })));
  assert.throws(() => genPassword({ ...DEFAULT_PW, lower: false, upper: false, digits: false, symbols: false }));
  assert.equal(genPassword({ ...DEFAULT_PW, length: 4, symbols: false, upper: false, digits: false }).length, 4);
  const counts = new Array(6).fill(0);
  for (let i = 0; i < 6000; i++) counts[randomInt(6)]++;
  assert.ok(counts.every((c) => c > 800 && c < 1200), counts.join());
  const ph = genPassphrase({ ...DEFAULT_PHRASE, words: 6, capitalize: true, number: true });
  assert.equal(ph.split("-").length, 6);
  assert.ok(/^[A-Z]/.test(ph));
  assert.equal(passphraseBits({ ...DEFAULT_PHRASE, words: 6, number: false }), 72);
  assert.ok(passwordBits(DEFAULT_PW) > 120);
});

test("strength meter ranks sensibly", () => {
  assert.equal(strengthOf("").score, 0);
  assert.ok(strengthOf("password123").score <= 1);
  assert.ok(strengthOf("12345678").score <= 1);
  assert.ok(strengthOf("Tr0ub4dor&3").score >= 2);
  assert.ok(strengthOf(genPassword({ ...DEFAULT_PW, length: 24 })).score === 4);
});

test("items: clean, search, url safety", () => {
  const it = cleanItem({ id: "nope", kind: "weird", title: "  Bank ", username: "a".repeat(999), password: "pw", fav: true, junk: 1 });
  assert.equal(it?.kind, "login");
  assert.equal(it?.title, "Bank");
  assert.equal(it?.username?.length, 300);
  assert.ok(/^[0-9a-f-]{36}$/.test(it!.id));
  assert.equal(cleanItem(null), null);
  const list = [
    { ...blankItem("login"), title: "GitHub", username: "max", url: "https://www.github.com/login" },
    { ...blankItem("login"), title: "Amazon", username: "max@x.com", url: "amazon.de", fav: true },
    { ...blankItem("note"), title: "Recovery keys", notes: "github-secret-words" },
  ];
  assert.deepEqual(filterItems(list, "").map((i) => i.title), ["Amazon", "GitHub", "Recovery keys"]);
  assert.deepEqual(filterItems(list, "github").map((i) => i.title), ["GitHub"]);
  assert.deepEqual(filterItems(list, "", "note").map((i) => i.title), ["Recovery keys"]);
  assert.equal(hostOf("https://www.github.com/x"), "github.com");
  assert.equal(safeUrl("javascript:alert(1)"), null);
  assert.equal(safeUrl("amazon.de"), "https://amazon.de/");
});

test("CSV parser handles quotes, commas, newlines, BOM", () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x, y","he said ""hi"""\r\n"line1\nline2",z\r\n'), [["a", "b"], ["x, y", 'he said "hi"'], ["line1\nline2", "z"]]);
});

test("import: Chrome CSV, Bitwarden JSON, Bitwarden CSV, 1Password CSV, own JSON; export round trips", () => {
  const chrome = importAny("name,url,username,password,note\nGitHub,https://github.com,max,pw1,\nBad,,,,\n");
  assert.equal(chrome.items.length, 1);
  assert.equal(chrome.skipped, 1);
  assert.equal(chrome.items[0].password, "pw1");
  const bw = importAny(JSON.stringify({ items: [{ type: 1, name: "Site", favorite: true, login: { username: "u", password: "p", uris: [{ uri: "https://s.com" }], totp: "JBSWY3DPEHPK3PXP" } }, { type: 2, name: "Keys", notes: "abc" }, { type: 3, name: "Card" }] }));
  assert.equal(bw.format, "Bitwarden JSON");
  assert.deepEqual(bw.items.map((i) => [i.kind, i.title, !!i.fav]), [["login", "Site", true], ["note", "Keys", false]]);
  assert.equal(bw.skipped, 1);
  assert.equal(bw.items[0].totp, "JBSWY3DPEHPK3PXP");
  const bwcsv = importAny("folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\n,1,login,Mail,,,0,https://mail.x,me,secret,\n");
  assert.equal(bwcsv.format, "Bitwarden CSV");
  assert.equal(bwcsv.items[0].username, "me");
  const op = importAny("Title,Url,Username,Password,Notes,OTPAuth\nBank,https://b.com,me,pw,hi,otpauth://totp/b?secret=JBSWY3DPEHPK3PXP\n");
  assert.equal(op.items[0].totp, "otpauth://totp/b?secret=JBSWY3DPEHPK3PXP");
  const mine = [{ ...blankItem("login"), title: "=SUM(A1)", username: "@me", password: "=-+pw,\"x\"", url: "https://a.com", notes: "line1\nline2" }];
  const back = importAny(exportCsv(mine));
  assert.equal(back.items[0].title, "=SUM(A1)");
  assert.equal(back.items[0].username, "@me");
  assert.equal(back.items[0].password, "=-+pw,\"x\"", "secrets are never altered by the spreadsheet guard");
  assert.ok(exportCsv(mine).includes("'=SUM(A1)"), "formula text guarded in the file");
  const j = importAny(exportJson(mine));
  assert.equal(j.format, "Nexus Pass JSON");
  assert.equal(j.items[0].notes, "line1\nline2");
  assert.equal(importAny("not a vault").items.length, 0);
  const d = dedupe(mine, [...j.items, { ...mine[0], id: "x" }, { ...mine[0], title: "other" }]);
  assert.equal(d.fresh.length, 1);
  assert.equal(d.dupes, 2);
});
