"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ScrollText, ShoppingBag, Volume2, VolumeX, X } from "lucide-react";
import { cn } from "@/lib/utils";
import * as B from "@/lib/sim/bottle";
import { play, setMuted, unlockAudio } from "@/lib/sim/sfx";
import { buildTown } from "@/lib/sim/town";
import { BottleWorld, type Target } from "./engine";
import ReturnMachine, { type MachineApi } from "./ReturnMachine";

const KEY = "nexus.sim.bottlerun";
type Panel = null | "shop" | "quests" | "talk" | "machine";
type Toast = { id: number; text: string };
type Talk = { npc: string; name: string; talk: B.Talk };

function loadSave(): B.Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<B.Save>;
      if (s.v === 1) return { ...B.newSave(), ...s, quests: { ...B.newQuests(), ...(s.quests ?? {}) } } as B.Save;
    }
  } catch {
    /* fresh start */
  }
  return B.newSave();
}

export default function BottleRun({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const world = useRef<BottleWorld | null>(null);
  const panelRef = useRef<Panel>(null);
  const keys = useRef({ up: false, down: false, left: false, right: false });
  const joy = useRef({ x: 0, y: 0, id: -1, ox: 0, oy: 0 });
  const [knob, setKnob] = useState<{ x: number; y: number } | null>(null);
  const [panel, setPanelState] = useState<Panel>(null);
  const [talk, setTalk] = useState<Talk | null>(null);
  const [tab, setTab] = useState<"upgrades" | "pets" | "vehicles">("upgrades");
  const [qtab, setQtab] = useState<"main" | "side">("main");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [target, setTarget] = useState<Target>(null);
  const [, bump] = useState(0);
  const [muted, setMutedState] = useState(false);
  const [ready, setReady] = useState(false);
  const tid = useRef(1);
  const town = useRef(buildTown());

  const setPanel = (p: Panel) => {
    panelRef.current = p;
    setPanelState(p);
  };

  const toast = useCallback((text: string) => {
    const id = tid.current++;
    setToasts((t) => [...t.slice(-3), { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const persist = useCallback(() => {
    const w = world.current;
    if (!w) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(w.save));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const emit = useCallback(
    (ev: B.QEvent) => {
      const w = world.current;
      if (!w) return;
      const r = B.applyEvent(w.save.quests, ev);
      w.save.quests = r.state;
      for (const id of r.finished) {
        const q = B.questById(id);
        if (!q) continue;
        const giver = town.current.npcs.find((n) => n.id === q.giver);
        toast(`✅ ${q.title} complete — talk to ${giver?.name ?? "the quest giver"} to claim ${q.reward} Ft`);
        play("quest");
      }
    },
    [toast],
  );

  // boot
  useEffect(() => {
    const cv = canvas.current;
    const box = wrap.current;
    if (!cv || !box) return;
    const save = loadSave();
    setMuted(save.muted);
    setMutedState(save.muted);
    const w = new BottleWorld(cv, save, {
      onEvent: emit,
      onSfx: play,
      onToast: toast,
      onChange: () => bump((n) => n + 1),
    });
    world.current = w;
    const fit = () => {
      const r = box.getBoundingClientRect();
      w.resize(Math.max(200, r.width), Math.max(200, r.height), Math.min(2, window.devicePixelRatio || 1));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    setReady(true);
    if (!Object.keys(save.quests.status).length) toast("Welcome! Find Béla bácsi (!) in the park to start your first quest.");

    let raf = 0;
    let last = performance.now();
    let hud = 0;
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (!panelRef.current) {
        const k = keys.current;
        const j = joy.current;
        w.input = { dx: (k.right ? 1 : 0) - (k.left ? 1 : 0) + j.x, dy: (k.down ? 1 : 0) - (k.up ? 1 : 0) + j.y };
        w.update(dt);
      } else w.input = { dx: 0, dy: 0 };
      w.draw();
      hud += dt;
      if (hud > 0.2) {
        hud = 0;
        setTarget(w.target());
        bump((n) => n + 1);
        const m = miniRef.current;
        const g = m?.getContext("2d");
        if (m && g) w.drawMinimap(g, m.width);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const saver = setInterval(persist, 4000);
    const onHide = () => document.visibilityState === "hidden" && persist();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(saver);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onHide);
      persist();
    };
  }, [emit, persist, toast]);

  const interact = useCallback(() => {
    const w = world.current;
    if (!w || panelRef.current) return;
    unlockAudio();
    const t = w.target();
    if (!t) return;
    if (t.type === "machine") {
      setPanel("machine");
      return;
    }
    const tk = B.talkTo(w.save.quests, t.id);
    play("pet");
    setTalk({ npc: t.id, name: t.name, talk: tk });
    setPanel("talk");
  }, []);

  // keyboard
  useEffect(() => {
    const map: Record<string, "up" | "down" | "left" | "right"> = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input,textarea")) return;
      const k = map[e.code];
      if (k) {
        keys.current[k] = true;
        e.preventDefault();
      } else if (e.code === "KeyE" || e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        interact();
      } else if (e.code === "Escape") setPanel(null);
      else if (e.code === "KeyB") setPanel(panelRef.current === "shop" ? null : "shop");
      else if (e.code === "KeyQ") setPanel(panelRef.current === "quests" ? null : "quests");
    };
    const up = (e: KeyboardEvent) => {
      const k = map[e.code];
      if (k) keys.current[k] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [interact]);

  const api: MachineApi = {
    save: () => world.current!.save,
    mutate: (fn) => {
      fn(world.current!.save);
      bump((n) => n + 1);
    },
    emit,
    toast,
  };

  const w = world.current;
  const save = w?.save;
  const perks = save ? B.perks(save) : null;

  /* ───────── actions ───────── */
  const buy = (r: B.BuyResult, ev: B.QEvent) => {
    if (!w) return;
    if ("error" in r) {
      play("error");
      toast(r.error);
      return;
    }
    const riding = r.save.riding;
    Object.assign(w.save, r.save, { riding });
    w.syncPets();
    play("buy");
    emit(ev);
    persist();
    bump((n) => n + 1);
  };

  const doTalk = (kind: "accept" | "claim") => {
    if (!w || !talk) return;
    if (talk.talk.kind === "offer" && kind === "accept") {
      w.save.quests = B.startQuest(w.save.quests, talk.talk.quest.id);
      toast(`📜 New quest: ${talk.talk.quest.title}`);
      play("quest");
    } else if (talk.talk.kind === "claim" && kind === "claim") {
      const c = B.claimQuest(w.save.quests, talk.talk.quest.id);
      if (c) {
        w.save.quests = c.state;
        w.save.money += c.reward;
        toast(`💰 Quest reward: +${c.reward} Ft`);
        play("coin");
      }
    }
    persist();
    setTalk(null);
    setPanel(null);
  };

  const joyStart = (e: React.PointerEvent) => {
    unlockAudio();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    joy.current = { ...joy.current, id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
    setKnob({ x: 0, y: 0 });
  };
  const joyMove = (e: React.PointerEvent) => {
    if (joy.current.id !== e.pointerId) return;
    const dx = e.clientX - joy.current.ox;
    const dy = e.clientY - joy.current.oy;
    const m = 46;
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, d / m);
    joy.current.x = (dx / d) * k;
    joy.current.y = (dy / d) * k;
    setKnob({ x: (dx / d) * Math.min(d, m), y: (dy / d) * Math.min(d, m) });
  };
  const joyEnd = (e: React.PointerEvent) => {
    if (joy.current.id !== e.pointerId) return;
    joy.current = { ...joy.current, id: -1, x: 0, y: 0 };
    setKnob(null);
  };

  const active = save ? B.activeQuests(save.quests) : [];
  const tracked = active.find((q) => save?.quests.status[q.id] === "ready") ?? active.find((q) => q.main) ?? active[0];
  const trackedGiver = tracked ? town.current.npcs.find((n) => n.id === tracked.giver) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col bg-chat">
      <div ref={wrap} className="relative min-h-0 flex-1 touch-none select-none overflow-hidden bg-[#1f3a1a]">
        <canvas ref={canvas} className="absolute inset-0 size-full" />

        {ready && save && perks && (
          <>
            {/* top-left: back + money + bag */}
            <div className={cn("pointer-events-none absolute left-2 flex items-start gap-2", mobile ? "top-[max(0.5rem,env(safe-area-inset-top))]" : "top-2")}>
              <button onClick={onBack} className="pointer-events-auto grid size-10 place-items-center rounded-full bg-black/55 text-white backdrop-blur" aria-label="Back to games">
                <ArrowLeft className="size-5" />
              </button>
              <div className="rounded-2xl bg-black/60 px-3 py-1.5 text-white backdrop-blur">
                <div className="text-lg font-black leading-tight tabular-nums">💰 {B.fmtMoney(save.money)}</div>
                <div className="text-[11px] font-semibold text-white/75">
                  🛍️ {save.bag.length}/{perks.capacity}
                  {save.riding !== "none" && ` · ${B.VEHICLES.find((v) => v.id === save.riding)?.emoji}`}
                </div>
              </div>
            </div>

            {/* top-right: minimap + buttons */}
            <div className={cn("absolute right-2 flex flex-col items-end gap-2", mobile ? "top-[max(0.5rem,env(safe-area-inset-top))]" : "top-2")}>
              <canvas ref={miniRef} width={120} height={88} className="rounded-xl border-2 border-white/60 bg-black/40" aria-label="Mini map" />
              <div className="flex gap-1.5">
                <HudBtn label="Quests" onClick={() => setPanel("quests")}>
                  <ScrollText className="size-4" />
                  {active.some((q) => save.quests.status[q.id] === "ready") && <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-emerald-400" />}
                </HudBtn>
                <HudBtn label="Shop" onClick={() => setPanel("shop")}>
                  <ShoppingBag className="size-4" />
                </HudBtn>
                <HudBtn
                  label={muted ? "Unmute" : "Mute"}
                  onClick={() => {
                    const m = !muted;
                    setMutedState(m);
                    setMuted(m);
                    save.muted = m;
                    unlockAudio();
                  }}
                >
                  {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                </HudBtn>
              </div>
            </div>

            {/* quest tracker */}
            {tracked && (
              <div className="pointer-events-none absolute left-2 top-[4.4rem] max-w-[55%] rounded-xl bg-black/55 px-3 py-2 text-xs text-white backdrop-blur sm:max-w-xs">
                <div className="font-bold">{tracked.main ? "⭐" : "📜"} {tracked.title}</div>
                {save.quests.status[tracked.id] === "ready" ? (
                  <div className="text-emerald-300">Ready! Talk to {trackedGiver?.name}</div>
                ) : (
                  tracked.objectives.map((o, i) => (
                    <div key={i} className="text-white/80">
                      {o.label}: {Math.min(o.target, save.quests.prog[tracked.id]?.[i] ?? 0)}/{o.target}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* toasts */}
            <div className="pointer-events-none absolute inset-x-0 bottom-36 flex flex-col items-center gap-1.5 px-3 sm:bottom-24">
              {toasts.map((t) => (
                <div key={t.id} className="max-w-sm rounded-full bg-black/75 px-4 py-2 text-center text-sm font-semibold text-white shadow-lg backdrop-blur">
                  {t.text}
                </div>
              ))}
            </div>

            {/* controls */}
            <div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 size-32 touch-none rounded-full bg-white/10 ring-2 ring-white/25 sm:hidden" onPointerDown={joyStart} onPointerMove={joyMove} onPointerUp={joyEnd} onPointerCancel={joyEnd}>
              <div className="absolute left-1/2 top-1/2 size-14 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/45" style={knob ? { transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` } : undefined} />
            </div>
            <button
              onClick={interact}
              disabled={!target}
              className={cn("absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-4 grid min-h-20 min-w-20 place-items-center rounded-full px-4 text-center text-xs font-extrabold shadow-xl transition", target ? "bg-amber-400 text-black active:scale-95" : "bg-white/15 text-white/50")}
            >
              {target ? target.label : "Walk up to someone"}
            </button>
            <div className="pointer-events-none absolute bottom-2 left-1/2 hidden -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-[11px] text-white/80 sm:block">WASD / arrows move · E talk &amp; use · B shop · Q quests</div>
          </>
        )}

        {/* overlays */}
        {panel === "machine" && w && <ReturnMachine api={api} onClose={() => { persist(); setPanel(null); }} />}

        {panel === "talk" && talk && w && (
          <Modal onClose={() => { setTalk(null); setPanel(null); }} title={talk.name}>
            {talk.talk.kind === "chat" && <p className="text-base">“{talk.talk.line}”</p>}
            {talk.talk.kind === "offer" && (
              <>
                <div className="mb-1 text-xs font-bold uppercase text-amber-300">{talk.talk.quest.main ? "Main quest" : "Side quest"} · {talk.talk.quest.title}</div>
                <p className="text-base">“{talk.talk.quest.intro}”</p>
                <ul className="mt-2 space-y-0.5 text-sm text-sub">
                  {talk.talk.quest.objectives.map((o, i) => (
                    <li key={i}>• {o.label} ({o.target})</li>
                  ))}
                </ul>
                <div className="mt-1 text-sm font-semibold text-emerald-300">Reward: {B.fmtMoney(talk.talk.quest.reward)}</div>
                <button onClick={() => doTalk("accept")} className="mt-4 w-full rounded-xl bg-accent py-3 font-bold text-white">Accept quest</button>
              </>
            )}
            {talk.talk.kind === "claim" && (
              <>
                <p className="text-base">“{talk.talk.quest.done}”</p>
                <button onClick={() => doTalk("claim")} className="mt-4 w-full rounded-xl bg-emerald-600 py-3 font-bold text-white">Claim {B.fmtMoney(talk.talk.quest.reward)}</button>
              </>
            )}
          </Modal>
        )}

        {panel === "shop" && w && save && (
          <Modal onClose={() => setPanel(null)} title={`Shop · ${B.fmtMoney(save.money)}`} wide>
            <div className="mb-3 flex gap-1.5">
              {(["upgrades", "pets", "vehicles"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={cn("rounded-full px-3.5 py-1.5 text-sm font-semibold capitalize", tab === t ? "bg-accent text-white" : "bg-black/25 text-sub")}>
                  {t}
                </button>
              ))}
            </div>
            <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
              {tab === "upgrades" &&
                B.UPGRADES.map((u) => {
                  const l = B.lvl(save, u.id);
                  const maxed = l >= u.max;
                  const cost = B.upgradeCost(u, l);
                  return (
                    <Row key={u.id} emoji={u.emoji} title={`${u.name} · Lv ${l}/${u.max}`} sub={u.desc} btn={maxed ? "MAX" : B.fmtMoney(cost)} disabled={maxed || save.money < cost} onClick={() => buy(B.buyUpgrade(save, u.id), { t: "upgrade" })} />
                  );
                })}
              {tab === "pets" &&
                B.PETS.map((p) => {
                  const own = save.pets.includes(p.id);
                  return <Row key={p.id} emoji={p.emoji} title={p.name} sub={p.desc} btn={own ? "Owned ✓" : B.fmtMoney(p.cost)} disabled={own || save.money < p.cost} onClick={() => buy(B.buyPet(save, p.id), { t: "pet" })} />;
                })}
              {tab === "vehicles" &&
                B.VEHICLES.map((v) => {
                  const own = save.vehicles.includes(v.id);
                  const on = save.riding === v.id;
                  return (
                    <Row
                      key={v.id}
                      emoji={v.emoji}
                      title={v.name}
                      sub={v.id === "none" ? "Walk everywhere" : `${v.speed}× speed · +${v.bag} bag space`}
                      btn={own ? (on ? "Riding ✓" : "Ride") : B.fmtMoney(v.cost)}
                      disabled={on || (!own && save.money < v.cost)}
                      onClick={() => {
                        if (own) {
                          save.riding = v.id;
                          play("buy");
                          persist();
                          bump((n) => n + 1);
                        } else buy(B.buyVehicle(save, v.id), { t: "vehicle" });
                      }}
                    />
                  );
                })}
            </div>
          </Modal>
        )}

        {panel === "quests" && w && save && (
          <Modal onClose={() => setPanel(null)} title="Quest log" wide>
            <div className="mb-3 flex gap-1.5">
              {(["main", "side"] as const).map((t) => (
                <button key={t} onClick={() => setQtab(t)} className={cn("rounded-full px-3.5 py-1.5 text-sm font-semibold", qtab === t ? "bg-accent text-white" : "bg-black/25 text-sub")}>
                  {t === "main" ? "⭐ Main story" : "📜 Side quests"}
                </button>
              ))}
            </div>
            <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
              {B.QUESTS.filter((q) => q.main === (qtab === "main")).map((q) => {
                const st = save.quests.status[q.id];
                const giver = town.current.npcs.find((n) => n.id === q.giver);
                const locked = !st && !B.isAvailable(q, save.quests);
                return (
                  <div key={q.id} className={cn("rounded-xl bg-black/25 p-3", st === "done" && "opacity-55")}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-bold">{locked ? "🔒 " : st === "done" ? "✅ " : st === "ready" ? "🎁 " : ""}{q.title}</div>
                      <div className="shrink-0 text-xs font-semibold text-emerald-300">{B.fmtMoney(q.reward)}</div>
                    </div>
                    {locked ? (
                      <div className="text-xs text-sub">Finish “{B.questById(q.requires ?? "")?.title}” first.</div>
                    ) : !st ? (
                      <div className="text-xs text-sub">Available — talk to {giver?.name}.</div>
                    ) : st === "ready" ? (
                      <div className="text-xs text-emerald-300">Done! Talk to {giver?.name} to claim your reward.</div>
                    ) : st === "active" ? (
                      q.objectives.map((o, i) => {
                        const v = Math.min(o.target, save.quests.prog[q.id]?.[i] ?? 0);
                        return (
                          <div key={i} className="mt-1">
                            <div className="flex justify-between text-xs text-sub">
                              <span>{o.label}</span>
                              <span className="tabular-nums">{v}/{o.target}</span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-black/30">
                              <div className="h-full bg-accent" style={{ width: `${(v / o.target) * 100}%` }} />
                            </div>
                          </div>
                        );
                      })
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Modal>
        )}
      </div>
    </div>
  );
}

function HudBtn({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} aria-label={label} className="pointer-events-auto relative grid size-10 place-items-center rounded-full bg-black/55 text-white backdrop-blur active:scale-95">
      {children}
    </button>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-black/55 p-3" onClick={onClose}>
      <div className={cn("w-full rounded-2xl bg-side p-4 text-white shadow-2xl", wide ? "max-w-lg" : "max-w-sm")} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-lg font-extrabold">{title}</div>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-full hover:bg-hover" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Row({ emoji, title, sub, btn, disabled, onClick }: { emoji: string; title: string; sub: string; btn: string; disabled?: boolean; onClick: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-black/25 p-2.5">
      <span className="text-3xl">{emoji}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold">{title}</div>
        <div className="text-xs text-sub">{sub}</div>
      </div>
      <button onClick={onClick} disabled={disabled} className={cn("shrink-0 rounded-full px-3 py-1.5 text-sm font-bold tabular-nums", disabled ? "bg-black/30 text-sub" : "bg-emerald-600 text-white active:scale-95")}>
        {btn}
      </button>
    </div>
  );
}
