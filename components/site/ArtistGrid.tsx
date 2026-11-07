"use client";

import Reveal from "./Reveal";
import { ARTISTS } from "./features";

const initials = (n: string) =>
  n
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** roster cards with a slow spinning gradient ring */
export default function ArtistGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {ARTISTS.map((a, i) => (
        <Reveal key={a.name} delay={i * 70}>
          <div className="site-card group flex h-full flex-col items-center rounded-2xl bg-white/[.04] p-5 text-center ring-1 ring-white/10">
            <div className="relative size-20 sm:size-24">
              <div className="site-spin absolute inset-0 rounded-full" style={{ background: `conic-gradient(${a.colors[0]}, ${a.colors[1]}, ${a.colors[0]})` }} />
              <div className="absolute inset-[3px] grid place-items-center rounded-full text-xl font-black sm:text-2xl" style={{ background: `linear-gradient(135deg, ${a.colors[0]}, ${a.colors[1]})` }}>
                {initials(a.name)}
              </div>
            </div>
            <div className="mt-3 text-base font-bold sm:text-lg">{a.name}</div>
            <div className="text-xs font-semibold text-white/50">Artist</div>
          </div>
        </Reveal>
      ))}
    </div>
  );
}
