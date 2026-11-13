import assert from "node:assert/strict";
import test from "node:test";
import { bearingDegrees, distanceMeters, geographicMidpoint } from "./wumpMeet.ts";
import { inQuietWindow } from "./wumpQuiet.ts";

test("midpoint of one place is that place", () => {
  const here = { lat: 47.4979, lng: 19.0402 };
  const mid = geographicMidpoint(here, here);
  assert.ok(Math.abs(mid.lat - here.lat) < 1e-6);
  assert.ok(Math.abs(mid.lng - here.lng) < 1e-6);
  assert.ok(distanceMeters(here, here) < 1);
});

test("midpoint sits between Budapest and Vienna", () => {
  const budapest = { lat: 47.4979, lng: 19.0402 };
  const vienna = { lat: 48.2082, lng: 16.3738 };
  const mid = geographicMidpoint(budapest, vienna);
  const toBudapest = distanceMeters(mid, budapest);
  const toVienna = distanceMeters(mid, vienna);
  assert.ok(Math.abs(toBudapest - toVienna) / toBudapest < 0.02);
  assert.ok(toBudapest > 100_000 && toBudapest < 160_000);
  const bearing = bearingDegrees(budapest, vienna);
  assert.ok(bearing > 270 && bearing < 330);
});

test("quiet hours wrap past midnight", () => {
  assert.equal(inQuietWindow(23 * 60, 22 * 60, 7 * 60), true);
  assert.equal(inQuietWindow(6 * 60 + 30, 22 * 60, 7 * 60), true);
  assert.equal(inQuietWindow(12 * 60, 22 * 60, 7 * 60), false);
  assert.equal(inQuietWindow(7 * 60, 22 * 60, 7 * 60), false);
  assert.equal(inQuietWindow(10 * 60, 9 * 60, 17 * 60), true);
  assert.equal(inQuietWindow(8 * 60, 9 * 60, 17 * 60), false);
  assert.equal(inQuietWindow(12 * 60, 12 * 60, 12 * 60), false);
});
