"use client";

import { useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

export type SwipeAction = { label: string; icon: React.ReactNode; color: string; onClick: () => void };

const W = 76;
let closeOthers: (() => void) | null = null;

/** List row with iOS-style swipe-left actions. Vertical scrolling stays native. */
export default function SwipeRow({
  actions,
  onTap,
  onLongPress,
  children,
  className,
}: {
  actions: SwipeAction[];
  onTap: () => void;
  onLongPress?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const max = actions.length * W;
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const g = useRef<{ sx: number; sy: number; base: number; mode: "?" | "h" | "v"; moved: boolean; t: number } | null>(null);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const crossed = useRef(false);

  const close = () => setX(0);
  useEffect(() => () => {
    if (closeOthers === close) closeOthers = null;
  });

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div className="absolute inset-y-0 right-0 flex" style={{ width: max }}>
        {actions.map((a, i) => (
          <button
            key={a.label}
            onClick={() => {
              haptic.light();
              a.onClick();
              close();
            }}
            className="flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-white"
            style={{ background: a.color, transform: `translateX(${Math.max(0, (max + x) * ((actions.length - i) / actions.length))}px)`, transition: dragging ? "none" : "transform .25s" }}
          >
            {a.icon}
            {a.label}
          </button>
        ))}
      </div>
      <div
        className="relative touch-pan-y bg-rail"
        style={{ transform: `translateX(${x}px)`, transition: dragging ? "none" : "transform .25s cubic-bezier(.2,.9,.3,1)" }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          g.current = { sx: e.clientX, sy: e.clientY, base: x, mode: "?", moved: false, t: Date.now() };
          crossed.current = false;
          if (onLongPress)
            press.current = setTimeout(() => {
              if (g.current && !g.current.moved) {
                g.current = null;
                haptic.medium();
                onLongPress();
              }
            }, 480);
        }}
        onPointerMove={(e) => {
          const s = g.current;
          if (!s) return;
          const dx = e.clientX - s.sx;
          const dy = e.clientY - s.sy;
          if (s.mode === "?") {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            s.mode = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
            s.moved = true;
            if (press.current) clearTimeout(press.current);
            if (s.mode === "h") {
              setDragging(true);
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              if (closeOthers && closeOthers !== close) closeOthers();
              closeOthers = close;
            }
          }
          if (s.mode !== "h") return;
          let nx = s.base + dx;
          if (nx > 0) nx = nx / 4;
          if (nx < -max) nx = -max + (nx + max) / 4;
          if (!crossed.current && nx < -max * 0.6) {
            crossed.current = true;
            haptic.select();
          }
          setX(nx);
        }}
        onPointerUp={() => {
          if (press.current) clearTimeout(press.current);
          const s = g.current;
          g.current = null;
          setDragging(false);
          if (!s) return;
          if (s.mode === "h") {
            setX(x < -max * 0.4 ? -max : 0);
            return;
          }
          if (!s.moved) {
            if (x !== 0) close();
            else onTap();
          }
        }}
        onPointerCancel={() => {
          if (press.current) clearTimeout(press.current);
          g.current = null;
          setDragging(false);
          setX(x < -max * 0.4 ? -max : 0);
        }}
        onContextMenu={(e) => {
          if (onLongPress) {
            e.preventDefault();
            onLongPress();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
