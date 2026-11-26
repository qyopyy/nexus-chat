"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Pause, Play, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import * as K from "@/lib/sim/crypto";

const KEY = "nexus.sim.crypto";
const usd = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const START_CASH = 10000;

type Saved = { p: K.Portfolio; prices: Record<string, number>; hist: Record<string, number[]>; worth: number[]; log: string[] };

function fresh(): Saved {
  let cur: Record<string, number> = Object.fromEntries(K.COINS.map((c) => [c.sym, c.start]));
  const hist: Record<string, number[]> = Object.fromEntries(K.COINS.map((c) => [c.sym, [c.start]]));
  for (let i = 0; i < 40; i++) {
    cur = K.stepMarket(cur, Math.random, 0.01).prices;
    for (const c of K.COINS) hist[c.sym].push(cur[c.sym]);
  }
  return { p: K.newPortfolio(START_CASH), prices: cur, hist, worth: [START_CASH], log: ["Exchange open. You have $10,000 of play money — buy the dips, sell the pumps."] };
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Saved;
      if (s.p && s.prices && s.hist) return s;
    }
  } catch {
    /* fresh */
  }
  return fresh();
}

function Spark({ data, up, h = 36 }: { data: number[]; up: boolean; h?: number }) {
  const lo = Math.min(...data);
  const hi = Math.max(...data);
  const pts = data.map((v, i) => `${(i / Math.max(1, data.length - 1)) * 100},${h - 2 - ((v - lo) / Math.max(1e-9, hi - lo)) * (h - 4)}`).join(" ");
  return (
    <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" className="w-full" style={{ height: h }} aria-hidden>
      <polyline points={pts} fill="none" stroke={up ? "#34d399" : "#f87171"} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function CryptoTrader({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const first = useRef<Saved | null>(null);
  if (!first.current) first.current = load();
  const st = useRef<Saved>(first.current);
  const [, bump] = useState(0);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [sel, setSel] = useState(K.COINS[0].sym);
  const [amount, setAmount] = useState(500);
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
      for (const k of K.COINS) hist[k.sym] = [...(hist[k.sym] ?? []), prices[k.sym]].slice(-120);
      const log = event ? [`📰 ${K.COINS.find((k) => k.sym === event.sym)?.name} ${event.text}`, ...c.log].slice(0, 12) : c.log;
      st.current = { ...c, prices, hist, log, worth: [...c.worth, K.netWorth(c.p, prices)].slice(-120) };
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
  const coin = K.COINS.find((k) => k.sym === sel)!;

  const apply = (r: K.Portfolio | { error: string }, text: string) => {
    if (K.isError(r)) return setMsg(r.error);
    st.current = { ...st.current, p: r, log: [text, ...st.current.log].slice(0, 12) };
    setMsg("");
    bump((n) => n + 1);
  };
  const buy = (usdAmt: number) => apply(K.buyUsd(c.p, sel, usdAmt, price), `Bought ${usd(usdAmt)} of ${sel} @ ${K.fmtPrice(price)}`);
  const sell = (pct: number) => apply(K.sellPct(c.p, sel, pct, price), `Sold ${Math.round(pct * 100)}% of ${sel} @ ${K.fmtPrice(price)}`);
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
        <span className="text-xl">🪙</span>
        <span className="min-w-0 flex-1 truncate font-bold">Crypto Trader Sim</span>
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
                <div className="text-xs font-semibold uppercase text-sub">Portfolio value</div>
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
              <span>Fees {usd(c.p.fees)}</span>
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
            {K.COINS.map((k) => {
              const h = c.hist[k.sym] ?? [k.start];
              const prev = h[Math.max(0, h.length - 2)];
              const now = c.prices[k.sym];
              const chg = ((now - h[0]) / h[0]) * 100;
              const held = c.p.positions[k.sym];
              return (
                <button key={k.sym} onClick={() => setSel(k.sym)} className={cn("rounded-xl bg-side p-2.5 text-left", sel === k.sym && "ring-2 ring-accent")}>
                  <div className="flex justify-between text-xs">
                    <b>{k.emoji} {k.sym}</b>
                    <span className={cn("tabular-nums", now >= prev ? "text-emerald-400" : "text-red-400")}>{chg >= 0 ? "+" : ""}{chg.toFixed(1)}%</span>
                  </div>
                  <div className="truncate text-base font-bold tabular-nums">{K.fmtPrice(now)}</div>
                  <Spark data={h.slice(-40)} up={now >= h[Math.max(0, h.length - 40)]} />
                  {held && <div className="text-[10px] text-sub">own {usd(held.qty * now)}</div>}
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl bg-side p-4">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="font-bold">
                  {coin.emoji} {coin.name} <span className="text-sub">({coin.sym})</span>
                </div>
                <div className="text-xs text-sub">volatility {(coin.vol * 100).toFixed(1)}%/tick</div>
              </div>
              <div className="text-2xl font-black tabular-nums">{K.fmtPrice(price)}</div>
            </div>
            <div className="mt-2">
              <Spark data={(c.hist[sel] ?? []).slice(-100)} up={price >= (c.hist[sel]?.[0] ?? price)} h={70} />
            </div>
            {pos && (
              <div className="mt-2 text-sm text-sub">
                You hold <b className="text-white">{K.fmtQty(pos.qty)} {sel}</b> ({usd(pos.qty * price)}) · avg {K.fmtPrice(pos.avg)} ·{" "}
                <span className={price >= pos.avg ? "text-emerald-400" : "text-red-400"}>
                  {usd((price - pos.avg) * pos.qty)} ({(((price - pos.avg) / pos.avg) * 100).toFixed(1)}%)
                </span>
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-sub">$</span>
              <input type="number" min={1} value={amount} onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))} className="w-28 rounded-xl bg-black/25 px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-accent/60" aria-label="Dollar amount" />
              {[100, 1000].map((v) => (
                <button key={v} onClick={() => setAmount(v)} className="rounded-xl bg-black/25 px-3 py-2.5 text-xs font-bold text-sub">${v}</button>
              ))}
              <button onClick={() => setAmount(Math.max(1, Math.floor(c.p.cash)))} className="rounded-xl bg-black/25 px-3 py-2.5 text-xs font-bold text-sub">All cash</button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={() => buy(amount)} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white">Buy {usd(amount)}</button>
              {[0.25, 0.5, 1].map((f) => (
                <button key={f} onClick={() => sell(f)} disabled={!pos} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">
                  Sell {f === 1 ? "all" : `${f * 100}%`}
                </button>
              ))}
            </div>
            {msg && <div className="mt-2 text-sm text-red-300">{msg}</div>}
            <div className="mt-1 text-[11px] text-faint">Trading fee {(K.FEE_RATE * 100).toFixed(1)}% per trade. Fractional amounts supported.</div>
          </div>

          <div className="rounded-2xl bg-side p-4">
            <div className="mb-1 font-bold">News &amp; trades</div>
            {c.log.map((l, i) => (
              <div key={i} className="py-0.5 text-sm text-sub">{l}</div>
            ))}
          </div>
          <p className="pb-4 text-center text-[11px] text-faint">Simulated coins and prices — a game, not financial advice. No real money or crypto is involved.</p>
        </div>
      </div>
    </div>
  );
}
