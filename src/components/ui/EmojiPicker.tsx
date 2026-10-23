"use client";

import { useEffect, useRef } from "react";
import { EMOJI_GRID } from "@/lib/utils";
import { cn } from "@/lib/utils";

export default function EmojiPicker({
  onPick,
  onClose,
  className,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const t = setTimeout(() => window.addEventListener("mousedown", close), 0);
    window.addEventListener("keydown", esc);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  return (
    <div ref={ref} className={cn("z-40 w-[296px] animate-pop rounded-xl border border-black/30 bg-panel p-2 shadow-2xl", className)}>
      <div className="grid grid-cols-8 gap-0.5">
        {EMOJI_GRID.map((e) => (
          <button
            key={e}
            onClick={() => onPick(e)}
            className="grid size-8 place-items-center rounded-md text-xl transition hover:scale-110 hover:bg-hover"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
