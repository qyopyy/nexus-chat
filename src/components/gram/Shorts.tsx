"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Heart, MessageCircle, Plus, Share2, Volume2, VolumeX } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { myRank } from "@/lib/admin";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { countView, feed, fmt, getPost, gramGo, mediaUrl, publicContentUrl, setFollow, setLike, useGram, type Post } from "@/lib/gram";
import Avatar from "@/components/ui/Avatar";
import { CommentsSheet } from "./PostCard";

/** vertical, full-height, swipe-up Shorts feed (autoplay the one on screen) */
export default function Shorts({ start, mobile }: { start?: string; mobile?: boolean }) {
  const [rows, setRows] = useState<Post[] | null>(null);
  const [muted, setMuted] = useState(true);
  const [done, setDone] = useState(false);
  const loading = useRef(false);

  const more = useCallback(async (reset = false) => {
    if (loading.current) return;
    loading.current = true;
    const before = reset ? null : rows?.[rows.length - 1]?.created_at ?? null;
    const next = await feed("discover", "short", reset ? null : before);
    if (reset && start) {
      const first = await getPost(start);
      if (first) next.unshift(first);
    }
    setRows((r) => {
      const all = reset ? next : [...(r ?? []), ...next];
      const seen = new Set<string>();
      return all.filter((p) => !seen.has(p.id) && seen.add(p.id));
    });
    if (next.length < 10) setDone(true);
    loading.current = false;
  }, [rows, start]);
  useEffect(() => void more(true), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (rows === null) return <div className="grid h-full place-items-center bg-black text-white/70">Loading Shorts…</div>;
  if (!rows.length)
    return (
      <div className="grid h-full place-items-center bg-black p-6 text-center text-white">
        <div>
          <div className="text-5xl">🎬</div>
          <p className="mt-2 font-semibold">No Shorts yet</p>
          <button onClick={() => useGram.setState({ create: "short" })} className="mt-3 rounded-full bg-white px-5 py-2 font-bold text-black">
            Post the first one
          </button>
        </div>
      </div>
    );
  return (
    <div
      className="h-full snap-y snap-mandatory overflow-y-scroll overscroll-contain bg-black [scrollbar-width:none]"
      onScroll={(e) => {
        const el = e.currentTarget;
        if (!done && el.scrollTop + el.clientHeight * 3 > el.scrollHeight) void more();
      }}
    >
      {rows.map((p) => (
        <Short key={p.id} p={p} muted={muted} setMuted={setMuted} mobile={mobile} />
      ))}
    </div>
  );
}

function Short({ p, muted, setMuted, mobile }: { p: Post; muted: boolean; setMuted: (m: boolean) => void; mobile?: boolean }) {
  const meId = useApp((s) => s.userId);
  const author = useApp((s) => s.profiles[p.author_id]);
  const ref = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const [liked, setLiked] = useState(!!p.liked);
  const [likes, setLikes] = useState(p.like_count);
  const [following, setFollowing] = useState(!!p.following);
  const [paused, setPaused] = useState(false);
  const [comments, setComments] = useState(false);
  const [burst, setBurst] = useState(0);
  const [progress, setProgress] = useState(0);
  const counted = useRef(false);
  const lastTap = useRef(0);
  const m = p.media[0];

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        const v = vid.current;
        if (e.isIntersecting && e.intersectionRatio > 0.6) {
          if (v) {
            v.currentTime = 0;
            void v.play().catch(() => {});
            setPaused(false);
          }
          if (!counted.current) {
            counted.current = true;
            countView(p.id);
          }
        } else v?.pause();
      },
      { threshold: [0, 0.6, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [p.id]);

  const like = (on = !liked) => {
    if (on === liked) return;
    haptic.light();
    setLiked(on);
    setLikes((n) => n + (on ? 1 : -1));
    void setLike(p.id, on);
  };

  return (
    <div ref={ref} className="relative flex h-full w-full snap-start snap-always items-center justify-center overflow-hidden bg-black">
      {m.type === "video" ? (
        <video
          ref={vid}
          src={mediaUrl(m.path)}
          poster={mediaUrl(m.poster)}
          muted={muted}
          loop
          playsInline
          preload="metadata"
          onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime / Math.max(0.1, e.currentTarget.duration))}
          className="h-full w-full object-contain sm:max-w-[480px]"
          onClick={() => {
            const now = Date.now();
            if (now - lastTap.current < 280) {
              like(true);
              setBurst(now);
              return;
            }
            lastTap.current = now;
            setTimeout(() => {
              if (Date.now() - lastTap.current < 280) return;
              const v = vid.current;
              if (!v) return;
              if (v.paused) {
                void v.play();
                setPaused(false);
              } else {
                v.pause();
                setPaused(true);
              }
            }, 290);
          }}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrl(m.path)} alt="" className="h-full w-full object-contain sm:max-w-[480px]" onDoubleClick={() => (like(true), setBurst(Date.now()))} />
      )}
      {paused && <div className="pointer-events-none absolute grid size-20 place-items-center rounded-full bg-black/40 text-4xl text-white">▶</div>}
      {burst > 0 && (
        <div key={burst} className="pointer-events-none absolute inset-0 grid place-items-center">
          <Heart className="size-28 animate-[gramheart_.8s_ease-out_forwards] fill-[#ff3040] text-[#ff3040]" />
        </div>
      )}

      {/* bottom info */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-3 pt-20 pb-safe-4 text-white sm:mx-auto sm:max-w-[480px] sm:px-4 sm:pb-5">
        <div className="pointer-events-auto flex max-w-[calc(100%-4.5rem)] items-center gap-2">
          <button onClick={() => author && gramGo({ view: "profile", username: author.username })} className="flex min-w-0 items-center gap-2">
            <Avatar userId={p.author_id} size={36} plain className="shrink-0 rounded-full ring-2 ring-white" />
            <span className="truncate font-bold">@{author?.username}</span>
          </button>
          {p.author_id !== meId && !following && (
            <button
              onClick={async () => {
                if (await setFollow(p.author_id, true)) setFollowing(true);
              }}
              className="shrink-0 rounded-lg border border-white/80 px-3 py-1.5 text-sm font-bold"
            >
              Follow
            </button>
          )}
        </div>
        {p.caption && <p className="mt-2 line-clamp-3 max-w-[calc(100%-4.5rem)] text-sm">{p.caption}</p>}
      </div>
      {m.type === "video" && (
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/20 sm:mx-auto sm:max-w-[480px]">
          <div className="h-full bg-white" style={{ width: `${progress * 100}%` }} />
        </div>
      )}

      {/* right rail */}
      <div className={cn("absolute right-2 bottom-28 flex flex-col items-center gap-3.5 text-white sm:right-[calc(50%-290px)] sm:bottom-24 sm:gap-5", mobile && "bottom-24")}>
        <ActionBtn label={fmt(likes)} onClick={() => like()}>
          <Heart className={cn("size-7 drop-shadow sm:size-8", liked && "fill-[#ff3040] text-[#ff3040]")} />
        </ActionBtn>
        <ActionBtn label={fmt(p.comment_count)} onClick={() => setComments(true)}>
          <MessageCircle className="size-7 -scale-x-100 drop-shadow sm:size-8" />
        </ActionBtn>
        <ActionBtn
          label="Share"
          onClick={() => {
            if (!author) return;
            void navigator.clipboard.writeText(publicContentUrl(p.id));
            toast("Share link copied", "success");
          }}
        >
          <Share2 className="size-6 drop-shadow sm:size-7" />
        </ActionBtn>
        {m.type === "video" && myRank() >= 1 && (
          <a
            href={mediaUrl(m.path)}
            download={`short-${p.id.slice(0, 8)}.mp4`}
            className="tap-target flex flex-col items-center justify-center gap-0.5 active:scale-90"
            title="Download (VIP+)"
          >
            <Download className="size-6 drop-shadow sm:size-7" />
            <span className="max-w-[3.5rem] truncate text-[11px] font-semibold drop-shadow sm:text-xs">Save</span>
          </a>
        )}
        {m.type === "video" && (
          <ActionBtn label={muted ? "Sound" : "Mute"} onClick={() => setMuted(!muted)}>
            {muted ? <VolumeX className="size-6 drop-shadow sm:size-7" /> : <Volume2 className="size-6 drop-shadow sm:size-7" />}
          </ActionBtn>
        )}
        <ActionBtn label="Create" onClick={() => useGram.setState({ create: "short", remixOf: null })}>
          <Plus className="size-6 rounded-lg bg-white/20 p-0.5 sm:size-7" />
        </ActionBtn>
      </div>
      {comments && <CommentsSheet post={p} onClose={() => setComments(false)} />}
    </div>
  );
}

function ActionBtn({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="tap-target flex flex-col items-center justify-center gap-0.5 active:scale-90">
      {children}
      <span className="max-w-[3.5rem] truncate text-[11px] font-semibold drop-shadow sm:text-xs">{label}</span>
    </button>
  );
}
