"use client";

import { useEffect, useState } from "react";
import { Check, Crown, X } from "lucide-react";
import { useApp, closeModal, toast } from "@/store/app";
import { openConversation, refreshChatList } from "@/lib/data";
import { PLANS, activePlan, cancelOrder, createOrder, myOrders, useMyTier, type Order, type Plan } from "@/lib/premium";
import { cn } from "@/lib/utils";

const STATUS: Record<Order["status"], string> = { pending: "Waiting for qyopy", awaiting_payment: "Waiting for your payment", paid: "Paid — activating", fulfilled: "Active", cancelled: "Cancelled" };

/** Nexus Premium — plans + buying (friend request + message to qyopy, PayPal sent privately) */
export default function PremiumModal({ focus }: { focus?: string | null }) {
  const me = useApp((s) => (s.userId ? s.profiles[s.userId] : undefined));
  const tier = useMyTier();
  const current = activePlan(me);
  const [months, setMonths] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [done, setDone] = useState<{ plan: Plan; amount: number; order: number; conv: string } | null>(null);
  useEffect(() => void myOrders().then(setOrders), []);

  const buy = async (p: Plan) => {
    setBusy(p.id);
    try {
      const r = await createOrder(p.id, months);
      setDone({ plan: p, amount: r.amount, order: r.order_id, conv: r.conversation_id });
      void myOrders().then(setOrders);
      void refreshChatList();
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(null);
  };

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-black/80 backdrop-blur-sm" onClick={closeModal}>
      <div className="mx-auto max-w-6xl p-4 pt-safe-4 sm:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="mb-6 flex items-start gap-3 text-white">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-sm font-bold tracking-widest text-[#ffd400] uppercase">
              <Crown className="size-4" /> Nexus Premium
            </div>
            <h1 className="mt-1 text-3xl font-black sm:text-4xl">Light up Nexus ⚡</h1>
            <p className="mt-1 max-w-2xl text-sm text-white/75">
              Pick a plan. Your order goes straight to qyopy — you&apos;ll get a friend request & chat with him, and he sends you the PayPal address privately. Your plan switches on as soon as the payment is
              confirmed.
            </p>
            {current && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm">
                {current.emoji} You have <b>{current.short}</b> until {new Date(me!.premium_until!).toLocaleDateString([], { dateStyle: "medium" })}
              </div>
            )}
          </div>
          <button onClick={closeModal} className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>

        <div className="mb-4 flex items-center gap-2 text-sm text-white">
          <span className="text-white/70">Length</span>
          {[1, 3, 6, 12].map((m) => (
            <button key={m} onClick={() => setMonths(m)} className={cn("rounded-full px-3 py-1.5 font-semibold", months === m ? "bg-white text-black" : "bg-white/10 hover:bg-white/15")}>
              {m} month{m > 1 ? "s" : ""}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {PLANS.map((p) => {
            const owned = tier >= p.rank;
            return (
              <div
                key={p.id}
                className={cn("flex flex-col rounded-3xl bg-[#14141f] p-4 text-white ring-1 ring-white/10", focus === p.id && "ring-2", p.rank === 3 && "lg:-translate-y-2")}
                style={focus === p.id || p.rank === 3 ? { boxShadow: `0 0 0 2px ${p.color}` } : undefined}
              >
                {p.rank === 3 && <div className="mb-2 self-start rounded-full px-2 py-0.5 text-[10px] font-black text-black uppercase" style={{ background: p.color }}>Most popular</div>}
                <div className="text-3xl">{p.emoji}</div>
                <div className="mt-1 text-sm leading-tight font-bold">{p.name}</div>
                <div className="mt-2">
                  <span className="text-3xl font-black">${p.price}</span>
                  <span className="text-sm text-white/60">/mo</span>
                </div>
                {months > 1 && <div className="text-xs text-white/60">${(p.price * months).toFixed(2)} for {months} months</div>}
                <ul className="mt-3 flex-1 space-y-1.5 text-sm">
                  {p.perks.map((x) => (
                    <li key={x} className="flex gap-1.5">
                      <Check className="mt-0.5 size-4 shrink-0" style={{ color: p.color }} />
                      <span className="text-white/85">{x}</span>
                    </li>
                  ))}
                </ul>
                <button
                  disabled={!!busy}
                  onClick={() => void buy(p)}
                  className="mt-4 rounded-full py-2.5 text-sm font-black text-black transition active:scale-95 disabled:opacity-50"
                  style={{ background: p.color }}
                >
                  {busy === p.id ? "Sending…" : owned ? "Extend" : "Buy"}
                </button>
              </div>
            );
          })}
        </div>

        {orders.length > 0 && (
          <div className="mt-6 rounded-2xl bg-white/5 p-4 text-white">
            <div className="mb-2 font-bold">Your orders</div>
            <div className="space-y-1.5">
              {orders.map((o) => (
                <div key={o.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-mono text-white/60">#{o.id}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {PLANS.find((p) => p.id === o.tier)?.short} · {o.months} mo · ${o.amount_usd}
                  </span>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", o.status === "fulfilled" ? "bg-[#23a55a]/25 text-[#57f287]" : o.status === "cancelled" ? "bg-white/10 text-white/50" : "bg-[#f0b232]/20 text-[#f0b232]")}>
                    {STATUS[o.status]}
                  </span>
                  {(o.status === "pending" || o.status === "awaiting_payment") && (
                    <button onClick={async () => (await cancelOrder(o.id)) && setOrders(await myOrders())} className="text-xs text-white/60 underline">
                      Cancel
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="mt-4 pb-8 text-center text-xs text-white/40">Payments are handled personally by qyopy via PayPal. Plans last 30 days per month bought and can be extended any time.</p>
      </div>

      {done && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/70 p-4" onClick={(e) => (e.stopPropagation(), setDone(null))}>
          <div className="w-full max-w-md rounded-3xl bg-[#14141f] p-6 text-center text-white" onClick={(e) => e.stopPropagation()}>
            <div className="text-5xl">{done.plan.emoji}</div>
            <div className="mt-2 text-xl font-black">Order #{done.order} sent!</div>
            <p className="mt-2 text-sm text-white/80">
              We sent qyopy a friend request and a message about your order. He&apos;ll send you his <b>PayPal address privately</b> in your chat — send <b>${done.amount}</b> with “Order #{done.order}”
              in the note. Order Bot will message you when your plan is active.
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <button
                onClick={() => {
                  closeModal();
                  openConversation(done.conv, null);
                  useApp.setState({ hub: null, mobileTab: "chats" });
                }}
                className="rounded-full px-5 py-2.5 font-black text-black"
                style={{ background: done.plan.color }}
              >
                Open chat with qyopy
              </button>
              <button onClick={() => setDone(null)} className="rounded-full bg-white/10 px-4 py-2.5 font-semibold">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
