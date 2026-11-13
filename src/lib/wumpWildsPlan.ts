/** Original Wump creatures and the block they appear on. No network, no exact GPS. */

export const WILD_SPECIES = [
  { id: "pebblit", name: "Pebblit", emoji: "🪨", line: "A round stone that hops when the path is quiet." },
  { id: "mossnip", name: "Mossnip", emoji: "🌿", line: "Tucks into park grass." },
  { id: "brooklet", name: "Brooklet", emoji: "💧", line: "Follows the nearest puddle." },
  { id: "emberling", name: "Emberling", emoji: "🔥", line: "Warm, and gone if you wait too long." },
  { id: "gustkit", name: "Gustkit", emoji: "🌬️", line: "Shows up when the air moves." },
  { id: "nightgleam", name: "Nightgleam", emoji: "✨", line: "Easier to see after dusk." },
  { id: "shellbit", name: "Shellbit", emoji: "🐚", line: "Clicks once when you are close." },
  { id: "lanternub", name: "Lanternub", emoji: "🏮", line: "A small glow on the block." },
] as const;

export type WildId = (typeof WILD_SPECIES)[number]["id"];

export type WildSpawn = {
  id: string;
  species: WildId;
  name: string;
  emoji: string;
  lat: number;
  lng: number;
  meters: number;
};

const WINDOW_MS = 10 * 60_000;

export function wildSpecies(id: string) {
  return WILD_SPECIES.find((row) => row.id === id) ?? null;
}

/** About a 110 m block. Exact GPS is not stored. */
export function wildCell(lat: number, lng: number) {
  const cellLat = Math.round(lat * 1000) / 1000;
  const cellLng = Math.round(lng * 1000) / 1000;
  return { lat: cellLat, lng: cellLng, key: `${cellLat.toFixed(3)},${cellLng.toFixed(3)}` };
}

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function offset(cellLat: number, cellLng: number, north: number, east: number) {
  const lat = cellLat + north / 111_320;
  const lng = cellLng + east / (111_320 * Math.cos((cellLat * Math.PI) / 180));
  return { lat, lng };
}

export function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number) {
  const dLat = (bLat - aLat) * 111_320;
  const dLng = (bLng - aLng) * 111_320 * Math.cos((aLat * Math.PI) / 180);
  return Math.round(Math.hypot(dLat, dLng));
}

/** Same block and 10-minute window always produces the same four creatures. */
export function wildSpawns(lat: number, lng: number, now = Date.now()): WildSpawn[] {
  const cell = wildCell(lat, lng);
  const bucket = Math.floor(now / WINDOW_MS);
  const out: WildSpawn[] = [];
  for (let i = 0; i < 4; i++) {
    const n = hash(`${cell.key}:${bucket}:${i}`);
    const species = WILD_SPECIES[n % WILD_SPECIES.length];
    const north = ((n >>> 8) % 140) - 70;
    const east = ((n >>> 16) % 140) - 70;
    const at = offset(cell.lat, cell.lng, north, east);
    out.push({
      id: `${cell.key}:${bucket}:${i}`,
      species: species.id,
      name: species.name,
      emoji: species.emoji,
      lat: at.lat,
      lng: at.lng,
      meters: metersBetween(lat, lng, at.lat, at.lng),
    });
  }
  return out.sort((a, b) => a.meters - b.meters);
}
