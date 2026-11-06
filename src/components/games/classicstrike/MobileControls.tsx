"use client";

import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { phonePadScale, type StrikeTouchCtl } from "./touchCtl";

type Ptr = { preventDefault: () => void; pointerId: number; clientX: number; clientY: number; currentTarget: EventTarget | null };

function capture(e: Ptr) {
  e.preventDefault();
  (e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId);
}

/**
 * Virtual stick (left) + look pad / FIRE (right) + action row.
 * Sized for common phone widths via phonePadScale().
 */
export default function MobileControls({
  ctl,
  team,
  canPlant,
  canDefuse,
  buyOpen,
  onBuyOpen,
}: {
  ctl: React.MutableRefObject<StrikeTouchCtl>;
  team: "T" | "CT";
  canPlant: boolean;
  canDefuse: boolean;
  buyOpen: boolean;
  onBuyOpen: () => void;
}) {
  const scale = useMemo(() => phonePadScale(), []);
  const joy = useRef<{ id: number; cx: number; cy: number } | null>(null);
  const look = useRef<{ id: number; x: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const pad = Math.round(112 * scale);
  const fireW = Math.round(88 * scale);
  const fireH = Math.round(88 * scale);
  const btn = Math.round(48 * scale);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 touch-none select-none">
      {/* Look zone — right 55% of screen (above action buttons) */}
      <div
        className="pointer-events-auto absolute top-12 right-0 bottom-36 left-[42%]"
        onPointerDown={(e) => {
          capture(e);
          look.current = { id: e.pointerId, x: e.clientX };
        }}
        onPointerMove={(e) => {
          const l = look.current;
          if (!l || l.id !== e.pointerId) return;
          const dx = e.clientX - l.x;
          l.x = e.clientX;
          ctl.current.look += dx * 0.0065;
        }}
        onPointerUp={(e) => {
          if (look.current?.id === e.pointerId) look.current = null;
        }}
        onPointerCancel={() => {
          look.current = null;
        }}
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 px-3 pb-safe-3">
        {/* Move stick */}
        <div
          className="pointer-events-auto relative rounded-full bg-black/35 ring-1 ring-white/25 backdrop-blur-sm"
          style={{ width: pad, height: pad }}
          onPointerDown={(e) => {
            capture(e);
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            joy.current = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
            ctl.current.mx = 0;
            ctl.current.my = 0;
            setKnob({ x: 0, y: 0 });
          }}
          onPointerMove={(e) => {
            const j = joy.current;
            if (!j || j.id !== e.pointerId) return;
            const max = pad * 0.38;
            let dx = e.clientX - j.cx;
            let dy = e.clientY - j.cy;
            const len = Math.hypot(dx, dy) || 1;
            if (len > max) {
              dx = (dx / len) * max;
              dy = (dy / len) * max;
            }
            ctl.current.mx = dx / max; // right = +strafe
            ctl.current.my = -dy / max; // up = forward
            setKnob({ x: dx, y: dy });
          }}
          onPointerUp={() => {
            joy.current = null;
            ctl.current.mx = 0;
            ctl.current.my = 0;
            setKnob({ x: 0, y: 0 });
          }}
          onPointerCancel={() => {
            joy.current = null;
            ctl.current.mx = 0;
            ctl.current.my = 0;
            setKnob({ x: 0, y: 0 });
          }}
        >
          <div
            className="absolute top-1/2 left-1/2 size-[42%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/45 shadow-lg ring-2 ring-white/50"
            style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
          />
          <span className="pointer-events-none absolute inset-x-0 bottom-1 text-center text-[9px] font-bold tracking-wider text-white/40">MOVE</span>
        </div>

        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <div className="flex gap-1.5">
            <ActionBtn h={btn} label="BUY" onDown={() => onBuyOpen()} active={buyOpen} />
            <ActionBtn
              h={btn}
              label="RLD"
              onDown={() => {
                ctl.current.reload = true;
              }}
            />
            {team === "T" && canPlant && (
              <ActionBtn
                h={btn}
                label="PLANT"
                tone="amber"
                onDown={() => {
                  ctl.current.plant = true;
                }}
              />
            )}
            {team === "CT" && canDefuse && (
              <ActionBtn
                h={btn}
                label="DEFUSE"
                tone="sky"
                hold
                onDown={() => {
                  ctl.current.defuse = true;
                }}
                onUp={() => {
                  ctl.current.defuse = false;
                }}
              />
            )}
          </div>
          <button
            type="button"
            className="rounded-full bg-red-500/45 text-sm font-black text-white shadow-lg ring-2 ring-red-300/40 backdrop-blur active:bg-red-500/75"
            style={{ width: fireW, height: fireH }}
            onPointerDown={(e) => {
              capture(e);
              ctl.current.fire = true;
            }}
            onPointerUp={() => {
              ctl.current.fire = false;
            }}
            onPointerCancel={() => {
              ctl.current.fire = false;
            }}
          >
            FIRE
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionBtn({
  label,
  h,
  onDown,
  onUp,
  hold,
  tone,
  active,
}: {
  label: string;
  h: number;
  onDown: () => void;
  onUp?: () => void;
  hold?: boolean;
  tone?: "amber" | "sky";
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "min-w-[3.25rem] rounded-2xl px-2 text-[10px] font-black text-white backdrop-blur ring-1 active:scale-95",
        tone === "amber" && "bg-amber-500/40 ring-amber-300/40",
        tone === "sky" && "bg-sky-500/40 ring-sky-300/40",
        !tone && "bg-white/15 ring-white/25",
        active && "bg-lime-400/50 ring-lime-200/50 text-black",
      )}
      style={{ height: h }}
      onPointerDown={(e) => {
        capture(e);
        onDown();
      }}
      onPointerUp={() => {
        if (hold) onUp?.();
      }}
      onPointerCancel={() => {
        if (hold) onUp?.();
      }}
    >
      {label}
    </button>
  );
}
