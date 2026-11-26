// Cul-de-Sac Heroes — pure rules for a small turn-based tactics game (no DOM, no network).
// Kids in homemade hero gear defend the neighborhood from rogue yard machines. Everything here is
// deterministic given the state (the RNG lives inside it), so the host can run the match and
// broadcast the result while every client only renders.

export const W = 8;
export const H = 6;
export const MAX_WAVE = 5;

export type Pos = { x: number; y: number };
export type HeroKind = "kettle" | "sparkplug" | "marsh" | "glitch";
export type FoeKind = "goblin" | "drone" | "monitor" | "mower";
export type Aim = "foe" | "ally" | "tile" | "line" | "self";

export type Skill = {
  id: string;
  name: string;
  info: string;
  aim: Aim;
  range: number;
  dmg?: number;
  heal?: number;
  shield?: number;
  aoe?: number;
  knock?: number;
  stun?: number;
  swap?: boolean;
  cd: number;
  ult?: boolean;
};

export type Kind = { name: string; emoji: string; hp: number; move: number; blurb: string; skills: Skill[] };

export const HEROES: Record<HeroKind, Kind> = {
  kettle: {
    name: "Captain Kettle",
    emoji: "🫖",
    hp: 36,
    move: 3,
    blurb: "Bruiser. Hits hard up close and shoves things around.",
    skills: [
      { id: "punch", name: "Lid Punch", info: "Hit an adjacent foe and shove it back.", aim: "foe", range: 1, dmg: 8, knock: 1, cd: 0 },
      { id: "boil", name: "Boil Over", info: "Scalding burst around you, shoves everyone away.", aim: "self", range: 0, dmg: 7, aoe: 1, knock: 1, cd: 3 },
      { id: "whistle", name: "Whistle Blast", info: "ULT: huge blast that stuns everything near.", aim: "self", range: 0, dmg: 14, aoe: 2, stun: 1, cd: 0, ult: true },
    ],
  },
  sparkplug: {
    name: "Sparkplug",
    emoji: "⚡",
    hp: 26,
    move: 3,
    blurb: "Ranged. Slingshots down a lane, splash on the special.",
    skills: [
      { id: "sling", name: "Slingshot", info: "Fire down a row or column — hits the first foe.", aim: "line", range: 5, dmg: 7, cd: 0 },
      { id: "ricochet", name: "Ricochet", info: "Hit a foe; neighbors take splash damage.", aim: "foe", range: 4, dmg: 6, aoe: 1, cd: 2 },
      { id: "barrage", name: "Overclock Barrage", info: "ULT: big blast anywhere in range.", aim: "tile", range: 6, dmg: 16, aoe: 1, cd: 0, ult: true },
    ],
  },
  marsh: {
    name: "Doc Marshmallow",
    emoji: "🍡",
    hp: 28,
    move: 3,
    blurb: "Healer. Patches up friends, pokes with fluff.",
    skills: [
      { id: "fluff", name: "Fluff Toss", info: "Lob fluff at a foe.", aim: "foe", range: 3, dmg: 5, cd: 0 },
      { id: "aid", name: "Cuddle Aid", info: "Heal a friend (or yourself).", aim: "ally", range: 3, heal: 12, cd: 2 },
      { id: "hug", name: "Group Hug", info: "ULT: heal and shield every friend nearby.", aim: "self", range: 0, heal: 15, shield: 6, aoe: 3, cd: 0, ult: true },
    ],
  },
  glitch: {
    name: "Glitch",
    emoji: "🌀",
    hp: 24,
    move: 4,
    blurb: "Trickster. Fast, swaps places, stuns with static.",
    skills: [
      { id: "zap", name: "Static Zap", info: "Zap a foe within 2.", aim: "foe", range: 2, dmg: 6, cd: 0 },
      { id: "swap", name: "Swap Shot", info: "Trade places with anyone in range. Foes get stunned.", aim: "tile", range: 4, swap: true, stun: 1, cd: 2 },
      { id: "blackout", name: "Blackout", info: "ULT: damage and stun in an area.", aim: "tile", range: 5, dmg: 10, aoe: 1, stun: 1, cd: 0, ult: true },
    ],
  },
};

export type FoeDef = { name: string; emoji: string; hp: number; move: number; range: number; dmg: number; armor: number; ring?: number };
export const FOES: Record<FoeKind, FoeDef> = {
  goblin: { name: "Lawn Goblin", emoji: "🧌", hp: 14, move: 3, range: 1, dmg: 5, armor: 0 },
  drone: { name: "Sprinkler Drone", emoji: "🚁", hp: 10, move: 2, range: 3, dmg: 4, armor: 0 },
  monitor: { name: "Hall Monitor Bot", emoji: "🤖", hp: 28, move: 2, range: 1, dmg: 7, armor: 2 },
  mower: { name: "Mega Mower", emoji: "🚜", hp: 80, move: 2, range: 1, dmg: 9, armor: 1, ring: 6 },
};

export type Unit = {
  id: string;
  team: "hero" | "foe";
  kind: HeroKind | FoeKind;
  name: string;
  emoji: string;
  owner?: string;
  x: number;
  y: number;
  hp: number;
  max: number;
  shield: number;
  hype: number;
  stun: number;
  moved: boolean;
  acted: boolean;
  done: boolean;
  cds: Record<string, number>;
};

export type Battle = {
  v: 1;
  rng: number;
  wave: number;
  round: number;
  phase: "heroes" | "won" | "lost";
  units: Unit[];
  log: string[];
  kills: number;
  score: number;
};

export type PartyEntry = { player: string; name: string; hero: HeroKind };
export type Action =
  | { t: "move"; unit: string; to: Pos }
  | { t: "skill"; unit: string; skill: string; at?: Pos }
  | { t: "end" };

const key = (x: number, y: number) => `${x},${y}`;
const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
const dist = (a: Pos, b: Pos) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const cheb = (a: Pos, b: Pos) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** mulberry32 over a state-held counter: same state in, same dice out */
function roll(s: Battle, n: number) {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) % n;
}
const clone = (s: Battle): Battle => JSON.parse(JSON.stringify(s));
const say = (s: Battle, line: string) => {
  s.log.push(line);
  if (s.log.length > 40) s.log.shift();
};

export const heroes = (s: Battle) => s.units.filter((u) => u.team === "hero");
export const foes = (s: Battle) => s.units.filter((u) => u.team === "foe" && u.hp > 0);
export const livingHeroes = (s: Battle) => heroes(s).filter((u) => u.hp > 0);
export const unitAt = (s: Battle, x: number, y: number) => s.units.find((u) => u.hp > 0 && u.x === x && u.y === y);
export const byId = (s: Battle, id: string) => s.units.find((u) => u.id === id);
export const skillsOf = (u: Unit): Skill[] => (u.team === "hero" ? HEROES[u.kind as HeroKind].skills : []);

function spawnWave(s: Battle, wave: number) {
  const n = livingHeroes(s).length;
  const extra = Math.max(0, n - 2);
  const plan: FoeKind[] =
    wave === 1 ? ["goblin", "goblin", "goblin"]
    : wave === 2 ? ["goblin", "goblin", "drone", "drone"]
    : wave === 3 ? ["monitor", "goblin", "goblin", "drone"]
    : wave === 4 ? ["monitor", "monitor", "goblin", "drone", "drone"]
    : ["mower", "goblin", "goblin"];
  for (let i = 0; i < extra; i++) plan.push(i % 2 ? "drone" : "goblin");
  const free: Pos[] = [];
  for (let x = W - 1; x >= W - 3; x--) for (let y = 0; y < H; y++) free.push({ x, y });
  plan.forEach((kind, i) => {
    const def = FOES[kind];
    let spot = free.splice(roll(s, free.length), 1)[0];
    if (kind === "mower") spot = { x: W - 2, y: Math.floor(H / 2) };
    if (!spot) return;
    while (unitAt(s, spot.x, spot.y)) spot = { x: spot.x, y: (spot.y + 1) % H };
    const hp = Math.round(def.hp * (1 + 0.15 * (wave - 1)));
    s.units.push({ id: `f${wave}-${i}`, team: "foe", kind, name: def.name, emoji: def.emoji, x: spot.x, y: spot.y, hp, max: hp, shield: 0, hype: 0, stun: 0, moved: false, acted: false, done: false, cds: {} });
  });
  say(s, wave === MAX_WAVE ? "⚠️ The Mega Mower rolls in!" : `Wave ${wave}: ${plan.length} yard machines appear.`);
}

export function createBattle(party: PartyEntry[], seed: number): Battle {
  const s: Battle = { v: 1, rng: seed >>> 0, wave: 1, round: 1, phase: "heroes", units: [], log: [], kills: 0, score: 0 };
  party.slice(0, 4).forEach((p, i) => {
    const k = HEROES[p.hero];
    s.units.push({ id: `h${i}`, team: "hero", kind: p.hero, name: k.name, emoji: k.emoji, owner: p.player, x: 0, y: 1 + i, hp: k.hp, max: k.hp, shield: 0, hype: 0, stun: 0, moved: false, acted: false, done: false, cds: {} });
  });
  spawnWave(s, 1);
  say(s, "Your turn! Move, then act — or end your turn.");
  return s;
}

/** tiles a unit can walk to this turn (BFS around other units) */
export function moveTiles(s: Battle, u: Unit): Pos[] {
  if (u.hp <= 0 || u.moved || u.done || s.phase !== "heroes") return [];
  const move = u.team === "hero" ? HEROES[u.kind as HeroKind].move : FOES[u.kind as FoeKind].move;
  return reach(s, u, move);
}

function reach(s: Battle, u: Unit, steps: number): Pos[] {
  const seen = new Map<string, number>([[key(u.x, u.y), 0]]);
  const queue: Pos[] = [{ x: u.x, y: u.y }];
  const out: Pos[] = [];
  while (queue.length) {
    const p = queue.shift()!;
    const d = seen.get(key(p.x, p.y))!;
    if (d === steps) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = p.x + dx;
      const y = p.y + dy;
      if (!inBounds(x, y) || seen.has(key(x, y)) || unitAt(s, x, y)) continue;
      seen.set(key(x, y), d + 1);
      queue.push({ x, y });
      out.push({ x, y });
    }
  }
  return out;
}

const lineHit = (s: Battle, from: Pos, at: Pos, range: number): Unit | null => {
  const dx = Math.sign(at.x - from.x);
  const dy = Math.sign(at.y - from.y);
  for (let i = 1; i <= range; i++) {
    const x = from.x + dx * i;
    const y = from.y + dy * i;
    if (!inBounds(x, y)) break;
    const u = unitAt(s, x, y);
    if (u) return u.team === "foe" ? u : null;
  }
  return null;
};

export function canUse(u: Unit, sk: Skill): boolean {
  if (u.hp <= 0 || u.acted || u.done) return false;
  if (sk.ult) return u.hype >= 100;
  return (u.cds[sk.id] ?? 0) <= 0;
}

/** tiles this skill may be aimed at (self-centered skills return the unit's own tile) */
export function skillTiles(s: Battle, u: Unit, sk: Skill): Pos[] {
  if (!canUse(u, sk) || s.phase !== "heroes") return [];
  if (sk.aim === "self") return [{ x: u.x, y: u.y }];
  const out: Pos[] = [];
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      const d = dist(u, { x, y });
      if (d < 1 || d > sk.range) continue;
      const t = unitAt(s, x, y);
      if (sk.aim === "foe" && t?.team === "foe") out.push({ x, y });
      else if (sk.aim === "ally" && t?.team === "hero") out.push({ x, y });
      else if (sk.aim === "tile") out.push({ x, y });
      else if (sk.aim === "line" && (x === u.x || y === u.y) && lineHit(s, u, { x, y }, sk.range)) out.push({ x, y });
    }
  }
  if (sk.aim === "ally") out.push({ x: u.x, y: u.y });
  return out;
}

function hurt(s: Battle, target: Unit, amount: number, src: string) {
  const armor = target.team === "foe" ? FOES[target.kind as FoeKind].armor : 0;
  let dmg = Math.max(1, amount - armor + (roll(s, 3) - 1));
  const soak = Math.min(target.shield, dmg);
  target.shield -= soak;
  dmg -= soak;
  target.hp = Math.max(0, target.hp - dmg);
  say(s, `${src} hits ${target.name} for ${dmg}${soak ? ` (+${soak} absorbed)` : ""}.`);
  if (target.team === "hero") target.hype = Math.min(100, target.hype + dmg * 2);
  if (target.hp === 0) {
    say(s, `${target.name} is down!`);
    if (target.team === "foe") {
      s.kills++;
      s.score += 10;
    }
  }
  return dmg;
}

function shove(s: Battle, target: Unit, from: Pos, steps: number) {
  const dx = Math.sign(target.x - from.x);
  const dy = Math.sign(target.y - from.y);
  if (dx === 0 && dy === 0) return;
  for (let i = 0; i < steps; i++) {
    const x = target.x + (dx !== 0 ? dx : 0);
    const y = target.y + (dx === 0 ? dy : 0);
    if (!inBounds(x, y) || unitAt(s, x, y)) {
      hurt(s, target, 2, "A bonk");
      return;
    }
    target.x = x;
    target.y = y;
  }
}

function applySkill(s: Battle, u: Unit, sk: Skill, at: Pos) {
  const gain = (n: number) => {
    if (!sk.ult) u.hype = Math.min(100, u.hype + n);
  };
  if (sk.swap) {
    const t = unitAt(s, at.x, at.y);
    const from = { x: u.x, y: u.y };
    if (t) {
      t.x = from.x;
      t.y = from.y;
      if (t.team === "foe" && sk.stun) t.stun = Math.max(t.stun, sk.stun);
    }
    u.x = at.x;
    u.y = at.y;
    say(s, `${u.name} uses ${sk.name}!`);
    gain(15);
    return;
  }
  say(s, `${u.name} uses ${sk.name}!`);
  if (sk.aim === "line") {
    const t = lineHit(s, u, at, sk.range);
    if (t && sk.dmg) {
      const d = hurt(s, t, sk.dmg, u.name);
      gain(d * 2);
    }
    return;
  }
  const center = sk.aim === "self" ? { x: u.x, y: u.y } : at;
  const radius = sk.aoe ?? 0;
  const hits = s.units.filter((x) => x.hp > 0 && cheb(x, center) <= radius && (radius > 0 || (x.x === center.x && x.y === center.y)));
  if (sk.aim === "foe" && !hits.some((x) => x.team === "foe")) return;
  let dealt = 0;
  for (const t of hits) {
    if (sk.dmg && t.team === "foe") {
      const primary = t.x === center.x && t.y === center.y;
      const amount = sk.aim === "foe" && radius > 0 && !primary ? Math.ceil(sk.dmg / 2) : sk.dmg;
      dealt += hurt(s, t, amount, u.name);
      if (t.hp > 0 && sk.knock) shove(s, t, sk.aim === "self" ? u : center, sk.knock);
      if (t.hp > 0 && sk.stun) t.stun = Math.max(t.stun, sk.stun);
    }
    if (t.team === "hero" && (sk.heal || sk.shield)) {
      if (sk.heal) t.hp = Math.min(t.max, t.hp + sk.heal);
      if (sk.shield) t.shield += sk.shield;
      say(s, `${t.name} is patched up${sk.heal ? ` (+${sk.heal})` : ""}.`);
      gain(10);
    }
  }
  gain(dealt * 2);
}

function checkEnd(s: Battle) {
  if (livingHeroes(s).length === 0) {
    s.phase = "lost";
    say(s, "The neighborhood falls… 💀");
    return true;
  }
  if (foes(s).length === 0) {
    s.score += s.wave * 50 + livingHeroes(s).reduce((a, h) => a + h.hp, 0);
    if (s.wave >= MAX_WAVE) {
      s.phase = "won";
      say(s, "🎉 The neighborhood is safe! You win!");
      return true;
    }
    s.wave++;
    s.round = 1;
    s.units = s.units.filter((x) => x.team === "hero");
    for (const h of heroes(s)) {
      if (h.hp <= 0) h.hp = Math.ceil(h.max * 0.4);
      else h.hp = Math.min(h.max, h.hp + Math.ceil(h.max * 0.25));
      h.hype = Math.min(100, h.hype + 20);
      h.cds = {};
      h.stun = 0;
      h.moved = h.acted = h.done = false;
    }
    heroes(s).forEach((h, i) => {
      h.x = 0;
      h.y = 1 + i;
    });
    spawnWave(s, s.wave);
    return true;
  }
  return false;
}

function foeTurn(s: Battle) {
  for (const f of s.units.filter((x) => x.team === "foe" && x.hp > 0)) {
    if (s.phase !== "heroes") break;
    if (f.stun > 0) {
      f.stun--;
      say(s, `${f.name} is stunned and loses its turn.`);
      continue;
    }
    const def = FOES[f.kind as FoeKind];
    const targets = livingHeroes(s);
    if (!targets.length) break;
    const nearest = () => [...targets].sort((a, b) => dist(f, a) - dist(f, b) || a.hp - b.hp)[0]!;
    let tgt = nearest();
    if (dist(f, tgt) > def.range) {
      const tiles = reach(s, f, def.move);
      const best = tiles.sort((a, b) => dist(a, tgt) - dist(b, tgt))[0];
      if (best && dist(best, tgt) < dist(f, tgt)) {
        f.x = best.x;
        f.y = best.y;
      }
      tgt = nearest();
    }
    if (def.ring && s.round % 2 === 0) {
      const around = targets.filter((h) => cheb(h, f) <= 1);
      if (around.length) {
        say(s, `${f.name} spins its blades!`);
        for (const h of around) hurt(s, h, def.ring, f.name);
        continue;
      }
    }
    if (dist(f, tgt) <= def.range) hurt(s, tgt, def.dmg, f.name);
  }
}

function endRound(s: Battle) {
  foeTurn(s);
  if (checkEnd(s)) return;
  s.round++;
  for (const h of heroes(s)) {
    h.moved = h.acted = h.done = h.hp <= 0;
    for (const id of Object.keys(h.cds)) h.cds[id] = Math.max(0, (h.cds[id] ?? 0) - 1);
  }
  for (const h of heroes(s)) if (h.hp > 0) h.done = false;
}

function maybeEndRound(s: Battle) {
  if (s.phase !== "heroes") return;
  if (checkEnd(s)) return;
  if (livingHeroes(s).every((h) => h.done || (h.moved && h.acted))) endRound(s);
}

export type Result = { state: Battle; error?: string };

/** Validates and applies one player's action. Returns the new state (the input is never mutated). */
export function act(state: Battle, player: string, a: Action): Result {
  if (!a || typeof a !== "object") return { state, error: "Bad action." };
  if (a.t === "move" && !(a.to && Number.isInteger(a.to.x) && Number.isInteger(a.to.y))) return { state, error: "Bad action." };
  if (a.t === "skill" && a.at && !(Number.isInteger(a.at.x) && Number.isInteger(a.at.y))) return { state, error: "Bad action." };
  if (a.t !== "end" && a.t !== "move" && a.t !== "skill") return { state, error: "Bad action." };
  const s = clone(state);
  if (s.phase !== "heroes") return { state, error: "The battle is over." };
  if (a.t === "end") {
    const mine = livingHeroes(s).filter((h) => h.owner === player);
    if (!mine.length) return { state, error: "You have no heroes left." };
    for (const h of mine) h.done = true;
    maybeEndRound(s);
    return { state: s };
  }
  const u = byId(s, a.unit);
  if (!u || u.team !== "hero" || u.owner !== player) return { state, error: "That's not your hero." };
  if (u.hp <= 0) return { state, error: "That hero is down." };
  if (u.done) return { state, error: "That hero already ended their turn." };
  if (a.t === "move") {
    if (!moveTiles(s, u).some((p) => p.x === a.to.x && p.y === a.to.y)) return { state, error: "Can't move there." };
    u.x = a.to.x;
    u.y = a.to.y;
    u.moved = true;
    maybeEndRound(s);
    return { state: s };
  }
  const sk = skillsOf(u).find((k) => k.id === a.skill);
  if (!sk) return { state, error: "Unknown skill." };
  if (!canUse(u, sk)) return { state, error: sk.ult ? "Ultimate isn't charged yet." : "That skill isn't ready." };
  const at = sk.aim === "self" ? { x: u.x, y: u.y } : a.at;
  if (!at || !skillTiles(s, u, sk).some((p) => p.x === at.x && p.y === at.y)) return { state, error: "Pick a valid target." };
  applySkill(s, u, sk, at);
  if (sk.ult) u.hype = 0;
  else if (sk.cd) u.cds[sk.id] = sk.cd;
  u.acted = true;
  maybeEndRound(s);
  return { state: s };
}

/** Everyone is waiting on these players to finish their turn */
export function waitingOn(s: Battle): string[] {
  if (s.phase !== "heroes") return [];
  const names = new Set<string>();
  for (const h of livingHeroes(s)) if (!(h.done || (h.moved && h.acted))) names.add(h.owner ?? "");
  return [...names];
}
