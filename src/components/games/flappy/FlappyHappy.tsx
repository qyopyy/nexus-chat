"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Gift, Infinity as InfinityIcon, RefreshCw, Settings, Shield, Trophy, Users } from "lucide-react";
import { useApp } from "@/store/app";
import { useGames } from "@/store/games";
import { myRank } from "@/lib/admin";
import { cn } from "@/lib/utils";
import FlappyRace from "./FlappyRace";
import FlappySolo from "./FlappySolo";
import BirdPreview from "./BirdPreview";
import { ACCESSORIES, BIRDS, SLOT_LABEL, SLOTS, birdById, type AccSlot, type Equipped } from "./catalog";

type Tab = "home" | "birds" | "store" | "fit";
type Mode = "lobby" | "solo" | "race";
type StoreFilter = "all" | "juice" | "packs" | AccSlot;

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
  /** admins can toggle — purchases never deduct coins */
  unlimitedCoins: boolean;
};

const WORLDS = ["Green Meadow", "Sunset Peaks", "Neon City", "Frozen Lake", "Volcano Rim"];
const RANKS = ["Rookie", "Flyer", "Ace", "Champion", "Legend"];
const KEY = "nexus:flappyHappy:v2";

function loadSave(displayName: string): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Save>;
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
      };
    }
  } catch {
    /* private mode */
  }
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
  };
}

function persist(s: Save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
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

  useEffect(() => {
    if (joinCode && joinFor === "flappy") setMode("race");
  }, [joinCode, joinFor]);

  useEffect(() => persist(save), [save]);

  const bird = useMemo(() => birdById(save.bird), [save.bird]);
  const giftReady = save.lastGift !== today();
  const worldName = WORLDS[Math.min(WORLDS.length, save.world) - 1] ?? WORLDS[0];
  const worldCap = 25;

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
    // chance at a free juice accessory
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

  const unequipSlot = (slot: AccSlot) => bump({ equipped: { ...save.equipped, [slot]: null } });

  const onSoloResult = (score: number, coins: number) => {
    setSave((s) => {
      const best = Math.max(s.best, score);
      let progress = Math.min(worldCap, s.progress + Math.min(5, Math.floor(score / 3) + 1));
      let world = s.world;
      if (progress >= worldCap && world < WORLDS.length) {
        world += 1;
        progress = 0;
      }
      const next: Save = {
        ...s,
        best,
        coins: s.coins + coins + score,
        progress,
        world,
        trophies: Math.min(10, s.trophies + (score >= 10 ? 1 : 0)),
        rank: RANKS[Math.min(RANKS.length - 1, Math.floor(best / 25))],
        shields: Math.max(0, s.shields - (score < 3 ? 1 : 0)),
      };
      persist(next);
      return next;
    });
    setMode("lobby");
  };

  const onRaceFinish = (place: number, score: number) => {
    const rewardChests = place > 0 && place <= 3 ? 1 : 0;
    setSave((s) => {
      const next: Save = {
        ...s,
        best: Math.max(s.best, score),
        coins: s.coins + score * 2 + (place === 1 ? 40 : place === 2 ? 25 : place === 3 ? 15 : 5),
        gems: s.gems + (place === 1 ? 2 : place <= 3 ? 1 : 0),
        chests: s.chests + rewardChests,
        trophies: Math.min(10, s.trophies + (place > 0 && place <= 3 ? 1 : 0)),
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
    if (storeFilter === "packs") return [];
    if (storeFilter === "juice") return ACCESSORIES.filter((a) => a.juice);
    if (storeFilter === "all") return ACCESSORIES;
    return ACCESSORIES.filter((a) => a.slot === storeFilter);
  }, [storeFilter]);

  if (mode === "solo") {
    return <FlappySolo birdId={save.bird} equipped={save.equipped} onBack={() => setMode("lobby")} onResult={onSoloResult} mobile={mobile} />;
  }
  if (mode === "race") {
    return <FlappyRace birdId={save.bird} onBack={() => setMode("lobby")} onFinish={onRaceFinish} mobile={mobile} />;
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden text-white" style={{ background: "linear-gradient(180deg,#7dd3fc 0%,#86efac 42%,#4ade80 70%,#15803d 100%)" }}>
      <header className={cn("relative z-20 flex shrink-0 items-center gap-2 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        <button onClick={onBack} className="grid size-9 place-items-center rounded-full bg-black/25 hover:bg-black/40" aria-label="Back to games">
          <ArrowLeft className="size-5" />
        </button>
        <span className="min-w-0 flex-1 truncate font-black tracking-wide">Flappy Happy</span>
        {isAdmin && (
          <button onClick={() => setSettingsOpen(true)} className="rounded-full bg-[#f0b232]/90 px-2.5 py-1 text-[10px] font-black tracking-wide text-black uppercase" title="Admin coins">
            Admin
          </button>
        )}
        <button onClick={() => setSettingsOpen((v) => !v)} className="grid size-9 place-items-center rounded-full bg-black/25 hover:bg-black/40" aria-label="Settings">
          <Settings className="size-4" />
        </button>
      </header>

      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto px-3 pb-24">
        <div className="mx-auto flex max-w-md flex-col gap-3">
          <div className="flex items-center gap-2 rounded-2xl bg-black/25 p-2.5 backdrop-blur-md">
            <BirdPreview birdId={save.bird} equipped={save.equipped} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-black tracking-wide">{save.name}</div>
              <div className="text-[10px] font-bold tracking-widest text-white/80 uppercase">{save.rank}</div>
            </div>
            <Currency icon="🪙" value={save.unlimitedCoins ? null : save.coins} unlimited={save.unlimitedCoins} />
            <Currency icon="⚪" value={save.gems} />
          </div>

          <div className="rounded-2xl bg-[#16a34a]/95 px-3 py-2 shadow-lg ring-1 ring-white/20">
            <div className="flex items-center gap-2 text-xs font-black tracking-wide uppercase">
              <span className="rounded bg-white/20 px-1.5 py-0.5">🌍</span>
              World {save.world}: {worldName}
              <span className="ml-auto tabular-nums">
                {save.progress}/{worldCap}
              </span>
            </div>
            <div className="mt-1.5 flex gap-3 text-[11px] font-bold text-white/90">
              <span>🛡 {save.shields}/2</span>
              <span>🏆 {save.trophies}/10</span>
              <span className="ml-auto">Best {save.best}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/25">
              <div className="h-full rounded-full bg-[#facc15]" style={{ width: `${(save.progress / worldCap) * 100}%` }} />
            </div>
          </div>

          {tab === "home" && (
            <>
              <div className="flex gap-2">
                <button onClick={claimGift} disabled={!giftReady} className={cn("flex flex-1 flex-col items-center rounded-2xl bg-black/20 px-2 py-3 backdrop-blur", !giftReady && "opacity-50")}>
                  <Gift className="size-6 text-[#ff6b6b]" />
                  <span className="mt-1 text-[10px] font-black tracking-wide">{giftReady ? "FREE" : "DONE"}</span>
                  <span className="text-[10px] font-semibold text-white/80">Daily Gift</span>
                </button>
                <button onClick={() => { setTab("store"); setStoreFilter("juice"); }} className="flex flex-1 flex-col items-center rounded-2xl bg-[#4c1d95]/80 px-2 py-3 ring-1 ring-white/20">
                  <span className="text-2xl">9️⃣</span>
                  <span className="mt-1 text-[10px] font-black tracking-wide">999</span>
                  <span className="text-[10px] font-semibold text-white/80">Juice fits</span>
                </button>
                <button onClick={() => setMode("race")} className="flex flex-1 flex-col items-center rounded-2xl bg-[#7c3aed]/85 px-2 py-3 ring-1 ring-white/30">
                  <Users className="size-6" />
                  <span className="mt-1 text-[10px] font-black tracking-wide">LIVE</span>
                  <span className="text-[10px] font-semibold">Multiplayer</span>
                </button>
              </div>

              <div className="relative mt-2 flex flex-col items-center">
                <BirdPreview birdId={save.bird} equipped={save.equipped} size="lg" />
                <div className="mt-3 text-sm font-black tracking-widest uppercase">{bird.name}</div>
                <div className="mt-1 flex flex-wrap justify-center gap-1">
                  {SLOTS.map((slot) => {
                    const id = save.equipped[slot];
                    const a = ACCESSORIES.find((x) => x.id === id);
                    return a ? (
                      <button key={slot} onClick={() => unequipSlot(slot)} className="rounded-full bg-black/35 px-2 py-0.5 text-[10px] font-bold" title="Tap to unequip">
                        {a.emoji} {a.name}
                      </button>
                    ) : null;
                  })}
                </div>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => setTab("birds")} className="flex items-center gap-1.5 rounded-full bg-black/35 px-4 py-2 text-xs font-black tracking-wide uppercase backdrop-blur hover:bg-black/50">
                    <RefreshCw className="size-3.5" /> Bird
                  </button>
                  <button onClick={() => setTab("fit")} className="flex items-center gap-1.5 rounded-full bg-black/35 px-4 py-2 text-xs font-black tracking-wide uppercase backdrop-blur hover:bg-black/50">
                    Fit
                  </button>
                </div>
                <button
                  onClick={() => {
                    if (save.shields <= 0 && !save.unlimitedCoins) {
                      setToast("No shields left — claim your daily gift");
                      setTimeout(() => setToast(null), 2200);
                      return;
                    }
                    setMode("solo");
                  }}
                  className="mt-4 w-full max-w-xs rounded-2xl bg-[#facc15] py-4 text-xl font-black tracking-widest text-black uppercase shadow-[0_8px_0_#ca8a04] active:translate-y-1 active:shadow-none"
                >
                  Play
                </button>
              </div>

              <div className="mt-2 rounded-2xl bg-white/90 p-3 text-[#0f172a] shadow-lg">
                <div className="mb-2 flex items-center gap-2 text-xs font-black tracking-wide uppercase">
                  <Trophy className="size-3.5 text-[#ca8a04]" /> Reward chests
                  <span className="ml-auto text-[10px] font-semibold text-slate-500">Win Top 3 · juice drip drops</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[0, 1, 2, 3].map((i) => {
                    const filled = i < save.chests;
                    return (
                      <button
                        key={i}
                        disabled={!filled}
                        onClick={openChest}
                        className={cn("flex aspect-square flex-col items-center justify-center rounded-xl border-2 border-dashed", filled ? "border-[#ca8a04] bg-[#fef3c7]" : "border-slate-300 bg-slate-100")}
                      >
                        <span className="text-2xl">{filled ? "📦" : "·"}</span>
                        <span className="text-[9px] font-black tracking-wide">{filled ? "OPEN" : "WIN TOP 3"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {tab === "birds" && (
            <div className="grid grid-cols-2 gap-2">
              {BIRDS.map((b) => {
                const owned = save.unlocked.includes(b.id);
                const selected = save.bird === b.id;
                return (
                  <button key={b.id} onClick={() => buyBird(b.id, b.cost)} className={cn("rounded-2xl p-3 text-left ring-2", selected ? "ring-[#facc15] bg-black/40" : "ring-white/20 bg-black/25")}>
                    <div className="mb-2 flex items-center gap-2">
                      <div className="grid size-12 place-items-center rounded-xl text-2xl" style={{ background: b.color }}>
                        🐤
                      </div>
                      {b.tag && <span className="rounded-full bg-[#7c3aed] px-2 py-0.5 text-[10px] font-black">{b.tag}</span>}
                    </div>
                    <div className="text-sm font-bold">{b.name}</div>
                    <div className="text-[11px] text-white/80">{owned ? (selected ? "Equipped" : "Owned") : `🪙 ${b.cost}`}</div>
                  </button>
                );
              })}
            </div>
          )}

          {tab === "fit" && (
            <div className="space-y-3">
              <div className="flex flex-col items-center rounded-2xl bg-black/25 p-4">
                <BirdPreview birdId={save.bird} equipped={save.equipped} size="lg" />
                <p className="mt-2 text-center text-xs text-white/75">Equip gear you own. Buy more in the Store with coins.</p>
              </div>
              {SLOTS.map((slot) => (
                <div key={slot}>
                  <div className="mb-1.5 text-xs font-black tracking-wide text-white/80 uppercase">{SLOT_LABEL[slot]}</div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    <button
                      onClick={() => unequipSlot(slot)}
                      className={cn("flex shrink-0 flex-col items-center rounded-xl px-3 py-2 ring-2", !save.equipped[slot] ? "ring-[#facc15] bg-black/40" : "ring-white/15 bg-black/20")}
                    >
                      <span className="text-xl">∅</span>
                      <span className="text-[10px] font-bold">None</span>
                    </button>
                    {ACCESSORIES.filter((a) => a.slot === slot && save.ownedAcc.includes(a.id)).map((a) => (
                      <button
                        key={a.id}
                        onClick={() => bump({ equipped: { ...save.equipped, [slot]: a.id } })}
                        className={cn("flex shrink-0 flex-col items-center rounded-xl px-3 py-2 ring-2", save.equipped[slot] === a.id ? "ring-[#facc15] bg-black/40" : "ring-white/15 bg-black/20")}
                      >
                        <span className="text-xl">{a.emoji}</span>
                        <span className="max-w-[4.5rem] truncate text-[10px] font-bold">{a.name}</span>
                      </button>
                    ))}
                    {!ACCESSORIES.some((a) => a.slot === slot && save.ownedAcc.includes(a.id)) && <span className="self-center text-xs text-white/60">Nothing owned — visit Store</span>}
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
                    ["juice", "999 Juice"],
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
                    className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-black", storeFilter === id ? "bg-[#facc15] text-black" : "bg-black/30")}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {storeFilter === "packs" ? (
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
                    <button key={item.title} onClick={item.apply} className="flex w-full items-center gap-3 rounded-2xl bg-black/30 p-3 text-left backdrop-blur">
                      <span className="text-3xl">🛒</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold">{item.title}</span>
                        <span className="block text-xs text-white/75">{item.desc}</span>
                      </span>
                      <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-black">{item.cost}</span>
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
                        className={cn("rounded-2xl p-3 text-left ring-2", on ? "ring-[#facc15] bg-black/45" : owned ? "ring-white/30 bg-black/30" : "ring-white/15 bg-black/20")}
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-3xl">{a.emoji}</span>
                          {a.juice && <span className="rounded-full bg-[#7c3aed] px-1.5 py-0.5 text-[9px] font-black">999</span>}
                        </div>
                        <div className="text-sm font-bold leading-tight">{a.name}</div>
                        <div className="mt-0.5 text-[10px] text-white/70">{a.blurb}</div>
                        <div className="mt-1.5 text-[11px] font-black text-[#facc15]">{owned ? (on ? "Equipped" : "Own · tap to wear") : `🪙 ${a.cost}`}</div>
                      </button>
                    );
                  })}
                </div>
              )}
              {!me && <p className="text-xs text-white/80">Sign in on Nexus to invite friends to multiplayer races.</p>}
            </div>
          )}
        </div>
      </div>

      <nav className="absolute inset-x-0 bottom-0 z-20 flex items-end justify-around border-t border-black/10 bg-[#0b3a1f]/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur">
        {(
          [
            ["store", "Store", "🛍️"],
            ["fit", "Fit", "👗"],
            ["home", "Home", "🏠"],
            ["birds", "Birds", "🐤"],
          ] as const
        ).map(([id, label, emoji]) => (
          <button key={id} onClick={() => setTab(id)} className={cn("relative flex flex-1 flex-col items-center gap-0.5 py-1 text-[10px] font-bold", tab === id ? "text-[#facc15]" : "text-white/70")}>
            <span className="text-xl">{emoji}</span>
            {label}
            {id === "home" && save.chests > 0 && <span className="absolute top-0 right-1/4 size-2 rounded-full bg-[#ef4444]" />}
          </button>
        ))}
        <button onClick={() => setMode("race")} className="flex flex-1 flex-col items-center gap-0.5 py-1 text-[10px] font-bold text-white/70">
          <span className="text-xl">🏁</span>
          Race
        </button>
      </nav>

      {settingsOpen && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-black/50 p-6" onClick={() => setSettingsOpen(false)}>
          <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-[#0f172a] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 font-bold">Settings</div>
            <label className="mb-3 block text-sm">
              Display name
              <input
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 outline-none"
                value={save.name}
                maxLength={12}
                onChange={(e) => bump({ name: e.target.value.toUpperCase() })}
              />
            </label>

            {isAdmin && (
              <div className="mb-4 rounded-2xl border border-[#f0b232]/40 bg-[#f0b232]/10 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-black text-[#f0b232]">
                  <Shield className="size-4" /> Admin · unlimited coins
                </div>
                <p className="mb-3 text-xs text-white/70">Staff only. Grants coins on this device and can unlock free shopping.</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => adminGrant(1_000)} className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold">
                    +1,000
                  </button>
                  <button onClick={() => adminGrant(10_000)} className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold">
                    +10,000
                  </button>
                  <button onClick={() => adminGrant(100_000)} className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold">
                    +100,000
                  </button>
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={adminAmt}
                    onChange={(e) => setAdminAmt(e.target.value.replace(/\D/g, "").slice(0, 9))}
                    className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none"
                    placeholder="Custom amount"
                  />
                  <button
                    onClick={() => {
                      const n = Number(adminAmt) || 0;
                      if (n > 0) adminGrant(n);
                    }}
                    className="rounded-xl bg-[#f0b232] px-3 font-black text-black"
                  >
                    Add
                  </button>
                </div>
                <button
                  onClick={() => bump({ unlimitedCoins: !save.unlimitedCoins }, save.unlimitedCoins ? "Unlimited coins off" : "Unlimited coins ON")}
                  className={cn("mt-3 flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm font-black", save.unlimitedCoins ? "bg-[#22c55e] text-black" : "bg-white/15")}
                >
                  <InfinityIcon className="size-4" />
                  {save.unlimitedCoins ? "Unlimited ON — tap to disable" : "Enable unlimited coins"}
                </button>
                <button
                  onClick={() => {
                    const all = ACCESSORIES.map((a) => a.id);
                    bump({ ownedAcc: Array.from(new Set([...save.ownedAcc, ...all])), unlocked: BIRDS.map((b) => b.id) }, "Unlocked all birds & accessories");
                  }}
                  className="mt-2 w-full rounded-full bg-white/10 py-2 text-xs font-bold"
                >
                  Unlock all birds + accessories
                </button>
              </div>
            )}

            <p className="text-xs text-white/60">Progress saves on this device. Spend coins in Store for 999 / Juice-style fits and more drip.</p>
            <button onClick={() => setSettingsOpen(false)} className="mt-4 w-full rounded-full bg-white py-2.5 font-bold text-black">
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

function Currency({ icon, value, unlimited }: { icon: string; value: number | null; unlimited?: boolean }) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-black/35 py-1 pr-1.5 pl-2 text-xs font-black tabular-nums">
      <span>{icon}</span>
      {unlimited ? "∞" : value}
      <span className="grid size-5 place-items-center rounded-full bg-white/20 text-[10px]">+</span>
    </div>
  );
}
