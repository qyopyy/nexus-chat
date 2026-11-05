"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Gift, Infinity as InfinityIcon, Settings, Shield, Target, Trophy, Zap } from "lucide-react";
import { useApp } from "@/store/app";
import { useGames } from "@/store/games";
import { myRank } from "@/lib/admin";
import { cn } from "@/lib/utils";
import FlappyRace from "./FlappyRace";
import FlappySolo, { type SoloResult } from "./FlappySolo";
import BirdPreview from "./BirdPreview";
import {
  ACCESSORIES,
  BIRDS,
  DIFFICULTY_META,
  POWERUPS,
  SLOT_LABEL,
  SLOTS,
  WORLD_ENV,
  birdById,
  type AccSlot,
  type Difficulty,
  type Equipped,
  type PowerId,
} from "./catalog";
import { applyQuestEvent, questsForDay, syncQuestDay, type QuestProgress } from "./quests";

type Tab = "home" | "birds" | "store" | "fit" | "quests";
type Mode = "lobby" | "solo" | "race";
type StoreFilter = "all" | "juice" | "packs" | "boosts" | AccSlot;

type Save = {
  coins: number;
  gems: number;
  bird: string;
  unlocked: string[];
  ownedAcc: string[];
  equipped: Equipped;
  world: number;
  progress: number;
  trophies: number;
  shields: number;
  chests: number;
  lastGift: string | null;
  best: number;
  name: string;
  rank: string;
  unlimitedCoins: boolean;
  difficulty: Difficulty;
  powerups: Record<PowerId, number>;
  armedPower: PowerId | null;
  questDay: string | null;
  quests: QuestProgress[];
  stats: {
    flights: number;
    pipes: number;
    races: number;
    wins: number;
    coinsEarned: number;
    streak: number;
    lastPlay: string | null;
  };
};

const WORLDS = ["Green Meadow", "Sunset Peaks", "Neon City", "Frozen Lake", "Volcano Rim"];
const RANKS = ["Rookie", "Flyer", "Ace", "Champion", "Legend"];
const KEY = "nexus:flappyHappy:v3";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyStats(): Save["stats"] {
  return { flights: 0, pipes: 0, races: 0, wins: 0, coinsEarned: 0, streak: 0, lastPlay: null };
}

function loadSave(displayName: string): Save {
  const day = today();
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem("nexus:flappyHappy:v2");
    if (raw) {
      const s = JSON.parse(raw) as Partial<Save> & { powerups?: Partial<Record<PowerId, number>> };
      const synced = syncQuestDay(day, s.quests, s.questDay);
      return {
        coins: s.coins ?? 0,
        gems: s.gems ?? 0,
        bird: s.bird ?? "classic",
        unlocked: s.unlocked?.length ? s.unlocked : ["classic"],
        ownedAcc: s.ownedAcc ?? [],
        equipped: s.equipped ?? {},
        world: s.world ?? 1,
        progress: s.progress ?? 0,
        trophies: s.trophies ?? 0,
        shields: s.shields ?? 2,
        chests: s.chests ?? 0,
        lastGift: s.lastGift ?? null,
        best: s.best ?? 0,
        name: s.name || displayName.slice(0, 12).toUpperCase() || "FLAPPER",
        rank: s.rank ?? "Rookie",
        unlimitedCoins: !!s.unlimitedCoins,
        difficulty: s.difficulty === "easy" || s.difficulty === "hard" ? s.difficulty : "normal",
        powerups: {
          slow: s.powerups?.slow ?? 0,
          double: s.powerups?.double ?? 0,
          magnet: s.powerups?.magnet ?? 0,
        },
        armedPower: s.armedPower ?? null,
        questDay: synced.day,
        quests: synced.quests,
        stats: { ...emptyStats(), ...(s.stats ?? {}) },
      };
    }
  } catch {
    /* private mode */
  }
  const synced = syncQuestDay(day, undefined, null);
  return {
    coins: 25,
    gems: 3,
    bird: "classic",
    unlocked: ["classic"],
    ownedAcc: [],
    equipped: {},
    world: 1,
    progress: 0,
    trophies: 0,
    shields: 2,
    chests: 0,
    lastGift: null,
    best: 0,
    name: displayName.slice(0, 12).toUpperCase() || "FLAPPER",
    rank: "Rookie",
    unlimitedCoins: false,
    difficulty: "normal",
    powerups: { slow: 0, double: 0, magnet: 0 },
    armedPower: null,
    questDay: synced.day,
    quests: synced.quests,
    stats: emptyStats(),
  };
}

function persist(s: Save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export default function FlappyHappy({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const me = useApp((s) => s.userId);
  const displayName = useApp((s) => s.profiles[s.userId ?? ""]?.display_name ?? "Flapper");
  const joinCode = useGames((s) => s.joinCode);
  const joinFor = useGames((s) => s.joinGame);
  const isAdmin = myRank() >= 3;
  const [mode, setMode] = useState<Mode>(() => (joinCode && joinFor === "flappy" ? "race" : "lobby"));
  const [tab, setTab] = useState<Tab>("home");
  const [storeFilter, setStoreFilter] = useState<StoreFilter>("all");
  const [save, setSave] = useState<Save>(() => loadSave(displayName));
  const [toast, setToast] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adminAmt, setAdminAmt] = useState("10000");
  const [practice, setPractice] = useState(false);

  useEffect(() => {
    if (joinCode && joinFor === "flappy") setMode("race");
  }, [joinCode, joinFor]);

  useEffect(() => persist(save), [save]);

  useEffect(() => {
    const day = today();
    if (save.questDay === day) return;
    const synced = syncQuestDay(day, undefined, null);
    setSave((s) => ({ ...s, questDay: synced.day, quests: synced.quests }));
  }, [save.questDay]);

  const bird = useMemo(() => birdById(save.bird), [save.bird]);
  const giftReady = save.lastGift !== today();
  const worldName = WORLDS[Math.min(WORLDS.length, save.world) - 1] ?? WORLDS[0];
  const worldCap = 25;
  const worldEnv = WORLD_ENV[Math.min(WORLD_ENV.length, save.world) - 1] ?? "classic";
  const questDefs = useMemo(() => questsForDay(save.questDay ?? today()), [save.questDay]);
  const questDoneCount = save.quests.filter((q) => {
    const def = questDefs.find((d) => d.id === q.id);
    return def && (q.claimed || q.progress >= def.target);
  }).length;

  const bump = (patch: Partial<Save>, msg?: string) => {
    setSave((s) => {
      const next = { ...s, ...patch };
      persist(next);
      return next;
    });
    if (msg) {
      setToast(msg);
      setTimeout(() => setToast(null), 2200);
    }
  };

  const canAfford = (cost: number) => save.unlimitedCoins || save.coins >= cost;
  const spend = (cost: number) => (save.unlimitedCoins ? 0 : cost);

  const claimGift = () => {
    if (!giftReady) return;
    const coins = 35 + Math.floor(Math.random() * 40);
    const gems = Math.random() > 0.55 ? 1 : 0;
    bump({ coins: save.coins + coins, gems: save.gems + gems, lastGift: today(), shields: Math.min(2, save.shields + 1) }, `Daily gift · +${coins} coins${gems ? ` · +${gems} gem` : ""}`);
  };

  const openChest = () => {
    if (save.chests <= 0) return;
    const coins = 50 + Math.floor(Math.random() * 80);
    const gems = 1 + Math.floor(Math.random() * 2);
    const juicePool = ACCESSORIES.filter((a) => a.juice && !save.ownedAcc.includes(a.id));
    const prize = juicePool.length && Math.random() > 0.55 ? juicePool[Math.floor(Math.random() * juicePool.length)] : null;
    bump(
      {
        chests: save.chests - 1,
        coins: save.coins + coins,
        gems: save.gems + gems,
        ownedAcc: prize ? [...save.ownedAcc, prize.id] : save.ownedAcc,
      },
      prize ? `Chest · +${coins} · unlocked ${prize.name}!` : `Chest opened · +${coins} coins · +${gems} gems`,
    );
  };

  const buyBird = (id: string, cost: number) => {
    if (save.unlocked.includes(id)) {
      bump({ bird: id });
      return;
    }
    if (!canAfford(cost)) {
      setToast("Not enough coins");
      setTimeout(() => setToast(null), 1800);
      return;
    }
    bump({ coins: save.coins - spend(cost), unlocked: [...save.unlocked, id], bird: id }, `Unlocked ${BIRDS.find((b) => b.id === id)?.name ?? "bird"}`);
  };

  const buyAcc = (id: string) => {
    const a = ACCESSORIES.find((x) => x.id === id);
    if (!a) return;
    if (save.ownedAcc.includes(id)) {
      bump({ equipped: { ...save.equipped, [a.slot]: save.equipped[a.slot] === id ? null : id } });
      return;
    }
    if (!canAfford(a.cost)) {
      setToast("Not enough coins — play races or ask an admin");
      setTimeout(() => setToast(null), 2000);
      return;
    }
    bump(
      {
        coins: save.coins - spend(a.cost),
        ownedAcc: [...save.ownedAcc, id],
        equipped: { ...save.equipped, [a.slot]: id },
      },
      `Bought ${a.name}`,
    );
  };

  const buyPower = (id: PowerId) => {
    const p = POWERUPS.find((x) => x.id === id);
    if (!p) return;
    if (!canAfford(p.cost)) {
      setToast("Not enough coins");
      setTimeout(() => setToast(null), 1800);
      return;
    }
    bump(
      {
        coins: save.coins - spend(p.cost),
        powerups: { ...save.powerups, [id]: save.powerups[id] + 1 },
      },
      `+1 ${p.name}`,
    );
  };

  const armPower = (id: PowerId | null) => {
    if (id && save.powerups[id] <= 0) {
      setToast("Buy this boost in Store first");
      setTimeout(() => setToast(null), 1800);
      return;
    }
    bump({ armedPower: save.armedPower === id ? null : id }, id ? `${POWERUPS.find((p) => p.id === id)?.name} armed` : "Boost cleared");
  };

  const unequipSlot = (slot: AccSlot) => bump({ equipped: { ...save.equipped, [slot]: null } });

  const claimQuest = (id: string) => {
    const def = questDefs.find((d) => d.id === id);
    const q = save.quests.find((x) => x.id === id);
    if (!def || !q || q.claimed || q.progress < def.target) return;
    bump(
      {
        coins: save.coins + def.rewardCoins,
        gems: save.gems + def.rewardGems,
        quests: save.quests.map((x) => (x.id === id ? { ...x, claimed: true } : x)),
      },
      `Quest · +${def.rewardCoins} coins${def.rewardGems ? ` · +${def.rewardGems} gem` : ""}`,
    );
  };

  const startSolo = (asPractice: boolean) => {
    if (!asPractice && save.shields <= 0 && !save.unlimitedCoins) {
      setToast("No shields left — claim your daily gift or practice");
      setTimeout(() => setToast(null), 2200);
      return;
    }
    setPractice(asPractice);
    setMode("solo");
  };

  const onSoloResult = (result: SoloResult) => {
    const { score, coins, practice: wasPractice } = result;
    setSave((s) => {
      const day = today();
      const streak = s.stats.lastPlay === day ? s.stats.streak : s.stats.lastPlay && dayDiff(s.stats.lastPlay, day) === 1 ? s.stats.streak + 1 : 1;
      let progress = s.progress;
      let world = s.world;
      let shields = s.shields;
      let armedPower = s.armedPower;
      let powerups = { ...s.powerups };
      // Engine already applies difficulty / double-coin multipliers
      const coinGain = wasPractice ? Math.floor(coins * 0.35) : coins;

      if (!wasPractice) {
        progress = Math.min(worldCap, s.progress + Math.min(5, Math.floor(score / 3) + 1));
        if (progress >= worldCap && world < WORLDS.length) {
          world += 1;
          progress = 0;
        }
        shields = Math.max(0, s.shields - (score < 3 ? 1 : 0));
        if (s.armedPower && powerups[s.armedPower] > 0) {
          powerups[s.armedPower] -= 1;
          armedPower = null;
        }
      }

      const defs = questsForDay(s.questDay ?? day);
      let quests = applyQuestEvent(s.quests, defs, { kind: "score", amount: score, bestScore: score });
      quests = applyQuestEvent(quests, defs, { kind: "flights", amount: 1 });
      quests = applyQuestEvent(quests, defs, { kind: "pipes", amount: score });
      quests = applyQuestEvent(quests, defs, { kind: "coins", amount: coinGain });

      const next: Save = {
        ...s,
        best: Math.max(s.best, score),
        coins: s.coins + coinGain,
        progress,
        world,
        trophies: Math.min(10, s.trophies + (!wasPractice && score >= 10 ? 1 : 0)),
        rank: RANKS[Math.min(RANKS.length - 1, Math.floor(Math.max(s.best, score) / 25))],
        shields,
        powerups,
        armedPower,
        quests,
        stats: {
          ...s.stats,
          flights: s.stats.flights + 1,
          pipes: s.stats.pipes + score,
          coinsEarned: s.stats.coinsEarned + coinGain,
          streak,
          lastPlay: day,
        },
      };
      persist(next);
      return next;
    });
    setMode("lobby");
    setToast(wasPractice ? `Practice · scored ${score}` : `Flight over · +coins`);
    setTimeout(() => setToast(null), 2000);
  };

  const onRaceFinish = (place: number, score: number) => {
    const rewardChests = place > 0 && place <= 3 ? 1 : 0;
    setSave((s) => {
      const day = today();
      const defs = questsForDay(s.questDay ?? day);
      let quests = applyQuestEvent(s.quests, defs, { kind: "race", amount: 1 });
      quests = applyQuestEvent(quests, defs, { kind: "score", amount: score, bestScore: score });
      quests = applyQuestEvent(quests, defs, { kind: "pipes", amount: score });
      const coinGain = score * 2 + (place === 1 ? 40 : place === 2 ? 25 : place === 3 ? 15 : 5);
      const next: Save = {
        ...s,
        best: Math.max(s.best, score),
        coins: s.coins + coinGain,
        gems: s.gems + (place === 1 ? 2 : place <= 3 ? 1 : 0),
        chests: s.chests + rewardChests,
        trophies: Math.min(10, s.trophies + (place > 0 && place <= 3 ? 1 : 0)),
        quests,
        stats: {
          ...s.stats,
          races: s.stats.races + 1,
          wins: s.stats.wins + (place === 1 ? 1 : 0),
          pipes: s.stats.pipes + score,
          coinsEarned: s.stats.coinsEarned + coinGain,
          lastPlay: day,
          streak: s.stats.lastPlay === day ? s.stats.streak : s.stats.lastPlay && dayDiff(s.stats.lastPlay, day) === 1 ? s.stats.streak + 1 : 1,
        },
      };
      persist(next);
      return next;
    });
    setToast(place > 0 && place <= 3 ? `Top ${place}! Chest earned` : `Race over · #${place || "—"}`);
    setTimeout(() => setToast(null), 2200);
  };

  const adminGrant = (n: number) => {
    if (!isAdmin) return;
    bump({ coins: save.coins + n }, `Admin · +${n.toLocaleString()} coins`);
  };

  const storeItems = useMemo(() => {
    if (storeFilter === "packs" || storeFilter === "boosts") return [];
    if (storeFilter === "juice") return ACCESSORIES.filter((a) => a.juice);
    if (storeFilter === "all") return ACCESSORIES;
    return ACCESSORIES.filter((a) => a.slot === storeFilter);
  }, [storeFilter]);

  if (mode === "solo") {
    return (
      <FlappySolo
        birdId={save.bird}
        equipped={save.equipped}
        env={worldEnv}
        difficulty={save.difficulty}
        power={practice ? null : save.armedPower}
        practice={practice}
        onBack={() => setMode("lobby")}
        onResult={onSoloResult}
        mobile={mobile}
      />
    );
  }
  if (mode === "race") {
    return <FlappyRace birdId={save.bird} onBack={() => setMode("lobby")} onFinish={onRaceFinish} mobile={mobile} />;
  }

  const questReady = save.quests.some((q) => !q.claimed && questDefs.find((d) => d.id === q.id && q.progress >= d.target));

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden text-slate-100" style={{ background: "linear-gradient(180deg,#0b1220 0%,#111827 42%,#0f172a 100%)" }}>
      <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: "radial-gradient(ellipse at 50% 0%,rgba(56,189,248,0.18),transparent 55%)" }} />

      <header className={cn("relative z-20 flex shrink-0 items-center gap-2 border-b border-white/5 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        <button onClick={onBack} className="grid size-9 place-items-center rounded-full hover:bg-white/5" aria-label="Back to games">
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold tracking-wide">Flappy Happy</div>
        </div>
        <div className="flex items-center gap-1.5">
          <Currency icon="🪙" value={save.unlimitedCoins ? null : save.coins} unlimited={save.unlimitedCoins} />
          <Currency icon="◇" value={save.gems} />
        </div>
        {isAdmin && (
          <button onClick={() => setSettingsOpen(true)} className="rounded-full bg-amber-400/90 px-2 py-1 text-[10px] font-bold text-black uppercase">
            Admin
          </button>
        )}
        <button onClick={() => setSettingsOpen((v) => !v)} className="grid size-9 place-items-center rounded-full hover:bg-white/5" aria-label="Settings">
          <Settings className="size-4 text-slate-300" />
        </button>
      </header>

      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 pb-24">
        <div className="mx-auto flex max-w-md flex-col gap-4">
          {tab === "home" && (
            <>
              <div className="pt-4 text-center">
                <div className="text-[10px] font-semibold tracking-[0.22em] text-cyan-300/80 uppercase">Nexus arcade</div>
                <h1 className="mt-1 bg-gradient-to-r from-cyan-300 via-sky-200 to-indigo-300 bg-clip-text text-5xl font-black tracking-tight text-transparent">FLAPPY</h1>
                <h2 className="bg-gradient-to-r from-amber-300 via-yellow-300 to-orange-400 bg-clip-text text-4xl font-black tracking-wider text-transparent">HAPPY</h2>
                <p className="mt-2 text-xs text-slate-400">
                  Best {save.best} · {worldName} · {save.rank}
                </p>
              </div>

              <div className="flex flex-col items-center py-2">
                <BirdPreview birdId={save.bird} equipped={save.equipped} size="lg" />
                <div className="mt-3 text-sm font-semibold tracking-wide text-amber-300">{bird.name}</div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => setTab("birds")} className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10">
                    Character
                  </button>
                  <button onClick={() => setTab("fit")} className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10">
                    Style
                  </button>
                </div>
              </div>

              <div className="mx-auto w-full max-w-sm space-y-2">
                <button
                  onClick={() => startSolo(false)}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 py-4 text-lg font-black tracking-wider text-white uppercase shadow-[0_10px_30px_rgba(16,185,129,0.35)] active:scale-[0.99]"
                >
                  Start flying
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setMode("race")} className="rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10">
                    Race friends
                  </button>
                  <button onClick={() => startSolo(true)} className="rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10">
                    Practice
                  </button>
                </div>
              </div>

              <div className="mx-auto grid w-full max-w-sm grid-cols-3 gap-2">
                {(Object.keys(DIFFICULTY_META) as Difficulty[]).map((id) => (
                  <button
                    key={id}
                    onClick={() => bump({ difficulty: id })}
                    className={cn(
                      "rounded-xl border px-2 py-2 text-center text-xs font-semibold",
                      save.difficulty === id ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-200" : "border-white/10 bg-white/[0.03] text-slate-400",
                    )}
                  >
                    {DIFFICULTY_META[id].label}
                  </button>
                ))}
              </div>

              <div className="mx-auto flex w-full max-w-sm flex-wrap items-center justify-center gap-1.5">
                <span className="mr-1 text-[10px] font-semibold tracking-wide text-slate-500 uppercase">Boost</span>
                <button onClick={() => armPower(null)} className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", !save.armedPower ? "bg-amber-300 text-black" : "bg-white/5 text-slate-400")}>
                  Off
                </button>
                {POWERUPS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => armPower(p.id)}
                    className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", save.armedPower === p.id ? "bg-amber-300 text-black" : "bg-white/5 text-slate-400")}
                  >
                    {p.name} · {save.powerups[p.id]}
                  </button>
                ))}
              </div>

              <div className="mx-auto grid w-full max-w-sm grid-cols-3 gap-2">
                <button onClick={claimGift} disabled={!giftReady} className={cn("rounded-xl border border-white/10 bg-white/[0.03] px-2 py-3 text-center", !giftReady && "opacity-40")}>
                  <Gift className="mx-auto size-4 text-rose-300" />
                  <div className="mt-1 text-[11px] font-semibold">{giftReady ? "Daily gift" : "Claimed"}</div>
                </button>
                <button onClick={() => setTab("quests")} className="relative rounded-xl border border-white/10 bg-white/[0.03] px-2 py-3 text-center">
                  <Target className="mx-auto size-4 text-cyan-300" />
                  <div className="mt-1 text-[11px] font-semibold">Quests {questDoneCount}/3</div>
                  {questReady && <span className="absolute top-2 right-2 size-1.5 rounded-full bg-rose-400" />}
                </button>
                <button onClick={() => setTab("store")} className="rounded-xl border border-white/10 bg-white/[0.03] px-2 py-3 text-center">
                  <Zap className="mx-auto size-4 text-amber-300" />
                  <div className="mt-1 text-[11px] font-semibold">Store</div>
                </button>
              </div>

              {(save.chests > 0 || save.stats.flights > 0) && (
                <div className="mx-auto w-full max-w-sm space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-300">
                      <Trophy className="size-3.5 text-amber-300" /> Chests
                    </span>
                    <span>
                      Shields {save.shields}/2 · Progress {save.progress}/{worldCap}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[0, 1, 2, 3].map((i) => {
                      const filled = i < save.chests;
                      return (
                        <button
                          key={i}
                          disabled={!filled}
                          onClick={openChest}
                          className={cn(
                            "rounded-xl border py-3 text-center text-[10px] font-semibold",
                            filled ? "border-amber-300/40 bg-amber-300/10 text-amber-200" : "border-white/5 bg-black/20 text-slate-600",
                          )}
                        >
                          {filled ? "Open" : "—"}
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center text-[11px] text-slate-400">
                    <Stat label="Flights" value={save.stats.flights} />
                    <Stat label="Pipes" value={save.stats.pipes} />
                    <Stat label="Races" value={save.stats.races} />
                    <Stat label="Wins" value={save.stats.wins} />
                  </div>
                </div>
              )}
            </>
          )}

          {tab !== "home" && (
            <div className="pt-3">
              <h2 className="text-lg font-semibold tracking-wide capitalize">{tab === "birds" ? "Characters" : tab === "fit" ? "Style" : tab}</h2>
              <p className="mt-0.5 text-xs text-slate-400">
                {tab === "quests" && "Daily challenges refresh at midnight UTC."}
                {tab === "birds" && "Pick a bird for solo flights and races."}
                {tab === "fit" && "Equip owned accessories."}
                {tab === "store" && "Spend coins and gems on gear and boosts."}
              </p>
            </div>
          )}

          {tab === "quests" && (
            <div className="space-y-2">
              {questDefs.map((def) => {
                const q = save.quests.find((x) => x.id === def.id) ?? { id: def.id, progress: 0, claimed: false };
                const pct = Math.min(100, (q.progress / def.target) * 100);
                const ready = !q.claimed && q.progress >= def.target;
                return (
                  <div key={def.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{def.title}</div>
                        <div className="text-xs text-slate-400">{def.desc}</div>
                      </div>
                      <div className="text-right text-[11px] font-semibold text-amber-300">
                        +{def.rewardCoins}{def.rewardGems ? ` · +${def.rewardGems}◇` : ""}
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-cyan-400" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs font-semibold">
                      <span className="text-slate-400">
                        {Math.min(q.progress, def.target)}/{def.target}
                      </span>
                      {q.claimed ? (
                        <span className="text-slate-500">Claimed</span>
                      ) : (
                        <button disabled={!ready} onClick={() => claimQuest(def.id)} className={cn("rounded-full px-3 py-1", ready ? "bg-amber-300 text-black" : "bg-white/5 text-slate-500")}>
                          Claim
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === "birds" && (
            <div className="grid grid-cols-2 gap-2">
              {BIRDS.map((b) => {
                const owned = save.unlocked.includes(b.id);
                const selected = save.bird === b.id;
                return (
                  <button
                    key={b.id}
                    onClick={() => buyBird(b.id, b.cost)}
                    className={cn(
                      "rounded-2xl border p-3 text-left transition",
                      selected ? "border-amber-300/50 bg-amber-300/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]",
                    )}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <div className="grid size-11 place-items-center rounded-full" style={{ background: b.color }}>
                        <span className="text-lg">◆</span>
                      </div>
                      {b.tag && <span className="rounded-full bg-violet-500/30 px-2 py-0.5 text-[10px] font-semibold text-violet-200">{b.tag}</span>}
                    </div>
                    <div className="text-sm font-semibold">{b.name}</div>
                    <div className="text-[11px] text-slate-400">{owned ? (selected ? "Selected" : "Owned") : `${b.cost} coins`}</div>
                  </button>
                );
              })}
            </div>
          )}

          {tab === "fit" && (
            <div className="space-y-3">
              <div className="flex flex-col items-center rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <BirdPreview birdId={save.bird} equipped={save.equipped} size="lg" />
                <p className="mt-2 text-center text-xs text-slate-400">Equip gear you own. Buy more in the Store.</p>
              </div>
              {SLOTS.map((slot) => (
                <div key={slot}>
                  <div className="mb-1.5 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">{SLOT_LABEL[slot]}</div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    <button
                      onClick={() => unequipSlot(slot)}
                      className={cn("flex shrink-0 flex-col items-center rounded-xl border px-3 py-2", !save.equipped[slot] ? "border-amber-300/50 bg-amber-300/10" : "border-white/10 bg-white/[0.03]")}
                    >
                      <span className="text-sm font-semibold text-slate-400">None</span>
                    </button>
                    {ACCESSORIES.filter((a) => a.slot === slot && save.ownedAcc.includes(a.id)).map((a) => (
                      <button
                        key={a.id}
                        onClick={() => bump({ equipped: { ...save.equipped, [slot]: a.id } })}
                        className={cn("flex shrink-0 flex-col items-center rounded-xl border px-3 py-2", save.equipped[slot] === a.id ? "border-amber-300/50 bg-amber-300/10" : "border-white/10 bg-white/[0.03]")}
                      >
                        <span className="text-lg">{a.emoji}</span>
                        <span className="max-w-[4.5rem] truncate text-[10px] font-semibold">{a.name}</span>
                      </button>
                    ))}
                    {!ACCESSORIES.some((a) => a.slot === slot && save.ownedAcc.includes(a.id)) && <span className="self-center text-xs text-slate-500">Nothing owned yet</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "store" && (
            <div className="space-y-3">
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {(
                  [
                    ["all", "All"],
                    ["juice", "999"],
                    ["boosts", "Boosts"],
                    ["hat", "Hats"],
                    ["face", "Face"],
                    ["neck", "Neck"],
                    ["back", "Back"],
                    ["trail", "Trails"],
                    ["packs", "Packs"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setStoreFilter(id)}
                    className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold", storeFilter === id ? "bg-amber-300 text-black" : "bg-white/5 text-slate-300")}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {storeFilter === "boosts" ? (
                <div className="space-y-2">
                  {POWERUPS.map((p) => (
                    <button key={p.id} onClick={() => buyPower(p.id)} className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left">
                      <span className="text-2xl">{p.emoji}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{p.name}</span>
                        <span className="block text-xs text-slate-400">{p.blurb}</span>
                        <span className="mt-1 block text-[11px] text-slate-500">Owned · {save.powerups[p.id]}</span>
                      </span>
                      <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">{p.cost}</span>
                    </button>
                  ))}
                </div>
              ) : storeFilter === "packs" ? (
                <div className="space-y-2">
                  {[
                    {
                      title: "Coin pouch",
                      desc: "+100 coins",
                      cost: "1 gem",
                      apply: () => {
                        if (save.gems < 1) return setToast("Need 1 gem");
                        bump({ gems: save.gems - 1, coins: save.coins + 100 }, "+100 coins");
                      },
                    },
                    {
                      title: "Shield refill",
                      desc: "Restore shields to 2",
                      cost: "2 gems",
                      apply: () => {
                        if (save.gems < 2) return setToast("Need 2 gems");
                        bump({ gems: save.gems - 2, shields: 2 }, "Shields refilled");
                      },
                    },
                    {
                      title: "Boost bundle",
                      desc: "+1 Slow-mo · +1 Double · +1 Magnet",
                      cost: "3 gems",
                      apply: () => {
                        if (save.gems < 3) return setToast("Need 3 gems");
                        bump(
                          {
                            gems: save.gems - 3,
                            powerups: {
                              slow: save.powerups.slow + 1,
                              double: save.powerups.double + 1,
                              magnet: save.powerups.magnet + 1,
                            },
                          },
                          "Boost bundle claimed",
                        );
                      },
                    },
                    {
                      title: "999 Starter",
                      desc: "+150 coins · Moonlight Shades · Heartless Chain",
                      cost: "Free once",
                      apply: () => {
                        if (localStorage.getItem("nexus:flappy:juiceStarter")) {
                          setToast("999 starter already claimed");
                          setTimeout(() => setToast(null), 1800);
                          return;
                        }
                        localStorage.setItem("nexus:flappy:juiceStarter", "1");
                        const add = ["jw-shades", "jw-chain"].filter((id) => !save.ownedAcc.includes(id));
                        bump(
                          {
                            coins: save.coins + 150,
                            ownedAcc: [...save.ownedAcc, ...add],
                            equipped: { ...save.equipped, face: save.equipped.face ?? "jw-shades", neck: save.equipped.neck ?? "jw-chain" },
                          },
                          "999 starter claimed",
                        );
                      },
                    },
                    {
                      title: "Starter pack",
                      desc: "+80 coins · +2 gems · 1 chest",
                      cost: "Free once",
                      apply: () => {
                        if (localStorage.getItem("nexus:flappy:starter")) {
                          setToast("Starter pack already claimed");
                          setTimeout(() => setToast(null), 1800);
                          return;
                        }
                        localStorage.setItem("nexus:flappy:starter", "1");
                        bump({ coins: save.coins + 80, gems: save.gems + 2, chests: save.chests + 1 }, "Starter pack claimed");
                      },
                    },
                  ].map((item) => (
                    <button key={item.title} onClick={item.apply} className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left">
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{item.title}</span>
                        <span className="block text-xs text-slate-400">{item.desc}</span>
                      </span>
                      <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">{item.cost}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {storeItems.map((a) => {
                    const owned = save.ownedAcc.includes(a.id);
                    const on = save.equipped[a.slot] === a.id;
                    return (
                      <button
                        key={a.id}
                        onClick={() => buyAcc(a.id)}
                        className={cn(
                          "rounded-2xl border p-3 text-left",
                          on ? "border-amber-300/50 bg-amber-300/10" : owned ? "border-white/15 bg-white/[0.04]" : "border-white/10 bg-white/[0.03]",
                        )}
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-2xl">{a.emoji}</span>
                          {a.juice && <span className="rounded-full bg-violet-500/25 px-1.5 py-0.5 text-[9px] font-semibold text-violet-200">999</span>}
                        </div>
                        <div className="text-sm font-semibold leading-tight">{a.name}</div>
                        <div className="mt-0.5 text-[10px] text-slate-400">{a.blurb}</div>
                        <div className="mt-1.5 text-[11px] font-semibold text-amber-300">{owned ? (on ? "Equipped" : "Owned") : `${a.cost} coins`}</div>
                      </button>
                    );
                  })}
                </div>
              )}
              {!me && <p className="text-xs text-slate-400">Sign in on Nexus to invite friends to multiplayer races.</p>}
            </div>
          )}
        </div>
      </div>

      <nav className="absolute inset-x-0 bottom-0 z-20 flex items-stretch justify-around border-t border-white/5 bg-[#0b1220]/95 px-1 pt-1.5 pb-[max(0.4rem,env(safe-area-inset-bottom))] backdrop-blur-md">
        {(
          [
            ["home", "Home"],
            ["birds", "Birds"],
            ["fit", "Style"],
            ["store", "Store"],
            ["quests", "Quests"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={cn("relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold", tab === id ? "text-amber-300" : "text-slate-500")}>
            {label}
            {id === "home" && save.chests > 0 && <span className="absolute top-1.5 right-[28%] size-1.5 rounded-full bg-rose-400" />}
            {id === "quests" && questReady && <span className="absolute top-1.5 right-[28%] size-1.5 rounded-full bg-rose-400" />}
          </button>
        ))}
      </nav>

      {settingsOpen && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-black/60 p-6 backdrop-blur-sm" onClick={() => setSettingsOpen(false)}>
          <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-white/10 bg-[#0b1220] p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-sm font-semibold tracking-wide">Settings</div>
            <label className="mb-3 block text-xs text-slate-400">
              Display name
              <input
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/40"
                value={save.name}
                maxLength={12}
                onChange={(e) => bump({ name: e.target.value.toUpperCase() })}
              />
            </label>

            <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-300">
              <div className="mb-2 text-[10px] font-semibold tracking-wide text-slate-500 uppercase">Career</div>
              <div className="grid grid-cols-2 gap-2">
                <div>Flights · {save.stats.flights}</div>
                <div>Pipes · {save.stats.pipes}</div>
                <div>Races · {save.stats.races}</div>
                <div>Wins · {save.stats.wins}</div>
                <div>Coins earned · {save.stats.coinsEarned}</div>
                <div>Streak · {save.stats.streak}d</div>
              </div>
            </div>

            {isAdmin && (
              <div className="mb-4 rounded-2xl border border-amber-300/30 bg-amber-300/5 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-300">
                  <Shield className="size-4" /> Admin
                </div>
                <p className="mb-3 text-xs text-slate-400">Staff only. Grant coins on this device or unlock free shopping.</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => adminGrant(1_000)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold">
                    +1,000
                  </button>
                  <button onClick={() => adminGrant(10_000)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold">
                    +10,000
                  </button>
                  <button onClick={() => adminGrant(100_000)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold">
                    +100,000
                  </button>
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={adminAmt}
                    onChange={(e) => setAdminAmt(e.target.value.replace(/\D/g, "").slice(0, 9))}
                    className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none"
                    placeholder="Custom amount"
                  />
                  <button
                    onClick={() => {
                      const n = Number(adminAmt) || 0;
                      if (n > 0) adminGrant(n);
                    }}
                    className="rounded-xl bg-amber-300 px-3 font-semibold text-black"
                  >
                    Add
                  </button>
                </div>
                <button
                  onClick={() => bump({ unlimitedCoins: !save.unlimitedCoins }, save.unlimitedCoins ? "Unlimited coins off" : "Unlimited coins ON")}
                  className={cn("mt-3 flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold", save.unlimitedCoins ? "bg-cyan-400 text-black" : "border border-white/10 bg-white/5")}
                >
                  <InfinityIcon className="size-4" />
                  {save.unlimitedCoins ? "Unlimited ON — tap to disable" : "Enable unlimited coins"}
                </button>
                <button
                  onClick={() => {
                    const all = ACCESSORIES.map((a) => a.id);
                    bump(
                      {
                        ownedAcc: Array.from(new Set([...save.ownedAcc, ...all])),
                        unlocked: BIRDS.map((b) => b.id),
                        powerups: { slow: 99, double: 99, magnet: 99 },
                      },
                      "Unlocked all birds, accessories & boosts",
                    );
                  }}
                  className="mt-2 w-full rounded-full border border-white/10 bg-white/5 py-2 text-xs font-semibold"
                >
                  Unlock all birds + accessories + boosts
                </button>
              </div>
            )}

            <p className="text-xs text-slate-500">Progress saves on this device. Worlds change the solo sky theme. Hard mode pays more coins.</p>
            <button onClick={() => setSettingsOpen(false)} className="mt-4 w-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 py-2.5 font-semibold text-white">
              Done
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-50 flex justify-center px-4">
          <div className="rounded-full bg-black/80 px-4 py-2 text-sm font-semibold shadow-lg">{toast}</div>
        </div>
      )}
    </div>
  );
}

function dayDiff(a: string, b: string) {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.round(ms / 86400000);
}

function Currency({ icon, value, unlimited }: { icon: string; value: number | null; unlimited?: boolean }) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs font-semibold tabular-nums text-slate-200">
      <span className="text-amber-300">{icon}</span>
      {unlimited ? "∞" : value}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-sm font-semibold tabular-nums text-slate-200">{value}</div>
      <div className="text-[10px] tracking-wide text-slate-500 uppercase">{label}</div>
    </div>
  );
}
