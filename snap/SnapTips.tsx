"use client";

import { useEffect, useState } from "react";
import { Lightbulb, X } from "lucide-react";
import { TIPS, tipByKey, type Tip } from "@/lib/snapSocial";
import { markTipSeen, useSocial } from "@/lib/snapSocialNet";
import { Sheet } from "./SnapUi";

/** How to capture with every mode, one tab each. Opens on the tip that matches what the camera is doing. */
export function TipsSheet({ initial, onClose }: { initial: string; onClose: () => void }) {
  const [key, setKey] = useState(initial);
  const t = tipByKey(key);
  useEffect(() => markTipSeen(t.key), [t.key]);
  return (
    <Sheet title="How to capture" onClose={onClose} z="z-[60]">
      <div className="space-y-3 px-4 pb-4">
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Modes">
          {TIPS.map((x) => (
            <button
              key={x.key}
              type="button"
              role="tab"
              aria-selected={x.key === key}
              onClick={() => setKey(x.key)}
              className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold ${x.key === key ? "bg-white text-black" : "bg-white/10 text-white/80"}`}
            >
              {x.icon} {x.title}
            </button>
          ))}
        </div>
        <div className="space-y-3 rounded-2xl bg-white/5 p-4" data-testid="tip-body">
          <div>
            <b className="block text-base">
              {t.icon} {t.title}
            </b>
            <span className="text-sm text-white/65">{t.lead}</span>
          </div>
          <ol className="space-y-2">
            {t.steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-bold">{i + 1}</span>
                <span className="pt-0.5 text-white/90">{s}</span>
              </li>
            ))}
          </ol>
          {t.pro && (
            <p className="rounded-xl bg-amber-400/10 p-3 text-sm text-amber-100">
              <b>Pro tip · </b>
              {t.pro}
            </p>
          )}
        </div>
      </div>
    </Sheet>
  );
}

/** A one-line tip the first time a mode is used. Goes away by itself; "More" opens the full steps. */
export function AutoTip({ tip, enabled, onMore }: { tip: Tip; enabled: boolean; onMore: () => void }) {
  const seen = useSocial().tipsSeen;
  const [shownKey, setShownKey] = useState<string | null>(null);
  const fresh = enabled && !seen.includes(tip.key);
  useEffect(() => {
    if (!fresh) return;
    setShownKey(tip.key);
    const t = setTimeout(() => {
      markTipSeen(tip.key);
      setShownKey(null);
    }, 9000);
    return () => clearTimeout(t);
  }, [fresh, tip.key]);
  if (!fresh || shownKey !== tip.key) return null;
  return (
    <div className="pointer-events-auto flex items-start gap-3 rounded-2xl bg-black/80 p-3 text-sm backdrop-blur" aria-live="polite" data-testid="auto-tip">
      <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-300" />
      <div className="min-w-0 flex-1">
        <b className="block">
          {tip.icon} {tip.title}
        </b>
        <span className="block text-xs text-white/70">{tip.steps[0]}</span>
        <button
          type="button"
          onClick={() => {
            markTipSeen(tip.key);
            onMore();
          }}
          className="mt-1 text-xs font-bold text-amber-300"
        >
          More steps
        </button>
      </div>
      <button type="button" onClick={() => markTipSeen(tip.key)} aria-label="Dismiss tip" className="grid size-6 shrink-0 place-items-center rounded-full bg-white/10">
        <X className="size-3.5" />
      </button>
    </div>
  );
}
