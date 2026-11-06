"use client";

import { Bookmark, ExternalLink, MapPin, Trash2 } from "lucide-react";
import { appleMapsLink } from "@/lib/appleMaps";
import { timeAgo } from "@/lib/videos";
import { wumpPlaceSubtitle, type WumpSavedPlace } from "@/lib/wumpPlaces";
import { cn } from "@/lib/utils";

export default function WumpSavedPlacesPanel({
  places,
  open,
  onToggle,
  onDelete,
  className,
}: {
  places: WumpSavedPlace[];
  open: boolean;
  onToggle: () => void;
  onDelete: (id: string) => void;
  className?: string;
}) {
  return (
    <section className={cn("overflow-hidden rounded-2xl bg-side ring-1 ring-white/5", className)}>
      <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
        <div className="grid size-9 place-items-center rounded-xl bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/20">
          <Bookmark className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold tracking-tight">Saved places</div>
          <div className="text-[11px] text-sub">
            {places.length
              ? `${places.length} saved · tap the map to add more`
              : "Tap the map or bookmark while Live"}
          </div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-sub transition hover:bg-white/10 hover:text-txt"
        >
          {open ? "Hide" : places.length ? `Show ${places.length}` : "Show"}
        </button>
      </div>

      {open && (
        <ul className="max-h-64 divide-y divide-white/5 overflow-y-auto">
          {!places.length ? (
            <li className="flex items-start gap-3 px-4 py-5">
              <MapPin className="mt-0.5 size-4 shrink-0 text-sub" />
              <div>
                <div className="text-sm font-semibold text-txt">No places yet</div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-sub">
                  Tap anywhere on the map to name a spot, or save your Live location with the bookmark control.
                </p>
              </div>
            </li>
          ) : (
            places.map((p) => (
              <li key={p.id} className="flex items-center gap-2.5 px-3 py-2.5 sm:px-4">
                <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/5 text-sky-300">
                  <MapPin className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-txt">{p.name}</div>
                  <div className="truncate text-[11px] text-sub">
                    {wumpPlaceSubtitle(p)}
                    {p.created_at ? ` · ${timeAgo(p.created_at)}` : ""}
                  </div>
                </div>
                <a
                  href={appleMapsLink(p.lat, p.lng, p.name)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2.5 py-1 text-[11px] font-bold text-sky-300 transition hover:bg-sky-500/25"
                  aria-label={`Open ${p.name} in Maps`}
                >
                  Maps
                  <ExternalLink className="size-2.5 opacity-70" />
                </a>
                <button
                  type="button"
                  onClick={() => onDelete(p.id)}
                  className="grid size-8 place-items-center rounded-full text-sub transition hover:bg-white/10 hover:text-danger"
                  aria-label={`Remove ${p.name}`}
                  title="Remove"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </section>
  );
}
