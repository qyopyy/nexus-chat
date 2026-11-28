"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import * as L from "@/lib/sim/lemonade";

const KEY = "nexus.sim.lemonade";
const usd = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;
const ICON: Record<L.Weather, string> = { Sunny: "☀️", Hot: "🔥", Cloudy: "☁️", Rainy: "🌧️" };

type Report = { weather: L.Weather; price: number; sold: number; missed: number; revenue: number; adCost: number; profit: number };

export default function LemonadeStand({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const [stand, setStand] = useState<L.Stand>(L.newStand);
  const [weather, setWeather] = useState<L.Weather>("Sunny");
  const [price, setPrice] = useState(1);
  const [marketing, setMarketing] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const ready = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setStand(JSON.parse(raw) as L.Stand);
    } catch {
      /* fresh */
    }
    setWeather(L.pickWeather(Math.random));
    ready.current = true;
  }, []);
  useEffect(() => {
    if (!ready.current) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(stand));
    } catch {
      /* storage unavailable */
    }
  }, [stand]);

  const expected = L.demand(weather, price, stand.reputation, marketing);
  const afford = (packs: number) => stand.cash >= packs * L.PACK_COST;
  const canAd = stand.cash >= marketing * 3;

  const buy = (n: number) => {
    const r = L.buyPacks(stand, n);
    if (r) setStand(r);
  };
  const open = () => {
    if (!canAd) return;
    const r = L.simulateDay(stand, { weather, price, marketing }, Math.random);
    setStand(r.stand);
    setReport({ weather, price, sold: r.sold, missed: r.missed, revenue: r.revenue, adCost: r.adCost, profit: r.profit });
    setWeather(L.pickWeather(Math.random));
  };
  const reset = () => {
    if (!window.confirm("Start a brand-new stand?")) return;
    setStand(L.newStand());
    setReport(null);
  };
  const broke = stand.supplies === 0 && stand.cash < L.PACK_COST;

  return (
    <div className="flex h-full min-h-0 flex-col bg-chat">
      <header className={cn("flex shrink-0 items-center gap-2 border-b border-black/20 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        <button onClick={onBack} className="grid size-9 place-items-center rounded-full hover:bg-hover" aria-label="Back to games">
          <ArrowLeft className="size-5" />
        </button>
        <span className="text-xl">🍋</span>
        <span className="min-w-0 flex-1 truncate font-bold">Lemonade Stand</span>
        <button onClick={reset} className="grid size-9 place-items-center rounded-full text-sub hover:bg-hover hover:text-red-400" aria-label="Reset">
          <RotateCcw className="size-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-xl space-y-3 p-3 sm:p-5">
          <div className="grid grid-cols-4 gap-2 text-center">
            {[["Day", stand.day], ["Cash", usd(stand.cash)], ["Cups", stand.supplies], ["Rep", `${stand.reputation}%`]].map(([k, v]) => (
              <div key={k as string} className="rounded-xl bg-side px-2 py-2.5">
                <div className="text-[11px] font-semibold uppercase text-sub">{k}</div>
                <div className="text-base font-bold tabular-nums">{v}</div>
              </div>
            ))}
          </div>
          <div className="rounded-2xl bg-side p-4">
            <div className="text-3xl">
              {ICON[weather]} <span className="text-lg font-bold">{weather} today</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="font-semibold">Price per cup</span>
              <span className="text-lg font-black tabular-nums">{usd(price)}</span>
            </div>
            <input type="range" min={0.25} max={3} step={0.05} value={price} onChange={(e) => setPrice(Number(e.target.value))} className="w-full" aria-label="Price per cup" />
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="font-semibold">Advertising ($3 / level)</span>
              <span className="font-bold tabular-nums">{marketing}</span>
            </div>
            <input type="range" min={0} max={5} step={1} value={marketing} onChange={(e) => setMarketing(Number(e.target.value))} className="w-full" aria-label="Advertising level" />
            <div className="mt-2 text-sm text-sub">
              Expected customers ≈ <b className="text-white">{expected}</b> · you can serve <b className="text-white">{stand.supplies}</b>
            </div>
          </div>
          <div className="rounded-2xl bg-side p-4">
            <div className="mb-2 text-sm font-semibold">
              Buy supplies <span className="text-sub">({L.SUPPLY_PACK} cups for {usd(L.PACK_COST)})</span>
            </div>
            <div className="flex gap-2">
              {[1, 4, 10].map((n) => (
                <button key={n} onClick={() => buy(n)} disabled={!afford(n)} className="flex-1 rounded-xl bg-black/25 py-2.5 text-sm font-bold disabled:opacity-40">
                  +{n * L.SUPPLY_PACK} cups
                </button>
              ))}
            </div>
          </div>
          <button onClick={open} disabled={!canAd} className="w-full rounded-2xl bg-amber-400 py-4 text-lg font-extrabold text-black active:scale-[.99] disabled:opacity-40">
            Open the stand 🍋
          </button>
          {broke && <div className="rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-300">You're out of cups and cash. Reset to start a new stand.</div>}
          {report && (
            <div className="rounded-2xl bg-side p-4 text-sm">
              <div className="mb-1 font-bold">
                Yesterday {ICON[report.weather]} · {usd(report.price)}/cup
              </div>
              <div>Sold {report.sold} cups · missed {report.missed} customers</div>
              <div>
                Revenue {usd(report.revenue)} − ads {usd(report.adCost)} = <b className={report.profit >= 0 ? "text-emerald-400" : "text-red-400"}>{usd(report.profit)}</b>
              </div>
              {report.missed > 5 && <div className="mt-1 text-amber-300">You ran out of cups — people left unhappy.</div>}
            </div>
          )}
          <p className="text-center text-xs text-sub">Best day so far: {usd(stand.best)}</p>
        </div>
      </div>
    </div>
  );
}
