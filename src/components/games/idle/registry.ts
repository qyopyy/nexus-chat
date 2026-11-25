import type { ComponentType } from "react";
import { IDLE_DEFS } from "./configs";
import type { IdleConfig } from "@/lib/sim/idle";
import BitcoinMiner from "./BitcoinMiner";
import StockTrader from "./StockTrader";
import LemonadeStand from "./LemonadeStand";

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
  { id: "btc-miner", name: "Bitcoin Miner Sim", tag: "Idle · crypto mining", desc: "Build a mining farm, fight rising difficulty and halvings, and time the market. Simulated — no real money.", bg: "linear-gradient(135deg,#f7931a,#3b2300)", emoji: "₿", isNew: true, Component: BitcoinMiner },
  { id: "stock-trader", name: "Stock Trader Sim", tag: "Simulator · markets", desc: "Trade 8 fictional stocks with live price swings, news shocks and fees. Beat the market from a $10,000 start.", bg: "linear-gradient(135deg,#10b981,#064e3b)", emoji: "📈", isNew: true, Component: StockTrader },
  { id: "lemonade", name: "Lemonade Stand", tag: "Simulator · tycoon", desc: "Set prices around the weather, buy supplies, advertise and build your reputation day by day.", bg: "linear-gradient(135deg,#fde047,#f97316)", emoji: "🍋", isNew: true, Component: LemonadeStand },
  ...idleGames,
];
