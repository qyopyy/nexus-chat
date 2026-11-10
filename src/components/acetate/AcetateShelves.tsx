"use client";

import type { AcetateTrack } from "@/lib/acetate";
import { ACETATE_STATUSES } from "@/lib/acetate";

function age(iso: string) {
  const days = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (days < 1) return "today";
  if (days < 7) return `${Math.floor(days)}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Late session";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function AcetateShelves({
  tracks,
  art,
  listenIds,
  onOpen,
  onPlay,
}: {
  tracks: AcetateTrack[];
  art: Record<string, string | null>;
  listenIds: string[];
  onOpen: (id: string) => void;
  onPlay: (track: AcetateTrack) => void;
}) {
  const recent = [...tracks].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  const hero = recent[0];
  const jump = listenIds.map((id) => tracks.find((track) => track.id === id)).filter((track): track is AcetateTrack => !!track).slice(0, 12);
  const shelves: { title: string; rows: AcetateTrack[] }[] = [
    { title: "Jump back in", rows: jump },
    { title: "Starred", rows: tracks.filter((track) => track.starred) },
    { title: "Fresh", rows: tracks.filter((track) => Date.now() - new Date(track.created_at).getTime() < 7 * 86400000) },
    { title: "Ideas", rows: tracks.filter((track) => (track.status ?? "demo") === "idea") },
    { title: "Demos", rows: tracks.filter((track) => (track.status ?? "demo") === "demo") },
    { title: "Mixes", rows: tracks.filter((track) => track.status === "mix") },
    { title: "Masters", rows: tracks.filter((track) => track.status === "master") },
  ].filter((shelf) => shelf.rows.length);
  if (!hero) return null;
  return (
    <div className="mb-8">
      <p className="text-[11px] font-semibold tracking-[0.22em] text-[#7ee0c6] uppercase">{greeting()}</p>
      <button type="button" onClick={() => onPlay(hero)} className="mt-3 flex w-full items-end gap-4 overflow-hidden rounded-3xl bg-gradient-to-br from-[#143f38] via-[#101614] to-[#070709] p-4 text-left sm:p-6">
        <Cover url={art[hero.id]} title={hero.title} size={148} />
        <span className="min-w-0">
          <span className="block text-xs text-white/60">Latest cut</span>
          <span className="mt-1 block truncate font-serif text-3xl sm:text-5xl">{hero.title}</span>
          <span className="mt-2 block text-sm text-white/70">{ACETATE_STATUSES.find((s) => s.id === (hero.status ?? "demo"))?.label} · updated {age(hero.updated_at)}</span>
        </span>
      </button>
      {shelves.map((shelf) => (
        <section key={shelf.title} className="mt-6">
          <h2 className="mb-2 font-serif text-2xl">{shelf.title}</h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {shelf.rows.slice(0, 18).map((track) => (
              <div key={`${shelf.title}-${track.id}`} className="w-36 shrink-0 sm:w-40">
                <button type="button" onClick={() => onPlay(track)} onDoubleClick={() => onOpen(track.id)} className="block w-full text-left">
                  <Cover url={art[track.id]} title={track.title} size={160} fresh={Date.now() - new Date(track.created_at).getTime() < 2 * 86400000} />
                  <span className="mt-2 block truncate text-sm font-semibold">{track.title}</span>
                  <span className="block truncate text-xs text-[#8d8880]">{track.folder || track.musical_key || "Private"}</span>
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Cover({ url, title, size, fresh }: { url?: string | null; title: string; size: number; fresh?: boolean }) {
  return (
    <span className="relative block overflow-hidden rounded-xl bg-[#1a1a1a] shadow-lg transition hover:scale-[1.03]" style={{ width: "100%", maxWidth: size, aspectRatio: "1" }}>
      {url ? <img src={url} alt="" className="size-full object-cover" /> : <span className="grid size-full place-items-center font-serif text-3xl text-[#7ee0c6]">{title.slice(0, 1)}</span>}
      {fresh && <span className="absolute top-2 left-2 rounded-full bg-[#070709]/80 px-2 py-0.5 text-[10px] font-bold">NEW</span>}
    </span>
  );
}
