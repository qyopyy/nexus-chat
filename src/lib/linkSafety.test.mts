import test from "node:test";
import assert from "node:assert/strict";
import { linkRisk, shouldAsk, hostOf, warningText } from "./linkSafety.ts";

test("trusted and normal links", () => {
  assert.equal(linkRisk("https://nexusproject.cc/i/abc"), "ok");
  assert.equal(linkRisk("https://open.spotify.com/track/1"), "ok");
  assert.equal(linkRisk("https://example.org/page"), "other-site");
});
test("tricky links", () => {
  assert.equal(linkRisk("https://nexusproject.cc@evil.com/x"), "tricky");
  assert.equal(linkRisk("https://xn--nexusprojct-0ub.cc/"), "tricky");
  assert.equal(linkRisk("http://192.168.0.1/login"), "tricky");
  assert.equal(linkRisk("http://example.org/"), "tricky");
  assert.equal(linkRisk("javascript:alert(1)"), "tricky");
  assert.equal(linkRisk("not a url"), "tricky");
  assert.equal(linkRisk("https://nexusproject.cc.evil.com/"), "other-site");
});
test("when to ask", () => {
  assert.equal(shouldAsk("ok", true), false);
  assert.equal(shouldAsk("other-site", false), false);
  assert.equal(shouldAsk("other-site", true), true);
  assert.equal(shouldAsk("tricky", false), true);
});
test("text", () => {
  assert.equal(hostOf("https://A.com/x"), "a.com");
  assert.match(warningText("https://a.com", "other-site"), /a\.com/);
});
