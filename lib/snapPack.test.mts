import test from "node:test";
import assert from "node:assert/strict";
import {
  ALL_PACK_STICKERS, CAPTION_POSITIONS, CAPTION_STYLES, FRAME_COLORS, PACK_FRAMES, PACK_LOOKS, STICKER_PACKS,
  applyLookPixels, availableLooks, captionPosKey, captionStyleKey, drawCaptionStyled, drawPackFrame, drawWatermark, effectiveCaption,
  frameAllowed, frameColorKey, frameHex, lookAllowed, lookCss, packFlags, parseRecents, pushRecent, stickerCornerKey, stickerSizeKey, stickerSpot, surprise,
} from "./snapPack.ts";

test("the pack is as big as promised", () => {
  assert.equal(PACK_LOOKS.length, 14);
  assert.equal(PACK_FRAMES.length, 8);
  assert.equal(STICKER_PACKS.length, 6);
  assert.ok(STICKER_PACKS.every((p) => p.items.length === 12 && new Set(p.items).size === 12));
  assert.equal(ALL_PACK_STICKERS.length, 72);
  assert.equal(CAPTION_STYLES.length, 6); // bar + 5 new
  assert.equal(CAPTION_POSITIONS.length, 3);
  assert.equal(FRAME_COLORS.length, 6);
  assert.equal(new Set(PACK_LOOKS.map((l) => l.key)).size, 14);
});

test("looks: CSS recipe and pixel maths agree on direction", () => {
  assert.equal(lookCss({}), "none");
  assert.equal(lookCss({ gray: 1, con: 1.4 }), "grayscale(1) contrast(1.4)");
  const px = (p: Parameters<typeof applyLookPixels>[1], rgb = [200, 100, 50]) => {
    const d = new Uint8ClampedArray([...rgb, 255]);
    applyLookPixels(d, p);
    return [...d];
  };
  assert.deepEqual(px({}), [200, 100, 50, 255]);
  const g = px({ gray: 1 });
  assert.ok(g[0] === g[1] || Math.abs(g[0] - g[1]) <= 1);
  const bright = px({ bri: 1.2 });
  assert.ok(bright[0] > 200 && bright[2] > 50);
  const sat = px({ sat: 0 });
  assert.ok(Math.abs(sat[0] - sat[1]) <= 1 && Math.abs(sat[1] - sat[2]) <= 1);
  const hue = px({ hue: 180 });
  assert.ok(hue[2] > hue[0], "hue-rotate 180 turns a warm colour cool");
  for (const l of PACK_LOOKS) {
    const out = px(l.p, [10, 240, 128]);
    assert.ok(out.every((v) => v >= 0 && v <= 255), l.key);
    assert.notEqual(lookCss(l.p), "none");
  }
});

test("sticker spot: default is exactly the classic place", () => {
  assert.deepEqual(stickerSpot(undefined, undefined, false), { x: 0.8, y: 0.16, k: 0.17 });
  assert.deepEqual(stickerSpot("tr", "m", true), { x: 0.8, y: 0.2, k: 0.17 });
  assert.equal(stickerSpot("c", "l", false).k, 0.26);
  assert.equal(stickerSpot("nope", "huge", false).k, 0.17);
  assert.equal(stickerCornerKey("zz"), "tr");
  assert.equal(stickerSizeKey("zz"), "m");
});

test("keys fall back safely", () => {
  assert.equal(captionStyleKey("zz"), "bar");
  assert.equal(captionPosKey("zz"), "bottom");
  assert.equal(frameColorKey("zz"), "white");
  assert.equal(frameHex("pink"), "#ff2bd6");
});

test("recents: newest first, no repeats, max 8, junk ignored", () => {
  let r: string[] = [];
  for (const e of ["a", "b", "c", "a"]) r = pushRecent(r, e);
  assert.deepEqual(r, ["a", "c", "b"]);
  for (let i = 0; i < 12; i++) r = pushRecent(r, "x" + i);
  assert.equal(r.length, 8);
  assert.deepEqual(pushRecent(["a"], ""), ["a"]);
  assert.deepEqual(parseRecents("not json"), []);
  assert.deepEqual(parseRecents('["🔥",3,"","ok"]'), ["🔥", "ok"]);
  assert.deepEqual(parseRecents(null), []);
});

test("server flags: everything on by default, switches and texts follow the map", () => {
  const d = packFlags({});
  assert.deepEqual([d.looks, d.frames, d.stickers, d.captions], [true, true, true, true]);
  assert.equal(d.watermark, "");
  const f = packFlags({ "snap.pack_looks": false, "snap.featured_look": "cyber", "snap.watermark": "@nexus", "snap.event_caption": "Nexus Fest" });
  assert.equal(f.looks, false);
  assert.equal(f.featuredLook, "cyber");
  assert.equal(f.watermark, "@nexus");
  assert.equal(effectiveCaption("", f), "Nexus Fest");
  assert.equal(effectiveCaption("mine", f), "mine");
});

test("gating: originals stay, pack follows the switch, featured goes first", () => {
  const all = [{ key: "none" }, { key: "vivid" }, { key: "golden" }, { key: "cyber" }];
  const base = ["none", "vivid"];
  assert.deepEqual(availableLooks(all, base, packFlags({ "snap.pack_looks": false })).map((e) => e.key), ["none", "vivid"]);
  assert.deepEqual(availableLooks(all, base, packFlags({ "snap.featured_look": "cyber" })).map((e) => e.key), ["none", "cyber", "vivid", "golden"]);
  assert.equal(lookAllowed("golden", base, packFlags({ "snap.pack_looks": false })), "none");
  assert.equal(lookAllowed("vivid", base, packFlags({ "snap.pack_looks": false })), "vivid");
  assert.equal(frameAllowed("neon", packFlags({ "snap.pack_frames": false })), "none");
  assert.equal(frameAllowed("polaroid", packFlags({ "snap.pack_frames": false })), "polaroid");
});

test("surprise me is deterministic with a seeded rng and respects switches", () => {
  const f = packFlags({});
  const a = surprise(f, ["none", "vivid"], () => 0);
  assert.equal(a.look, "vivid");
  assert.equal(a.frame, "neon");
  const off = surprise(packFlags({ "snap.pack_looks": false, "snap.pack_frames": false, "snap.pack_stickers": false }), ["none", "vivid", "pop"], () => 0.99);
  assert.equal(off.look, "pop");
  assert.equal(off.frame, "polaroid");
});

function mockCtx() {
  const calls: string[] = [];
  const p = new Proxy(
    {},
    {
      get: (_t, k: string) => {
        if (k === "measureText") return () => ({ width: 100 });
        if (k === "createLinearGradient" || k === "createRadialGradient") return () => ({ addColorStop() {} });
        return (...a: unknown[]) => { calls.push(String(k)); void a; };
      },
      set: () => true,
    },
  );
  return { g: p as unknown as CanvasRenderingContext2D, calls };
}

test("every frame, caption style and the watermark draw something without throwing", () => {
  for (const f of PACK_FRAMES) {
    const { g, calls } = mockCtx();
    drawPackFrame(g, 1000, 1500, f.key, "#ff2bd6");
    assert.ok(calls.length > 2, f.key);
  }
  for (const s of CAPTION_STYLES) for (const pos of CAPTION_POSITIONS) {
    const { g, calls } = mockCtx();
    drawCaptionStyled(g, 1000, 1500, "hello nexus", s.key, pos.key, "#fff", false);
    assert.ok(calls.some((c) => c === "fillText" || c === "strokeText"), `${s.key}/${pos.key}`);
  }
  const { g, calls } = mockCtx();
  drawWatermark(g, 1000, 1500, "  ");
  assert.equal(calls.length, 0);
  drawWatermark(g, 1000, 1500, "@nexus");
  assert.ok(calls.includes("fillText"));
});
