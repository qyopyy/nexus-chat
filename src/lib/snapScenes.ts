// Nexus Snap · full-body avatar: pure data and maths (no canvas), so it can be unit-tested.
import type { Pants, Shoes, VAvatar } from "./vavatar";

// ------------------------------------------------------------------ scenes
export type Scene = {
  key: string;
  label: string;
  /** wall gradient top → bottom */
  wall: [string, string];
  /** floor gradient near horizon → front */
  floor: [string, string];
  /** neon / rim light colour */
  glow: string;
  motif?: "nine99" | "stripes" | "denim" | "grid" | "stars" | "petals" | "sun" | "stage" | "spot";
};

export const SCENES: Scene[] = [
  { key: "ksubi999", label: "999", wall: ["#0a0a0a", "#1a0507"], floor: ["#141012", "#050304"], glow: "#e10600", motif: "nine99" },
  { key: "ksubiBlack", label: "Ksubi Black", wall: ["#161616", "#0b0b0b"], floor: ["#202020", "#0a0a0a"], glow: "#ffffff", motif: "spot" },
  { key: "ksubiPink", label: "Ksubi Pink", wall: ["#12040e", "#3a0630"], floor: ["#1c0818", "#07020a"], glow: "#ff2bd6", motif: "stripes" },
  { key: "ksubiBlood", label: "Ksubi Blood", wall: ["#3a0606", "#150202"], floor: ["#1a0808", "#060101"], glow: "#ff2a2a", motif: "spot" },
  { key: "ksubiDenim", label: "Ksubi Denim", wall: ["#27406b", "#1a2c4d"], floor: ["#2b3b57", "#0f1626"], glow: "#8fb4ff", motif: "denim" },
  { key: "ksubiBone", label: "Ksubi Bone", wall: ["#ece4d3", "#d6ccb6"], floor: ["#1a1a1a", "#080808"], glow: "#ffffff", motif: "spot" },
  { key: "ksubiAcid", label: "Ksubi Acid", wall: ["#07110a", "#10240f"], floor: ["#0c1a0c", "#030803"], glow: "#b6ff00", motif: "stripes" },
  { key: "studio", label: "Studio", wall: ["#d9dbe3", "#aeb2c0"], floor: ["#9a9eab", "#6c7080"], glow: "#ffffff", motif: "spot" },
  { key: "stage", label: "Stage", wall: ["#1a0b2e", "#0a0418"], floor: ["#2a1745", "#0d0618"], glow: "#8b5cff", motif: "stage" },
  { key: "neon", label: "Neon", wall: ["#05010f", "#140030"], floor: ["#12002a", "#05010f"], glow: "#00c2ff", motif: "grid" },
  { key: "galaxy", label: "Galaxy", wall: ["#090418", "#0b1e4a"], floor: ["#12082c", "#06041a"], glow: "#8b5cff", motif: "stars" },
  { key: "sunset", label: "Sunset", wall: ["#ff9a62", "#6b3fa0"], floor: ["#4a2a6e", "#1d1033"], glow: "#fff0c8", motif: "sun" },
  { key: "sakura", label: "Sakura", wall: ["#ffe6f0", "#ffc4dc"], floor: ["#f3b6cf", "#d98fb0"], glow: "#ffffff", motif: "petals" },
];
export const CUSTOM_SCENE = "custom";
export const sceneByKey = (k: string | null | undefined): Scene | null => SCENES.find((s) => s.key === k) ?? null;
/** unknown or empty → the 999 scene (this is Nexus after all); "custom" stays custom (needs an image) */
export const normalizeSceneKey = (k: string | null | undefined): string => (k === CUSTOM_SCENE ? CUSTOM_SCENE : (sceneByKey(k) ?? SCENES[0]).key);

/** object-fit: cover — source rect to draw so the picture fills W×H without stretching. */
export function coverRect(iw: number, ih: number, W: number, H: number): { sx: number; sy: number; sw: number; sh: number } {
  if (!iw || !ih || !W || !H) return { sx: 0, sy: 0, sw: iw, sh: ih };
  const want = W / H;
  const have = iw / ih;
  if (have > want) {
    const sw = Math.round(ih * want);
    return { sx: Math.floor((iw - sw) / 2), sy: 0, sw, sh: ih };
  }
  const sh = Math.round(iw / want);
  return { sx: 0, sy: Math.floor((ih - sh) / 2), sw: iw, sh };
}

/** Canvas size for the avatar camera: long edge from quality (capped on phones), ratio w/h (null → 9:16). Always even. */
export function avatarSize(ratio: number | null, longEdge: number, mobile: boolean): { w: number; h: number } {
  const r = ratio && ratio > 0 ? ratio : 9 / 16;
  const long = Math.max(480, Math.min(longEdge, mobile ? 1280 : 2560));
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return r >= 1 ? { w: even(long), h: even(long / r) } : { w: even(long * r), h: even(long) };
}

// ------------------------------------------------------------------ look helpers
export const PANTS_LABEL: Record<Pants, string> = { jeans: "Jeans", baggy: "Baggy", joggers: "Joggers", shorts: "Shorts", slim: "Slim" };
export const SHOES_LABEL: Record<Shoes, string> = { sneakers: "Sneakers", highs: "High-tops", boots: "Boots", slides: "Slides" };
export const PANTS_COLORS = ["#26345a", "#111318", "#f4f4f8", "#5a5e66", "#7a4a2f", "#3a5a40", "#e10600", "#ff2bd6", "#c0c4cc", "#e8d5b0"];
export const SHOE_COLORS = ["#f4f4f8", "#111318", "#e10600", "#ff2bd6", "#2fa8ff", "#ffd400", "#7a4a2f", "#36d39a"];

export function legsOf(cfg: VAvatar): { pants: Pants; pantsColor: string; shoes: Shoes; shoesColor: string } {
  return { pants: cfg.pants ?? "jeans", pantsColor: cfg.pantsColor ?? "#26345a", shoes: cfg.shoes ?? "sneakers", shoesColor: cfg.shoesColor ?? "#f4f4f8" };
}

const clampC = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const f = (c: number) => clampC(k >= 0 ? c + (255 - c) * k : c * (1 + k));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, "0")).join("")}`;
}
export const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

// ------------------------------------------------------------------ layout (units: the V-Avatar's own drawing units, head centre = 0)
export const WAIST = 335; // where the shirt ends
export const HIP = 318;
export const ANKLE = 668;
export const FEET = 735;
export const TOP = -190; // top of hair

export function bodyLayout(W: number, H: number): { s: number; k: number; cy: number; feetPx: number; floorY: number } {
  const floorY = H * 0.74;
  const feetPx = H * 0.9;
  const s = (feetPx - H * 0.05) / (FEET - TOP);
  const cyPx = feetPx - FEET * s;
  const bust = (H * 0.48) / 250;
  void W;
  return { s, k: s / bust, cy: cyPx / H, feetPx, floorY };
}

