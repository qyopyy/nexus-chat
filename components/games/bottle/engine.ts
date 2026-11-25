/** Bottle Run — the open-world canvas engine (top-down town, traffic, NPCs, pets, litter). No React inside. */
import * as B from "@/lib/sim/bottle";
import { buildTown, isSolid, T, TILE, W, H, tileIndex, type Town } from "@/lib/sim/town";
import type { Sfx } from "@/lib/sim/sfx";

export type Hooks = {
  onEvent: (ev: B.QEvent) => void;
  onSfx: (name: Sfx) => void;
  onToast: (msg: string) => void;
  onChange: () => void; // save changed (bag / money / progress)
};

export type Target =
  | { type: "npc"; id: string; name: string; label: string }
  | { type: "machine"; id: string; label: string }
  | null;

type Litter = { id: number; x: number; y: number; kind: B.Kind; dirty: boolean; bob: number };
type Npc = { id: string; name: string; x: number; y: number; tx: number; ty: number; wait: number; stuck: number; speed: number; shirt: string; skin: string; hat?: string; giver: boolean; face: number; step: number };
type Car = { x: number; y: number; dir: "E" | "W" | "N" | "S"; speed: number; max: number; color: string; honk: number };
type Pet = { id: B.PetId; x: number; y: number; face: number };

const PLAYER_R = 9;
const CAR_COLORS = ["#ef4444", "#3b82f6", "#f59e0b", "#10b981", "#a855f7", "#e5e7eb", "#111827", "#f97316"];
const ROOF = ["#c0563f", "#6b7bb5", "#d9a441", "#7aa874", "#9b6fb0", "#c98c5d", "#5f8fa8"];

function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export class BottleWorld {
  town: Town = buildTown();
  save: B.Save;
  hooks: Hooks;
  px = 0;
  py = 0;
  face = 1;
  moving = false;
  input = { dx: 0, dy: 0 };
  litter: Litter[] = [];
  npcs: Npc[] = [];
  cars: Car[] = [];
  pets: Pet[] = [];
  time = 0;
  private nextId = 1;
  private hitCd = 0;
  private fullToast = 0;
  private stepAcc = 0;
  private dogCd = 0;
  private respawn = 0;
  private statics: HTMLCanvasElement | null = null;
  private mini: HTMLCanvasElement | null = null;
  private w = 640;
  private h = 480;
  private dpr = 1;
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement, save: B.Save, hooks: Hooks) {
    this.save = save;
    this.hooks = hooks;
    const c = canvas.getContext("2d");
    if (!c) throw new Error("Canvas 2D is not available");
    this.ctx = c;
    const sp = this.town.spawn;
    const p = save.pos.x > 0 && save.pos.y > 0 && !this.blocked(save.pos.x, save.pos.y, PLAYER_R) ? save.pos : { x: sp.x * TILE, y: sp.y * TILE };
    this.px = p.x;
    this.py = p.y;
    this.spawnNpcs();
    this.spawnCars();
    for (let i = 0; i < 46; i++) this.spawnLitter(true);
    this.syncPets();
  }

  /* ───────── setup ───────── */
  resize(w: number, h: number, dpr: number) {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
  }

  private spawnNpcs() {
    const giverIds = new Set(this.town.npcs.map((n) => n.id));
    for (const n of this.town.npcs) {
      this.npcs.push({ id: n.id, name: n.name, x: n.x * TILE, y: n.y * TILE, tx: n.x * TILE, ty: n.y * TILE, wait: 1, stuck: 0, speed: 0, shirt: n.shirt, skin: n.skin, hat: n.hat, giver: true, face: 1, step: 0 });
    }
    const shirts = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#a855f7", "#14b8a6", "#f97316", "#64748b"];
    const skins = ["#f1c9a5", "#d6a67c", "#c68e5d", "#8d5a3b", "#e8b995"];
    let n = 0;
    let tries = 0;
    while (n < 16 && tries++ < 400) {
      const tx = 1 + Math.floor(Math.random() * (W - 2));
      const ty = 1 + Math.floor(Math.random() * (H - 2));
      const t = this.town.tiles[tileIndex(tx, ty)];
      if (t !== T.SIDEWALK && t !== T.PLAZA) continue;
      this.npcs.push({ id: `w${n}`, name: "Local", x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, tx: (tx + 0.5) * TILE, ty: (ty + 0.5) * TILE, wait: Math.random() * 2, stuck: 0, speed: 38 + Math.random() * 24, shirt: shirts[n % shirts.length], skin: skins[n % skins.length], giver: false, face: 1, step: Math.random() * 6 });
      n++;
    }
    void giverIds;
  }

  private spawnCars() {
    for (const lane of this.town.lanes) {
      const count = lane.len > 50 ? 3 : 2;
      for (let i = 0; i < count; i++) {
        const along = ((i + Math.random() * 0.6) / count) * lane.len * TILE;
        const horiz = lane.dir === "E" || lane.dir === "W";
        const x = horiz ? (lane.dir === "E" ? along : (W - 1) * TILE + TILE - along) : (lane.x + 0.5) * TILE;
        const y = horiz ? (lane.y + 0.5) * TILE : lane.dir === "S" ? along : H * TILE - along;
        this.cars.push({ x, y, dir: lane.dir, speed: 0, max: 85 + Math.random() * 55, color: CAR_COLORS[(this.cars.length * 3) % CAR_COLORS.length], honk: 0 });
      }
    }
  }

  private randomLitterSpot() {
    for (let k = 0; k < 40; k++) {
      const tx = 1 + Math.floor(Math.random() * (W - 2));
      const ty = 1 + Math.floor(Math.random() * (H - 2));
      const t = this.town.tiles[tileIndex(tx, ty)];
      if (t === T.ROAD || isSolid(t) || t === T.BRIDGE) continue;
      const x = (tx + 0.2 + Math.random() * 0.6) * TILE;
      const y = (ty + 0.2 + Math.random() * 0.6) * TILE;
      return { x, y };
    }
    return null;
  }

  private spawnLitter(initial = false, at?: { x: number; y: number }, kind?: B.Kind) {
    const spot = at ?? this.randomLitterSpot();
    if (!spot) return;
    if (!initial && !at && Math.hypot(spot.x - this.px, spot.y - this.py) < 260) return;
    const r = Math.random();
    if (this.litter.length >= 90) this.litter.shift();
    this.litter.push({ id: this.nextId++, x: spot.x, y: spot.y, kind: kind ?? (r < 0.45 ? "plastic" : r < 0.75 ? "glass" : "can"), dirty: Math.random() < B.perks(this.save).dirtyChance, bob: Math.random() * 6 });
  }

  syncPets() {
    const have = new Set(this.save.pets);
    this.pets = this.pets.filter((p) => have.has(p.id));
    for (const id of this.save.pets) if (!this.pets.some((p) => p.id === id)) this.pets.push({ id, x: this.px - 18, y: this.py + 12, face: 1 });
  }

  /* ───────── collision ───────── */
  blocked(x: number, y: number, r: number) {
    const x0 = Math.floor((x - r) / TILE);
    const x1 = Math.floor((x + r) / TILE);
    const y0 = Math.floor((y - r) / TILE);
    const y1 = Math.floor((y + r) / TILE);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) {
        if (tx < 0 || ty < 0 || tx >= W || ty >= H) return true;
        if (isSolid(this.town.tiles[tileIndex(tx, ty)])) return true;
      }
    return false;
  }

  /* ───────── interaction ───────── */
  target(): Target {
    let best: Target = null;
    let bd = 52;
    for (const n of this.npcs) {
      if (!n.giver) continue;
      const d = Math.hypot(n.x - this.px, n.y - this.py);
      if (d < bd) {
        bd = d;
        best = { type: "npc", id: n.id, name: n.name, label: `Talk to ${n.name}` };
      }
    }
    for (const m of this.town.machines) {
      const d = Math.hypot(m.x * TILE - this.px, m.y * TILE - this.py);
      if (d < Math.min(bd, 58)) {
        bd = d;
        best = { type: "machine", id: m.id, label: "Use return machine" };
      }
    }
    return best;
  }

  /** nearest quest-giver position the UI can point toward (for the compass arrow) */
  questTargets() {
    const out: { x: number; y: number; m: string }[] = [];
    for (const n of this.npcs) {
      if (!n.giver) continue;
      const m = B.markerFor(this.save.quests, n.id);
      if (m) out.push({ x: n.x, y: n.y, m });
    }
    return out;
  }

  private collect(l: Litter) {
    const cap = B.perks(this.save).capacity;
    if (this.save.bag.length >= cap) {
      if (this.time - this.fullToast > 2.5) {
        this.fullToast = this.time;
        this.hooks.onToast("Bag full! Return items at the Market Hall ♻️");
      }
      return false;
    }
    this.save.bag.push({ kind: l.kind, dirty: l.dirty });
    this.save.collected++;
    this.litter = this.litter.filter((x) => x.id !== l.id);
    this.respawn += 1;
    this.hooks.onSfx("pickup");
    this.hooks.onEvent({ t: "collect", kind: l.kind });
    this.hooks.onChange();
    return true;
  }

  private dropFromBag(n: number) {
    const lost = Math.min(n, this.save.bag.length);
    for (let i = 0; i < lost; i++) {
      const it = this.save.bag.pop();
      if (it) this.spawnLitter(true, { x: this.px + (Math.random() - 0.5) * 70, y: this.py + (Math.random() - 0.5) * 70 }, it.kind);
    }
    if (lost) this.hooks.onChange();
    return lost;
  }

  /* ───────── update ───────── */
  update(dtRaw: number) {
    const dt = Math.min(0.05, dtRaw);
    this.time += dt;
    const p = B.perks(this.save);
    this.hitCd = Math.max(0, this.hitCd - dt);

    // player movement
    let { dx, dy } = this.input;
    const len = Math.hypot(dx, dy);
    this.moving = len > 0.05;
    if (this.moving) {
      if (len > 1) {
        dx /= len;
        dy /= len;
      }
      const sp = 118 * p.speed;
      const nx = this.px + dx * sp * dt;
      const ny = this.py + dy * sp * dt;
      const ox = this.px;
      const oy = this.py;
      if (!this.blocked(nx, this.py, PLAYER_R)) this.px = nx;
      if (!this.blocked(this.px, ny, PLAYER_R)) this.py = ny;
      if (dx !== 0) this.face = dx > 0 ? 1 : -1;
      const moved = Math.hypot(this.px - ox, this.py - oy);
      this.stepAcc += moved;
      if (this.stepAcc >= 80) {
        const steps = Math.floor(this.stepAcc / 8);
        this.stepAcc -= steps * 8;
        this.save.walked += steps;
        this.hooks.onEvent({ t: "walk", px: steps });
      }
    }

    // litter pickup (player + dog)
    for (const l of this.litter.slice()) {
      if (Math.hypot(l.x - this.px, l.y - this.py) < p.pickupRadius) this.collect(l);
    }
    if (p.petRadius > 0) {
      this.dogCd -= dt;
      if (this.dogCd <= 0) {
        const near = this.litter.find((l) => Math.hypot(l.x - this.px, l.y - this.py) < p.petRadius);
        if (near && this.collect(near)) {
          this.dogCd = 1.1;
          const d = this.pets.find((q) => q.id === "dog");
          if (d) {
            d.x = near.x;
            d.y = near.y;
          }
        } else this.dogCd = 0.4;
      }
    }
    if (p.canFind > 0 && this.moving && Math.random() < p.canFind * dt) this.spawnLitter(true, { x: this.px + (Math.random() - 0.5) * 120, y: this.py + (Math.random() - 0.5) * 120 }, "can");

    // keep the town littered
    const target = 46;
    if (this.litter.length < target && this.respawn > 0 && Math.random() < dt * 1.2) {
      this.spawnLitter(false);
      this.respawn = Math.max(0, this.respawn - 1);
    }

    // points of interest
    for (const poi of this.town.pois) {
      if (this.save.visited.includes(poi.id)) continue;
      if (Math.hypot(poi.x * TILE - this.px, poi.y * TILE - this.py) < poi.r * TILE) {
        this.save.visited.push(poi.id);
        this.hooks.onToast(`📍 Discovered: ${poi.name}`);
        this.hooks.onEvent({ t: "visit", poi: poi.id });
      }
    }
    for (const poi of this.town.pois) {
      // quests may need a revisit after being accepted later — re-emit while standing inside
      if (this.save.visited.includes(poi.id) && Math.hypot(poi.x * TILE - this.px, poi.y * TILE - this.py) < poi.r * TILE && this.time % 1 < dt) this.hooks.onEvent({ t: "visit", poi: poi.id });
    }

    this.updateNpcs(dt);
    this.updateCars(dt);
    this.updatePets(dt);
    this.save.pos = { x: this.px, y: this.py };
  }

  private updateNpcs(dt: number) {
    for (const n of this.npcs) {
      n.step += dt * 6;
      if (n.giver) continue;
      n.wait -= dt;
      if (n.wait > 0) continue;
      const d = Math.hypot(n.tx - n.x, n.ty - n.y);
      if (d < 4 || n.stuck > 1.2) {
        n.wait = 0.5 + Math.random() * 3;
        n.stuck = 0;
        for (let k = 0; k < 8; k++) {
          const tx = n.x + (Math.random() - 0.5) * TILE * 9;
          const ty = n.y + (Math.random() - 0.5) * TILE * 9;
          const t = this.town.tiles[tileIndex(Math.max(0, Math.min(W - 1, Math.floor(tx / TILE))), Math.max(0, Math.min(H - 1, Math.floor(ty / TILE))))];
          if (t === T.ROAD || isSolid(t) || t === T.WATER) continue;
          if (!this.blocked(tx, ty, 8)) {
            n.tx = tx;
            n.ty = ty;
            break;
          }
        }
        if (Math.random() < 0.05) this.spawnLitter(true, { x: n.x + (Math.random() - 0.5) * 20, y: n.y + 14 });
        continue;
      }
      const vx = ((n.tx - n.x) / d) * n.speed * dt;
      const vy = ((n.ty - n.y) / d) * n.speed * dt;
      let moved = false;
      if (!this.blocked(n.x + vx, n.y, 8)) {
        n.x += vx;
        moved = true;
      }
      if (!this.blocked(n.x, n.y + vy, 8)) {
        n.y += vy;
        moved = true;
      }
      n.stuck = moved ? 0 : n.stuck + dt;
      if (Math.abs(vx) > 0.01) n.face = vx > 0 ? 1 : -1;
    }
  }

  private updateCars(dt: number) {
    for (const c of this.cars) {
      const horiz = c.dir === "E" || c.dir === "W";
      const fx = c.dir === "E" ? 1 : c.dir === "W" ? -1 : 0;
      const fy = c.dir === "S" ? 1 : c.dir === "N" ? -1 : 0;
      // anything ahead? (other cars in this lane, the player, pedestrians)
      let block = false;
      const ahead = (ox: number, oy: number, reach: number, half: number) => {
        const rx = ox - c.x;
        const ry = oy - c.y;
        const along = rx * fx + ry * fy;
        const side = Math.abs(horiz ? ry : rx);
        return along > 6 && along < reach && side < half;
      };
      for (const o of this.cars) if (o !== c && o.dir === c.dir && ahead(o.x, o.y, 58, 12)) block = true;
      if (ahead(this.px, this.py, 62, 17)) {
        block = true;
        c.honk -= dt;
        if (c.honk <= 0 && Math.hypot(c.x - this.px, c.y - this.py) < 220) {
          c.honk = 2.2;
          this.hooks.onSfx("horn");
        }
      }
      for (const n of this.npcs) if (ahead(n.x, n.y, 52, 14)) block = true;
      const goal = block ? 0 : c.max;
      c.speed += Math.sign(goal - c.speed) * Math.min(Math.abs(goal - c.speed), (block ? 380 : 90) * dt);
      c.x += fx * c.speed * dt;
      c.y += fy * c.speed * dt;
      if (c.x > W * TILE + 40) c.x = -40;
      if (c.x < -40) c.x = W * TILE + 40;
      if (c.y > H * TILE + 40) c.y = -40;
      if (c.y < -40) c.y = H * TILE + 40;
      // run-over check
      const hw = horiz ? 24 : 13;
      const hh = horiz ? 13 : 24;
      if (this.hitCd <= 0 && c.speed > 28 && Math.abs(c.x - this.px) < hw + PLAYER_R * 0.6 && Math.abs(c.y - this.py) < hh + PLAYER_R * 0.6) {
        this.hitCd = 2;
        const lost = this.dropFromBag(1 + Math.floor(Math.random() * 3));
        // knock to the nearest sidewalk
        const side = horiz ? { x: 0, y: this.py < c.y ? -1 : 1 } : { x: this.px < c.x ? -1 : 1, y: 0 };
        for (let k = 0; k < 60; k++) {
          const nx = this.px + side.x * 4;
          const ny = this.py + side.y * 4;
          if (this.blocked(nx, ny, PLAYER_R)) break;
          this.px = nx;
          this.py = ny;
          if (this.town.tiles[tileIndex(Math.floor(this.px / TILE), Math.floor(this.py / TILE))] !== T.ROAD) break;
        }
        this.hooks.onSfx("ouch");
        this.hooks.onToast(lost ? `Ouch! A car clipped you — you dropped ${lost} item${lost > 1 ? "s" : ""}` : "Ouch! Watch the traffic!");
      }
    }
  }

  private updatePets(dt: number) {
    this.pets.forEach((p, i) => {
      const ang = (i / Math.max(1, this.pets.length)) * Math.PI * 1.4 + Math.PI * 0.6;
      const gx = this.px + Math.cos(ang) * (22 + i * 6) * -this.face;
      const gy = this.py + Math.sin(ang) * 14 + 12;
      const d = Math.hypot(gx - p.x, gy - p.y);
      const sp = Math.min(d, (p.id === "pigeon" ? 160 : 130) * dt * (d > 60 ? 2.2 : 1));
      if (d > 2) {
        p.x += ((gx - p.x) / d) * sp;
        p.y += ((gy - p.y) / d) * sp;
        p.face = gx > p.x ? 1 : -1;
      }
      if (d > 600) {
        p.x = this.px;
        p.y = this.py;
      }
    });
  }

  /* ───────── rendering ───────── */
  private buildStatic() {
    const cv = document.createElement("canvas");
    cv.width = W * TILE;
    cv.height = H * TILE;
    const g = cv.getContext("2d");
    if (!g) return cv;
    const tiles = this.town.tiles;
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? T.TREE : tiles[tileIndex(x, y)]);
    // one roof colour per building (connected group of building tiles)
    const roofOf = new Int16Array(W * H).fill(-1);
    let nComp = 0;
    for (let sy = 0; sy < H; sy++)
      for (let sx = 0; sx < W; sx++) {
        if (tiles[tileIndex(sx, sy)] !== T.BUILDING || roofOf[tileIndex(sx, sy)] >= 0) continue;
        const stack = [sx, sy];
        roofOf[tileIndex(sx, sy)] = nComp;
        while (stack.length) {
          const cy = stack.pop() as number;
          const cx = stack.pop() as number;
          for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + ox;
            const ny = cy + oy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const k = tileIndex(nx, ny);
            if (tiles[k] === T.BUILDING && roofOf[k] < 0) {
              roofOf[k] = nComp;
              stack.push(nx, ny);
            }
          }
        }
        nComp++;
      }
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const t = tiles[tileIndex(x, y)];
        const px = x * TILE;
        const py = y * TILE;
        const hv = hash(x, y);
        switch (t) {
          case T.GRASS:
          case T.TREE:
            g.fillStyle = hv % 5 === 0 ? "#5eab3f" : "#58a23b";
            g.fillRect(px, py, TILE, TILE);
            if (hv % 7 === 0) {
              g.fillStyle = "#6bbd49";
              g.fillRect(px + (hv % 20), py + ((hv >> 3) % 20), 3, 3);
            }
            break;
          case T.ROAD: {
            g.fillStyle = "#3c4049";
            g.fillRect(px, py, TILE, TILE);
            const horiz = at(x - 1, y) === T.ROAD && at(x + 1, y) === T.ROAD && (at(x, y - 1) !== T.ROAD || at(x, y + 1) !== T.ROAD);
            const vert = at(x, y - 1) === T.ROAD && at(x, y + 1) === T.ROAD && (at(x - 1, y) !== T.ROAD || at(x + 1, y) !== T.ROAD);
            g.fillStyle = "#e8d44d";
            if (horiz && at(x, y + 1) === T.ROAD && at(x, y - 1) !== T.ROAD) {
              if (x % 2 === 0) g.fillRect(px + 6, py + TILE - 2, 20, 4);
            } else if (vert && at(x + 1, y) === T.ROAD && at(x - 1, y) !== T.ROAD) {
              if (y % 2 === 0) g.fillRect(px + TILE - 2, py + 6, 4, 20);
            }
            break;
          }
          case T.SIDEWALK:
            g.fillStyle = (x + y) % 2 ? "#bdbab2" : "#b4b1a9";
            g.fillRect(px, py, TILE, TILE);
            break;
          case T.PLAZA:
            g.fillStyle = (x + y) % 2 ? "#dccdac" : "#d3c4a2";
            g.fillRect(px, py, TILE, TILE);
            g.strokeStyle = "rgba(0,0,0,.05)";
            g.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
            break;
          case T.FLOOR:
            g.fillStyle = (x + y) % 2 ? "#efe9dc" : "#e6dfce";
            g.fillRect(px, py, TILE, TILE);
            break;
          case T.WATER:
            g.fillStyle = "#3a7fc4";
            g.fillRect(px, py, TILE, TILE);
            break;
          case T.BRIDGE:
            g.fillStyle = "#3a7fc4";
            g.fillRect(px, py, TILE, TILE);
            g.fillStyle = "#946f3f";
            g.fillRect(px, py, TILE, TILE);
            g.fillStyle = "#7c5b30";
            for (let k = 0; k < 4; k++) g.fillRect(px, py + k * 8 + 6, TILE, 2);
            break;
          case T.BUILDING: {
            // roof colour per building cluster (flood by neighbours' quantised coords)
            g.fillStyle = ROOF[(roofOf[tileIndex(x, y)] * 3 + 1) % ROOF.length];
            g.fillRect(px, py, TILE, TILE);
            g.fillStyle = "rgba(255,255,255,.07)";
            g.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
            if (at(x, y + 1) !== T.BUILDING) {
              g.fillStyle = "rgba(0,0,0,.35)";
              g.fillRect(px, py + TILE - 9, TILE, 9);
              if (hv % 3 !== 0) {
                g.fillStyle = "#cde8ff";
                g.fillRect(px + 7, py + TILE - 7, 7, 5);
                g.fillRect(px + 19, py + TILE - 7, 7, 5);
              }
            }
            break;
          }
        }
      }
    // trees (canopies drawn after tiles so they overlap neighbours)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (tiles[tileIndex(x, y)] !== T.TREE) continue;
        const px = x * TILE + TILE / 2;
        const py = y * TILE + TILE / 2;
        g.fillStyle = "rgba(0,0,0,.18)";
        g.beginPath();
        g.ellipse(px + 3, py + 12, 14, 6, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#6b4a2a";
        g.fillRect(px - 2, py + 2, 4, 11);
        g.fillStyle = hash(x, y) % 2 ? "#2e7d32" : "#3a8f3d";
        g.beginPath();
        g.arc(px, py - 2, 14, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "rgba(255,255,255,.1)";
        g.beginPath();
        g.arc(px - 4, py - 6, 6, 0, Math.PI * 2);
        g.fill();
      }
    // return machines on the hall's north wall
    for (const m of this.town.machines) {
      const mx = m.x * TILE;
      const my = (Math.floor(m.y) - 1) * TILE;
      g.fillStyle = "#111";
      g.fillRect(mx - 22, my - 4, 44, 52);
      g.fillStyle = "#fde047";
      g.fillRect(mx - 20, my + 22, 40, 24);
      g.fillStyle = "#0b0b0b";
      g.beginPath();
      g.arc(mx, my + 12, 12, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#22c55e";
      g.lineWidth = 3;
      g.stroke();
      g.fillStyle = "#e5e7eb";
      g.fillRect(mx + 12, my + 2, 8, 12);
    }
    // labels
    g.textAlign = "center";
    g.font = "bold 12px system-ui, sans-serif";
    for (const l of this.town.labels) {
      g.fillStyle = "rgba(0,0,0,.45)";
      g.fillText(l.text, l.x * TILE + 1, l.y * TILE + 1);
      g.fillStyle = "#fff";
      g.fillText(l.text, l.x * TILE, l.y * TILE);
    }
    g.font = "22px system-ui, 'Apple Color Emoji', sans-serif";
    for (const p of this.town.pois) g.fillText(p.emoji, p.x * TILE, p.y * TILE + 8);
    // benches & kiosk props
    g.fillStyle = "#7c4a1d";
    for (const [bx, by] of [[9, 5], [11, 6], [34, 8], [24, 25], [27, 33], [32, 33]]) g.fillRect(bx * TILE + 4, by * TILE + 12, 24, 8);
    return cv;
  }

  private buildMini() {
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const g = cv.getContext("2d");
    if (!g) return cv;
    const col: Record<number, string> = { [T.GRASS]: "#3f7d2f", [T.ROAD]: "#555a66", [T.SIDEWALK]: "#a5a29a", [T.BUILDING]: "#9a5a4a", [T.FLOOR]: "#e6dfce", [T.PLAZA]: "#cdbf9d", [T.WATER]: "#2f6db0", [T.TREE]: "#2a6a26", [T.BRIDGE]: "#946f3f" };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      g.fillStyle = col[this.town.tiles[tileIndex(x, y)]];
      g.fillRect(x, y, 1, 1);
    }
    return cv;
  }

  drawMinimap(ctx: CanvasRenderingContext2D, size: number) {
    if (!this.mini) this.mini = this.buildMini();
    const sx = size / W;
    const sy = (size * H) / W / H;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size * (H / W));
    ctx.drawImage(this.mini, 0, 0, size, size * (H / W));
    const dot = (x: number, y: number, c: string, r: number) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc((x / TILE) * sx, (y / TILE) * sy, r, 0, Math.PI * 2);
      ctx.fill();
    };
    if (B.perks(this.save).radar) for (const l of this.litter) dot(l.x, l.y, "#fde047", 1.2);
    for (const q of this.questTargets()) dot(q.x, q.y, q.m === "?" ? "#22c55e" : "#f59e0b", 3);
    for (const m of this.town.machines) dot(m.x * TILE, m.y * TILE, "#facc15", 2.2);
    dot(this.px, this.py, "#38bdf8", 3);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc((this.px / TILE) * sx, (this.py / TILE) * sy, 3.6, 0, Math.PI * 2);
    ctx.stroke();
  }

  private person(g: CanvasRenderingContext2D, x: number, y: number, o: { shirt: string; skin: string; hat?: string; face: number; step: number; moving: boolean; scale?: number }) {
    const s = o.scale ?? 1;
    const bob = o.moving ? Math.sin(o.step) * 1.6 : 0;
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    g.fillStyle = "rgba(0,0,0,.25)";
    g.beginPath();
    g.ellipse(0, 9, 8, 3.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#334155"; // legs
    const sw = o.moving ? Math.sin(o.step) * 3 : 0;
    g.fillRect(-4 + sw * 0.4, 3, 3, 7);
    g.fillRect(1 - sw * 0.4, 3, 3, 7);
    g.fillStyle = o.shirt;
    g.beginPath();
    g.roundRect(-6, -7 + bob, 12, 12, 4);
    g.fill();
    g.fillStyle = o.skin;
    g.beginPath();
    g.arc(0, -11 + bob, 5.5, 0, Math.PI * 2);
    g.fill();
    if (o.hat) {
      g.fillStyle = o.hat;
      g.fillRect(-6, -17 + bob, 12, 4);
      g.fillRect(o.face > 0 ? 0 : -9, -14 + bob, 9, 2);
    } else {
      g.fillStyle = "rgba(40,25,10,.8)";
      g.beginPath();
      g.arc(0, -13 + bob, 5.5, Math.PI, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "#111";
    g.fillRect(o.face > 0 ? 1 : -3, -11 + bob, 2, 2);
    g.restore();
  }

  draw() {
    const g = this.ctx;
    if (!this.statics) this.statics = this.buildStatic();
    const scale = Math.max(0.8, Math.min(this.w, this.h) / (TILE * 11));
    const vw = this.w / scale;
    const vh = this.h / scale;
    const camX = Math.max(0, Math.min(W * TILE - vw, this.px - vw / 2));
    const camY = Math.max(0, Math.min(H * TILE - vh, this.py - vh / 2));
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = "#1f3a1a";
    g.fillRect(0, 0, this.w, this.h);
    g.save();
    g.scale(scale, scale);
    g.translate(-camX, -camY);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.statics, 0, 0);

    // water shimmer
    const x0 = Math.max(0, Math.floor(camX / TILE));
    const x1 = Math.min(W - 1, Math.ceil((camX + vw) / TILE));
    const y0 = Math.max(0, Math.floor(camY / TILE));
    const y1 = Math.min(H - 1, Math.ceil((camY + vh) / TILE));
    g.strokeStyle = "rgba(255,255,255,.35)";
    g.lineWidth = 1.5;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if (this.town.tiles[tileIndex(x, y)] !== T.WATER) continue;
        const o = Math.sin(this.time * 1.6 + x * 1.7 + y) * 4;
        g.beginPath();
        g.moveTo(x * TILE + 6 + o, y * TILE + 10);
        g.lineTo(x * TILE + 16 + o, y * TILE + 10);
        g.moveTo(x * TILE + 14 - o, y * TILE + 22);
        g.lineTo(x * TILE + 26 - o, y * TILE + 22);
        g.stroke();
      }

    const radar = B.perks(this.save).radar;
    const inView = (x: number, y: number, m = 40) => x > camX - m && x < camX + vw + m && y > camY - m && y < camY + vh + m;

    // litter
    g.textAlign = "center";
    g.font = "17px system-ui, 'Apple Color Emoji', sans-serif";
    for (const l of this.litter) {
      if (!inView(l.x, l.y)) continue;
      const bob = Math.sin(this.time * 3 + l.bob) * 1.5;
      if (radar) {
        g.fillStyle = "rgba(253,224,71,.28)";
        g.beginPath();
        g.arc(l.x, l.y, 11 + Math.sin(this.time * 4 + l.bob) * 2, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = "rgba(0,0,0,.2)";
      g.beginPath();
      g.ellipse(l.x, l.y + 8, 6, 2.5, 0, 0, Math.PI * 2);
      g.fill();
      g.fillText(B.KINDS[l.kind].emoji, l.x, l.y + 5 + bob);
      if (l.dirty) {
        g.fillStyle = "rgba(120,72,20,.9)";
        g.beginPath();
        g.arc(l.x + 6, l.y + 7, 2.6, 0, Math.PI * 2);
        g.fill();
      }
    }

    // y-sorted actors
    type A = { y: number; f: () => void };
    const actors: A[] = [];
    for (const n of this.npcs) {
      if (!inView(n.x, n.y)) continue;
      actors.push({
        y: n.y,
        f: () => {
          this.person(g, n.x, n.y, { shirt: n.shirt, skin: n.skin, hat: n.hat, face: n.face, step: n.step, moving: !n.giver && n.wait <= 0 && n.speed > 0 });
          if (n.giver) {
            const m = B.markerFor(this.save.quests, n.id);
            const t = Math.sin(this.time * 4) * 2;
            if (m) {
              g.fillStyle = m === "?" ? "#22c55e" : "#f59e0b";
              g.beginPath();
              g.arc(n.x, n.y - 30 + t, 8, 0, Math.PI * 2);
              g.fill();
              g.fillStyle = "#111";
              g.font = "bold 12px system-ui, sans-serif";
              g.fillText(m, n.x, n.y - 26 + t);
            }
            g.font = "bold 9px system-ui, sans-serif";
            g.fillStyle = "rgba(0,0,0,.55)";
            g.fillText(n.name, n.x + 0.7, n.y + 22.7);
            g.fillStyle = "#fff";
            g.fillText(n.name, n.x, n.y + 22);
          }
        },
      });
    }
    for (const c of this.cars) {
      if (!inView(c.x, c.y, 60)) continue;
      actors.push({
        y: c.y + 8,
        f: () => {
          const horiz = c.dir === "E" || c.dir === "W";
          g.save();
          g.translate(c.x, c.y);
          const w = horiz ? 46 : 24;
          const h = horiz ? 24 : 46;
          g.fillStyle = "rgba(0,0,0,.28)";
          g.beginPath();
          g.roundRect(-w / 2 + 2, -h / 2 + 4, w, h, 6);
          g.fill();
          g.fillStyle = c.color;
          g.beginPath();
          g.roundRect(-w / 2, -h / 2, w, h, 6);
          g.fill();
          g.fillStyle = "rgba(190,230,255,.85)";
          if (horiz) {
            const dirx = c.dir === "E" ? 1 : -1;
            g.fillRect(dirx * 5 - 6, -9, 12, 18);
            g.fillStyle = "#fde68a";
            g.fillRect(dirx * (w / 2 - 3) - 1.5, -9, 3, 5);
            g.fillRect(dirx * (w / 2 - 3) - 1.5, 4, 3, 5);
          } else {
            const diry = c.dir === "S" ? 1 : -1;
            g.fillRect(-9, diry * 5 - 6, 18, 12);
            g.fillStyle = "#fde68a";
            g.fillRect(-9, diry * (h / 2 - 3) - 1.5, 5, 3);
            g.fillRect(4, diry * (h / 2 - 3) - 1.5, 5, 3);
          }
          g.restore();
        },
      });
    }
    for (const p of this.pets) {
      const d = B.PETS.find((x) => x.id === p.id);
      if (!d) continue;
      actors.push({
        y: p.y,
        f: () => {
          g.font = "18px system-ui, 'Apple Color Emoji', sans-serif";
          g.fillStyle = "rgba(0,0,0,.22)";
          g.beginPath();
          g.ellipse(p.x, p.y + 7, 7, 3, 0, 0, Math.PI * 2);
          g.fill();
          g.save();
          g.translate(p.x, p.y + 4 + (p.id === "pigeon" ? Math.sin(this.time * 8) * 3 - 6 : Math.abs(Math.sin(this.time * 7)) * -2));
          g.scale(p.face, 1);
          g.fillStyle = "#000";
          g.fillText(d.emoji, 0, 0);
          g.restore();
        },
      });
    }
    actors.push({
      y: this.py,
      f: () => {
        const veh = B.VEHICLES.find((v) => v.id === this.save.riding);
        if (veh && veh.id !== "none") {
          g.font = "30px system-ui, 'Apple Color Emoji', sans-serif";
          g.save();
          g.translate(this.px, this.py + 6);
          g.scale(this.face, 1);
          g.fillText(veh.emoji, 0, 8);
          g.restore();
        }
        this.person(g, this.px, this.py - (veh && veh.id !== "none" ? 8 : 0), { shirt: "#22c55e", skin: "#f1c9a5", hat: "#1d4ed8", face: this.face, step: this.time * 11, moving: this.moving, scale: 1.05 });
        // bag
        const n = this.save.bag.length;
        if (n > 0) {
          g.fillStyle = "#e5e7eb";
          g.beginPath();
          g.roundRect(this.px - this.face * 11 - 5, this.py - 6, 10, 12, 3);
          g.fill();
          g.fillStyle = "#111";
          g.font = "bold 8px system-ui, sans-serif";
          g.fillText(String(n), this.px - this.face * 11, this.py + 3);
        }
      },
    });
    actors.sort((a, b) => a.y - b.y).forEach((a) => a.f());

    // interact hint ring
    const tg = this.target();
    if (tg) {
      g.strokeStyle = "rgba(255,255,255,.85)";
      g.setLineDash([4, 4]);
      g.lineWidth = 2;
      g.beginPath();
      g.arc(this.px, this.py, 20 + Math.sin(this.time * 6) * 2, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    }
    g.restore();
  }
}
