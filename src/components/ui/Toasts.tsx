"use client";

import { useApp } from "@/store/app";
import { cn } from "@/lib/utils";

export default function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "animate-pop rounded-lg px-4 py-2 text-sm font-medium shadow-xl",
            t.kind === "error" ? "bg-dnd text-white" : t.kind === "success" ? "bg-ok text-white" : "bg-panel text-txt",
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
