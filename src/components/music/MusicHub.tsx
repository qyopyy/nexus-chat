"use client";

import { useEffect, useMemo, useState } from "react";
import { Gamepad2, ArrowLeft, Barcode, BellRing, Library as LibraryIcon, Search, Sparkles, X } from "lucide-react";
import { useApp, openModal } from "@/store/app";
import { activePlan } from "@/lib/premium";
import { openUntitled } from "@/lib/untitled";
import { openRadio } from "@/lib/radio";
import { useMusic, musicBack, musicGo, musicHome } from "@/store/music";
import { listArtistPages, loadPosts, loadWatchlist, sp, spotifyConfig, fmtNum, type SpAlbum, type SpArtist, type Watch } from "@/lib/music";
import { myRank } from "@/lib/admin";
import { cn } from "@/lib/utils";
import { VerifiedCheck } from "@/components/ui/NameTag";
import ArtistView, { ReleaseGrid } from "./ArtistView";
import ToolView, { ToolsGrid } from "./Tools";
import Lookup from "./Lookup";
import Library from "./Library";
import { PostCard } from "./Posts";
import type { ArtistPage, ArtistPost } from "@/lib/types";

/** Music tab: artist showcase, watchlist releases, artist pages & posts, code lookup, your Spotify */
export default function MusicHub({ mobile }: { mobile?: boolean }) {
  const stack = useMusic((s) => s.stack);
  const route = stack[stack.length - 1];

  return (
    <div className="flex h-full min-h-0 flex-col bg-chat">
      <header className={cn("flex shrink-0 items-center gap-2 border-b border-black/20 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        {stack.length > 1 ? (
          <button onClick={musicBack} className="grid size-9 place-items-center rounded-full hover:bg-hover active:scale-90" aria-label="Back">
            <ArrowLeft className="size-5" />
          </button>
        ) : (
          <span className="grid size-9 place-items-center text-xl">🎧</span>
        )}
        <button onClick={musicHome} className={cn("font-bold", mobile ? "text-2xl tracking-tight" : "text-base")}>
          Music
        </button>
        <PremiumPill />
        <button
          onClick={() => useApp.setState(mobile ? { mobileTab: "games" } : { hub: "games" })}
          className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#ff2bd6] to-[#7c4dff] px-3.5 py-1.5 text-sm font-bold text-white active:scale-95"
        >
          <Gamepad2 className="size-4" /> Games
        </button>
      </header>
      <div key={JSON.stringify(route)} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {route.view === "home" && <Home />}
        {route.view === "artist" && <ArtistView spotifyId={route.id} />}
        {route.view === "page" && <ArtistView handle={route.handle} />}
        {route.view === "lookup" && <Lookup initial={route.tab} />}
        {route.view === "library" && <Library />}
        {route.view === "tool" && <ToolView tool={route.tool} />}
      </div>
    </div>
  );
}

function Home() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [pages, setPages] = useState<ArtistPage[]>([]);
  const [spInfo, setSpInfo] = useState<Record<string, SpArtist>>({});
  const [watch, setWatch] = useState<Watch[]>([]);
  const [releases, setReleases] = useState<SpAlbum[] | null>(null);
  const [fresh, setFresh] = useState<SpAlbum[]>([]);
  const [posts, setPosts] = useState<ArtistPost[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SpArtist[] | null>(null);
  const [searchErr, setSearchErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const cfg = await spotifyConfig();
      setConfigured(cfg.configured);
      const [pg, w, ps] = await Promise.all([listArtistPages(), loadWatchlist(), loadPosts(null, 20)]);
      setPages(pg);
      setWatch(w);
      setPosts(ps);
      if (!cfg.configured) return;
      const ids = pg.map((p) => p.spotify_id).filter(Boolean) as string[];
      if (ids.length) {
        sp<{ artists: SpArtist[] }>("artists", { ids })
          .then((r) => setSpInfo(Object.fromEntries(r.artists.map((a) => [a.id, a]))))
          .catch(() => {});
      }
      if (w.length) sp<{ releases: SpAlbum[] }>("releases", { ids: w.map((x) => x.spotify_id) }).then((r) => setReleases(r.releases)).catch(() => setReleases([]));
      else setReleases([]);
      sp<{ releases: SpAlbum[] }>("new_releases").then((r) => setFresh(r.releases)).catch(() => {});
    })();
  }, []);

  useEffect(() => {
    const s = q.trim();
    if (!s) {
      setResults(null);
      setSearchErr(null);
      return;
    }
    const t = setTimeout(() => {
      sp<{ items: SpArtist[] }>("search", { q: s, type: "artist" })
        .then((r) => {
          setResults(r.items);
          setSearchErr(null);
        })
        .catch((e: Error) => setSearchErr(e.message));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const pageById = useMemo(() => Object.fromEntries(pages.map((p) => [p.id, p])), [pages]);
  const showcase = useMemo(() => [...pages].sort((a, b) => Number(b.verified) - Number(a.verified)), [pages]);
  const isAdmin = myRank() >= 3;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-3 pt-3 pb-12 sm:px-5">
      {/* search */}
      <div className="sticky top-0 z-10 -mx-3 bg-chat/90 px-3 pt-1 pb-2 backdrop-blur sm:-mx-5 sm:px-5">
        <label className="flex h-11 items-center gap-2 rounded-xl bg-side px-3">
          <Search className="size-4 text-sub" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search artists on Spotify" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-sub" />
          {q && (
            <button onClick={() => setQ("")} aria-label="Clear">
              <X className="size-4 text-sub" />
            </button>
          )}
        </label>
      </div>

      {results || searchErr ? (
        <section className="space-y-1">
          {searchErr && <p className="rounded-xl bg-side p-4 text-sm text-sub">{searchErr}</p>}
          {results?.map((a) => (
            <button key={a.id} onClick={() => musicGo({ view: "artist", id: a.id, name: a.name })} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-hover">
              {a.image ? <img src={a.image} alt="" className="size-12 rounded-full object-cover" /> : <div className="grid size-12 place-items-center rounded-full bg-side">🎤</div>}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 truncate font-semibold">
                  {a.name}
                  {pages.some((p) => p.spotify_id === a.id && p.verified) && <VerifiedCheck size={14} />}
                </div>
                <div className="truncate text-xs text-sub">
                  {fmtNum(a.followers)} followers{a.genres[0] ? ` · ${a.genres.slice(0, 2).join(", ")}` : ""}
                </div>
              </div>
            </button>
          ))}
          {results?.length === 0 && <p className="p-4 text-center text-sm text-sub">No artists found.</p>}
        </section>
      ) : (
        <>
          {configured === false && (
            <div className="rounded-2xl bg-idle/10 p-4 text-sm ring-1 ring-idle/30">
              <b className="text-idle">Spotify isn&apos;t connected on the server yet.</b>{" "}
              {isAdmin ? "Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET as Supabase Edge Function secrets to unlock artist search, releases and the showcase." : "Ask an admin to connect it."} Code lookup (ISRC/UPC) already works.
            </div>
          )}

          <button
            onClick={() => void openRadio()}
            className="flex w-full items-center gap-3 rounded-2xl p-4 text-left text-white"
            style={{ background: "linear-gradient(135deg,#ff2bd6 0%,#2b0b5c 55%,#0b1528 100%)" }}
          >
            <span className="grid size-12 place-items-center rounded-xl bg-white/15 text-2xl">📻</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-semibold tracking-[0.2em] text-white/80 uppercase">Live</span>
              <span className="block text-lg font-black">Nexus Radio</span>
              <span className="block text-sm text-white/80">Add any song — everyone listens together and can jam live</span>
            </span>
          </button>

          <button
            onClick={() => openUntitled()}
            className="flex w-full items-center gap-3 rounded-2xl p-4 text-left text-[#f3efe6]"
            style={{ background: "linear-gradient(135deg,#2a241c 0%,#1a1714 50%,#3a2f24 100%)" }}
          >
            <span className="grid size-12 place-items-center rounded-xl bg-[#c4a574]/20 text-2xl">♩</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-semibold tracking-[0.2em] text-[#c4a574]/80 uppercase">New</span>
              <span className="block text-lg font-black">Cutroom</span>
              <span className="block text-sm text-[#cfc8ba]/80">WIP cuts, versioned uploads, share links, profiles & follows</span>
            </span>
          </button>

          <button
            onClick={() => useApp.setState(window.innerWidth < 768 ? { mobileTab: "games" } : { hub: "games" })}
            className="flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-[#ff2bd6] to-[#2b0b5c] p-4 text-left text-white"
          >
            <span className="text-4xl">🎮</span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-black">Games</span>
              <span className="block text-sm text-white/80">Neon Streets city driving, Beat Bird, Blocks & more — with leaderboards</span>
            </span>
            <Gamepad2 className="size-6" />
          </button>

          <section>
            <h2 className="mb-2 text-lg font-bold">Music tools</h2>
            <ToolsGrid />
          </section>

          {/* tools */}
          <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 sm:-mx-5 sm:px-5">
            <Tool icon={<Barcode className="size-5" />} label="ISRC / UPC lookup" onClick={() => musicGo({ view: "lookup" })} color="#5865F2" />
            <Tool icon={<LibraryIcon className="size-5" />} label="My Spotify" onClick={() => musicGo({ view: "library" })} color="#1DB954" />
            <Tool icon={<Sparkles className="size-5" />} label="Claim your artist page" onClick={() => document.querySelector<HTMLInputElement>("input[placeholder='Search artists on Spotify']")?.focus()} color="#EB459E" />
          </div>

          {/* showcase */}
          {showcase.length > 0 && (
            <section>
              <h2 className="mb-2.5 text-xl font-black">Artist showcase</h2>
              <div className="no-scrollbar -mx-3 flex snap-x gap-3 overflow-x-auto px-3 pb-1 sm:-mx-5 sm:px-5">
                {showcase.map((p) => {
                  const info = p.spotify_id ? spInfo[p.spotify_id] : undefined;
                  const img = info?.image ?? p.image_url;
                  return (
                    <button
                      key={p.id}
                      onClick={() => musicGo(p.spotify_id ? { view: "artist", id: p.spotify_id } : { view: "page", handle: p.handle })}
                      className="group relative h-56 w-44 shrink-0 snap-start overflow-hidden rounded-2xl bg-side text-left shadow-lg sm:h-64 sm:w-52"
                    >
                      {img && <img src={img} alt="" className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-105" />}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 p-3">
                        <div className="flex items-center gap-1 text-lg leading-tight font-black text-white">
                          <span className="truncate">{p.name}</span>
                          {p.verified && <VerifiedCheck size={16} />}
                        </div>
                        <div className="truncate text-xs text-white/70">
                          @{p.handle}
                          {info?.followers != null && ` · ${fmtNum(info.followers)} followers`}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* watchlist releases */}
          <section>
            <div className="mb-2.5 flex items-center gap-2">
              <h2 className="text-xl font-black">New from your watchlist</h2>
              <BellRing className="size-4 text-sub" />
            </div>
            {watch.length > 0 && (
              <div className="no-scrollbar -mx-3 mb-3 flex gap-2 overflow-x-auto px-3 sm:-mx-5 sm:px-5">
                {watch.map((w) => (
                  <button key={w.spotify_id} onClick={() => musicGo({ view: "artist", id: w.spotify_id })} className="flex shrink-0 items-center gap-2 rounded-full bg-side py-1 pr-3 pl-1 text-sm hover:bg-hover">
                    {w.image_url ? <img src={w.image_url} alt="" className="size-7 rounded-full object-cover" /> : <span className="grid size-7 place-items-center rounded-full bg-rail">🎤</span>}
                    {w.name}
                  </button>
                ))}
              </div>
            )}
            {watch.length === 0 ? (
              <p className="rounded-2xl bg-side p-5 text-sm text-sub">Search an artist and tap “Watch releases” — their new drops land here.</p>
            ) : releases === null ? (
              <p className="text-sm text-sub">Loading releases…</p>
            ) : releases.length ? (
              <ReleaseGrid items={releases.slice(0, 12)} />
            ) : (
              <p className="text-sm text-sub">{configured ? "No releases found yet." : "Releases appear once Spotify is connected."}</p>
            )}
          </section>

          {/* posts */}
          {posts.length > 0 && (
            <section>
              <h2 className="mb-2.5 text-xl font-black">Latest from artists</h2>
              <div className="space-y-3">
                {posts.map((p) => (
                  <PostCard key={p.id} post={p} page={pageById[p.page_id]} onRemoved={() => setPosts((l) => l.filter((x) => x.id !== p.id))} />
                ))}
              </div>
            </section>
          )}

          {fresh.length > 0 && (
            <section>
              <h2 className="mb-2.5 text-xl font-black">Fresh on Spotify</h2>
              <ReleaseGrid items={fresh.slice(0, 12)} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Tool({ icon, label, onClick, color }: { icon: React.ReactNode; label: string; onClick: () => void; color: string }) {
  return (
    <button onClick={onClick} className="flex shrink-0 items-center gap-2.5 rounded-2xl bg-side py-2.5 pr-4 pl-2.5 text-sm font-semibold hover:bg-hover active:scale-[.98]">
      <span className="grid size-9 place-items-center rounded-xl text-white" style={{ background: color }}>
        {icon}
      </span>
      {label}
    </button>
  );
}

function PremiumPill() {
  const plan = useApp((s) => activePlan(s.userId ? s.profiles[s.userId] : null));
  return (
    <button
      onClick={() => openModal("premium", plan?.id ?? null)}
      className="ml-auto flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-black text-black active:scale-95"
      style={{ background: plan?.color ?? "linear-gradient(90deg,#ffd400,#ffb000)" }}
    >
      {plan ? `${plan.emoji} ${plan.short}` : "⚡ Premium"}
    </button>
  );
}
