import test from "node:test";
import assert from "node:assert/strict";
import { validateRequest, hostMatches, hostFromUrl, fillAllowed } from "./extProtocol.ts";

test("requests are validated", () => {
  assert.deepEqual(validateRequest({ source: "nexus-ext", id: "a1", type: "status" }), { source: "nexus-ext", id: "a1", type: "status", payload: {} });
  assert.equal(validateRequest({ source: "evil", id: "a1", type: "status" }), null);
  assert.equal(validateRequest({ source: "nexus-ext", id: "", type: "status" }), null);
  assert.equal(validateRequest({ source: "nexus-ext", id: "x".repeat(65), type: "status" }), null);
  assert.equal(validateRequest({ source: "nexus-ext", id: "a", type: "pass:dump" }), null);
  assert.equal(validateRequest(null), null);
  assert.equal(validateRequest("hi"), null);
  assert.deepEqual(validateRequest({ source: "nexus-ext", id: "a", type: "pass:search", payload: [1] })!.payload, {});
});
test("host matching never lets a look-alike site match", () => {
  assert.ok(hostMatches("https://github.com/login", "github.com"));
  assert.ok(hostMatches("https://www.github.com", "gist.github.com"));
  assert.ok(hostMatches("github.com", "github.com") === false, "saved value must be a URL");
  assert.ok(!hostMatches("https://github.com", "evil-github.com"));
  assert.ok(!hostMatches("https://github.com", "github.com.evil.io"));
  assert.ok(!hostMatches("https://github.com", "notgithub.com"));
  assert.ok(!hostMatches("https://login.example.com", "example.com"), "a login saved for a subdomain isn't offered on the parent");
  assert.ok(!hostMatches("https://10.0.0.1", "0.0.0.1"));
  assert.ok(hostMatches("http://10.0.0.1/admin", "10.0.0.1"));
  assert.ok(!hostMatches("https://com", "evil.com"));
  assert.ok(!hostMatches(undefined, "a.com") && !hostMatches("https://a.com", ""));
  assert.equal(hostFromUrl("https://WWW.Example.com:8443/x"), "example.com");
});
test("fill only over https or localhost", () => {
  assert.ok(fillAllowed("https://a.com/login") && fillAllowed("http://localhost:3000/x") && fillAllowed("http://127.0.0.1/"));
  assert.ok(!fillAllowed("http://a.com/login") && !fillAllowed("file:///x") && !fillAllowed("javascript:1") && !fillAllowed("nonsense"));
});
