"use client";

import { parseWumpCard, type WumpCard } from "@/lib/wumpCard";
import { externalMapsUrl, fmtDistance } from "@/lib/wumpMapApi";
import { openWumpPin } from "@/lib/wumpOpen";
import { cn } from "@/lib/utils";

function pathLength(points: [number, number][]) {
  let m = 0;
  for (let i = 1; i < points.length; i++) {
    const [a1, o1] = points[i - 1];
    const [a2, o2] = points[i];
    const r = Math.PI / 180;
    const dLat = (a2 - a1) * r;
    const dLng = (o2 - o1) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(dLng / 2) ** 2;
    m += 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  return m;
}

/** Chat card for a pinned place or a route. Opens Wump; it does not reveal a live pin. */
export default function WumpPlaceCard({ text, mine }: { text: string; mine: boolean }) {
  const card = parseWumpCard(text);
  if (!card) return null;
  const open = () => {
    const dest = destination(card);
    openWumpPin({ lat: dest[0], lng: dest[1], name: card.name });
  };
  const dest = destination(card);
  const maps = externalMapsUrl(dest, card.name, card.kind === "route" ? card.mode : "walk", card.kind === "route" ? card.points[0] : null, card.kind === "route" ? card.points.slice(1, -1) : []);
  return (
    <div className={cn("mt-1 w-[min(280px,78vw)] overflow-hidden rounded-2xl ring-1", mine ? "bg-white/10 ring-white/15" : "bg-side ring-line")}>
      <button type="button" onClick={open} className="block w-full text-left">
        <div className="relative h-24 bg-[radial-gradient(circle_at_30%_40%,#38bdf855,transparent_55%),linear-gradient(160deg,#0f172a,#0369a1)]">
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-3xl drop-shadow">{card.kind === "route" ? "🛣" : "📍"}</span>
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2 text-[11px] font-semibold text-white/90">
            {card.kind === "route" ? `${card.mode} · ${card.points.length - 1} leg${card.points.length > 2 ? "s" : ""} · ${fmtDistance(pathLength(card.points))}` : `${dest[0].toFixed(4)}, ${dest[1].toFixed(4)}`}
          </span>
        </div>
        <div className="px-3 py-2">
          <div className="truncate text-sm font-bold">{card.name}</div>
          <div className="text-[11px] text-sub">Open in Wump</div>
        </div>
      </button>
      <a href={maps} target="_blank" rel="noreferrer noopener" className="block border-t border-white/10 px-3 py-1.5 text-[11px] font-semibold text-sky-300">
        Open in Maps
      </a>
    </div>
  );
}

function destination(card: WumpCard): [number, number] {
  if (card.kind === "place") return [card.lat, card.lng];
  const last = card.points[card.points.length - 1];
  return last;
}
