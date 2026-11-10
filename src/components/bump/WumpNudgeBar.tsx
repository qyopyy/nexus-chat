"use client";

import { NUDGE_EMOJI, NUDGE_LABEL, type WumpNudgeKind } from "@/lib/wumpTogether";

const KINDS: WumpNudgeKind[] = ["wave", "poke", "heart", "hurry", "coffee", "here"];

/** Emoji reactions sent to one friend. Lands on their map and in Wump chat. */
export default function WumpNudgeBar({
  disabled,
  onNudge,
}: {
  disabled?: boolean;
  onNudge: (kind: WumpNudgeKind) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-t border-slate-100 bg-slate-50 px-2 py-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {KINDS.map((k) => (
        <button
          key={k}
          type="button"
          disabled={disabled}
          onClick={() => onNudge(k)}
          title={NUDGE_LABEL[k]}
          aria-label={NUDGE_LABEL[k]}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2 py-1 text-[11px] font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-amber-50 disabled:opacity-40"
        >
          <span aria-hidden>{NUDGE_EMOJI[k]}</span>
          {NUDGE_LABEL[k]}
        </button>
      ))}
    </div>
  );
}
