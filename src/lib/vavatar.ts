"use client";

// V-Avatar — a live anime character that follows your face (MediaPipe face tracking, in the browser,
// nothing leaves your device) or your voice when there's no camera. Rendered on a canvas and sent
// into calls as a normal video track.

// ------------------------------------------------------------------ look (saved on the profile)
export type HairStyle =
  | "short"
  | "spiky"
  | "messy"
  | "sidepart"
  | "slick"
  | "buzz"
  | "undercut"
  | "mohawk"
  | "curly"
  | "afro"
  | "dreads"
  | "shortlocs"
  | "rasta"
  | "twists"
  | "cornrows"
  | "waves"
  | "wolfcut"
  | "mullet"
  | "emo"
  | "long"
  | "wavy"
  | "hime"
  | "bob"
  | "bun"
  | "braids"
  | "twintails"
  | "ponytail";
export type Outfit =
  | "tee"
  | "acidtee"
  | "hoodie"
  | "zipup"
  | "tank"
  | "jersey"
  | "polo"
  | "flannel"
  | "denim"
  | "bomber"
  | "track"
  | "puffer"
  | "varsity"
  | "uniform"
  | "jacket"
  | "sweater"
  | "suit";
export type Extra = "none" | "catEars" | "headphones" | "halo" | "horns" | "bow" | "crown" | "flowerCrown" | "butterflies" | "wings" | "mask";
export type Hat = "none" | "cap" | "backcap" | "beanie" | "bucket" | "durag" | "bandana" | "tam" | "headband";
export type Eyewear = "none" | "glasses" | "shades" | "round" | "rimless" | "heart" | "visor";
export type VAvatar = {
  v: 1;
  body: "masc" | "fem";
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
  /** custom print on the shirt/hoodie, e.g. "qyopy" */
  shirtText: string;
  textColor: string;
  textStyle: "bold" | "script" | "gothic" | "graffiti" | "mono";
  /** printed graphic on the shirt */
  graphic: "none" | "brokenHeart" | "butterfly" | "skull" | "lightning" | "flames" | "stars";
  extra: Extra;
  extraColor: string;
  hat: Hat;
  hatColor: string;
  eyewear: Eyewear;
  eyewearColor: string;
  piercing: "none" | "noseRing" | "noseStud" | "septum" | "lipRing" | "eyebrow";
  tattoo: "none" | "teardrop" | "cross" | "heart" | "star" | "stitches";
  // jewellery
  metal: "gold" | "silver" | "rose" | "iced";
  earrings: "none" | "stud" | "bigStud" | "hoop" | "cross" | "dangle" | "pearl";
  chain: "none" | "cubanIced" | "cuban" | "rope" | "tennis" | "figaro" | "pearls" | "layered";
  pendant: "none" | "cross" | "diamond" | "heart" | "brokenHeart" | "butterfly" | "lock" | "letter" | "star";
  grillz: "none" | "gold" | "silver" | "iced";
  bg: "galaxy" | "sunset" | "sakura" | "neon" | "mint" | "room" | "solid" | "green";
  bgColor: string;
};

export const DEFAULT_AVATAR: VAvatar = {
  v: 1,
  body: "masc",
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
  shirtText: "",
  textColor: "#ffffff",
  textStyle: "bold",
  graphic: "none",
  extra: "headphones",
  extraColor: "#00c2ff",
  hat: "none",
  hatColor: "#111318",
  eyewear: "none",
  eyewearColor: "#111318",
  piercing: "none",
  tattoo: "none",
  metal: "iced",
  earrings: "none",
  chain: "none",
  pendant: "none",
  grillz: "none",
  bg: "galaxy",
  bgColor: "#5865f2",
};

export const OPTIONS = {
  body: ["masc", "fem"],
  face: ["round", "oval", "sharp"],
  eyes: ["round", "sharp", "gentle", "sleepy"],
  brows: ["soft", "bold", "angry"],
  mouth: ["smile", "cat", "neutral", "fang"],
  marks: ["none", "freckles", "bandage", "whiskers", "star"],
  hair: ["short", "spiky", "messy", "sidepart", "slick", "buzz", "waves", "cornrows", "undercut", "mohawk", "wolfcut", "mullet", "emo", "curly", "afro", "twists", "shortlocs", "dreads", "rasta", "long", "wavy", "hime", "bob", "bun", "braids", "twintails", "ponytail"],
  shirt: ["tee", "acidtee", "hoodie", "zipup", "tank", "jersey", "polo", "flannel", "denim", "bomber", "track", "puffer", "varsity", "uniform", "jacket", "sweater", "suit"],
  textStyle: ["bold", "script", "gothic", "graffiti", "mono"],
  graphic: ["none", "brokenHeart", "butterfly", "skull", "lightning", "flames", "stars"],
  extra: ["none", "headphones", "catEars", "halo", "horns", "bow", "crown", "flowerCrown", "butterflies", "wings", "mask"],
  hat: ["none", "cap", "backcap", "beanie", "bucket", "durag", "bandana", "tam", "headband"],
  eyewear: ["none", "glasses", "shades", "round", "rimless", "heart", "visor"],
  piercing: ["none", "noseRing", "noseStud", "septum", "lipRing", "eyebrow"],
  tattoo: ["none", "teardrop", "cross", "heart", "star", "stitches"],
  metal: ["iced", "gold", "silver", "rose"],
  earrings: ["none", "stud", "bigStud", "hoop", "cross", "dangle", "pearl"],
  chain: ["none", "cubanIced", "cuban", "rope", "tennis", "figaro", "pearls", "layered"],
  pendant: ["none", "cross", "diamond", "heart", "brokenHeart", "butterfly", "lock", "letter", "star"],
  grillz: ["none", "gold", "silver", "iced"],
  bg: ["galaxy", "sunset", "sakura", "neon", "mint", "room", "solid", "green"],
} as const;

export const SWATCH = {
  skin: ["#fff1e8", "#ffe0cf", "#f6cfb4", "#e8b58f", "#c98e66", "#a46a45", "#7a4a2f", "#4e2f1f", "#d9f0ff", "#c8ffd9"],
  hair: ["#1b1b2a", "#2b2d52", "#5a3a2a", "#a8693c", "#f2d27a", "#f7f3ea", "#ff7ab8", "#ff4d6d", "#8b5cff", "#2fd3ff", "#36d39a", "#ff9f40"],
  eyes: ["#7b5cff", "#2fa8ff", "#3ad08e", "#ffb02e", "#ff4d6d", "#9b6b43", "#2b2b38", "#e04cff", "#00e0d0", "#ffd400"],
  cloth: ["#1f1b3a", "#111318", "#f4f4f8", "#5865f2", "#ff2bd6", "#ff4d6d", "#ffb02e", "#36d39a", "#2fa8ff", "#8b5cff", "#7a4a2f", "#3a5a40", "#c0c4cc", "#e8d5b0"],
};

const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
export function randomAvatar(): VAvatar {
  const fem = Math.random() < 0.5;
  return {
    v: 1,
    body: fem ? "fem" : "masc",
    skin: pick(SWATCH.skin.slice(0, 8)),
    face: pick(OPTIONS.face),
    eyes: pick(OPTIONS.eyes),
    eyeColor: pick(SWATCH.eyes),
    eyeColor2: Math.random() < 0.12 ? pick(SWATCH.eyes) : null,
    brows: pick(OPTIONS.brows),
    mouth: pick(OPTIONS.mouth),
    blush: Math.round(Math.random() * 10) / 10,
    marks: Math.random() < 0.6 ? "none" : pick(OPTIONS.marks),
    hair: fem
      ? pick(["long", "wavy", "hime", "bob", "bun", "braids", "twintails", "ponytail", "curly", "messy", "wolfcut", "emo", "rasta"] as const)
      : pick(["short", "spiky", "messy", "sidepart", "slick", "buzz", "waves", "cornrows", "undercut", "mohawk", "mullet", "curly", "afro", "twists", "shortlocs", "dreads", "rasta"] as const),
    hairColor: pick(SWATCH.hair),
    hairTip: Math.random() < 0.4 ? pick(SWATCH.hair) : null,
    shirt: pick(OPTIONS.shirt),
    shirtColor: pick(SWATCH.cloth),
    accentColor: pick(SWATCH.cloth),
    shirtText: "",
    textColor: "#ffffff",
    textStyle: pick(OPTIONS.textStyle),
    graphic: Math.random() < 0.6 ? "none" : pick(OPTIONS.graphic),
    extra: Math.random() < 0.6 ? "none" : pick(OPTIONS.extra),
    extraColor: pick(SWATCH.cloth),
    hat: Math.random() < 0.6 ? "none" : pick(OPTIONS.hat),
    hatColor: pick(SWATCH.cloth),
    eyewear: Math.random() < 0.6 ? "none" : pick(OPTIONS.eyewear),
    eyewearColor: pick(["#111318", "#f5b301", "#c9d1dc", "#ff2bd6", "#2fa8ff"]),
    piercing: Math.random() < 0.75 ? "none" : pick(OPTIONS.piercing),
    tattoo: Math.random() < 0.8 ? "none" : pick(OPTIONS.tattoo),
    metal: pick(OPTIONS.metal),
    earrings: Math.random() < 0.5 ? "none" : pick(OPTIONS.earrings),
    chain: Math.random() < 0.4 ? "none" : pick(OPTIONS.chain),
    pendant: Math.random() < 0.6 ? "none" : pick(OPTIONS.pendant),
    grillz: Math.random() < 0.8 ? "none" : pick(OPTIONS.grillz),
    bg: pick(OPTIONS.bg.slice(0, 6)),
    bgColor: pick(SWATCH.cloth),
  };
}

const HEX = /^#[0-9a-f]{6}$/i;
/** printable shirt text: letters, numbers, a little punctuation — max 14 chars */
export const cleanShirtText = (s: unknown) => (typeof s === "string" ? s.replace(/[^\p{L}\p{N} .,!?'&@#$*+_\-♥★]/gu, "").slice(0, 14) : "");
/** sanitize anything coming from the database */
export function normalizeAvatar(x: unknown): VAvatar {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const col = (k: keyof VAvatar) => (typeof o[k] === "string" && HEX.test(o[k] as string) ? (o[k] as string) : (DEFAULT_AVATAR[k] as string));
  const one = <K extends keyof typeof OPTIONS>(k: K) => ((OPTIONS[k] as readonly string[]).includes(o[k] as string) ? o[k] : DEFAULT_AVATAR[k as keyof VAvatar]) as VAvatar[K & keyof VAvatar];
  return {
    v: 1,
    body: one("body"),
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
    shirtText: cleanShirtText(o.shirtText),
    textColor: col("textColor"),
    textStyle: one("textStyle"),
    graphic: one("graphic"),
    extra: one("extra"),
    extraColor: col("extraColor"),
    // older saves kept caps/beanies/glasses in "extra"
    hat: (["cap", "beanie"].includes(o.extra as string) && !o.hat ? o.extra : one("hat")) as Hat,
    hatColor: o.hatColor ? col("hatColor") : col("extraColor"),
    eyewear: (["glasses", "shades"].includes(o.extra as string) && !o.eyewear ? o.extra : one("eyewear")) as Eyewear,
    eyewearColor: o.eyewearColor ? col("eyewearColor") : ["glasses", "shades"].includes(o.extra as string) ? col("extraColor") : DEFAULT_AVATAR.eyewearColor,
    piercing: one("piercing"),
    tattoo: one("tattoo"),
    metal: one("metal"),
    earrings: one("earrings"),
    chain: one("chain"),
    pendant: one("pendant"),
    grillz: one("grillz"),
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

const CROPPED = new Set<HairStyle>(["buzz", "undercut", "mohawk", "slick"]);
const LONG = new Set<HairStyle>(["long", "wavy", "hime", "braids"]);

/** draws `path` with only its outer outline (fat dark stroke first, fill on top) */
function blob(g: G, path: Path2D, fill: string | CanvasGradient, line: string, lw = 6) {
  g.strokeStyle = line;
  g.lineWidth = lw;
  g.lineJoin = "round";
  g.stroke(path);
  g.fillStyle = fill;
  g.fill(path);
}

// ------------------------------------------------------------------ locs / twists / cornrows / waves / wolf cut / mullet / emo
function qpt(p0: number[], c: number[], p1: number[], t: number) {
  return [(1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1]];
}
/** one loc/twist: outlined rounded stroke, optional dyed tip, little wrap marks */
function loc(g: G, cfg: VAvatar, p0: number[], c: number[], p1: number[], w: number, fill: string | CanvasGradient, line: string, twist = false) {
  g.lineCap = "round";
  g.lineJoin = "round";
  g.strokeStyle = line;
  g.lineWidth = w + 5;
  g.beginPath();
  g.moveTo(p0[0], p0[1]);
  g.quadraticCurveTo(c[0], c[1], p1[0], p1[1]);
  g.stroke();
  g.strokeStyle = fill;
  g.lineWidth = w;
  g.stroke();
  if (cfg.hairTip) {
    g.strokeStyle = cfg.hairTip;
    g.lineWidth = w;
    g.beginPath();
    for (let i = 0; i <= 8; i++) {
      const [x, y] = qpt(p0, c, p1, 0.66 + (i / 8) * 0.34);
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.stroke();
  }
  g.strokeStyle = "rgba(0,0,0,.22)";
  g.lineWidth = 1.6;
  const n = twist ? 5 : 4;
  for (let k = 1; k <= n; k++) {
    const t = k / (n + 1);
    const [x, y] = qpt(p0, c, p1, t);
    const [x2, y2] = qpt(p0, c, p1, Math.min(1, t + 0.02));
    const a = Math.atan2(y2 - y, x2 - x) + Math.PI / 2;
    const r = w * 0.45;
    g.beginPath();
    g.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r - (twist ? 2 : 0));
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r + (twist ? 2 : 0));
    g.stroke();
  }
}

const NEW_HAIR = new Set<HairStyle>(["shortlocs", "rasta", "twists", "cornrows", "waves", "wolfcut", "mullet", "emo"]);

function backHair2(g: G, cfg: VAvatar, fill: CanvasGradient, line: string) {
  const h = cfg.hair;
  if (h === "rasta") {
    // long, thick locs falling past the shoulders
    for (let x = -140; x <= 140; x += 19) {
      const len = 250 + (((x * 53) % 70) + 70) % 70;
      loc(g, cfg, [x * 0.8, -70], [x * 1.18, 80], [x * 1.05 + (x > 0 ? 18 : -18), len], 20, fill, line);
    }
  }
  if (h === "mullet") {
    g.beginPath();
    g.moveTo(-104, 0);
    g.bezierCurveTo(-118, 80, -96, 170, -70, 214);
    g.lineTo(-40, 196);
    g.lineTo(-16, 222);
    g.lineTo(10, 198);
    g.lineTo(36, 222);
    g.lineTo(70, 214);
    g.bezierCurveTo(96, 170, 118, 80, 104, 0);
    g.closePath();
    g.fill();
    g.stroke();
  }
  if (h === "wolfcut" || h === "emo") {
    // choppy layered back
    g.beginPath();
    g.moveTo(-120, -40);
    const pts = h === "wolfcut" ? [[-138, 60], [-118, 80], [-130, 128], [-100, 120], [-96, 160], [-60, 128]] : [[-130, 50], [-112, 70], [-118, 110], [-90, 100]];
    for (const [x, y] of pts) g.lineTo(x, y);
    for (const [x, y] of [...pts].reverse()) g.lineTo(-x, y);
    g.lineTo(120, -40);
    g.closePath();
    g.fill();
    g.stroke();
  }
  // scalp volume
  g.beginPath();
  const tight = h === "cornrows" || h === "waves" || h === "shortlocs" || h === "twists";
  g.ellipse(0, -32, tight ? 113 : 120, tight ? 104 : 110, 0, Math.PI * 0.92, Math.PI * 2.08);
  g.closePath();
  g.fill();
  g.stroke();
}

function frontHair2(g: G, cfg: VAvatar, fill: CanvasGradient, line: string) {
  const h = cfg.hair;
  if (h === "waves" || h === "cornrows") {
    const cap = capPath(h === "waves" ? -64 : -60);
    g.fill(cap);
    g.stroke(cap);
    g.save();
    g.clip(cap);
    if (h === "waves") {
      // 360 waves
      g.strokeStyle = "rgba(255,255,255,.2)";
      g.lineWidth = 3;
      for (let r = 20; r < 170; r += 13) {
        g.beginPath();
        for (let a = Math.PI * 1.05; a <= Math.PI * 1.95; a += 0.05) {
          const rr = r + Math.sin(a * 22) * 2.5;
          const x = Math.cos(a) * rr * 1.1;
          const y = -150 + Math.sin(a) * -rr * 0.2 + r * 0.95;
          if (a === Math.PI * 1.05) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
    } else {
      // straight-back cornrows
      for (let x = -100; x <= 100; x += 25) {
        g.strokeStyle = line;
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(x - 12, -60);
        g.quadraticCurveTo(x * 0.9 - 12, -110, x * 0.4 - 6, -150);
        g.stroke();
        g.strokeStyle = "rgba(255,255,255,.25)";
        g.lineWidth = 2;
        for (let k = 0; k < 7; k++) {
          const t = k / 7;
          const yy = -64 - t * 80;
          const xx = x + (x * 0.4 - x) * t;
          g.beginPath();
          g.moveTo(xx - 6, yy + 3);
          g.lineTo(xx + 4, yy - 3);
          g.stroke();
        }
      }
    }
    g.restore();
    return;
  }
  if (h === "shortlocs" || h === "twists") {
    const cap = capPath(-56);
    g.fill(cap);
    g.stroke(cap);
    const len = h === "twists" ? 30 : 58;
    const w = h === "twists" ? 13 : 15;
    // locs sprouting from the crown, flopping outward (emo-rap / freeform look)
    for (let i = 0; i < 15; i++) {
      const a = Math.PI * 1.02 + (i / 14) * Math.PI * 0.96;
      const bx = Math.cos(a) * 92;
      const by = -34 + Math.sin(a) * 92;
      const ex = bx + Math.cos(a) * len;
      const ey = by + Math.sin(a) * len * 0.7 + (Math.abs(Math.cos(a)) > 0.6 ? len * 0.5 : -6);
      loc(g, cfg, [bx, by], [bx + Math.cos(a) * len * 0.6, by + Math.sin(a) * len * 0.6 - 8], [ex, ey], w, fill, line, h === "twists");
    }
    // a few hanging over the forehead
    for (const [x, ey] of [
      [-52, 4],
      [-14, -6],
      [26, 2],
      [62, 10],
    ]) loc(g, cfg, [x * 0.8, -90], [x, -40], [x * 1.05, ey - (h === "twists" ? 30 : 0)], w, fill, line, h === "twists");
    return;
  }
  if (h === "rasta") {
    const cap = capPath(-58);
    g.fill(cap);
    g.stroke(cap);
    for (const [x, x2, y2] of [
      [-70, -122, 220],
      [-40, -112, 260],
      [40, 112, 260],
      [70, 122, 220],
      [-20, -96, 120],
      [20, 96, 120],
    ]) loc(g, cfg, [x, -80], [x2 * 0.95, 20], [x2, y2], 20, fill, line);
    return;
  }
  // fringe styles
  const tips: Record<string, [number, number][]> = {
    wolfcut: [[-118, 46], [-96, 20], [-70, 36], [-40, 8], [-8, 24], [26, 4], [58, 30], [90, 16], [118, 44]],
    mullet: [[-108, 2], [-72, -4], [-34, 8], [6, 0], [44, 10], [82, -2], [112, 12]],
    emo: [[-114, 10], [-90, -8], [-56, -20], [-10, 20], [30, 50], [62, 66], [96, 74], [118, 60]],
  };
  const list = tips[h];
  g.beginPath();
  g.moveTo(-124, 34);
  g.bezierCurveTo(-130, -95, -70, -142, 0, -142);
  g.bezierCurveTo(70, -142, 130, -95, 124, 34);
  for (let i = list.length - 1; i >= 0; i--) {
    const [x, y] = list[i];
    const prevX = i < list.length - 1 ? list[i + 1][0] : 124;
    const notchX = (x + prevX) / 2;
    const notchY = h === "emo" ? Math.min(y, list[Math.min(i + 1, list.length - 1)][1]) - 26 : -36 + Math.abs(notchX) * 0.1;
    if (i < list.length - 1) g.quadraticCurveTo(notchX + 4, notchY + 10, notchX, notchY);
    g.quadraticCurveTo((x + notchX) / 2 + 4, (y + notchY) / 2, x, y);
  }
  g.quadraticCurveTo(-120, 10, -124, 34);
  g.closePath();
  g.fill();
  g.stroke();
  if (h === "wolfcut") {
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * 124, 0);
      g.lineTo(s * 132, 60);
      g.lineTo(s * 116, 52);
      g.lineTo(s * 120, 104);
      g.lineTo(s * 100, 70);
      g.lineTo(s * 98, 10);
      g.closePath();
      g.fill();
      g.stroke();
    }
  }
}

function backHair(g: G, cfg: VAvatar, dx: number) {
  g.save();
  g.translate(-dx * 0.5, 0);
  hairFill(g, cfg, -140, 330);
  const h = cfg.hair;
  const fill = g.fillStyle as CanvasGradient;
  const line = g.strokeStyle as string;
  if (NEW_HAIR.has(h)) {
    backHair2(g, cfg, fill, line);
    g.restore();
    return;
  }

  if (h === "afro") {
    const p = new Path2D();
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      p.moveTo(Math.cos(a) * 150 + 40, -50 + Math.sin(a) * 138);
      p.arc(Math.cos(a) * 150, -50 + Math.sin(a) * 138, 40, 0, Math.PI * 2);
    }
    p.ellipse(0, -50, 155, 140, 0, 0, Math.PI * 2);
    blob(g, p, fill, line);
    g.restore();
    return;
  }
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
  if (h === "dreads") {
    // locs hanging behind the head
    for (let x = -132; x <= 132; x += 21) {
      const len = 150 + ((x * 37) % 60 + 60) % 60;
      g.lineCap = "round";
      g.strokeStyle = line;
      g.lineWidth = 21;
      g.beginPath();
      g.moveTo(x * 0.85, -60);
      g.quadraticCurveTo(x * 1.08, 40, x * 1.12, len);
      g.stroke();
      g.strokeStyle = fill;
      g.lineWidth = 15;
      g.stroke();
    }
    hairFill(g, cfg, -140, 330);
  }
  if (h === "bun") {
    g.beginPath();
    g.arc(0, -150, 48, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.strokeStyle = shade(cfg.hairColor, -0.3);
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, -150, 30, 0.6, 4.4);
    g.stroke();
    hairFill(g, cfg, -140, 330);
  }

  g.beginPath();
  if (LONG.has(h)) {
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
  } else if (CROPPED.has(h) || h === "bun") {
    g.moveTo(-112, 0);
    g.bezierCurveTo(-116, 20, -110, 34, -104, 40);
    g.lineTo(104, 40);
    g.bezierCurveTo(110, 34, 116, 20, 112, 0);
  } else {
    g.moveTo(-116, -20);
    g.bezierCurveTo(-124, 40, -112, 70, -100, 78);
    g.lineTo(100, 78);
    g.bezierCurveTo(112, 70, 124, 40, 116, -20);
  }
  const tight = CROPPED.has(h) || h === "bun";
  g.ellipse(0, -30, tight ? 113 : 120, tight ? 104 : 108, 0, 0, Math.PI, true);
  g.closePath();
  if (h === "buzz" || h === "undercut" || h === "mohawk") g.globalAlpha = 0.9;
  g.fill();
  g.stroke();
  g.globalAlpha = 1;

  if (h === "curly") {
    const p = new Path2D();
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI * 0.95 + (i / 12) * Math.PI * 1.1;
      const x = Math.cos(a) * 124;
      const y = -30 + Math.sin(a) * 112;
      p.moveTo(x + 26, y);
      p.arc(x, y, 26, 0, Math.PI * 2);
    }
    for (const s of [-1, 1])
      for (const y of [0, 36, 70]) {
        p.moveTo(s * 118 + 24, y);
        p.arc(s * 118, y, 24, 0, Math.PI * 2);
      }
    blob(g, p, fill, line, 5);
  }
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

function hairShine(g: G, r = 150, y = 40) {
  g.strokeStyle = "rgba(255,255,255,.32)";
  g.lineWidth = 9;
  g.lineCap = "round";
  g.beginPath();
  g.arc(0, y, r, Math.PI * 1.32, Math.PI * 1.43);
  g.stroke();
  g.beginPath();
  g.arc(0, y, r, Math.PI * 1.52, Math.PI * 1.6);
  g.stroke();
}

/** the scalp cap with a hairline at `line` (no fringe) */
function capPath(hairline: number, side = 0) {
  const p = new Path2D();
  p.moveTo(-115, 6 + side);
  p.bezierCurveTo(-122, -100, -64, -142, 0, -142);
  p.bezierCurveTo(64, -142, 122, -100, 115, 6 + side);
  p.quadraticCurveTo(104, hairline + 20, 72, hairline + 4);
  p.quadraticCurveTo(0, hairline - 14, -72, hairline + 4);
  p.quadraticCurveTo(-104, hairline + 20, -115, 6 + side);
  p.closePath();
  return p;
}

function frontHair(g: G, cfg: VAvatar, dx: number) {
  const h = cfg.hair;
  g.save();
  g.translate(dx * 0.35, 0);
  hairFill(g, cfg, -140, 60);
  const fill = g.fillStyle as CanvasGradient;
  const line = g.strokeStyle as string;
  if (NEW_HAIR.has(h)) {
    frontHair2(g, cfg, fill, line);
    if (h !== "waves" && h !== "cornrows") hairShine(g);
    g.restore();
    return;
  }

  // ---- styles without a fringe
  if (h === "buzz" || h === "slick" || h === "undercut" || h === "mohawk" || h === "bun" || h === "dreads" || h === "braids") {
    const faded = h === "buzz" || h === "undercut" || h === "mohawk";
    g.globalAlpha = faded ? 0.88 : 1;
    const cap = capPath(h === "buzz" ? -66 : h === "slick" ? -60 : -58);
    g.fill(cap);
    g.stroke(cap);
    g.globalAlpha = 1;
    if (h === "buzz") {
      g.fillStyle = alpha(shade(cfg.hairColor, -0.4), 0.25);
      for (let i = 0; i < 70; i++) {
        const a = Math.PI + (i * 0.61803 * Math.PI) % Math.PI;
        const r = 60 + ((i * 47) % 50);
        g.beginPath();
        g.arc(Math.cos(a) * r, -40 + Math.sin(a) * r * 0.9, 1.6, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (h === "slick" || h === "bun" || h === "braids") {
      // comb lines swept back
      g.strokeStyle = "rgba(255,255,255,.22)";
      g.lineWidth = 3;
      for (const x of [-70, -38, -6, 26, 58]) {
        g.beginPath();
        g.moveTo(x, -66);
        g.quadraticCurveTo(x * 1.2, -110, x * 0.5, -138);
        g.stroke();
      }
    }
    if (h === "braids") {
      g.strokeStyle = shade(cfg.hairColor, -0.5);
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(0, -72);
      g.lineTo(0, -140);
      g.stroke();
      for (const s of [-1, 1]) {
        for (let k = 0; k < 9; k++) {
          const y = 0 + k * 30;
          const x = s * (112 + k * 5);
          const p = new Path2D();
          p.ellipse(x + (k % 2 ? 5 : -5) * s, y, 17, 19, (k % 2 ? 0.5 : -0.5) * s, 0, Math.PI * 2);
          blob(g, p, fill, line, 4);
        }
        g.fillStyle = cfg.accentColor;
        g.beginPath();
        g.roundRect(s * 157 - 9, 268, 18, 10, 4);
        g.fill();
      }
    }
    if (h === "undercut") {
      const p = new Path2D();
      p.moveTo(-96, -70);
      p.bezierCurveTo(-110, -160, 30, -190, 112, -98);
      p.bezierCurveTo(118, -60, 92, -30, 58, -26);
      p.quadraticCurveTo(70, -58, 20, -64);
      p.quadraticCurveTo(-50, -70, -96, -70);
      p.closePath();
      hairFill(g, cfg, -180, -20);
      blob(g, p, g.fillStyle as CanvasGradient, line, 5);
      hairShine(g, 130, 10);
    }
    if (h === "mohawk") {
      const p = new Path2D();
      p.moveTo(-30, -70);
      for (let i = 0; i < 5; i++) {
        const x = -30 + i * 15;
        p.lineTo(x + 2, -150 - i * 12 - (i % 2) * 18);
        p.lineTo(x + 12, -120 - i * 8);
      }
      p.lineTo(46, -60);
      p.quadraticCurveTo(0, -80, -30, -70);
      p.closePath();
      hairFill(g, cfg, -220, -60);
      blob(g, p, g.fillStyle as CanvasGradient, line, 5);
    }
    if (h === "dreads") {
      for (const [x, y2] of [
        [-82, 40],
        [-50, 10],
        [44, 14],
        [84, 48],
        [-112, 130],
        [112, 130],
      ]) {
        g.lineCap = "round";
        g.strokeStyle = line;
        g.lineWidth = 21;
        g.beginPath();
        g.moveTo(x * 0.7, -70);
        g.quadraticCurveTo(x * 1.05, -20, x, y2);
        g.stroke();
        g.strokeStyle = fill;
        g.lineWidth = 15;
        g.stroke();
        g.strokeStyle = "rgba(0,0,0,.18)";
        g.lineWidth = 2;
        for (let k = 0; k < 4; k++) {
          const t = 0.3 + k * 0.17;
          const yy = -70 + (y2 + 70) * t;
          g.beginPath();
          g.moveTo(x - 7, yy);
          g.lineTo(x + 7, yy + 4);
          g.stroke();
        }
      }
      // tie
      g.fillStyle = cfg.accentColor;
    }
    if (!faded) hairShine(g);
    g.restore();
    return;
  }

  // ---- curly / afro hairline of curls
  if (h === "curly" || h === "afro") {
    const p = capPath(-40);
    const r = h === "afro" ? 26 : 22;
    for (let x = -108; x <= 108; x += r * 1.35) {
      const y = -46 + Math.pow(Math.abs(x) / 108, 2) * 50;
      p.moveTo(x + r, y);
      p.arc(x, y, r, 0, Math.PI * 2);
    }
    blob(g, p, fill, line, 5);
    hairShine(g, 140, 30);
    g.restore();
    return;
  }

  // ---- fringe styles: tips (x, y), notches between them sit high
  const tipsBy: Partial<Record<HairStyle, [number, number][]>> = {
    short: [[-108, 8], [-70, 4], [-30, 18], [12, 10], [52, 20], [92, 6], [112, 22]],
    spiky: [[-112, 30], [-78, 2], [-42, 34], [-6, 6], [32, 38], [70, 6], [108, 34]],
    messy: [[-114, 26], [-84, 12], [-55, 34], [-20, 4], [10, 30], [44, 14], [76, 36], [110, 18]],
    sidepart: [[-114, 30], [-96, 6], [-74, -24], [-40, -10], [8, 4], [52, 14], [90, 24], [114, 34]],
    long: [[-110, 40], [-72, 22], [-34, 30], [0, 18], [36, 30], [74, 22], [110, 40]],
    wavy: [[-110, 36], [-70, 18], [-28, 32], [12, 20], [52, 34], [90, 20], [112, 38]],
    hime: [[-112, 12], [-74, 12], [-37, 12], [0, 12], [37, 12], [74, 12], [112, 12]],
    bob: [[-112, 26], [-74, 24], [-37, 26], [0, 25], [37, 26], [74, 24], [112, 26]],
    twintails: [[-110, 34], [-72, 18], [-36, 30], [0, 14], [36, 30], [72, 18], [110, 34]],
    ponytail: [[-110, 30], [-66, 12], [-22, 26], [18, 6], [60, 22], [110, 10]],
  };
  const flat = h === "bob" || h === "hime";
  const tips = (tipsBy[h] ?? tipsBy.short!).map(([x, y]) => [x, Math.abs(x) < 84 && h !== "spiky" ? Math.min(y, 6 + Math.abs(x) * 0.08) : y] as [number, number]);
  g.beginPath();
  g.moveTo(-124, 34);
  g.bezierCurveTo(-130, -95, -70, -142, 0, -142);
  g.bezierCurveTo(70, -142, 130, -95, 124, 34);
  for (let i = tips.length - 1; i >= 0; i--) {
    const [x, y] = tips[i];
    const prevX = i < tips.length - 1 ? tips[i + 1][0] : 124;
    const notchX = (x + prevX) / 2;
    const notchY = flat ? y - 2 : h === "sidepart" ? Math.min(-30, y - 34) : -38 + Math.abs(notchX) * 0.12;
    if (i < tips.length - 1) g.quadraticCurveTo(notchX + 4, notchY + 10, notchX, notchY);
    g.quadraticCurveTo((x + notchX) / 2 + 4, (y + notchY) / 2, x, y);
  }
  g.quadraticCurveTo(-120, 10, -124, 34);
  g.closePath();
  g.fill();
  g.stroke();

  // side locks framing the face
  if (h !== "short" && h !== "spiky" && h !== "sidepart") {
    const len = h === "bob" ? 120 : h === "messy" ? 90 : h === "hime" ? 104 : 150;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * 124, 10);
      if (h === "hime") {
        // blunt cheek-length "princess" locks
        g.lineTo(s * 124, len);
        g.lineTo(s * 92, len);
        g.lineTo(s * 96, 18);
      } else {
        g.bezierCurveTo(s * 128, 60, s * 118, len - 30, s * 106, len);
        g.bezierCurveTo(s * 98, len - 40, s * 96, 70, s * 98, 20);
      }
      g.closePath();
      g.fill();
      g.stroke();
    }
  }
  hairShine(g);
  g.restore();
}

function facePath(g: G, cfg: VAvatar) {
  const masc = cfg.body === "masc";
  const chin = (cfg.face === "sharp" ? 134 : cfg.face === "round" ? 118 : 128) - (masc ? 2 : 0);
  const cheek = cfg.face === "round" ? 104 : 100;
  const j = masc ? 1.22 : 1; // squarer jaw
  g.beginPath();
  g.moveTo(-cheek, -10);
  g.ellipse(0, -10, cheek, 112, 0, Math.PI, 0);
  if (cfg.face === "round") g.bezierCurveTo(cheek, 70, 60 * j, chin, 0, chin);
  else if (cfg.face === "sharp") g.bezierCurveTo(cheek, 50, 45 * j, 112, 0, chin);
  else g.bezierCurveTo(cheek, 62, 55 * j, 118, 0, chin);
  if (cfg.face === "round") g.bezierCurveTo(-60 * j, chin, -cheek, 70, -cheek, -10);
  else if (cfg.face === "sharp") g.bezierCurveTo(-45 * j, 112, -cheek, 50, -cheek, -10);
  else g.bezierCurveTo(-55 * j, 118, -cheek, 62, -cheek, -10);
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
  g.lineWidth = cfg.body === "fem" ? 7.5 : 6;
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
  if (cfg.body === "fem") {
    // extra lashes
    g.lineWidth = 3;
    for (const k of [0, 1]) {
      const bx = side * (w / 2 - 4 - k * 9);
      const by = cy - hh * (0.62 + k * 0.18) - 4;
      g.beginPath();
      g.moveTo(bx, by);
      g.quadraticCurveTo(bx + side * 6, by - 8, bx + side * 12, by - 9);
      g.stroke();
    }
  }
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
    if (open > 0.3 || cfg.grillz !== "none") {
      if (cfg.grillz !== "none") {
        g.fillStyle = metalFill(g, cfg.grillz === "iced" ? "silver" : cfg.grillz, -6, 8);
        g.fillRect(-w, -6, w * 2, 8 + open * 3);
        g.fillStyle = cfg.grillz === "iced" ? "#f4fcff" : "rgba(255,255,255,.55)";
        for (let x = -w + 5; x < w - 2; x += 7) {
          g.beginPath();
          g.arc(x, -1 + open, cfg.grillz === "iced" ? 2.2 : 1.2, 0, Math.PI * 2);
          g.fill();
        }
        g.strokeStyle = "rgba(0,0,0,.25)";
        g.lineWidth = 1;
        for (let x = -w + 8; x < w; x += 8) {
          g.beginPath();
          g.moveTo(x, -6);
          g.lineTo(x, 2 + open * 3);
          g.stroke();
        }
      } else {
        g.fillStyle = "#fff";
        g.fillRect(-w, -6, w * 2, 6 + open * 3);
      }
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
    if (cfg.body === "fem") {
      // soft lip tint
      g.fillStyle = "rgba(235,90,120,.28)";
      g.beginPath();
      g.ellipse(0, curve * 0.55 + 3, w * 0.75, 4.5, 0, 0, Math.PI * 2);
      g.fill();
    }
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

// ------------------------------------------------------------------ jewellery
const METAL: Record<VAvatar["metal"], [string, string, string]> = {
  gold: ["#fff1a8", "#f5b301", "#9c6a06"],
  silver: ["#ffffff", "#c9d1dc", "#6f7988"],
  rose: ["#ffe3da", "#e8a090", "#9a5446"],
  iced: ["#ffffff", "#e3f4ff", "#8fb4d4"],
};
function metalFill(g: G, m: VAvatar["metal"], y0: number, y1: number) {
  const [hi, mid, lo] = METAL[m];
  const gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, hi);
  gr.addColorStop(0.5, mid);
  gr.addColorStop(1, lo);
  return gr;
}
/** 4-point twinkle */
function sparkle(g: G, x: number, y: number, r: number, t: number, phase: number) {
  const a = Math.max(0, Math.sin(t * 3.2 + phase));
  if (a < 0.15) return;
  g.save();
  g.globalAlpha = a;
  g.fillStyle = "#fff";
  g.beginPath();
  g.moveTo(x, y - r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.quadraticCurveTo(x, y, x, y + r);
  g.quadraticCurveTo(x, y, x - r, y);
  g.quadraticCurveTo(x, y, x, y - r);
  g.fill();
  g.restore();
}
/** brilliant-cut diamond seen from the front */
function gem(g: G, x: number, y: number, r: number, m: VAvatar["metal"]) {
  g.fillStyle = METAL[m][1];
  g.beginPath();
  g.arc(x, y, r + 1.6, 0, Math.PI * 2);
  g.fill();
  const rg = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  rg.addColorStop(0, "#ffffff");
  rg.addColorStop(0.55, "#dff3ff");
  rg.addColorStop(1, "#8ec6ee");
  g.fillStyle = rg;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  if (r > 4) {
    g.strokeStyle = "rgba(120,170,210,.6)";
    g.lineWidth = 0.8;
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    g.stroke();
  }
}

function earrings(g: G, cfg: VAvatar, yaw: number, t: number) {
  if (cfg.earrings === "none") return;
  const m = cfg.metal;
  for (const sd of [-1, 1] as const) {
    if (sd * yaw > 0.55) continue; // far ear hidden when turned
    const x = sd * (104 - yaw * 6 * sd);
    const y = 46;
    g.lineWidth = 2;
    g.strokeStyle = METAL[m][2];
    switch (cfg.earrings) {
      case "stud":
        if (m === "iced") gem(g, x, y, 6, "silver");
        else {
          g.fillStyle = metalFill(g, m, y - 6, y + 6);
          g.beginPath();
          g.arc(x, y, 6, 0, Math.PI * 2);
          g.fill();
          g.stroke();
        }
        sparkle(g, x + 3, y - 4, 7, t, sd);
        break;
      case "bigStud":
        gem(g, x, y + 2, 10, m === "iced" ? "silver" : m);
        sparkle(g, x + 4, y - 4, 12, t, sd * 2);
        break;
      case "hoop":
        g.strokeStyle = metalFill(g, m, y, y + 34);
        g.lineWidth = 5;
        g.beginPath();
        g.arc(x, y + 16, 15, 0, Math.PI * 2);
        g.stroke();
        if (m === "iced") for (let i = 0; i < 8; i++) gem(g, x + Math.cos(Math.PI * 0.15 + i * 0.35) * 15, y + 16 + Math.sin(Math.PI * 0.15 + i * 0.35) * 15, 2.6, "silver");
        break;
      case "cross":
        gem(g, x, y, 4, m === "iced" ? "silver" : m);
        g.fillStyle = m === "iced" ? "#eaf7ff" : metalFill(g, m, y + 6, y + 34);
        g.beginPath();
        g.rect(x - 3, y + 6, 6, 28);
        g.rect(x - 9, y + 13, 18, 6);
        g.fill();
        g.stroke();
        if (m === "iced") for (const yy of [10, 16, 22, 28]) gem(g, x, y + yy, 2.2, "silver");
        sparkle(g, x, y + 16, 9, t, sd * 3);
        break;
      case "dangle":
        g.strokeStyle = METAL[m][1];
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + 22);
        g.stroke();
        gem(g, x, y, 3.4, m === "iced" ? "silver" : m);
        g.fillStyle = "#cfefff";
        g.beginPath();
        g.moveTo(x, y + 20);
        g.quadraticCurveTo(x + 10, y + 34, x, y + 42);
        g.quadraticCurveTo(x - 10, y + 34, x, y + 20);
        g.fill();
        g.strokeStyle = "#7fb2d8";
        g.stroke();
        sparkle(g, x + 2, y + 32, 9, t, sd * 4);
        break;
      case "pearl": {
        const rg = g.createRadialGradient(x - 3, y - 2, 1, x, y + 2, 9);
        rg.addColorStop(0, "#ffffff");
        rg.addColorStop(1, "#e6dccc");
        g.fillStyle = rg;
        g.beginPath();
        g.arc(x, y + 3, 8, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "#cbbfa8";
        g.lineWidth = 1;
        g.stroke();
        break;
      }
    }
  }
}

/** points along the chain curve (neck base → chest → neck base) */
function chainPoints(depth: number, spread: number, step: number) {
  const pts: { x: number; y: number; a: number }[] = [];
  const P0 = [-spread, 186],
    C = [0, 186 + depth * 2 - 14],
    P2 = [spread, 186];
  let last: number[] | null = null;
  for (let i = 0; i <= 400; i++) {
    const t = i / 400;
    const x = (1 - t) ** 2 * P0[0] + 2 * (1 - t) * t * C[0] + t * t * P2[0];
    const y = (1 - t) ** 2 * P0[1] + 2 * (1 - t) * t * C[1] + t * t * P2[1];
    if (!last || Math.hypot(x - last[0], y - last[1]) >= step) {
      const tx = 2 * (1 - t) * (C[0] - P0[0]) + 2 * t * (P2[0] - C[0]);
      const ty = 2 * (1 - t) * (C[1] - P0[1]) + 2 * t * (P2[1] - C[1]);
      pts.push({ x, y, a: Math.atan2(ty, tx) });
      last = [x, y];
    }
  }
  return pts;
}

function oneChain(g: G, kind: VAvatar["chain"], m: VAvatar["metal"], depth: number, spread: number, t: number) {
  const iced = m === "iced" || kind === "cubanIced";
  const metal: VAvatar["metal"] = kind === "cubanIced" && m === "iced" ? "silver" : kind === "cubanIced" ? m : m;
  const lo = METAL[metal][2];
  if (kind === "pearls") {
    for (const p of chainPoints(depth, spread, 11)) {
      const rg = g.createRadialGradient(p.x - 2, p.y - 2, 0.5, p.x, p.y, 6);
      rg.addColorStop(0, "#fff");
      rg.addColorStop(1, "#e3d8c6");
      g.fillStyle = rg;
      g.beginPath();
      g.arc(p.x, p.y, 5.6, 0, Math.PI * 2);
      g.fill();
    }
    return;
  }
  if (kind === "tennis") {
    chainPoints(depth, spread, 8).forEach((p, i) => {
      gem(g, p.x, p.y, 3.4, metal === "iced" ? "silver" : metal);
      if (i % 6 === 0) sparkle(g, p.x, p.y, 7, t, i);
    });
    return;
  }
  const big = kind === "cuban" || kind === "cubanIced";
  const step = big ? 9 : kind === "rope" ? 5 : 8;
  chainPoints(depth, spread, step).forEach((p, i) => {
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.a);
    g.fillStyle = metalFill(g, metal === "iced" ? "silver" : metal, -6, 6);
    g.strokeStyle = lo;
    g.lineWidth = 1.2;
    if (big) {
      // fat interlocking curb links
      g.beginPath();
      g.ellipse(0, 0, 7.5, 6.2, i % 2 ? 0.45 : -0.45, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = "rgba(0,0,0,.28)";
      g.beginPath();
      g.ellipse(0, 0, 3.2, 2, i % 2 ? 0.45 : -0.45, 0, Math.PI * 2);
      g.fill();
      if (iced) {
        g.fillStyle = "#f2fbff";
        for (const [dx2, dy2] of [
          [-3.5, -2],
          [3.5, 2],
          [0, -3.8],
        ]) {
          g.beginPath();
          g.arc(dx2, dy2, 1.5, 0, Math.PI * 2);
          g.fill();
        }
      }
    } else if (kind === "rope") {
      g.beginPath();
      g.ellipse(0, 0, 4.5, 2.6, 0.9, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    } else {
      // figaro: 3 short + 1 long
      const long = i % 4 === 3;
      g.beginPath();
      g.ellipse(0, 0, long ? 7 : 3.8, 2.8, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    g.restore();
    if (iced && i % 5 === 0) sparkle(g, p.x, p.y - 2, 8, t, i * 1.7);
  });
}

function pendant(g: G, cfg: VAvatar, x: number, y: number, t: number) {
  const m = cfg.metal;
  const iced = m === "iced";
  g.save();
  g.translate(x, y);
  g.lineWidth = 2;
  g.strokeStyle = METAL[m][2];
  g.fillStyle = iced ? "#eef9ff" : metalFill(g, m, 0, 40);
  switch (cfg.pendant) {
    case "cross":
      g.beginPath();
      g.rect(-5, 4, 10, 40);
      g.rect(-15, 14, 30, 9);
      g.fill();
      g.stroke();
      if (iced) for (const [a, b] of [[0, 8], [0, 16], [0, 26], [0, 35], [-10, 18.5], [10, 18.5]]) gem(g, a, b, 2.6, "silver");
      break;
    case "diamond":
      gem(g, 0, 18, 14, iced ? "silver" : m);
      break;
    case "heart":
      g.beginPath();
      g.moveTo(0, 36);
      g.bezierCurveTo(-26, 18, -16, -2, 0, 12);
      g.bezierCurveTo(16, -2, 26, 18, 0, 36);
      g.fill();
      g.stroke();
      if (iced) for (const [a, b] of [[-9, 12], [9, 12], [0, 20], [-5, 26], [5, 26]]) gem(g, a, b, 2.4, "silver");
      break;
    case "brokenHeart":
    case "butterfly":
      graphicArt(g, cfg.pendant, 0, 20, 34, METAL[m][1], iced ? "#e9f8ff" : METAL[m][1]);
      if (iced) for (const [a, b] of [[-8, 14], [8, 14], [0, 24]]) gem(g, a, b, 2.2, "silver");
      break;
    case "lock":
      g.lineWidth = 5;
      g.strokeStyle = iced ? "#cfe9ff" : METAL[m][1];
      g.beginPath();
      g.arc(0, 16, 10, Math.PI, 0);
      g.stroke();
      g.lineWidth = 2;
      g.strokeStyle = METAL[m][2];
      g.beginPath();
      g.roundRect(-16, 16, 32, 26, 5);
      g.fill();
      g.stroke();
      g.fillStyle = METAL[m][2];
      g.beginPath();
      g.arc(0, 26, 3.5, 0, Math.PI * 2);
      g.fill();
      g.fillRect(-1.5, 27, 3, 8);
      if (iced) for (const [a, b] of [[-9, 21], [9, 21], [-9, 36], [9, 36]]) gem(g, a, b, 2.2, "silver");
      break;
    case "star":
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 8 : 19;
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        g.lineTo(Math.cos(a) * r, 20 + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      g.stroke();
      break;
    case "letter": {
      const L = (cfg.shirtText.trim()[0] ?? "N").toUpperCase();
      g.font = "900 38px 'Arial Black', Impact, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.lineJoin = "round";
      g.lineWidth = 7;
      g.strokeStyle = METAL[m][2];
      g.strokeText(L, 0, 22);
      g.fillStyle = iced ? "#f2fbff" : metalFill(g, m, 4, 40);
      g.fillText(L, 0, 22);
      if (iced) {
        g.fillStyle = "rgba(140,190,230,.7)";
        for (let i = 0; i < 9; i++) {
          g.beginPath();
          g.arc(-10 + (i % 3) * 10, 10 + Math.floor(i / 3) * 11, 1.4, 0, Math.PI * 2);
          g.fill();
        }
      }
      break;
    }
  }
  // bail
  g.fillStyle = METAL[m === "iced" ? "silver" : m][1];
  g.beginPath();
  g.arc(0, 2, 3.5, 0, Math.PI * 2);
  g.fill();
  if (cfg.pendant !== "none") sparkle(g, 6, 14, 11, t, 0.7);
  g.restore();
}

function jewellery(g: G, cfg: VAvatar, t: number) {
  if (cfg.chain === "none" && cfg.pendant === "none") return;
  const kind = cfg.chain === "none" ? "rope" : cfg.chain;
  const depth = 30;
  if (kind === "layered") {
    oneChain(g, "cuban", cfg.metal, 24, 46, t);
    oneChain(g, "tennis", cfg.metal, 40, 52, t);
  } else oneChain(g, kind, cfg.metal, depth, 46, t);
  if (cfg.pendant !== "none") pendant(g, cfg, 0, 186 + (kind === "layered" ? 40 : depth) - 4, t);
}

// ------------------------------------------------------------------ shirt print ("qyopy", "kicsiden", …)
const TEXT_FONT: Record<VAvatar["textStyle"], (px: number) => string> = {
  bold: (px) => `900 ${px}px 'Arial Black', 'Helvetica Neue', Impact, sans-serif`,
  script: (px) => `italic 700 ${px * 1.15}px 'Brush Script MT', 'Segoe Script', 'Snell Roundhand', cursive`,
  gothic: (px) => `700 ${px * 1.1}px 'Old English Text MT', 'UnifrakturMaguntia', 'Blackletter', 'Times New Roman', serif`,
  graffiti: (px) => `italic 900 ${px}px Impact, 'Arial Black', sans-serif`,
  mono: (px) => `700 ${px}px 'Courier New', ui-monospace, monospace`,
};

function shirtPrint(g: G, cfg: VAvatar, cx: number, cy: number, maxW: number, size: number) {
  const text = cfg.shirtText.trim();
  if (!text) return;
  g.save();
  g.textAlign = "center";
  g.textBaseline = "middle";
  let px = size;
  g.font = TEXT_FONT[cfg.textStyle](px);
  const w = g.measureText(text).width;
  if (w > maxW) {
    px = Math.max(10, (px * maxW) / w);
    g.font = TEXT_FONT[cfg.textStyle](px);
  }
  const col = cfg.textColor;
  if (cfg.textStyle === "graffiti") {
    g.lineJoin = "round";
    g.lineWidth = px * 0.28;
    g.strokeStyle = shade(col, -0.7);
    g.strokeText(text, cx + 2, cy + 3);
    g.lineWidth = px * 0.16;
    g.strokeStyle = cfg.accentColor;
    g.strokeText(text, cx, cy);
  } else {
    // puff-print: soft shadow + thin outline
    g.fillStyle = "rgba(0,0,0,.28)";
    g.fillText(text, cx + 1.5, cy + 2.5);
    g.lineWidth = Math.max(1.5, px * 0.06);
    g.strokeStyle = shade(col, -0.55);
    g.strokeText(text, cx, cy);
  }
  g.fillStyle = col;
  g.fillText(text, cx, cy);
  g.restore();
}

const BIG_PRINT = new Set<Outfit>(["tee", "acidtee", "hoodie", "sweater", "tank", "jersey"]);
const SMALL_PRINT: Partial<Record<Outfit, [number, number, number]>> = {
  zipup: [74, 232, 64],
  polo: [74, 236, 62],
  puffer: [80, 244, 60],
  jacket: [96, 236, 46],
  denim: [96, 250, 44],
  bomber: [74, 236, 62],
  track: [74, 236, 62],
};

function outfit(g: G, cfg: VAvatar) {
  const c = cfg.shirtColor;
  const a = cfg.accentColor;
  const line = shade(c, -0.5);
  const bx = cfg.body === "masc" ? 1.1 : 0.9; // shoulder width
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
  const shirtGrad = () => {
    const gr = g.createLinearGradient(0, 170, 0, 460);
    gr.addColorStop(0, shade(c, 0.12));
    gr.addColorStop(1, shade(c, -0.2));
    return gr;
  };
  g.lineWidth = 3;
  g.lineJoin = "round";
  g.save();
  g.scale(bx, 1);
  // hood sits behind the neck
  if (cfg.shirt === "hoodie" || cfg.shirt === "zipup") {
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
  if (cfg.body === "masc") {
    g.strokeStyle = alpha(shade(cfg.skin, -0.5), 0.45);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-5, 158);
    g.quadraticCurveTo(0, 164, 5, 158);
    g.stroke();
  }

  if (cfg.shirt === "tank") {
    // bare shoulders + arms
    const sk = g.createLinearGradient(0, 170, 0, 460);
    sk.addColorStop(0, shade(cfg.skin, -0.02));
    sk.addColorStop(1, shade(cfg.skin, -0.14));
    g.fillStyle = sk;
    g.strokeStyle = shade(cfg.skin, -0.45);
    torso();
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(-58, 184);
    g.quadraticCurveTo(-84, 236, -128, 256);
    g.lineTo(-140, 460);
    g.lineTo(140, 460);
    g.lineTo(128, 256);
    g.quadraticCurveTo(84, 236, 58, 184);
    g.quadraticCurveTo(0, 246, -58, 184);
    g.closePath();
    g.fillStyle = shirtGrad();
    g.strokeStyle = line;
    g.fill();
    g.stroke();
  } else {
    g.fillStyle = shirtGrad();
    g.strokeStyle = line;
    torso();
    g.fill();
    g.stroke();
    // fabric patterns (clipped to the torso)
    if (["acidtee", "flannel", "denim", "bomber", "track"].includes(cfg.shirt)) {
      g.save();
      torso();
      g.clip();
      if (cfg.shirt === "acidtee") {
        let sd = 11;
        const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
        for (let i = 0; i < 26; i++) {
          const x = -220 + rnd() * 440,
            y = 180 + rnd() * 280,
            rr = 18 + rnd() * 40;
          const rg = g.createRadialGradient(x, y, 0, x, y, rr);
          rg.addColorStop(0, alpha(shade(c, 0.6), 0.55));
          rg.addColorStop(1, alpha(shade(c, 0.6), 0));
          g.fillStyle = rg;
          g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
        }
      } else if (cfg.shirt === "flannel") {
        g.fillStyle = alpha(a, 0.4);
        for (let x = -240; x < 240; x += 52) g.fillRect(x, 160, 20, 320);
        for (let y = 170; y < 470; y += 52) g.fillRect(-250, y, 500, 20);
        g.fillStyle = "rgba(0,0,0,.22)";
        for (let x = -230; x < 240; x += 52) g.fillRect(x + 30, 160, 4, 320);
        for (let y = 180; y < 470; y += 52) g.fillRect(-250, y + 30, 500, 4);
      } else if (cfg.shirt === "denim") {
        g.strokeStyle = "rgba(255,255,255,.08)";
        g.lineWidth = 1.5;
        for (let x = -300; x < 300; x += 6) {
          g.beginPath();
          g.moveTo(x, 160);
          g.lineTo(x + 120, 470);
          g.stroke();
        }
        // faded/washed areas
        for (const [x, y] of [
          [-120, 300],
          [130, 320],
        ]) {
          const rg = g.createRadialGradient(x, y, 0, x, y, 90);
          rg.addColorStop(0, "rgba(255,255,255,.18)");
          rg.addColorStop(1, "rgba(255,255,255,0)");
          g.fillStyle = rg;
          g.fillRect(x - 90, y - 90, 180, 180);
        }
      } else if (cfg.shirt === "bomber") {
        g.fillStyle = "rgba(255,255,255,.07)";
        g.beginPath();
        g.ellipse(-110, 270, 40, 90, 0.2, 0, Math.PI * 2);
        g.ellipse(120, 280, 30, 80, -0.2, 0, Math.PI * 2);
        g.fill();
      } else if (cfg.shirt === "track") {
        for (const s2 of [-1, 1])
          for (const k of [0, 1, 2]) {
            g.strokeStyle = k === 1 ? a : "#ffffff";
            g.lineWidth = 6;
            g.beginPath();
            g.moveTo(s2 * (150 + k * 10), 205);
            g.lineTo(s2 * (205 + k * 12), 470);
            g.stroke();
          }
      }
      g.restore();
    }
    if (cfg.shirt === "varsity") {
      // contrast sleeves
      g.fillStyle = shade(a, 0.05);
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(s * 128, 196);
        g.bezierCurveTo(s * 180, 206, s * 205, 230, s * 215, 270);
        g.lineTo(s * 245, 460);
        g.lineTo(s * 150, 460);
        g.quadraticCurveTo(s * 150, 300, s * 128, 196);
        g.closePath();
        g.fill();
        g.stroke();
      }
    }
    // shoulder shading
    g.fillStyle = "rgba(0,0,0,.12)";
    g.beginPath();
    g.ellipse(0, 225, 150, 26, 0, 0, Math.PI);
    g.fill();
  }
  g.restore();

  // big chest print sits under strings/zips
  if (BIG_PRINT.has(cfg.shirt)) {
    const txt = cfg.shirtText.trim() || (cfg.shirt === "jersey" ? "23" : "");
    if (txt) shirtPrint(g, { ...cfg, shirtText: txt }, 0, cfg.shirt === "jersey" ? 284 : 280, 176 * bx, cfg.shirt === "jersey" ? 50 : 42);
    if (cfg.graphic !== "none") {
      if (txt) graphicArt(g, cfg.graphic, 78 * bx, 236, 30, cfg.textColor, cfg.accentColor);
      else if (cfg.pendant !== "none" || cfg.chain === "layered") graphicArt(g, cfg.graphic, 0, 286, 50, cfg.textColor, cfg.accentColor);
      else graphicArt(g, cfg.graphic, 0, 266, 62, cfg.textColor, cfg.accentColor);
    }
  }

  g.save();
  g.scale(bx, 1);
  g.lineWidth = 3;
  switch (cfg.shirt) {
    case "flannel":
    case "denim": {
      // open shirt/jacket over a tee
      const inner = cfg.shirt === "flannel" ? a : shade(a, 0);
      g.fillStyle = cfg.shirt === "flannel" ? "#f4f4f8" : inner;
      g.strokeStyle = shade(inner, -0.4);
      g.beginPath();
      g.moveTo(-46, 184);
      g.lineTo(-30, 460);
      g.lineTo(30, 460);
      g.lineTo(46, 184);
      g.quadraticCurveTo(0, 214, -46, 184);
      g.fill();
      g.stroke();
      g.strokeStyle = cfg.shirt === "flannel" ? "#d8d8e0" : shade(inner, -0.25);
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(-40, 186);
      g.quadraticCurveTo(0, 214, 40, 186);
      g.stroke();
      // collar points
      g.fillStyle = shade(c, -0.08);
      g.strokeStyle = line;
      g.lineWidth = 3;
      for (const s2 of [-1, 1]) {
        g.beginPath();
        g.moveTo(s2 * 30, 176);
        g.lineTo(s2 * 70, 182);
        g.lineTo(s2 * 62, 236);
        g.closePath();
        g.fill();
        g.stroke();
        // panel edge
        g.beginPath();
        g.moveTo(s2 * 46, 190);
        g.lineTo(s2 * 34, 460);
        g.stroke();
      }
      if (cfg.shirt === "denim") {
        // chest pockets + copper stitching + rips
        g.strokeStyle = "#e8a04a";
        g.lineWidth = 2;
        g.setLineDash([4, 3]);
        for (const s2 of [-1, 1]) {
          g.strokeRect(s2 > 0 ? 70 : -130, 238, 60, 44);
          g.beginPath();
          g.moveTo(s2 * 60, 200);
          g.quadraticCurveTo(s2 * 140, 196, s2 * 200, 236);
          g.stroke();
        }
        g.setLineDash([]);
        g.fillStyle = "#c9d1dc";
        for (const x of [-100, 100]) {
          g.beginPath();
          g.arc(x, 256, 4, 0, Math.PI * 2);
          g.fill();
        }
        for (const [x, y, w] of [
          [-150, 300, 34],
          [140, 282, 26],
        ]) {
          g.fillStyle = "rgba(245,245,250,.85)";
          g.beginPath();
          g.ellipse(x, y, w, 9, 0.1, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = "rgba(255,255,255,.95)";
          g.lineWidth = 1.5;
          for (let k = -2; k <= 2; k++) {
            g.beginPath();
            g.moveTo(x - w, y + k * 3.5);
            g.lineTo(x + w, y + k * 3.5 + 1);
            g.stroke();
          }
        }
      } else {
        g.fillStyle = "#f4f4f8";
        for (const y of [252, 292]) {
          g.beginPath();
          g.arc(-40, y, 3.4, 0, Math.PI * 2);
          g.fill();
        }
      }
      break;
    }
    case "bomber":
    case "track": {
      const bomber = cfg.shirt === "bomber";
      if (bomber) {
        for (const [col2, w] of [
          [a, 16],
          ["#ffffff", 4],
        ] as const) {
          g.strokeStyle = col2;
          g.lineWidth = w;
          g.beginPath();
          g.moveTo(-50, 184);
          g.quadraticCurveTo(0, 222, 50, 184);
          g.stroke();
        }
      } else {
        g.fillStyle = shade(c, 0.05);
        g.strokeStyle = line;
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(-44, 156);
        g.lineTo(-48, 206);
        g.quadraticCurveTo(0, 220, 48, 206);
        g.lineTo(44, 156);
        g.quadraticCurveTo(0, 168, -44, 156);
        g.fill();
        g.stroke();
      }
      g.strokeStyle = "#c9d1dc";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(0, bomber ? 206 : 166);
      g.lineTo(0, 460);
      g.stroke();
      g.fillStyle = "#dfe5ec";
      g.beginPath();
      g.roundRect(-5, bomber ? 214 : 176, 10, 18, 3);
      g.fill();
      if (bomber) {
        // sleeve utility pocket
        g.fillStyle = shade(c, -0.1);
        g.strokeStyle = line;
        g.lineWidth = 2;
        g.beginPath();
        g.roundRect(-196, 262, 34, 40, 4);
        g.fill();
        g.stroke();
      }
      break;
    }
    case "acidtee":
    case "tee":
      g.strokeStyle = a;
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(-50, 184);
      g.quadraticCurveTo(0, 228, 50, 184);
      g.stroke();
      break;
    case "tank":
      g.strokeStyle = a;
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(-58, 186);
      g.quadraticCurveTo(0, 244, 58, 186);
      g.stroke();
      break;
    case "jersey":
      g.lineCap = "round";
      g.strokeStyle = a;
      g.lineWidth = 10;
      g.beginPath();
      g.moveTo(-48, 182);
      g.lineTo(0, 236);
      g.lineTo(48, 182);
      g.stroke();
      g.strokeStyle = "#fff";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-40, 190);
      g.lineTo(0, 234);
      g.lineTo(40, 190);
      g.stroke();
      g.strokeStyle = a;
      g.lineWidth = 9;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(s * 120, 196);
        g.quadraticCurveTo(s * 150, 260, s * 180, 300);
        g.stroke();
      }
      break;
    case "hoodie":
    case "zipup": {
      const zip = cfg.shirt === "zipup";
      g.strokeStyle = shade(c, -0.4);
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(-46, 186);
      g.quadraticCurveTo(0, 232, 46, 186);
      g.stroke();
      if (zip) {
        g.strokeStyle = shade(c, -0.45);
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(0, 212);
        g.lineTo(0, 460);
        g.stroke();
        g.strokeStyle = "#c9d1dc";
        g.lineWidth = 2;
        g.setLineDash([3, 3]);
        g.beginPath();
        g.moveTo(0, 214);
        g.lineTo(0, 460);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = "#dfe5ec";
        g.beginPath();
        g.roundRect(-5, 236, 10, 20, 3);
        g.fill();
      }
      g.strokeStyle = a;
      g.lineWidth = 5;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(s * 22, 206);
        const end = zip || cfg.shirtText.trim() ? 248 : 300; // shorter strings when there's a print
        g.quadraticCurveTo(s * 26, 230, s * 20, end);
        g.stroke();
        g.fillStyle = a;
        g.beginPath();
        g.arc(s * 20, end + 3, 5, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case "polo":
      g.fillStyle = shade(c, 0.08);
      g.strokeStyle = line;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(s * 4, 200);
        g.lineTo(s * 50, 180);
        g.lineTo(s * 60, 212);
        g.lineTo(s * 14, 226);
        g.closePath();
        g.fill();
        g.stroke();
      }
      g.strokeStyle = a;
      g.lineWidth = 3;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(s * 50, 182);
        g.lineTo(s * 58, 210);
        g.stroke();
      }
      g.strokeStyle = line;
      g.lineWidth = 2;
      g.strokeRect(-8, 218, 16, 60);
      g.fillStyle = "#f4f4f8";
      for (const y of [232, 252, 270]) {
        g.beginPath();
        g.arc(0, y, 3.2, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case "puffer": {
      g.strokeStyle = shade(c, -0.35);
      g.lineWidth = 3;
      for (const y of [236, 272, 308, 344]) {
        g.beginPath();
        g.moveTo(-220, y + 10);
        g.quadraticCurveTo(0, y - 12, 220, y + 10);
        g.stroke();
      }
      g.strokeStyle = "rgba(255,255,255,.22)";
      g.lineWidth = 6;
      for (const y of [222, 258, 294]) {
        g.beginPath();
        g.moveTo(-120, y + 4);
        g.quadraticCurveTo(-40, y - 6, 20, y - 4);
        g.stroke();
      }
      // puffy high collar
      g.fillStyle = shade(c, 0.06);
      g.strokeStyle = line;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-56, 148);
      g.quadraticCurveTo(-66, 200, -50, 214);
      g.quadraticCurveTo(0, 230, 50, 214);
      g.quadraticCurveTo(66, 200, 56, 148);
      g.quadraticCurveTo(0, 166, -56, 148);
      g.fill();
      g.stroke();
      g.strokeStyle = "#c9d1dc";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(0, 162);
      g.lineTo(0, 460);
      g.stroke();
      break;
    }
    case "varsity": {
      // striped rib collar
      for (const [col, w] of [
        [a, 14],
        ["#ffffff", 6],
      ] as const) {
        g.strokeStyle = col;
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(-50, 184);
        g.lineTo(0, 236);
        g.lineTo(50, 184);
        g.stroke();
      }
      g.fillStyle = "#f4f4f8";
      for (const y of [252, 282, 312]) {
        g.beginPath();
        g.arc(0, y, 4, 0, Math.PI * 2);
        g.fill();
      }
      // chenille letter patch
      const L = (cfg.shirtText.trim()[0] ?? "N").toUpperCase();
      g.font = "900 46px Georgia, 'Times New Roman', serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.lineJoin = "round";
      g.lineWidth = 10;
      g.strokeStyle = "#fff";
      g.strokeText(L, 76, 262);
      g.lineWidth = 4;
      g.strokeStyle = shade(a, -0.4);
      g.strokeText(L, 76, 262);
      g.fillStyle = a;
      g.fillText(L, 76, 262);
      break;
    }
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
  g.restore();

  const small = SMALL_PRINT[cfg.shirt];
  if (small) shirtPrint(g, cfg, small[0] * bx, small[1], small[2] * bx, 22);
  if ((small || cfg.shirt === "flannel") && cfg.graphic !== "none") graphicArt(g, cfg.graphic, -78 * bx, 240, 30, cfg.textColor, cfg.accentColor);
}


// ------------------------------------------------------------------ eyewear
function eyewear(g: G, cfg: VAvatar, dx: number) {
  const col = cfg.eyewearColor;
  const dark = shade(col, -0.45);
  g.lineJoin = "round";
  switch (cfg.eyewear) {
    case "shades": {
      g.save();
      g.translate(dx, 0);
      g.fillStyle = "#121218";
      g.strokeStyle = shade(col, -0.2);
      g.lineWidth = 4;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(s * 8, 2);
        g.lineTo(s * 78, -2);
        g.quadraticCurveTo(s * 80, 40, s * 50, 46);
        g.quadraticCurveTo(s * 14, 44, s * 8, 2);
        g.closePath();
        g.fill();
        g.stroke();
        const sh = g.createLinearGradient(s * 10, 0, s * 70, 40);
        sh.addColorStop(0, "rgba(255,255,255,0)");
        sh.addColorStop(0.5, alpha(col === "#111318" ? "#8b5cff" : col, 0.55));
        sh.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = sh;
        g.fill();
        g.fillStyle = "#121218";
      }
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(-10, 6);
      g.lineTo(10, 6);
      g.stroke();
      g.restore();
      break;
    }
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
    case "round":
    case "rimless":
    case "heart": {
      g.save();
      g.translate(dx, 0);
      const tint = cfg.eyewear === "heart" ? "rgba(255,60,140,.55)" : cfg.eyewear === "round" ? alpha(col === "#111318" ? "#3a2a1a" : col, 0.6) : "rgba(160,200,255,.18)";
      g.strokeStyle = cfg.eyewear === "rimless" ? alpha(shade(col, 0.4), 0.9) : col === "#111318" ? "#c8a24a" : col;
      g.lineWidth = cfg.eyewear === "rimless" ? 2 : 3.5;
      for (const s of [-1, 1]) {
        g.fillStyle = tint;
        g.beginPath();
        if (cfg.eyewear === "round") g.arc(s * 44, 22, 26, 0, Math.PI * 2);
        else if (cfg.eyewear === "rimless") g.roundRect(s * 44 - 34, 2, 68, 42, 8);
        else {
          const x = s * 44,
            y = 14;
          g.moveTo(x, y + 36);
          g.bezierCurveTo(x - 40, y + 14, x - 24, y - 16, x, y + 2);
          g.bezierCurveTo(x + 24, y - 16, x + 40, y + 14, x, y + 36);
        }
        g.fill();
        g.stroke();
        g.fillStyle = "rgba(255,255,255,.35)";
        g.beginPath();
        g.ellipse(s * 44 - 10, 12, 6, 3, -0.5, 0, Math.PI * 2);
        g.fill();
      }
      g.beginPath();
      g.moveTo(-18, 18);
      g.quadraticCurveTo(0, 10, 18, 18);
      g.stroke();
      g.restore();
      break;
    }
    case "visor": {
      g.save();
      g.translate(dx, 0);
      const vg = g.createLinearGradient(-110, 0, 110, 0);
      const c2 = col === "#111318" ? "#00e0ff" : col;
      vg.addColorStop(0, alpha(c2, 0.85));
      vg.addColorStop(0.5, alpha(shade(c2, 0.5), 0.9));
      vg.addColorStop(1, alpha(c2, 0.85));
      g.shadowColor = c2;
      g.shadowBlur = 18;
      g.fillStyle = vg;
      g.beginPath();
      g.moveTo(-112, 4);
      g.quadraticCurveTo(0, -12, 112, 4);
      g.lineTo(104, 40);
      g.quadraticCurveTo(0, 30, -104, 40);
      g.closePath();
      g.fill();
      g.shadowBlur = 0;
      g.strokeStyle = "rgba(255,255,255,.6)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(-90, 12);
      g.quadraticCurveTo(0, 0, 90, 12);
      g.stroke();
      g.restore();
      break;
    }
  }
}

// ------------------------------------------------------------------ hats
function hatBack(g: G, cfg: VAvatar) {
  const col = cfg.hatColor;
  if (cfg.hat === "durag") {
    // silky tails hanging behind
    g.fillStyle = shade(col, -0.1);
    g.strokeStyle = shade(col, -0.5);
    g.lineWidth = 3;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * 70, -40);
      g.bezierCurveTo(s * 120, 60, s * 110, 180, s * 130, 260);
      g.lineTo(s * 96, 262);
      g.bezierCurveTo(s * 84, 170, s * 92, 70, s * 50, -30);
      g.closePath();
      g.fill();
      g.stroke();
    }
  }
}

function hat(g: G, cfg: VAvatar, dx: number) {
  const col = cfg.hatColor;
  const dark = shade(col, -0.45);
  g.lineJoin = "round";
  switch (cfg.hat) {
    case "cap": {
      const cg = g.createLinearGradient(0, -170, 0, -60);
      cg.addColorStop(0, shade(col, 0.15));
      cg.addColorStop(1, shade(col, -0.15));
      g.fillStyle = cg;
      g.strokeStyle = dark;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-124, -50);
      g.bezierCurveTo(-130, -150, -70, -172, 0, -172);
      g.bezierCurveTo(70, -172, 130, -150, 124, -50);
      g.quadraticCurveTo(0, -78, -124, -50);
      g.fill();
      g.stroke();
      g.strokeStyle = alpha(dark, 0.5);
      g.beginPath();
      g.moveTo(0, -172);
      g.lineTo(0, -72);
      g.stroke();
      g.fillStyle = dark;
      g.beginPath();
      g.arc(0, -170, 7, 0, Math.PI * 2);
      g.fill();
      // brim
      g.save();
      g.translate(dx * 0.6, 0);
      g.fillStyle = shade(col, -0.25);
      g.beginPath();
      g.ellipse(0, -56, 132, 26, 0, Math.PI, 0, true);
      g.quadraticCurveTo(0, -88, -132, -56);
      g.fill();
      g.stroke();
      g.restore();
      break;
    }
    case "beanie": {
      const bg = g.createLinearGradient(0, -190, 0, -40);
      bg.addColorStop(0, shade(col, 0.1));
      bg.addColorStop(1, shade(col, -0.1));
      g.fillStyle = bg;
      g.strokeStyle = dark;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-122, -48);
      g.bezierCurveTo(-134, -180, 134, -180, 122, -48);
      g.closePath();
      g.fill();
      g.stroke();
      g.strokeStyle = alpha(dark, 0.35);
      g.lineWidth = 2;
      for (let x = -100; x <= 100; x += 14) {
        g.beginPath();
        g.moveTo(x, -82);
        g.quadraticCurveTo(x * 0.8, -130, x * 0.55, -160);
        g.stroke();
      }
      // folded cuff
      g.fillStyle = shade(col, -0.12);
      g.strokeStyle = dark;
      g.lineWidth = 3;
      g.beginPath();
      g.roundRect(-128, -88, 256, 46, 18);
      g.fill();
      g.stroke();
      g.strokeStyle = alpha(dark, 0.4);
      g.lineWidth = 2;
      for (let x = -116; x <= 116; x += 10) {
        g.beginPath();
        g.moveTo(x, -84);
        g.lineTo(x, -46);
        g.stroke();
      }
      // pom-pom
      g.fillStyle = cfg.accentColor;
      g.beginPath();
      g.arc(0, -176, 20, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case "backcap": {
      const cg = g.createLinearGradient(0, -170, 0, -60);
      cg.addColorStop(0, shade(col, 0.15));
      cg.addColorStop(1, shade(col, -0.15));
      g.fillStyle = cg;
      g.strokeStyle = dark;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-124, -54);
      g.bezierCurveTo(-130, -150, -70, -170, 0, -170);
      g.bezierCurveTo(70, -170, 130, -150, 124, -54);
      g.quadraticCurveTo(0, -84, -124, -54);
      g.fill();
      g.stroke();
      // strap opening + snap on the front (it's on backwards)
      g.fillStyle = shade(col, -0.3);
      g.beginPath();
      g.ellipse(0, -76, 34, 16, 0, Math.PI, 0);
      g.fill();
      g.fillStyle = "#c9d1dc";
      g.beginPath();
      g.arc(0, -92, 4, 0, Math.PI * 2);
      g.fill();
      // brim peeking out at the back-top
      g.fillStyle = shade(col, -0.25);
      g.strokeStyle = dark;
      g.beginPath();
      g.ellipse(dx * -0.3, -168, 70, 14, 0, Math.PI, 0);
      g.closePath();
      g.fill();
      g.stroke();
      break;
    }
    case "bucket": {
      const bgd = g.createLinearGradient(0, -175, 0, -40);
      bgd.addColorStop(0, shade(col, 0.12));
      bgd.addColorStop(1, shade(col, -0.12));
      g.fillStyle = bgd;
      g.strokeStyle = dark;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-112, -60);
      g.bezierCurveTo(-118, -170, 118, -170, 112, -60);
      g.closePath();
      g.fill();
      g.stroke();
      g.save();
      g.translate(dx * 0.4, 0);
      g.beginPath();
      g.moveTo(-112, -66);
      g.quadraticCurveTo(0, -84, 112, -66);
      g.lineTo(156, -26);
      g.quadraticCurveTo(0, -40, -156, -26);
      g.closePath();
      g.fill();
      g.stroke();
      g.strokeStyle = alpha(dark, 0.45);
      g.lineWidth = 2;
      g.setLineDash([5, 4]);
      g.beginPath();
      g.moveTo(-138, -40);
      g.quadraticCurveTo(0, -56, 138, -40);
      g.stroke();
      g.setLineDash([]);
      g.restore();
      break;
    }
    case "durag": {
      const dg = g.createLinearGradient(-110, -150, 110, -40);
      dg.addColorStop(0, shade(col, 0.25));
      dg.addColorStop(0.5, col);
      dg.addColorStop(1, shade(col, -0.2));
      g.fillStyle = dg;
      g.strokeStyle = dark;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-116, -10);
      g.bezierCurveTo(-124, -110, -66, -150, 0, -150);
      g.bezierCurveTo(66, -150, 124, -110, 116, -10);
      g.quadraticCurveTo(100, -60, 0, -66);
      g.quadraticCurveTo(-100, -60, -116, -10);
      g.closePath();
      g.fill();
      g.stroke();
      // satin shine + centre seam
      g.strokeStyle = "rgba(255,255,255,.4)";
      g.lineWidth = 7;
      g.beginPath();
      g.arc(0, -20, 112, Math.PI * 1.3, Math.PI * 1.45);
      g.stroke();
      g.strokeStyle = alpha(dark, 0.6);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, -150);
      g.lineTo(0, -66);
      g.stroke();
      break;
    }
    case "bandana": {
      g.fillStyle = col;
      g.strokeStyle = dark;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-122, -14);
      g.bezierCurveTo(-130, -130, 130, -130, 122, -14);
      g.quadraticCurveTo(0, -66, -122, -14);
      g.closePath();
      g.fill();
      g.stroke();
      // paisley-ish dots
      g.fillStyle = "rgba(255,255,255,.75)";
      for (let i = 0; i < 26; i++) {
        const x = -100 + (i * 37) % 200;
        const y = -100 + ((i * 23) % 60);
        g.beginPath();
        g.arc(x, y, i % 3 ? 2.2 : 4, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = "rgba(255,255,255,.7)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(-112, -30);
      g.quadraticCurveTo(0, -76, 112, -30);
      g.stroke();
      break;
    }
    case "tam": {
      // big knitted rasta tam
      g.save();
      g.beginPath();
      g.ellipse(0, -110, 150, 92, 0, 0, Math.PI * 2);
      g.clip();
      const bands = ["#e8344e", "#f5c400", "#2fa84f", "#111318"];
      for (let i = 0; i < 4; i++) {
        g.fillStyle = bands[i];
        g.fillRect(-160, -210 + i * 46, 320, 46);
      }
      g.strokeStyle = "rgba(0,0,0,.18)";
      g.lineWidth = 2;
      for (let x = -150; x <= 150; x += 10) {
        g.beginPath();
        g.moveTo(x, -210);
        g.lineTo(x + 6, -20);
        g.stroke();
      }
      g.restore();
      g.strokeStyle = "#111318";
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(0, -110, 150, 92, 0, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = "#111318";
      g.beginPath();
      g.roundRect(-118, -64, 236, 26, 12);
      g.fill();
      break;
    }
    case "headband": {
      g.fillStyle = col;
      g.strokeStyle = dark;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-122, -40);
      g.quadraticCurveTo(0, -96, 122, -40);
      g.lineTo(124, -14);
      g.quadraticCurveTo(0, -70, -124, -14);
      g.closePath();
      g.fill();
      g.stroke();
      g.strokeStyle = "rgba(255,255,255,.55)";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-110, -30);
      g.quadraticCurveTo(0, -80, 110, -30);
      g.stroke();
      break;
    }
  }
}

// ------------------------------------------------------------------ piercings & face tattoos
function piercing(g: G, cfg: VAvatar) {
  if (cfg.piercing === "none") return;
  const m = cfg.metal === "iced" ? "silver" : cfg.metal;
  g.strokeStyle = metalFill(g, m, 50, 110);
  g.fillStyle = metalFill(g, m, 50, 110);
  g.lineWidth = 2.6;
  switch (cfg.piercing) {
    case "noseRing":
      g.beginPath();
      g.arc(-9, 66, 5, -0.4, Math.PI * 1.4);
      g.stroke();
      break;
    case "noseStud":
      gem(g, -8, 62, 2.6, m);
      break;
    case "septum":
      g.beginPath();
      g.arc(0, 68, 5, 0.1, Math.PI - 0.1);
      g.stroke();
      break;
    case "lipRing":
      g.beginPath();
      g.arc(10, 96, 5, -0.6, Math.PI * 1.1);
      g.stroke();
      break;
    case "eyebrow":
      g.beginPath();
      g.arc(62, -30, 2.6, 0, Math.PI * 2);
      g.arc(68, -14, 2.6, 0, Math.PI * 2);
      g.fill();
      break;
  }
}

function tattoo(g: G, cfg: VAvatar) {
  if (cfg.tattoo === "none") return;
  const ink = "rgba(30,30,45,.82)";
  g.fillStyle = ink;
  g.strokeStyle = ink;
  g.lineWidth = 2.4;
  g.lineCap = "round";
  switch (cfg.tattoo) {
    case "teardrop":
      g.beginPath();
      g.moveTo(-56, 52);
      g.quadraticCurveTo(-61, 62, -56, 66);
      g.quadraticCurveTo(-51, 62, -56, 52);
      g.fill();
      break;
    case "cross":
      g.beginPath();
      g.moveTo(-74, 50);
      g.lineTo(-74, 68);
      g.moveTo(-80, 55);
      g.lineTo(-68, 55);
      g.stroke();
      break;
    case "heart":
      g.beginPath();
      g.moveTo(-60, 66);
      g.bezierCurveTo(-72, 58, -66, 48, -60, 54);
      g.bezierCurveTo(-54, 48, -48, 58, -60, 66);
      g.stroke();
      break;
    case "star":
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 3 : 7.5;
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        g.lineTo(-62 + Math.cos(a) * r, 58 + Math.sin(a) * r);
      }
      g.closePath();
      g.stroke();
      break;
    case "stitches":
      g.beginPath();
      g.moveTo(52, -50);
      g.lineTo(76, -6);
      for (let k = 0; k < 4; k++) {
        const x = 54 + k * 6.5,
          y = -46 + k * 11.5;
        g.moveTo(x - 6, y + 4);
        g.lineTo(x + 6, y - 3);
      }
      g.stroke();
      break;
  }
}

// ------------------------------------------------------------------ shirt graphics
function graphicArt(g: G, kind: VAvatar["graphic"], x: number, y: number, size: number, col: string, accent: string) {
  if (kind === "none") return;
  g.save();
  g.translate(x, y);
  g.scale(size / 50, size / 50);
  g.lineJoin = "round";
  g.lineCap = "round";
  g.strokeStyle = shade(col, -0.6);
  g.lineWidth = 3;
  switch (kind) {
    case "brokenHeart": {
      g.fillStyle = accent;
      for (const s of [-1, 1]) {
        g.save();
        g.translate(s * 3, s * 2);
        g.rotate(s * 0.08);
        g.beginPath();
        g.moveTo(0, -12);
        if (s < 0) {
          g.bezierCurveTo(-14, -30, -40, -16, -26, 6);
          g.lineTo(0, 26);
          g.lineTo(-4, 12);
          g.lineTo(4, 2);
          g.lineTo(-4, -6);
        } else {
          g.bezierCurveTo(14, -30, 40, -16, 26, 6);
          g.lineTo(0, 26);
          g.lineTo(-4, 12);
          g.lineTo(4, 2);
          g.lineTo(-4, -6);
        }
        g.closePath();
        g.fill();
        g.stroke();
        g.restore();
      }
      break;
    }
    case "butterfly": {
      for (const s of [-1, 1]) {
        g.fillStyle = accent;
        g.beginPath();
        g.moveTo(0, -2);
        g.bezierCurveTo(s * 18, -30, s * 44, -22, s * 30, 0);
        g.bezierCurveTo(s * 40, 14, s * 22, 30, 0, 6);
        g.closePath();
        g.fill();
        g.stroke();
        g.fillStyle = "rgba(255,255,255,.55)";
        g.beginPath();
        g.arc(s * 20, -10, 4, 0, Math.PI * 2);
        g.arc(s * 16, 12, 3, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = shade(col, -0.6);
      g.beginPath();
      g.ellipse(0, 2, 3, 14, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(0, -12);
      g.quadraticCurveTo(-4, -22, -10, -24);
      g.moveTo(0, -12);
      g.quadraticCurveTo(4, -22, 10, -24);
      g.stroke();
      break;
    }
    case "skull":
      g.fillStyle = col;
      g.beginPath();
      g.arc(0, -6, 22, Math.PI * 0.85, Math.PI * 2.15);
      g.lineTo(12, 22);
      g.lineTo(-12, 22);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = shade(col, -0.75);
      g.beginPath();
      g.ellipse(-9, -4, 6, 7, 0, 0, Math.PI * 2);
      g.ellipse(9, -4, 6, 7, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(0, 6);
      g.lineTo(-3, 11);
      g.lineTo(3, 11);
      g.closePath();
      g.fill();
      g.beginPath();
      for (const xx of [-6, 0, 6]) {
        g.moveTo(xx, 16);
        g.lineTo(xx, 22);
      }
      g.stroke();
      break;
    case "lightning":
      g.fillStyle = accent;
      g.beginPath();
      g.moveTo(6, -28);
      g.lineTo(-14, 4);
      g.lineTo(-1, 4);
      g.lineTo(-8, 28);
      g.lineTo(16, -6);
      g.lineTo(2, -6);
      g.closePath();
      g.fill();
      g.stroke();
      break;
    case "flames": {
      const fg = g.createLinearGradient(0, 26, 0, -30);
      fg.addColorStop(0, "#ffd400");
      fg.addColorStop(0.5, "#ff7a00");
      fg.addColorStop(1, "#ff2b4d");
      g.fillStyle = fg;
      g.beginPath();
      g.moveTo(-34, 24);
      for (const [a, b, c2, d] of [
        [-40, -6, -22, -28],
        [-18, -8, -6, -2],
        [-4, -24, 6, -36],
        [12, -14, 16, -4],
        [28, -22, 30, -30],
        [42, -4, 34, 24],
      ])
        g.quadraticCurveTo(a, b, c2, d);
      g.closePath();
      g.fill();
      g.stroke();
      break;
    }
    case "stars":
      g.fillStyle = accent;
      for (const [sx, sy, r] of [
        [-18, -6, 14],
        [16, -14, 9],
        [12, 16, 7],
      ]) {
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const rr = i % 2 ? r * 0.45 : r;
          const a = (i * Math.PI) / 5 - Math.PI / 2;
          g.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr);
        }
        g.closePath();
        g.fill();
        g.stroke();
      }
      break;
  }
  g.restore();
}

// ------------------------------------------------------------------ extras behind the body / floating
function wings(g: G, cfg: VAvatar, t: number) {
  if (cfg.extra !== "wings") return;
  const flap = Math.sin(t * 2) * 0.05;
  for (const s of [-1, 1]) {
    g.save();
    g.translate(s * 60, 220);
    g.rotate(s * (0.15 + flap));
    g.fillStyle = cfg.extraColor === "#111318" ? "#1a1a24" : "#fbfbff";
    g.strokeStyle = shade(cfg.extraColor, -0.3);
    g.lineWidth = 3;
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(s * (160 + k * 20), -170 + k * 50, s * (300 - k * 30), -120 + k * 70);
      g.quadraticCurveTo(s * (200 - k * 20), -40 + k * 40, 0, 30);
      g.closePath();
      g.fill();
      g.stroke();
    }
    g.restore();
  }
}

function butterflies(g: G, cfg: VAvatar, t: number) {
  if (cfg.extra !== "butterflies") return;
  for (const [x0, y0, ph, sc] of [
    [-150, -140, 0, 0.7],
    [160, -60, 2, 0.6],
    [130, -180, 4, 0.5],
  ]) {
    const flap = 0.45 + Math.abs(Math.sin(t * 7 + ph)) * 0.55;
    g.save();
    g.translate(x0 + Math.sin(t * 0.8 + ph) * 14, y0 + Math.cos(t * 1.1 + ph) * 10);
    g.scale(sc * flap, sc);
    graphicArt(g, "butterfly", 0, 0, 50, "#ffffff", cfg.extraColor);
    g.restore();
  }
}

function crowns(g: G, cfg: VAvatar) {
  if (cfg.extra === "crown") {
    const gg = metalFill(g, "gold", -200, -120);
    g.fillStyle = gg;
    g.strokeStyle = "#8a5a00";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(-62, -128);
    g.lineTo(-70, -192);
    g.lineTo(-36, -160);
    g.lineTo(0, -206);
    g.lineTo(36, -160);
    g.lineTo(70, -192);
    g.lineTo(62, -128);
    g.quadraticCurveTo(0, -140, -62, -128);
    g.closePath();
    g.fill();
    g.stroke();
    for (const [x, y, c] of [
      [0, -150, "#e8344e"],
      [-40, -144, "#2fa8ff"],
      [40, -144, "#36d39a"],
    ] as const) {
      g.fillStyle = c;
      g.beginPath();
      g.arc(x, y, 7, 0, Math.PI * 2);
      g.fill();
    }
  }
  if (cfg.extra === "flowerCrown") {
    const cols = [cfg.extraColor, "#ffd1e8", "#fff2a8", "#ffffff"];
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * 1.08 + (i / 8) * Math.PI * 0.84;
      const x = Math.cos(a) * 122;
      const y = -40 + Math.sin(a) * 112;
      for (let p = 0; p < 5; p++) {
        const pa = (p / 5) * Math.PI * 2;
        g.fillStyle = cols[i % cols.length];
        g.beginPath();
        g.ellipse(x + Math.cos(pa) * 8, y + Math.sin(pa) * 8, 7, 5, pa, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = "#ffb02e";
      g.beginPath();
      g.arc(x, y, 4.5, 0, Math.PI * 2);
      g.fill();
    }
  }
}

function faceMask(g: G, cfg: VAvatar) {
  if (cfg.extra !== "mask") return;
  const c = cfg.extraColor;
  g.fillStyle = c;
  g.strokeStyle = shade(c, -0.5);
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(-92, 50);
  g.quadraticCurveTo(0, 36, 92, 50);
  g.quadraticCurveTo(84, 118, 0, 132);
  g.quadraticCurveTo(-84, 118, -92, 50);
  g.closePath();
  g.fill();
  g.stroke();
  g.strokeStyle = alpha(shade(c, -0.5), 0.5);
  g.lineWidth = 2;
  for (const y of [70, 92]) {
    g.beginPath();
    g.moveTo(-84, y);
    g.quadraticCurveTo(0, y - 8, 84, y);
    g.stroke();
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
  const s = (H * 0.48) / 250;
  const breathe = Math.sin(t * 1.7) * 2.2;
  const yaw = Math.max(-1, Math.min(1, p.yaw));
  const pitch = Math.max(-1, Math.min(1, p.pitch));
  const roll = Math.max(-0.6, Math.min(0.6, p.roll));
  const dx = yaw * 24;
  const dy = pitch * 14;

  g.save();
  g.translate(W / 2, H * 0.43);
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
  hatBack(g, cfg);
  g.restore();

  // body (moves a little with the head)
  g.save();
  g.translate(yaw * 10, breathe - 16);
  g.rotate(roll * 0.18);
  wings(g, cfg, t);
  outfit(g, cfg);
  jewellery(g, cfg, t);
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

  earrings(g, cfg, yaw, t);

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
  tattoo(g, cfg);
  // brows
  g.strokeStyle = shade(cfg.hairColor, -0.35);
  g.lineCap = "round";
  g.lineWidth = (cfg.brows === "bold" ? 7 : 4.5) + (cfg.body === "masc" ? 1.5 : 0);
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
  piercing(g, cfg);
  faceMask(g, cfg);
  g.restore();

  frontHair(g, cfg, dx);
  eyewear(g, cfg, dx);
  hat(g, cfg, dx);
  extraFront(g, cfg, dx);
  crowns(g, cfg);
  butterflies(g, cfg, t);
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

/** phones & tablets (iPadOS reports itself as a Mac with touch) */
export const isMobileDevice = () =>
  typeof navigator !== "undefined" && (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));
const isAppleWebKit = () =>
  typeof navigator !== "undefined" && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

function loadLandmarker(): Promise<Landmarker | null> {
  landmarkerP ??= withTimeout(loadLandmarkerInner(), 45_000).catch(() => {
    landmarkerP = null;
    return null;
  });
  return landmarkerP;
}
function loadLandmarkerInner(): Promise<Landmarker | null> {
  return (async () => {
    try {
      // runtime import from the CDN (kept out of the app bundle; ~10 MB wasm+model, cached by the browser)
      const vision = await (new Function("u", "return import(u)") as (u: string) => Promise<Record<string, unknown>>)(`${MP}/vision_bundle.mjs`);
      const FilesetResolver = vision.FilesetResolver as { forVisionTasks: (u: string) => Promise<unknown> };
      const FaceLandmarker = vision.FaceLandmarker as { createFromOptions: (f: unknown, o: unknown) => Promise<Landmarker> };
      const files = await FilesetResolver.forVisionTasks(`${MP}/wasm`);
      const opts = (delegate: "GPU" | "CPU") => ({ baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: "VIDEO", numFaces: 1, outputFaceBlendshapes: true });
      // iPhone/iPad: the WebGL (GPU) path can lock up WebKit — the CPU (wasm SIMD) path is fast enough
      // at the small camera size we use on phones. Everywhere else try the GPU first.
      if (isAppleWebKit()) return await FaceLandmarker.createFromOptions(files, opts("CPU"));
      try {
        return await withTimeout(FaceLandmarker.createFromOptions(files, opts("GPU")), 20_000);
      } catch {
        return await FaceLandmarker.createFromOptions(files, opts("CPU"));
      }
    } catch (e) {
      console.warn("face tracking unavailable", e);
      return null;
    }
  })();
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
  const mobile = isMobileDevice();
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
        // phones: front ("selfie") camera at a small size — plenty for landmarks, far cheaper to analyse
        const video_: MediaTrackConstraints = mobile
          ? { facingMode: "user", width: { ideal: 480 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 30 } }
          : { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } };
        if (opts.cameraId && opts.cameraId !== "default") {
          delete video_.facingMode;
          video_.deviceId = { exact: opts.cameraId };
        }
        const [s, l] = await Promise.all([navigator.mediaDevices.getUserMedia({ video: video_ }), loadLandmarker()]);
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        cam = s;
        lmk = l;
        if (!l) return setMode("voice");
        video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.setAttribute("playsinline", "");
        video.setAttribute("muted", "");
        // iOS only decodes camera frames for videos that are in the page
        video.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;z-index:-1";
        document.body.appendChild(video);
        video.srcObject = s;
        await withTimeout(video.play(), 8000).catch(() => {});
      } catch {
        setMode("voice");
      }
    })();
  } else opts.onMode?.("voice");

  const t0 = performance.now();
  let lastVideoTime = -1;
  let nextDetect = 0;
  const minGap = mobile ? 66 : 33; // face analysis ≤15 fps on phones, ≤30 on computers
  const frame = () => {
    if (stopped) return;
    const now = performance.now();
    const t = (now - t0) / 1000;
    // face tracking — adaptive: if analysis is slow on this device, run it less often instead of freezing
    if (lmk && video && video.readyState >= 2 && video.currentTime !== lastVideoTime && now >= nextDetect) {
      lastVideoTime = video.currentTime;
      try {
        const d0 = performance.now();
        const res = lmk.detectForVideo(video, now);
        const cost = performance.now() - d0;
        nextDetect = performance.now() + Math.max(minGap, cost * 1.6);
        const p = poseFrom(res);
        if (p) {
          target = p;
          lastFace = now;
          setMode("face");
        }
      } catch {
        /* skip frame */
      }
    }
    const tracking = now - lastFace < 900;
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
  // self-scheduling timer (not rAF, so calls keep streaming in background tabs). Unlike setInterval it
  // never queues up frames on a slow phone — the next frame waits until this one is finished.
  const frameMs = 1000 / (mobile ? 24 : 30);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const loop = () => {
    if (stopped) return;
    const a = performance.now();
    try {
      frame();
    } catch {
      /* keep animating */
    }
    timer = setTimeout(loop, Math.max(8, frameMs - (performance.now() - a)));
  };
  loop();

  return {
    canvas,
    stream: () => (stream ??= canvas.captureStream(mobile ? 24 : 30)),
    setLook: (c) => {
      cfg = c;
    },
    mode: () => mode,
    stop: () => {
      stopped = true;
      clearTimeout(timer);
      cam?.getTracks().forEach((t) => t.stop());
      stream?.getTracks().forEach((t) => t.stop());
      if (video) {
        video.srcObject = null;
        video.remove();
      }
    },
  };
}
