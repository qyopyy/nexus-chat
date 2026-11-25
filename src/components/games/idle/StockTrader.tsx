"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Pause, Play, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import * as K from "@/lib/sim/market";

const KEY = "nexus.sim.stocks";
const usd = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const START_CASH = 10000;

type Saved = { p: K.Portfolio; prices: Record<string, number>; hist: Record<string, number[]>; worth: number[]; tick: number; log: string[] };

function fresh(): Saved {
  const prices = Object.fromEntries(K.STOCKS.map((s) => [s.sym, s.start]));
  // warm up so charts are not empty
  const hist: Record<string, number[]> = Object.fromEntries(K.STOCKS.map((s) => [s.sym, [s.start]]));
  let cur = prices;
  for (let i = 0; i < 40; i++) {
    cur = K.stepMarket(cur, Math.random, 0.01).prices;
    for (const s of K.STOCKS) hist[s.sym].push(cur[s.sym]);
  }
  const p = K.newPortfolio(START_CASH);
  return { p, prices: cur, hist, worth: [START_CASH], tick: 0, log: ["Market opened. You have $10,000 to invest — buy low, sell high."] };
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Saved;
  } catch {
    /* fresh */
  }
  return fresh();
}

function Spark({ data, up, h = 36 }: { data: number[]; up: boolean; h?: number }) {
  const lo = Math.min(...data);
  const hi = Math.max(...data);
  const pts = data.map((v, i) => `${(i / Math.max(1, data.length - 1)) * 100},${h - 2 - ((v - lo) / Math.max(1e-6, hi - lo)) * (h - 4)}`).join(" ");
  return (
    <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" className="w-full" style={{ height: h }} aria-hidden>
      <polyline points={pts} fill="none" stroke={up ? "#34d399" : "#f87171"} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function StockTrader({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const first = useRef<Saved | null>(null);
  if (!first.current) first.current = load();
  const st = useRef<Saved>(first.current);
  const [, bump] = useState(0);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [sel, setSel] = useState(K.STOCKS[0].sym);
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState("");

  const save = useCallback(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(st.current));
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const c = st.current;
      const { prices, event } = K.stepMarket(c.prices, Math.random);
      const hist = { ...c.hist };
      for (const s of K.STOCKS) hist[s.sym] = [...(hist[s.sym] ?? []), prices[s.sym]].slice(-120);
      const log = event ? [`📰 ${K.STOCKS.find((s) => s.sym === event.sym)?.name} ${event.text}`, ...c.log].slice(0, 12) : c.log;
      st.current = { ...c, prices, hist, tick: c.tick + 1, log, worth: [...c.worth, K.netWorth(c.p, prices)].slice(-120) };
      bump((n) => n + 1);
    }, 1000 / speed);
    return () => clearInterval(id);
  }, [running, speed]);

  useEffect(() => {
    const saver = setInterval(save, 4000);
    return () => {
      clearInterval(saver);
      save();
    };
  }, [save]);

  const c = st.current;
  const worth = K.netWorth(c.p, c.prices);
  const pnl = worth - START_CASH;
  const price = c.prices[sel];
  const pos = c.p.positions[sel];
  const stock = K.STOCKS.find((s) => s.sym === sel)!;

  const trade = (side: "buy" | "sell") => {
    const r = side === "buy" ? K.buy(c.p, sel, qty, price) : K.sell(c.p, sel, qty, price);
    if (K.isError(r)) return setMsg(r.error);
    st.current = { ...st.current, p: r, log: [`${side === "buy" ? "Bought" : "Sold"} ${qty} ${sel} @ ${usd(price)}`, ...st.current.log].slice(0, 12) };
    setMsg("");
    bump((n) => n + 1);
  };
  const reset = () => {
    if (!window.confirm("Reset your portfolio and start over with $10,000?")) return;
    st.current = fresh();
    setMsg("");
    bump((n) => n + 1);
    save();
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-chat">
      <header className={cn("flex shrink-0 items-center gap-2 border-b border-black/20 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        <button onClick={onBack} className="grid size-9 place-items-center rounded-full hover:bg-hover" aria-label="Back to games">
          <ArrowLeft className="size-5" />
        </button>
        <span className="text-xl">📈</span>
        <span className="min-w-0 flex-1 truncate font-bold">Stock Trader Sim</span>
        <button onClick={() => setRunning(!running)} className="grid size-9 place-items-center rounded-full hover:bg-hover" aria-label={running ? "Pause market" : "Resume market"}>
          {running ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
        <button onClick={reset} className="grid size-9 place-items-center rounded-full text-sub hover:bg-hover hover:text-red-400" aria-label="Reset">
          <RotateCcw className="size-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-3xl space-y-3 p-3 sm:p-5">
          <div className="rounded-2xl bg-side p-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <div className="text-xs font-semibold uppercase text-sub">Net worth</div>
                <div className="text-3xl font-black tabular-nums">{usd(worth)}</div>
                <div className={cn("text-sm font-semibold tabular-nums", pnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                  {pnl >= 0 ? "▲" : "▼"} {usd(Math.abs(pnl))} ({((pnl / START_CASH) * 100).toFixed(1)}%)
                </div>
              </div>
              <div className="w-40 sm:w-60">
                <Spark data={c.worth.length > 1 ? c.worth : [START_CASH, START_CASH]} up={pnl >= 0} h={48} />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-sub">
              <span>Cash {usd(c.p.cash)}</span>
              <span>Fees paid {usd(c.p.fees)}</span>
              <span>Realised {usd(c.p.realized)}</span>
              <span className="ml-auto flex items-center gap-1">
                Speed
                {[1, 3, 8].map((x) => (
                  <button key={x} onClick={() => setSpeed(x)} className={cn("rounded-full px-2.5 py-1 font-bold", speed === x ? "bg-accent text-white" : "bg-black/25")}>
                    {x}×
                  </button>
                ))}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {K.STOCKS.map((s) => {
              const h = c.hist[s.sym] ?? [s.start];
              const prev = h[Math.max(0, h.length - 2)];
              const now = c.prices[s.sym];
              const day = ((now - h[0]) / h[0]) * 100;
              return (
                <button key={s.sym} onClick={() => setSel(s.sym)} className={cn("rounded-xl bg-side p-2.5 text-left", sel === s.sym && "ring-2 ring-accent")}>
                  <div className="flex justify-between text-xs">
                    <b>{s.sym}</b>
                    <span className={cn("tabular-nums", now >= prev ? "text-emerald-400" : "text-red-400")}>{day >= 0 ? "+" : ""}{day.toFixed(1)}%</span>
                  </div>
                  <div className="text-lg font-bold tabular-nums">{usd(now)}</div>
                  <Spark data={h.slice(-40)} up={now >= h[Math.max(0, h.length - 40)]} />
                  {c.p.positions[s.sym] && <div className="text-[10px] text-sub">own {c.p.positions[s.sym].qty}</div>}
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl bg-side p-4">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="font-bold">
                  {stock.name} <span className="text-sub">({stock.sym})</span>
                </div>
                <div className="text-xs text-sub">
                  {stock.sector} · volatility {(stock.vol * 100).toFixed(1)}%/tick
                </div>
              </div>
              <div className="text-2xl font-black tabular-nums">{usd(price)}</div>
            </div>
            <div className="mt-2">
              <Spark data={(c.hist[sel] ?? []).slice(-100)} up={price >= (c.hist[sel]?.[0] ?? price)} h={70} />
            </div>
            {pos && (
              <div className="mt-2 text-sm text-sub">
                You own <b className="text-white">{pos.qty}</b> @ avg {usd(pos.avg)} ·{" "}
                <span className={price >= pos.avg ? "text-emerald-400" : "text-red-400"}>
                  {usd((price - pos.avg) * pos.qty)} ({(((price - pos.avg) / pos.avg) * 100).toFixed(1)}%)
                </span>
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))} className="w-24 rounded-xl bg-black/25 px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-accent/60" aria-label="Shares" />
              <button onClick={() => setQty(Math.max(1, K.maxBuyable(c.p.cash, price)))} className="rounded-xl bg-black/25 px-3 py-2.5 text-xs font-bold text-sub">Max buy</button>
              {pos && <button onClick={() => setQty(pos.qty)} className="rounded-xl bg-black/25 px-3 py-2.5 text-xs font-bold text-sub">All shares</button>}
              <button onClick={() => trade("buy")} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white">Buy {usd(qty * price)}</button>
              <button onClick={() => trade("sell")} disabled={!pos} className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">Sell</button>
            </div>
            {msg && <div className="mt-2 text-sm text-red-300">{msg}</div>}
            <div className="mt-1 text-[11px] text-faint">Trading fee {(K.FEE_RATE * 100).toFixed(1)}% per trade.</div>
          </div>

          <div className="rounded-2xl bg-side p-4">
            <div className="mb-1 font-bold">News & trades</div>
            {c.log.map((l, i) => (
              <div key={i} className="py-0.5 text-sm text-sub">
                {l}
              </div>
            ))}
          </div>
          <p className="pb-4 text-center text-[11px] text-faint">Fictional companies and simulated prices — a game, not financial advice. No real money is involved.</p>
        </div>
      </div>
    </div>
  );
}
