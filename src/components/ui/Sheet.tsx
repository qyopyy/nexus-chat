"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/** iOS-style bottom sheet with drag-down-to-dismiss */
export default function Sheet({
  open,
  onClose,
  children,
  className,
  title,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  const [dy, setDy] = useState(0);
  const start = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setDy(0);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[85]" role="dialog" aria-modal>
      <div className="absolute inset-0 animate-fade bg-black/55 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 mx-auto max-w-lg animate-sheet rounded-t-[28px] border-t border-white/10 bg-menu/95 pb-safe shadow-2xl backdrop-blur-xl",
          className,
        )}
        style={{ transform: dy ? `translateY(${dy}px)` : undefined, transition: start.current === null ? "transform .2s" : "none" }}
      >
        <div
          className="flex cursor-grab touch-none justify-center pt-2.5 pb-2"
          onPointerDown={(e) => {
            start.current = e.clientY;
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (start.current !== null) setDy(Math.max(0, e.clientY - start.current));
          }}
          onPointerUp={() => {
            const d = dy;
            start.current = null;
            if (d > 90) onClose();
            else setDy(0);
          }}
        >
          <span className="h-1.5 w-10 rounded-full bg-white/25" />
        </div>
        {title && <div className="px-5 pb-2 text-center text-sm font-semibold text-sub">{title}</div>}
        <div className="max-h-[80dvh] overflow-y-auto px-3 pb-3">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function SheetItem({
  icon,
  label,
  onClick,
  danger,
  right,
}: {
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3.5 rounded-2xl px-4 py-3.5 text-left text-[16px] font-medium transition active:scale-[.98] active:bg-white/10",
        danger ? "text-[#ff6b6b]" : "text-txt",
      )}
    >
      {icon && <span className="grid size-6 place-items-center opacity-90">{icon}</span>}
      <span className="flex-1">{label}</span>
      {right}
    </button>
  );
}

export function SheetGroup({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 overflow-hidden rounded-2xl bg-white/[.06] [&>button+button]:border-t [&>button+button]:border-white/[.06]">{children}</div>;
}
