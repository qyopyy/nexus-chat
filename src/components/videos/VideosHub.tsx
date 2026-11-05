"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bookmark, Clapperboard, Copy, Download, ExternalLink, ListVideo, MessageCircle, Pin, Plus, Scissors, Search, Send, Share2, Sparkles, ThumbsDown, ThumbsUp, Trash2, Tv, Upload, X } from "lucide-react";
import { addHistory, clearHistory, history, isLater, toggleLater, watchLater } from "@/lib/videoLists";
import ClipToShort from "./ClipToShort";
import VisualizerMaker from "@/components/media/VisualizerMaker";
import { useApp, openProfileCard, toast } from "@/store/app";
import { useStudio, videosBack, videosGo, videosHome, type VideosRoute } from "@/store/studio";
import { openLiveHub } from "@/lib/live";
import { openPulse } from "@/lib/pulse";
import {
  canDownloadVideos,
  comment as addComment,
  comments as loadComments,
  downloadVideo,
  feed,
  fmtViews,
  getVideo,
  myReaction,
  pinComment,
  react,
  removeComment,
  removeVideoAsMod,
  setSubscribed,
  subscription,
  timeAgo,
  videoLink,
} from "@/lib/videos";
import { addToPlaylist, createPlaylist, deletePlaylist, getPlaylist, myPlaylists, playlistsOf, removeFromPlaylist, renamePlaylist, setVideoChapters, type VideoPlaylist } from "@/lib/playlists";
import { sendMessage } from "@/lib/data";
import { myRank } from "@/lib/admin";
import { cn } from "@/lib/utils";
import { linkLabel, platformById } from "@/lib/links";
import Avatar from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";
import Sheet from "@/components/ui/Sheet";
import VideoCard from "./VideoCard";
import Player from "./Player";
import type { Video, VideoChapter, VideoComment } from "@/lib/types";

/** The video platform: home feed, search, subscriptions, watch page, channels */
export default function VideosHub({ mobile }: { mobile?: boolean }) {
  const stack = useStudio((s) => s.videoStack);
  const route = stack[stack.length - 1];
  return (
    <div className="flex h-full min-h-0 flex-col bg-chat">
      <TopBar mobile={mobile} canBack={stack.length > 1} route={route} />
      <div key={JSON.stringify(route)} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {route.view === "home" && <Home q={route.q} tab={route.tab} />}
        {route.view === "watch" && <Watch k={route.key} t={route.t} playlistId={route.playlist} />}
        {route.view === "channel" && <Channel userId={route.userId} />}
        {route.view === "playlist" && <PlaylistView id={route.id} />}
        {route.view === "create" && (
          <div className="mx-auto max-w-5xl p-3 sm:p-5">
            <h1 className="text-xl font-bold">Create a music video</h1>
            <p className="mb-4 text-sm text-sub">Turn a song + cover art into an animated visualizer for Videos, NexusGram Shorts, TikTok, Snapchat or Reels.</p>
            <VisualizerMaker />
          </div>
        )}
      </div>
    </div>
  );
}

function TopBar({ mobile, canBack, route }: { mobile?: boolean; canBack: boolean; route: VideosRoute }) {
  const [q, setQ] = useState(route.view === "home" ? (route.q ?? "") : "");
  return (
    <header className={cn("flex shrink-0 items-center gap-2 border-b border-black/20 px-3", mobile ? "pt-safe-3 pb-2" : "h-14")}>
      {canBack ? (
        <button onClick={videosBack} className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-hover active:scale-90" aria-label="Back">
          <ArrowLeft className="size-5" />
        </button>
      ) : null}
      <button onClick={videosHome} className="flex shrink-0 items-center gap-1.5 font-black tracking-tight">
        <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-accent to-[#eb459e] text-white">
          <Clapperboard className="size-4" />
        </span>
        <span className={cn(mobile ? "text-xl" : "text-lg", "hidden min-[400px]:inline")}>Videos</span>
      </button>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          videosGo({ view: "home", q: q.trim() || undefined });
        }}
        className="mx-auto flex h-10 min-w-0 flex-1 items-center rounded-full bg-side pl-3 md:max-w-xl"
      >
        <Search className="size-4 shrink-0 text-sub" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search videos" className="min-w-0 flex-1 bg-transparent px-2 text-[15px] outline-none placeholder:text-sub" />
        {q && (
          <button type="button" onClick={() => setQ("")} className="px-2" aria-label="Clear">
            <X className="size-4 text-sub" />
          </button>
        )}
      </form>
      <button onClick={() => videosGo({ view: "create" })} className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-side px-3 text-sm font-semibold hover:bg-hover" title="Create a music visualizer video">
        <Sparkles className="size-4" /> <span className="hidden sm:inline">Create</span>
      </button>
      <button
        onClick={() => {
          useApp.setState({ hub: "studio" });
          useStudio.setState({ uploadOpen: true, section: "content" });
        }}
        className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-side px-3 text-sm font-semibold hover:bg-hover"
        title="Upload a video"
      >
        <Upload className="size-4" /> <span className="hidden sm:inline">Upload</span>
      </button>
      <button onClick={() => useApp.setState({ hub: "studio" })} className="hidden h-10 shrink-0 items-center rounded-full bg-accent px-3 text-sm font-semibold text-white hover:bg-accent-2 sm:flex">
        Studio
      </button>
    </header>
  );
}

async function byIds(ids: string[]) {
  const vids = await Promise.all(ids.slice(0, 60).map((id) => getVideo(id).catch(() => null)));
  return vids.filter((x): x is Video => !!x);
}
function Home({ q, tab = "all" }: { q?: string; tab?: "all" | "subs" | "later" | "history" | "playlists" }) {
  const [list, setList] = useState<Video[] | null>(null);
  const [pls, setPls] = useState<VideoPlaylist[] | null>(null);
  useEffect(() => {
    setList(null);
    setPls(null);
    if (tab === "later") void byIds(watchLater()).then(setList);
    else if (tab === "history") void byIds(history().map((h) => h.id)).then(setList);
    else if (tab === "playlists") void myPlaylists().then(setPls);
    else void feed({ q, subsOnly: tab === "subs" }).then(setList);
  }, [q, tab]);
  useEffect(() => {
    if (tab === "playlists" || tab === "later" || tab === "history") return;
    const on = () => void feed({ q, subsOnly: tab === "subs" }).then(setList);
    window.addEventListener("nexus:video-ready", on);
    return () => window.removeEventListener("nexus:video-ready", on);
  }, [q, tab]);

  return (
    <div className="mx-auto max-w-[1600px] px-3 pt-3 pb-12 sm:px-5">
      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        <button
          onClick={() => openLiveHub()}
          className="flex items-center gap-3 rounded-2xl p-4 text-left text-white"
          style={{ background: "linear-gradient(135deg,#9146ff 0%,#2a0a4a 55%,#0e0e10 100%)" }}
        >
          <span className="grid size-11 place-items-center rounded-xl bg-white/15">
            <Tv className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-semibold tracking-[0.2em] text-[#bf94ff] uppercase">Live</span>
            <span className="block text-lg font-black">Nexus Live</span>
            <span className="block text-sm text-white/75">Go live in HD or 4K · camera & screen share</span>
          </span>
        </button>
        <button
          onClick={() => openPulse()}
          className="flex items-center gap-3 rounded-2xl p-4 text-left text-white"
          style={{ background: "linear-gradient(135deg,#1d9bf0 0%,#0a2540 55%,#0e0e10 100%)" }}
        >
          <span className="grid size-11 place-items-center rounded-xl bg-white/15 text-lg font-black">𝕏</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-semibold tracking-[0.2em] text-[#8ecdf8] uppercase">Social</span>
            <span className="block text-lg font-black">Pulse</span>
            <span className="block text-sm text-white/75">Twitter-style posts, likes, follows & reposts</span>
          </span>
        </button>
      </div>
      <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
        {(
          [
            ["all", "All"],
            ["subs", "Subscriptions"],
            ["later", "Watch later"],
            ["history", "History"],
            ["playlists", "Playlists"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => videosGo({ view: "home", q, tab: id })}
            className={cn("shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold", tab === id ? "bg-txt text-chat" : "bg-side hover:bg-hover")}
          >
            {label}
          </button>
        ))}
        {q && <span className="flex shrink-0 items-center rounded-lg bg-accent/15 px-3 py-1.5 text-sm text-accent">“{q}”</span>}
        {tab === "history" && (list?.length ?? 0) > 0 && (
          <button onClick={() => (clearHistory(), setList([]))} className="ml-auto shrink-0 rounded-lg px-3 py-1.5 text-sm text-sub hover:bg-hover">
            Clear history
          </button>
        )}
        {tab === "playlists" && (
          <button
            onClick={async () => {
              const title = prompt("Playlist name");
              if (!title?.trim()) return;
              const p = await createPlaylist(title.trim());
              if (p) setPls((x) => [p, ...(x ?? [])]);
            }}
            className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white"
          >
            <Plus className="size-4" /> New playlist
          </button>
        )}
      </div>
      {tab === "playlists" ? (
        pls === null ? (
          <p className="text-sub">Loading…</p>
        ) : pls.length === 0 ? (
          <div className="mx-auto max-w-sm py-16 text-center">
            <ListVideo className="mx-auto size-10 text-sub" />
            <div className="mt-3 text-lg font-bold">No playlists yet</div>
            <p className="mt-1 text-sm text-sub">Create a playlist and add videos from any watch page.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pls.map((p) => (
              <button key={p.id} onClick={() => videosGo({ view: "playlist", id: p.id })} className="rounded-2xl border border-line/50 bg-side/40 p-4 text-left hover:bg-hover">
                <div className="flex items-center gap-3">
                  <span className="grid size-12 place-items-center rounded-xl bg-accent/15 text-accent">
                    <ListVideo className="size-6" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{p.title}</span>
                    <span className="block text-xs text-sub capitalize">{p.visibility}</span>
                  </span>
                </div>
              </button>
            ))}
          </div>
        )
      ) : list === null ? (
        <Grid>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i}>
              <div className="aspect-video animate-pulse rounded-xl bg-side" />
              <div className="mt-3 h-4 w-3/4 animate-pulse rounded bg-side" />
              <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-side" />
            </div>
          ))}
        </Grid>
      ) : list.length === 0 ? (
        <div className="mx-auto max-w-sm py-16 text-center">
          <div className="mx-auto mb-3 grid size-16 place-items-center rounded-full bg-side text-3xl">🎬</div>
          <div className="text-lg font-bold">{q ? "No videos found" : tab === "subs" ? "Nothing from your subscriptions yet" : tab === "later" ? "Nothing saved yet — tap Save on any video" : tab === "history" ? "No watch history on this device" : "No videos yet"}</div>
          <p className="mt-1 text-sm text-sub">Upload the first one in 1080p or 4K from Studio.</p>
          <button
            onClick={() => {
              useApp.setState({ hub: "studio" });
              useStudio.setState({ uploadOpen: true, section: "content" });
            }}
            className="mt-4 rounded-full bg-accent px-5 py-2 font-semibold text-white"
          >
            Upload video
          </button>
        </div>
      ) : (
        <Grid>
          {list.map((v) => (
            <VideoCard key={v.id} v={v} />
          ))}
        </Grid>
      )}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-x-4 gap-y-7 min-[560px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{children}</div>;
}

// ------------------------------------------------------------------ watch page
function Watch({ k, t, playlistId }: { k: string; t?: number; playlistId?: string }) {
  const me = useApp((s) => s.userId);
  const [v, setV] = useState<Video | null | undefined>(undefined);
  const [mine, setMine] = useState(0);
  const [counts, setCounts] = useState({ likes: 0, dislikes: 0 });
  const [sub, setSub] = useState({ count: 0, subscribed: false });
  const [more, setMore] = useState<Video[]>([]);
  const [plQueue, setPlQueue] = useState<{ title: string; videos: Video[] } | null>(null);
  const [descOpen, setDescOpen] = useState(false);
  const [share, setShare] = useState(false);
  const [later, setLater] = useState(false);
  const [clip, setClip] = useState(false);
  const [addPl, setAddPl] = useState(false);
  const [editChapters, setEditChapters] = useState(false);

  useEffect(() => {
    void getVideo(k).then((x) => {
      setV(x);
      if (!x) return;
      addHistory(x.slug ?? x.id);
      setLater(isLater(x.slug ?? x.id));
      setCounts({ likes: x.likes, dislikes: x.dislikes });
      void myReaction(x.id).then(setMine);
      void subscription(x.owner_id).then(setSub);
      if (!playlistId) void feed({ limit: 20 }).then((l) => setMore(l.filter((o) => o.id !== x.id)));
      // shareable URL while watching
      try {
        window.history.replaceState(null, "", `/v/${x.slug ?? x.id}`);
      } catch {
        /* ignore */
      }
    });
    return () => {
      try {
        if (window.location.pathname.startsWith("/v/")) window.history.replaceState(null, "", "/");
      } catch {
        /* ignore */
      }
    };
  }, [k, playlistId]);

  useEffect(() => {
    if (!playlistId) {
      setPlQueue(null);
      return;
    }
    void getPlaylist(playlistId).then((r) => {
      if (!r) return setPlQueue(null);
      setPlQueue({ title: r.playlist.title, videos: r.videos });
      setMore(r.videos);
    });
  }, [playlistId]);

  if (v === undefined) return <div className="grid h-60 place-items-center text-sub">Loading…</div>;
  if (v === null) return <div className="grid h-60 place-items-center text-sub">This video isn&apos;t available.</div>;

  const doReact = async (val: number) => {
    const next = mine === val ? 0 : val;
    setMine(next);
    const r = await react(v.id, next);
    if (r) setCounts({ likes: r.likes, dislikes: r.dislikes });
  };

  return (
    <div className="mx-auto flex max-w-[1700px] flex-col gap-6 pb-12 lg:flex-row lg:px-6 lg:pt-5">
      <div className="min-w-0 flex-1">
        <Player v={v} start={t} className="lg:rounded-2xl" tools />
        <div className="px-3 lg:px-0">
          <h1 className="mt-3 text-lg leading-snug font-bold sm:text-xl">{v.title}</h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            <button onClick={() => videosGo({ view: "channel", userId: v.owner_id })} className="flex min-w-0 items-center gap-2.5">
              <Avatar userId={v.owner_id} size={40} plain />
              <div className="min-w-0 text-left">
                <NameTag userId={v.owner_id} className="font-semibold" maxBadges={3} />
                <div className="text-xs text-sub">{fmtViews(sub.count)} subscribers</div>
              </div>
            </button>
            {me !== v.owner_id && (
              <button
                onClick={async () => {
                  const on = !sub.subscribed;
                  if (await setSubscribed(v.owner_id, on)) setSub((s) => ({ subscribed: on, count: s.count + (on ? 1 : -1) }));
                }}
                className={cn("rounded-full px-4 py-2 text-sm font-semibold", sub.subscribed ? "bg-side text-txt" : "bg-txt text-chat")}
              >
                {sub.subscribed ? "Subscribed" : "Subscribe"}
              </button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center overflow-hidden rounded-full bg-side">
                <button onClick={() => void doReact(1)} className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold hover:bg-hover">
                  <ThumbsUp className={cn("size-[18px]", mine === 1 && "fill-current")} /> {fmtViews(counts.likes)}
                </button>
                <span className="h-5 w-px bg-white/15" />
                <button onClick={() => void doReact(-1)} className="px-3.5 py-2 hover:bg-hover" aria-label="Dislike">
                  <ThumbsDown className={cn("size-[18px]", mine === -1 && "fill-current")} />
                </button>
              </div>
              <button onClick={() => setShare(true)} className="flex items-center gap-1.5 rounded-full bg-side px-3.5 py-2 text-sm font-semibold hover:bg-hover">
                <Share2 className="size-[18px]" /> Share
              </button>
              {canDownloadVideos() && (
                <button
                  onClick={() => void downloadVideo(v)}
                  className="flex items-center gap-1.5 rounded-full bg-side px-3.5 py-2 text-sm font-semibold hover:bg-hover"
                  title="Download video (VIP, mods & admins)"
                >
                  <Download className="size-[18px]" /> Download
                </button>
              )}
              <button
                onClick={() => {
                  const on = toggleLater(v.slug ?? v.id);
                  setLater(on);
                  toast(on ? "Saved to Watch later" : "Removed from Watch later", "success");
                }}
                className={cn("flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold", later ? "bg-txt text-chat" : "bg-side hover:bg-hover")}
              >
                <Bookmark className={cn("size-[18px]", later && "fill-current")} /> {later ? "Saved" : "Save"}
              </button>
              <button onClick={() => setAddPl(true)} className="flex items-center gap-1.5 rounded-full bg-side px-3.5 py-2 text-sm font-semibold hover:bg-hover" title="Add to playlist">
                <ListVideo className="size-[18px]" /> Playlist
              </button>
              {me === v.owner_id && (
                <button onClick={() => setClip(true)} className="flex items-center gap-1.5 rounded-full bg-side px-3.5 py-2 text-sm font-semibold hover:bg-hover" title="Cut a vertical Short from this video">
                  <Scissors className="size-[18px]" /> Make a Short
                </button>
              )}
              {me === v.owner_id && (
                <button onClick={() => setEditChapters(true)} className="flex items-center gap-1.5 rounded-full bg-side px-3.5 py-2 text-sm font-semibold hover:bg-hover" title="Edit chapters">
                  Chapters
                </button>
              )}
              {myRank() >= 2 && me !== v.owner_id && (
                <button
                  onClick={async () => {
                    const reason = prompt("Remove this video? Reason:");
                    if (reason !== null && (await removeVideoAsMod(v.id, reason))) videosBack();
                  }}
                  className="grid size-9 place-items-center rounded-full bg-side text-dnd hover:bg-hover"
                  title="Remove video (staff)"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          </div>

          {/* description */}
          <div className={cn("mt-3 rounded-xl bg-side p-3 text-sm", !descOpen && "cursor-pointer hover:bg-hover")} onClick={() => !descOpen && setDescOpen(true)}>
            <div className="font-semibold">
              {v.views.toLocaleString()} views · {new Date(v.published_at ?? v.created_at).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" })}
              {v.tags.length > 0 && <span className="ml-2 font-normal text-accent">{v.tags.slice(0, 3).map((x) => `#${x}`).join(" ")}</span>}
            </div>
            <div className={cn("mt-1 whitespace-pre-wrap break-words", !descOpen && "line-clamp-3")}>{v.description ? <Description text={v.description} /> : <span className="text-sub">No description</span>}</div>
            {descOpen && v.links.length > 0 && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {v.links.map((l, i) => (
                  <LinkCard key={i} label={l.label} url={l.url} />
                ))}
              </div>
            )}
            {descOpen && (
              <button onClick={(e) => (e.stopPropagation(), setDescOpen(false))} className="mt-2 font-semibold">
                Show less
              </button>
            )}
            {!descOpen && <span className="font-semibold">...more</span>}
          </div>

          {(v.chapters?.length ?? 0) > 0 && (
            <div className="mt-3 overflow-hidden rounded-xl border border-line/50">
              <div className="bg-side/60 px-3 py-2 text-xs font-bold tracking-wide text-sub uppercase">Chapters</div>
              <div className="max-h-48 overflow-y-auto">
                {v.chapters!.map((c, i) => (
                  <button
                    key={`${c.t}-${i}`}
                    onClick={() => window.dispatchEvent(new CustomEvent("nexus:seek", { detail: c.t }))}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-hover"
                  >
                    <span className="tabular-nums text-accent">{fmtTime(c.t)}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{c.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!descOpen && v.links.length > 0 && (
            <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
              {v.links.map((l, i) => (
                <a key={i} href={l.url} target="_blank" rel="noreferrer noopener" className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1.5 text-sm font-semibold text-accent hover:bg-accent/25">
                  <ExternalLink className="size-3.5" /> {l.label || l.url.replace(/^https?:\/\//, "")}
                </a>
              ))}
            </div>
          )}

          <Comments v={v} />
        </div>
      </div>

      <aside className="w-full shrink-0 space-y-1 px-2 lg:w-[400px] lg:px-0">
        <div className="flex items-center justify-between px-1 pb-1">
          <div className="font-bold">{plQueue ? plQueue.title : "Up next"}</div>
          {playlistId && (
            <button onClick={() => videosGo({ view: "playlist", id: playlistId })} className="text-xs font-semibold text-accent hover:underline">
              Open playlist
            </button>
          )}
        </div>
        {more.map((o) => (
          <VideoCard key={o.id} v={o} compact onOpen={playlistId ? () => videosGo({ view: "watch", key: o.slug ?? o.id, playlist: playlistId }) : undefined} />
        ))}
        {more.length === 0 && <p className="px-1 text-sm text-sub">No other videos yet.</p>}
      </aside>

      <ShareSheet open={share} onClose={() => setShare(false)} v={v} />
      {clip && <ClipToShort v={v} onClose={() => setClip(false)} />}
      {addPl && <AddToPlaylistSheet v={v} onClose={() => setAddPl(false)} />}
      {editChapters && (
        <ChaptersEditor
          v={v}
          onClose={() => setEditChapters(false)}
          onSaved={(chapters) => setV((cur) => (cur ? { ...cur, chapters } : cur))}
        />
      )}
    </div>
  );
}

function fmtTime(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

function parseTime(raw: string) {
  const p = raw.trim().split(":").map(Number);
  if (p.some((n) => !Number.isFinite(n))) return null;
  if (p.length === 1) return p[0]!;
  if (p.length === 2) return p[0]! * 60 + p[1]!;
  if (p.length === 3) return p[0]! * 3600 + p[1]! * 60 + p[2]!;
  return null;
}

function AddToPlaylistSheet({ v, onClose }: { v: Video; onClose: () => void }) {
  const [pls, setPls] = useState<VideoPlaylist[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    void myPlaylists().then(setPls);
  }, []);
  return (
    <Sheet open onClose={onClose} title="Save to playlist" className="bg-menu">
      <div className="space-y-2 px-3 pb-4">
        <button
          onClick={async () => {
            const title = prompt("New playlist name");
            if (!title?.trim()) return;
            const p = await createPlaylist(title.trim());
            if (!p) return;
            await addToPlaylist(p.id, v.id);
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded-xl bg-accent/15 px-3 py-2.5 text-sm font-semibold text-accent hover:bg-accent/25"
        >
          <Plus className="size-4" /> Create new playlist
        </button>
        {pls === null ? (
          <p className="py-6 text-center text-sm text-sub">Loading…</p>
        ) : pls.length === 0 ? (
          <p className="py-6 text-center text-sm text-sub">No playlists yet.</p>
        ) : (
          pls.map((p) => (
            <button
              key={p.id}
              disabled={busy === p.id}
              onClick={async () => {
                setBusy(p.id);
                await addToPlaylist(p.id, v.id);
                setBusy(null);
                onClose();
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/5 disabled:opacity-50"
            >
              <span className="grid size-10 place-items-center rounded-lg bg-side text-accent">
                <ListVideo className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{p.title}</span>
                <span className="block text-xs text-sub capitalize">{p.visibility}</span>
              </span>
            </button>
          ))
        )}
      </div>
    </Sheet>
  );
}

function ChaptersEditor({ v, onClose, onSaved }: { v: Video; onClose: () => void; onSaved: (c: VideoChapter[]) => void }) {
  const [rows, setRows] = useState<VideoChapter[]>(() => (v.chapters?.length ? [...v.chapters] : [{ t: 0, title: "Intro" }]));
  const [saving, setSaving] = useState(false);
  return (
    <Sheet open onClose={onClose} title="Edit chapters" className="bg-menu">
      <div className="space-y-3 px-3 pb-4">
        <p className="text-sm text-sub">Add timestamps so viewers can jump through long videos.</p>
        {rows.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={fmtTime(c.t)}
              onChange={(e) => {
                const t = parseTime(e.target.value);
                if (t === null) return;
                setRows((r) => r.map((x, k) => (k === i ? { ...x, t } : x)));
              }}
              className="w-20 rounded-lg bg-side px-2 py-2 font-mono text-sm outline-none"
              placeholder="0:00"
            />
            <input
              value={c.title}
              onChange={(e) => setRows((r) => r.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))}
              className="min-w-0 flex-1 rounded-lg bg-side px-3 py-2 text-sm outline-none"
              placeholder="Chapter title"
            />
            <button onClick={() => setRows((r) => r.filter((_, k) => k !== i))} className="grid size-9 place-items-center rounded-full hover:bg-hover" aria-label="Remove">
              <X className="size-4" />
            </button>
          </div>
        ))}
        <button onClick={() => setRows((r) => [...r, { t: (r[r.length - 1]?.t ?? 0) + 30, title: "" }])} className="inline-flex items-center gap-1 rounded-full bg-side px-3 py-1.5 text-sm font-semibold hover:bg-hover">
          <Plus className="size-4" /> Add chapter
        </button>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-hover">
            Cancel
          </button>
          <button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              const ok = await setVideoChapters(v.id, rows);
              setSaving(false);
              if (ok) {
                const clean = rows
                  .filter((c) => Number.isFinite(c.t) && c.t >= 0 && c.title.trim())
                  .map((c) => ({ t: Math.round(c.t), title: c.title.trim().slice(0, 80) }))
                  .sort((a, b) => a.t - b.t);
                onSaved(clean);
                toast("Chapters saved", "success");
                onClose();
              }
            }}
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function PlaylistView({ id }: { id: string }) {
  const me = useApp((s) => s.userId);
  const profiles = useApp((s) => s.profiles);
  const [data, setData] = useState<Awaited<ReturnType<typeof getPlaylist>>>(undefined as unknown as Awaited<ReturnType<typeof getPlaylist>> | null);
  useEffect(() => {
    void getPlaylist(id).then(setData);
  }, [id]);
  if (data === undefined) return <div className="grid h-60 place-items-center text-sub">Loading…</div>;
  if (!data) return <div className="grid h-60 place-items-center text-sub">Playlist not found.</div>;
  const { playlist: pl, videos } = data;
  const mine = me === pl.owner_id;
  return (
    <div className="mx-auto max-w-5xl px-3 py-6 sm:px-5">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-semibold tracking-wide text-sub uppercase">Playlist</div>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{pl.title}</h1>
          <p className="mt-1 text-sm text-sub">
            {profiles[pl.owner_id]?.display_name ?? "…"} · {videos.length} video{videos.length === 1 ? "" : "s"} · <span className="capitalize">{pl.visibility}</span>
          </p>
          {pl.description && <p className="mt-2 max-w-2xl text-sm text-sub">{pl.description}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {videos[0] && (
            <button
              onClick={() => videosGo({ view: "watch", key: videos[0]!.slug ?? videos[0]!.id, playlist: pl.id })}
              className="rounded-full bg-txt px-5 py-2 text-sm font-semibold text-chat"
            >
              Play all
            </button>
          )}
          {mine && (
            <button
              onClick={async () => {
                const title = prompt("Rename playlist", pl.title);
                if (!title?.trim()) return;
                if (await renamePlaylist(pl.id, title.trim())) setData({ playlist: { ...pl, title: title.trim() }, videos });
              }}
              className="rounded-full bg-side px-4 py-2 text-sm font-semibold hover:bg-hover"
            >
              Rename
            </button>
          )}
          {mine && (
            <button
              onClick={async () => {
                if (!confirm("Delete this playlist?")) return;
                if (await deletePlaylist(pl.id)) {
                  toast("Playlist deleted", "success");
                  useStudio.setState({ videoStack: [{ view: "home", tab: "playlists" }] });
                }
              }}
              className="rounded-full bg-dnd/15 px-4 py-2 text-sm font-semibold text-dnd hover:bg-dnd/25"
            >
              Delete
            </button>
          )}
        </div>
      </div>
      {videos.length === 0 ? (
        <p className="py-16 text-center text-sub">This playlist is empty. Add videos from any watch page.</p>
      ) : (
        <div className="space-y-1">
          {videos.map((v, i) => (
            <div key={v.id} className="flex items-center gap-2 rounded-xl hover:bg-hover">
              <span className="w-8 text-center text-sm tabular-nums text-sub">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <VideoCard v={v} compact onOpen={() => videosGo({ view: "watch", key: v.slug ?? v.id, playlist: pl.id })} />
              </div>
              {mine && (
                <button
                  onClick={async () => {
                    if (await removeFromPlaylist(pl.id, v.id)) setData({ playlist: pl, videos: videos.filter((x) => x.id !== v.id) });
                  }}
                  className="mr-2 grid size-9 shrink-0 place-items-center rounded-full text-sub hover:bg-side hover:text-dnd"
                  title="Remove from playlist"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** description text: links + clickable 1:23 timestamps */
function Description({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+|\b\d{1,2}:\d{2}(?::\d{2})?\b|#[\p{L}\d_]+)/u);
  return (
    <>
      {parts.map((p, i) => {
        if (/^https?:\/\//.test(p))
          return (
            <a key={i} href={p} target="_blank" rel="noreferrer noopener" className="text-[#6ab7ff] hover:underline" onClick={(e) => e.stopPropagation()}>
              {p}
            </a>
          );
        if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(p)) {
          const sec = p.split(":").reduce((a, x) => a * 60 + Number(x), 0);
          return (
            <button key={i} onClick={(e) => (e.stopPropagation(), window.dispatchEvent(new CustomEvent("nexus:seek", { detail: sec })))} className="text-[#6ab7ff] hover:underline">
              {p}
            </button>
          );
        }
        if (/^#[\p{L}\d_]+$/u.test(p))
          return (
            <button key={i} onClick={(e) => (e.stopPropagation(), videosGo({ view: "home", q: p.slice(1) }))} className="text-[#6ab7ff] hover:underline">
              {p}
            </button>
          );
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

function LinkCard({ label, url }: { label: string; url: string }) {
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* keep */
  }
  return (
    <a href={url} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()} className="flex items-center gap-3 rounded-xl bg-black/25 p-2.5 hover:bg-black/40">
      <img src={`https://www.google.com/s2/favicons?domain=${host}&sz=64`} alt="" className="size-8 rounded-lg bg-white/10" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{label || host}</span>
        <span className="block truncate text-xs text-sub">{host}</span>
      </span>
      <ExternalLink className="size-4 shrink-0 text-sub" />
    </a>
  );
}

function ShareSheet({ open, onClose, v }: { open: boolean; onClose: () => void; v: Video }) {
  const chats = useApp((s) => s.chatList);
  const profiles = useApp((s) => s.profiles);
  const link = videoLink(v);
  const [sent, setSent] = useState<Record<string, boolean>>({});
  return (
    <Sheet open={open} onClose={onClose} title="Share" className="bg-menu">
      <div className="space-y-3 px-3 pb-3">
        <div className="flex items-center gap-2 rounded-xl bg-black/30 p-2 pl-3">
          <span className="min-w-0 flex-1 truncate font-mono text-sm">{link}</span>
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(link);
              toast("Link copied", "success");
            }}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white"
          >
            <Copy className="size-4" /> Copy
          </button>
        </div>
        {typeof navigator !== "undefined" && "share" in navigator && (
          <button onClick={() => void navigator.share({ title: v.title, url: link }).catch(() => {})} className="w-full rounded-xl bg-white/5 py-2.5 text-sm font-semibold hover:bg-white/10">
            Share to other apps…
          </button>
        )}
        <div className="text-xs font-bold tracking-wide text-sub uppercase">Send in Nexus</div>
        <div className="max-h-72 space-y-0.5 overflow-y-auto">
          {chats.map((c) => {
            const name = c.kind === "dm" ? (profiles[c.other_user_id ?? ""]?.display_name ?? "Direct message") : (c.name ?? "Group");
            return (
              <div key={c.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-white/5">
                {c.kind === "dm" && c.other_user_id ? <Avatar userId={c.other_user_id} size={34} plain /> : <span className="grid size-[34px] place-items-center rounded-full bg-accent/30">👥</span>}
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
                <button
                  disabled={sent[c.id]}
                  onClick={async () => {
                    await sendMessage(c.id, `🎬 ${v.title}\n${link}`);
                    setSent((s) => ({ ...s, [c.id]: true }));
                  }}
                  className={cn("flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold", sent[c.id] ? "bg-ok/20 text-ok" : "bg-accent text-white")}
                >
                  {sent[c.id] ? "Sent" : (<><Send className="size-3" /> Send</>)}
                </button>
              </div>
            );
          })}
          {chats.length === 0 && <p className="text-sm text-sub">No chats yet.</p>}
        </div>
      </div>
    </Sheet>
  );
}

function Comments({ v }: { v: Video }) {
  const me = useApp((s) => s.userId);
  const [list, setList] = useState<VideoComment[] | null>(null);
  const [text, setText] = useState("");
  const [focus, setFocus] = useState(false);
  const load = useCallback(() => void loadComments(v.id).then(setList), [v.id]);
  useEffect(load, [load]);
  const owner = me === v.owner_id;
  const staff = myRank() >= 2;

  const top = useMemo(() => (list ?? []).filter((c) => !c.parent_id), [list]);

  if (!v.comments_enabled)
    return (
      <div className="mt-6 flex items-center gap-2 text-sm text-sub">
        <MessageCircle className="size-4" /> Comments are turned off.
      </div>
    );

  return (
    <section className="mt-6">
      <h2 className="mb-4 text-lg font-bold">{v.comment_count.toLocaleString()} Comments</h2>
      <div className="mb-6 flex gap-3">
        {me && <Avatar userId={me} size={40} plain />}
        <div className="min-w-0 flex-1">
          <textarea
            value={text}
            onFocus={() => setFocus(true)}
            onChange={(e) => setText(e.target.value)}
            rows={focus ? 2 : 1}
            placeholder="Add a comment…"
            className="w-full resize-none border-b border-line bg-transparent pb-1 text-[15px] outline-none focus:border-txt"
          />
          {focus && (
            <div className="mt-2 flex justify-end gap-2">
              <button onClick={() => (setFocus(false), setText(""))} className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-hover">
                Cancel
              </button>
              <button
                disabled={!text.trim()}
                onClick={async () => {
                  if (await addComment(v.id, text)) {
                    setText("");
                    setFocus(false);
                    load();
                  }
                }}
                className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                Comment
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="space-y-5">
        {top.map((c) => (
          <CommentRow key={c.id} c={c} replies={(list ?? []).filter((r) => r.parent_id === c.id)} owner={owner} staff={staff} v={v} onChange={load} />
        ))}
      </div>
    </section>
  );
}

function CommentRow({ c, replies, owner, staff, v, onChange }: { c: VideoComment; replies: VideoComment[]; owner: boolean; staff: boolean; v: Video; onChange: () => void }) {
  const me = useApp((s) => s.userId);
  const [reply, setReply] = useState(false);
  const [text, setText] = useState("");
  const [showReplies, setShowReplies] = useState(false);
  const canRemove = me === c.author_id || owner || staff;
  return (
    <div className="flex gap-3">
      <button onClick={(e) => openProfileCard(c.author_id, e)} className="shrink-0">
        <Avatar userId={c.author_id} size={40} plain />
      </button>
      <div className="min-w-0 flex-1">
        {c.pinned && (
          <div className="mb-0.5 flex items-center gap-1 text-xs text-sub">
            <Pin className="size-3" /> Pinned by the creator
          </div>
        )}
        <div className="flex items-center gap-1.5 text-[13px]">
          <span className={cn("font-semibold", c.author_id === v.owner_id && "rounded-full bg-white/15 px-2")}>
            <NameTag userId={c.author_id} maxBadges={2} />
          </span>
          <span className="text-sub">{timeAgo(c.created_at)}</span>
        </div>
        <div className="mt-0.5 text-[15px] break-words whitespace-pre-wrap">
          <Description text={c.content} />
        </div>
        <div className="mt-1 flex items-center gap-1 text-xs">
          {!c.parent_id && (
            <button onClick={() => setReply((x) => !x)} className="rounded-full px-3 py-1.5 font-semibold hover:bg-hover">
              Reply
            </button>
          )}
          {owner && !c.parent_id && (
            <button onClick={async () => (await pinComment(c.id, !c.pinned)) && onChange()} className="rounded-full px-3 py-1.5 font-semibold text-sub hover:bg-hover">
              {c.pinned ? "Unpin" : "Pin"}
            </button>
          )}
          {canRemove && (
            <button onClick={async () => confirm("Delete this comment?") && (await removeComment(c.id)) && onChange()} className="rounded-full px-3 py-1.5 font-semibold text-sub hover:bg-hover hover:text-dnd">
              Delete
            </button>
          )}
        </div>
        {reply && (
          <div className="mt-2 flex items-end gap-2">
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a reply…" className="min-w-0 flex-1 border-b border-line bg-transparent pb-1 text-sm outline-none focus:border-txt" />
            <button
              disabled={!text.trim()}
              onClick={async () => {
                if (await addComment(v.id, text, c.id)) {
                  setText("");
                  setReply(false);
                  setShowReplies(true);
                  onChange();
                }
              }}
              className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              Reply
            </button>
          </div>
        )}
        {replies.length > 0 && (
          <button onClick={() => setShowReplies((x) => !x)} className="mt-1 rounded-full px-3 py-1.5 text-sm font-semibold text-accent hover:bg-accent/10">
            {showReplies ? "Hide" : `${replies.length}`} {replies.length === 1 ? "reply" : "replies"}
          </button>
        )}
        {showReplies && (
          <div className="mt-2 space-y-3">
            {replies
              .slice()
              .reverse()
              .map((r) => (
                <CommentRow key={r.id} c={r} replies={[]} owner={owner} staff={staff} v={v} onChange={onChange} />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ channel page
function Channel({ userId }: { userId: string }) {
  const p = useApp((s) => s.profiles[userId]);
  const me = useApp((s) => s.userId);
  const [list, setList] = useState<Video[] | null>(null);
  const [pls, setPls] = useState<VideoPlaylist[] | null>(null);
  const [tab, setTab] = useState<"videos" | "playlists">("videos");
  const [sub, setSub] = useState({ count: 0, subscribed: false });
  useEffect(() => {
    void feed({ owner: userId, limit: 200 }).then((l) => setList(me === userId ? l : l.filter((v) => v.visibility === "public")));
    void playlistsOf(userId).then(setPls);
    void subscription(userId).then(setSub);
  }, [userId, me]);
  if (!p) return <div className="p-6 text-sub">Loading…</div>;
  const banner = p.banner_color || p.avatar_color;
  return (
    <div className="mx-auto max-w-[1400px] pb-12">
      <div className="px-3 pt-3 sm:px-5">
        <div
          className="aspect-[6/1] min-h-24 w-full rounded-2xl bg-cover bg-center"
          style={p.banner_url ? { backgroundImage: `url("${p.banner_url}")` } : { background: banner.startsWith("linear") ? banner : `linear-gradient(135deg, ${banner}, ${banner}55)` }}
        />
      </div>
      <div className="flex flex-col gap-4 px-3 py-5 sm:flex-row sm:items-center sm:px-5">
        <Avatar userId={userId} size={120} plain className="shrink-0" />
        <div className="min-w-0 flex-1">
          <NameTag userId={userId} className="text-3xl font-black" badgeSize="lg" />
          <div className="mt-1 text-sm text-sub">
            @{p.username} · {fmtViews(sub.count)} subscribers · {list?.length ?? 0} videos
          </div>
          {(p.channel_description || p.bio) && <p className="mt-2 line-clamp-3 max-w-2xl text-sm text-sub">{p.channel_description || p.bio}</p>}
          {!!p.links?.length && (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
              {p.links.slice(0, 4).map((l, i) => (
                <a key={i} href={l.url} target="_blank" rel="noreferrer" className="text-[#6ab7ff] hover:underline">
                  {platformById(l.type).label}: {linkLabel(l)}
                </a>
              ))}
            </div>
          )}
          <div className="mt-3 flex gap-2">
            {me !== userId ? (
              <button
                onClick={async () => {
                  const on = !sub.subscribed;
                  if (await setSubscribed(userId, on)) setSub((s) => ({ subscribed: on, count: s.count + (on ? 1 : -1) }));
                }}
                className={cn("rounded-full px-5 py-2 text-sm font-semibold", sub.subscribed ? "bg-side" : "bg-txt text-chat")}
              >
                {sub.subscribed ? "Subscribed" : "Subscribe"}
              </button>
            ) : (
              <button onClick={() => useApp.setState({ hub: "studio" })} className="rounded-full bg-side px-5 py-2 text-sm font-semibold hover:bg-hover">
                Manage videos
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="flex gap-4 border-b border-line px-3 sm:px-5">
        {(
          [
            ["videos", "Videos"],
            ["playlists", "Playlists"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={cn("pb-2 text-sm font-semibold", tab === id ? "border-b-2 border-txt text-txt" : "text-sub hover:text-txt")}>
            {label}
          </button>
        ))}
      </div>
      <div className="px-3 pt-5 sm:px-5">
        {tab === "videos" ? (
          list === null ? (
            <p className="text-sub">Loading…</p>
          ) : list.length ? (
            <Grid>
              {list.map((v) => (
                <VideoCard key={v.id} v={v} />
              ))}
            </Grid>
          ) : (
            <p className="py-10 text-center text-sub">This channel has no videos yet.</p>
          )
        ) : pls === null ? (
          <p className="text-sub">Loading…</p>
        ) : pls.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pls.map((pl) => (
              <button key={pl.id} onClick={() => videosGo({ view: "playlist", id: pl.id })} className="rounded-2xl border border-line/50 bg-side/40 p-4 text-left hover:bg-hover">
                <div className="flex items-center gap-3">
                  <span className="grid size-12 place-items-center rounded-xl bg-accent/15 text-accent">
                    <ListVideo className="size-6" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{pl.title}</span>
                    <span className="block text-xs text-sub capitalize">{pl.visibility}</span>
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="py-10 text-center text-sub">No public playlists on this channel.</p>
        )}
      </div>
    </div>
  );
}
