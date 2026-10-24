"use client";

import { useEffect, useRef } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

export type GameProps = { onOver: (score: number) => void; onScore: (score: number) => void };
export type Keys = { up: boolean; down: boolean; left: boolean; right: boolean; action: boolean };

/** keyboard state (arrows / WASD / space) shared with the on-screen pad */
export function useKeys() {
  const keys = useRef<Keys>({ up: false, down: false, left: false, right: false, action: false });
  useEffect(() => {
    const map: Record<string, keyof Keys> = {
      ArrowUp: "up",
      KeyW: "up",
      ArrowDown: "down",
      KeyS: "down",
      ArrowLeft: "left",
      KeyA: "left",
      ArrowRight: "right",
      KeyD: "right",
      Space: "action",
    };
    const set = (v: boolean) => (e: KeyboardEvent) => {
      const k = map[e.code];
      if (!k || (e.target as HTMLElement)?.closest?.("input,textarea")) return;
      e.preventDefault();
      keys.current[k] = v;
    };
    const down = set(true);
    const up = set(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);
  return keys;
}

/** discrete key presses (for grid games) */
export function useKeyPress(fn: (k: "up" | "down" | "left" | "right" | "action") => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const map: Record<string, "up" | "down" | "left" | "right" | "action"> = {
      ArrowUp: "up",
      KeyW: "up",
      ArrowDown: "down",
      KeyS: "down",
      ArrowLeft: "left",
      KeyA: "left",
      ArrowRight: "right",
      KeyD: "right",
      Space: "action",
    };
    const h = (e: KeyboardEvent) => {
      const k = map[e.code];
      if (!k || (e.target as HTMLElement)?.closest?.("input,textarea")) return;
      e.preventDefault();
      ref.current(k);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
}

/** swipe on an element → direction */
export function useSwipe(el: React.RefObject<HTMLElement | null>, fn: (k: "up" | "down" | "left" | "right") => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const e = el.current;
    if (!e) return;
    let sx = 0, sy = 0; // prettier-ignore
    const s = (ev: PointerEvent) => ((sx = ev.clientX), (sy = ev.clientY));
    const u = (ev: PointerEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy; // prettier-ignore
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      ref.current(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
    };
    e.addEventListener("pointerdown", s);
    e.addEventListener("pointerup", u);
    return () => {
      e.removeEventListener("pointerdown", s);
      e.removeEventListener("pointerup", u);
    };
  }, [el]);
}

function HoldBtn({ k, keys, children, className, onTap }: { k?: keyof Keys; keys?: React.RefObject<Keys>; children: React.ReactNode; className?: string; onTap?: () => void }) {
  const set = (v: boolean) => {
    if (k && keys?.current) keys.current[k] = v;
  };
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        set(true);
        onTap?.();
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onContextMenu={(e) => e.preventDefault()}
      className={cn("pointer-events-auto grid select-none place-items-center rounded-2xl bg-white/15 text-white backdrop-blur active:bg-white/30", className)}
    >
      {children}
    </button>
  );
}

/** on-screen controls, shown on touch devices */
export function TouchPad({ keys, layout, onPress }: { keys?: React.RefObject<Keys>; layout: "drive" | "dpad" | "blocks"; onPress?: (k: "up" | "down" | "left" | "right" | "action") => void }) {
  const touch = typeof window !== "undefined" && (navigator.maxTouchPoints > 0 || "ontouchstart" in window);
  if (!touch) return null;
  if (layout === "drive")
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-3 pb-safe-3">
        <div className="flex gap-2">
          <HoldBtn k="left" keys={keys} className="size-16">
            <ArrowLeft className="size-7" />
          </HoldBtn>
          <HoldBtn k="right" keys={keys} className="size-16">
            <ArrowRight className="size-7" />
          </HoldBtn>
        </div>
        <div className="flex flex-col items-end gap-2">
          <HoldBtn k="up" keys={keys} className="h-20 w-20 bg-[#00ff9c]/30 text-sm font-black">
            GAS
          </HoldBtn>
          <HoldBtn k="down" keys={keys} className="h-12 w-20 bg-[#ff4d4d]/30 text-xs font-black">
            BRAKE
          </HoldBtn>
        </div>
      </div>
    );
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-3 pb-safe-3">
      <div className="grid grid-cols-3 gap-1.5">
        <span />
        <HoldBtn onTap={() => onPress?.("up")} className="size-14">
          {layout === "blocks" ? <RotateCw className="size-6" /> : <ArrowUp className="size-6" />}
        </HoldBtn>
        <span />
        <HoldBtn onTap={() => onPress?.("left")} className="size-14">
          <ArrowLeft className="size-6" />
        </HoldBtn>
        <HoldBtn onTap={() => onPress?.("down")} className="size-14">
          <ArrowDown className="size-6" />
        </HoldBtn>
        <HoldBtn onTap={() => onPress?.("right")} className="size-14">
          <ArrowRight className="size-6" />
        </HoldBtn>
      </div>
      {layout === "blocks" && (
        <HoldBtn onTap={() => onPress?.("action")} className="h-16 w-20 text-sm font-black">
          DROP
        </HoldBtn>
      )}
    </div>
  );
}
