import assert from "node:assert/strict";
import test from "node:test";
import * as B from "./bottle.ts";
import * as Tn from "./town.ts";

const perks0 = () => B.perks(B.newSave());

/* ───── economy ───── */
test("base perks and upgrades", () => {
  const s = B.newSave();
  assert.equal(B.perks(s).capacity, 10);
  assert.equal(B.perks(s).speed, 1);
  const bought = B.buyUpgrade({ ...s, money: 1000 }, "bag");
  assert.ok("save" in bought);
  if ("save" in bought) {
    assert.equal(B.perks(bought.save).capacity, 15);
    assert.equal(bought.save.money, 900);
  }
  assert.ok("error" in B.buyUpgrade(s, "bag"));
  let m = { ...s, money: 1e12 };
  for (let i = 0; i < 20; i++) {
    const r = B.buyUpgrade(m, "arm");
    if ("save" in r) m = r.save;
  }
  assert.equal(B.lvl(m, "arm"), 8);
  assert.equal(B.perks(m).throwCooldown, 0.13);
  assert.ok("error" in B.buyUpgrade(m, "arm"));
});
test("upgrade costs grow", () => {
  const d = B.UPGRADES[0];
  assert.ok(B.upgradeCost(d, 5) > B.upgradeCost(d, 4));
  assert.equal(B.upgradeCost(d, 0), 100);
});
test("pets and vehicles change perks", () => {
  let s = { ...B.newSave(), money: 1e9 };
  for (const p of B.PETS) {
    const r = B.buyPet(s, p.id);
    assert.ok("save" in r);
    if ("save" in r) s = r.save;
  }
  assert.ok("error" in B.buyPet(s, "dog"));
  const p = B.perks(s);
  assert.equal(p.capacity, 18);
  assert.equal(p.petRadius, 90);
  assert.equal(p.depositPct, 1.1);
  assert.equal(p.radar, true);
  assert.ok(p.speed > 1.14);
  const v = B.buyVehicle(s, "van");
  assert.ok("save" in v);
  if ("save" in v) {
    assert.equal(v.save.riding, "van");
    assert.equal(B.perks(v.save).capacity, 78);
    assert.ok(B.perks(v.save).speed > 2.5);
    assert.ok("error" in B.buyVehicle(v.save, "van"));
  }
  assert.ok("error" in B.buyVehicle(B.newSave(), "bike"));
  assert.ok("error" in B.buyVehicle(s, "none"));
});

/* ───── machine session ───── */
test("accepted items pay deposit and build the streak bonus", () => {
  let sess = B.newSession();
  const p = perks0();
  for (let i = 1; i <= 9; i++) {
    const r = B.throwItem(sess, { kind: "glass", dirty: false }, p, false);
    assert.ok(r.ok);
    assert.equal(r.gain, 50);
    sess = r.session;
  }
  assert.equal(sess.streak, 9);
  assert.equal(sess.bonus, 90); // "x9 streak · +90 Ft" like the original
  assert.equal(sess.earned, 450);
  const c = B.closeSession(sess);
  assert.equal(c.payout, 90);
  assert.equal(c.session.earned, 540);
  assert.equal(c.session.streak, 0);
});
test("dirty items are rejected unless wiped; reject banks half the bonus", () => {
  let sess = { ...B.newSession(), streak: 6, bonus: 60 };
  const rej = B.throwItem(sess, { kind: "can", dirty: true }, perks0(), false);
  assert.equal(rej.ok, false);
  assert.equal(rej.gain, 30);
  assert.equal(rej.session.streak, 0);
  assert.equal(rej.session.rejected, 1);
  assert.ok(rej.session.calm < sess.calm);
  const wiped = B.throwItem(sess, { kind: "can", dirty: true }, perks0(), true);
  assert.equal(wiped.ok, true);
  assert.equal(wiped.session.streak, 7);
});
test("deposit perks stack", () => {
  const s = { ...B.newSave(), upgrades: { deposit: 5 }, pets: ["cat" as const] };
  const r = B.throwItem(B.newSession(), { kind: "plastic", dirty: false }, B.perks(s), false);
  assert.equal(r.gain, Math.round(60 * 1.1));
});
test("queue calm drains, resets streak at zero, and respects Queue whisperer", () => {
  let sess = { ...B.newSession(), streak: 4, bonus: 40, calm: 1 };
  const t = B.tickCalm(sess, 2, perks0());
  assert.equal(t.stormedOff, true);
  assert.equal(t.session.streak, 0);
  assert.equal(t.session.queue, 2);
  assert.equal(t.session.earned, 20);
  const fast = B.tickCalm(B.newSession(), 10, perks0()).session.calm;
  const slow = B.tickCalm(B.newSession(), 10, B.perks({ ...B.newSave(), upgrades: { calm: 8 } })).session.calm;
  assert.ok(slow > fast);
  assert.equal(B.tickCalm({ ...B.newSession(0), calm: 50 }, 100, perks0()).session.calm, 50);
  assert.equal(B.calmLabel(90), "Calm");
  assert.equal(B.calmLabel(10), "Angry");
});

/* ───── quests ───── */
test("quest chain unlocks in order and ids are unique", () => {
  assert.equal(new Set(B.QUESTS.map((q) => q.id)).size, B.QUESTS.length);
  for (const q of B.QUESTS) {
    if (q.requires) assert.ok(B.questById(q.requires), q.id);
    assert.ok(B.QUESTS.some(() => true));
  }
  const st = B.newQuests();
  assert.equal(B.isAvailable(B.questById("m1")!, st), true);
  assert.equal(B.isAvailable(B.questById("m2")!, st), false);
  const started = B.startQuest(st, "m1");
  assert.equal(started.status.m1, "active");
  assert.equal(B.startQuest(started, "m1"), started);
  assert.equal(B.startQuest(st, "m2"), st);
});
test("events advance objectives and finish quests", () => {
  let st = B.startQuest(B.newQuests(), "m1");
  let fin: string[] = [];
  for (let i = 0; i < 8; i++) ({ state: st, finished: fin } = B.applyEvent(st, { t: "collect", kind: "can" }));
  assert.deepEqual(st.prog.m1, [8, 0]);
  assert.deepEqual(fin, []);
  for (let i = 0; i < 8; i++) ({ state: st, finished: fin } = B.applyEvent(st, { t: "return", kind: "glass" }));
  assert.equal(st.status.m1, "ready");
  assert.deepEqual(fin, ["m1"]);
  const claim = B.claimQuest(st, "m1")!;
  assert.equal(claim.reward, 150);
  assert.equal(claim.state.status.m1, "done");
  assert.equal(B.claimQuest(claim.state, "m1"), null);
  assert.equal(B.isAvailable(B.questById("m2")!, claim.state), true);
});
test("kind, poi, streak and session objectives behave", () => {
  let st = B.startQuest(B.newQuests(), "s2"); // 5 cans
  ({ state: st } = B.applyEvent(st, { t: "collect", kind: "glass" }));
  assert.deepEqual(st.prog.s2, [0]);
  for (let i = 0; i < 9; i++) ({ state: st } = B.applyEvent(st, { t: "collect", kind: "can" }));
  assert.equal(st.status.s2, "ready");
  assert.deepEqual(st.prog.s2, [5]); // clamped
  let a = B.startQuest(B.newQuests(), "s4");
  ({ state: a } = B.applyEvent(a, { t: "visit", poi: "school" }));
  ({ state: a } = B.applyEvent(a, { t: "visit", poi: "school" }));
  assert.deepEqual(a.prog.s4, [1, 0, 0]);
  let s = B.startQuest({ status: { m4: "done", m3: "done", m2: "done", m1: "done" }, prog: {} }, "m5");
  ({ state: s } = B.applyEvent(s, { t: "streak", n: 4 }));
  ({ state: s } = B.applyEvent(s, { t: "streak", n: 2 }));
  assert.deepEqual(s.prog.m5, [4]);
  ({ state: s } = B.applyEvent(s, { t: "streak", n: 10 }));
  assert.equal(s.status.m5, "ready");
  let q = B.startQuest(B.newQuests(), "s5");
  ({ state: q } = B.applyEvent(q, { t: "session", earned: 450 }));
  assert.equal(q.status.s5, "ready");
});
test("talking to NPCs: offer, claim, chatter, markers", () => {
  let st = B.newQuests();
  const t1 = B.talkTo(st, "bela");
  assert.equal(t1.kind, "offer");
  assert.equal(B.markerFor(st, "bela"), "!");
  assert.equal(B.markerFor(st, "nobody"), "");
  st = B.startQuest(st, "m1");
  assert.equal(B.talkTo(st, "bela", () => 0).kind, "chat");
  st = { ...st, status: { ...st.status, m1: "ready" } };
  assert.equal(B.markerFor(st, "bela"), "?");
  const t2 = B.talkTo(st, "bela");
  assert.equal(t2.kind, "claim");
  assert.equal(B.talkTo(B.newQuests(), "stranger", () => 0).kind, "chat");
  assert.equal(B.activeQuests(st).length, 1);
});
test("every quest has a giver in town and a reachable objective", () => {
  const town = Tn.buildTown();
  const ids = new Set(town.npcs.map((n) => n.id));
  const poiIds = new Set(town.pois.map((p) => p.id));
  for (const q of B.QUESTS) {
    assert.ok(ids.has(q.giver), `${q.id} giver ${q.giver}`);
    for (const o of q.objectives) if (o.poi) assert.ok(poiIds.has(o.poi), `${q.id} poi ${o.poi}`);
  }
});
test("money format", () => {
  assert.equal(B.fmtMoney(12500), "12 500 Ft");
  assert.equal(B.fmtMoney(0), "0 Ft");
});

/* ───── town ───── */
test("town spawn can reach every NPC, POI and both machines", () => {
  const town = Tn.buildTown();
  const seen = Tn.reachable(town, town.spawn);
  const ok = (x: number, y: number) => seen[Tn.tileIndex(Math.floor(x), Math.floor(y))] === 1;
  assert.ok(ok(town.spawn.x, town.spawn.y));
  for (const n of town.npcs) assert.ok(ok(n.x, n.y), `npc ${n.id}`);
  for (const p of town.pois) assert.ok(ok(p.x, p.y), `poi ${p.id}`);
  for (const m of town.machines) assert.ok(ok(m.x, m.y), `machine ${m.id}`);
  assert.ok(!Tn.isSolid(town.tiles[Tn.tileIndex(Math.floor(town.spawn.x), Math.floor(town.spawn.y))]));
});
test("town has roads for cars and traffic lanes lie on roads", () => {
  const town = Tn.buildTown();
  for (const l of town.lanes) {
    const mid = l.dir === "E" || l.dir === "W" ? { x: 20, y: l.y } : { x: l.x, y: 20 };
    assert.equal(town.tiles[Tn.tileIndex(mid.x, mid.y)], Tn.T.ROAD, `${l.dir} lane`);
  }
  const counts = new Map<number, number>();
  for (const t of town.tiles) counts.set(t, (counts.get(t) ?? 0) + 1);
  for (const t of [Tn.T.ROAD, Tn.T.SIDEWALK, Tn.T.BUILDING, Tn.T.FLOOR, Tn.T.PLAZA, Tn.T.WATER, Tn.T.TREE, Tn.T.BRIDGE, Tn.T.GRASS]) assert.ok((counts.get(t) ?? 0) > 0, `tile type ${t}`);
});
test("most of the map is open to the player (large connected world)", () => {
  const town = Tn.buildTown();
  const seen = Tn.reachable(town, town.spawn);
  let walk = 0;
  let open = 0;
  for (let i = 0; i < town.tiles.length; i++) {
    if (!Tn.isSolid(town.tiles[i])) {
      walk++;
      if (seen[i]) open++;
    }
  }
  assert.ok(open / walk > 0.97, `${open}/${walk}`);
});
