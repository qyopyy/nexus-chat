"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import * as M from "@/lib/sim/miner";
import { fmt } from "@/lib/sim/idle";

const KEY = "nexus.sim.miner";
const money = (n: number) => `${n < 0 ? "-" : ""}$${fmt(Math.abs(n))}`;

type Saved = { s: M.MinerState; history: number[]; auto: boolean };

function load(): { saved: Saved; offline: { btc: number; secs: number } } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Saved;
      const secs = Math.max(0, Math.min(8 * 3600, (Date.now() - p.s.ts) / 1000));
      const before = p.s.btc;
      const s = M.stepMiner(p.s, secs * 0.5);
      return { saved: { ...p, s: { ...s, ts: Date.now() } }, offline: { btc: s.btc - before, secs } };
    }
  } catch {
    /* fresh start */
  }
  const s = M.newMiner();
  return { saved: { s, history: [s.price], auto: true }, offline: { btc: 0, secs: 0 } };
}

export default function BitcoinMiner({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const init = useRef<ReturnType<typeof load> | null>(null);
  if (!init.current) init.current = load();
  const st = useRef<M.MinerState>(init.current.saved.s);
  const hist = useRef<number[]>(init.current.saved.history);
  const [auto, setAuto] = useState(init.current.saved.auto);
  const autoRef = useRef(auto);
  autoRef.current = auto;
  const [off, setOff] = useState(init.current.offline);
  const [, bump] = useState(0);

  const save = useCallback(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ s: { ...st.current, ts: Date.now() }, history: hist.current, auto: autoRef.current } satisfies Saved));
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    const loop = setInterval(() => {
      let s = M.stepMiner(st.current, 1);
      s = { ...s, price: M.nextPrice(s.price, Math.random) };
      if (autoRef.current && s.cash < 0 && s.btc > 0) {
        const need = Math.min(s.btc, (-s.cash + 1) / s.price);
        s = M.sellBtc(s, need) ?? s;
      }
      st.current = s;
      hist.current = [...hist.current, s.price].slice(-90);
      bump((n) => n + 1);
    }, 1000);
    const saver = setInterval(save, 4000);
    const onHide = () => document.visibilityState === "hidden" && save();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(loop);
      clearInterval(saver);
      document.removeEventListener("visibilitychange", onHide);
      save();
    };
  }, [save]);

  const s = st.current;
  const rev = M.btcPerSecond(s) * s.price;
  const cost = M.costPerSecond(s);
  const net = rev - cost;
  const toHalving = (M.HALVING_BLOCKS - (s.block % M.HALVING_BLOCKS)) * M.BLOCK_SECONDS;
  const h = hist.current;
  const lo = Math.min(...h);
  const hi = Math.max(...h);
  const pts = h.map((v, i) => `${(i / Math.max(1, h.length - 1)) * 300},${58 - ((v - lo) / Math.max(1, hi - lo)) * 52}`).join(" ");
  const up = h.length > 1 && h[h.length - 1] >= h[0];

  const act = (fn: (x: M.MinerState) => M.MinerState | null) => {
    const n = fn(st.current);
    if (n) st.current = n;
    bump((x) => x + 1);
  };
  const reset = () => {
    if (!window.confirm("Erase all mining progress?")) return;
    st.current = M.newMiner();
    hist.current = [st.current.price];
    bump((x) => x + 1);
    save();
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-chat">
      <header className={cn("flex shrink-0 items-center gap-2 border-b border-black/20 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        <button onClick={onBack} className="grid size-9 place-items-center rounded-full hover:bg-hover" aria-label="Back to games">
          <ArrowLeft className="size-5" />
        </button>
        <span className="text-xl">₿</span>
        <span className="min-w-0 flex-1 truncate font-bold">Bitcoin Miner Sim</span>
        <button onClick={reset} className="grid size-9 place-items-center rounded-full text-sub hover:bg-hover hover:text-red-400" aria-label="Reset">
          <RotateCcw className="size-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-2xl space-y-3 p-3 sm:p-5">
          {off.secs > 60 && (
            <button onClick={() => setOff({ btc: 0, secs: 0 })} className="w-full rounded-xl bg-emerald-500/15 px-3 py-2 text-left text-sm text-emerald-300">
              Your rigs mined <b>{off.btc.toFixed(6)} ₿</b> while you were away (50% efficiency). Tap to dismiss.
            </button>
          )}
          <div className="rounded-2xl bg-side p-4">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-xs font-semibold uppercase text-sub">BTC price (game market)</div>
                <div className={cn("text-3xl font-black tabular-nums", up ? "text-emerald-400" : "text-red-400")}>${s.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              </div>
              <svg viewBox="0 0 300 60" className="h-14 w-40 sm:w-56" aria-hidden>
                <polyline points={pts} fill="none" stroke={up ? "#34d399" : "#f87171"} strokeWidth="2" />
              </svg>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile k="Cash" v={money(s.cash)} tone={s.cash < 0 ? "bad" : undefined} />
            <Tile k="Wallet" v={`${s.btc.toFixed(5)} ₿`} sub={`cap ${M.walletCap(s)}`} />
            <Tile k="Hashrate" v={`${fmt(M.hashPower(s))} H/s`} />
            <Tile k="Power" v={`${M.powerKw(s).toFixed(2)} kW`} />
            <Tile k="Income" v={`${money(rev)}/s`} />
            <Tile k="Power bill" v={`${money(cost)}/s`} />
            <Tile k="Net" v={`${money(net)}/s`} tone={net >= 0 ? "good" : "bad"} />
            <Tile k="Halving in" v={`${Math.ceil(toHalving / 60)} min`} sub={`reward ×${M.rewardFactor(s.block)}`} />
          </div>
          <div className="rounded-2xl bg-side p-3 text-xs text-sub">
            Network difficulty ×{M.difficulty(s.block).toFixed(2)} · lifetime mined {s.totalBtc.toFixed(5)} ₿. Difficulty climbs and rewards halve every hour of play — keep upgrading to stay profitable.
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[0.25, 0.5, 1].map((f) => (
              <button key={f} onClick={() => act((x) => M.sellBtc(x, x.btc * f))} disabled={s.btc <= 0} className="rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">
                Sell {f === 1 ? "all" : `${f * 100}%`}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-2 text-xs text-sub">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto-sell to pay power bills
            </label>
          </div>
          {s.cash < 0 && <div className="rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-300">You are in debt for electricity. Sell coins or add hashrate — rigs keep running on credit.</div>}

          <h3 className="pt-1 font-bold">Mining rigs</h3>
          <div className="space-y-2">
            {M.RIGS.map((r) => {
              const owned = s.counts[r.id] || 0;
              const c = M.rigCost(r, owned);
              const can = s.cash >= c;
              return (
                <button key={r.id} onClick={() => act((x) => M.buyRig(x, r.id))} disabled={!can} className={cn("flex w-full items-center gap-3 rounded-2xl bg-side p-3 text-left", can ? "hover:bg-hover" : "opacity-55")}>
                  <span className="text-3xl">{r.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{r.name}</span>
                    <span className="block text-xs text-sub">
                      {fmt(r.hash)} H/s · {r.watts} W · owned {owned}
                    </span>
                  </span>
                  <span className={cn("shrink-0 rounded-full px-3 py-1.5 text-sm font-bold tabular-nums", can ? "bg-emerald-500/20 text-emerald-300" : "bg-black/25 text-sub")}>{money(c)}</span>
                </button>
              );
            })}
          </div>
          <h3 className="pt-1 font-bold">Upgrades</h3>
          <div className="space-y-2">
            {M.UPGRADES.filter((u) => !s.upgrades.includes(u.id)).map((u) => {
              const can = s.cash >= u.cost;
              return (
                <button key={u.id} onClick={() => act((x) => M.buyUpgrade(x, u.id))} disabled={!can} className={cn("flex w-full items-center gap-3 rounded-2xl bg-side p-3 text-left", can ? "hover:bg-hover" : "opacity-55")}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{u.name}</span>
                    <span className="block text-xs text-sub">{u.desc}</span>
                  </span>
                  <span className={cn("shrink-0 rounded-full px-3 py-1.5 text-sm font-bold tabular-nums", can ? "bg-amber-500/20 text-amber-300" : "bg-black/25 text-sub")}>{money(u.cost)}</span>
                </button>
              );
            })}
            {M.UPGRADES.every((u) => s.upgrades.includes(u.id)) && <p className="text-sm text-sub">All upgrades installed 🎉</p>}
          </div>
          <p className="pb-4 text-center text-[11px] text-faint">A game, not financial advice — prices and mining are simulated and use no real money or crypto.</p>
        </div>
      </div>
    </div>
  );
}

function Tile({ k, v, sub, tone }: { k: string; v: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl bg-side px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-sub">{k}</div>
      <div className={cn("truncate text-base font-bold tabular-nums", tone === "good" && "text-emerald-400", tone === "bad" && "text-red-400")}>{v}</div>
      {sub && <div className="text-[10px] text-sub">{sub}</div>}
    </div>
  );
}
