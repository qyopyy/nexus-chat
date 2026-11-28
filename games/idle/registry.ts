import type { ComponentType } from "react";
import { IDLE_DEFS } from "./configs";
import type { IdleConfig } from "@/lib/sim/idle";
import MiningRoom from "./MiningRoom";
import CryptoTrader from "./CryptoTrader";
import LemonadeStand from "./LemonadeStand";
import BottleRun from "../bottle/BottleRun";

type Props = { onBack: () => void; mobile?: boolean };
export type SimGame = { id: string; name: string; tag: string; desc: string; bg: string; emoji: string; isNew?: boolean; Component?: ComponentType<Props>; cfg?: IdleConfig };

const idleGames: SimGame[] = IDLE_DEFS.map((d) => ({
  id: d.cfg.id,
  name: d.cfg.title,
  tag: d.tag,
  desc: d.desc,
  bg: d.bg,
  emoji: d.cfg.emoji,
  isNew: true,
  cfg: d.cfg,
}));

export const SIM_GAMES: SimGame[] = [
  { id: "bottle-run", name: "Bottle Run", tag: "Open world · deposit sim", desc: "Roam a little town, collect bottles & cans, throw them into return machines, chase streaks, adopt pets, buy rides and finish quests.", bg: "linear-gradient(135deg,#facc15,#16a34a)", emoji: "🍾", isNew: true, Component: BottleRun },
  { id: "btc-miner", name: "Bitcoin Mining Room", tag: "Tycoon · PC rigs", desc: "Build computers, add GPUs, outgrow your bedroom into a data center, beat heat, dust, power cuts, difficulty and halvings. Simulated.", bg: "linear-gradient(135deg,#f7931a,#3b2300)", emoji: "⛏️", isNew: true, Component: MiningRoom },
  { id: "crypto-trader", name: "Crypto Trader Sim", tag: "Simulator · trading", desc: "Trade 8 simulated coins — BTC, ETH, SOL, DOGE and more — with live swings, news shocks and fees, from $10,000 of play money.", bg: "linear-gradient(135deg,#8b5cf6,#0f172a)", emoji: "🪙", isNew: true, Component: CryptoTrader },
  { id: "lemonade", name: "Lemonade Stand", tag: "Simulator · tycoon", desc: "Set prices around the weather, buy supplies, advertise and build your reputation day by day.", bg: "linear-gradient(135deg,#fde047,#f97316)", emoji: "🍋", isNew: true, Component: LemonadeStand },
  ...idleGames,
];
