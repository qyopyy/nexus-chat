"use client";

import { useEffect, useMemo, useState } from "react";
import { clearRecap, loadRecap, type RecapPlay } from "@/lib/acetateRecap";

function clock(seconds: number) {
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${total}s`;
}

export default function AcetateRecap() {
  const [rows, setRows] = useState<RecapPlay[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    setError(null);
    void loadRecap().then(setRows).catch((err: Error) => {
      setRows([]);
      setError(err.message);
    });
  }

  useEffect(() => {
    reload();
  }, []);

  const stats = useMemo(() => {
    const list = rows ?? [];
    const seconds = list.reduce((sum, row) => sum + row.seconds, 0);
    const cuts = new Map<string, { title: string; artist: string | null; seconds: number; plays: number }>();
    const artists = new Map<string, { seconds: number; plays: number }>();
    for (const row of list) {
      const key = row.track_id || row.title;
      const cut = cuts.get(key) ?? { title: row.title, artist: row.artist, seconds: 0, plays: 0 };
      cut.seconds += row.seconds;
      cut.plays += 1;
      cuts.set(key, cut);
      const artist = row.artist || "Unknown artist";
      const bucket = artists.get(artist) ?? { seconds: 0, plays: 0 };
      bucket.seconds += row.seconds;
      bucket.plays += 1;
      artists.set(artist, bucket);
    }
    const topCuts = [...cuts.values()].sort((a, b) => b.seconds - a.seconds).slice(0, 8);
    const topArtists = [...artists.entries()].sort((a, b) => b[1].seconds - a[1].seconds).slice(0, 8);
    return { seconds, topCuts, topArtists };
  }, [rows]);

  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-3xl">Recap</h2>
          <p className="mt-1 text-sm text-[#a3988c]">Your last 90 days of listening. This is your account, not other people&apos;s plays of your cuts.</p>
        </div>
        {rows && rows.length > 0 && (
          <button
            type="button"
            className="text-xs text-[#d4653a]"
            onClick={() => {
              if (window.confirm("Clear your listening recap on this account?")) {
                void clearRecap().then(reload).catch((err: Error) => setError(err.message));
              }
            }}
          >
            Clear
          </button>
        )}
      </div>
      {error && <p className="mb-3 text-sm text-[#d4653a]">{error}</p>}
      {rows === null && <p className="text-sm text-[#a3988c]">Loading your listening…</p>}
      {rows && rows.length === 0 && !error && <p className="text-sm text-[#a3988c]">Play a cut for a few seconds and it will show up here.</p>}
      {rows && rows.length > 0 && (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-2xl bg-[#1a1612] px-3 py-3">
              <div className="font-serif text-2xl text-[#e4a15a]">{clock(stats.seconds)}</div>
              <div className="text-[#a3988c]">Time listened</div>
            </div>
            <div className="rounded-2xl bg-[#1a1612] px-3 py-3">
              <div className="font-serif text-2xl">{stats.topCuts.length}</div>
              <div className="text-[#a3988c]">Cuts in the mix</div>
            </div>
            <div className="rounded-2xl bg-[#1a1612] px-3 py-3">
              <div className="font-serif text-2xl">{rows.length}</div>
              <div className="text-[#a3988c]">Sessions</div>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="font-serif text-xl">Top cuts</h3>
              <ul className="mt-2 space-y-1">
                {stats.topCuts.map((cut) => (
                  <li key={cut.title + (cut.artist ?? "")} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate">{cut.title}{cut.artist ? <span className="text-[#a3988c]"> · {cut.artist}</span> : null}</span>
                    <span className="shrink-0 text-xs text-[#a3988c]">{clock(cut.seconds)} · {cut.plays}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-serif text-xl">Top artists</h3>
              <ul className="mt-2 space-y-1">
                {stats.topArtists.map(([name, bucket]) => (
                  <li key={name} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate">{name}</span>
                    <span className="shrink-0 text-xs text-[#a3988c]">{clock(bucket.seconds)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <h3 className="mt-6 font-serif text-xl">Recent plays</h3>
          <ul className="mt-2 space-y-1">
            {rows.slice(0, 40).map((row) => (
              <li key={row.id} className="flex items-baseline justify-between gap-3 text-sm text-[#a3988c]">
                <span className="truncate text-[#f3eadf]">{row.title}{row.artist ? ` · ${row.artist}` : ""}</span>
                <span className="shrink-0">{clock(row.seconds)} · {new Date(row.played_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
