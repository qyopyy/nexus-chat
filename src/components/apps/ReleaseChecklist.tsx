"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckSquare, Copy, RotateCcw } from "lucide-react";
import { toast } from "@/store/app";
import AppFrame from "./AppFrame";

const ITEMS = [
  { id: "masters", label: "Final masters (WAV / 24-bit preferred)" },
  { id: "upc", label: "UPC / EAN assigned for the release" },
  { id: "isrc", label: "ISRC on every track" },
  { id: "artwork", label: "Cover art 3000×3000, no logos/URLs" },
  { id: "credits", label: "Writers, producers, featured artists credited" },
  { id: "lyrics", label: "Lyrics synced or attached where needed" },
  { id: "splits", label: "Split sheet signed / agreed" },
  { id: "pitch", label: "Playlist / editorial pitch ready" },
  { id: "bio", label: "Artist bio + press photos updated" },
  { id: "link", label: "Nexus Link / pre-save page live" },
  { id: "socials", label: "Social assets scheduled" },
  { id: "distro", label: "Distributor delivery confirmed" },
] as const;

const KEY = "nexus.artist.releaseChecklist";

export default function ReleaseChecklist({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setDone(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(done));
    } catch {
      /* ignore */
    }
  }, [done]);

  const progress = useMemo(() => {
    const n = ITEMS.filter((i) => done[i.id]).length;
    return { n, total: ITEMS.length, pct: Math.round((n / ITEMS.length) * 100) };
  }, [done]);

  function toggle(id: string) {
    setDone((d) => ({ ...d, [id]: !d[id] }));
  }

  function reset() {
    setDone({});
    toast("Checklist cleared", "success");
  }

  function copy() {
    const lines = ITEMS.map((i) => `${done[i.id] ? "[x]" : "[ ]"} ${i.label}`);
    void navigator.clipboard.writeText(`Release checklist (${progress.n}/${progress.total})\n\n${lines.join("\n")}`).then(() => toast("Copied", "success"));
  }

  return (
    <AppFrame
      title="Release checklist"
      Icon={CheckSquare}
      iconClass="text-[#f59e0b]"
      mobile={mobile}
      onBack={onBack}
      actions={
        <div className="flex gap-1.5">
          <button type="button" onClick={reset} className="grid size-9 place-items-center rounded-full bg-hover" title="Reset">
            <RotateCcw className="size-4" />
          </button>
          <button type="button" onClick={copy} className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white">
            <Copy className="size-3.5" /> Copy
          </button>
        </div>
      }
    >
      <p className="text-sm text-sub">Ship-ready checklist for singles and albums. Progress saves on this device.</p>
      <div className="rounded-2xl border border-line bg-side/60 p-4">
        <div className="mb-2 flex items-center justify-between text-sm font-semibold">
          <span>
            {progress.n} / {progress.total} done
          </span>
          <span className="text-accent">{progress.pct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-hover">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress.pct}%` }} />
        </div>
      </div>
      <ul className="space-y-2">
        {ITEMS.map((item) => {
          const on = !!done[item.id];
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => toggle(item.id)}
                className={`flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition ${on ? "border-accent/40 bg-accent/10" : "border-line bg-side/40 hover:bg-hover"}`}
              >
                <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border text-[11px] font-bold ${on ? "border-accent bg-accent text-white" : "border-line text-faint"}`}>
                  {on ? "✓" : ""}
                </span>
                <span className={`text-sm font-medium ${on ? "text-sub line-through" : ""}`}>{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </AppFrame>
  );
}
