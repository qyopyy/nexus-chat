import test from "node:test";
import assert from "node:assert/strict";
import { OUTFIT_LOOKS, applyLook, pieceLabel, wearsLook } from "./snapOutfits.ts";
import { DEFAULT_AVATAR, OPTIONS, PANTS, SHOES } from "./vavatar.ts";

const HEX = /^#[0-9a-f]{6}$/i;
const COLOR_KEYS = ["shirtColor", "accentColor", "pantsColor", "shoesColor", "hatColor", "eyewearColor", "extraColor", "hairColor"] as const;

test("outfits: more than 20 ready-made looks with unique keys and names", () => {
  assert.ok(OUTFIT_LOOKS.length >= 20);
  assert.equal(new Set(OUTFIT_LOOKS.map((l) => l.key)).size, OUTFIT_LOOKS.length);
  assert.equal(new Set(OUTFIT_LOOKS.map((l) => l.name)).size, OUTFIT_LOOKS.length);
});

test("outfits: every piece and colour in every look is one the avatar can draw", () => {
  for (const { key, look } of OUTFIT_LOOKS) {
    if (look.shirt) assert.ok((OPTIONS.shirt as readonly string[]).includes(look.shirt), `${key} shirt`);
    if (look.hat) assert.ok((OPTIONS.hat as readonly string[]).includes(look.hat), `${key} hat`);
    if (look.eyewear) assert.ok((OPTIONS.eyewear as readonly string[]).includes(look.eyewear), `${key} eyewear`);
    if (look.chain) assert.ok((OPTIONS.chain as readonly string[]).includes(look.chain), `${key} chain`);
    if (look.pendant) assert.ok((OPTIONS.pendant as readonly string[]).includes(look.pendant), `${key} pendant`);
    if (look.earrings) assert.ok((OPTIONS.earrings as readonly string[]).includes(look.earrings), `${key} earrings`);
    if (look.extra) assert.ok((OPTIONS.extra as readonly string[]).includes(look.extra), `${key} extra`);
    if (look.graphic) assert.ok((OPTIONS.graphic as readonly string[]).includes(look.graphic), `${key} graphic`);
    if (look.metal) assert.ok((OPTIONS.metal as readonly string[]).includes(look.metal), `${key} metal`);
    if (look.pants) assert.ok((PANTS as readonly string[]).includes(look.pants), `${key} pants`);
    if (look.shoes) assert.ok((SHOES as readonly string[]).includes(look.shoes), `${key} shoes`);
    for (const c of COLOR_KEYS) if (look[c] !== undefined) assert.match(String(look[c]), HEX, `${key} ${c}`);
    assert.ok(look.pants && look.shoes && look.shirt, `${key} dresses top, legs and feet`);
  }
});

test("outfits: applying a look keeps the face and hair, and leaves nothing of the last look behind", () => {
  const me = { ...DEFAULT_AVATAR, skin: "#7a4a2f", hair: "afro" as const, hairColor: "#111318", eyeColor: "#ff4d6d" };
  const trap = OUTFIT_LOOKS.find((l) => l.key === "trap-star")!;
  const school = OUTFIT_LOOKS.find((l) => l.key === "school-day")!;
  const a = applyLook(me, trap);
  assert.equal(a.skin, "#7a4a2f");
  assert.equal(a.hair, "afro");
  assert.equal(a.eyeColor, "#ff4d6d");
  assert.equal(a.grillz, "iced");
  assert.ok(wearsLook(a, trap));
  const b = applyLook(a, school);
  assert.equal(b.grillz, "none");
  assert.equal(b.hat, "none");
  assert.equal(b.chain, "none");
  assert.ok(wearsLook(b, school) && !wearsLook(b, trap));
});

test("outfits: piece labels read naturally", () => {
  assert.equal(pieceLabel("catEars"), "Cat ears");
  assert.equal(pieceLabel("none"), "None");
  assert.equal(pieceLabel("cubanIced"), "Cuban iced");
});
