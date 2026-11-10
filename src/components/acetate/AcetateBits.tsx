"use client";

import { useRef } from "react";
import { ACETATE } from "@/lib/acetateBrand";

export function AcetateMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      <circle cx="32" cy="32" r="30" fill={ACETATE.lacquer} stroke={ACETATE.amber} strokeWidth="2" />
      <circle cx="32" cy="32" r="22" fill="none" stroke={ACETATE.amber} strokeOpacity="0.5" />
      <circle cx="32" cy="32" r="15" fill="none" stroke={ACETATE.cream} strokeOpacity="0.28" />
      <circle cx="32" cy="32" r="8" fill="none" stroke={ACETATE.amber} strokeOpacity="0.8" />
      <circle cx="32" cy="32" r="3.2" fill={ACETATE.ink} stroke={ACETATE.cream} strokeWidth="1" />
    </svg>
  );
}

export function Waveform({
  peaks,
  progress,
  markers = [],
  onSeek,
  tall = false,
}: {
  peaks: number[];
  progress: number;
  markers?: number[];
  onSeek?: (ratio: number) => void;
  tall?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef(false);
  const bars = peaks.length ? peaks : Array.from({ length: 72 }, (_, i) => 0.18 + ((i * 13) % 9) / 18);

  function seek(clientX: number) {
    const el = ref.current;
    if (!el || !onSeek) return;
    const box = el.getBoundingClientRect();
    onSeek(Math.min(1, Math.max(0, (clientX - box.left) / box.width)));
  }

  return (
    <div
      ref={ref}
      role={onSeek ? "slider" : undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      aria-label="Waveform"
      className={`relative flex items-center gap-[2px] ${tall ? "h-28" : "h-14"} ${onSeek ? "cursor-pointer" : ""}`}
      onPointerDown={(e) => {
        if (!onSeek) return;
        drag.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        seek(e.clientX);
      }}
      onPointerMove={(e) => {
        if (drag.current) seek(e.clientX);
      }}
      onPointerUp={() => {
        drag.current = false;
      }}
    >
      {bars.map((peak, i) => {
        const played = (i + 0.5) / bars.length <= progress;
        return (
          <span
            key={i}
            className="min-w-0 flex-1 rounded-full"
            style={{
              height: `${Math.max(10, peak * 100)}%`,
              background: played ? ACETATE.amber : "rgba(243,234,223,0.2)",
            }}
          />
        );
      })}
      {markers.map((ratio, i) => (
        <span
          key={`m${i}`}
          className="absolute top-0 size-1.5 -translate-x-1/2 rounded-full"
          style={{ left: `${Math.min(100, Math.max(0, ratio * 100))}%`, background: ACETATE.cream }}
        />
      ))}
    </div>
  );
}

export function ArtTile({ url, title, size = 56 }: { url?: string | null; title: string; size?: number }) {
  if (url) {
    return <img src={url} alt="" className="shrink-0 rounded-xl object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-xl font-serif text-lg"
      style={{ width: size, height: size, background: ACETATE.groove, color: ACETATE.amber }}
      aria-hidden
    >
      {title.slice(0, 1).toUpperCase()}
    </span>
  );
}
