"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import * as R from "@/lib/sim/rig";
import { fmt } from "@/lib/sim/idle";

const KEY = "nexus.sim.rigroom";
const money = (n: number) => `${n < 0 ? "-" : ""}$${fmt(Math.abs(n))}`;

type Saved = { s: R.RigState; history: number[]; auto: boolean };
type Tab = "pcs" | "build" | "room" | "upgrades";

function load(): { saved: Saved; offline: { btc: number; secs: number } } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Saved;
      if (p.s && Array.isArray(p.s.pcs)) {
        const secs = Math.max(0, Math.min(8 * 3600, (Date.now() - p.s.ts) / 1000));
        const before = p.s.btc;
        // away: half efficiency, no dust/outage events, never goes into debt
        const stepped = R.stepRig({ ...p.s, outage: 0 }, secs * 0.5);
        const s = { ...stepped, cash: Math.max(p.s.cash, stepped.cash), ts: Date.now() };
        return { saved: { ...p, s }, offline: { btc: s.btc - before, secs } };
      }
    }
  } catch {
    /* fresh start */
  }
  const s = R.newRig();
  return { saved: { s, history: [s.price], auto: true }, offline: { btc: 0, secs: 0 } };
}

export default function MiningRoom({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const init = useRef<ReturnType<typeof load> | null>(null);
  if (!init.current) init.current = load();
  const st = useRef<R.RigState>(init.current.saved.s);
  const hist = useRef<number[]>(init.current.saved.history);
  const [auto, setAuto] = useState(init.current.saved.auto);
  const autoRef = useRef(auto);
  autoRef.current = auto;
  const [off, setOff] = useState(init.current.offline);
  const [tab, setTab] = useState<Tab>("pcs");
  const [pick, setPick] = useState(0);
  const [log, setLog] = useState<string[]>(["Welcome to your first mining room. Add a GPU to the Potato PC!"]);
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
      let s = R.stepRig(st.current, 1);
      s = { ...s, price: R.nextPrice(s.price, Math.random) };
      const ev = R.rollEvent(s, Math.random);
      if (ev) {
        s = ev.state;
        setLog((l) => [ev.text, ...l].slice(0, 8));
      }
      if (autoRef.current && s.cash < 0 && s.btc > 0) {
        const need = Math.min(s.btc, (-s.cash + 1) / s.price);
        s = R.sellBtc(s, need) ?? s;
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
  const rev = R.btcPerSecond(s) * s.price;
  const cost = R.costPerSecond(s);
  const net = rev - cost;
  const toHalving = (R.HALVING_BLOCKS - (s.block % R.HALVING_BLOCKS)) * R.BLOCK_SECONDS;
  const h = hist.current;
  const lo = Math.min(...h);
  const hi = Math.max(...h);
  const pts = h.map((v, i) => `${(i / Math.max(1, h.length - 1)) * 300},${58 - ((v - lo) / Math.max(1, hi - lo)) * 52}`).join(" ");
  const up = h.length > 1 && h[h.length - 1] >= h[0];
  const eff = R.heatEff(s);
  const sel = Math.min(pick, s.pcs.length - 1);
  const room = R.ROOMS[s.room];
  const nextRoom = R.nextRoom(s);

  const act = (fn: (x: R.RigState) => R.RigState | null, okMsg?: string) => {
    const n = fn(st.current);
    if (n) {
      st.current = n;
      if (okMsg) setLog((l) => [okMsg, ...l].slice(0, 8));
    }
    bump((x) => x + 1);
  };
  const reset = () => {
    if (!window.confirm("Erase your whole mining room and start over?")) return;
    st.current = R.newRig();
    hist.current = [st.current.price];
    setLog(["Fresh start. Good luck!"]);
    setPick(0);
    bump((x) => x + 1);
    save();
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-chat">
      <header className={cn("flex shrink-0 items-center gap-2 border-b border-black/20 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        <button onClick={onBack} className="grid size-9 place-items-center rounded-full hover:bg-hover" aria-label="Back to games">
          <ArrowLeft className="size-5" />
        </button>
        <span className="text-xl">⛏️</span>
        <span className="min-w-0 flex-1 truncate font-bold">Bitcoin Mining Room</span>
        <button onClick={reset} className="grid size-9 place-items-center rounded-full text-sub hover:bg-hover hover:text-red-400" aria-label="Reset">
          <RotateCcw className="size-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-2xl space-y-3 p-3 sm:p-5">
          {off.secs > 60 && (
            <button onClick={() => setOff({ btc: 0, secs: 0 })} className="w-full rounded-xl bg-emerald-500/15 px-3 py-2 text-left text-sm text-emerald-300">
              Your PCs mined <b>{off.btc.toFixed(6)} ₿</b> while you were away (50% efficiency). Tap to dismiss.
            </button>
          )}
          {s.outage > 0 && <div className="rounded-xl bg-amber-500/15 px-3 py-2 text-sm text-amber-300">⚡ Power cut — back online in {Math.ceil(s.outage)}s</div>}

          <div className="rounded-2xl bg-side p-4">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-xs font-semibold uppercase text-sub">BTC price (game market)</div>
                <div className={cn("text-3xl font-black tabular-nums", up ? "text-emerald-400" : "text-red-400")}>${s.price.toLocaleString("en-US", { maximumFractionDigits: 0 })}</div>
              </div>
              <svg viewBox="0 0 300 60" className="h-14 w-40 sm:w-56" aria-hidden>
                <polyline points={pts} fill="none" stroke={up ? "#34d399" : "#f87171"} strokeWidth="2" />
              </svg>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile k="Cash" v={money(s.cash)} tone={s.cash < 0 ? "bad" : undefined} />
            <Tile k="Wallet" v={`${s.btc.toFixed(5)} ₿`} sub={`cap ${R.walletCap(s)}`} />
            <Tile k="Hashrate" v={`${fmt(R.hashPower(s))} H/s`} sub={eff < 1 ? `throttled ${Math.round(eff * 100)}%` : undefined} tone={eff < 1 ? "bad" : undefined} />
            <Tile k="Heat" v={`${R.rawPowerKw(s).toFixed(2)}/${R.coolCapacity(s).toFixed(1)} kW`} tone={eff < 1 ? "bad" : "good"} />
            <Tile k="Income" v={`${money(rev)}/s`} />
            <Tile k="Power bill" v={`${money(cost)}/s`} />
            <Tile k="Net" v={`${money(net)}/s`} tone={net >= 0 ? "good" : "bad"} />
            <Tile k="Halving in" v={`${Math.ceil(toHalving / 60)} min`} sub={`reward ×${R.rewardFactor(s.block)}`} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[0.25, 0.5, 1].map((f) => (
              <button key={f} onClick={() => act((x) => R.sellBtc(x, x.btc * f))} disabled={s.btc <= 0} className="rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">
                Sell {f === 1 ? "all" : `${f * 100}%`}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-2 text-xs text-sub">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto-sell to pay bills
            </label>
          </div>

          <div className="rounded-2xl bg-side p-3 text-xs text-sub">
            {room.emoji} <b className="text-white">{room.name}</b> · {s.pcs.length}/{R.slots(s)} PCs · difficulty ×{R.difficulty(s.block).toFixed(2)} · lifetime {s.totalBtc.toFixed(5)} ₿ · dust {Math.round(R.avgDust(s) * 100)}%
          </div>

          <div className="flex gap-1.5 overflow-x-auto">
            {(["pcs", "build", "room", "upgrades"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-semibold", tab === t ? "bg-accent text-white" : "bg-side text-sub")}>
                {t === "pcs" ? "🖥️ My PCs" : t === "build" ? "🛠️ Build" : t === "room" ? "🏠 Room & cooling" : "⚙️ Upgrades"}
              </button>
            ))}
          </div>

          {tab === "pcs" && (
            <div className="space-y-2">
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {Array.from({ length: R.slots(s) }, (_, i) => {
                  const pc = s.pcs[i];
                  const c = pc && R.CASES.find((x) => x.id === pc.case);
                  return (
                    <button key={i} onClick={() => pc && setPick(i)} className={cn("relative grid aspect-square place-items-center rounded-xl text-2xl", pc ? "bg-side" : "border border-dashed border-white/15 text-faint", pc && sel === i && "ring-2 ring-accent")} aria-label={pc ? `PC ${i + 1}` : "Empty slot"}>
                      {pc ? c?.emoji : "+"}
                      {pc && <span className="absolute inset-x-1 bottom-0.5 h-1 rounded-full bg-black/30"><span className="block h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, (R.pcHash(pc) / 200) * 100 + 8)}%` }} /></span>}
                      {pc && pc.dust > 0.5 && <span className="absolute right-1 top-0.5 text-[10px]">🌫️</span>}
                    </button>
                  );
                })}
              </div>
              {s.pcs[sel] && <PcCard s={s} i={sel} act={act} />}
              <button onClick={() => act(R.cleanAll, "🧹 Cleaned all PCs")} disabled={R.cleanCost(s) <= 0 || s.cash < R.cleanCost(s)} className="w-full rounded-xl bg-side px-3 py-3 text-sm font-bold disabled:opacity-45">
                🧹 Clean dust (+ restores hashrate) — {money(R.cleanCost(s))}
              </button>
            </div>
          )}

          {tab === "build" && (
            <div className="space-y-2">
              <p className="text-xs text-sub">Add a new computer to a free slot ({s.pcs.length}/{R.slots(s)}). Cost rises with every PC you own.</p>
              {R.CASES.filter((c) => c.cost > 0).map((c) => {
                const price = R.pcCost(s, c.id);
                const can = s.cash >= price && s.pcs.length < R.slots(s);
                return (
                  <Buy key={c.id} emoji={c.emoji} title={c.name} sub={`${c.slots} GPU slots · CPU ${c.cpu} H/s · ${c.watts} W`} price={money(price)} can={can} onClick={() => act((x) => R.buyPc(x, c.id), `🖥️ Built a ${c.name}`)} />
                );
              })}
              {s.pcs.length >= R.slots(s) && <p className="text-sm text-amber-300">Room is full — upgrade your room or scrap a PC.</p>}
            </div>
          )}

          {tab === "room" && (
            <div className="space-y-2">
              {nextRoom ? (
                <Buy emoji={nextRoom.emoji} title={`Move to: ${nextRoom.name}`} sub={`${nextRoom.slots} PC slots · ${nextRoom.cool} kW base cooling`} price={money(nextRoom.cost)} can={s.cash >= nextRoom.cost} onClick={() => act(R.upgradeRoom, `🏠 Moved to the ${nextRoom.name}!`)} />
              ) : (
                <p className="text-sm text-sub">You run a full data center. 🏢</p>
              )}
              <h3 className="pt-1 font-bold">Cooling</h3>
              {R.COOLING.map((c) => {
                const owned = s.cooling[c.id] || 0;
                const price = R.coolingCost(c, owned);
                return <Buy key={c.id} emoji={c.emoji} title={`${c.name} · owned ${owned}`} sub={`+${c.kw} kW cooling capacity`} price={money(price)} can={s.cash >= price} onClick={() => act((x) => R.buyCooling(x, c.id), `${c.emoji} Installed ${c.name}`)} />;
              })}
            </div>
          )}

          {tab === "upgrades" && (
            <div className="space-y-2">
              {R.UPGRADES.filter((u) => !s.upgrades.includes(u.id)).map((u) => (
                <Buy key={u.id} emoji="⚙️" title={u.name} sub={u.desc} price={money(u.cost)} can={s.cash >= u.cost} onClick={() => act((x) => R.buyUpgrade(x, u.id), `⚙️ ${u.name} installed`)} />
              ))}
              {R.UPGRADES.every((u) => s.upgrades.includes(u.id)) && <p className="text-sm text-sub">All upgrades installed 🎉</p>}
            </div>
          )}

          <div className="rounded-2xl bg-side p-4">
            <div className="mb-1 font-bold">Room log</div>
            {log.map((l, i) => (
              <div key={i} className="py-0.5 text-sm text-sub">{l}</div>
            ))}
          </div>
          <p className="pb-4 text-center text-[11px] text-faint">A game, not financial advice — prices and mining are simulated and use no real money or crypto.</p>
        </div>
      </div>
    </div>
  );
}

function PcCard({ s, i, act }: { s: R.RigState; i: number; act: (fn: (x: R.RigState) => R.RigState | null, msg?: string) => void }) {
  const pc = s.pcs[i];
  const c = R.CASES.find((x) => x.id === pc.case)!;
  return (
    <div className="rounded-2xl bg-side p-3">
      <div className="flex items-center gap-2">
        <span className="text-3xl">{c.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="font-bold">#{i + 1} {c.name}</div>
          <div className="text-xs text-sub">{fmt(R.pcHash(pc))} H/s · {R.pcWatts(pc)} W · GPUs {pc.gpus.length}/{c.slots} · dust {Math.round(pc.dust * 100)}%</div>
        </div>
        <button onClick={() => act((x) => R.scrapPc(x, i), "♻️ Scrapped a PC")} disabled={s.pcs.length <= 1} className="rounded-full bg-black/30 px-3 py-1.5 text-xs font-bold text-sub disabled:opacity-40">Scrap</button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {pc.gpus.map((g, k) => (
          <span key={k} className="rounded-lg bg-black/30 px-2 py-1 text-xs">{R.GPUS.find((x) => x.id === g)?.emoji} {R.GPUS.find((x) => x.id === g)?.name}</span>
        ))}
        {Array.from({ length: c.slots - pc.gpus.length }, (_, k) => (
          <span key={`e${k}`} className="rounded-lg border border-dashed border-white/15 px-2 py-1 text-xs text-faint">empty</span>
        ))}
      </div>
      {pc.gpus.length < c.slots && (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {R.GPUS.map((g) => (
            <button key={g.id} onClick={() => act((x) => R.buyGpu(x, i, g.id), `${g.emoji} Installed ${g.name}`)} disabled={s.cash < g.cost} className="rounded-xl bg-black/25 px-2 py-2 text-left text-xs disabled:opacity-45">
              <b>{g.emoji} {g.name}</b>
              <div className="text-sub">{g.hash} H/s · {g.watts} W · {money(g.cost)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Buy({ emoji, title, sub, price, can, onClick }: { emoji: string; title: string; sub: string; price: string; can: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={!can} className={cn("flex w-full items-center gap-3 rounded-2xl bg-side p-3 text-left", can ? "hover:bg-hover" : "opacity-55")}>
      <span className="text-3xl">{emoji}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{title}</span>
        <span className="block text-xs text-sub">{sub}</span>
      </span>
      <span className={cn("shrink-0 rounded-full px-3 py-1.5 text-sm font-bold tabular-nums", can ? "bg-emerald-500/20 text-emerald-300" : "bg-black/25 text-sub")}>{price}</span>
    </button>
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
