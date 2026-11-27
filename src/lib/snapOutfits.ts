// Ready-made full outfits for the Nexus Snap avatar: top, bottoms, shoes, headwear, glasses and jewellery in one tap.
// Original styles only (no real people, brands or logos). Face and hair stay yours.

import type { VAvatar } from "./vavatar";

export type OutfitLook = {
  key: string;
  name: string;
  emoji: string;
  look: Partial<VAvatar>;
};

const clear: Partial<VAvatar> = { hat: "none", eyewear: "none", chain: "none", pendant: "none", earrings: "none", grillz: "none", extra: "none", graphic: "none", shirtText: "" };

/** Every look starts from "nothing extra" so applying one never leaves pieces of the last one behind. */
const L = (key: string, name: string, emoji: string, look: Partial<VAvatar>): OutfitLook => ({ key, name, emoji, look: { ...clear, ...look } });

export const OUTFIT_LOOKS: OutfitLook[] = [
  L("streetwear", "Streetwear", "🧢", { shirt: "hoodie", shirtColor: "#1f1b3a", accentColor: "#ff2bd6", pants: "baggy", pantsColor: "#2b2f3a", shoes: "highs", shoesColor: "#f4f4f8", hat: "cap", hatColor: "#111318", chain: "cuban", metal: "gold" }),
  L("night-out", "Night out", "🌙", { shirt: "jacket", shirtColor: "#111318", accentColor: "#c0c4cc", pants: "slim", pantsColor: "#111318", shoes: "boots", shoesColor: "#111318", eyewear: "shades", eyewearColor: "#111318", chain: "rope", metal: "silver", earrings: "stud" }),
  L("sporty", "Sporty", "🏃", { shirt: "track", shirtColor: "#2fa8ff", accentColor: "#f4f4f8", pants: "joggers", pantsColor: "#111318", shoes: "sneakers", shoesColor: "#f4f4f8", extra: "headphones", extraColor: "#ff4d6d" }),
  L("school-day", "School day", "🎒", { shirt: "uniform", shirtColor: "#f4f4f8", accentColor: "#5865f2", pants: "slim", pantsColor: "#2b2d52", shoes: "sneakers", shoesColor: "#111318", extra: "none" }),
  L("varsity", "Varsity", "🏈", { shirt: "varsity", shirtColor: "#5865f2", accentColor: "#f4f4f8", pants: "jeans", pantsColor: "#3d5f8c", shoes: "highs", shoesColor: "#f4f4f8", hat: "backcap", hatColor: "#111318" }),
  L("cozy", "Cozy day", "☕", { shirt: "sweater", shirtColor: "#e8d5b0", accentColor: "#a8693c", pants: "joggers", pantsColor: "#7a4a2f", shoes: "slides", shoesColor: "#f4f4f8", hat: "beanie", hatColor: "#a8693c" }),
  L("winter", "Winter puffer", "❄️", { shirt: "puffer", shirtColor: "#111318", accentColor: "#2fd3ff", pants: "slim", pantsColor: "#2b2f3a", shoes: "boots", shoesColor: "#7a4a2f", hat: "beanie", hatColor: "#2fd3ff" }),
  L("gamer", "Gamer", "🎮", { shirt: "hoodie", shirtColor: "#1f1b3a", accentColor: "#00e0ff", pants: "joggers", pantsColor: "#111318", shoes: "sneakers", shoesColor: "#8b5cff", extra: "headphones", extraColor: "#00c2ff", eyewear: "visor", eyewearColor: "#00e0ff" }),
  L("preppy", "Preppy", "🎾", { shirt: "polo", shirtColor: "#f4f4f8", accentColor: "#36d39a", pants: "slim", pantsColor: "#e8d5b0", shoes: "sneakers", shoesColor: "#f4f4f8", eyewear: "round", eyewearColor: "#111318" }),
  L("lumberjack", "Flannel", "🪵", { shirt: "flannel", shirtColor: "#b3262f", accentColor: "#111318", pants: "jeans", pantsColor: "#3d5f8c", shoes: "boots", shoesColor: "#7a4a2f", hat: "beanie", hatColor: "#111318" }),
  L("denim-day", "Denim on denim", "👖", { shirt: "denim", shirtColor: "#3d5f8c", accentColor: "#f4f4f8", pants: "baggy", pantsColor: "#2f4a70", shoes: "sneakers", shoesColor: "#f4f4f8", hat: "bucket", hatColor: "#111318", chain: "tennis", metal: "iced" }),
  L("suit-up", "Suit up", "🕴️", { shirt: "suit", shirtColor: "#111318", accentColor: "#f4f4f8", pants: "slim", pantsColor: "#111318", shoes: "boots", shoesColor: "#111318", eyewear: "rimless", eyewearColor: "#c0c4cc" }),
  L("bomber", "Bomber", "✈️", { shirt: "bomber", shirtColor: "#3a5a40", accentColor: "#ffb02e", pants: "slim", pantsColor: "#111318", shoes: "boots", shoesColor: "#111318", eyewear: "shades", eyewearColor: "#111318" }),
  L("trap-star", "Trap star", "💎", { shirt: "puffer", shirtColor: "#111318", accentColor: "#ff4d6d", pants: "baggy", pantsColor: "#111318", shoes: "highs", shoesColor: "#ff4d6d", hat: "durag", hatColor: "#8b5cff", chain: "layered", pendant: "letter", earrings: "bigStud", grillz: "iced", metal: "iced", eyewear: "shades", eyewearColor: "#111318" }),
  L("anime-idol", "Anime idol", "🌸", { shirt: "uniform", shirtColor: "#f4f4f8", accentColor: "#ff7ab8", pants: "shorts", pantsColor: "#2b2d52", shoes: "highs", shoesColor: "#ff7ab8", extra: "flowerCrown", extraColor: "#ff7ab8", earrings: "pearl", metal: "rose" }),
  L("pink-pop", "Pink pop", "🎀", { shirt: "tee", shirtColor: "#ff7ab8", accentColor: "#f4f4f8", pants: "shorts", pantsColor: "#f4f4f8", shoes: "sneakers", shoesColor: "#ff2bd6", extra: "bow", extraColor: "#ff2bd6", graphic: "stars" }),
  L("beach", "Beach day", "🏖️", { shirt: "tank", shirtColor: "#ffb02e", accentColor: "#2fd3ff", pants: "shorts", pantsColor: "#2fa8ff", shoes: "slides", shoesColor: "#111318", hat: "bucket", hatColor: "#f4f4f8", eyewear: "shades", eyewearColor: "#111318" }),
  L("rock", "Rock tour", "🎸", { shirt: "acidtee", shirtColor: "#111318", accentColor: "#ff4d6d", pants: "jeans", pantsColor: "#111318", shoes: "boots", shoesColor: "#111318", graphic: "skull", chain: "figaro", metal: "silver", eyewear: "shades", eyewearColor: "#111318" }),
  L("angel", "Angel", "😇", { shirt: "sweater", shirtColor: "#f4f4f8", accentColor: "#ffd400", pants: "slim", pantsColor: "#f4f4f8", shoes: "sneakers", shoesColor: "#f4f4f8", extra: "halo", extraColor: "#ffd400", chain: "pearls", metal: "gold" }),
  L("devil", "Little devil", "😈", { shirt: "hoodie", shirtColor: "#b3262f", accentColor: "#111318", pants: "joggers", pantsColor: "#111318", shoes: "boots", shoesColor: "#111318", extra: "horns", extraColor: "#ff4d6d", graphic: "flames" }),
  L("cat-cafe", "Cat café", "🐱", { shirt: "sweater", shirtColor: "#c0c4cc", accentColor: "#ff7ab8", pants: "shorts", pantsColor: "#2b2d52", shoes: "sneakers", shoesColor: "#f4f4f8", extra: "catEars", extraColor: "#c0c4cc", graphic: "none" }),
  L("sunset", "Golden hour", "🌅", { shirt: "tee", shirtColor: "#ff9f40", accentColor: "#f4f4f8", pants: "baggy", pantsColor: "#e8d5b0", shoes: "sneakers", shoesColor: "#f4f4f8", hat: "bandana", hatColor: "#ff4d6d", eyewear: "round", eyewearColor: "#a8693c", chain: "rope", metal: "gold" }),
  L("mint-fresh", "Mint fresh", "🍃", { shirt: "zipup", shirtColor: "#36d39a", accentColor: "#f4f4f8", pants: "joggers", pantsColor: "#f4f4f8", shoes: "sneakers", shoesColor: "#36d39a", hat: "cap", hatColor: "#f4f4f8" }),
];

/** "catEars" → "Cat ears", "none" → "None" (labels for the piece pickers). */
export function pieceLabel(v: string): string {
  const s = v.replace(/([A-Z])/g, " $1").trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Puts a ready-made look on top of the avatar. Face, hair, skin and background stay as they are. */
export function applyLook(cfg: VAvatar, look: OutfitLook): VAvatar {
  return { ...cfg, ...look.look };
}

/** Does the avatar currently wear exactly this look? (for the highlighted card) */
export function wearsLook(cfg: VAvatar, look: OutfitLook): boolean {
  return (Object.keys(look.look) as (keyof VAvatar)[]).every((k) => cfg[k] === look.look[k]);
}
