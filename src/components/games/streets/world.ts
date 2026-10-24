// Neon Streets — open world generator. Deterministic from a seed, so every player in a room gets the same city.
// An island city: downtown towers, suburbs, an industrial zone across the river, a central park, a plaza and an east-coast beach.

export const T = 64; // px per tile
export const N = 160; // tiles per side (10 240 px)

export const BUILD = 0,
  ROAD = 1,
  PARK = 2,
  WATER = 3,
  BEACH = 4,
  BRIDGE = 5,
  PLAZA = 6;

export type District = "downtown" | "suburb" | "industrial";

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hashStr = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
export const hash2 = (a: number, b: number) => {
  let h = (a * 374761393 + b * 668265263) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export type World = {
  seed: number;
  tiles: Uint8Array;
  cols: number[]; // x of the first tile of each 2-wide vertical road
  rows: number[]; // y of the first tile of each 2-wide horizontal road
  colStart: Uint8Array; // 1 = first tile of a vertical road, 2 = second
  rowStart: Uint8Array;
  blockX: Int16Array; // block column index per tile x (between roads), -1 on roads
  blockY: Int16Array;
  blockCX: Float32Array;
  blockCY: Float32Array;
  downtown: { x: number; y: number };
  at: (tx: number, ty: number) => number;
  district: (tx: number, ty: number) => District;
  minimap: () => HTMLCanvasElement;
};

export function makeWorld(seed: number): World {
  const r = rng(seed);
  const tiles = new Uint8Array(N * N);
  const set = (x: number, y: number, v: number) => x >= 0 && y >= 0 && x < N && y < N && (tiles[y * N + x] = v);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= N || y >= N ? WATER : tiles[y * N + x]);

  // road grid with uneven blocks
  const lines = () => {
    const out: number[] = [];
    let c = 4;
    while (c < N - 8) {
      out.push(c);
      c += 2 + 4 + Math.floor(r() * 5);
    }
    return out;
  };
  const cols = lines();
  const rows = lines();
  const colStart = new Uint8Array(N);
  const rowStart = new Uint8Array(N);
  for (const c of cols) ((colStart[c] = 1), (colStart[c + 1] = 2));
  for (const c of rows) ((rowStart[c] = 1), (rowStart[c + 1] = 2));
  const blockX = new Int16Array(N).fill(-1);
  const blockY = new Int16Array(N).fill(-1);
  let bi = 0;
  for (let x = 0; x < N; x++) (colStart[x] ? colStart[x] === 1 && bi++ : (blockX[x] = bi));
  bi = 0;
  for (let y = 0; y < N; y++) (rowStart[y] ? rowStart[y] === 1 && bi++ : (blockY[y] = bi));
  // block centers (px) for roof parallax
  const nbX = Math.max(...Array.from(blockX)) + 1;
  const nbY = Math.max(...Array.from(blockY)) + 1;
  const blockCX = new Float32Array(nbX);
  const blockCY = new Float32Array(nbY);
  for (let b = 0; b < nbX; b++) {
    const xs = [...blockX.keys()].filter((x) => blockX[x] === b);
    blockCX[b] = ((xs[0] + xs[xs.length - 1] + 1) / 2) * T;
  }
  for (let b = 0; b < nbY; b++) {
    const ys = [...blockY.keys()].filter((y) => blockY[y] === b);
    blockCY[b] = ((ys[0] + ys[ys.length - 1] + 1) / 2) * T;
  }
  const first = { c: cols[0], r: rows[0] };
  const last = { c: cols[cols.length - 1], r: rows[rows.length - 1] };

  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const inside = x >= first.c && x <= last.c + 1 && y >= first.r && y <= last.r + 1;
      set(x, y, !inside ? WATER : colStart[x] || rowStart[y] ? ROAD : BUILD);
    }

  // east coast + beach
  const s1 = r() * 10, s2 = r() * 10; // prettier-ignore
  for (let y = 0; y < N; y++) {
    const x0 = Math.round(last.c - 2 + 3 * Math.sin(y / 9 + s1) + 2 * Math.sin(y / 23 + s2));
    for (let x = x0; x < N; x++) set(x, y, x < x0 + 5 ? BEACH : WATER);
  }

  // river (bridges on every other vertical road)
  const s3 = r() * 10;
  const ry = Math.round(N * 0.6);
  for (let x = 0; x < N; x++) {
    const cy = Math.round(ry + 6 * Math.sin(x / 17 + s3) + 2 * Math.sin(x / 7));
    for (let y = cy - 2; y <= cy + 2; y++) {
      if (at(x, y) === WATER) continue;
      const ci = cols.findIndex((c) => x === c || x === c + 1);
      set(x, y, ci >= 0 && ci % 2 === 0 ? BRIDGE : WATER);
    }
  }

  // downtown, central park, plaza, random parks
  const dt = { x: cols[Math.floor(cols.length * 0.45)] + 1, y: rows[Math.floor(rows.length * 0.38)] + 1 };
  const district = (tx: number, ty: number): District => {
    const d = Math.hypot(tx - dt.x, ty - dt.y);
    if (d < N * 0.17) return "downtown";
    if (tx < N * 0.4 && ty > ry) return "industrial";
    return "suburb";
  };
  const fillBlock = (bx: number, by: number, v: number) => {
    for (let y = 0; y < N; y++) if (blockY[y] === by) for (let x = 0; x < N; x++) if (blockX[x] === bx && at(x, y) === BUILD) set(x, y, v);
  };
  const pbx = blockX[cols[Math.floor(cols.length * 0.3)] + 3];
  const pby = blockY[rows[Math.floor(rows.length * 0.25)] + 3];
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) fillBlock(pbx + i, pby + j, PARK);
  fillBlock(blockX[dt.x + 2], blockY[dt.y + 2], PLAZA);
  for (let bx = 0; bx < nbX; bx++) for (let by = 0; by < nbY; by++) if (r() < 0.07) fillBlock(bx, by, PARK);

  let mini: HTMLCanvasElement | null = null;
  const minimap = () => {
    if (mini) return mini;
    const c = document.createElement("canvas");
    c.width = N;
    c.height = N;
    const g = c.getContext("2d")!;
    const img = g.createImageData(N, N);
    const col: Record<number, [number, number, number]> = {
      [BUILD]: [28, 28, 44],
      [ROAD]: [92, 92, 120],
      [PARK]: [20, 92, 48],
      [WATER]: [8, 40, 80],
      [BEACH]: [170, 140, 90],
      [BRIDGE]: [130, 130, 150],
      [PLAZA]: [120, 60, 130],
    };
    for (let i = 0; i < N * N; i++) {
      let [rr, gg, bb] = col[tiles[i]];
      if (tiles[i] === BUILD && district(i % N, Math.floor(i / N)) === "downtown") [rr, gg, bb] = [48, 30, 70];
      img.data.set([rr, gg, bb, 255], i * 4);
    }
    g.putImageData(img, 0, 0);
    mini = c;
    return c;
  };

  return { seed, tiles, cols, rows, colStart, rowStart, blockX, blockY, blockCX, blockCY, downtown: { x: dt.x * T, y: dt.y * T }, at, district, minimap };
}

export const drivable = (v: number) => v === ROAD || v === BRIDGE || v === PARK || v === BEACH || v === PLAZA;
export const isLane = (v: number) => v === ROAD || v === BRIDGE;

/** random point in the middle of a road (between its two lanes) */
export function roadPoint(w: World, rand: () => number = Math.random, near?: { x: number; y: number }, minD = 0, maxD = Infinity) {
  for (let i = 0; i < 400; i++) {
    const horiz = rand() < 0.5;
    const line = horiz ? w.rows[Math.floor(rand() * w.rows.length)] : w.cols[Math.floor(rand() * w.cols.length)];
    const along = (w.cols[0] + rand() * (w.cols[w.cols.length - 1] - w.cols[0])) * T;
    const x = horiz ? along : (line + 1) * T;
    const y = horiz ? (line + 1) * T : along;
    if (!isLane(w.at(Math.floor(x / T), Math.floor(y / T))) || !isLane(w.at(Math.floor(x / T) - (horiz ? 0 : 1), Math.floor(y / T) - (horiz ? 1 : 0)))) continue;
    if (near) {
      const d = Math.hypot(x - near.x, y - near.y);
      if (d < minD || d > maxD) continue;
    }
    return { x, y, horiz };
  }
  return { x: (w.cols[2] + 1) * T, y: (w.rows[2] + 1) * T, horiz: true };
}
