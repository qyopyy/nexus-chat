import assert from "node:assert/strict";
import test from "node:test";
import { offlinePath } from "./acetateOffline.ts";
import { pinAgeSeconds, pinIsLive } from "./wumpMapStyle.ts";
import { ACETATE_RELEASE, NEXUS_RELEASE } from "./releaseNotes.ts";

test("offline audio stays inside the Acetate service worker scope", () => {
  const path = offlinePath("11111111-1111-1111-1111-111111111111");
  assert.equal(path.startsWith("/acetate/offline/"), true);
  assert.equal(path.includes("/acetate-offline/"), false);
});

test("a pin with no age is not counted as live", () => {
  const now = Date.parse("2026-11-12T12:00:00Z");
  assert.equal(pinAgeSeconds({}), null);
  assert.equal(pinIsLive({}), false);
  assert.equal(pinIsLive({ age_seconds: 0 }), true);
  assert.equal(pinIsLive({ age_seconds: 120 }), false);
  assert.equal(pinIsLive({ updated_at: "2026-11-12T11:59:30Z" }, now), true);
  assert.equal(pinIsLive({ updated_at: "2026-11-12T11:50:00Z" }, now), false);
});

test("release notes match the shells", () => {
  assert.equal(NEXUS_RELEASE.version, "1.9.0");
  assert.equal(ACETATE_RELEASE.version, "1.2.0");
  assert.equal(NEXUS_RELEASE.items.length >= 4, true);
  assert.equal(ACETATE_RELEASE.items.length >= 3, true);
});
