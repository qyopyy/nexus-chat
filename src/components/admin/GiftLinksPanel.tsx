"use client";

import { useCallback, useEffect, useState } from "react";
import { Gift, Copy } from "lucide-react";
import { toast } from "@/store/app";
import { PLANS, createPremiumGift, giftLink, listPremiumGifts, type PremiumGift } from "@/lib/premium";
import { giftShareText } from "@/lib/promoCopy";
import { can } from "@/lib/privileges";
import type { PremiumTier } from "@/lib/types";

/** Mint / copy premium gift links — mods & admins (rank ≥ 2). */
export default function GiftLinksPanel({ compact }: { compact?: boolean }) {
  const [tier, setTier] = useState<PremiumTier>("lighting");
  const [days, setDays] = useState(30);
  const [maxClaims, setMaxClaims] = useState(1);
  const [expiresDays, setExpiresDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [gifts, setGifts] = useState<PremiumGift[]>([]);
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const refresh = useCallback(() => void listPremiumGifts().then(setGifts), []);
  useEffect(() => {
    if (can.giftLinks()) void refresh();
  }, [refresh]);

  if (!can.giftLinks()) {
    return <p className="text-sm text-sub">Mods and admins can mint gift links.</p>;
  }

  const planLabel = PLANS.find((p) => p.id === tier)?.name ?? "Nexus Lighting";

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div className="flex items-start gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-[#ffd400]/15">
          <Gift className="size-5 text-[#ffd400]" />
        </div>
        <div>
          <h3 className="font-bold">Premium gift links</h3>
          <p className="text-sm text-sub">Shareable claim URLs — copy the link or a ready DM / Story caption.</p>
        </div>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const g = await createPremiumGift({ tier, days, maxClaims, expiresDays });
          setBusy(false);
          if (!g) return;
          const url = giftLink(g.code);
          setLastUrl(url);
          try {
            await navigator.clipboard.writeText(url);
            toast("Gift link copied", "success");
          } catch {
            toast("Gift link created", "success");
          }
          void refresh();
        }}
        className="grid gap-2 sm:grid-cols-2"
      >
        <select value={tier} onChange={(e) => setTier(e.target.value as PremiumTier)} className="rounded-lg border border-line bg-transparent px-2 py-2 text-sm outline-none">
          {PLANS.map((p) => (
            <option key={p.id} value={p.id} className="bg-side">
              {p.emoji} {p.short}
            </option>
          ))}
        </select>
        <input type="number" min={1} max={3650} value={days} onChange={(e) => setDays(Number(e.target.value) || 30)} className="rounded-lg border border-line bg-transparent px-2 py-2 text-sm outline-none" title="Days" placeholder="Days" />
        <input type="number" min={1} max={1000} value={maxClaims} onChange={(e) => setMaxClaims(Number(e.target.value) || 1)} className="rounded-lg border border-line bg-transparent px-2 py-2 text-sm outline-none" title="Max claims" placeholder="Max claims" />
        <input type="number" min={0} max={365} value={expiresDays} onChange={(e) => setExpiresDays(Number(e.target.value) || 0)} className="rounded-lg border border-line bg-transparent px-2 py-2 text-sm outline-none" title="Expires in days" placeholder="Link expires (days)" />
        <button disabled={busy} className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 sm:col-span-2">
          {busy ? "Creating…" : "Create gift link"}
        </button>
      </form>
      {lastUrl && (
        <div className="space-y-2 rounded-xl border border-line bg-side/60 p-3">
          <div className="break-all font-mono text-xs">{lastUrl}</div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="inline-flex items-center gap-1 rounded-full bg-hover px-3 py-1.5 text-xs font-bold" onClick={() => void navigator.clipboard.writeText(lastUrl).then(() => toast("Link copied", "success"))}>
              <Copy className="size-3.5" /> Copy link
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full bg-[#ffd400]/20 px-3 py-1.5 text-xs font-bold text-[#ffd400]"
              onClick={() => void navigator.clipboard.writeText(giftShareText(lastUrl, days, planLabel)).then(() => toast("Gift caption copied", "success"))}
            >
              <Copy className="size-3.5" /> Copy gift text
            </button>
          </div>
        </div>
      )}
      {gifts.length > 0 && (
        <ul className="max-h-48 space-y-1.5 overflow-y-auto text-xs text-sub">
          {gifts.slice(0, 20).map((g) => {
            const url = giftLink(g.code);
            const label = PLANS.find((p) => p.id === g.tier)?.short ?? g.tier;
            return (
              <li key={g.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line/50 px-2 py-1.5">
                <span className="font-mono text-txt">{g.code}</span>
                <span>
                  {label} · {g.days}d · {g.claims}/{g.max_claims}
                </span>
                <button type="button" className="ml-auto font-semibold text-accent" onClick={() => void navigator.clipboard.writeText(url).then(() => toast("Copied", "success"))}>
                  Link
                </button>
                <button type="button" className="font-semibold text-[#ffd400]" onClick={() => void navigator.clipboard.writeText(giftShareText(url, g.days, PLANS.find((p) => p.id === g.tier)?.name)).then(() => toast("Gift text copied", "success"))}>
                  Text
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
