"use client";

import { useState } from "react";
import { setLive, useLiveMap } from "@/lib/liveConfig";
import { LIVE_DEFS, liveGet } from "@/lib/liveConfigCore";
import { toast } from "@/store/app";

/** Owner panel: every change is saved and shows up in every open Nexus and Snap within a second. */
export default function LiveControl() {
  const map = useLiveMap();
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  async function save(key: string, value: boolean | number | string) {
    setBusy(key);
    const err = await setLive(key, value);
    setBusy(null);
    if (err) toast(/relation .*live_config|schema cache|does not exist/i.test(err) ? "Run LIVE-CONFIG.sql in Supabase first" : err, "error");
    else toast("Live now", "success");
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-sub">Changes apply instantly in every open app. Nobody needs to update.</p>
      {LIVE_DEFS.map((d) => {
        const cur = liveGet<boolean | number | string>(map, d.key);
        return (
          <div key={d.key} className="rounded-xl bg-chat px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold">{d.label}</div>
                <div className="text-xs text-sub">{d.hint}</div>
              </div>
              {d.kind === "bool" && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={cur as boolean}
                  disabled={busy === d.key}
                  onClick={() => void save(d.key, !(cur as boolean))}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${cur ? "bg-accent" : "bg-white/20"}`}
                >
                  <span className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${cur ? "left-[22px]" : "left-0.5"}`} />
                </button>
              )}
              {d.kind === "choice" && (
                <select
                  value={cur as number}
                  disabled={busy === d.key}
                  onChange={(e) => void save(d.key, Number(e.target.value))}
                  className="rounded-lg bg-side px-2 py-1 text-sm outline-none"
                >
                  {d.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {d.kind === "text" && (
              <div className="mt-2 flex gap-2">
                <input
                  value={draft[d.key] ?? (cur as string)}
                  maxLength={d.max}
                  onChange={(e) => setDraft((x) => ({ ...x, [d.key]: e.target.value }))}
                  className="min-w-0 flex-1 rounded-lg bg-side px-3 py-1.5 text-sm outline-none"
                />
                <button
                  type="button"
                  disabled={busy === d.key}
                  onClick={() => void save(d.key, draft[d.key] ?? (cur as string))}
                  className="rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white"
                >
                  Send live
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
