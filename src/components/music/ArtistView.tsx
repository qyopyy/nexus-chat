"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Check, Copy, ExternalLink, Flag, Pencil } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { fmtDate, fmtDur, fmtNum, loadPosts, loadWatchlist, myClaims, pageByHandle, pageForSpotify, requestClaim, setWatch, sp, updatePage, type SpAlbum, type SpArtist, type SpTrack } from "@/lib/music";
import { cn } from "@/lib/utils";
import { VerifiedCheck } from "@/components/ui/NameTag";
import { PostCard, PostComposer } from "./Posts";
import type { ArtistClaim, ArtistPage, ArtistPost } from "@/lib/types";

/** Artist profile: Spotify data + (if claimed) the artist's own page with posts */
export default function ArtistView({ spotifyId, handle }: { spotifyId?: string; handle?: string }) {
  const me = useApp((s) => s.userId);
  const [artist, setArtist] = useState<SpArtist | null>(null);
  const [releases, setReleases] = useState<SpAlbum[]>([]);
  const [top, setTop] = useState<SpTrack[]>([]);
  const [page, setPage] = useState<ArtistPage | null>(null);
  const [posts, setPosts] = useState<ArtistPost[]>([]);
  const [watching, setWatching] = useState(false);
  const [claim, setClaim] = useState<ArtistClaim | null>(null);
  const [claimOpen, setClaimOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"posts" | "music">("posts");

  const sid = spotifyId ?? page?.spotify_id ?? null;

  const load = useCallback(async () => {
    setErr(null);
    const pg = handle ? await pageByHandle(handle) : spotifyId ? await pageForSpotify(spotifyId) : null;
    setPage(pg);
    if (!pg) setTab("music");
    const id = spotifyId ?? pg?.spotify_id;
    if (pg) setPosts(await loadPosts(pg.id));
    if (id) {
      const [w, claims] = await Promise.all([loadWatchlist(), myClaims()]);
      setWatching(w.some((x) => x.spotify_id === id));
      setClaim(claims.find((c) => c.spotify_id === id && c.status !== "rejected") ?? null);
      try {
        const r = await sp<{ artist: SpArtist; releases: SpAlbum[]; top: SpTrack[] }>("artist", { id });
        setArtist(r.artist);
        setReleases(r.releases);
        setTop(r.top);
      } catch (e) {
        setErr((e as Error).message);
      }
    } else if (!pg) setErr("Artist not found");
  }, [spotifyId, handle]);

  useEffect(() => {
    void load();
  }, [load]);

  const name = page?.name ?? artist?.name ?? "…";
  const image = artist?.image ?? page?.image_url ?? null;
  const owner = !!page && page.owner_id === me;

  return (
    <div className="pb-10">
      {/* hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 scale-110 bg-cover bg-center opacity-40 blur-2xl" style={image ? { backgroundImage: `url("${image}")` } : undefined} />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-chat" />
        <div className="relative flex flex-col items-center gap-4 px-4 pt-6 pb-5 text-center sm:flex-row sm:items-end sm:text-left">
          {image ? (
            <img src={image} alt="" className="size-32 rounded-full object-cover shadow-2xl ring-4 ring-black/30 sm:size-40" />
          ) : (
            <div className="grid size-32 place-items-center rounded-full bg-side text-5xl sm:size-40">🎤</div>
          )}
          <div className="min-w-0">
            {page?.verified && <div className="mb-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-white/90 sm:justify-start"><VerifiedCheck size={14} /> Verified artist on Nexus</div>}
            <h1 className="text-3xl font-black tracking-tight sm:text-5xl">{name}</h1>
            <div className="mt-1 text-sm text-sub">
              {page && <span className="text-txt">@{page.handle}</span>}
              {artist?.followers != null && <span> · {fmtNum(artist.followers)} Spotify followers</span>}
            </div>
            {!!artist?.genres.length && <div className="mt-1 text-xs text-sub capitalize">{artist.genres.slice(0, 4).join(" · ")}</div>}
          </div>
        </div>
        <div className="relative flex flex-wrap justify-center gap-2 px-4 sm:justify-start">
          {sid && (
            <button
              onClick={async () => {
                const a = artist ?? { id: sid, name, image };
                if (await setWatch({ id: a.id, name: a.name, image: a.image }, !watching)) setWatching(!watching);
              }}
              className={cn("flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition active:scale-95", watching ? "bg-white/10 text-txt ring-1 ring-white/20" : "bg-accent text-white hover:bg-accent-2")}
            >
              {watching ? <Check className="size-4" /> : <BellRing className="size-4" />}
              {watching ? "Watching" : "Watch releases"}
            </button>
          )}
          {artist?.url && (
            <a href={artist.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-full bg-[#1DB954] px-4 py-2 text-sm font-bold text-black hover:brightness-110">
              ◉ Spotify
            </a>
          )}
          {sid && !page?.owner_id && !claim && (
            <button onClick={() => setClaimOpen((v) => !v)} className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold ring-1 ring-white/15 hover:bg-white/15">
              <Flag className="size-4" /> Claim this artist
            </button>
          )}
          {claim && claim.status === "pending" && <span className="rounded-full bg-idle/15 px-4 py-2 text-sm text-idle">Claim pending review</span>}
          {owner && (
            <button onClick={() => setEditing((v) => !v)} className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold ring-1 ring-white/15 hover:bg-white/15">
              <Pencil className="size-4" /> Edit page
            </button>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-4 px-3 pt-4 sm:px-4">
        {err && !page && <div className="rounded-xl bg-dnd/10 p-3 text-sm text-dnd">{err}</div>}
        {claimOpen && artist && <ClaimForm artist={artist} onDone={(c) => (setClaim(c), setClaimOpen(false))} />}
        {editing && page && <EditPage page={page} onSaved={() => (setEditing(false), void load())} />}
        {page?.bio && <p className="rounded-2xl bg-side p-3.5 text-[15px] whitespace-pre-wrap">{page.bio}</p>}

        <div className="flex gap-1 rounded-xl bg-side p-1 text-sm font-semibold">
          {(["posts", "music"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cn("flex-1 rounded-lg py-2 capitalize", tab === t ? "bg-active text-txt" : "text-sub")}>
              {t === "posts" ? `Posts${posts.length ? ` (${posts.length})` : ""}` : "Releases"}
            </button>
          ))}
        </div>

        {tab === "posts" && (
          <div className="space-y-3">
            {owner && page && <PostComposer page={page} onPosted={(p) => setPosts((l) => [p, ...l])} />}
            {!page && <Empty text="This artist hasn't claimed their Nexus page yet. Are you the artist? Tap “Claim this artist”." />}
            {page && posts.length === 0 && <Empty text="No posts yet." />}
            {page && posts.map((p) => <PostCard key={p.id} post={p} page={page} onRemoved={() => setPosts((l) => l.filter((x) => x.id !== p.id))} />)}
          </div>
        )}

        {tab === "music" && (
          <div className="space-y-5">
            {err && <div className="rounded-xl bg-side p-3 text-sm text-sub">{err}</div>}
            {top.length > 0 && (
              <section>
                <h3 className="mb-2 font-bold">Popular</h3>
                <div className="overflow-hidden rounded-2xl bg-side">
                  {top.map((t, i) => (
                    <TrackRow key={t.id ?? i} t={t} n={i + 1} />
                  ))}
                </div>
              </section>
            )}
            {releases.length > 0 && (
              <section>
                <h3 className="mb-2 font-bold">Releases</h3>
                <ReleaseGrid items={releases} />
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl bg-side p-6 text-center text-sm text-sub">{text}</div>;
}

export function TrackRow({ t, n }: { t: SpTrack; n?: number }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 hover:bg-hover">
      {n != null && <span className="w-5 text-center text-sm text-sub tabular-nums">{n}</span>}
      {t.album?.image ? <img src={t.album.image} alt="" className="size-10 rounded object-cover" /> : <div className="size-10 rounded bg-rail" />}
      <div className="min-w-0 flex-1">
        <a href={t.url ?? t.search_url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium hover:underline">
          {t.name} {t.explicit && <span className="ml-1 rounded bg-white/15 px-1 text-[10px]">E</span>}
        </a>
        <div className="truncate text-xs text-sub">{t.artists.map((a) => a.name).join(", ")}</div>
      </div>
      {t.isrc && <CopyChip label={t.isrc} />}
      <span className="hidden text-xs text-sub tabular-nums sm:block">{fmtDur(t.duration_ms)}</span>
    </div>
  );
}

export function CopyChip({ label, value }: { label: string; value?: string }) {
  return (
    <button
      onClick={() => {
        void navigator.clipboard?.writeText(value ?? label);
        toast(`Copied ${value ?? label}`, "success");
      }}
      className="hidden items-center gap-1 rounded-md bg-black/25 px-1.5 py-0.5 font-mono text-[11px] text-sub hover:text-txt min-[420px]:flex"
      title="Copy"
    >
      {label} <Copy className="size-3" />
    </button>
  );
}

export function ReleaseGrid({ items }: { items: SpAlbum[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 min-[520px]:grid-cols-3 md:grid-cols-4">
      {items.map((a, i) => (
        <a key={a.id ?? i} href={a.url ?? a.search_url ?? undefined} target="_blank" rel="noreferrer" className="group rounded-xl bg-side p-2 transition hover:bg-hover">
          <div className="relative aspect-square overflow-hidden rounded-lg bg-rail">
            {a.image && <img src={a.image} alt="" className="size-full object-cover transition group-hover:scale-105" loading="lazy" />}
            <span className="absolute top-1.5 left-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-bold text-white uppercase">{a.type}</span>
          </div>
          <div className="mt-2 truncate text-sm font-semibold">{a.name}</div>
          <div className="truncate text-xs text-sub">
            {a.artists.map((x) => x.name).join(", ")} · {fmtDate(a.release_date)}
          </div>
        </a>
      ))}
    </div>
  );
}

function ClaimForm({ artist, onDone }: { artist: SpArtist; onDone: (c: ArtistClaim) => void }) {
  const [handle, setHandle] = useState(artist.name.toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 32));
  const [proof, setProof] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3 rounded-2xl bg-side p-4 ring-1 ring-accent/30">
      <div>
        <div className="font-bold">Claim {artist.name}</div>
        <p className="text-sm text-sub">An admin checks your claim. Once approved you get the 🧑‍🎤 Artist badge and can post on this page.</p>
      </div>
      <label className="block text-sm">
        <span className="text-xs font-bold tracking-wide text-sub uppercase">Page handle (your artist username)</span>
        <div className="mt-1 flex items-center rounded-xl bg-rail px-3">
          <span className="text-sub">@</span>
          <input value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 32))} className="min-w-0 flex-1 bg-transparent px-1 py-2.5 outline-none" />
        </div>
      </label>
      <label className="block text-sm">
        <span className="text-xs font-bold tracking-wide text-sub uppercase">Proof</span>
        <textarea
          value={proof}
          onChange={(e) => setProof(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="How can we verify you? e.g. link to your Instagram/Spotify for Artists, label contact, a post mentioning your Nexus username…"
          className="mt-1 w-full resize-none rounded-xl bg-rail px-3 py-2.5 outline-none focus:ring-2 focus:ring-accent/50"
        />
      </label>
      <button
        disabled={busy || handle.length < 2}
        onClick={async () => {
          setBusy(true);
          const id = await requestClaim(artist, handle, proof);
          setBusy(false);
          if (id) onDone({ id, spotify_id: artist.id, artist_name: artist.name, artist_image: artist.image, requested_handle: handle, user_id: "", proof, status: "pending", created_at: new Date().toISOString() });
        }}
        className="w-full rounded-xl bg-accent py-2.5 font-semibold text-white hover:bg-accent-2 disabled:opacity-50"
      >
        {busy ? "Sending…" : "Send claim"}
      </button>
    </div>
  );
}

function EditPage({ page, onSaved }: { page: ArtistPage; onSaved: () => void }) {
  const [bio, setBio] = useState(page.bio ?? "");
  const [img, setImg] = useState(page.image_url ?? "");
  return (
    <div className="space-y-3 rounded-2xl bg-side p-4">
      <div className="font-bold">Edit artist page</div>
      <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} maxLength={500} placeholder="Artist bio" className="w-full resize-none rounded-xl bg-rail px-3 py-2.5 outline-none focus:ring-2 focus:ring-accent/50" />
      <input value={img} onChange={(e) => setImg(e.target.value)} placeholder="Image URL (optional — Spotify photo is used by default)" className="w-full rounded-xl bg-rail px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent/50" />
      <button onClick={async () => (await updatePage(page.id, bio, img)) && onSaved()} className="flex items-center gap-1.5 rounded-xl bg-ok px-4 py-2 font-semibold text-white">
        Save
      </button>
      <a href={`https://open.spotify.com/artist/${page.spotify_id}`} target="_blank" rel="noreferrer" className="ml-3 inline-flex items-center gap-1 text-sm text-sub hover:text-txt">
        <ExternalLink className="size-3.5" /> Spotify profile
      </a>
    </div>
  );
}
