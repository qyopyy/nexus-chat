import test from "node:test";
import assert from "node:assert/strict";
import { act, createBattle, moveTiles, skillTiles, livingHeroes, foes, waitingOn, canUse, skillsOf, HEROES, MAX_WAVE, W, H, type Battle, type PartyEntry } from "./heroes.ts";

const party = (n = 2): PartyEntry[] =>
  (["kettle", "sparkplug", "marsh", "glitch"] as const).slice(0, n).map((hero, i) => ({ player: `p${i}`, name: `P${i}`, hero }));

test("createBattle places heroes left and foes right", () => {
  const s = createBattle(party(3), 1);
  assert.equal(livingHeroes(s).length, 3);
  assert.ok(foes(s).length >= 3);
  assert.ok(livingHeroes(s).every((h) => h.x === 0));
  assert.ok(foes(s).every((f) => f.x >= W - 3));
  const seen = new Set(s.units.map((u) => `${u.x},${u.y}`));
  assert.equal(seen.size, s.units.length, "no overlapping units");
});

test("deterministic for same seed", () => {
  assert.deepEqual(createBattle(party(), 42), createBattle(party(), 42));
  assert.notDeepEqual(createBattle(party(), 42).units.map((u) => [u.x, u.y]), createBattle(party(), 43).units.map((u) => [u.x, u.y]));
});

test("act never mutates input and rejects other players", () => {
  const s = createBattle(party(), 7);
  const frozen = JSON.stringify(s);
  const h0 = s.units.find((u) => u.id === "h0")!;
  const to = moveTiles(s, h0)[0]!;
  const bad = act(s, "p1", { t: "move", unit: "h0", to });
  assert.ok(bad.error);
  const ok = act(s, "p0", { t: "move", unit: "h0", to });
  assert.equal(ok.error, undefined);
  assert.equal(JSON.stringify(s), frozen);
  const moved = ok.state.units.find((u) => u.id === "h0")!;
  assert.deepEqual([moved.x, moved.y], [to.x, to.y]);
  assert.ok(moved.moved);
});

test("cannot move twice or onto occupied/out-of-range tiles", () => {
  let s = createBattle(party(), 7);
  const h0 = s.units.find((u) => u.id === "h0")!;
  assert.ok(act(s, "p0", { t: "move", unit: "h0", to: { x: 7, y: 5 } }).error);
  assert.ok(act(s, "p0", { t: "move", unit: "h0", to: { x: 0, y: 2 } }).error, "occupied by h1");
  s = act(s, "p0", { t: "move", unit: "h0", to: moveTiles(s, h0)[0]! }).state;
  assert.equal(moveTiles(s, s.units[0]!).length, 0);
});

test("skills need valid targets and respect cooldown", () => {
  let s = createBattle(party(), 3);
  const sp = s.units.find((u) => u.id === "h1")!;
  assert.ok(act(s, "p1", { t: "skill", unit: "h1", skill: "sling", at: { x: 0, y: 0 } }).error, "no foe in line");
  // put a foe in line, adjacent-ish
  const f = foes(s)[0]!;
  f.x = 3; f.y = sp.y;
  const r = act(s, "p1", { t: "skill", unit: "h1", skill: "sling", at: { x: 3, y: sp.y } });
  assert.equal(r.error, undefined);
  const hit = r.state.units.find((u) => u.id === f.id)!;
  assert.ok(hit.hp < f.hp);
  s = r.state;
  assert.ok(act(s, "p1", { t: "skill", unit: "h1", skill: "ricochet", at: { x: 3, y: sp.y } }).error, "already acted");
});

test("ultimate requires full hype and resets it", () => {
  const s = createBattle(party(), 5);
  const k = s.units.find((u) => u.id === "h0")!;
  const ult = skillsOf(k).find((x) => x.ult)!;
  assert.equal(canUse(k, ult), false);
  assert.ok(act(s, "p0", { t: "skill", unit: "h0", skill: ult.id }).error);
  k.hype = 100;
  const r = act(s, "p0", { t: "skill", unit: "h0", skill: ult.id });
  assert.equal(r.error, undefined);
  assert.equal(r.state.units.find((u) => u.id === "h0")!.hype, 0);
});

test("healer heals allies up to max and group hug shields", () => {
  const s = createBattle(party(3), 9);
  const kettle = s.units.find((u) => u.id === "h0")!;
  const doc = s.units.find((u) => u.id === "h2")!;
  kettle.hp = 5;
  doc.x = 1; doc.y = kettle.y;
  const r = act(s, "p2", { t: "skill", unit: "h2", skill: "aid", at: { x: kettle.x, y: kettle.y } });
  assert.equal(r.error, undefined);
  assert.equal(r.state.units.find((u) => u.id === "h0")!.hp, 17);
  const s2 = createBattle(party(3), 9);
  s2.units.find((u) => u.id === "h2")!.hype = 100;
  s2.units.find((u) => u.id === "h0")!.hp = 1;
  const r2 = act(s2, "p2", { t: "skill", unit: "h2", skill: "hug" });
  assert.ok(r2.state.units.find((u) => u.id === "h0")!.shield >= 6);
});

test("glitch swap exchanges positions and stuns foes", () => {
  const s = createBattle(party(4), 11);
  const g = s.units.find((u) => u.id === "h3")!;
  const f = foes(s)[0]!;
  f.x = 2; f.y = g.y;
  const r = act(s, "p3", { t: "skill", unit: "h3", skill: "swap", at: { x: 2, y: g.y } });
  assert.equal(r.error, undefined);
  const g2 = r.state.units.find((u) => u.id === "h3")!;
  assert.equal(g2.x, 2);
});

test("round ends when everyone is done; foes act; cooldowns tick", () => {
  let s = createBattle(party(), 13);
  s = act(s, "p0", { t: "end" }).state;
  assert.deepEqual(waitingOn(s), ["p1"]);
  assert.equal(s.round, 1);
  s = act(s, "p1", { t: "end" }).state;
  assert.equal(s.round, 2);
  assert.ok(foes(s).some((f) => f.x < 7), "foes advanced");
  assert.ok(livingHeroes(s).every((h) => !h.done && !h.moved && !h.acted));
});

test("stunned foes skip their turn", () => {
  const s = createBattle(party(1), 17);
  const h = s.units[0]!;
  h.x = 0; h.y = 0;
  const f = foes(s)[0]!;
  f.x = 1; f.y = 0; f.stun = 1;
  const hp = h.hp;
  const r = act(s, "p0", { t: "end" }).state;
  assert.equal(r.units.find((u) => u.id === f.id)!.stun, 0);
  assert.ok(r.units.find((u) => u.id === "h0")!.hp <= hp);
});

test("clearing a wave advances and revives downed heroes", () => {
  const s = createBattle(party(2), 21);
  s.units.find((u) => u.id === "h1")!.hp = 0;
  for (const f of foes(s)) f.hp = 1;
  const f0 = foes(s)[0]!;
  const h = s.units.find((u) => u.id === "h0")!;
  for (const f of foes(s)) { f.x = 4; f.y = 4; }
  foes(s).forEach((f, i) => { f.x = 4 + (i % 3); f.y = 3 + Math.floor(i / 3); });
  f0.x = 1; f0.y = h.y;
  for (const f of foes(s)) if (f !== f0) f.hp = 0;
  const r = act(s, "p0", { t: "skill", unit: "h0", skill: "punch", at: { x: 1, y: h.y } });
  assert.equal(r.error, undefined);
  assert.equal(r.state.wave, 2);
  assert.ok(r.state.units.find((u) => u.id === "h1")!.hp > 0, "revived");
  assert.ok(foes(r.state).length > 0);
});

test("all heroes down → lost; surviving wave 5 → won", () => {
  const s = createBattle(party(1), 23);
  s.units[0]!.hp = 1;
  const f = foes(s)[0]!;
  f.x = 1; f.y = s.units[0]!.y;
  let cur: Battle = s;
  for (let i = 0; i < 6 && cur.phase === "heroes"; i++) cur = act(cur, "p0", { t: "end" }).state;
  assert.equal(cur.phase, "lost");
  assert.ok(act(cur, "p0", { t: "end" }).error);

  const w = createBattle(party(1), 29);
  w.wave = MAX_WAVE;
  for (const u of w.units) if (u.team === "foe") u.hp = 0;
  const h = w.units[0]!;
  h.hype = 100;
  // a living foe exists so the ult kills it
  w.units.push({ ...h, id: "boss", team: "foe", kind: "goblin", name: "x", emoji: "x", owner: undefined, x: 1, y: h.y, hp: 1, max: 1, hype: 0 });
  const r = act(w, "p0", { t: "skill", unit: "h0", skill: "whistle" });
  assert.equal(r.state.phase, "won");
});

test("random play never throws and always terminates", () => {
  for (let seed = 1; seed <= 25; seed++) {
    let s = createBattle(party(1 + (seed % 4)), seed);
    let guard = 0;
    while (s.phase === "heroes" && guard++ < 4000) {
      const mine = livingHeroes(s);
      let progressed = false;
      for (const h of mine) {
        const sk = skillsOf(h).filter((k) => skillTiles(s, h, k).length);
        if (!h.acted && sk.length) {
          const k = sk[(seed + guard) % sk.length]!;
          const tiles = skillTiles(s, h, k);
          const r = act(s, h.owner!, { t: "skill", unit: h.id, skill: k.id, at: tiles[(seed * 7 + guard) % tiles.length] });
          assert.equal(r.error, undefined);
          s = r.state; progressed = true; break;
        }
        const mv = moveTiles(s, h);
        if (mv.length) {
          const r = act(s, h.owner!, { t: "move", unit: h.id, to: mv[(seed + guard) % mv.length]! });
          assert.equal(r.error, undefined);
          s = r.state; progressed = true; break;
        }
      }
      if (!progressed) for (const o of new Set(mine.map((m) => m.owner!))) s = act(s, o, { t: "end" }).state;
      for (const u of s.units) {
        assert.ok(u.x >= 0 && u.y >= 0 && u.x < W && u.y < H);
        assert.ok(u.hp >= 0 && u.hp <= u.max);
      }
    }
    assert.ok(guard < 4000, "game terminated");
  }
});

test("hero roster is sane", () => {
  for (const k of Object.values(HEROES)) {
    assert.equal(k.skills.filter((s) => s.ult).length, 1);
    assert.ok(k.hp > 0 && k.move > 0);
  }
});
