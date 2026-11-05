/** Daily quests for Flappy Happy — seeded by calendar day so everyone gets the same set. */

export type QuestKind = "score" | "flights" | "pipes" | "race" | "coins";

export type QuestDef = {
  id: string;
  kind: QuestKind;
  target: number;
  title: string;
  desc: string;
  rewardCoins: number;
  rewardGems: number;
};

export type QuestProgress = {
  id: string;
  progress: number;
  claimed: boolean;
};

function daySeed(day: string) {
  let h = 2166136261;
  for (let i = 0; i < day.length; i++) {
    h ^= day.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const POOL: Omit<QuestDef, "id">[] = [
  { kind: "score", target: 8, title: "Pipe acrobat", desc: "Score 8+ in a single flight", rewardCoins: 40, rewardGems: 0 },
  { kind: "score", target: 15, title: "Sky dancer", desc: "Score 15+ in a single flight", rewardCoins: 70, rewardGems: 1 },
  { kind: "score", target: 25, title: "Legend run", desc: "Score 25+ in a single flight", rewardCoins: 120, rewardGems: 2 },
  { kind: "flights", target: 3, title: "Warm-up laps", desc: "Finish 3 flights today", rewardCoins: 35, rewardGems: 0 },
  { kind: "flights", target: 5, title: "Air time", desc: "Finish 5 flights today", rewardCoins: 55, rewardGems: 1 },
  { kind: "pipes", target: 30, title: "Pipe farmer", desc: "Pass 30 pipes total today", rewardCoins: 50, rewardGems: 0 },
  { kind: "pipes", target: 60, title: "Pipe tycoon", desc: "Pass 60 pipes total today", rewardCoins: 90, rewardGems: 1 },
  { kind: "race", target: 1, title: "Race day", desc: "Finish a multiplayer race", rewardCoins: 45, rewardGems: 1 },
  { kind: "coins", target: 40, title: "Coin hunter", desc: "Earn 40 run coins today", rewardCoins: 40, rewardGems: 0 },
  { kind: "coins", target: 100, title: "Treasure flap", desc: "Earn 100 run coins today", rewardCoins: 80, rewardGems: 1 },
];

export function questsForDay(day: string): QuestDef[] {
  const rand = mulberry(daySeed(day) || 1);
  const pool = [...POOL];
  const picked: QuestDef[] = [];
  for (let i = 0; i < 3 && pool.length; i++) {
    const idx = Math.floor(rand() * pool.length);
    const item = pool.splice(idx, 1)[0]!;
    picked.push({ ...item, id: `${day}-${item.kind}-${item.target}-${i}` });
  }
  return picked;
}

export function syncQuestDay(day: string, existing: QuestProgress[] | undefined, existingDay: string | null | undefined) {
  if (existingDay === day && existing?.length) return { day, quests: existing };
  return {
    day,
    quests: questsForDay(day).map((q) => ({ id: q.id, progress: 0, claimed: false })),
  };
}

export function applyQuestEvent(
  quests: QuestProgress[],
  defs: QuestDef[],
  event: { kind: QuestKind; amount: number; bestScore?: number },
): QuestProgress[] {
  return quests.map((q) => {
    if (q.claimed) return q;
    const def = defs.find((d) => d.id === q.id);
    if (!def || def.kind !== event.kind) return q;
    if (def.kind === "score") {
      const best = Math.max(q.progress, event.bestScore ?? event.amount);
      return { ...q, progress: Math.min(def.target, best) };
    }
    return { ...q, progress: Math.min(def.target, q.progress + event.amount) };
  });
}
