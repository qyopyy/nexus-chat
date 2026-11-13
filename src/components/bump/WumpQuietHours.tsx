"use client";

import { useState } from "react";
import { Moon } from "lucide-react";
import {
  formatQuietTime,
  loadQuietHours,
  parseQuietTime,
  saveQuietHours,
  type QuietHours,
} from "@/lib/wumpQuiet";

/** Settings control. The pin hide itself lives in the Live map. */
export default function WumpQuietHours() {
  const [hours, setHours] = useState<QuietHours>(() => loadQuietHours());

  function update(next: QuietHours) {
    setHours(saveQuietHours(next));
  }

  return (
    <section className="mb-4 rounded-2xl bg-black/20 p-3">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-indigo-500/15 text-indigo-200">
          <Moon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-txt">Quiet hours</h3>
            <button
              type="button"
              aria-pressed={hours.enabled}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${hours.enabled ? "bg-indigo-500 text-white" : "bg-white/10 text-sub"}`}
              onClick={() => update({ ...hours, enabled: !hours.enabled })}
            >
              {hours.enabled ? "On" : "Off"}
            </button>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-sub">
            While this window is on, Live stops publishing your pin. It starts again when the window ends, if you were still Live.
          </p>
          <div className="mt-2 flex gap-2">
            <label className="text-[11px] text-sub">
              From
              <input
                type="time"
                value={formatQuietTime(hours.start)}
                className="mt-1 block rounded-lg bg-black/30 px-2 py-1.5 text-sm text-txt"
                onChange={(event) => {
                  const start = parseQuietTime(event.target.value);
                  if (start != null) update({ ...hours, start });
                }}
              />
            </label>
            <label className="text-[11px] text-sub">
              Until
              <input
                type="time"
                value={formatQuietTime(hours.end)}
                className="mt-1 block rounded-lg bg-black/30 px-2 py-1.5 text-sm text-txt"
                onChange={(event) => {
                  const end = parseQuietTime(event.target.value);
                  if (end != null) update({ ...hours, end });
                }}
              />
            </label>
          </div>
        </div>
      </div>
    </section>
  );
}
