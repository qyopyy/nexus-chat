"use client";

import { useEffect, useState } from "react";
import { me as spMe, useSpotifyUser } from "@/lib/spotifyUser";
import { fmtDur } from "@/lib/music";
import { musicGo } from "@/store/music";
import { cn } from "@/lib/utils";
import SpotifyConnect from "./SpotifyConnect";

type Img = { url: string }[];
type T = { id: string; name: string; duration_ms: number; external_urls: { spotify: string }; artists: { id: string; name: string }[]; album: { name: string; images: Img } };

/** The signed-in user's own Spotify: now playing, top artists, liked songs, playlists, recently played */
export default function Library() {
  const connected = useSpotifyUser((s) => s.connected);
  const [tab, setTab] = useState<"liked" | "playlists" | "recent">("liked");
  const [now, setNow] = useState<{ item: T | null; is_playing: boolean } | null>(null);
  const [topArtists, setTopArtists] = useState<{ id: string; name: string; images: Img }[]>([]);
  const [liked, setLiked] = useState<T[]>([]);
  const [playlists, setPlaylists] = useState<{ id: string; name: string; images: Img | null; tracks: { total: number }; external_urls: { spotify: string } }[]>([]);
  const [recent, setRecent] = useState<T[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!connected) return;
    (async () => {
      try {
        const [n, ta, l, p, r] = await Promise.all([
          spMe("/me/player/currently-playing"),
          spMe("/me/top/artists?limit=12&time_range=short_term"),
          spMe("/me/tracks?limit=50"),
          spMe("/me/playlists?limit=50"),
          spMe("/me/player/recently-played?limit=30"),
        ]);
        setNow(n);
        setTopArtists(ta?.items ?? []);
        setLiked((l?.items ?? []).map((x: { track: T }) => x.track));
        setPlaylists((p?.items ?? []).filter(Boolean));
        setRecent((r?.items ?? []).map((x: { track: T }) => x.track));
      } catch (e) {
        setErr((e as Error).message);
      }
    })();
  }, [connected]);

  if (!connected) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 pt-10 text-center">
        <div className="mx-auto grid size-20 place-items-center rounded-full bg-[#1DB954] text-4xl text-black">◉</div>
        <h2 className="text-2xl font-black">Your Spotify library</h2>
        <p className="text-sm text-sub">Connect Spotify to see your liked songs, playlists, top artists and what you&apos;re playing — and optionally show it on your profile.</p>
        <SpotifyConnect />
      </div>
    );
  }

  const list = tab === "liked" ? liked : tab === "recent" ? recent : null;

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-3 pt-4 pb-10 sm:px-4">
      <SpotifyConnect />
      {err && <div className="rounded-xl bg-dnd/10 p-3 text-sm text-dnd">{err} — your Spotify app may need you added as a user in its dashboard (development mode).</div>}

      {now?.item && (
        <a href={now.item.external_urls.spotify} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#1DB954]/25 to-transparent p-3 ring-1 ring-[#1DB954]/30">
          <img src={now.item.album.images[0]?.url} alt="" className="size-16 rounded-lg object-cover" />
          <div className="min-w-0">
            <div className="text-[11px] font-bold tracking-wide text-[#1DB954] uppercase">{now.is_playing ? "Now playing" : "Paused"}</div>
            <div className="truncate text-lg font-bold">{now.item.name}</div>
            <div className="truncate text-sm text-sub">{now.item.artists.map((a) => a.name).join(", ")}</div>
          </div>
        </a>
      )}

      {topArtists.length > 0 && (
        <section>
          <h3 className="mb-2 font-bold">Your top artists lately</h3>
          <div className="no-scrollbar -mx-3 flex gap-3 overflow-x-auto px-3 pb-1">
            {topArtists.map((a) => (
              <button key={a.id} onClick={() => musicGo({ view: "artist", id: a.id })} className="w-24 shrink-0 text-center">
                <img src={a.images[0]?.url} alt="" className="mx-auto size-24 rounded-full object-cover" />
                <div className="mt-1.5 truncate text-xs font-semibold">{a.name}</div>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-3 gap-1 rounded-xl bg-side p-1 text-sm font-semibold">
        {(
          [
            ["liked", "Liked"],
            ["playlists", "Playlists"],
            ["recent", "Recent"],
          ] as const
        ).map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} className={cn("rounded-lg py-2", tab === id ? "bg-active text-txt" : "text-sub")}>
            {l}
          </button>
        ))}
      </div>

      {list && (
        <div className="overflow-hidden rounded-2xl bg-side">
          {list.map((t, i) => (
            <a key={`${t.id}${i}`} href={t.external_urls.spotify} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-3 py-2 hover:bg-hover">
              <img src={t.album.images[2]?.url ?? t.album.images[0]?.url} alt="" className="size-10 rounded object-cover" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{t.name}</div>
                <div className="truncate text-xs text-sub">{t.artists.map((a) => a.name).join(", ")}</div>
              </div>
              <span className="text-xs text-sub tabular-nums">{fmtDur(t.duration_ms)}</span>
            </a>
          ))}
          {list.length === 0 && <p className="p-6 text-center text-sm text-sub">Nothing here yet.</p>}
        </div>
      )}
      {tab === "playlists" && (
        <div className="grid grid-cols-2 gap-3 min-[520px]:grid-cols-3 md:grid-cols-4">
          {playlists.map((p) => (
            <a key={p.id} href={p.external_urls.spotify} target="_blank" rel="noreferrer" className="rounded-xl bg-side p-2 hover:bg-hover">
              <div className="aspect-square overflow-hidden rounded-lg bg-rail">{p.images?.[0] && <img src={p.images[0].url} alt="" className="size-full object-cover" />}</div>
              <div className="mt-2 truncate text-sm font-semibold">{p.name}</div>
              <div className="text-xs text-sub">{p.tracks?.total ?? 0} songs</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
