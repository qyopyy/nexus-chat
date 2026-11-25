/** Lemonade-stand tycoon: weather, price elasticity, stock and reputation. */

export type Weather = "Sunny" | "Hot" | "Cloudy" | "Rainy";
export const WEATHERS: Weather[] = ["Sunny", "Hot", "Cloudy", "Rainy"];
const BASE: Record<Weather, number> = { Hot: 140, Sunny: 100, Cloudy: 60, Rainy: 25 };

export const CUP_COST = 0.18;
export const SUPPLY_PACK = 25; // cups of supplies per pack
export const PACK_COST = 4.5;

export function pickWeather(rng: () => number): Weather {
  const r = rng();
  return r < 0.3 ? "Sunny" : r < 0.5 ? "Hot" : r < 0.8 ? "Cloudy" : "Rainy";
}

/** Expected customers for a day. Demand falls as price rises above ~$1, and rises with reputation + marketing. */
export function demand(weather: Weather, price: number, reputation: number, marketing: number) {
  const priceFactor = Math.max(0, 1.6 - price * 0.75);
  const rep = 0.6 + reputation / 100;
  return Math.max(0, Math.round(BASE[weather] * priceFactor * rep * (1 + marketing * 0.15)));
}

export type Day = { weather: Weather; price: number; marketing: number };
export type Stand = { cash: number; supplies: number; reputation: number; day: number; best: number };

export function newStand(): Stand {
  return { cash: 30, supplies: 0, reputation: 20, day: 1, best: 0 };
}

export function buyPacks(s: Stand, packs: number): Stand | null {
  const cost = packs * PACK_COST;
  if (!Number.isInteger(packs) || packs < 1 || cost > s.cash + 1e-9) return null;
  return { ...s, cash: Math.round((s.cash - cost) * 100) / 100, supplies: s.supplies + packs * SUPPLY_PACK };
}

export function simulateDay(s: Stand, d: Day, rng: () => number) {
  const wanted = Math.max(0, Math.round(demand(d.weather, d.price, s.reputation, d.marketing) * (0.9 + rng() * 0.2)));
  const sold = Math.min(wanted, s.supplies);
  const missed = wanted - sold;
  const revenue = Math.round(sold * d.price * 100) / 100;
  const adCost = d.marketing * 3;
  const profit = Math.round((revenue - adCost) * 100) / 100;
  const repDelta = (d.price <= 1.2 ? 2 : d.price <= 1.8 ? 0 : -2) + (missed > 5 ? -3 : 1);
  return {
    sold,
    missed,
    revenue,
    adCost,
    profit,
    stand: {
      ...s,
      cash: Math.round((s.cash + revenue - adCost) * 100) / 100,
      supplies: s.supplies - sold,
      reputation: Math.max(0, Math.min(100, s.reputation + repDelta)),
      day: s.day + 1,
      best: Math.max(s.best, profit),
    } as Stand,
  };
}
