"use client";

import { useEffect, useState } from "react";
import { Link2, Shield } from "lucide-react";
import { toast } from "@/store/app";
import {
  fetchWumpPrivacy,
  precisionLabel,
  saveWumpPrivacy,
  WUMP_PRIVACY_DEF,
  type WumpPrecision,
  type WumpPrivacy,
  type WumpInvitePolicy,
} from "@/lib/wumpPrivacy";
import type { BumpVisible } from "@/lib/bump";
import { WUMP } from "@/lib/wumpBrand";
import { cn } from "@/lib/utils";

export default function WumpSettings({ userId }: { userId: string }) {
  const [p, setP] = useState<WumpPrivacy | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchWumpPrivacy(userId).then(setP).catch(() => setP({ ...WUMP_PRIVACY_DEF }));
  }, [userId]);

  const save = async (patch: Partial<WumpPrivacy>) => {
    if (!p) return;
    setBusy(true);
    try {
      const next = await saveWumpPrivacy(userId, patch, p);
      setP(next);
      toast("Wump privacy saved", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save", "error");
    } finally {
      setBusy(false);
    }
  };

  if (!p) return <div className="mx-auto h-48 max-w-xl animate-pulse rounded-2xl bg-side" />;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <section className="rounded-2xl bg-side p-4 ring-1 ring-white/5">
        <div className="mb-1 flex items-center gap-2 text-sm font-bold">
          <Shield className="size-4 text-accent" /> {WUMP} privacy
        </div>
        <p className="mb-4 text-xs text-sub">
          Controls who sees your Live pin, how precise it is, and who can join via your invite links. Same account as Nexus.
        </p>

        <Toggle
          label="Allow location sharing"
          hint="Master switch — when off, Live / publish is blocked."
          checked={p.wump_share_enabled}
          disabled={busy}
          onChange={(v) => void save({ wump_share_enabled: v })}
        />

        <Field label="Default audience when you go Live">
          <Seg
            value={p.wump_default_visible}
            disabled={busy}
            onChange={(v) => void save({ wump_default_visible: v as BumpVisible })}
            options={[
              { id: "friends", label: "Friends" },
              { id: "family", label: "Family" },
              { id: "everyone", label: "Everyone nearby" },
            ]}
          />
        </Field>

        <Field label="Location precision">
          <Seg
            value={p.wump_precision}
            disabled={busy}
            onChange={(v) => void save({ wump_precision: v as WumpPrecision })}
            options={[
              { id: "exact", label: "Exact" },
              { id: "approx", label: "~100 m" },
              { id: "city", label: "City" },
            ]}
          />
          <p className="mt-1.5 text-[11px] text-sub">{precisionLabel(p.wump_precision)} grid when publishing to the map.</p>
        </Field>

        <Toggle
          label="Background Live"
          hint="Keep refreshing your pin while the app is in the background (standalone IPA / native)."
          checked={p.wump_allow_background}
          disabled={busy}
          onChange={(v) => void save({ wump_allow_background: v })}
        />
        <Toggle
          label="Nearby alerts"
          hint="Notify when friends enter your Live radius."
          checked={p.wump_allow_nearby_alerts}
          disabled={busy}
          onChange={(v) => void save({ wump_allow_nearby_alerts: v })}
        />

        <Field label="Who can redeem your invite links">
          <Seg
            value={p.wump_who_can_invite}
            disabled={busy}
            onChange={(v) => void save({ wump_who_can_invite: v as WumpInvitePolicy })}
            options={[
              { id: "everyone", label: "Anyone with link" },
              { id: "friends", label: "Open (friend req)" },
              { id: "nobody", label: "Nobody" },
            ]}
          />
        </Field>
      </section>

      <section className="rounded-2xl bg-side p-4 ring-1 ring-white/5">
        <div className="mb-1 flex items-center gap-2 text-sm font-bold">
          <Link2 className="size-4 text-accent" /> Two ways to use {WUMP}
        </div>
        <ul className="space-y-2 text-xs leading-relaxed text-sub">
          <li>
            <span className="font-semibold text-txt">Inside Nexus</span> — Apps → Wump (this screen). Same friends, DMs, and account.
          </li>
          <li>
            <span className="font-semibold text-txt">Standalone Wump app</span> — separate iOS IPA focused on the map + Live. Install from Releases; opens{" "}
            <code className="rounded bg-black/30 px-1">/wump/app</code>.
          </li>
        </ul>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 text-[11px] font-bold tracking-wide text-sub uppercase">{label}</div>
      {children}
    </div>
  );
}

function Seg({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string;
  options: { id: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50",
            value === o.id ? "bg-accent text-white" : "bg-white/5 text-sub hover:bg-white/10",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="mb-3 flex w-full items-start gap-3 rounded-xl px-1 py-2 text-left hover:bg-hover disabled:opacity-50"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-[11px] text-sub">{hint}</span>
      </span>
      <span className={cn("mt-0.5 h-6 w-10 shrink-0 rounded-full p-0.5 transition", checked ? "bg-accent" : "bg-white/15")}>
        <span className={cn("block size-5 rounded-full bg-white shadow transition", checked ? "translate-x-4" : "translate-x-0")} />
      </span>
    </button>
  );
}
