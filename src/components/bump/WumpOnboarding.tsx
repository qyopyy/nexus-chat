"use client";

import { useState } from "react";
import { MapPin, Shield, Users } from "lucide-react";
import { WUMP } from "@/lib/wumpBrand";
import { precisionLabel, type WumpPrecision } from "@/lib/wumpPrivacy";
import type { BumpVisible } from "@/lib/bump";
import { cn } from "@/lib/utils";

const STEPS = ["privacy", "live", "home"] as const;

/**
 * First-run sheet: precision, go Live, optionally mark this spot as Home.
 * Skip is always available — location stays off until they choose Live.
 */
export default function WumpOnboarding({
  precision,
  audience,
  live,
  canSaveHome,
  friendCount,
  busy,
  onPrecision,
  onAudience,
  onGoLive,
  onSaveHome,
  onDone,
}: {
  precision: WumpPrecision;
  audience: BumpVisible;
  live: boolean;
  canSaveHome: boolean;
  friendCount: number;
  busy?: boolean;
  onPrecision: (p: WumpPrecision) => void;
  onAudience: (v: BumpVisible) => void;
  onGoLive: () => void;
  onSaveHome: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  const id = STEPS[step] ?? "privacy";

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-3 sm:items-center">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-[#10261c] text-white shadow-2xl ring-1 ring-emerald-400/30">
        <div className="bg-gradient-to-br from-emerald-500/30 to-transparent px-5 pt-5 pb-4">
          <div className="mb-3 flex gap-1.5">
            {STEPS.map((s, i) => (
              <span key={s} className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-emerald-400" : "bg-white/15")} />
            ))}
          </div>
          <div className="text-[11px] font-bold tracking-wide text-emerald-200/80 uppercase">{WUMP}</div>
          <h2 className="mt-1 text-xl font-black tracking-tight">
            {id === "privacy" && "Your pin, your precision"}
            {id === "live" && "Show friends where you are"}
            {id === "home" && "Mark the places that matter"}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-emerald-50/75">
            {id === "privacy" &&
              "Wump is a live map for people you choose. The pin expires after 20 minutes, and it is fuzzed to the precision you pick — friends never get a raw GPS trail unless you turn that on later."}
            {id === "live" &&
              (live
                ? "You're Live. Friends in your audience can see the fuzzed pin move with you."
                : "Go Live when you're ready. You can stop sharing from the map at any time.")}
            {id === "home" &&
              "Save Home, Work, or School from a saved place to show “at home” and get arrive / leave alerts. Alerts use the same fuzzed pin."}
          </p>
        </div>

        <div className="space-y-3 px-5 py-4">
          {id === "privacy" && (
            <>
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-100/80">
                <Shield className="size-3.5" /> Who sees you by default
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["friends", "Friends"],
                    ["family", "Family"],
                    ["everyone", "Everyone nearby"],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onAudience(v)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-semibold",
                      audience === v ? "bg-emerald-500 text-white" : "bg-white/10 text-emerald-50/80",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["exact", "Exact"],
                    ["approx", "~100 m"],
                    ["city", "City"],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onPrecision(v)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-semibold",
                      precision === v ? "bg-white text-emerald-900" : "bg-white/10 text-emerald-50/80",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] leading-relaxed text-emerald-50/60">{precisionLabel(precision)}</p>
            </>
          )}

          {id === "live" && (
            <button
              type="button"
              disabled={busy || live}
              onClick={onGoLive}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              <MapPin className="size-4" />
              {live ? "You're Live" : busy ? "Starting…" : "Go Live"}
            </button>
          )}

          {id === "home" && (
            <div className="space-y-2">
              <button
                type="button"
                disabled={!canSaveHome || busy}
                onClick={onSaveHome}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white/10 py-3 text-sm font-bold disabled:opacity-50"
              >
                <MapPin className="size-4 text-emerald-300" />
                {canSaveHome ? "Save this spot as Home" : "Go Live first to drop a Home pin"}
              </button>
              <p className="flex items-center gap-1.5 text-[11px] text-emerald-50/60">
                <Users className="size-3.5" />
                {friendCount ? `${friendCount} friend${friendCount === 1 ? "" : "s"} can find you once you're Live.` : "Add friends from the Friends tab — they use the same Nexus account."}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-white/10 px-5 py-3">
          <button type="button" onClick={onDone} className="text-xs font-semibold text-emerald-50/60 hover:text-white">
            Skip
          </button>
          <button
            type="button"
            onClick={() => (step >= STEPS.length - 1 ? onDone() : setStep((s) => s + 1))}
            className="rounded-full bg-white px-4 py-2 text-xs font-bold text-emerald-950"
          >
            {step >= STEPS.length - 1 ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
