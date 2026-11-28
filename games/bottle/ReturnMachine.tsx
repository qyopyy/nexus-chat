"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import * as B from "@/lib/sim/bottle";
import { play } from "@/lib/sim/sfx";

export type MachineApi = {
  save: () => B.Save;
  mutate: (fn: (s: B.Save) => void) => void;
  emit: (ev: B.QEvent) => void;
  toast: (msg: string) => void;
};

type Flight = { id: number; emoji: string; dx: number; dy: number };
type Screen = { text: string; sub: string; tone: "idle" | "work" | "ok" | "bad" };

const PEOPLE = ["🧑‍🦳", "👩‍🦰", "🧔", "👵", "🧑‍🦱", "👨‍🦲"];

/** Animated counter that eases toward the real value. */
function useCount(target: number) {
  const [v, setV] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      cur.current += (target - cur.current) * 0.18;
      if (Math.abs(target - cur.current) < 0.6) cur.current = target;
      setV(cur.current);
      if (cur.current !== target) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return Math.round(v);
}

export default function ReturnMachine({ api, onClose }: { api: MachineApi; onClose: () => void }) {
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const sess = useRef<B.Session>(B.newSession(2 + Math.floor(Math.random() * 3)));
  const [screen, setScreen] = useState<Screen>({ text: "READY", sub: "Tap a bottle or hold THROW", tone: "idle" });
  const [flights, setFlights] = useState<Flight[]>([]);
  const [popup, setPopup] = useState<{ id: number; text: string; bad?: boolean }[]>([]);
  const last = useRef(0);
  const holding = useRef(false);
  const fid = useRef(1);
  const timers = useRef<number[]>([]);

  const save = api.save();
  const p = B.perks(save);
  const money = useCount(save.money);

  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(fn, ms);
    timers.current.push(t);
  };

  const throwAt = (index: number, wiped: boolean) => {
    const now = performance.now();
    if (now - last.current < p.throwCooldown * 1000) return;
    const s = api.save();
    const item = s.bag[index];
    if (!item) return;
    // a dirty item needs a wipe first
    if (item.dirty && !wiped) {
      api.mutate((x) => {
        x.bag[index] = { ...x.bag[index], dirty: false };
      });
      play("pickup");
      setScreen({ text: "WIPED", sub: "Now it will be accepted", tone: "work" });
      last.current = now - p.throwCooldown * 700;
      rerender();
      return;
    }
    last.current = now;
    // the odd squashed bottle gets spat back out (streak breaks, half the bonus is banked)
    if (Math.random() < 0.04) {
      const rej = B.throwItem(sess.current, { ...item, dirty: true }, p, false);
      sess.current = rej.session;
      api.mutate((x) => {
        x.money += rej.gain;
        x.earnedTotal += rej.gain;
      });
      play("throw");
      later(() => {
        play("error");
        setScreen({ text: "REJECTED", sub: "Item is squashed — try again", tone: "bad" });
      }, 260);
      rerender();
      return;
    }
    const res = B.throwItem(sess.current, item, p, true);
    sess.current = res.session;
    api.mutate((x) => {
      x.bag.splice(index, 1);
      x.money += res.gain;
      x.earnedTotal += res.gain;
      x.returned += 1;
      x.bestStreak = Math.max(x.bestStreak, sess.current.streak);
    });
    const id = fid.current++;
    setFlights((f) => [...f.slice(-6), { id, emoji: B.KINDS[item.kind].emoji, dx: 30 + Math.random() * 20, dy: -150 - Math.random() * 20 }]);
    play("throw");
    setScreen({ text: "PROCESSING…", sub: B.KINDS[item.kind].label, tone: "work" });
    later(() => {
      play("clink");
      later(() => {
        play("beep");
        play("coin");
        setScreen({ text: "ACCEPTED", sub: `+${res.gain} Ft`, tone: "ok" });
        const pid = fid.current++;
        setPopup((q) => [...q.slice(-4), { id: pid, text: `+${res.gain} Ft` }]);
        later(() => setPopup((q) => q.filter((x) => x.id !== pid)), 900);
      }, 110);
    }, 260);
    later(() => setFlights((f) => f.filter((x) => x.id !== id)), 520);
    api.emit({ t: "return", kind: item.kind });
    api.emit({ t: "earn", amount: res.gain });
    api.emit({ t: "streak", n: sess.current.streak });
    rerender();
  };

  const quickThrow = () => {
    const i = api.save().bag.findIndex((it) => !it.dirty);
    if (i >= 0) throwAt(i, true);
    else if (api.save().bag.length) setScreen({ text: "DIRTY", sub: "Tap the sticky ones to wipe them", tone: "bad" });
  };

  // hold-to-throw loop
  useEffect(() => {
    const id = setInterval(() => {
      if (holding.current) quickThrow();
    }, 60);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // queue patience
  useEffect(() => {
    const id = setInterval(() => {
      const r = B.tickCalm(sess.current, 0.25, B.perks(api.save()));
      sess.current = r.session;
      if (r.stormedOff) {
        play("error");
        api.toast("The queue got angry and left — streak lost!");
        api.mutate((x) => {
          x.money += 0;
        });
      }
      rerender();
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      timers.current.forEach((t) => clearTimeout(t));
    },
    [],
  );

  const finish = () => {
    const c = B.closeSession(sess.current);
    sess.current = c.session;
    if (c.payout > 0) {
      api.mutate((x) => {
        x.money += c.payout;
        x.earnedTotal += c.payout;
      });
      api.emit({ t: "earn", amount: c.payout });
      play("coin");
      api.toast(`Streak bonus paid: +${c.payout} Ft`);
    }
    api.emit({ t: "session", earned: c.session.earned });
    onClose();
  };

  const s = sess.current;
  const calmTone = s.calm > 66 ? "bg-emerald-500" : s.calm > 33 ? "bg-amber-400" : "bg-red-500";
  const bag = save.bag;

  return (
    <div className="absolute inset-0 z-40 flex flex-col overflow-hidden bg-gradient-to-b from-[#e8eef2] to-[#c9d3da] text-black">
      <style>{`@keyframes brThrow{0%{transform:translate(0,0) rotate(0) scale(1);opacity:1}60%{transform:translate(calc(var(--dx)*.7),calc(var(--dy)*.9)) rotate(300deg) scale(.9)}100%{transform:translate(var(--dx),var(--dy)) rotate(560deg) scale(.45);opacity:.2}}@keyframes brPop{0%{transform:translateY(0);opacity:1}100%{transform:translateY(-46px);opacity:0}}`}</style>
      <div className="flex items-center gap-2 px-3 pt-3">
        <div className="rounded-2xl bg-black/80 px-4 py-2 text-white">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/60">Money</div>
          <div className="text-2xl font-black tabular-nums">{B.fmtMoney(money)}</div>
        </div>
        <div className="min-w-0 flex-1 rounded-2xl bg-white/70 px-3 py-2 text-sm">
          <div className="flex justify-between font-semibold">
            <span>{B.calmLabel(s.calm)} queue</span>
            <span className="tabular-nums">{Math.round(s.calm)}%</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/15">
            <div className={cn("h-full transition-all", calmTone)} style={{ width: `${s.calm}%` }} />
          </div>
          <div className="mt-1 text-[11px] text-black/60">{s.queue > 0 ? `${PEOPLE.slice(0, s.queue).join(" ")} waiting behind you` : "Nobody is waiting"}</div>
        </div>
        <button onClick={finish} className="grid size-10 shrink-0 place-items-center rounded-full bg-black/80 text-white" aria-label="Leave the machine">
          <X className="size-5" />
        </button>
      </div>

      {/* the machine */}
      <div className="relative mx-auto mt-3 w-full max-w-md flex-1 px-4">
        <div className="relative mx-auto h-full max-h-[22rem] min-h-[15rem] rounded-t-[2rem] border-x-[10px] border-t-[10px] border-[#14161a] bg-[#fde047] shadow-xl">
          <div className="absolute left-4 right-4 top-3 flex items-center justify-between text-[11px] font-black tracking-widest text-black/70">
            <span>RETURN POINT</span>
            <span>♻️ 50 Ft / pcs</span>
          </div>
          <div className="absolute left-1/2 top-9 size-28 -translate-x-1/2 rounded-full border-[10px] border-[#0f1114] bg-[#06080a] shadow-inner">
            <div className="absolute inset-2 rounded-full border-4 border-emerald-500/80" />
            {flights.map((f) => (
              <span key={f.id} className="absolute left-1/2 top-[11rem] text-3xl" style={{ ["--dx" as string]: `${f.dx - 16}px`, ["--dy" as string]: `${f.dy}px`, animation: "brThrow .34s ease-in forwards" }}>
                {f.emoji}
              </span>
            ))}
          </div>
          <div className={cn("absolute right-4 top-12 w-28 rounded-lg px-2 py-1.5 text-center font-mono text-[11px] font-bold leading-tight", screen.tone === "ok" ? "bg-emerald-400" : screen.tone === "bad" ? "bg-red-400" : screen.tone === "work" ? "bg-amber-300" : "bg-white")}>
            <div>{screen.text}</div>
            <div className="text-[10px] opacity-70">{screen.sub}</div>
          </div>
          <div className="absolute inset-x-6 bottom-4 rounded-2xl bg-black/10 p-3 text-center">
            <div className="text-xl font-black">
              {s.streak > 0 ? `x${s.streak} streak` : "No streak"} <span className="text-black/60">· +{s.bonus} Ft bonus</span>
            </div>
            <div className="text-[11px] text-black/60">Bonus is paid when you leave the machine. A rejected item halves it.</div>
          </div>
          {popup.map((x) => (
            <span key={x.id} className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 text-2xl font-black text-emerald-700" style={{ animation: "brPop .9s ease-out forwards" }}>
              {x.text}
            </span>
          ))}
        </div>
      </div>

      {/* bag */}
      <div className="rounded-t-3xl bg-white px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_30px_rgba(0,0,0,.25)]">
        <div className="mb-2 flex items-center justify-between text-sm font-semibold">
          <span>
            🛍️ Your bag · {bag.length}/{p.capacity}
          </span>
          <span className="text-xs text-black/50">Tap sticky 🟤 items to wipe</span>
        </div>
        <div className="mb-3 flex max-h-28 min-h-14 flex-wrap gap-1.5 overflow-y-auto">
          {bag.length === 0 && <div className="w-full py-3 text-center text-sm text-black/50">Bag is empty — go pick up litter around town!</div>}
          {bag.map((it, i) => (
            <button key={i} onClick={() => throwAt(i, false)} className={cn("relative grid size-12 place-items-center rounded-xl bg-black/5 text-2xl active:scale-90", it.dirty && "ring-2 ring-amber-700/70")} aria-label={`${B.KINDS[it.kind].label}${it.dirty ? " (dirty)" : ""}`}>
              {B.KINDS[it.kind].emoji}
              {it.dirty && <span className="absolute -right-0.5 -top-0.5 text-xs">🟤</span>}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onPointerDown={() => {
              holding.current = true;
              quickThrow();
            }}
            onPointerUp={() => (holding.current = false)}
            onPointerLeave={() => (holding.current = false)}
            onPointerCancel={() => (holding.current = false)}
            disabled={bag.length === 0}
            className="flex-1 select-none rounded-2xl bg-black py-4 text-lg font-extrabold text-white active:scale-[.98] disabled:opacity-40"
          >
            🤾 Hold to THROW
          </button>
          <button onClick={finish} className="rounded-2xl bg-black/10 px-5 py-4 text-sm font-bold">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
