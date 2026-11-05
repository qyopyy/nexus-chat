"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Bookmark, Clapperboard, Compass, Heart, House, Megaphone, Play, SquarePlus, UserRound } from "lucide-react";
import { useApp } from "@/store/app";
import { cn } from "@/lib/utils";
import { feed, fmt, getPost, gramBack, gramGo, gramHome, mediaUrl, savedFeed, scheduleStoryRepair, useGram, type Post } from "@/lib/gram";
import { openPulse } from "@/lib/pulse";
import Avatar from "@/components/ui/Avatar";
import PostCard from "./PostCard";
import Shorts from "./Shorts";
import Profile from "./Profile";
import Create from "./Create";
import { StoryTray, StoryViewer } from "./Stories";

export default function NexusGram({ mobile }: { mobile?: boolean }) {
  const stack = useGram((s) => s.stack);
  const meId = useApp((s) => s.userId);
  const me = useApp((s) => (meId ? s.profiles[meId] : undefined));
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
    { id: "home", label: "Home", icon: <House className="size-5" />, on: r.view === "home", go: () => gramHome() },
    { id: "shorts", label: "Shorts", icon: <Clapperboard className="size-5" />, on: r.view === "shorts", go: () => gramHome({ view: "shorts" }) },
    { id: "explore", label: "Explore", icon: <Compass className="size-5" />, on: r.view === "explore", go: () => gramHome({ view: "explore" }) },
    { id: "saved", label: "Saved", icon: <Bookmark className="size-5" />, on: r.view === "saved", go: () => gramHome({ view: "saved" }) },
    {
      id: "me",
      label: "Profile",
      icon: meId ? <Avatar userId={meId} size={22} plain /> : <UserRound className="size-5" />,
      on: r.view === "profile" && r.username === me?.username,
      go: () => me && gramHome({ view: "profile", username: me.username }),
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0b0b0f] text-[#f5f5f7]">
      <header className={cn("z-20 flex shrink-0 items-center gap-2 border-b border-white/8 bg-[#0b0b0f]/92 px-3 backdrop-blur-xl", mobile ? "pt-safe h-auto min-h-14 py-2" : "h-14")}>
        {stack.length > 1 ? (
          <button onClick={gramBack} className="grid size-9 place-items-center rounded-full hover:bg-white/5" aria-label="Back">
            <ArrowLeft className="size-5" />
          </button>
        ) : null}
        <button onClick={() => gramHome()} className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-white text-sm font-black text-black">N</span>
          <span className="text-[17px] font-semibold tracking-tight">NexusGram</span>
        </button>
        <nav className={cn("ml-auto flex items-center gap-0.5", mobile && "gap-0")}>
          {nav.map((n) => (
            <button key={n.id} onClick={n.go} className={cn("flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium", n.on ? "bg-white/10 text-white" : "text-white/45 hover:bg-white/5 hover:text-white")} aria-label={n.label} title={n.label}>
              {n.icon}
              {!mobile && <span className="hidden lg:inline">{n.label}</span>}
            </button>
          ))}
          <button onClick={() => openPulse()} className="ml-0.5 grid size-9 place-items-center rounded-lg text-white/45 hover:bg-white/5 hover:text-white" aria-label="Pulse" title="Pulse">
            <Megaphone className="size-5" />
          </button>
          <button onClick={() => useGram.setState({ create: r.view === "shorts" ? "short" : "post" })} className="ml-1 grid size-9 place-items-center rounded-lg bg-white text-black" aria-label="Create" title="Create">
            <SquarePlus className="size-5" />
          </button>
        </nav>
      </header>

      {r.view === "shorts" ? (
        <div className="min-h-0 flex-1">
          <Shorts key={r.start ?? "all"} start={r.start} />
        </div>
      ) : (
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full max-w-[640px]">
            {r.view === "home" && <Home />}
            {r.view === "explore" && <Explore />}
            {r.view === "saved" && <Saved />}
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

/** loads more when the sentinel scrolls into view */
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
      <div className="mx-3 mb-3 flex rounded-full bg-hover p-1 text-sm font-bold">
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
            <div key={k} className="h-[420px] animate-pulse rounded-2xl bg-hover" />
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
          {done && <p className="py-6 text-center text-xs text-sub">You&apos;re all caught up ✨</p>}
        </div>
      )}
    </div>
  );
}

function Empty({ following }: { following: boolean }) {
  return (
    <div className="px-6 py-16 text-center">
      <div className="text-5xl">📸</div>
      <p className="mt-3 font-bold">{following ? "Nothing from people you follow yet" : "No posts yet"}</p>
      <p className="mt-1 text-sm text-sub">{following ? "Follow people from Explore or Shorts to fill your feed." : "Be the first to share a photo, a Short or a story."}</p>
      <button onClick={() => useGram.setState({ create: "post" })} className="mt-4 rounded-full bg-white px-5 py-2 font-bold text-black">
        Create a post
      </button>
    </div>
  );
}

function Saved() {
  const [rows, setRows] = useState<Post[] | null>(null);
  useEffect(() => {
    void savedFeed().then(setRows);
  }, []);
  if (rows === null) return <p className="px-6 py-12 text-center text-sm text-white/45">Loading saved…</p>;
  if (!rows.length) {
    return (
      <div className="px-6 py-16 text-center">
        <Bookmark className="mx-auto size-10 text-white/30" />
        <p className="mt-3 font-semibold">No saved posts yet</p>
        <p className="mt-1 text-sm text-white/45">Tap the bookmark on any post to keep it here.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2 pb-10 sm:space-y-4 sm:px-3">
      <div className="px-4 pt-4 pb-1">
        <h2 className="text-lg font-semibold">Saved</h2>
        <p className="text-sm text-white/45">Only you can see these.</p>
      </div>
      {rows.map((p) =>
        p.kind === "short" ? (
          <ShortTeaser key={p.id} p={p} />
        ) : (
          <PostCard key={p.id} post={p} onRemoved={() => setRows((r) => (r ?? []).filter((x) => x.id !== p.id))} />
        ),
      )}
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
      <span className="absolute top-3 left-3 flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-xs font-bold text-white">
        <Clapperboard className="size-3.5" /> Short
      </span>
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid size-16 place-items-center rounded-full bg-black/45 backdrop-blur">
          <Play className="size-8 fill-white text-white" />
        </span>
      </span>
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-12 text-left text-white">
        <span className="block text-sm font-bold">@{author?.username}</span>
        {p.caption && <span className="line-clamp-2 text-sm">{p.caption}</span>}
        <span className="mt-1 flex items-center gap-3 text-xs text-white/80">
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

function Explore() {
  const { rows, done, more } = useFeed("discover", null);
  if (rows === null) return <div className="grid grid-cols-3 gap-0.5">{Array.from({ length: 12 }, (_, k) => <div key={k} className="aspect-square animate-pulse bg-hover" />)}</div>;
  if (!rows.length) return <Empty following={false} />;
  return (
    <div className="pb-10">
      <div className="grid grid-cols-3 gap-0.5">
        {rows.map((p, k) => {
          const m = p.media[0];
          const tall = p.kind === "short" && k % 5 === 2;
          return (
            <button key={p.id} onClick={() => gramGo(p.kind === "short" ? { view: "shorts", start: p.id } : { view: "post", id: p.id })} className={cn("group relative overflow-hidden bg-black", tall ? "row-span-2" : "aspect-square")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(m.type === "video" ? m.poster : m.path)} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
              {p.kind === "short" && <Clapperboard className="absolute top-1.5 right-1.5 size-4 text-white drop-shadow" />}
              {p.kind === "post" && p.media.length > 1 && <span className="absolute top-1.5 right-1.5 rounded bg-black/50 px-1 text-[10px] font-bold text-white">{p.media.length}</span>}
              <span className="absolute inset-0 hidden items-center justify-center gap-1 bg-black/40 text-sm font-bold text-white group-hover:flex">
                <Heart className="size-4 fill-white" /> {fmt(p.like_count)}
              </span>
            </button>
          );
        })}
      </div>
      {!done && <Sentinel onHit={more} />}
    </div>
  );
}

function OnePost({ id }: { id: string }) {
  const [p, setP] = useState<Post | null | undefined>(undefined);
  useEffect(() => void getPost(id).then(setP), [id]);
  if (p === undefined) return <div className="m-3 h-[420px] animate-pulse rounded-2xl bg-hover" />;
  if (p === null) return <p className="py-16 text-center text-sub">This post was deleted.</p>;
  return (
    <div className="py-3 sm:px-3">
      <PostCard post={p} onRemoved={gramBack} />
    </div>
  );
}
