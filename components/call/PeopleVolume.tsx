"use client";

import { useState } from "react";
import { RotateCcw, SlidersHorizontal, Volume2, VolumeX } from "lucide-react";
import { useApp } from "@/store/app";
import { MAX_USER_VOLUME, setUserVolume, toggleLocalMute, useCall } from "@/lib/call";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";

/** one row per person in the call: their volume for you (0–400%) and a local mute */
function PersonRow({ id }: { id: string }) {
  const name = useApp((s) => s.profiles[id]?.display_name ?? "Someone");
  const speaking = useCall((s) => !!s.participants[id]?.speaking);
  const theirMute = useCall((s) => !!s.participants[id]?.muted);
  const v = useCall((s) => s.userVolumes[id] ?? 1);
  const muted = useCall((s) => !!s.localMutes[id]);
  const pct = Math.round(v * 100);
  const fill = (pct / (MAX_USER_VOLUME * 100)) * 100;
  return (
    <div className="rounded-xl bg-white/[.04] p-2.5">
      <div className="flex items-center gap-2.5">
        <span className={cn("rounded-full ring-2 transition", speaking && !muted ? "ring-ok" : "ring-transparent")}>
          <Avatar userId={id} size={32} plain />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{name}</div>
          <div className="text-[11px] text-sub">{muted ? "Muted for you" : theirMute ? "Their mic is off" : pct > 100 ? `Boosted to ${pct}%` : pct < 100 ? `Turned down to ${pct}%` : "Normal volume"}</div>
        </div>
        <span className={cn("w-12 text-right text-sm font-bold tabular-nums", pct > 200 ? "text-idle" : pct > 100 ? "text-ok" : "")}>{muted ? "—" : `${pct}%`}</span>
        <button onClick={() => toggleLocalMute(id)} className={cn("grid size-8 place-items-center rounded-full", muted ? "bg-dnd text-white" : "bg-white/10 hover:bg-white/20")} aria-label={muted ? `Unmute ${name}` : `Mute ${name} for me`}>
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Volume2 className="size-4 shrink-0 text-sub" />
        <input
          type="range"
          min={0}
          max={MAX_USER_VOLUME * 100}
          step={5}
          value={pct}
          disabled={muted}
          onChange={(e) => setUserVolume(id, Number(e.target.value) / 100)}
          className="vol min-w-0 flex-1 disabled:opacity-40"
          style={{ ["--fill" as string]: `${fill}%` }}
          aria-label={`${name}'s volume`}
        />
        <button onClick={() => setUserVolume(id, 1)} disabled={pct === 100} className="grid size-7 place-items-center rounded-full text-sub hover:bg-white/10 hover:text-txt disabled:opacity-30" aria-label="Reset volume" title="Reset to 100%">
          <RotateCcw className="size-3.5" />
        </button>
      </div>
      <div className="mt-1 flex gap-1">
        {[50, 100, 150, 200, 300, 400].map((p) => (
          <button key={p} disabled={muted} onClick={() => setUserVolume(id, p / 100)} className={cn("flex-1 rounded-md py-1 text-[10px] font-bold", pct === p ? "bg-accent text-white" : "bg-white/5 text-sub hover:bg-white/10")}>
            {p}%
          </button>
        ))}
      </div>
    </div>
  );
}

/** call control: everyone's volume in one place — turn people down or boost a quiet mic up to 400% */
export function PeopleVolumeButton({ mobile }: { mobile?: boolean }) {
  const [open, setOpen] = useState(false);
  const participants = useCall((s) => s.participants);
  const ids = Object.keys(participants);
  const boosted = useCall((s) => Object.values(s.userVolumes).some((v) => v !== 1));
  const panel = (
    <div className="w-[min(92vw,380px)] animate-pop rounded-2xl bg-menu p-3 text-txt shadow-2xl ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2 font-bold">
        <SlidersHorizontal className="size-4 text-accent" /> Volume per person
      </div>
      <p className="mt-0.5 mb-2 text-xs text-sub">Only changes what you hear. Boost a quiet friend up to 400% — Nexus keeps it from distorting.</p>
      <div className="max-h-[56vh] space-y-2 overflow-y-auto">
        {ids.length === 0 ? <p className="py-6 text-center text-sm text-sub">No one else is here yet.</p> : ids.map((id) => <PersonRow key={id} id={id} />)}
      </div>
    </div>
  );
  if (mobile)
    return (
      <>
        <button onClick={() => setOpen(true)} className="flex flex-col items-center gap-1.5" aria-label="Volume per person">
          <span className={cn("grid size-[52px] place-items-center rounded-full active:scale-90", boosted ? "bg-accent text-white" : "bg-white/15 text-white")}>
            <SlidersHorizontal className="size-6" />
          </span>
          <span className="text-[11px] font-medium text-white/80">Volume</span>
        </button>
        {open && (
          <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 pb-safe-4" onClick={() => setOpen(false)}>
            <div className="mb-24">{panel}</div>
          </div>
        )}
      </>
    );
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        title="Volume per person"
        aria-label="Volume per person"
        className={cn("grid size-14 place-items-center rounded-full text-white transition", boosted || open ? "bg-accent" : "bg-[#2b2d31] hover:bg-[#3a3c42]")}
      >
        <SlidersHorizontal className="size-6" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute bottom-16 left-1/2 z-30 -translate-x-1/2">{panel}</div>
        </>
      )}
    </div>
  );
}
