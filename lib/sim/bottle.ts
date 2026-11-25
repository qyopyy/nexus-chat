/** Bottle Run — deposit-return open-world sim. Pure rules: sessions, upgrades, pets, vehicles, quests. */

export type Kind = "plastic" | "glass" | "can";
export const KINDS: Record<Kind, { emoji: string; label: string }> = {
  plastic: { emoji: "🧴", label: "PET bottle" },
  glass: { emoji: "🍾", label: "Glass bottle" },
  can: { emoji: "🥫", label: "Can" },
};
export const KIND_LIST = Object.keys(KINDS) as Kind[];

export type BagItem = { kind: Kind; dirty: boolean };

export const DEPOSIT = 50; // Ft per accepted item
export const STREAK_STEP = 10; // Ft of bonus per item in the streak
export const CURRENCY = "Ft";

/* ───────── upgrades ───────── */
export type UpgradeId = "bag" | "boots" | "arm" | "deposit" | "magnet" | "calm" | "sponge";
export type UpgradeDef = { id: UpgradeId; name: string; emoji: string; desc: string; base: number; growth: number; max: number };
export const UPGRADES: UpgradeDef[] = [
  { id: "bag", name: "Bigger bag", emoji: "🛍️", desc: "+5 items carried per level", base: 100, growth: 1.6, max: 12 },
  { id: "boots", name: "Running shoes", emoji: "👟", desc: "+8% walking speed per level", base: 150, growth: 1.7, max: 8 },
  { id: "arm", name: "Throwing arm", emoji: "💪", desc: "Throw bottles faster", base: 200, growth: 1.7, max: 8 },
  { id: "deposit", name: "Deposit boost", emoji: "💸", desc: "+2 Ft on every returned item", base: 300, growth: 2, max: 10 },
  { id: "magnet", name: "Pickup magnet", emoji: "🧲", desc: "Grab litter from further away", base: 120, growth: 1.6, max: 8 },
  { id: "calm", name: "Queue whisperer", emoji: "🧘", desc: "The queue stays calm longer", base: 250, growth: 1.8, max: 8 },
  { id: "sponge", name: "Pocket sponge", emoji: "🧽", desc: "Fewer dirty items get rejected", base: 180, growth: 1.8, max: 5 },
];
export function upgradeCost(def: UpgradeDef, level: number) {
  return Math.round(def.base * Math.pow(def.growth, level));
}

/* ───────── pets & vehicles ───────── */
export type PetId = "pigeon" | "dog" | "cat" | "raccoon" | "hedgehog" | "fox";
export type PetDef = { id: PetId; name: string; emoji: string; cost: number; desc: string };
export const PETS: PetDef[] = [
  { id: "pigeon", name: "Galamb", emoji: "🐦", cost: 500, desc: "Spots litter — shows it on your radar" },
  { id: "dog", name: "Bundás", emoji: "🐕", cost: 800, desc: "Fetches litter around you automatically" },
  { id: "cat", name: "Cirmi", emoji: "🐈", cost: 1200, desc: "+10% on every deposit" },
  { id: "raccoon", name: "Mosómedve", emoji: "🦝", cost: 3000, desc: "Digs up extra cans from bins" },
  { id: "hedgehog", name: "Sün", emoji: "🦔", cost: 5000, desc: "+8 bag space" },
  { id: "fox", name: "Vuk", emoji: "🦊", cost: 12000, desc: "+15% walking speed" },
];

export type VehicleId = "none" | "bike" | "scooter" | "van";
export type VehicleDef = { id: VehicleId; name: string; emoji: string; cost: number; speed: number; bag: number };
export const VEHICLES: VehicleDef[] = [
  { id: "none", name: "On foot", emoji: "🚶", cost: 0, speed: 1, bag: 0 },
  { id: "bike", name: "Bicycle", emoji: "🚲", cost: 1500, speed: 1.5, bag: 10 },
  { id: "scooter", name: "Scooter", emoji: "🛵", cost: 6000, speed: 1.9, bag: 20 },
  { id: "van", name: "Delivery van", emoji: "🚐", cost: 25000, speed: 2.3, bag: 60 },
];

/* ───────── save ───────── */
export type Save = {
  v: 1;
  money: number;
  earnedTotal: number;
  returned: number;
  collected: number;
  bestStreak: number;
  bag: BagItem[];
  upgrades: Partial<Record<UpgradeId, number>>;
  pets: PetId[];
  vehicles: VehicleId[];
  riding: VehicleId;
  quests: QuestState;
  visited: string[];
  walked: number;
  pos: { x: number; y: number };
  muted: boolean;
};

export function newSave(): Save {
  return { v: 1, money: 0, earnedTotal: 0, returned: 0, collected: 0, bestStreak: 0, bag: [], upgrades: {}, pets: [], vehicles: ["none"], riding: "none", quests: newQuests(), visited: [], walked: 0, pos: { x: 0, y: 0 }, muted: false };
}

export function lvl(s: Save, id: UpgradeId) {
  return s.upgrades[id] ?? 0;
}

export type Perks = {
  capacity: number;
  speed: number; // multiplier
  throwCooldown: number; // seconds
  depositBonus: number; // Ft per item
  depositPct: number; // multiplier
  pickupRadius: number; // px
  calmDrain: number; // multiplier on queue impatience
  dirtyChance: number;
  petRadius: number; // auto-collect radius (dog)
  radar: boolean;
  canFind: number; // chance per second near litter bins
};

export function perks(s: Save): Perks {
  const veh = VEHICLES.find((v) => v.id === s.riding) ?? VEHICLES[0];
  const has = (p: PetId) => s.pets.includes(p);
  return {
    capacity: 10 + 5 * lvl(s, "bag") + veh.bag + (has("hedgehog") ? 8 : 0),
    speed: (1 + 0.08 * lvl(s, "boots") + (has("fox") ? 0.15 : 0)) * veh.speed,
    throwCooldown: Math.max(0.12, 0.45 - 0.04 * lvl(s, "arm")),
    depositBonus: 2 * lvl(s, "deposit"),
    depositPct: has("cat") ? 1.1 : 1,
    pickupRadius: 26 + 8 * lvl(s, "magnet"),
    calmDrain: Math.max(0.2, 1 - 0.08 * lvl(s, "calm")),
    dirtyChance: Math.max(0.02, 0.16 - 0.03 * lvl(s, "sponge")),
    petRadius: has("dog") ? 90 : 0,
    radar: has("pigeon"),
    canFind: has("raccoon") ? 0.08 : 0,
  };
}

export type BuyResult = { save: Save } | { error: string };

export function buyUpgrade(s: Save, id: UpgradeId): BuyResult {
  const def = UPGRADES.find((u) => u.id === id);
  if (!def) return { error: "Unknown upgrade" };
  const l = lvl(s, id);
  if (l >= def.max) return { error: "Max level" };
  const cost = upgradeCost(def, l);
  if (s.money < cost) return { error: "Not enough money" };
  return { save: { ...s, money: s.money - cost, upgrades: { ...s.upgrades, [id]: l + 1 } } };
}
export function buyPet(s: Save, id: PetId): BuyResult {
  const def = PETS.find((p) => p.id === id);
  if (!def) return { error: "Unknown pet" };
  if (s.pets.includes(id)) return { error: "You already have this pet" };
  if (s.money < def.cost) return { error: "Not enough money" };
  return { save: { ...s, money: s.money - def.cost, pets: [...s.pets, id] } };
}
export function buyVehicle(s: Save, id: VehicleId): BuyResult {
  const def = VEHICLES.find((v) => v.id === id);
  if (!def || id === "none") return { error: "Unknown vehicle" };
  if (s.vehicles.includes(id)) return { error: "You already own it" };
  if (s.money < def.cost) return { error: "Not enough money" };
  return { save: { ...s, money: s.money - def.cost, vehicles: [...s.vehicles, id], riding: id } };
}

/* ───────── return-machine session ───────── */
export type Session = { streak: number; bonus: number; accepted: number; rejected: number; earned: number; calm: number; queue: number };
export function newSession(queue = 3): Session {
  return { streak: 0, bonus: 0, accepted: 0, rejected: 0, earned: 0, calm: 100, queue };
}
/** Result of throwing one item into the machine. Dirty items must be wiped first (`clean`), else they are rejected. */
export function throwItem(sess: Session, item: BagItem, p: Perks, wiped: boolean) {
  if (item.dirty && !wiped) {
    const banked = Math.round(sess.bonus / 2);
    return { ok: false as const, gain: banked, session: { ...sess, streak: 0, bonus: 0, rejected: sess.rejected + 1, earned: sess.earned + banked, calm: Math.max(0, sess.calm - 8) } };
  }
  const gain = Math.round((DEPOSIT + p.depositBonus) * p.depositPct);
  const streak = sess.streak + 1;
  return {
    ok: true as const,
    gain,
    session: { ...sess, streak, bonus: streak * STREAK_STEP, accepted: sess.accepted + 1, earned: sess.earned + gain, calm: Math.min(100, sess.calm + 2) },
  };
}

/** Queue impatience: drains calm while people wait. At 0 the queue storms off and your streak breaks. */
export function tickCalm(sess: Session, dt: number, p: Perks) {
  if (sess.queue <= 0) return { session: sess, stormedOff: false };
  const calm = Math.max(0, sess.calm - 1.2 * dt * p.calmDrain);
  if (calm > 0) return { session: { ...sess, calm }, stormedOff: false };
  const banked = Math.round(sess.bonus / 2);
  return { session: { ...sess, calm: 40, queue: Math.max(0, sess.queue - 1), streak: 0, bonus: 0, earned: sess.earned + banked }, stormedOff: true };
}

/** Pay out the streak bonus when you step away from the machine. */
export function closeSession(sess: Session) {
  return { payout: sess.bonus, session: { ...sess, earned: sess.earned + sess.bonus, bonus: 0, streak: 0 } };
}

export function calmLabel(calm: number) {
  return calm > 66 ? "Calm" : calm > 33 ? "Impatient" : "Angry";
}

/* ───────── quests ───────── */
export type QEvent =
  | { t: "collect"; kind: Kind }
  | { t: "return"; kind: Kind }
  | { t: "earn"; amount: number }
  | { t: "streak"; n: number }
  | { t: "upgrade" }
  | { t: "pet" }
  | { t: "vehicle" }
  | { t: "visit"; poi: string }
  | { t: "walk"; px: number }
  | { t: "session"; earned: number };

export type Objective = { t: QEvent["t"]; target: number; kind?: Kind; poi?: string; label: string };
export type Quest = {
  id: string;
  main: boolean;
  title: string;
  giver: string; // npc id
  intro: string;
  done: string; // line when claimed
  objectives: Objective[];
  reward: number;
  requires?: string;
};

export const QUESTS: Quest[] = [
  { id: "m1", main: true, title: "First Deposit", giver: "bela", intro: "Hey kid! Bottles are money in this town. Pick up 8 items around the park and return them at the machines in the market hall.", done: "See? 50 Ft each. Not bad. Keep going!", objectives: [{ t: "collect", target: 8, label: "Pick up items" }, { t: "return", target: 8, label: "Return items at the machine" }], reward: 150 },
  { id: "m2", main: true, title: "Pocket Money", giver: "bela", requires: "m1", intro: "Now let's make it a living. Earn 1,000 Ft in total from deposits.", done: "A real little business!", objectives: [{ t: "earn", target: 1000, label: "Earn Ft in total" }], reward: 250 },
  { id: "m3", main: true, title: "Gear Up", giver: "erzsi", requires: "m2", intro: "Better gear, better haul. Buy two upgrades from the shop menu.", done: "Looking professional!", objectives: [{ t: "upgrade", target: 2, label: "Buy upgrades" }], reward: 300 },
  { id: "m4", main: true, title: "Best Friend", giver: "zsofi", requires: "m3", intro: "Animals love this town. Adopt your first pet — they help you out.", done: "Aww, look at them!", objectives: [{ t: "pet", target: 1, label: "Adopt a pet" }], reward: 400 },
  { id: "m5", main: true, title: "Streak Master", giver: "bela", requires: "m4", intro: "Throw ten items without a single rejection. Wipe dirty ones first!", done: "Smooth hands.", objectives: [{ t: "streak", target: 10, label: "Reach a streak of 10" }], reward: 500 },
  { id: "m6", main: true, title: "Town Cleaner", giver: "mayor", requires: "m5", intro: "I'm the mayor. The streets have never been cleaner thanks to you. Collect 100 items in total!", done: "The town thanks you.", objectives: [{ t: "collect", target: 100, label: "Collect items in total" }], reward: 1000 },
  { id: "m7", main: true, title: "Wheels", giver: "karcsi", requires: "m6", intro: "Walking is for amateurs. Get yourself a bicycle (or better) from the shop.", done: "Now you're moving!", objectives: [{ t: "vehicle", target: 1, label: "Buy a vehicle" }], reward: 1500 },
  { id: "m8", main: true, title: "Deposit Legend", giver: "mayor", requires: "m7", intro: "Return 500 items and become the legend of the machine hall.", done: "A legend. They'll write songs about you.", objectives: [{ t: "return", target: 500, label: "Return items" }], reward: 8000 },

  { id: "s1", main: false, title: "Márta's Lost Bag", giver: "marta", intro: "I lost my shopping bag near the pond. Could you walk down to the pond and check?", done: "Oh, there it was! Bless you.", objectives: [{ t: "visit", target: 1, poi: "pond", label: "Visit the pond" }], reward: 200 },
  { id: "s2", main: false, title: "Can Collector", giver: "gyuri", intro: "I need five empty cans for my art project. Just cans, nothing else!", done: "Perfect, it's going to be a masterpiece.", objectives: [{ t: "collect", target: 5, kind: "can", label: "Pick up cans" }], reward: 220 },
  { id: "s3", main: false, title: "Glass Act", giver: "zsofi", intro: "For school we're recycling glass. Can you return 20 glass bottles?", done: "Teacher will be so proud!", objectives: [{ t: "return", target: 20, kind: "glass", label: "Return glass bottles" }], reward: 450 },
  { id: "s4", main: false, title: "Town Explorer", giver: "karcsi", intro: "A good courier knows the town. Visit the school, the stadium and the bridge.", done: "You know your way around!", objectives: [{ t: "visit", target: 1, poi: "school", label: "Visit the school" }, { t: "visit", target: 1, poi: "stadium", label: "Visit the stadium" }, { t: "visit", target: 1, poi: "bridge", label: "Visit the bridge" }], reward: 350 },
  { id: "s5", main: false, title: "Quick Cash", giver: "erzsi", intro: "Bet you can't earn 400 Ft in a single machine session.", done: "Fast fingers!", objectives: [{ t: "session", target: 400, label: "Earn in one session" }], reward: 300 },
  { id: "s6", main: false, title: "Morning Jog", giver: "marta", requires: "s1", intro: "My doctor says walk more. Walk 3,000 steps for me?", done: "My knees thank you.", objectives: [{ t: "walk", target: 3000, label: "Walk (steps)" }], reward: 250 },
  { id: "s7", main: false, title: "PET Patrol", giver: "mayor", requires: "m6", intro: "Plastic bottles are everywhere. Pick up 30 PET bottles.", done: "Greener already.", objectives: [{ t: "collect", target: 30, kind: "plastic", label: "Pick up PET bottles" }], reward: 600 },
  { id: "s8", main: false, title: "Glass Mountain", giver: "gyuri", requires: "s2", intro: "Now I want glass. Return 60 glass bottles — I'll make a chandelier!", done: "Magnificent!", objectives: [{ t: "return", target: 60, kind: "glass", label: "Return glass bottles" }], reward: 1200 },
];

export type QStatus = "active" | "ready" | "done";
export type QuestState = { status: Record<string, QStatus>; prog: Record<string, number[]> };
export function newQuests(): QuestState {
  return { status: {}, prog: {} };
}

export function questById(id: string) {
  return QUESTS.find((q) => q.id === id);
}

export function isAvailable(q: Quest, st: QuestState) {
  if (st.status[q.id]) return false;
  return !q.requires || st.status[q.requires] === "done";
}

export function startQuest(st: QuestState, id: string): QuestState {
  const q = questById(id);
  if (!q || !isAvailable(q, st)) return st;
  return { status: { ...st.status, [id]: "active" }, prog: { ...st.prog, [id]: q.objectives.map(() => 0) } };
}

function matches(o: Objective, ev: QEvent) {
  if (o.t !== ev.t) return false;
  if ((ev.t === "collect" || ev.t === "return") && o.kind && o.kind !== ev.kind) return false;
  if (ev.t === "visit" && o.poi !== ev.poi) return false;
  return true;
}

function amount(ev: QEvent) {
  switch (ev.t) {
    case "earn":
      return ev.amount;
    case "walk":
      return ev.px;
    case "streak":
      return ev.n;
    case "session":
      return ev.earned;
    default:
      return 1;
  }
}

/** Apply a game event to every active quest. Max-style objectives (streak, session) keep the best value; the rest add up. */
export function applyEvent(st: QuestState, ev: QEvent) {
  const status = { ...st.status };
  const prog = { ...st.prog };
  const finished: string[] = [];
  for (const q of QUESTS) {
    if (status[q.id] !== "active") continue;
    const cur = (prog[q.id] ?? q.objectives.map(() => 0)).slice();
    q.objectives.forEach((o, i) => {
      if (!matches(o, ev)) return;
      const a = amount(ev);
      cur[i] = ev.t === "streak" || ev.t === "session" ? Math.max(cur[i], a) : cur[i] + a;
      cur[i] = Math.min(cur[i], o.target);
    });
    prog[q.id] = cur;
    if (q.objectives.every((o, i) => cur[i] >= o.target)) {
      status[q.id] = "ready";
      finished.push(q.id);
    }
  }
  return { state: { status, prog }, finished };
}

export function claimQuest(st: QuestState, id: string) {
  const q = questById(id);
  if (!q || st.status[id] !== "ready") return null;
  return { state: { ...st, status: { ...st.status, [id]: "done" as QStatus } }, reward: q.reward, quest: q };
}

export type Talk = { kind: "claim"; quest: Quest } | { kind: "offer"; quest: Quest } | { kind: "chat"; line: string };
const CHATTER: Record<string, string[]> = {
  bela: ["Back in my day a bottle paid for a whole ice cream.", "Mind the cars on the main road."],
  marta: ["Lovely weather for a walk, dear.", "Don't forget to wipe the sticky ones!"],
  gyuri: ["I'm turning rubbish into art, you know.", "Shh, the pigeons are listening."],
  zsofi: ["I wanna be a recycling scientist!", "Dogs are the best collectors."],
  erzsi: ["Fresh kifli at the kiosk!", "A calm queue is a happy queue."],
  karcsi: ["I know every shortcut in this town.", "Vroom vroom — beep beep!"],
  mayor: ["This town is looking great.", "Elections soon, you know."],
};
export function talkTo(st: QuestState, npc: string, rng: () => number = Math.random): Talk {
  const ready = QUESTS.find((q) => q.giver === npc && st.status[q.id] === "ready");
  if (ready) return { kind: "claim", quest: ready };
  const avail = QUESTS.filter((q) => q.giver === npc && isAvailable(q, st)).sort((a, b) => Number(b.main) - Number(a.main))[0];
  if (avail) return { kind: "offer", quest: avail };
  const lines = CHATTER[npc] ?? ["Hello there!"];
  return { kind: "chat", line: lines[Math.floor(rng() * lines.length)] };
}

/** Quest-giver markers: "!" available, "?" ready to claim. */
export function markerFor(st: QuestState, npc: string): "!" | "?" | "" {
  if (QUESTS.some((q) => q.giver === npc && st.status[q.id] === "ready")) return "?";
  if (QUESTS.some((q) => q.giver === npc && isAvailable(q, st))) return "!";
  return "";
}

export function activeQuests(st: QuestState) {
  return QUESTS.filter((q) => st.status[q.id] === "active" || st.status[q.id] === "ready");
}

export function fmtMoney(n: number) {
  return `${Math.round(n).toLocaleString("hu-HU").replace(/ /g, " ")} ${CURRENCY}`;
}
