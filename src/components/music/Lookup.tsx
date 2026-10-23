"use client";

import { useState } from "react";
import { Barcode, Disc3, Link2, Search } from "lucide-react";
import { toast } from "@/store/app";
import { fmtDate, fmtDur, sp, type SpAlbum, type SpArtist, type SpTrack } from "@/lib/music";
import { musicGo } from "@/store/music";
import { cn } from "@/lib/utils";

type Tab = "isrc" | "upc" | "link";

/** ISRC → track, UPC → album, and reverse (Spotify link → ISRC / UPC) */
export default function Lookup({ initial = "isrc" }: { initial?: Tab }) {
  const [tab, setTab] = useState<Tab>(initial);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [tracks, setTracks] = useState<SpTrack[] | null>(null);
  const [albums, setAlbums] = useState<SpAlbum[] | null>(null);
  const [artist, setArtist] = useState<SpArtist | null>(null);
  const [source, setSource] = useState<string | null>(null);

  const run = async () => {
    const v = q.trim();
    if (!v) return;
    setBusy(true);
    setTracks(null);
    setAlbums(null);
    setArtist(null);
    try {
      if (tab === "isrc") {
        const r = await sp<{ source: string | null; tracks: SpTrack[] }>("isrc", { isrc: v });
        setTracks(r.tracks);
        setSource(r.source);
      } else if (tab === "upc") {
        const r = await sp<{ source: string | null; albums: SpAlbum[] }>("upc", { upc: v });
        setAlbums(r.albums);
        setSource(r.source);
      } else {
        const r = await sp<{ kind: string; track?: SpTrack; album?: SpAlbum; tracks?: SpTrack[]; artist?: SpArtist }>("reverse", { url: v });
        setSource("spotify");
        if (r.track) setTracks([r.track]);
        if (r.album) {
          setAlbums([r.album]);
          setTracks(r.tracks ?? []);
        }
        if (r.artist) setArtist(r.artist);
      }
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(false);
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode; ph: string }[] = [
    { id: "isrc", label: "ISRC → Track", icon: <Disc3 className="size-4" />, ph: "e.g. USUM71703861" },
    { id: "upc", label: "UPC → Album", icon: <Barcode className="size-4" />, ph: "e.g. 00602567373591" },
    { id: "link", label: "Link → ISRC/UPC", icon: <Link2 className="size-4" />, ph: "Paste a Spotify track or album link" },
  ];
  const cur = tabs.find((t) => t.id === tab)!;
  const none = !busy && ((tracks && !tracks.length && !albums?.length) || (albums && !albums.length && !tracks?.length));

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-3 pt-4 pb-10 sm:px-4">
      <div>
        <h2 className="text-2xl font-black">Code lookup</h2>
        <p className="text-sm text-sub">Find songs by ISRC, albums by UPC/EAN — or paste a Spotify link to get its codes.</p>
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-side p-1 text-[13px] font-semibold">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              setTracks(null);
              setAlbums(null);
              setArtist(null);
            }}
            className={cn("flex items-center justify-center gap-1.5 rounded-lg px-1 py-2", tab === t.id ? "bg-active text-txt" : "text-sub")}
          >
            <span className="hidden min-[400px]:inline">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
        className="flex gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={cur.ph}
          autoCapitalize="characters"
          className="min-w-0 flex-1 rounded-xl bg-side px-3.5 py-3 font-mono text-[15px] outline-none focus:ring-2 focus:ring-accent/50"
        />
        <button disabled={busy || !q.trim()} className="flex items-center gap-1.5 rounded-xl bg-accent px-4 font-semibold text-white hover:bg-accent-2 disabled:opacity-50">
          <Search className="size-4" /> {busy ? "…" : "Find"}
        </button>
      </form>

      {source === "deezer" && <p className="text-xs text-sub">Matched via the Deezer catalogue — tap a result to search it on Spotify.</p>}
      {none && <div className="rounded-2xl bg-side p-6 text-center text-sm text-sub">Nothing found for that code.</div>}

      {artist && (
        <button onClick={() => musicGo({ view: "artist", id: artist.id })} className="flex w-full items-center gap-3 rounded-2xl bg-side p-3 text-left hover:bg-hover">
          {artist.image && <img src={artist.image} alt="" className="size-14 rounded-full object-cover" />}
          <div>
            <div className="font-bold">{artist.name}</div>
            <div className="text-xs text-sub">Artist · open profile</div>
          </div>
        </button>
      )}

      {albums?.map((a, i) => (
        <div key={a.id ?? i} className="flex gap-3 rounded-2xl bg-side p-3">
          {a.image && <img src={a.image} alt="" className="size-24 shrink-0 rounded-lg object-cover sm:size-28" />}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="text-xs font-bold text-sub uppercase">{a.type}</div>
            <a href={a.url ?? a.search_url} target="_blank" rel="noreferrer" className="block truncate text-lg font-bold hover:underline">
              {a.name}
            </a>
            <div className="truncate text-sm text-sub">{a.artists.map((x) => x.name).join(", ")}</div>
            <div className="text-xs text-sub">
              {fmtDate(a.release_date)} · {a.total_tracks} tracks{a.label ? ` · ${a.label}` : ""}
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {a.upc && <Code label="UPC" value={a.upc} />}
              {a.url && <Code label="Link" value={a.url} />}
            </div>
          </div>
        </div>
      ))}

      {tracks && tracks.length > 0 && (
        <div className="overflow-hidden rounded-2xl bg-side">
          {tracks.map((t, i) => (
            <div key={(t.id ?? "") + i} className="flex items-center gap-3 border-b border-white/5 px-3 py-2.5 last:border-0">
              {!albums?.length && (t.album?.image ? <img src={t.album.image} alt="" className="size-12 rounded object-cover" /> : <div className="size-12 rounded bg-rail" />)}
              <div className="min-w-0 flex-1">
                <a href={t.url ?? t.search_url} target="_blank" rel="noreferrer" className="block truncate font-semibold hover:underline">
                  {t.name}
                </a>
                <div className="truncate text-xs text-sub">
                  {t.artists.map((x) => x.name).join(", ")}
                  {t.album && !albums?.length ? ` · ${t.album.name}` : ""} · {fmtDur(t.duration_ms)}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {t.isrc && <Code label="ISRC" value={t.isrc} />}
                  {t.url && <Code label="Spotify" value={t.url} />}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Code({ label, value }: { label: string; value: string }) {
  return (
    <button
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        toast(`Copied ${label}`, "success");
      }}
      className="flex max-w-full items-center gap-1 rounded-md bg-black/25 px-2 py-1 text-[11px] hover:bg-black/40"
      title="Copy"
    >
      <span className="font-bold text-sub">{label}</span>
      <span className="truncate font-mono">{label === "Spotify" || label === "Link" ? value.replace("https://open.spotify.com/", "") : value}</span>
    </button>
  );
}
