/** Flappy Happy shop catalogue — birds, accessories (incl. Juice WRLD–inspired fits), packs. */

export type BirdDef = { id: string; name: string; color: string; cost: number; tag?: string };
export type AccSlot = "hat" | "face" | "neck" | "back" | "trail";
export type AccDef = {
  id: string;
  name: string;
  slot: AccSlot;
  cost: number;
  emoji: string;
  /** short flavour text under the name */
  blurb: string;
  /** Juice WRLD / emo / 999 collection */
  juice?: boolean;
};

export const BIRDS: BirdDef[] = [
  { id: "classic", name: "Original", color: "#facc15", cost: 0 },
  { id: "bluejay", name: "Blue Jay", color: "#38bdf8", cost: 40 },
  { id: "cardinal", name: "Cardinal", color: "#ef4444", cost: 60 },
  { id: "gold", name: "Solid Gold", color: "#fbbf24", cost: 120 },
  { id: "cyber", name: "Cyber", color: "#06b6d4", cost: 150 },
  { id: "ghost", name: "Ghost", color: "#e2e8f0", cost: 180 },
  { id: "ninja", name: "Ninja", color: "#1e293b", cost: 220 },
  { id: "alien", name: "Alien", color: "#10b981", cost: 260 },
  { id: "emo", name: "Moonlight", color: "#7c3aed", cost: 320, tag: "999" },
  { id: "lucid", name: "Lucid", color: "#c084fc", cost: 380, tag: "999" },
  { id: "phoenix", name: "Phoenix", color: "#fb923c", cost: 420 },
  { id: "candy", name: "Candy Pop", color: "#fb7185", cost: 280 },
  { id: "frost", name: "Frostbite", color: "#a5f3fc", cost: 300 },
];

/** World index (1-based) → HTML engine environment id */
export const WORLD_ENV = ["classic", "sunset", "cyberpunk", "snow", "volcano"] as const;

export type Difficulty = "easy" | "normal" | "hard";
export type PowerId = "slow" | "double" | "magnet";

export const DIFFICULTY_META: Record<Difficulty, { label: string; blurb: string; coinMul: number }> = {
  easy: { label: "Easy", blurb: "Wider gaps · chill pace", coinMul: 0.75 },
  normal: { label: "Normal", blurb: "Classic Flappy Happy", coinMul: 1 },
  hard: { label: "Hard", blurb: "Tight gaps · faster pipes · +coins", coinMul: 1.5 },
};

export const POWERUPS: { id: PowerId; name: string; emoji: string; cost: number; blurb: string }[] = [
  { id: "slow", name: "Slow-mo", emoji: "🐢", cost: 45, blurb: "Pipes drift slower for one flight" },
  { id: "double", name: "Double coins", emoji: "✨", cost: 60, blurb: "2× run coins on the next flight" },
  { id: "magnet", name: "Coin magnet", emoji: "🧲", cost: 50, blurb: "Bigger coin pickup radius" },
];

export const ACCESSORIES: AccDef[] = [
  // ——— Juice WRLD / 999 vibes ———
  { id: "jw-beanie", name: "999 Beanie", slot: "hat", cost: 180, emoji: "🧢", blurb: "Goodbye & Good Riddance energy", juice: true },
  { id: "jw-hoodie", name: "Black Heart Hoodie", slot: "back", cost: 260, emoji: "🖤", blurb: "Hood up, feelings loud", juice: true },
  { id: "jw-chain", name: "Heartless Chain", slot: "neck", cost: 220, emoji: "🔗", blurb: "Shine through the pain", juice: true },
  { id: "jw-shades", name: "Moonlight Shades", slot: "face", cost: 160, emoji: "🕶️", blurb: "Late-night studio look", juice: true },
  { id: "jw-bat", name: "Bat Buddy", slot: "hat", cost: 200, emoji: "🦇", blurb: "Fighting demons, one flap at a time", juice: true },
  { id: "jw-999", name: "999 Ink", slot: "face", cost: 999, emoji: "9️⃣", blurb: "Turn a bad situation into something positive", juice: true },
  { id: "jw-tears", name: "Purple Tears", slot: "trail", cost: 240, emoji: "💧", blurb: "Trail of purple rain", juice: true },
  { id: "jw-aura", name: "Lucid Aura", slot: "trail", cost: 300, emoji: "💜", blurb: "Dreams that feel too real", juice: true },
  { id: "jw-phones", name: "Studio Cans", slot: "hat", cost: 210, emoji: "🎧", blurb: "Always in the booth", juice: true },
  { id: "jw-bandana", name: "Ally Bandana", slot: "neck", cost: 150, emoji: "🎀", blurb: "For the ones who stayed", juice: true },
  { id: "jw-wings", name: "Angel 999 Wings", slot: "back", cost: 450, emoji: "🪽", blurb: "Legends never die", juice: true },
  { id: "jw-rose", name: "Wishing Rose", slot: "neck", cost: 175, emoji: "🌹", blurb: "Roses are falling", juice: true },

  // ——— classic drip ———
  { id: "crown", name: "Pixel Crown", slot: "hat", cost: 120, emoji: "👑", blurb: "Main character energy" },
  { id: "party", name: "Party Hat", slot: "hat", cost: 60, emoji: "🎉", blurb: "Celebrate every pipe" },
  { id: "propeller", name: "Propeller Cap", slot: "hat", cost: 90, emoji: "🚁", blurb: "Extra lift vibes" },
  { id: "top-hat", name: "Classy Top Hat", slot: "hat", cost: 140, emoji: "🎩", blurb: "Fancy flyer" },
  { id: "halo", name: "Soft Halo", slot: "hat", cost: 200, emoji: "😇", blurb: "Too pure for these pipes" },
  { id: "horns", name: "Lil Horns", slot: "hat", cost: 130, emoji: "😈", blurb: "Chaos mode" },

  { id: "sunnies", name: "Cool Sunnies", slot: "face", cost: 80, emoji: "😎", blurb: "Too cool to crash" },
  { id: "monocle", name: "Monocle", slot: "face", cost: 110, emoji: "🧐", blurb: "Inspect every gap" },
  { id: "mustache", name: "Gentleman Stache", slot: "face", cost: 70, emoji: "🥸", blurb: "Distinguished flapper" },
  { id: "blush", name: "Shy Blush", slot: "face", cost: 50, emoji: "😊", blurb: "Soft launch" },

  { id: "scarf", name: "Winter Scarf", slot: "neck", cost: 95, emoji: "🧣", blurb: "Cozy in the clouds" },
  { id: "gold-chain", name: "Gold Chain", slot: "neck", cost: 280, emoji: "🪙", blurb: "Flex in free-fall" },
  { id: "bowtie", name: "Bow Tie", slot: "neck", cost: 85, emoji: "🎀", blurb: "Formal flight" },
  { id: "medal", name: "Ace Medal", slot: "neck", cost: 160, emoji: "🏅", blurb: "Earned in the skies" },

  { id: "cape", name: "Hero Cape", slot: "back", cost: 190, emoji: "🦸", blurb: "Swoosh through gaps" },
  { id: "backpack", name: "Seed Backpack", slot: "back", cost: 100, emoji: "🎒", blurb: "Packed for adventure" },
  { id: "rocket", name: "Mini Rockets", slot: "back", cost: 320, emoji: "🚀", blurb: "Questionable physics" },
  { id: "fairy", name: "Fairy Wings", slot: "back", cost: 230, emoji: "🧚", blurb: "Sparkle glide" },

  { id: "sparkle", name: "Sparkle Trail", slot: "trail", cost: 140, emoji: "✨", blurb: "Leave glitter behind" },
  { id: "fire", name: "Flame Trail", slot: "trail", cost: 200, emoji: "🔥", blurb: "Hot streak" },
  { id: "rainbow", name: "Rainbow Trail", slot: "trail", cost: 250, emoji: "🌈", blurb: "Taste the rainbow" },
  { id: "notes", name: "Music Notes", slot: "trail", cost: 180, emoji: "🎵", blurb: "Score to the beat" },
  { id: "stars", name: "Star Dust", slot: "trail", cost: 160, emoji: "⭐", blurb: "Wish on every pipe" },
  { id: "hearts", name: "Heart Trail", slot: "trail", cost: 170, emoji: "💗", blurb: "Spread the love" },
  { id: "lightning", name: "Lightning Trail", slot: "trail", cost: 220, emoji: "⚡", blurb: "Zap through the sky" },

  { id: "pilot", name: "Pilot Goggles", slot: "face", cost: 95, emoji: "🥽", blurb: "Ready for takeoff" },
  { id: "flower", name: "Flower Crown", slot: "hat", cost: 110, emoji: "🌸", blurb: "Garden flyer" },
  { id: "jetpack", name: "Neon Jetpack", slot: "back", cost: 340, emoji: "🔋", blurb: "Questionable FAA approval" },
];

export const SLOT_LABEL: Record<AccSlot, string> = {
  hat: "Hats",
  face: "Face",
  neck: "Neck",
  back: "Back",
  trail: "Trails",
};

export const SLOTS: AccSlot[] = ["hat", "face", "neck", "back", "trail"];

export type Equipped = Partial<Record<AccSlot, string | null>>;

export function accById(id: string | null | undefined) {
  return id ? ACCESSORIES.find((a) => a.id === id) : undefined;
}

export function birdById(id: string) {
  return BIRDS.find((b) => b.id === id) ?? BIRDS[0];
}
