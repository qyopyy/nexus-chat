"use client";

import { useCallback, useEffect, useState } from "react";
import { Gift, Copy } from "lucide-react";
import { toast } from "@/store/app";
import { GIFT_PLANS, anyPlan, createPremiumGift, giftLink, listPremiumGifts, type PremiumGift } from "@/lib/premium";
import { giftReelText, giftShareText, giftStoryText } from "@/lib/promoCopy";
import { can } from "@/lib/privileges";
import type { GiftTier } from "@/lib/plans";

/** Mint / copy premium gift links — mods & admins (rank ≥ 2). */
export default function GiftLinksPanel({ compact }: { compact?: boolean }) {
  const [tier, setTier] = useState<GiftTier>("lighting");
  const [days, setDays] = useState(30);
  const [maxClaims, setMaxClaims] = useState(1);
  const [expiresDays, setExpiresDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [gifts, setGifts] = useState<PremiumGift[]>([]);
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [lastDays, setLastDays] = useState(30);
  const [lastPlan, setLastPlan] = useState("Nexus Lighting");
  const refresh = useCallback(() => void listPremiumGifts().then(setGifts), []);
  useEffect(() => {
    if (can.giftLinks()) void refresh();
  }, [refresh]);

  if (!can.giftLinks()) {
    return <p className="text-sm text-sub">Mods and admins can mint gift links.</p>;
  }

  const planLabel = anyPlan(tier)?.name ?? "Nexus Lighting";

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div className="flex items-start gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-[#ffd400]/15">
          <Gift className="size-5 text-[#ffd400]" />
        </div>
        <div>
          <h3 className="font-bold">Premium gift links</h3>
          <p className="text-sm text-sub">Mods & admins — mint Lighting or Wump Plus gifts, then copy DM / Story / Reel caption text with the claim URL.</p>
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
          setLastDays(days);
          setLastPlan(planLabel);
          try {
            await navigator.clipboard.writeText(giftShareText(url, days, planLabel));
            toast("Gift caption copied", "success");
          } catch {
            toast("Gift link created", "success");
          }
          void refresh();
        }}
        className="grid gap-2 sm:grid-cols-2"
      >
        <select value={tier} onChange={(e) => setTier(e.target.value as GiftTier)} className="rounded-lg border border-line bg-transparent px-2 py-2 text-sm outline-none">
          {GIFT_PLANS.map((p) => (
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
          <pre className="whitespace-pre-wrap rounded-lg bg-black/20 p-2 text-[11px] text-sub">{giftShareText(lastUrl, lastDays, lastPlan)}</pre>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="inline-flex items-center gap-1 rounded-full bg-hover px-3 py-1.5 text-xs font-bold" onClick={() => void navigator.clipboard.writeText(lastUrl).then(() => toast("Link copied", "success"))}>
              <Copy className="size-3.5" /> Link only
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full bg-[#ffd400]/20 px-3 py-1.5 text-xs font-bold text-[#ffd400]"
              onClick={() => void navigator.clipboard.writeText(giftShareText(lastUrl, lastDays, lastPlan)).then(() => toast("DM gift text copied", "success"))}
            >
              <Copy className="size-3.5" /> DM text
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full bg-[#ff2bd6]/20 px-3 py-1.5 text-xs font-bold text-[#ff2bd6]"
              onClick={() => void navigator.clipboard.writeText(giftStoryText(lastUrl, lastDays, lastPlan)).then(() => toast("Story gift text copied", "success"))}
            >
              <Copy className="size-3.5" /> Story text
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-3 py-1.5 text-xs font-bold text-accent"
              onClick={() => void navigator.clipboard.writeText(giftReelText(lastUrl, lastDays, lastPlan)).then(() => toast("Reel/TikTok gift caption copied", "success"))}
            >
              <Copy className="size-3.5" /> Reel / TikTok
            </button>
          </div>
        </div>
      )}
      {gifts.length > 0 && (
        <ul className="max-h-56 space-y-1.5 overflow-y-auto text-xs text-sub">
          {gifts.slice(0, 20).map((g) => {
            const url = giftLink(g.code);
            const name = anyPlan(g.tier)?.name ?? "Nexus Lighting";
            const label = anyPlan(g.tier)?.short ?? g.tier;
            return (
              <li key={g.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line/50 px-2 py-1.5">
                <span className="font-mono text-txt">{g.code}</span>
                <span>
                  {label} · {g.days}d · {g.claims}/{g.max_claims}
                </span>
                <button type="button" className="ml-auto font-semibold text-accent" onClick={() => void navigator.clipboard.writeText(url).then(() => toast("Copied", "success"))}>
                  Link
                </button>
                <button type="button" className="font-semibold text-[#ffd400]" onClick={() => void navigator.clipboard.writeText(giftShareText(url, g.days, name)).then(() => toast("DM text copied", "success"))}>
                  DM
                </button>
                <button type="button" className="font-semibold text-[#ff2bd6]" onClick={() => void navigator.clipboard.writeText(giftStoryText(url, g.days, name)).then(() => toast("Story text copied", "success"))}>
                  Story
                </button>
                <button type="button" className="font-semibold text-accent" onClick={() => void navigator.clipboard.writeText(giftReelText(url, g.days, name)).then(() => toast("Reel text copied", "success"))}>
                  Reel
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
