"use client";

import { useEffect, useRef } from "react";
import { loadLeaflet, newMap } from "@/lib/geo";

export type MapPin = { id: string; lat: number; lng: number; label: string; accuracy?: number | null };

export default function PinMap({ pins, path, className }: { pins: MapPin[]; path?: { lat: number; lng: number }[]; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const key = `${pins.map((pin) => `${pin.id}:${pin.lat.toFixed(4)}:${pin.lng.toFixed(4)}`).join("|")}|${path?.length ?? 0}`;

  useEffect(() => {
    const el = ref.current;
    if (!el || (!pins.length && !path?.length)) return;
    let dead = false;
    let map: { remove: () => void } | null = null;
    void loadLeaflet()
      .then((L) => {
        if (dead || !ref.current) return;
        const view = newMap(L, ref.current);
        map = view;
        const bounds: [number, number][] = [];
        for (const pin of pins) {
          bounds.push([pin.lat, pin.lng]);
          const marker = L.marker([pin.lat, pin.lng]).addTo(view);
          marker.bindTooltip?.(pin.label, { permanent: pins.length < 6 });
          if (pin.accuracy && pin.accuracy > 0) L.circle([pin.lat, pin.lng], { radius: pin.accuracy, color: "#7ee0c6", weight: 1 }).addTo(view);
        }
        if (path && path.length > 1) {
          const line = path.map((point) => [point.lat, point.lng] as [number, number]);
          L.polyline(line, { color: "#7ee0c6", weight: 4 }).addTo(view);
          line.forEach((point) => bounds.push(point));
        }
        if (bounds.length === 1) view.setView(bounds[0], 15);
        else if (bounds.length > 1) view.fitBounds(bounds, { padding: [24, 24] });
        window.setTimeout(() => view.invalidateSize(), 200);
      })
      .catch(() => undefined);
    return () => {
      dead = true;
      map?.remove();
    };
    // key captures pin movement without rebuilding on every parent render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!pins.length && !path?.length) return <p className="text-sm text-[#8d8880]">No location yet.</p>;
  return <div ref={ref} className={className ?? "h-72 overflow-hidden rounded-3xl bg-[#1a1a1a]"} />;
}
