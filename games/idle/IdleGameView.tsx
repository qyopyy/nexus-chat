"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, RotateCcw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import * as I from "@/lib/sim/idle";

const key = (id: string) => `nexus.idle.${id}`;

function load(cfg: I.IdleConfig): { state: I.IdleState; offline: number } {
  try {
    const raw = localStorage.getItem(key(cfg.id));
    if (raw) {
      const s = { ...I.newState(), ...(JSON.parse(raw) as Partial<I.IdleState>) } as I.IdleState;
      const off = I.offlineGain(cfg, s, Date.now());
      return { state: { ...s, cash: s.cash + off.gain, total: s.total + off.gain, ts: Date.now() }, offline: off.gain };
    }
  } catch {
    /* corrupt or unavailable storage → fresh start */
  }
  return { state: I.newState(), offline: 0 };
}

export default function IdleGameView({ cfg, onBack, mobile }: { cfg: I.IdleConfig; onBack: () => void; mobile?: boolean }) {
  const first = useRef<ReturnType<typeof load> | null>(null);
  if (!first.current) first.current = load(cfg);
  const st = useRef<I.IdleState>(first.current.state);
  const [, bump] = useState(0);
  const [offline, setOffline] = useState(first.current.offline);
  const [qty, setQty] = useState<1 | 10 | "max">(1);
  const [pops, setPops] = useState<{ id: number; v: number }[]>([]);
  const popId = useRef(0);

  const save = useCallback(() => {
    try {
      localStorage.setItem(key(cfg.id), JSON.stringify({ ...st.current, ts: Date.now() }));
    } catch {
      /* storage unavailable */
    }
  }, [cfg.id]);

  useEffect(() => {
    let last = Date.now();
    const loop = setInterval(() => {
      const now = Date.now();
      st.current = I.tick(cfg, st.current, (now - last) / 1000);
      last = now;
      bump((n) => n + 1);
    }, 100);
    const saver = setInterval(save, 3000);
    const onHide = () => document.visibilityState === "hidden" && save();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(loop);
      clearInterval(saver);
      document.removeEventListener("visibilitychange", onHide);
      save();
    };
  }, [cfg, save]);

  const s = st.current;
  const ps = I.perSecond(cfg, s);
  const prestigeAvail = I.prestigeAvailable(cfg, s);

  const tap = () => {
    const g = I.tapGain(cfg, st.current);
    st.current = { ...st.current, cash: st.current.cash + g, total: st.current.total + g, taps: st.current.taps + 1 };
    const id = ++popId.current;
    setPops((p) => [...p.slice(-5), { id, v: g }]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 700);
    bump((n) => n + 1);
  };
  const buy = (genId: string) => {
    const g = cfg.gens.find((x) => x.id === genId)!;
    const owned = st.current.counts[genId] || 0;
    const n = qty === "max" ? I.maxAffordable(g, owned, st.current.cash) : qty;
    if (n < 1) return;
    const next = I.buyGen(cfg, st.current, genId, n);
    if (next) st.current = next;
    bump((x) => x + 1);
  };
  const buyUp = (id: string) => {
    const next = I.buyUpgrade(cfg, st.current, id);
    if (next) st.current = next;
    bump((x) => x + 1);
  };
  const prestige = () => {
    if (!window.confirm(`Reset your empire for ${prestigeAvail} ${cfg.prestigeName}? Each gives +${Math.round(I.PRESTIGE_BONUS * 100)}% income forever.`)) return;
    const next = I.doPrestige(cfg, st.current);
    if (next) st.current = next;
    save();
    bump((x) => x + 1);
  };
  const reset = () => {
    if (!window.confirm("Erase ALL progress for this game?")) return;
    st.current = I.newState();
    save();
    bump((x) => x + 1);
  };

  const ups = cfg.upgrades.filter((u) => I.upgradeAvailable(u, s)).sort((a, b) => a.cost - b.cost).slice(0, 4);
  const visibleGens = cfg.gens.filter((g, i) => i === 0 || (s.counts[cfg.gens[i - 1].id] || 0) > 0 || (s.counts[g.id] || 0) > 0 || s.total >= g.baseCost * 0.5);

  return (
    <div className="flex h-full min-h-0 flex-col bg-chat">
      <header className={cn("flex shrink-0 items-center gap-2 border-b border-black/20 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        <button onClick={onBack} className="grid size-9 place-items-center rounded-full hover:bg-hover" aria-label="Back to games">
          <ArrowLeft className="size-5" />
        </button>
        <span className="text-xl">{cfg.emoji}</span>
        <span className="min-w-0 flex-1 truncate font-bold">{cfg.title}</span>
        <button onClick={reset} className="grid size-9 place-items-center rounded-full text-sub hover:bg-hover hover:text-red-400" aria-label="Reset game">
          <RotateCcw className="size-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-2xl space-y-3 p-3 sm:p-5">
          {offline > 0 && (
            <button onClick={() => setOffline(0)} className="w-full rounded-xl bg-emerald-500/15 px-3 py-2 text-left text-sm text-emerald-300">
              Welcome back! You earned <b>{I.fmt(offline)} {cfg.unit}</b> while away (tap to dismiss).
            </button>
          )}
          <div className="rounded-2xl bg-side p-4 text-center">
            <div className="text-4xl font-black tabular-nums">
              {cfg.unit === "$" ? "$" : ""}
              {I.fmt(s.cash)}
              {cfg.unit !== "$" ? <span className="ml-1 text-xl text-sub">{cfg.unit}</span> : null}
            </div>
            <div className="mt-1 text-sm text-sub">
              {I.fmt(ps)} / sec · ×{I.prestigeMult(s.prestige).toFixed(2)} {cfg.prestigeName.toLowerCase()} bonus
            </div>
            <div className="relative mt-3">
              <button onClick={tap} className="w-full rounded-2xl bg-accent py-5 text-lg font-extrabold text-white active:scale-[.98]">
                {cfg.emoji} {cfg.tapName} <span className="text-white/70">+{I.fmt(I.tapGain(cfg, s))}</span>
              </button>
              {pops.map((p) => (
                <span key={p.id} className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 animate-bounce text-sm font-bold text-amber-300">
                  +{I.fmt(p.v)}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h3 className="font-bold">Buy</h3>
            <div className="flex gap-1">
              {([1, 10, "max"] as const).map((q) => (
                <button key={q} onClick={() => setQty(q)} className={cn("rounded-full px-3 py-1 text-xs font-bold", qty === q ? "bg-accent text-white" : "bg-side text-sub")}>
                  {q === "max" ? "Max" : `×${q}`}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            {visibleGens.map((g) => {
              const owned = s.counts[g.id] || 0;
              const n = qty === "max" ? Math.max(1, I.maxAffordable(g, owned, s.cash)) : qty;
              const cost = I.genCost(g, owned, n);
              const can = s.cash >= cost;
              return (
                <button key={g.id} onClick={() => buy(g.id)} disabled={!can} className={cn("flex w-full items-center gap-3 rounded-2xl bg-side p-3 text-left transition", can ? "hover:bg-hover active:scale-[.99]" : "opacity-55")}>
                  <span className="text-3xl">{g.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{g.name}</span>
                    <span className="block text-xs text-sub">
                      +{I.fmt(g.rate)}/s each · owned {owned}
                    </span>
                  </span>
                  <span className={cn("shrink-0 rounded-full px-3 py-1.5 text-sm font-bold tabular-nums", can ? "bg-emerald-500/20 text-emerald-300" : "bg-black/25 text-sub")}>
                    {n > 1 ? `${n}× ` : ""}
                    {I.fmt(cost)}
                  </span>
                </button>
              );
            })}
          </div>

          {ups.length > 0 && (
            <>
              <h3 className="pt-1 font-bold">Upgrades</h3>
              <div className="space-y-2">
                {ups.map((u) => {
                  const can = s.cash >= u.cost;
                  return (
                    <button key={u.id} onClick={() => buyUp(u.id)} disabled={!can} className={cn("flex w-full items-center gap-3 rounded-2xl bg-side p-3 text-left", can ? "hover:bg-hover" : "opacity-55")}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{u.name}</span>
                        <span className="block text-xs text-sub">{u.desc}</span>
                      </span>
                      <span className={cn("shrink-0 rounded-full px-3 py-1.5 text-sm font-bold tabular-nums", can ? "bg-amber-500/20 text-amber-300" : "bg-black/25 text-sub")}>{I.fmt(u.cost)}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div className="rounded-2xl bg-side p-4">
            <div className="flex items-center gap-2 font-bold">
              <Sparkles className="size-4 text-amber-300" /> Prestige · {cfg.prestigeName}
            </div>
            <p className="mt-1 text-sm text-sub">
              Lifetime earnings: {I.fmt(s.total)}. You hold {s.prestige}. Reset to claim <b>{prestigeAvail}</b> more (+{Math.round(I.PRESTIGE_BONUS * 100)}% income each, forever).
            </p>
            <button onClick={prestige} disabled={prestigeAvail < 1} className="mt-3 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-black disabled:opacity-40">
              {prestigeAvail < 1 ? `Reach ${I.fmt(cfg.prestigeBase * Math.pow(s.prestige + 1, 2))} lifetime` : `Prestige for ${prestigeAvail}`}
            </button>
          </div>
          <p className="pb-4 text-center text-[11px] text-faint">Progress saves on this device. Offline earnings run at {Math.round(I.OFFLINE_EFFICIENCY * 100)}% for up to {I.OFFLINE_CAP_SEC / 3600}h.</p>
        </div>
      </div>
    </div>
  );
}
