"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { DIAL_PX_PER_LN, activeStop, dialZoom, fmtZoom, magnet, tickOffset, zoomStops, zoomTicks, type ZoomRange } from "@/lib/snapZoom";

const chipText = (s: number) => (s < 1 ? String(s).replace("0.", ".") : String(s));

/**
 * iPhone-style zoom: lens chips (.5 1× 2 3 5) and a ruler dial. Tap a chip to glide there; press and drag the pill
 * sideways to scrub the dial. The dial also appears while you pinch or use the mouse wheel.
 */
export function SnapZoom({ range, zoom, onTarget, disabled, haptics, className }: { range: ZoomRange; zoom: number; onTarget: (z: number) => void; disabled?: boolean; haptics?: boolean; className?: string }) {
  const stops = useMemo(() => zoomStops(range), [range]);
  const ticks = useMemo(() => zoomTicks(range), [range]);
  const [dial, setDial] = useState(false);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chipBusy = useRef(0);
  const drag = useRef<{ x: number; z: number; moved: boolean; last: number } | null>(null);
  const idx = activeStop(zoom, stops);

  const showDial = (ms = 1100) => {
    setDial(true);
    if (hide.current) clearTimeout(hide.current);
    hide.current = setTimeout(() => {
      if (!drag.current) setDial(false);
    }, ms);
  };
  useEffect(() => {
    if (Date.now() < chipBusy.current) return;
    showDial(900);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);
  useEffect(
    () => () => {
      if (hide.current) clearTimeout(hide.current);
    },
    [],
  );

  const buzz = () => {
    if (haptics) {
      try {
        navigator.vibrate?.(5);
      } catch {
        /* no vibration */
      }
    }
  };

  const onDown = (e: React.PointerEvent) => {
    if (disabled) return;
    drag.current = { x: e.clientX, z: zoom, moved: false, last: zoom };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || disabled) return;
    const dx = e.clientX - d.x;
    if (!d.moved) {
      if (Math.abs(dx) < 6) return;
      d.moved = true;
      // only now take over the pointer, so a plain tap still reaches the chip button
      try {
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    showDial(60_000);
    const z = magnet(dialZoom(d.z, dx, range), stops, 0.03);
    if (stops.includes(z) && z !== d.last) buzz();
    d.last = z;
    onTarget(z);
  };
  const onUp = () => {
    const d = drag.current;
    if (d?.moved) {
      showDial(900);
      setTimeout(() => {
        if (drag.current === d) drag.current = null;
      }, 0);
    } else drag.current = null;
  };

  const pick = (s: number) => {
    if (disabled || drag.current?.moved) return;
    chipBusy.current = Date.now() + 700;
    // tapping the chip you are already on toggles back to 1×
    const target = idx >= 0 && Math.abs(zoom - s) < 0.05 && s !== 1 && range.min <= 1 ? 1 : s;
    buzz();
    onTarget(Math.min(range.max, Math.max(range.min, target)));
  };

  if (stops.length < 2 && range.max - range.min < 0.2) return null;

  return (
    <div className={cn("pointer-events-none absolute inset-x-0 bottom-3 z-[8] flex flex-col items-center", className)}>
      <div
        className={cn("relative mb-2 h-14 overflow-hidden transition-opacity duration-200", dial ? "opacity-100" : "opacity-0")}
        style={{ width: "min(88vw, 340px)", WebkitMaskImage: "linear-gradient(90deg, transparent, #000 22%, #000 78%, transparent)", maskImage: "linear-gradient(90deg, transparent, #000 22%, #000 78%, transparent)" }}
        aria-hidden
      >
        {ticks.map((t) => {
          const off = tickOffset(t.z, zoom);
          if (Math.abs(off) > DIAL_PX_PER_LN * 1.4) return null;
          return (
            <span key={t.z} className="absolute top-1 flex -translate-x-1/2 flex-col items-center" style={{ left: `calc(50% + ${off}px)` }}>
              <span className={cn("block w-px bg-white/80", t.major ? "h-4" : "h-2 bg-white/50")} />
              {t.label && <span className="mt-0.5 text-[10px] font-semibold text-white/80">{t.label}</span>}
            </span>
          );
        })}
        <span className="absolute left-1/2 top-0 h-6 w-0.5 -translate-x-1/2 rounded-full bg-yellow-300" />
        <span className="absolute inset-x-0 bottom-0 text-center text-[13px] font-bold text-yellow-300 drop-shadow">{fmtZoom(zoom)}</span>
      </div>
      <div
        className={cn("pointer-events-auto flex touch-none select-none items-center gap-1 rounded-full bg-black/45 p-1 backdrop-blur", disabled && "opacity-50")}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        role="group"
        aria-label="Zoom"
      >
        {stops.map((s, i) => {
          const on = i === idx;
          return (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() => pick(s)}
              aria-label={`Zoom ${fmtZoom(s)}`}
              aria-pressed={on}
              className={cn(
                "grid size-9 place-items-center rounded-full text-[12px] font-bold transition-colors",
                on ? "bg-black/60 text-yellow-300" : "text-white/90",
              )}
            >
              {on ? fmtZoom(zoom) : chipText(s)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
