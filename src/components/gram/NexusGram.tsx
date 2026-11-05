"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Bookmark, Clapperboard, Compass, Heart, House, Megaphone, Play, Shield, Sparkles, SquarePlus, UserRound } from "lucide-react";
import { useApp } from "@/store/app";
import { myRank } from "@/lib/admin";
import { cn } from "@/lib/utils";
import {
  feed,
  fmt,
  getGenrePrefs,
  getPost,
  GRAM_GENRES,
  GRAM_MOODS,
  gramBack,
  gramGo,
  gramHome,
  mediaUrl,
  memoryLane,
  myCreatorInsights,
  postsByGenre,
  postsByMood,
  postsByTag,
  savedFeed,
  scheduleStoryRepair,
  toggleGenrePref,
  useGram,
  type GramGenre,
  type GramMood,
  type Post,
} from "@/lib/gram";
import { openPulse } from "@/lib/pulse";
import Avatar from "@/components/ui/Avatar";
import PostCard from "./PostCard";
import Shorts from "./Shorts";
import Profile from "./Profile";
import Create from "./Create";
import GramAdmin from "./GramAdmin";
import { StoryTray, StoryViewer } from "./Stories";

export default function NexusGram({ mobile }: { mobile?: boolean }) {
  const stack = useGram((s) => s.stack);
  const meId = useApp((s) => s.userId);
  const me = useApp((s) => (meId ? s.profiles[meId] : undefined));
  const staff = myRank() >= 2;
  const r = stack[stack.length - 1];
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [stack.length]);
  useEffect(() => {
    const top = () => scroller.current?.scrollTo({ top: 0, behavior: "smooth" });
    window.addEventListener("nexus:scrolltop", top);
    return () => window.removeEventListener("nexus:scrolltop", top);
  }, []);
  // Instantly recompress live stories that were uploaded before the HQ pipeline
  useEffect(() => {
    scheduleStoryRepair();
  }, []);

  const nav: { id: string; label: string; icon: React.ReactNode; on: boolean; go: () => void }[] = [
    { id: "home", label: "Home", icon: <House className="size-[1.15rem]" />, on: r.view === "home", go: () => gramHome() },
    { id: "shorts", label: "Shorts", icon: <Clapperboard className="size-[1.15rem]" />, on: r.view === "shorts", go: () => gramHome({ view: "shorts" }) },
    { id: "explore", label: "Explore", icon: <Compass className="size-[1.15rem]" />, on: r.view === "explore", go: () => gramHome({ view: "explore" }) },
    { id: "saved", label: "Saved", icon: <Bookmark className="size-[1.15rem]" />, on: r.view === "saved", go: () => gramHome({ view: "saved" }) },
    { id: "insights", label: "Stats", icon: <Sparkles className="size-[1.15rem]" />, on: r.view === "insights" || r.view === "memories", go: () => gramHome({ view: "insights" }) },
    {
      id: "me",
      label: "You",
      icon: meId ? <Avatar userId={meId} size={20} plain /> : <UserRound className="size-[1.15rem]" />,
      on: r.view === "profile" && r.username === me?.username,
      go: () => me && gramHome({ view: "profile", username: me.username }),
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0b0b0f] text-[#f5f5f7]">
      <header className={cn("z-20 shrink-0 border-b border-white/8 bg-[#0b0b0f]/95 backdrop-blur-xl", mobile ? "pt-safe" : "")}>
        <div className={cn("flex items-center gap-1.5", mobile ? "min-h-12 px-2.5 py-1.5" : "h-14 px-3")}>
          {stack.length > 1 ? (
            <button onClick={gramBack} className="tap-target grid place-items-center rounded-full hover:bg-white/5" aria-label="Back">
              <ArrowLeft className="size-5" />
            </button>
          ) : null}
          <button onClick={() => gramHome()} className="flex min-w-0 items-center gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-sm font-black text-black">N</span>
            <span className={cn("truncate text-[16px] font-semibold tracking-tight", mobile && "max-[380px]:hidden")}>NexusGram</span>
          </button>
          {!mobile && (
            <nav className="ml-2 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
              {nav.map((n) => (
                <button key={n.id} onClick={n.go} className={cn("flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium", n.on ? "bg-white/10 text-white" : "text-white/45 hover:bg-white/5 hover:text-white")} aria-label={n.label} title={n.label}>
                  {n.icon}
                  <span className="hidden lg:inline">{n.label}</span>
                </button>
              ))}
            </nav>
          )}
          <div className={cn("flex shrink-0 items-center gap-0.5", mobile ? "ml-auto" : "ml-auto")}>
            {staff && (
              <button onClick={() => gramHome({ view: "admin" })} className={cn("tap-target grid place-items-center rounded-lg", r.view === "admin" ? "bg-white/10 text-white" : "text-white/45 hover:bg-white/5")} aria-label="Admin" title="Admin">
                <Shield className="size-5" />
              </button>
            )}
            <button onClick={() => openPulse()} className="tap-target grid place-items-center rounded-lg text-white/45 hover:bg-white/5 hover:text-white" aria-label="Pulse feed" title="Pulse">
              <Megaphone className="size-5" />
            </button>
            <button onClick={() => useGram.setState({ create: r.view === "shorts" ? "short" : "post", remixOf: null })} className="tap-target ml-0.5 grid place-items-center rounded-xl bg-white text-black" aria-label="Create" title="Create">
              <SquarePlus className="size-5" />
            </button>
          </div>
        </div>
        {mobile && (
          <nav className="no-scrollbar flex items-stretch gap-0.5 overflow-x-auto px-1.5 pb-1.5">
            {nav.map((n) => (
              <button
                key={n.id}
                onClick={n.go}
                className={cn(
                  "flex min-h-11 min-w-[3.1rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 text-[10px] font-semibold leading-none tracking-wide",
                  n.on ? "bg-white/10 text-white" : "text-white/45 active:bg-white/5",
                )}
                aria-label={n.label}
                title={n.label}
              >
                {n.icon}
                <span>{n.label}</span>
              </button>
            ))}
          </nav>
        )}
      </header>

      {r.view === "shorts" ? (
        <div className="min-h-0 flex-1">
          <Shorts key={r.start ?? "all"} start={r.start} mobile={mobile} />
        </div>
      ) : (
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full max-w-[640px] pb-6">
            {r.view === "home" && <Home />}
            {r.view === "explore" && <Explore tag={r.tag} mood={r.mood} genre={r.genre} />}
            {r.view === "saved" && <Saved />}
            {r.view === "insights" && <Insights />}
            {r.view === "memories" && <Memories />}
            {r.view === "admin" && <GramAdmin />}
            {r.view === "profile" && <Profile key={r.username} username={r.username} />}
            {r.view === "post" && <OnePost key={r.id} id={r.id} />}
          </div>
        </div>
      )}

      <Create />
      <StoryViewer />
    </div>
  );
}

function useFeed(scope: "following" | "discover", kind: "post" | "short" | null) {
  const [rows, setRows] = useState<Post[] | null>(null);
  const [done, setDone] = useState(false);
  const busy = useRef(false);
  const load = useCallback(
    async (reset: boolean) => {
      if (busy.current) return;
      busy.current = true;
      const before = reset ? null : (rows?.[rows.length - 1]?.created_at ?? null);
      const next = await feed(scope, kind, before);
      setRows((r) => (reset ? next : [...(r ?? []), ...next.filter((n) => !(r ?? []).some((x) => x.id === n.id))]));
      setDone(next.length < 15);
      busy.current = false;
    },
    [rows, scope, kind],
  );
  useEffect(() => {
    setRows(null);
    setDone(false);
    busy.current = false;
    void feed(scope, kind, null).then((next) => {
      setRows(next);
      setDone(next.length < 15);
    });
  }, [scope, kind]);
  return { rows, setRows, done, more: () => void load(false) };
}

function Sentinel({ onHit }: { onHit: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onHit);
  cb.current = onHit;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && cb.current(), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className="h-10" />;
}

function Home() {
  const [scope, setScope] = useState<"discover" | "following">("discover");
  const { rows, setRows, done, more } = useFeed(scope, null);
  return (
    <div className="pb-10">
      <StoryTray />
      <div className="mx-3 mb-3 flex rounded-xl bg-white/5 p-1 text-sm font-semibold">
        {(
          [
            ["discover", "For you"],
            ["following", "Following"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} onClick={() => setScope(k)} className={cn("flex-1 rounded-lg py-1.5", scope === k ? "bg-white text-black" : "text-white/50")}>
            {l}
          </button>
        ))}
      </div>
      {rows === null ? (
        <div className="space-y-4 px-3">
          {[0, 1].map((k) => (
            <div key={k} className="h-[420px] animate-pulse rounded-2xl bg-white/5" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Empty following={scope === "following"} />
      ) : (
        <div className="space-y-2 sm:space-y-4 sm:px-3">
          {rows.map((p) =>
            p.kind === "short" ? (
              <ShortTeaser key={p.id} p={p} />
            ) : (
              <PostCard key={p.id} post={p} onRemoved={() => setRows((r) => (r ?? []).filter((x) => x.id !== p.id))} />
            ),
          )}
          {!done && <Sentinel onHit={more} />}
          {done && <p className="py-6 text-center text-xs text-white/35">You&apos;re all caught up</p>}
        </div>
      )}
    </div>
  );
}

function Saved() {
  const [rows, setRows] = useState<Post[] | null>(null);
  useEffect(() => {
    void savedFeed().then(setRows);
  }, []);
  if (rows === null) return <div className="grid h-48 place-items-center text-sm text-white/40">Loading saved…</div>;
  if (!rows.length)
    return (
      <div className="px-6 py-16 text-center">
        <Bookmark className="mx-auto size-10 text-white/30" />
        <p className="mt-3 font-semibold">No saved posts yet</p>
        <p className="mt-1 text-sm text-white/45">Tap the bookmark on any post to keep it here.</p>
      </div>
    );
  return (
    <div className="space-y-2 pb-10 sm:space-y-4 sm:px-3">
      <div className="px-4 pt-4">
        <h2 className="text-lg font-semibold">Saved</h2>
        <p className="text-sm text-white/45">{rows.length} posts</p>
      </div>
      {rows.map((p) => (
        <PostCard key={p.id} post={p} onRemoved={() => setRows((r) => (r ?? []).filter((x) => x.id !== p.id))} />
      ))}
    </div>
  );
}

function Empty({ following }: { following: boolean }) {
  return (
    <div className="px-6 py-16 text-center">
      <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-white/5 text-xl font-black">N</div>
      <p className="mt-3 font-semibold">{following ? "Nothing from people you follow yet" : "No posts yet"}</p>
      <p className="mt-1 text-sm text-white/45">{following ? "Follow people from Explore or Shorts to fill your feed." : "Share a photo, Short, or story to get started."}</p>
      <button onClick={() => useGram.setState({ create: "post", remixOf: null })} className="mt-4 rounded-full bg-white px-5 py-2 font-semibold text-black">
        Create a post
      </button>
    </div>
  );
}

/** a Short inside the home feed: tap to open the Shorts player */
function ShortTeaser({ p }: { p: Post }) {
  const author = useApp((s) => s.profiles[p.author_id]);
  const m = p.media[0];
  return (
    <button onClick={() => gramGo({ view: "shorts", start: p.id })} className="relative mx-auto block aspect-[9/14] w-full max-w-[380px] overflow-hidden bg-black sm:rounded-2xl">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={mediaUrl(m.type === "video" ? m.poster : m.path)} alt="" loading="lazy" className="h-full w-full object-cover" />
      <span className="absolute top-3 left-3 flex items-center gap-1 rounded-md bg-black/55 px-2.5 py-1 text-xs font-semibold text-white">
        <Clapperboard className="size-3.5" /> Short
      </span>
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid size-14 place-items-center rounded-full bg-black/45 backdrop-blur">
          <Play className="size-7 fill-white text-white" />
        </span>
      </span>
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-12 text-left text-white">
        <span className="block text-sm font-semibold">@{author?.username}</span>
        {p.caption && <span className="line-clamp-2 text-sm text-white/85">{p.caption}</span>}
        <span className="mt-1 flex items-center gap-3 text-xs text-white/70">
          <span className="flex items-center gap-1">
            <Heart className="size-3.5" /> {fmt(p.like_count)}
          </span>
          <span className="flex items-center gap-1">
            <Play className="size-3.5" /> {fmt(p.view_count)}
          </span>
        </span>
      </span>
    </button>
  );
}

function Explore({ tag, mood, genre }: { tag?: string; mood?: GramMood; genre?: GramGenre }) {
  const discover = useFeed("discover", null);
  const [filterRows, setFilterRows] = useState<Post[] | null>(null);
  const [q, setQ] = useState(tag ?? "");
  const [prefs, setPrefs] = useState<GramGenre[]>([]);
  useEffect(() => {
    setQ(tag ?? "");
  }, [tag]);
  useEffect(() => {
    setPrefs(getGenrePrefs());
  }, []);
  useEffect(() => {
    if (!tag && !mood && !genre) {
      setFilterRows(null);
      return;
    }
    setFilterRows(null);
    void (genre ? postsByGenre(genre) : mood ? postsByMood(mood) : postsByTag(tag!)).then(setFilterRows);
  }, [tag, mood, genre]);

  const rows = tag || mood || genre ? filterRows : discover.rows;
  const trending = ["hiphop", "trap", "phonk", "electronic", "pop", "nexus", "shorts", "music", "live"];

  return (
    <div className="pb-10">
      <div className="space-y-3 px-3 pt-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const t = q.replace(/^#/, "").trim().toLowerCase();
            if (t) gramHome({ view: "explore", tag: t });
            else gramHome({ view: "explore" });
          }}
          className="flex gap-2"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search #hashtags"
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
          />
          <button type="submit" className="min-h-11 shrink-0 rounded-xl bg-white px-4 text-sm font-semibold text-black">
            Go
          </button>
        </form>
        <div>
          <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-white/40 uppercase">Music genres</p>
          <div className="flex flex-wrap gap-1.5">
            {GRAM_GENRES.map((g) => (
              <button
                key={g.id}
                onClick={() => gramHome({ view: "explore", genre: g.id })}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setPrefs(toggleGenrePref(g.id));
                }}
                className={cn("rounded-full px-3 py-1 text-xs font-semibold", genre === g.id ? "text-black" : prefs.includes(g.id) ? "ring-1 ring-white/40 bg-white/10 text-white" : "bg-white/5 text-white/60 hover:bg-white/10")}
                style={genre === g.id ? { background: g.hue } : undefined}
                title={`Browse ${g.label} · right-click to pin for For you`}
              >
                {g.label}
              </button>
            ))}
          </div>
          {prefs.length > 0 && <p className="mt-1.5 text-[11px] text-white/35">Pinned for For you: {prefs.map((id) => GRAM_GENRES.find((g) => g.id === id)?.label).filter(Boolean).join(" · ")}</p>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {trending.map((t) => (
            <button key={t} onClick={() => gramHome({ view: "explore", tag: t })} className={cn("rounded-full px-3 py-1 text-xs font-semibold", tag === t ? "bg-white text-black" : "bg-white/5 text-white/60 hover:bg-white/10")}>
              #{t}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {GRAM_MOODS.map((m) => (
            <button
              key={m.id}
              onClick={() => gramHome({ view: "explore", mood: m.id })}
              className={cn("rounded-full px-3 py-1 text-xs font-semibold", mood === m.id ? "text-black" : "bg-white/5 text-white/60 hover:bg-white/10")}
              style={mood === m.id ? { background: m.hue } : undefined}
            >
              {m.label}
            </button>
          ))}
        </div>
        {(tag || mood || genre) && (
          <div className="flex items-center justify-between text-sm">
            <p className="font-semibold">
              {genre
                ? `Genre · ${GRAM_GENRES.find((x) => x.id === genre)?.label}`
                : mood
                  ? `Mood · ${GRAM_MOODS.find((x) => x.id === mood)?.label}`
                  : `#${tag}`}
            </p>
            <button onClick={() => gramHome({ view: "explore" })} className="text-white/45 hover:text-white">
              Clear
            </button>
          </div>
        )}
      </div>
      {rows === null ? (
        <div className="mt-3 grid grid-cols-3 gap-0.5">{Array.from({ length: 12 }, (_, k) => <div key={k} className="aspect-square animate-pulse bg-white/5" />)}</div>
      ) : !rows.length ? (
        <Empty following={false} />
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-0.5">
            {rows.map((p, k) => {
              const m = p.media[0];
              const tall = p.kind === "short" && k % 5 === 2;
              return (
                <button key={p.id} onClick={() => gramGo(p.kind === "short" ? { view: "shorts", start: p.id } : { view: "post", id: p.id })} className={cn("group relative overflow-hidden bg-black", tall ? "row-span-2" : "aspect-square")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mediaUrl(m.type === "video" ? m.poster : m.path)} alt={m.alt || p.caption || ""} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                  {p.kind === "short" && <Clapperboard className="absolute top-1.5 right-1.5 size-4 text-white drop-shadow" />}
                  {p.kind === "post" && p.media.length > 1 && <span className="absolute top-1.5 right-1.5 rounded bg-black/50 px-1 text-[10px] font-bold text-white">{p.media.length}</span>}
                  <span className="absolute inset-0 hidden items-center justify-center gap-1 bg-black/40 text-sm font-bold text-white group-hover:flex">
                    <Heart className="size-4 fill-white" /> {fmt(p.like_count)}
                  </span>
                </button>
              );
            })}
          </div>
          {!tag && !mood && !genre && !discover.done && <Sentinel onHit={discover.more} />}
        </>
      )}
    </div>
  );
}

function Insights() {
  const [data, setData] = useState<Awaited<ReturnType<typeof myCreatorInsights>> | null>(null);
  useEffect(() => {
    void myCreatorInsights().then(setData);
  }, []);
  if (!data) return <div className="grid h-48 place-items-center text-sm text-white/40">Loading your pulse…</div>;
  const { totals, top, posts, saves } = data;
  return (
    <div className="space-y-5 px-4 py-5 pb-12">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Creator Pulse</h2>
          <p className="text-sm text-white/45">How your posts are landing</p>
        </div>
        <button onClick={() => gramHome({ view: "memories" })} className="rounded-full bg-white/8 px-3 py-1.5 text-xs font-semibold hover:bg-white/12">
          On this day
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Views", totals.views],
          ["Likes", totals.likes],
          ["Comments", totals.comments],
          ["Saves", saves],
        ].map(([l, n]) => (
          <div key={l as string} className="rounded-2xl bg-white/5 px-3 py-3">
            <div className="text-xl font-semibold tabular-nums">{fmt(n as number)}</div>
            <div className="text-xs text-white/45">{l as string}</div>
          </div>
        ))}
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-white/70">Top posts</h3>
        {!top.length ? (
          <p className="text-sm text-white/40">Share something to see insights here.</p>
        ) : (
          <div className="space-y-2">
            {top.map((p) => {
              const m = p.media[0];
              return (
                <button key={p.id} onClick={() => gramGo({ view: "post", id: p.id })} className="flex w-full items-center gap-3 rounded-xl bg-white/5 p-2 text-left hover:bg-white/8">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mediaUrl(m?.type === "video" ? m.poster : m?.path)} alt="" className="size-14 rounded-lg object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 text-sm font-medium">{p.caption || (p.kind === "short" ? "Short" : "Post")}</span>
                    <span className="mt-0.5 block text-xs text-white/45">
                      {fmt(p.like_count)} likes · {fmt(p.view_count)} views
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <p className="text-center text-xs text-white/35">{posts.length} recent posts analyzed</p>
    </div>
  );
}

function Memories() {
  const [rows, setRows] = useState<Post[] | null>(null);
  useEffect(() => {
    void memoryLane().then(setRows);
  }, []);
  if (rows === null) return <div className="grid h-48 place-items-center text-sm text-white/40">Looking back…</div>;
  return (
    <div className="pb-12">
      <div className="px-4 pt-5">
        <button onClick={() => gramHome({ view: "insights" })} className="mb-2 text-xs font-semibold text-white/45 hover:text-white">
          ← Creator Pulse
        </button>
        <h2 className="text-lg font-semibold">On this day</h2>
        <p className="text-sm text-white/45">Posts you shared on this calendar day in past years</p>
      </div>
      {!rows.length ? (
        <p className="px-6 py-16 text-center text-sm text-white/40">No memories for today yet — check back next year.</p>
      ) : (
        <div className="mt-4 space-y-2 sm:space-y-4 sm:px-3">
          {rows.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function OnePost({ id }: { id: string }) {
  const [p, setP] = useState<Post | null | undefined>(undefined);
  useEffect(() => void getPost(id).then(setP), [id]);
  if (p === undefined) return <div className="m-3 h-[420px] animate-pulse rounded-2xl bg-white/5" />;
  if (p === null) return <p className="py-16 text-center text-white/45">This post was deleted.</p>;
  return (
    <div className="py-3 sm:px-3">
      <PostCard post={p} onRemoved={gramBack} />
    </div>
  );
}
