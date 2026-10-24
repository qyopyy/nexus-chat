"use client";

// V-Avatar — a live anime character that follows your face (MediaPipe face tracking, in the browser,
// nothing leaves your device) or your voice when there's no camera. Rendered on a canvas and sent
// into calls as a normal video track.

// ------------------------------------------------------------------ look (saved on the profile)
export type HairStyle = "short" | "spiky" | "messy" | "long" | "wavy" | "bob" | "twintails" | "ponytail";
export type Outfit = "tee" | "hoodie" | "uniform" | "jacket" | "sweater" | "suit";
export type Extra = "none" | "glasses" | "catEars" | "headphones" | "halo" | "horns" | "bow";
export type VAvatar = {
  v: 1;
  skin: string;
  face: "round" | "oval" | "sharp";
  eyes: "round" | "sharp" | "gentle" | "sleepy";
  eyeColor: string;
  eyeColor2: string | null; // heterochromia
  brows: "soft" | "bold" | "angry";
  mouth: "smile" | "cat" | "neutral" | "fang";
  blush: number; // 0..1
  marks: "none" | "freckles" | "bandage" | "whiskers" | "star";
  hair: HairStyle;
  hairColor: string;
  hairTip: string | null; // gradient tips
  shirt: Outfit;
  shirtColor: string;
  accentColor: string;
  extra: Extra;
  extraColor: string;
  bg: "galaxy" | "sunset" | "sakura" | "neon" | "mint" | "room" | "solid" | "green";
  bgColor: string;
};

export const DEFAULT_AVATAR: VAvatar = {
  v: 1,
  skin: "#ffe0cf",
  face: "oval",
  eyes: "round",
  eyeColor: "#7b5cff",
  eyeColor2: null,
  brows: "soft",
  mouth: "smile",
  blush: 0.6,
  marks: "none",
  hair: "messy",
  hairColor: "#2b2d52",
  hairTip: "#8b5cff",
  shirt: "hoodie",
  shirtColor: "#1f1b3a",
  accentColor: "#ff2bd6",
  extra: "headphones",
  extraColor: "#00c2ff",
  bg: "galaxy",
  bgColor: "#5865f2",
};

export const OPTIONS = {
  face: ["round", "oval", "sharp"],
  eyes: ["round", "sharp", "gentle", "sleepy"],
  brows: ["soft", "bold", "angry"],
  mouth: ["smile", "cat", "neutral", "fang"],
  marks: ["none", "freckles", "bandage", "whiskers", "star"],
  hair: ["short", "spiky", "messy", "long", "wavy", "bob", "twintails", "ponytail"],
  shirt: ["tee", "hoodie", "uniform", "jacket", "sweater", "suit"],
  extra: ["none", "glasses", "catEars", "headphones", "halo", "horns", "bow"],
  bg: ["galaxy", "sunset", "sakura", "neon", "mint", "room", "solid", "green"],
} as const;

export const SWATCH = {
  skin: ["#fff1e8", "#ffe0cf", "#f6cfb4", "#e8b58f", "#c98e66", "#a46a45", "#7a4a2f", "#4e2f1f", "#d9f0ff", "#c8ffd9"],
  hair: ["#1b1b2a", "#2b2d52", "#5a3a2a", "#a8693c", "#f2d27a", "#f7f3ea", "#ff7ab8", "#ff4d6d", "#8b5cff", "#2fd3ff", "#36d39a", "#ff9f40"],
  eyes: ["#7b5cff", "#2fa8ff", "#3ad08e", "#ffb02e", "#ff4d6d", "#9b6b43", "#2b2b38", "#e04cff", "#00e0d0", "#ffd400"],
  cloth: ["#1f1b3a", "#111318", "#f4f4f8", "#5865f2", "#ff2bd6", "#ff4d6d", "#ffb02e", "#36d39a", "#2fa8ff", "#8b5cff", "#7a4a2f", "#3a5a40"],
};

const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
export function randomAvatar(): VAvatar {
  return {
    v: 1,
    skin: pick(SWATCH.skin.slice(0, 8)),
    face: pick(OPTIONS.face),
    eyes: pick(OPTIONS.eyes),
    eyeColor: pick(SWATCH.eyes),
    eyeColor2: Math.random() < 0.12 ? pick(SWATCH.eyes) : null,
    brows: pick(OPTIONS.brows),
    mouth: pick(OPTIONS.mouth),
    blush: Math.round(Math.random() * 10) / 10,
    marks: Math.random() < 0.6 ? "none" : pick(OPTIONS.marks),
    hair: pick(OPTIONS.hair),
    hairColor: pick(SWATCH.hair),
    hairTip: Math.random() < 0.4 ? pick(SWATCH.hair) : null,
    shirt: pick(OPTIONS.shirt),
    shirtColor: pick(SWATCH.cloth),
    accentColor: pick(SWATCH.cloth),
    extra: pick(OPTIONS.extra),
    extraColor: pick(SWATCH.cloth),
    bg: pick(OPTIONS.bg.slice(0, 6)),
    bgColor: pick(SWATCH.cloth),
  };
}

const HEX = /^#[0-9a-f]{6}$/i;
/** sanitize anything coming from the database */
export function normalizeAvatar(x: unknown): VAvatar {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const col = (k: keyof VAvatar) => (typeof o[k] === "string" && HEX.test(o[k] as string) ? (o[k] as string) : (DEFAULT_AVATAR[k] as string));
  const one = <K extends keyof typeof OPTIONS>(k: K) => ((OPTIONS[k] as readonly string[]).includes(o[k] as string) ? o[k] : DEFAULT_AVATAR[k as keyof VAvatar]) as VAvatar[K & keyof VAvatar];
  return {
    v: 1,
    skin: col("skin"),
    face: one("face"),
    eyes: one("eyes"),
    eyeColor: col("eyeColor"),
    eyeColor2: typeof o.eyeColor2 === "string" && HEX.test(o.eyeColor2) ? o.eyeColor2 : null,
    brows: one("brows"),
    mouth: one("mouth"),
    blush: typeof o.blush === "number" ? Math.max(0, Math.min(1, o.blush)) : DEFAULT_AVATAR.blush,
    marks: one("marks"),
    hair: one("hair"),
    hairColor: col("hairColor"),
    hairTip: typeof o.hairTip === "string" && HEX.test(o.hairTip) ? o.hairTip : null,
    shirt: one("shirt"),
    shirtColor: col("shirtColor"),
    accentColor: col("accentColor"),
    extra: one("extra"),
    extraColor: col("extraColor"),
    bg: one("bg"),
    bgColor: col("bgColor"),
  };
}

// ------------------------------------------------------------------ pose
export type Pose = { yaw: number; pitch: number; roll: number; blinkL: number; blinkR: number; mouth: number; smile: number; gazeX: number; gazeY: number; brow: number };
export const NEUTRAL: Pose = { yaw: 0, pitch: 0, roll: 0, blinkL: 1, blinkR: 1, mouth: 0, smile: 0.3, gazeX: 0, gazeY: 0, brow: 0 };

// ------------------------------------------------------------------ colour helpers
function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  const r = f(n >> 16),
    g = f((n >> 8) & 255),
    b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
const alpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

// ------------------------------------------------------------------ background (cached)
const bgCache = new Map<string, HTMLCanvasElement>();
function background(cfg: VAvatar, W: number, H: number) {
  const key = `${cfg.bg}|${cfg.bgColor}|${W}x${H}`;
  let c = bgCache.get(key);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const lin = (stops: string[]) => {
    const gr = g.createLinearGradient(0, 0, W * 0.3, H);
    stops.forEach((s, i) => gr.addColorStop(i / (stops.length - 1), s));
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  };
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  switch (cfg.bg) {
    case "galaxy": {
      lin(["#090418", "#1a0b3d", "#0b1e4a"]);
      for (const [x, y, r, col] of [
        [0.2, 0.3, 0.45, "#8b5cff"],
        [0.85, 0.7, 0.5, "#ff2bd6"],
        [0.6, 0.15, 0.3, "#00c2ff"],
      ] as const) {
        const rg = g.createRadialGradient(W * x, H * y, 0, W * x, H * y, Math.max(W, H) * r);
        rg.addColorStop(0, alpha(col, 0.35));
        rg.addColorStop(1, alpha(col, 0));
        g.fillStyle = rg;
        g.fillRect(0, 0, W, H);
      }
      for (let i = 0; i < 260; i++) {
        g.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.75})`;
        const r = rnd() < 0.08 ? 1.8 : 0.9;
        g.beginPath();
        g.arc(rnd() * W, rnd() * H, (r * H) / 720, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case "sunset":
      lin(["#ff9a62", "#ff5e8a", "#6b3fa0"]);
      g.fillStyle = "rgba(255,240,200,.55)";
      g.beginPath();
      g.arc(W * 0.78, H * 0.62, H * 0.22, 0, Math.PI * 2);
      g.fill();
      break;
    case "sakura":
      lin(["#ffe6f0", "#ffc4dc", "#ffd9e8"]);
      for (let i = 0; i < 46; i++) {
        g.save();
        g.translate(rnd() * W, rnd() * H);
        g.rotate(rnd() * 6);
        g.fillStyle = `rgba(255,${130 + rnd() * 60},${170 + rnd() * 40},.75)`;
        g.beginPath();
        g.ellipse(0, 0, (14 * H) / 720, (8 * H) / 720, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      break;
    case "neon": {
      lin(["#05010f", "#140030", "#05010f"]);
      g.strokeStyle = "rgba(255,43,214,.5)";
      g.lineWidth = (2 * H) / 720;
      for (let i = 0; i < 14; i++) {
        const y = H * 0.62 + (i * i * H) / 360;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(W, y);
        g.stroke();
      }
      g.strokeStyle = "rgba(0,194,255,.45)";
      for (let i = -12; i <= 12; i++) {
        g.beginPath();
        g.moveTo(W / 2 + i * W * 0.02, H * 0.62);
        g.lineTo(W / 2 + i * W * 0.12, H);
        g.stroke();
      }
      break;
    }
    case "mint":
      lin(["#d8fff0", "#a8f0d8", "#c9f1ff"]);
      break;
    case "room": {
      lin(["#f3e6d6", "#e8d4bd"]);
      g.fillStyle = "#cdb59a";
      g.fillRect(0, H * 0.78, W, H * 0.22);
      g.fillStyle = "#9fd2ff";
      g.fillRect(W * 0.07, H * 0.12, W * 0.2, H * 0.34);
      g.strokeStyle = "#fff";
      g.lineWidth = (8 * H) / 720;
      g.strokeRect(W * 0.07, H * 0.12, W * 0.2, H * 0.34);
      g.beginPath();
      g.moveTo(W * 0.17, H * 0.12);
      g.lineTo(W * 0.17, H * 0.46);
      g.stroke();
      g.fillStyle = "#6b8f5e";
      g.beginPath();
      g.ellipse(W * 0.86, H * 0.6, W * 0.05, H * 0.14, 0, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case "green":
      g.fillStyle = "#00b140"; // chroma key
      g.fillRect(0, 0, W, H);
      break;
    default:
      lin([shade(cfg.bgColor, 0.25), cfg.bgColor, shade(cfg.bgColor, -0.35)]);
  }
  if (bgCache.size > 12) bgCache.clear();
  bgCache.set(key, c);
  return c;
}

// ------------------------------------------------------------------ drawing
type G = CanvasRenderingContext2D;

function hairFill(g: G, cfg: VAvatar, top: number, bottom: number) {
  const gr = g.createLinearGradient(0, top, 0, bottom);
  gr.addColorStop(0, shade(cfg.hairColor, 0.08));
  gr.addColorStop(0.55, cfg.hairColor);
  gr.addColorStop(1, cfg.hairTip ?? shade(cfg.hairColor, -0.25));
  g.fillStyle = gr;
  g.strokeStyle = shade(cfg.hairColor, -0.45);
  g.lineWidth = 3;
  g.lineJoin = "round";
}

function backHair(g: G, cfg: VAvatar, dx: number) {
  g.save();
  g.translate(-dx * 0.5, 0);
  hairFill(g, cfg, -140, 330);
  const h = cfg.hair;
  if (h === "spiky") {
    for (const [x, y, r] of [
      [-100, -88, -1.1],
      [-62, -122, -0.6],
      [-20, -140, -0.2],
      [22, -140, 0.2],
      [64, -122, 0.6],
      [102, -88, 1.1],
    ]) {
      g.beginPath();
      g.moveTo(x - 32, y + 30);
      g.lineTo(x + Math.sin(r) * 58, y - Math.cos(r) * 46);
      g.lineTo(x + 32, y + 30);
      g.closePath();
      g.fill();
      g.stroke();
    }
  }
  g.beginPath();
  if (h === "long" || h === "wavy") {
    g.moveTo(-118, -40);
    g.bezierCurveTo(-150, 80, -150, 230, -140, 330);
    if (h === "wavy") {
      for (let i = 0; i < 6; i++) g.quadraticCurveTo(-120 + i * 47 + 12, 350 - (i % 2) * 34, -94 + i * 47, 330);
    } else g.lineTo(140, 330);
    g.bezierCurveTo(150, 230, 150, 80, 118, -40);
  } else if (h === "bob") {
    g.moveTo(-122, -30);
    g.bezierCurveTo(-140, 50, -138, 110, -112, 140);
    g.quadraticCurveTo(0, 150, 112, 140);
    g.bezierCurveTo(138, 110, 140, 50, 122, -30);
  } else {
    g.moveTo(-116, -20);
    g.bezierCurveTo(-124, 40, -112, 70, -100, 78);
    g.lineTo(100, 78);
    g.bezierCurveTo(112, 70, 124, 40, 116, -20);
  }
  g.ellipse(0, -30, 120, 108, 0, 0, Math.PI, true);
  g.closePath();
  g.fill();
  g.stroke();

  if (h === "twintails") {
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * 100, -80);
      g.bezierCurveTo(s * 190, -90, s * 230, 60, s * 205, 200);
      g.bezierCurveTo(s * 195, 260, s * 170, 300, s * 150, 330);
      g.bezierCurveTo(s * 175, 250, s * 160, 120, s * 112, -20);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = cfg.accentColor;
      g.beginPath();
      g.arc(s * 112, -72, 13, 0, Math.PI * 2);
      g.fill();
      hairFill(g, cfg, -140, 330);
    }
  }
  if (h === "ponytail") {
    g.beginPath();
    g.moveTo(80, -110);
    g.bezierCurveTo(200, -150, 215, 40, 175, 190);
    g.bezierCurveTo(165, 230, 150, 250, 138, 262);
    g.bezierCurveTo(160, 150, 160, 10, 108, -60);
    g.closePath();
    g.fill();
    g.stroke();
  }
  g.restore();
}

function frontHair(g: G, cfg: VAvatar, dx: number) {
  const h = cfg.hair;
  g.save();
  g.translate(dx * 0.35, 0);
  hairFill(g, cfg, -140, 60);
  // fringe tips (x, y) — notches between them sit high
  const tipsBy: Record<HairStyle, [number, number][]> = {
    short: [[-108, 8], [-70, 4], [-30, 18], [12, 10], [52, 20], [92, 6], [112, 22]],
    spiky: [[-112, 30], [-78, 2], [-42, 34], [-6, 6], [32, 38], [70, 6], [108, 34]],
    messy: [[-114, 26], [-84, 12], [-55, 34], [-20, 4], [10, 30], [44, 14], [76, 36], [110, 18]],
    long: [[-110, 40], [-72, 22], [-34, 30], [0, 18], [36, 30], [74, 22], [110, 40]],
    wavy: [[-110, 36], [-70, 18], [-28, 32], [12, 20], [52, 34], [90, 20], [112, 38]],
    bob: [[-112, 26], [-74, 24], [-37, 26], [0, 25], [37, 26], [74, 24], [112, 26]],
    twintails: [[-110, 34], [-72, 18], [-36, 30], [0, 14], [36, 30], [72, 18], [110, 34]],
    ponytail: [[-110, 30], [-66, 12], [-22, 26], [18, 6], [60, 22], [110, 10]],
  };
  const tips = tipsBy[h].map(([x, y]) => [x, Math.abs(x) < 84 && h !== "spiky" ? Math.min(y, 6 + Math.abs(x) * 0.08) : y] as [number, number]);
  g.beginPath();
  g.moveTo(-124, 34);
  g.bezierCurveTo(-130, -95, -70, -142, 0, -142);
  g.bezierCurveTo(70, -142, 130, -95, 124, 34);
  for (let i = tips.length - 1; i >= 0; i--) {
    const [x, y] = tips[i];
    const prevX = i < tips.length - 1 ? tips[i + 1][0] : 124;
    const notchX = (x + prevX) / 2;
    const notchY = h === "bob" ? y - 2 : -38 + Math.abs(notchX) * 0.12;
    if (i < tips.length - 1) g.quadraticCurveTo(notchX + 4, notchY + 10, notchX, notchY);
    g.quadraticCurveTo((x + notchX) / 2 + 4, (y + notchY) / 2, x, y);
  }
  g.quadraticCurveTo(-120, 10, -124, 34);
  g.closePath();
  g.fill();
  g.stroke();

  // side locks framing the face
  if (h !== "short" && h !== "spiky") {
    const len = h === "bob" ? 120 : h === "messy" ? 90 : 150;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * 124, 10);
      g.bezierCurveTo(s * 128, 60, s * 118, len - 30, s * 106, len);
      g.bezierCurveTo(s * 98, len - 40, s * 96, 70, s * 98, 20);
      g.closePath();
      g.fill();
      g.stroke();
    }
  }
  // shine
  g.strokeStyle = "rgba(255,255,255,.32)";
  g.lineWidth = 9;
  g.lineCap = "round";
  g.beginPath();
  g.arc(0, 40, 150, Math.PI * 1.32, Math.PI * 1.43);
  g.stroke();
  g.beginPath();
  g.arc(0, 40, 150, Math.PI * 1.52, Math.PI * 1.6);
  g.stroke();
  g.restore();
}

function facePath(g: G, cfg: VAvatar) {
  const chin = cfg.face === "sharp" ? 134 : cfg.face === "round" ? 118 : 128;
  const cheek = cfg.face === "round" ? 104 : 100;
  g.beginPath();
  g.moveTo(-cheek, -10);
  g.ellipse(0, -10, cheek, 112, 0, Math.PI, 0);
  if (cfg.face === "round") g.bezierCurveTo(cheek, 70, 60, chin, 0, chin);
  else if (cfg.face === "sharp") g.bezierCurveTo(cheek, 50, 45, 112, 0, chin);
  else g.bezierCurveTo(cheek, 62, 55, 118, 0, chin);
  if (cfg.face === "round") g.bezierCurveTo(-60, chin, -cheek, 70, -cheek, -10);
  else if (cfg.face === "sharp") g.bezierCurveTo(-45, 112, -cheek, 50, -cheek, -10);
  else g.bezierCurveTo(-55, 118, -cheek, 62, -cheek, -10);
  g.closePath();
}

function eye(g: G, cfg: VAvatar, side: -1 | 1, open: number, p: Pose, color: string) {
  const ex = side * 44;
  const ey = 22;
  const style = cfg.eyes;
  const w = style === "sharp" ? 54 : 48;
  const h0 = style === "round" ? 58 : style === "sharp" ? 42 : style === "gentle" ? 50 : 46;
  const lid = style === "sleepy" ? 0.62 : 1;
  const o = Math.max(0, Math.min(1, open)) * lid;
  const tilt = style === "sharp" ? -0.16 * side : style === "gentle" ? 0.12 * side : 0;
  const lash = "#251a26";
  g.save();
  g.translate(ex, ey);
  g.rotate(tilt);
  if (o < 0.16) {
    // closed: happy ^ when smiling, soft line otherwise
    g.strokeStyle = lash;
    g.lineWidth = 6;
    g.lineCap = "round";
    g.beginPath();
    if (p.smile > 0.45) {
      g.moveTo(-w / 2, 6);
      g.quadraticCurveTo(0, -18, w / 2, 6);
    } else {
      g.moveTo(-w / 2, 0);
      g.quadraticCurveTo(0, 12, w / 2, 0);
    }
    g.stroke();
    g.restore();
    return;
  }
  const hh = (h0 / 2) * o;
  const cy = (h0 / 2) * (1 - o); // eyes close from the top
  // sclera
  g.beginPath();
  g.ellipse(0, cy, w / 2, hh, 0, 0, Math.PI * 2);
  g.fillStyle = "#fff";
  g.fill();
  g.save();
  g.clip();
  // iris
  const ix = p.gazeX * 9;
  const iy = 4 + p.gazeY * 7;
  const ir = w * 0.37;
  const irh = h0 * 0.44;
  const gr = g.createLinearGradient(0, iy - irh, 0, iy + irh);
  gr.addColorStop(0, shade(color, -0.55));
  gr.addColorStop(0.45, color);
  gr.addColorStop(1, shade(color, 0.45));
  g.fillStyle = gr;
  g.beginPath();
  g.ellipse(ix, iy, ir, irh, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = shade(color, -0.75);
  g.beginPath();
  g.ellipse(ix, iy + 2, ir * 0.45, irh * 0.5, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = shade(color, -0.6);
  g.lineWidth = 2;
  g.beginPath();
  g.ellipse(ix, iy, ir, irh, 0, 0, Math.PI * 2);
  g.stroke();
  // sparkle highlights
  g.fillStyle = "#fff";
  g.beginPath();
  g.ellipse(ix - ir * 0.38, iy - irh * 0.42, 7.5, 9, -0.4, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(ix + ir * 0.4, iy + irh * 0.4, 3.6, 0, Math.PI * 2);
  g.fill();
  // lid shadow
  g.fillStyle = "rgba(60,30,60,.18)";
  g.fillRect(-w, cy - hh, w * 2, hh * 0.35);
  g.restore();
  // upper lash line
  g.strokeStyle = lash;
  g.fillStyle = lash;
  g.lineCap = "round";
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(-w / 2 - 3, cy - hh * 0.35);
  g.quadraticCurveTo(0, cy - hh - 9, w / 2 + 3, cy - hh * 0.25);
  g.stroke();
  // outer-corner flick
  g.beginPath();
  const fx = side * (w / 2 + 2);
  g.moveTo(fx, cy - hh * 0.3);
  g.lineTo(fx + side * 9, cy - hh * 0.55);
  g.lineTo(fx - side * 2, cy - hh * 0.05);
  g.closePath();
  g.fill();
  // lower line
  g.lineWidth = 2;
  g.globalAlpha = 0.6;
  g.beginPath();
  g.moveTo(-w / 2 + 8, cy + hh * 0.92);
  g.quadraticCurveTo(0, cy + hh + 4, w / 2 - 8, cy + hh * 0.9);
  g.stroke();
  g.globalAlpha = 1;
  g.restore();
}

function mouth(g: G, cfg: VAvatar, p: Pose) {
  const my = 88;
  const open = Math.max(0, Math.min(1, p.mouth));
  const smile = Math.max(0, Math.min(1, p.smile));
  g.save();
  g.translate(0, my);
  g.lineCap = "round";
  g.lineJoin = "round";
  const lineCol = shade(cfg.skin, -0.62);
  if (open > 0.08) {
    const w = 16 + open * 9 + smile * 8;
    const h = 5 + open * 26;
    const mp = new Path2D();
    mp.moveTo(-w, 0);
    mp.quadraticCurveTo(-w, h * 1.15, 0, h * 1.15);
    mp.quadraticCurveTo(w, h * 1.15, w, 0);
    mp.quadraticCurveTo(0, -4 - smile * 3, -w, 0);
    mp.closePath();
    g.fillStyle = "#5a1a2a";
    g.fill(mp);
    g.save();
    g.clip(mp);
    if (open > 0.3) {
      g.fillStyle = "#fff";
      g.fillRect(-w, -6, w * 2, 6 + open * 3);
    }
    g.fillStyle = "#ff7d94";
    g.beginPath();
    g.ellipse(0, h * 1.15, w * 0.62, h * 0.45, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.strokeStyle = lineCol;
    g.lineWidth = 2.5;
    g.stroke(mp);
  } else if (cfg.mouth === "cat") {
    g.strokeStyle = lineCol;
    g.lineWidth = 3.5;
    g.beginPath();
    g.moveTo(-16, -3);
    g.quadraticCurveTo(-8, 8 + smile * 3, 0, 0);
    g.quadraticCurveTo(8, 8 + smile * 3, 16, -3);
    g.stroke();
  } else {
    const curve = cfg.mouth === "neutral" ? 2 + smile * 6 : 6 + smile * 8;
    const w = cfg.mouth === "neutral" ? 10 : 14;
    g.strokeStyle = lineCol;
    g.lineWidth = 3.5;
    g.beginPath();
    g.moveTo(-w, 0);
    g.quadraticCurveTo(0, curve, w, 0);
    g.stroke();
    if (cfg.mouth === "fang") {
      g.fillStyle = "#fff";
      g.strokeStyle = lineCol;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(4, curve * 0.45);
      g.lineTo(8, curve * 0.45 + 8);
      g.lineTo(11, curve * 0.3);
      g.closePath();
      g.fill();
      g.stroke();
    }
  }
  g.restore();
}

function outfit(g: G, cfg: VAvatar) {
  const c = cfg.shirtColor;
  const a = cfg.accentColor;
  const line = shade(c, -0.5);
  const torso = () => {
    g.beginPath();
    g.moveTo(-58, 178);
    g.bezierCurveTo(-120, 190, -190, 205, -215, 270);
    g.lineTo(-245, 460);
    g.lineTo(245, 460);
    g.lineTo(215, 270);
    g.bezierCurveTo(190, 205, 120, 190, 58, 178);
    g.closePath();
  };
  g.lineWidth = 3;
  g.lineJoin = "round";
  // hood sits behind the neck
  if (cfg.shirt === "hoodie") {
    g.fillStyle = shade(c, -0.25);
    g.strokeStyle = line;
    g.beginPath();
    g.ellipse(0, 182, 118, 42, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  // neck
  g.fillStyle = shade(cfg.skin, -0.08);
  g.strokeStyle = shade(cfg.skin, -0.45);
  g.beginPath();
  g.moveTo(-30, 112);
  g.lineTo(-34, 196);
  g.quadraticCurveTo(0, 214, 34, 196);
  g.lineTo(30, 112);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = "rgba(120,60,60,.18)";
  g.beginPath();
  g.ellipse(0, 128, 34, 18, 0, 0, Math.PI);
  g.fill();

  const gr = g.createLinearGradient(0, 170, 0, 460);
  gr.addColorStop(0, shade(c, 0.12));
  gr.addColorStop(1, shade(c, -0.2));
  g.fillStyle = gr;
  g.strokeStyle = line;
  torso();
  g.fill();
  g.stroke();
  // shoulder shading
  g.fillStyle = "rgba(0,0,0,.12)";
  g.beginPath();
  g.ellipse(0, 225, 150, 26, 0, 0, Math.PI);
  g.fill();

  switch (cfg.shirt) {
    case "tee":
      g.strokeStyle = a;
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(-50, 184);
      g.quadraticCurveTo(0, 228, 50, 184);
      g.stroke();
      break;
    case "hoodie":
      g.strokeStyle = shade(c, -0.4);
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(-46, 186);
      g.quadraticCurveTo(0, 232, 46, 186);
      g.stroke();
      g.strokeStyle = a;
      g.lineWidth = 5;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(s * 22, 206);
        g.quadraticCurveTo(s * 26, 260, s * 20, 300);
        g.stroke();
        g.fillStyle = a;
        g.beginPath();
        g.arc(s * 20, 303, 5, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case "uniform": {
      g.fillStyle = a;
      g.strokeStyle = shade(a, -0.45);
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-52, 182);
      g.lineTo(-175, 228);
      g.lineTo(-120, 300);
      g.lineTo(0, 330);
      g.lineTo(120, 300);
      g.lineTo(175, 228);
      g.lineTo(52, 182);
      g.lineTo(0, 300);
      g.closePath();
      g.fill();
      g.stroke();
      g.strokeStyle = "#fff";
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(-160, 236);
      g.lineTo(-112, 292);
      g.lineTo(0, 318);
      g.lineTo(112, 292);
      g.lineTo(160, 236);
      g.stroke();
      g.fillStyle = "#e8344e";
      g.beginPath();
      g.moveTo(0, 292);
      g.lineTo(-38, 270);
      g.lineTo(-30, 312);
      g.closePath();
      g.moveTo(0, 292);
      g.lineTo(38, 270);
      g.lineTo(30, 312);
      g.closePath();
      g.fill();
      g.beginPath();
      g.arc(0, 292, 9, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case "jacket":
    case "suit": {
      const inner = cfg.shirt === "suit" ? "#f6f6fa" : a;
      g.fillStyle = inner;
      g.strokeStyle = shade(inner, -0.4);
      g.beginPath();
      g.moveTo(-46, 184);
      g.lineTo(0, 330);
      g.lineTo(46, 184);
      g.quadraticCurveTo(0, 214, -46, 184);
      g.fill();
      g.stroke();
      if (cfg.shirt === "suit") {
        g.fillStyle = a;
        g.strokeStyle = shade(a, -0.45);
        g.beginPath();
        g.moveTo(-10, 206);
        g.lineTo(10, 206);
        g.lineTo(15, 300);
        g.lineTo(0, 322);
        g.lineTo(-15, 300);
        g.closePath();
        g.fill();
        g.stroke();
      }
      g.fillStyle = shade(c, -0.12);
      g.strokeStyle = line;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(s * 46, 182);
        g.lineTo(s * 78, 250);
        g.lineTo(s * 58, 262);
        g.lineTo(s * 20, 380);
        g.lineTo(s * 4, 460);
        g.lineTo(s * 70, 460);
        g.lineTo(s * 120, 200);
        g.closePath();
        g.fill();
        g.stroke();
      }
      break;
    }
    case "sweater":
      g.fillStyle = shade(c, 0.05);
      g.strokeStyle = line;
      g.beginPath();
      g.moveTo(-42, 150);
      g.lineTo(-48, 205);
      g.quadraticCurveTo(0, 222, 48, 205);
      g.lineTo(42, 150);
      g.quadraticCurveTo(0, 162, -42, 150);
      g.fill();
      g.stroke();
      g.strokeStyle = "rgba(0,0,0,.18)";
      g.lineWidth = 2;
      for (let x = -36; x <= 36; x += 9) {
        g.beginPath();
        g.moveTo(x, 156);
        g.lineTo(x * 1.1, 208);
        g.stroke();
      }
      g.strokeStyle = alpha(a, 0.9);
      g.lineWidth = 8;
      g.beginPath();
      g.moveTo(-200, 330);
      g.lineTo(200, 330);
      g.stroke();
      break;
  }
}

function extraBack(g: G, cfg: VAvatar, t: number) {
  if (cfg.extra === "halo") {
    g.save();
    g.shadowColor = cfg.extraColor;
    g.shadowBlur = 24;
    g.strokeStyle = cfg.extraColor;
    g.lineWidth = 9;
    g.beginPath();
    g.ellipse(0, -172 + Math.sin(t * 2) * 4, 82, 20, 0, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }
}

function extraFront(g: G, cfg: VAvatar, dx: number) {
  const col = cfg.extraColor;
  const dark = shade(col, -0.45);
  g.lineJoin = "round";
  switch (cfg.extra) {
    case "glasses":
      g.save();
      g.translate(dx, 0);
      g.strokeStyle = dark;
      g.lineWidth = 5;
      g.fillStyle = "rgba(180,220,255,.12)";
      for (const s of [-1, 1]) {
        g.beginPath();
        g.roundRect(s * 44 - 33, -4, 66, 54, 18);
        g.fill();
        g.stroke();
      }
      g.beginPath();
      g.moveTo(-11, 14);
      g.quadraticCurveTo(0, 6, 11, 14);
      g.stroke();
      g.restore();
      break;
    case "catEars":
      for (const s of [-1, 1]) {
        g.fillStyle = cfg.hairColor;
        g.strokeStyle = shade(cfg.hairColor, -0.45);
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(s * 40, -128);
        g.lineTo(s * 108, -196);
        g.lineTo(s * 112, -96);
        g.closePath();
        g.fill();
        g.stroke();
        g.fillStyle = "#ff9ec1";
        g.beginPath();
        g.moveTo(s * 62, -128);
        g.lineTo(s * 102, -172);
        g.lineTo(s * 102, -112);
        g.closePath();
        g.fill();
      }
      break;
    case "headphones":
      g.strokeStyle = dark;
      g.lineWidth = 14;
      g.lineCap = "round";
      g.beginPath();
      g.arc(0, -10, 136, Math.PI * 1.08, Math.PI * 1.92);
      g.stroke();
      g.strokeStyle = col;
      g.lineWidth = 8;
      g.beginPath();
      g.arc(0, -10, 136, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
      for (const s of [-1, 1]) {
        g.fillStyle = col;
        g.strokeStyle = dark;
        g.lineWidth = 4;
        g.beginPath();
        g.roundRect(s * 128 - 22, -26, 44, 82, 20);
        g.fill();
        g.stroke();
        g.fillStyle = "rgba(255,255,255,.35)";
        g.beginPath();
        g.roundRect(s * 128 - 8, -12, 16, 54, 8);
        g.fill();
      }
      break;
    case "horns":
      for (const s of [-1, 1]) {
        g.fillStyle = col;
        g.strokeStyle = dark;
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(s * 42, -126);
        g.quadraticCurveTo(s * 50, -190, s * 98, -200);
        g.quadraticCurveTo(s * 72, -170, s * 74, -118);
        g.closePath();
        g.fill();
        g.stroke();
      }
      break;
    case "bow": {
      g.save();
      g.translate(78, -118);
      g.rotate(0.3);
      g.fillStyle = col;
      g.strokeStyle = dark;
      g.lineWidth = 3;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(0, 0);
        g.quadraticCurveTo(s * 40, -40, s * 50, -6);
        g.quadraticCurveTo(s * 46, 30, 0, 0);
        g.fill();
        g.stroke();
      }
      g.beginPath();
      g.arc(0, -2, 10, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.restore();
      break;
    }
  }
}

function marks(g: G, cfg: VAvatar) {
  switch (cfg.marks) {
    case "freckles":
      g.fillStyle = alpha(shade(cfg.skin, -0.5), 0.55);
      for (const s of [-1, 1])
        for (const [x, y] of [
          [56, 54],
          [68, 60],
          [62, 66],
          [76, 54],
        ]) {
          g.beginPath();
          g.arc(s * x, y, 2.4, 0, Math.PI * 2);
          g.fill();
        }
      break;
    case "bandage":
      g.save();
      g.translate(64, 62);
      g.rotate(-0.35);
      g.fillStyle = "#f6d7b0";
      g.strokeStyle = "#c79f74";
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(-22, -8, 44, 16, 8);
      g.fill();
      g.stroke();
      g.fillStyle = "#e8bf93";
      g.fillRect(-7, -8, 14, 16);
      g.restore();
      break;
    case "whiskers":
      g.strokeStyle = alpha(shade(cfg.skin, -0.6), 0.7);
      g.lineWidth = 2.5;
      for (const s of [-1, 1])
        for (const k of [0, 1, 2]) {
          g.beginPath();
          g.moveTo(s * 58, 54 + k * 9);
          g.lineTo(s * 92, 48 + k * 12);
          g.stroke();
        }
      break;
    case "star": {
      g.fillStyle = cfg.accentColor;
      g.save();
      g.translate(-66, 58);
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 4 : 10;
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      g.restore();
      break;
    }
  }
}

/** draw one frame. `mirror`: false = canvas already behaves like a mirror (we mirror the pose instead) */
export function drawAvatar(g: G, cfg: VAvatar, p: Pose, W: number, H: number, t: number) {
  g.drawImage(background(cfg, W, H), 0, 0);
  const s = (H * 0.52) / 250;
  const breathe = Math.sin(t * 1.7) * 2.2;
  const yaw = Math.max(-1, Math.min(1, p.yaw));
  const pitch = Math.max(-1, Math.min(1, p.pitch));
  const roll = Math.max(-0.6, Math.min(0.6, p.roll));
  const dx = yaw * 24;
  const dy = pitch * 14;

  g.save();
  g.translate(W / 2, H * 0.47);
  g.scale(s, s);

  const headTransform = () => {
    g.translate(0, 110 + breathe * 0.6);
    g.rotate(roll);
    g.translate(dx * 0.2, -110 + dy * 0.3);
  };
  // back hair & halo sit behind the shoulders
  g.save();
  headTransform();
  extraBack(g, cfg, t);
  backHair(g, cfg, dx);
  g.restore();

  // body (moves a little with the head)
  g.save();
  g.translate(yaw * 10, breathe - 16);
  g.rotate(roll * 0.18);
  outfit(g, cfg);
  g.restore();

  // head group pivots around the neck
  g.save();
  headTransform();

  // ears
  g.fillStyle = cfg.skin;
  g.strokeStyle = shade(cfg.skin, -0.45);
  g.lineWidth = 3;
  for (const sd of [-1, 1]) {
    const shrink = 1 - Math.max(0, sd * yaw) * 0.7;
    g.beginPath();
    g.ellipse(sd * (98 - yaw * 6 * sd), 26, 14 * shrink, 24, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }

  // face
  g.save();
  g.scale(1 - Math.abs(yaw) * 0.06, 1);
  facePath(g, cfg);
  const fg = g.createLinearGradient(0, -120, 0, 130);
  fg.addColorStop(0, shade(cfg.skin, 0.06));
  fg.addColorStop(1, shade(cfg.skin, -0.05));
  g.fillStyle = fg;
  g.fill();
  g.strokeStyle = shade(cfg.skin, -0.45);
  g.lineWidth = 3;
  g.stroke();
  // hair shadow on forehead
  g.save();
  facePath(g, cfg);
  g.clip();
  g.fillStyle = alpha(shade(cfg.skin, -0.5), 0.16);
  g.beginPath();
  g.ellipse(0, -40, 120, 70, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.restore();

  // features (shift with yaw/pitch for a 3D feel)
  g.save();
  g.translate(dx, dy);
  if (cfg.blush > 0) {
    for (const sd of [-1, 1]) {
      const rg = g.createRadialGradient(sd * 62, 62, 0, sd * 62, 62, 30);
      rg.addColorStop(0, `rgba(255,110,140,${0.45 * cfg.blush})`);
      rg.addColorStop(1, "rgba(255,110,140,0)");
      g.fillStyle = rg;
      g.beginPath();
      g.ellipse(sd * 62, 62, 32, 18, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  marks(g, cfg);
  // brows
  g.strokeStyle = shade(cfg.hairColor, -0.35);
  g.lineCap = "round";
  g.lineWidth = cfg.brows === "bold" ? 7 : 4.5;
  for (const sd of [-1, 1]) {
    const by = -26 - p.brow * 10;
    const inner = cfg.brows === "angry" ? 8 : -2 - p.brow * 4;
    g.beginPath();
    g.moveTo(sd * 20, by + inner);
    g.quadraticCurveTo(sd * 44, by - 8, sd * 68, by + 2);
    g.stroke();
  }
  // eyes — avatar is drawn as your reflection, so your right eye drives the left one on screen
  eye(g, cfg, -1, p.blinkR, p, cfg.eyeColor);
  eye(g, cfg, 1, p.blinkL, p, cfg.eyeColor2 ?? cfg.eyeColor);
  // nose
  g.strokeStyle = alpha(shade(cfg.skin, -0.55), 0.7);
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(2, 56);
  g.lineTo(-3, 64);
  g.stroke();
  mouth(g, cfg, p);
  g.restore();

  frontHair(g, cfg, dx);
  extraFront(g, cfg, dx);
  g.restore();
  g.restore();
}

// ------------------------------------------------------------------ face tracking (MediaPipe, loaded on demand)
const MP = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
type Landmark = { x: number; y: number; z: number };
type FaceResult = { faceLandmarks: Landmark[][]; faceBlendshapes?: { categories: { categoryName: string; score: number }[] }[] };
type Landmarker = { detectForVideo: (v: HTMLVideoElement, t: number) => FaceResult; close: () => void };
let landmarkerP: Promise<Landmarker | null> | null = null;

function loadLandmarker(): Promise<Landmarker | null> {
  landmarkerP ??= (async () => {
    try {
      // runtime import from the CDN (kept out of the app bundle; ~10 MB wasm+model, cached by the browser)
      const vision = await (new Function("u", "return import(u)") as (u: string) => Promise<Record<string, unknown>>)(`${MP}/vision_bundle.mjs`);
      const FilesetResolver = vision.FilesetResolver as { forVisionTasks: (u: string) => Promise<unknown> };
      const FaceLandmarker = vision.FaceLandmarker as { createFromOptions: (f: unknown, o: unknown) => Promise<Landmarker> };
      const files = await FilesetResolver.forVisionTasks(`${MP}/wasm`);
      const opts = (delegate: "GPU" | "CPU") => ({ baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: "VIDEO", numFaces: 1, outputFaceBlendshapes: true });
      try {
        return await FaceLandmarker.createFromOptions(files, opts("GPU"));
      } catch {
        return await FaceLandmarker.createFromOptions(files, opts("CPU"));
      }
    } catch (e) {
      console.warn("face tracking unavailable", e);
      landmarkerP = null;
      return null;
    }
  })();
  return landmarkerP;
}

function poseFrom(res: FaceResult): Pose | null {
  const lm = res.faceLandmarks?.[0];
  if (!lm) return null;
  const bs: Record<string, number> = {};
  for (const c of res.faceBlendshapes?.[0]?.categories ?? []) bs[c.categoryName] = c.score;
  const nose = lm[1],
    l = lm[234],
    r = lm[454],
    top = lm[10],
    chin = lm[152];
  const faceW = Math.hypot(r.x - l.x, r.y - l.y) || 1;
  // camera image is not mirrored: flip yaw/roll so the avatar moves like a reflection
  const yaw = -((nose.x - (l.x + r.x) / 2) / faceW) * 3.2;
  const pitch = ((nose.y - (top.y + chin.y) / 2) / Math.hypot(chin.x - top.x, chin.y - top.y) - 0.07) * 4;
  const roll = -Math.atan2(r.y - l.y, r.x - l.x);
  const blink = (v: number) => Math.max(0, Math.min(1, 1 - (v - 0.15) / 0.45));
  return {
    yaw,
    pitch,
    roll,
    blinkL: blink(bs.eyeBlinkLeft ?? 0),
    blinkR: blink(bs.eyeBlinkRight ?? 0),
    mouth: Math.min(1, (bs.jawOpen ?? 0) * 1.9 + (bs.mouthFunnel ?? 0) * 0.4),
    smile: Math.min(1, ((bs.mouthSmileLeft ?? 0) + (bs.mouthSmileRight ?? 0)) * 0.8 + 0.15),
    gazeX: ((bs.eyeLookOutLeft ?? 0) - (bs.eyeLookInLeft ?? 0) + (bs.eyeLookInRight ?? 0) - (bs.eyeLookOutRight ?? 0)) * 0.6,
    gazeY: ((bs.eyeLookDownLeft ?? 0) + (bs.eyeLookDownRight ?? 0) - (bs.eyeLookUpLeft ?? 0) - (bs.eyeLookUpRight ?? 0)) * 0.6,
    brow: Math.min(1, (bs.browInnerUp ?? 0) * 1.2),
  };
}

// ------------------------------------------------------------------ live engine (preview + calls)
export type AvatarEngine = {
  canvas: HTMLCanvasElement;
  stream: () => MediaStream;
  setLook: (cfg: VAvatar) => void;
  mode: () => "loading" | "face" | "voice";
  stop: () => void;
};

/**
 * Animates the avatar. With `camera` it tracks your face; otherwise (or until the face model loads, or when
 * no face is visible) it lip-syncs to `level()` (mic loudness) with idle blinking & sway.
 */
export function startAvatar(opts: { cfg: VAvatar; width: number; height: number; camera: boolean; cameraId?: string; level?: () => number; onMode?: (m: "loading" | "face" | "voice") => void }): AvatarEngine {
  const canvas = document.createElement("canvas");
  canvas.width = opts.width;
  canvas.height = opts.height;
  const g = canvas.getContext("2d")!;
  let cfg = opts.cfg;
  let stopped = false;
  let mode: "loading" | "face" | "voice" = opts.camera ? "loading" : "voice";
  const setMode = (m: typeof mode) => {
    if (m !== mode) {
      mode = m;
      opts.onMode?.(m);
    }
  };
  let cam: MediaStream | null = null;
  let video: HTMLVideoElement | null = null;
  let lmk: Landmarker | null = null;
  let target: Pose = { ...NEUTRAL };
  const cur: Pose = { ...NEUTRAL };
  let lastFace = 0;
  let nextBlink = performance.now() + 2500;
  let blinkUntil = 0;
  let stream: MediaStream | null = null;

  if (opts.camera) {
    void (async () => {
      try {
        const video_: MediaTrackConstraints = { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } };
        if (opts.cameraId && opts.cameraId !== "default") video_.deviceId = { exact: opts.cameraId };
        const [s, l] = await Promise.all([navigator.mediaDevices.getUserMedia({ video: video_ }), loadLandmarker()]);
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        cam = s;
        lmk = l;
        if (!l) return setMode("voice");
        video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.srcObject = s;
        await video.play();
      } catch {
        setMode("voice");
      }
    })();
  } else opts.onMode?.("voice");

  const t0 = performance.now();
  let lastVideoTime = -1;
  const frame = () => {
    if (stopped) return;
    const now = performance.now();
    const t = (now - t0) / 1000;
    // face tracking
    if (lmk && video && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      try {
        const p = poseFrom(lmk.detectForVideo(video, now));
        if (p) {
          target = p;
          lastFace = now;
          setMode("face");
        }
      } catch {
        /* skip frame */
      }
    }
    const tracking = now - lastFace < 700;
    if (!tracking) {
      if (mode === "face") setMode("voice");
      // voice + idle animation
      const lvl = Math.min(1, (opts.level?.() ?? 0) * 9);
      if (now > nextBlink) {
        blinkUntil = now + 130;
        nextBlink = now + 2200 + Math.random() * 3200;
      }
      const b = now < blinkUntil ? 0 : 1;
      target = {
        yaw: Math.sin(t * 0.5) * 0.12,
        pitch: Math.sin(t * 0.7) * 0.06 - lvl * 0.05,
        roll: Math.sin(t * 0.37) * 0.05,
        blinkL: b,
        blinkR: b,
        mouth: lvl > 0.06 ? lvl * (0.65 + Math.sin(t * 22) * 0.35) : 0,
        smile: 0.35 + lvl * 0.2,
        gazeX: Math.sin(t * 0.3) * 0.3,
        gazeY: 0,
        brow: lvl * 0.3,
      };
    }
    // smoothing (fast for blinks/mouth, softer for head)
    const k: Record<keyof Pose, number> = { yaw: 0.35, pitch: 0.35, roll: 0.35, blinkL: 0.7, blinkR: 0.7, mouth: 0.6, smile: 0.3, gazeX: 0.4, gazeY: 0.4, brow: 0.35 };
    for (const key of Object.keys(k) as (keyof Pose)[]) cur[key] += (target[key] - cur[key]) * k[key];
    drawAvatar(g, cfg, cur, canvas.width, canvas.height, t);
  };
  frame();
  const timer = setInterval(frame, 1000 / 30); // interval (not rAF) keeps the stream alive in background tabs

  return {
    canvas,
    stream: () => (stream ??= canvas.captureStream(30)),
    setLook: (c) => {
      cfg = c;
    },
    mode: () => mode,
    stop: () => {
      stopped = true;
      clearInterval(timer);
      cam?.getTracks().forEach((t) => t.stop());
      stream?.getTracks().forEach((t) => t.stop());
      if (video) video.srcObject = null;
    },
  };
}
