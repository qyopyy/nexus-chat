import assert from "node:assert/strict";
import test from "node:test";
import { formatWumpCard, parseWumpCard, wumpCardMessage, wumpCardPreview } from "./wumpCard.ts";
import { resolveWumpStyle, wumpBasemapCredit } from "./wumpMapStyle.ts";
import { decodePolyline, handoffUrl, parseVia, pickRouteProvider, routeStops, valhallaEndpoint } from "./wumpRoutePlan.ts";

test("keyless streets style is OpenFreeMap", () => {
  const style = resolveWumpStyle("streets", {});
  assert.equal(typeof style, "string");
  assert.match(String(style), /tiles\.openfreemap\.org\/styles\/liberty/);
  assert.equal(wumpBasemapCredit({}), "OpenFreeMap · Esri satellite");
});

test("MapTiler key wins over Stadia and is not echoed in the credit", () => {
  const style = resolveWumpStyle("dark", { maptiler: "abc", stadia: "xyz" });
  assert.match(String(style), /api\.maptiler\.com\/maps\/streets-v2-dark/);
  assert.match(String(style), /key=abc/);
  assert.equal(wumpBasemapCredit({ maptiler: "abc" }), "HD maps · MapTiler");
});

test("satellite without a key is a raster style", () => {
  const style = resolveWumpStyle("satellite", {});
  assert.equal(typeof style, "object");
  if (typeof style === "string") return;
  assert.equal(style.layers[0]?.source, "satellite");
});

test("provider pick and via parsing", () => {
  assert.equal(pickRouteProvider({}), "osrm");
  assert.equal(pickRouteProvider({ valhalla: "https://valhalla.example" }), "valhalla");
  assert.equal(pickRouteProvider({ ors: "k", valhalla: "https://v" }), "ors");
  assert.deepEqual(parseVia("47.5,19.0|47.6,19.1;nope"), [
    [47.5, 19],
    [47.6, 19.1],
  ]);
  assert.deepEqual(routeStops([1, 2], [1, 2], []), [[1, 2]]);
  assert.equal(valhallaEndpoint("https://valhalla.example/"), "https://valhalla.example/route");
  assert.equal(valhallaEndpoint("https://valhalla.example/route"), "https://valhalla.example/route");
});

test("decodes the canonical Google polyline sample", () => {
  const pts = decodePolyline("_p~iF~ps|U", 5);
  assert.equal(pts.length, 1);
  assert.ok(Math.abs(pts[0][0] - 38.5) < 1e-5);
  assert.ok(Math.abs(pts[0][1] + 120.2) < 1e-4);
});

test("place and route cards round-trip", () => {
  const place = formatWumpCard({ kind: "place", lat: 47.4979, lng: 19.0402, name: "Café & co" });
  assert.deepEqual(parseWumpCard(wumpCardMessage({ kind: "place", lat: 47.4979, lng: 19.0402, name: "Café & co" })), {
    kind: "place",
    lat: 47.4979,
    lng: 19.0402,
    name: "Café & co",
  });
  assert.match(place, /wump-card:place/);
  const route = parseWumpCard(formatWumpCard({ kind: "route", mode: "bike", name: "Loop", points: [[47.5, 19], [47.51, 19.02]] }));
  assert.equal(route?.kind, "route");
  if (route?.kind === "route") {
    assert.equal(route.mode, "bike");
    assert.equal(route.points.length, 2);
  }
  assert.equal(wumpCardPreview(`📍 Café\n${place}`), "📍 Café");
});

test("handoff links include origin and stops", () => {
  const apple = handoffUrl({ to: [47.5, 19.1], from: [47.4, 19], via: [[47.45, 19.05]], name: "Park", mode: "walk", apple: true });
  assert.match(apple, /maps\.apple\.com/);
  assert.match(apple, /saddr=47\.4%2C19/);
  assert.match(apple, /dirflg=w/);
  const google = handoffUrl({ to: [47.5, 19.1], from: [47.4, 19], via: [[47.45, 19.05]], name: "Park", mode: "drive", apple: false });
  assert.match(google, /google\.com\/maps\/dir/);
  assert.match(google, /travelmode=driving/);
  assert.match(google, /waypoints=/);
});
