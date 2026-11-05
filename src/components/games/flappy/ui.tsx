"use client";

import { ArrowLeft, Maximize } from "lucide-react";
import { cn } from "@/lib/utils";

export function FlappyFrameHeader({ title, onBack, mobile, onFull }: { title: string; onBack: () => void; mobile?: boolean; onFull?: () => void }) {
  return (
    <header className={cn("flex shrink-0 items-center gap-2 border-b border-white/10 bg-black/40 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
      <button onClick={onBack} className="grid size-9 place-items-center rounded-full hover:bg-white/10" aria-label="Back">
        <ArrowLeft className="size-5" />
      </button>
      <span className="min-w-0 flex-1 truncate font-bold">{title}</span>
      {onFull && (
        <button onClick={onFull} className="grid size-9 place-items-center rounded-full hover:bg-white/10" aria-label="Full screen">
          <Maximize className="size-4" />
        </button>
      )}
    </header>
  );
}
