"use client";

import { useState } from "react";
import { Hand, SmilePlus } from "lucide-react";
import { useApp } from "@/store/app";
import { REACTIONS, sendReaction, toggleHand, useCall } from "@/lib/call";
import { cn } from "@/lib/utils";

/** emojis floating up over the call */
export function ReactionsOverlay() {
  const list = useCall((s) => s.reactions);
  const profiles = useApp((s) => s.profiles);
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {list.map((r) => (
        <div key={r.id} className="absolute bottom-16 flex animate-[reactfloat_3.2s_ease-out_forwards] flex-col items-center" style={{ left: `${r.x}%` }}>
          <span className="text-4xl drop-shadow-lg">{r.emoji}</span>
          <span className="mt-0.5 max-w-24 truncate rounded-full bg-black/55 px-1.5 text-[10px] font-semibold text-white">{profiles[r.from]?.display_name ?? ""}</span>
        </div>
      ))}
    </div>
  );
}

/** call-bar button: emoji reactions + raise hand */
export function ReactButton({ mobile }: { mobile?: boolean }) {
  const [open, setOpen] = useState(false);
  const hand = useCall((s) => s.myHand);
  const panel = (
    <div className="animate-pop rounded-2xl bg-menu p-2 text-txt shadow-2xl ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
      <div className="flex gap-1">
        {REACTIONS.map((e) => (
          <button key={e} onClick={() => sendReaction(e)} className="grid size-11 place-items-center rounded-xl text-2xl transition hover:scale-110 hover:bg-hover active:scale-90">
            {e}
          </button>
        ))}
      </div>
      <button
        onClick={() => {
          toggleHand();
          setOpen(false);
        }}
        className={cn("mt-1 flex w-full items-center justify-center gap-2 rounded-xl py-2 text-sm font-bold", hand ? "bg-[#f0b232] text-black" : "bg-hover hover:bg-active")}
      >
        <Hand className="size-4" /> {hand ? "Lower hand" : "Raise hand"}
      </button>
    </div>
  );
  if (mobile)
    return (
      <>
        <button onClick={() => setOpen(true)} className="flex flex-col items-center gap-1.5" aria-label="Reactions">
          <span className={cn("grid size-[52px] place-items-center rounded-full active:scale-90", hand ? "bg-[#f0b232] text-black" : "bg-white/15 text-white")}>
            {hand ? <Hand className="size-6" /> : <SmilePlus className="size-6" />}
          </span>
          <span className="text-[11px] font-medium text-white/80">React</span>
        </button>
        {open && (
          <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 pb-safe-4" onClick={() => setOpen(false)}>
            <div className="mb-24 max-w-[96vw] overflow-x-auto">{panel}</div>
          </div>
        )}
      </>
    );
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        title="Reactions & raise hand"
        aria-label="Reactions"
        className={cn("grid size-14 place-items-center rounded-full text-white transition", hand ? "bg-[#f0b232] text-black" : open ? "bg-accent" : "bg-[#2b2d31] hover:bg-[#3a3c42]")}
      >
        {hand ? <Hand className="size-6" /> : <SmilePlus className="size-6" />}
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
