"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { loadProfiles, openDM } from "@/lib/data";
import { supabase, errorText } from "@/lib/supabase";
import { PLANS, allOrders, grantPremium, setOrderStatus, type Order } from "@/lib/premium";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";
import { Card, H } from "./Studio";
import type { PremiumTier } from "@/lib/types";

const FLOW: { s: Order["status"]; label: string; cls: string }[] = [
  { s: "awaiting_payment", label: "PayPal sent", cls: "bg-hover hover:bg-active" },
  { s: "paid", label: "Mark paid", cls: "bg-[#2aabee] text-white" },
  { s: "fulfilled", label: "Activate plan", cls: "bg-ok text-white" },
  { s: "cancelled", label: "Cancel", cls: "text-dnd hover:bg-dnd/10" },
];
const COLOR: Record<Order["status"], string> = { pending: "#f0b232", awaiting_payment: "#f0b232", paid: "#2aabee", fulfilled: "#23a55a", cancelled: "#80848e" };

type MV = { id: string; title: string; owner_id: string; mv_status: string; mv_note: string | null; slug: string | null; updated_at: string };

/** shop owner: premium orders, manual plans, music-video distribution requests, order webhook */
export default function OrdersAdmin() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [mv, setMv] = useState<MV[]>([]);
  const load = useCallback(async () => {
    const o = await allOrders();
    setOrders(o);
    void loadProfiles(o.map((x) => x.user_id));
    const { data } = await supabase.from("videos").select("id, title, owner_id, mv_status, mv_note, slug, updated_at").not("mv_status", "is", null).order("updated_at", { ascending: false }).limit(100);
    setMv((data ?? []) as MV[]);
    void loadProfiles((data ?? []).map((v) => v.owner_id as string));
  }, []);
  useEffect(() => void load(), [load]);

  const shown = (orders ?? []).filter((o) => filter === "all" || ["pending", "awaiting_payment", "paid"].includes(o.status));
  const revenue = (orders ?? []).filter((o) => o.status === "fulfilled").reduce((a, o) => a + Number(o.amount_usd), 0);

  return (
    <>
      <H
        right={
          <div className="flex rounded-full bg-black/25 p-0.5 text-sm">
            {(["open", "all"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={cn("rounded-full px-3 py-1.5 font-semibold capitalize", filter === f && "bg-active")}>
                {f}
              </button>
            ))}
          </div>
        }
      >
        Orders & requests
      </H>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Open orders", (orders ?? []).filter((o) => ["pending", "awaiting_payment", "paid"].includes(o.status)).length],
          ["Completed", (orders ?? []).filter((o) => o.status === "fulfilled").length],
          ["Revenue", `$${revenue.toFixed(2)}`],
          ["Video requests", mv.filter((v) => v.mv_status === "requested").length],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-line/70 bg-side p-3">
            <div className="text-xs text-sub">{k}</div>
            <div className="text-2xl font-bold tabular-nums">{v}</div>
          </div>
        ))}
      </div>

      <Card title="Premium orders">
        {orders === null ? (
          <p className="text-sm text-sub">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-sub">No {filter === "open" ? "open " : ""}orders.</p>
        ) : (
          <div className="space-y-2">
            {shown.map((o) => {
              const plan = PLANS.find((p) => p.id === o.tier)!;
              return (
                <div key={o.id} className="rounded-xl border border-line/70 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Avatar userId={o.user_id} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">
                        #{o.id} · <NameTag userId={o.user_id} badges={false} />
                      </div>
                      <div className="truncate text-xs text-sub">
                        {plan.emoji} {plan.short} · {o.months} mo · <b className="text-txt">${o.amount_usd}</b> · {new Date(o.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                      </div>
                    </div>
                    <span className="rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ background: COLOR[o.status] }}>
                      {o.status.replace("_", " ")}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button onClick={() => void openDM(o.user_id).then(() => useApp.setState({ hub: null }))} className="flex items-center gap-1 rounded-full bg-hover px-3 py-1 text-xs font-semibold hover:bg-active">
                      <MessageCircle className="size-3.5" /> Chat (send PayPal)
                    </button>
                    {o.status !== "fulfilled" &&
                      o.status !== "cancelled" &&
                      FLOW.filter((f) => f.s !== o.status).map((f) => (
                        <button
                          key={f.s}
                          onClick={async () => {
                            const note = f.s === "cancelled" ? (prompt("Reason (optional, sent to the buyer)") ?? undefined) : undefined;
                            if (f.s === "fulfilled" && !confirm(`Activate ${plan.short} for ${o.months} month(s)?`)) return;
                            if (await setOrderStatus(o.id, f.s, note)) {
                              toast(f.s === "fulfilled" ? "Plan activated — Order Bot told them" : "Updated", "success");
                              void load();
                            }
                          }}
                          className={cn("rounded-full px-3 py-1 text-xs font-semibold", f.cls)}
                        >
                          {f.label}
                        </button>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <GrantCard />
        <Card title="Music video distribution requests">
          {mv.length === 0 ? (
            <p className="text-sm text-sub">Requests from the 🎬 plan show up here.</p>
          ) : (
            <div className="space-y-2">
              {mv.map((v) => (
                <div key={v.id} className="rounded-lg bg-black/20 p-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-semibold">{v.title}</span>
                    <span className="text-xs text-sub">{v.mv_status}</span>
                  </div>
                  <div className="text-xs text-sub">
                    <NameTag userId={v.owner_id} badges={false} />
                    {v.slug && (
                      <>
                        {" · "}
                        <a href={`/v/${v.slug}`} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                          watch
                        </a>
                      </>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {["approved", "live", "rejected"].map((s) => (
                      <button
                        key={s}
                        disabled={v.mv_status === s}
                        onClick={async () => {
                          const note = s === "rejected" ? (prompt("Reason (sent to the artist)") ?? "") : "";
                          const { error } = await supabase.rpc("set_mv_status", { p_video: v.id, p_status: s, p_note: note || null });
                          if (error) toast(errorText(error), "error");
                          else void load();
                        }}
                        className="rounded-full bg-hover px-3 py-1 text-xs font-semibold capitalize hover:bg-active disabled:opacity-40"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
        <WebhookCard />
      </div>
    </>
  );
}

function GrantCard() {
  const [user, setUser] = useState("");
  const [tier, setTier] = useState<PremiumTier>("lighting");
  const [days, setDays] = useState(30);
  return (
    <Card title="Give a plan manually">
      <p className="mb-2 text-sm text-sub">For friends, giveaways or payments outside the order flow. 0 days removes the plan.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const { data } = await supabase.from("profiles").select("id").eq("username", user.trim().replace(/^@/, "").toLowerCase()).maybeSingle();
          if (!data) return toast("No user with that username", "error");
          if (await grantPremium(data.id as string, days > 0 ? tier : null, days)) {
            toast(days > 0 ? "Plan given" : "Plan removed", "success");
            setUser("");
          }
        }}
        className="grid gap-2 sm:grid-cols-[1fr_1fr_90px_auto]"
      >
        <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="@username" className="min-w-0 rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent" />
        <select value={tier} onChange={(e) => setTier(e.target.value as PremiumTier)} className="rounded-lg border border-line bg-transparent px-2 py-2 text-sm outline-none">
          {PLANS.map((p) => (
            <option key={p.id} value={p.id} className="bg-side">
              {p.emoji} {p.short}
            </option>
          ))}
        </select>
        <input type="number" min={0} max={3650} value={days} onChange={(e) => setDays(Number(e.target.value) || 0)} className="rounded-lg border border-line bg-transparent px-2 py-2 text-sm outline-none" title="Days" />
        <button disabled={!user.trim()} className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
          Save
        </button>
      </form>
    </Card>
  );
}

function WebhookCard() {
  const [url, setUrl] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => {
    void supabase.rpc("isrc_config").then(({ data }) => {
      const u = (data as { order_webhook?: string } | null)?.order_webhook ?? "";
      setSaved(u || null);
      setUrl(u);
    });
  }, []);
  return (
    <Card title="Order notifications webhook">
      <p className="mb-2 text-sm text-sub">Also post every new order to a Discord / Slack webhook URL (Order Bot already messages you in Nexus).</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const { error } = await supabase.rpc("set_order_webhook", { p_url: url.trim() });
          if (error) return toast(errorText(error), "error");
          setSaved(url.trim() || null);
          toast(url.trim() ? "Webhook saved" : "Webhook removed", "success");
        }}
        className="flex gap-2"
      >
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://discord.com/api/webhooks/…" className="min-w-0 flex-1 rounded-lg border border-line bg-transparent px-3 py-2 font-mono text-xs outline-none focus:border-accent" />
        <button className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white">{saved ? "Update" : "Save"}</button>
      </form>
    </Card>
  );
}
