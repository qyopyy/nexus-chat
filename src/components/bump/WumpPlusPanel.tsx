"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Crown, Gift, Loader2, Shield, Sparkles } from "lucide-react";
import { toast } from "@/store/app";
import { WUMP_PLUS_PLAN, createOrder, createPremiumGift, giftLink, redeemPremiumGift } from "@/lib/premium";
import { myRank } from "@/lib/admin";
import {
  PLUS_COLORS,
  PLUS_GOLD,
  PLUS_PIN_EMOJI,
  fetchWumpPlus,
  grantWumpPlus,
  saveWumpPlusStyle,
  useWumpPlus,
  wumpPlusMembers,
  type WumpPlusMember,
} from "@/lib/wumpPlus";
import { cn } from "@/lib/utils";

const MONTHS = [1, 3, 6, 12] as const;

export function PlusBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded-full bg-gradient-to-r from-amber-300 to-yellow-500 px-1.5 py-0.5 text-[9px] font-black tracking-wide text-black uppercase", className)} title="Wump Plus">
      <Sparkles className="size-2.5" /> Plus
    </span>
  );
}

/** Wump Plus: perks, buy / redeem, style editor, and admin tools (grant role, gift links). */
export default function WumpPlusPanel() {
  const st = useWumpPlus();
  const [months, setMonths] = useState<(typeof MONTHS)[number]>(1);
  const [buying, setBuying] = useState(false);
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const rank = myRank();
  const price = st?.price ?? WUMP_PLUS_PLAN.price;

  async function buy() {
    setBuying(true);
    const r = await createOrder("wump_plus", months);
    setBuying(false);
    if (r) toast("Order sent — check your chat for payment details", "success");
  }

  async function redeem() {
    const c = code.trim().replace(/^.*\/gift\//, "").replace(/[?#].*$/, "");
    if (!c) return;
    setRedeeming(true);
    try {
      const r = await redeemPremiumGift(c);
      toast(`Gift claimed — ${r.days} days of ${r.tier === "wump_plus" ? "Wump Plus" : "Nexus"}`, "success");
      setCode("");
      void fetchWumpPlus(true);
    } catch (e) {
      toast((e as Error).message || "Couldn't claim", "error");
    }
    setRedeeming(false);
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <section className="relative overflow-hidden rounded-2xl p-5 ring-1 ring-amber-300/25" style={{ background: "linear-gradient(135deg, #2a2108 0%, #141109 55%, #0d0d0d 100%)" }}>
        <div className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-amber-400/20 blur-3xl" />
        <div className="relative flex items-center gap-2">
          <Crown className="size-5 text-amber-300" />
          <h2 className="text-lg font-black tracking-tight text-amber-100">Wump Plus</h2>
          {st?.active && <PlusBadge className="ml-1" />}
        </div>
        {st?.active ? (
          <p className="relative mt-1 text-xs text-amber-100/80">
            {st.via === "nexus"
              ? "Included with your Nexus Premium plan."
              : st.via === "staff"
                ? "Included for Nexus staff."
                : st.permanent
                  ? "You have the Wump Plus role — no expiry."
                  : st.until
                    ? `Active until ${new Date(st.until).toLocaleDateString()}.`
                    : "Active."}
          </p>
        ) : (
          <p className="relative mt-1 text-xs text-amber-100/70">Make your map and profile yours. ${price.toFixed(2)}/month.</p>
        )}
        <ul className="relative mt-4 grid gap-1.5 text-[13px] text-amber-50/90">
          {WUMP_PLUS_PLAN.perks.map((p) => (
            <li key={p} className="flex items-start gap-2">
              <Check className="mt-0.5 size-3.5 shrink-0 text-amber-300" /> {p}
            </li>
          ))}
        </ul>

        {!st?.active || (st.via === "plus" && !st.permanent) ? (
          <div className="relative mt-5 space-y-2">
            <div className="flex gap-1.5">
              {MONTHS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonths(m)}
                  className={cn("flex-1 rounded-xl px-2 py-2 text-xs font-bold ring-1 transition", months === m ? "bg-amber-300 text-black ring-amber-200" : "bg-white/5 text-amber-100 ring-white/10 hover:bg-white/10")}
                >
                  {m} mo
                  <span className="block text-[10px] font-semibold opacity-75">${(price * m).toFixed(2)}</span>
                </button>
              ))}
            </div>
            <button type="button" disabled={buying} onClick={() => void buy()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-300 to-yellow-500 py-3 text-sm font-black text-black shadow-lg shadow-amber-500/20 disabled:opacity-60">
              {buying ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {st?.active ? "Extend" : "Get"} Wump Plus
            </button>
            <p className="text-center text-[10px] text-amber-100/50">Paid via PayPal — you’ll get the details in your Nexus chat. Turns on as soon as payment is confirmed.</p>
          </div>
        ) : null}

        <div className="relative mt-4 flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Have a gift link or code?"
            className="min-w-0 flex-1 rounded-xl bg-black/40 px-3 py-2 text-sm text-amber-50 outline-none ring-1 ring-white/10 placeholder:text-amber-100/40 focus:ring-amber-300"
          />
          <button type="button" disabled={!code.trim() || redeeming} onClick={() => void redeem()} className="inline-flex items-center gap-1 rounded-xl bg-white/10 px-3 text-xs font-bold text-amber-100 disabled:opacity-40">
            <Gift className="size-3.5" /> Claim
          </button>
        </div>
      </section>

      {st?.active && <PlusStyleEditor />}
      {rank >= 2 && <PlusAdmin admin={rank >= 3} />}
    </div>
  );
}

function PlusStyleEditor() {
  const st = useWumpPlus();
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  if (!st) return null;
  const save = async (patch: Parameters<typeof saveWumpPlusStyle>[0]) => {
    setBusy(true);
    const r = await saveWumpPlusStyle(patch);
    setBusy(false);
    if (r) toast("Style saved", "success");
  };
  const pinColor = st.pin_color || PLUS_GOLD;

  return (
    <section className="rounded-2xl bg-side p-4 ring-1 ring-white/5">
      <div className="mb-3 flex items-center gap-2 text-sm font-bold">
        <Sparkles className="size-4 text-amber-300" /> Your Plus style
      </div>
      <div className="mb-4 flex items-center gap-3 rounded-xl bg-black/25 p-3">
        <div className="grid size-12 place-items-center rounded-full text-xl shadow-lg" style={{ background: pinColor, boxShadow: `0 0 0 3px #fff, 0 0 18px ${pinColor}` }}>
          {st.pin_emoji || "📍"}
        </div>
        <div className="h-12 flex-1 rounded-xl" style={{ background: `linear-gradient(120deg, ${st.banner_color || PLUS_GOLD}cc, transparent 75%)` }} />
      </div>

      <div className="mb-1.5 text-[11px] font-bold tracking-wide text-sub uppercase">Map pin emoji</div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {PLUS_PIN_EMOJI.map((e) => (
          <button key={e} type="button" disabled={busy} onClick={() => void save({ pin_emoji: e })} className={cn("grid size-9 place-items-center rounded-xl text-lg transition", st.pin_emoji === e ? "bg-amber-300/30 ring-2 ring-amber-300" : "bg-white/5 hover:bg-white/10")}>
            {e}
          </button>
        ))}
        <button type="button" disabled={busy || !st.pin_emoji} onClick={() => void save({ pin_emoji: null })} className="rounded-xl bg-white/5 px-2.5 text-[11px] font-semibold text-sub hover:bg-white/10">
          Avatar
        </button>
      </div>
      <div className="mb-4 flex gap-2">
        <input value={custom} onChange={(e) => setCustom(e.target.value.slice(0, 8))} placeholder="Or type any emoji" className="min-w-0 flex-1 rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-transparent focus:ring-amber-300" />
        <button type="button" disabled={busy || !custom.trim()} onClick={() => void save({ pin_emoji: custom.trim() }).then(() => setCustom(""))} className="rounded-xl bg-white/10 px-3 text-xs font-bold disabled:opacity-40">
          Use
        </button>
      </div>

      <Swatches label="Pin color" value={st.pin_color} disabled={busy} onPick={(c) => void save({ pin_color: c })} />
      <Swatches label="Profile banner" value={st.banner_color} disabled={busy} onPick={(c) => void save({ banner_color: c })} />
    </section>
  );
}

function Swatches({ label, value, onPick, disabled }: { label: string; value: string | null; onPick: (c: string | null) => void; disabled?: boolean }) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 text-[11px] font-bold tracking-wide text-sub uppercase">{label}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {PLUS_COLORS.map((c) => (
          <button key={c} type="button" disabled={disabled} aria-label={c} onClick={() => onPick(c)} className={cn("size-7 rounded-full ring-2 transition", value === c ? "ring-white" : "ring-transparent hover:ring-white/40")} style={{ background: c }} />
        ))}
        <label className="relative size-7 cursor-pointer overflow-hidden rounded-full ring-2 ring-white/10" title="Custom color" style={{ background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }}>
          <input type="color" disabled={disabled} value={value || PLUS_GOLD} onChange={(e) => onPick(e.target.value)} className="absolute inset-0 opacity-0" />
        </label>
        {value && (
          <button type="button" disabled={disabled} onClick={() => onPick(null)} className="ml-1 text-[11px] font-semibold text-sub hover:text-txt">
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

function PlusAdmin({ admin }: { admin: boolean }) {
  const [user, setUser] = useState("");
  const [days, setDays] = useState(30);
  const [role, setRole] = useState(false);
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState<WumpPlusMember[]>([]);
  const [gDays, setGDays] = useState(30);
  const [gMax, setGMax] = useState(1);
  const [gExp, setGExp] = useState(30);
  const [link, setLink] = useState<string | null>(null);
  const refresh = useCallback(() => {
    if (admin) void wumpPlusMembers().then(setMembers);
  }, [admin]);
  useEffect(refresh, [refresh]);

  async function grant(e: { preventDefault: () => void }, revoke = false) {
    e.preventDefault();
    if (!user.trim()) return;
    setBusy(true);
    const r = await grantWumpPlus(user.trim(), revoke ? 0 : days, revoke ? false : role);
    setBusy(false);
    if (r) {
      toast(revoke ? "Wump Plus removed" : role ? "Wump Plus role given" : `Wump Plus +${days} days`, "success");
      setUser("");
      refresh();
    }
  }

  async function mint() {
    setBusy(true);
    const g = await createPremiumGift({ tier: "wump_plus", days: gDays, maxClaims: gMax, expiresDays: gExp, note: "Wump Plus" });
    setBusy(false);
    if (!g) return;
    const url = giftLink(g.code);
    setLink(url);
    try {
      await navigator.clipboard.writeText(url);
      toast("Gift link copied", "success");
    } catch {
      toast("Gift link created", "success");
    }
  }

  const inp = "min-w-0 rounded-lg border border-line bg-transparent px-2.5 py-2 text-sm outline-none focus:border-amber-300";
  return (
    <section className="space-y-4 rounded-2xl bg-side p-4 ring-1 ring-white/5">
      <div className="flex items-center gap-2 text-sm font-bold">
        <Shield className="size-4 text-amber-300" /> Wump Plus — staff
      </div>

      <div>
        <div className="mb-1.5 text-[11px] font-bold tracking-wide text-sub uppercase">Gift link</div>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-[10px] text-sub">
            Days
            <input type="number" min={1} max={3650} value={gDays} onChange={(e) => setGDays(Number(e.target.value) || 30)} className={cn(inp, "mt-0.5 w-full")} />
          </label>
          <label className="text-[10px] text-sub">
            Claims
            <input type="number" min={1} max={1000} value={gMax} onChange={(e) => setGMax(Number(e.target.value) || 1)} className={cn(inp, "mt-0.5 w-full")} />
          </label>
          <label className="text-[10px] text-sub">
            Link expires (d)
            <input type="number" min={0} max={365} value={gExp} onChange={(e) => setGExp(Number(e.target.value) || 0)} className={cn(inp, "mt-0.5 w-full")} />
          </label>
        </div>
        <button type="button" disabled={busy} onClick={() => void mint()} className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-amber-300 py-2 text-sm font-bold text-black disabled:opacity-50">
          <Gift className="size-4" /> Create Wump Plus gift link
        </button>
        {link && (
          <button type="button" onClick={() => void navigator.clipboard.writeText(link).then(() => toast("Copied", "success"))} className="mt-2 flex w-full items-center gap-2 rounded-lg bg-black/25 px-3 py-2 text-left font-mono text-[11px] break-all">
            <Copy className="size-3.5 shrink-0" /> {link}
          </button>
        )}
      </div>

      {admin && (
        <form onSubmit={(e) => void grant(e)} className="space-y-2">
          <div className="text-[11px] font-bold tracking-wide text-sub uppercase">Give directly / role</div>
          <div className="grid grid-cols-[1fr_80px] gap-2">
            <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="@username" className={inp} />
            <input type="number" min={1} max={3650} value={days} disabled={role} onChange={(e) => setDays(Number(e.target.value) || 30)} className={cn(inp, "disabled:opacity-40")} title="Days" />
          </div>
          <label className="flex items-center gap-2 text-xs text-sub">
            <input type="checkbox" checked={role} onChange={(e) => setRole(e.target.checked)} className="accent-amber-300" /> Permanent Wump Plus role (no expiry)
          </label>
          <div className="flex gap-2">
            <button disabled={busy || !user.trim()} className="flex-1 rounded-full bg-accent py-2 text-sm font-bold text-white disabled:opacity-40">
              {role ? "Give role" : `Give ${days} days`}
            </button>
            <button type="button" disabled={busy || !user.trim()} onClick={(e) => void grant(e, true)} className="rounded-full px-3 text-xs font-bold text-dnd hover:bg-dnd/10 disabled:opacity-40">
              Revoke
            </button>
          </div>
        </form>
      )}

      {admin && members.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-bold tracking-wide text-sub uppercase">Members ({members.length})</div>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center gap-2 rounded-lg border border-line/50 px-2 py-1.5">
                <button type="button" className="font-semibold hover:underline" onClick={() => setUser(m.username)}>
                  @{m.username}
                </button>
                <span className="ml-auto text-sub">{m.permanent ? "Role" : m.until ? `until ${new Date(m.until).toLocaleDateString()}` : "—"} · {m.source}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
