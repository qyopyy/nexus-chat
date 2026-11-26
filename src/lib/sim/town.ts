/** Bottle Run — the town map (deterministic, tile based). */

export const TILE = 32;
export const W = 60;
export const H = 44;

export const T = { GRASS: 0, ROAD: 1, SIDEWALK: 2, BUILDING: 3, FLOOR: 4, PLAZA: 5, WATER: 6, TREE: 7, BRIDGE: 8 } as const;
export type Tile = (typeof T)[keyof typeof T];

export function isSolid(t: number) {
  return t === T.BUILDING || t === T.WATER || t === T.TREE;
}

export type Poi = { id: string; name: string; emoji: string; x: number; y: number; r: number }; // x,y in tile units (centre)
export type NpcSpawn = { id: string; name: string; x: number; y: number; shirt: string; skin: string; hat?: string };
export type Lane = { x: number; y: number; dir: "E" | "W" | "N" | "S"; len: number };
export type Machine = { id: string; x: number; y: number }; // tile units (where the player stands)

export type Town = {
  tiles: Uint8Array;
  pois: Poi[];
  npcs: NpcSpawn[];
  lanes: Lane[];
  machines: Machine[];
  spawn: { x: number; y: number };
  buildingColors: Record<number, string>;
  labels: { text: string; x: number; y: number }[];
};

export function tileIndex(x: number, y: number) {
  return y * W + x;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildTown(): Town {
  const tiles = new Uint8Array(W * H); // grass
  const set = (x: number, y: number, t: Tile) => {
    if (x >= 0 && y >= 0 && x < W && y < H) tiles[tileIndex(x, y)] = t;
  };
  const rect = (x0: number, y0: number, x1: number, y1: number, t: Tile) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, t);
  };
  const r = rng(1337);

  // roads (2 lanes wide)
  for (const y of [10, 28]) rect(0, y, W - 1, y + 1, T.ROAD);
  for (const x of [14, 44]) rect(x, 0, x + 1, H - 1, T.ROAD);
  // sidewalks around roads
  const road = tiles.slice();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (road[tileIndex(x, y)] === T.ROAD) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && road[tileIndex(nx, ny)] === T.ROAD) {
          set(x, y, T.SIDEWALK);
          break;
        }
      }
    }

  // A — park with pond
  rect(2, 2, 12, 8, T.GRASS);
  rect(3, 3, 6, 5, T.WATER);
  rect(8, 3, 12, 8, T.PLAZA);
  for (let i = 0; i < 18; i++) {
    const x = 2 + Math.floor(r() * 11);
    const y = 2 + Math.floor(r() * 7);
    if (tiles[tileIndex(x, y)] === T.GRASS) set(x, y, T.TREE);
  }
  // B — school + market square
  rect(18, 2, 27, 6, T.BUILDING);
  rect(22, 6, 23, 6, T.FLOOR); // school door
  rect(18, 7, 27, 8, T.PLAZA);
  rect(29, 2, 42, 8, T.PLAZA);
  rect(31, 3, 32, 4, T.BUILDING); // stalls
  rect(36, 3, 37, 4, T.BUILDING);
  // C — apartments
  rect(48, 2, 57, 7, T.BUILDING);
  rect(51, 7, 52, 7, T.FLOOR);
  rect(47, 8, 58, 8, T.PLAZA);
  // D — houses
  for (const [hx, hy] of [[2, 13], [8, 13], [2, 20], [8, 20]]) {
    rect(hx, hy, hx + 3, hy + 4, T.BUILDING);
    set(hx + 1, hy + 4, T.FLOOR);
  }
  for (let i = 0; i < 14; i++) {
    const x = 1 + Math.floor(r() * 12);
    const y = 13 + Math.floor(r() * 13);
    if (tiles[tileIndex(x, y)] === T.GRASS) set(x, y, T.TREE);
  }
  // E — Market Hall with the return machines
  rect(19, 14, 40, 23, T.BUILDING);
  rect(23, 17, 36, 21, T.FLOOR); // lobby
  rect(28, 22, 31, 23, T.FLOOR); // doors
  rect(17, 24, 42, 27, T.PLAZA);
  rect(17, 13, 42, 13, T.PLAZA);
  // F — garages / parking
  rect(48, 14, 57, 22, T.BUILDING);
  rect(52, 22, 53, 22, T.FLOOR);
  rect(47, 23, 58, 27, T.PLAZA);
  // G — stadium
  rect(2, 32, 11, 41, T.BUILDING);
  rect(4, 34, 9, 39, T.FLOOR);
  rect(6, 32, 7, 33, T.FLOOR); // gate
  // H — river + bridge
  rect(16, 35, 43, 38, T.WATER);
  rect(28, 35, 31, 38, T.BRIDGE);
  for (let i = 0; i < 22; i++) {
    const x = 17 + Math.floor(r() * 26);
    const y = r() < 0.5 ? 31 + Math.floor(r() * 4) : 39 + Math.floor(r() * 4);
    if (tiles[tileIndex(x, y)] === T.GRASS) set(x, y, T.TREE);
  }
  // I — fairground
  rect(47, 31, 58, 41, T.PLAZA);
  rect(50, 34, 52, 36, T.BUILDING);
  rect(55, 34, 56, 36, T.BUILDING);
  // sidewalk ring on top of plaza edges next to roads stays; border trees
  for (let x = 0; x < W; x++) {
    set(x, 0, T.TREE);
    set(x, H - 1, T.TREE);
  }
  for (let y = 0; y < H; y++) {
    set(0, y, T.TREE);
    set(W - 1, y, T.TREE);
  }
  // re-assert roads over anything painted on top (blocks never overlap roads, but trees might border)
  for (const y of [10, 28]) rect(1, y, W - 2, y + 1, T.ROAD);
  for (const x of [14, 44]) rect(x, 1, x + 1, H - 2, T.ROAD);

  const pois: Poi[] = [
    { id: "park", name: "City Park", emoji: "🌳", x: 9.5, y: 6.5, r: 3 },
    { id: "pond", name: "The Pond", emoji: "🦆", x: 4.5, y: 6.5, r: 2.5 },
    { id: "school", name: "School", emoji: "🏫", x: 22.5, y: 7.5, r: 3 },
    { id: "market", name: "Market Square", emoji: "🧺", x: 35.5, y: 6, r: 3 },
    { id: "hall", name: "Market Hall · Return Point", emoji: "♻️", x: 29.5, y: 25, r: 4 },
    { id: "stadium", name: "Stadium", emoji: "🏟️", x: 6.5, y: 30.5, r: 3 },
    { id: "bridge", name: "Old Bridge", emoji: "🌉", x: 29.5, y: 33.5, r: 3 },
    { id: "kiosk", name: "Erzsi's Kiosk", emoji: "🥐", x: 25, y: 25.5, r: 2.5 },
  ];
  const npcs: NpcSpawn[] = [
    { id: "bela", name: "Béla bácsi", x: 9.5, y: 6, shirt: "#8b5a2b", skin: "#e0b48a", hat: "#444" },
    { id: "marta", name: "Márta néni", x: 7.5, y: 7.5, shirt: "#c026d3", skin: "#f1c9a5" },
    { id: "gyuri", name: "Gyuri", x: 34, y: 6.5, shirt: "#0ea5e9", skin: "#d6a67c", hat: "#ef4444" },
    { id: "zsofi", name: "Zsófi", x: 24.5, y: 8, shirt: "#f43f5e", skin: "#f5d0b0" },
    { id: "erzsi", name: "Erzsi", x: 25, y: 26, shirt: "#f59e0b", skin: "#e8b995" },
    { id: "karcsi", name: "Taxi Karcsi", x: 29.5, y: 32, shirt: "#facc15", skin: "#c68e5d", hat: "#111" },
    { id: "mayor", name: "Mayor Kovács", x: 38.5, y: 7.5, shirt: "#1e293b", skin: "#e5b78f", hat: "#7c2d12" },
  ];
  const lanes: Lane[] = [
    { x: 0, y: 10, dir: "E", len: W },
    { x: W - 1, y: 11, dir: "W", len: W },
    { x: 0, y: 28, dir: "E", len: W },
    { x: W - 1, y: 29, dir: "W", len: W },
    { x: 14, y: 0, dir: "S", len: H },
    { x: 15, y: H - 1, dir: "N", len: H },
    { x: 44, y: 0, dir: "S", len: H },
    { x: 45, y: H - 1, dir: "N", len: H },
  ];
  const machines: Machine[] = [
    { id: "m1", x: 27, y: 17.6 },
    { id: "m2", x: 32.5, y: 17.6 },
  ];
  return {
    tiles,
    pois,
    npcs,
    lanes,
    machines,
    spawn: { x: 10.5, y: 7.5 },
    buildingColors: {},
    labels: [
      { text: "MARKET HALL", x: 29.5, y: 15 },
      { text: "SCHOOL", x: 22.5, y: 4 },
      { text: "APARTMENTS", x: 52.5, y: 4.5 },
      { text: "STADIUM", x: 6.5, y: 36.5 },
      { text: "GARAGES", x: 52.5, y: 18 },
    ],
  };
}

/** BFS over walkable tiles — used by tests to prove everything is reachable. */
export function reachable(town: Town, from: { x: number; y: number }) {
  const seen = new Uint8Array(W * H);
  const q: number[] = [];
  const sx = Math.floor(from.x);
  const sy = Math.floor(from.y);
  seen[tileIndex(sx, sy)] = 1;
  q.push(sx, sy);
  for (let i = 0; i < q.length; i += 2) {
    const x = q[i];
    const y = q[i + 1];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const k = tileIndex(nx, ny);
      if (seen[k] || isSolid(town.tiles[k])) continue;
      seen[k] = 1;
      q.push(nx, ny);
    }
  }
  return seen;
}
