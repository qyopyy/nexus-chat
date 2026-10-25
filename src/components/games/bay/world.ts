// Sunset Bay — an original 80s neon coastal city (procedural, deterministic).
// Mainland downtown in the west, a long barrier beach island in the east, a small lighthouse
// island in the bay, three causeways between them. Units: 1 tile = T world units.

export const T = 10;
export const N = 160;
export const SIZE = N * T;

export const WATER = 0,
  SAND = 1,
  GRASS = 2,
  ROAD = 3,
  LOT = 4,
  BRIDGE = 5,
  WALK = 6,
  PARK = 7,
  DOCK = 8;

export type Building = { x0: number; z0: number; x1: number; z1: number; h: number; color: number; neon: number; deco: boolean };
export type Palm = { x: number; z: number; h: number; lean: number; rot: number };
export type Decor = { x: number; z: number; kind: "umbrella" | "tower" | "boat" | "lighthouse"; color: number; rot: number };
export type Ramp = { x: number; z: number; dir: number; len: number; h: number; w: number };
export type Line = { axis: "v" | "h"; at: number; from: number; to: number; bridge?: boolean }; // tile coords; road occupies at, at+1
export type Node = { x: number; z: number; edges: number[] };
export type Edge = { a: number; b: number; len: number };

export type World = {
  tiles: Uint8Array;
  buildings: Building[];
  palms: Palm[];
  decor: Decor[];
  ramps: Ramp[];
  lines: Line[];
  nodes: Node[];
  edges: Edge[];
  /** building indices per tile for collision */
  cell: Map<number, number[]>;
  spawn: { x: number; z: number; a: number };
  tapes: { x: number; z: number }[];
};

export const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const PASTEL = [0xff9ec7, 0x9ff0d8, 0xffc59e, 0xc7b3ff, 0x9fd8ff, 0xfff0c9, 0xff8fa3, 0xb8f5a1, 0xffffff];
export const NEON = [0xff2bd6, 0x00e5ff, 0xffd400, 0x7c4dff, 0x00ff9c, 0xff6b2b];
const GLASS = [0x2b3a55, 0x34506b, 0x3d3552, 0x2a4b4f, 0x4a4a5c, 0x25303f];

export function makeWorld(seed = 1986): World {
  const r = rng(seed);
  const tiles = new Uint8Array(N * N);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= N || y >= N ? WATER : tiles[y * N + x]);
  const set = (x: number, y: number, v: number) => {
    if (x >= 0 && y >= 0 && x < N && y < N) tiles[y * N + x] = v;
  };
  const fill = (x0: number, y0: number, x1: number, y1: number, v: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, v);
  };

  // ── mainland (downtown) with a wobbly bay shore
  const shore = (y: number) => 70 + Math.round(Math.sin(y * 0.11) * 1.5 + Math.sin(y * 0.031) * 2);
  for (let y = 6; y < 154; y++) {
    const e = shore(y);
    for (let x = 0; x <= e; x++) set(x, y, x >= e - 1 ? SAND : LOT);
  }
  // ── barrier beach island
  for (let y = 6; y < 154; y++) {
    const w0 = 99 + Math.round(Math.sin(y * 0.07) * 1);
    for (let x = w0; x <= 126; x++) set(x, y, x <= w0 + 1 ? GRASS : x >= 118 ? SAND : LOT);
  }
  // ── lighthouse island
  const ic = { x: 86, y: 75, r: 8 };
  for (let y = ic.y - ic.r - 1; y <= ic.y + ic.r + 1; y++)
    for (let x = ic.x - ic.r - 1; x <= ic.x + ic.r + 1; x++) {
      const d = Math.hypot(x - ic.x, y - ic.y);
      if (d <= ic.r - 1.5) set(x, y, LOT);
      else if (d <= ic.r) set(x, y, SAND);
    }

  const lines: Line[] = [];
  const road = (l: Line) => {
    lines.push(l);
    for (let i = l.from; i <= l.to; i++)
      for (let k = 0; k < 2; k++) {
        const x = l.axis === "v" ? l.at + k : i;
        const y = l.axis === "v" ? i : l.at + k;
        const cur = at(x, y);
        set(x, y, cur === WATER || cur === SAND || l.bridge ? (cur === WATER ? BRIDGE : ROAD) : ROAD);
      }
  };

  // downtown grid
  const vx = [8, 18, 28, 38, 48, 58];
  const hy = [10, 22, 34, 46, 58, 70, 82, 94, 106, 118, 130, 142];
  for (const x of vx) road({ axis: "v", at: x, from: 10, to: 143 });
  road({ axis: "v", at: 65, from: 10, to: 143 }); // bayfront boulevard
  for (const y of hy) road({ axis: "h", at: y, from: 8, to: 66 });
  // waterfront promenade between boulevard and shore
  for (let y = 6; y < 154; y++) for (let x = 67; x <= shore(y) - 2; x++) if (at(x, y) === LOT) set(x, y, GRASS);
  // parks downtown
  const parks = [
    [20, 48, 27, 57],
    [40, 96, 47, 105],
    [10, 132, 17, 141],
  ];
  for (const [x0, y0, x1, y1] of parks) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (at(x, y) === LOT) set(x, y, PARK);
  // port docks in the south
  fill(10, 146, 64, 153, DOCK);
  road({ axis: "h", at: 144, from: 8, to: 66 });
  // north edge
  fill(0, 0, 70, 5, WATER);

  // beach island roads
  road({ axis: "v", at: 103, from: 8, to: 151 }); // Bay Avenue
  road({ axis: "v", at: 114, from: 8, to: 151 }); // Ocean Drive
  for (let y = 8; y <= 146; y += 13) road({ axis: "h", at: y, from: 103, to: 115 });
  road({ axis: "h", at: 151, from: 103, to: 115 });
  // promenade + sand
  for (let y = 6; y < 154; y++) {
    if (at(116, y) === LOT) set(116, y, WALK);
    if (at(117, y) === LOT) set(117, y, WALK);
  }
  // golf course in the north of the island
  for (let y = 10; y <= 20; y++) for (let x = 105; x <= 113; x++) if (at(x, y) === LOT) set(x, y, PARK);

  // causeways
  road({ axis: "h", at: 40, from: 65, to: 104, bridge: true });
  road({ axis: "h", at: 110, from: 65, to: 104, bridge: true });
  road({ axis: "h", at: 75, from: 65, to: 104, bridge: true });

  // tidy: lots that touch no road become park/grass courtyards
  // ── buildings per block (connected LOT regions)
  const seen = new Uint8Array(N * N);
  const buildings: Building[] = [];
  const cell = new Map<number, number[]>();
  const addB = (b: Building) => {
    const i = buildings.push(b) - 1;
    for (let ty = Math.floor(b.z0 / T); ty <= Math.floor(b.z1 / T); ty++)
      for (let tx = Math.floor(b.x0 / T); tx <= Math.floor(b.x1 / T); tx++) {
        const k = ty * N + tx;
        const l = cell.get(k);
        if (l) l.push(i);
        else cell.set(k, [i]);
      }
  };
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (seen[y * N + x] || at(x, y) !== LOT) continue;
      // bounding rectangle of this block (grid blocks are rectangles)
      // greedy rectangle that is LOT everywhere (never spans a road)
      let x1 = x;
      while (at(x1 + 1, y) === LOT && !seen[y * N + x1 + 1] && x1 - x < 11) x1++;
      let y1 = y;
      const rowFree = (yy: number) => {
        for (let xx = x; xx <= x1; xx++) if (at(xx, yy) !== LOT || seen[yy * N + xx]) return false;
        return true;
      };
      while (y1 - y < 11 && rowFree(y1 + 1)) y1++;
      for (let yy = y; yy <= y1; yy++) for (let xx = x; xx <= x1; xx++) if (at(xx, yy) === LOT) seen[yy * N + xx] = 1;
      const island = x >= 95;
      const bayIsle = x > 74 && x < 98;
      const cx = (x + x1) / 2,
        cy = (y + y1) / 2;
      const core = Math.max(0, 1 - Math.hypot(cx - 38, cy - 76) / 55); // downtown core → towers
      // split block into parcels
      const parcels: [number, number, number, number][] = [];
      const split = (a: number, b: number, c: number, d: number, depth: number) => {
        const w = c - a + 1,
          h = d - b + 1;
        if (depth > 3 || (w <= 2 && h <= 2) || (w <= 3 && h <= 3 && r() < 0.5) || (r() < 0.12 && depth > 1)) return void parcels.push([a, b, c, d]);
        if (w >= h && w > 1) {
          const m = a + 1 + Math.floor(r() * (w - 1));
          split(a, b, m - 1, d, depth + 1);
          split(m, b, c, d, depth + 1);
        } else if (h > 1) {
          const m = b + 1 + Math.floor(r() * (h - 1));
          split(a, b, c, m - 1, depth + 1);
          split(a, m, c, d, depth + 1);
        } else parcels.push([a, b, c, d]);
      };
      split(x, y, x1, y1, 0);
      for (const [a, b, c, d] of parcels) {
        const m = 1.6 + r() * 0.8;
        let h: number;
        let color: number;
        let deco = false;
        if (island || bayIsle) {
          h = 9 + r() * (bayIsle ? 8 : 16);
          color = PASTEL[Math.floor(r() * PASTEL.length)];
          deco = true;
          if (!bayIsle && r() < 0.12) h = 34 + r() * 30; // a few beach hotels
        } else {
          const tall = core * core;
          h = 14 + r() * 26 + tall * (40 + r() * 120);
          color = h > 60 ? GLASS[Math.floor(r() * GLASS.length)] : r() < 0.55 ? PASTEL[Math.floor(r() * PASTEL.length)] : GLASS[Math.floor(r() * GLASS.length)];
          deco = h < 40 && r() < 0.5;
        }
        addB({ x0: a * T + m, z0: b * T + m, x1: (c + 1) * T - m, z1: (d + 1) * T - m, h, color, neon: NEON[Math.floor(r() * NEON.length)], deco });
      }
    }

  // ── palms
  const palms: Palm[] = [];
  const palm = (x: number, z: number) => palms.push({ x, z, h: 9 + r() * 7, lean: (r() - 0.5) * 0.5, rot: r() * Math.PI * 2 });
  for (let y = 7; y < 153; y += 2) {
    palm(116.5 * T + (r() - 0.5) * 4, y * T + r() * 6); // Ocean Drive promenade
    if (r() < 0.55) palm((shore(y) - 1.5) * T + (r() - 0.5) * 6, y * T + r() * 6); // bayfront
    if (r() < 0.35) palm(101 * T + (r() - 0.5) * 6, y * T); // island bayside
  }
  for (let i = 0; i < 60; i++) {
    const x = Math.floor(r() * N),
      y = Math.floor(r() * N);
    if (at(x, y) === PARK || at(x, y) === GRASS) palm(x * T + r() * T, y * T + r() * T);
  }
  for (let a = 0; a < Math.PI * 2; a += 0.45) palm((ic.x + 0.5 + Math.cos(a) * (ic.r - 1)) * T, (ic.y + 0.5 + Math.sin(a) * (ic.r - 1)) * T);

  // ── decor
  const decor: Decor[] = [];
  const umb = [0xff2b6d, 0xffd400, 0x00c2ff, 0xff8a00, 0x7c4dff, 0x00e08a];
  for (let i = 0; i < 140; i++) {
    const x = 119 + r() * 6.5,
      y = 7 + r() * 146;
    decor.push({ x: x * T, z: y * T, kind: "umbrella", color: umb[Math.floor(r() * umb.length)], rot: r() * 6 });
  }
  for (let y = 14; y < 150; y += 22) decor.push({ x: 121.5 * T, z: y * T, kind: "tower", color: 0xff5a8a, rot: 0 });
  for (let i = 0; i < 26; i++) {
    const x = 74 + r() * 22,
      y = 8 + r() * 144;
    if (at(Math.floor(x), Math.floor(y)) === WATER && Math.abs(y - 41) > 3 && Math.abs(y - 76) > 3 && Math.abs(y - 111) > 3)
      decor.push({ x: x * T, z: y * T, kind: "boat", color: [0xffffff, 0xff4d6d, 0x00c2ff][i % 3], rot: r() * 6 });
  }
  for (let i = 0; i < 18; i++) decor.push({ x: (130 + r() * 20) * T, z: (10 + r() * 140) * T, kind: "boat", color: 0xffffff, rot: r() * 6 });
  decor.push({ x: (ic.x + 4.5) * T, z: (ic.y - 4.5) * T, kind: "lighthouse", color: 0xffffff, rot: 0 });

  // ── stunt ramps (on sand and parks), dir = heading in radians (0 = -Z / north)
  const ramps: Ramp[] = [
    { x: 121 * T, z: 30 * T, dir: Math.PI, len: 14, h: 4.5, w: 9 },
    { x: 121 * T, z: 92 * T, dir: 0, len: 14, h: 5, w: 9 },
    { x: 122 * T, z: 132 * T, dir: Math.PI / 2, len: 12, h: 4, w: 8 },
    { x: 24 * T, z: 52.5 * T, dir: Math.PI / 2, len: 12, h: 4, w: 8 },
    { x: 37 * T, z: 148 * T, dir: Math.PI / 2, len: 14, h: 5, w: 9 },
    { x: 69 * T, z: 58 * T, dir: 0, len: 12, h: 4, w: 8 },
  ];

  // ── road graph for traffic & checkpoints
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const key = new Map<string, number>();
  const node = (x: number, z: number) => {
    const k = `${x},${z}`;
    let i = key.get(k);
    if (i == null) {
      i = nodes.push({ x, z, edges: [] }) - 1;
      key.set(k, i);
    }
    return i;
  };
  for (const l of lines) {
    const c = (l.at + 1) * T; // centre line between the two lanes
    const pts = new Set<number>([l.from, l.to]);
    for (const o of lines) {
      if (o.axis === l.axis) continue;
      const oc = o.at + 1;
      if (oc >= l.from && oc <= l.to + 1 && l.at + 1 >= o.from && l.at + 1 <= o.to + 1) pts.add(oc);
    }
    const sorted = [...pts].sort((a, b) => a - b);
    const ids = sorted.map((p) => (l.axis === "v" ? node(c, p * T) : node(p * T, c)));
    for (let i = 0; i + 1 < ids.length; i++) {
      const a = ids[i],
        b = ids[i + 1];
      if (a === b) continue;
      const len = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z);
      if (len < 1) continue;
      const e = edges.push({ a, b, len }) - 1;
      nodes[a].edges.push(e);
      nodes[b].edges.push(e);
    }
  }

  // ── collectible cassette tapes
  const tapes: { x: number; z: number }[] = [];
  const tr = rng(seed + 7);
  const spots: [number, number][] = [
    [(ic.x + 0.5) * T, (ic.y + 0.5) * T],
    [121 * T, 20 * T],
    [122 * T, 70 * T],
    [120 * T, 140 * T],
    [109 * T, 15 * T],
    [23.5 * T, 52 * T],
    [43.5 * T, 100 * T],
    [13.5 * T, 136 * T],
    [30 * T, 149.5 * T],
    [55 * T, 149.5 * T],
    [68.5 * T, 30 * T],
    [68.5 * T, 128 * T],
    [85 * T, 41 * T],
    [85 * T, 111 * T],
  ];
  for (const [x, z] of spots) tapes.push({ x, z });
  while (tapes.length < 25) {
    const n = nodes[Math.floor(tr() * nodes.length)];
    if (tapes.every((t) => Math.hypot(t.x - n.x, t.z - n.z) > 120)) tapes.push({ x: n.x + 2.5, z: n.z + 2.5 });
  }

  return { tiles, buildings, palms, decor, ramps, lines, nodes, edges, cell, spawn: { x: 115 * T, z: 80 * T, a: 0 }, tapes };
}

export const tileAt = (w: World, x: number, z: number) => {
  const tx = Math.floor(x / T),
    tz = Math.floor(z / T);
  if (tx < 0 || tz < 0 || tx >= N || tz >= N) return WATER;
  return w.tiles[tz * N + tx];
};

/** push a circle (car) out of buildings; returns true if it hit something */
export function collide(w: World, p: { x: number; z: number }, rad: number) {
  let hit = false;
  const tx = Math.floor(p.x / T),
    tz = Math.floor(p.z / T);
  const checked = new Set<number>();
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) {
      const l = w.cell.get((tz + dz) * N + (tx + dx));
      if (!l) continue;
      for (const i of l) {
        if (checked.has(i)) continue;
        checked.add(i);
        const b = w.buildings[i];
        const cx = Math.max(b.x0, Math.min(p.x, b.x1)),
          cz = Math.max(b.z0, Math.min(p.z, b.z1));
        const ddx = p.x - cx,
          ddz = p.z - cz;
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 < rad * rad) {
          hit = true;
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2);
            p.x = cx + (ddx / d) * rad;
            p.z = cz + (ddz / d) * rad;
          } else {
            // centre inside the box: push out the short way
            const opts = [p.x - b.x0, b.x1 - p.x, p.z - b.z0, b.z1 - p.z];
            const m = Math.min(...opts);
            if (m === opts[0]) p.x = b.x0 - rad;
            else if (m === opts[1]) p.x = b.x1 + rad;
            else if (m === opts[2]) p.z = b.z0 - rad;
            else p.z = b.z1 + rad;
          }
        }
      }
    }
  return hit;
}
