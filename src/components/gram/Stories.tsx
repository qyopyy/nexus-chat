"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, Heart, Link2, MessageCircle, Plus, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { ago, gramGo, likeStory, mediaUrl, myStoryState, publicContentUrl, removeStory, storiesOf, storyTray, storyViewers, useGram, viewStory, type Story, type TrayItem } from "@/lib/gram";
import { openConversation, sendMessage } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import Avatar from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";

/** gradient ring: colourful when there's something unseen */
export function Ring({ userId, size, unseen, onClick, add }: { userId: string; size: number; unseen: boolean; onClick?: () => void; add?: boolean }) {
  return (
    <button onClick={onClick} className="relative shrink-0 rounded-full p-[3px] active:scale-95" style={{ background: unseen ? "conic-gradient(from 200deg, #feda75, #fa7e1e, #d62976, #962fbf, #4f5bd5, #feda75)" : "rgba(255,255,255,.25)" }}>
      <span className="block rounded-full bg-chat p-[2px]">
        <Avatar userId={userId} size={size} plain />
      </span>
      {add && (
        <span className="absolute right-0 bottom-0 grid size-6 place-items-center rounded-full bg-accent text-white ring-2 ring-chat">
          <Plus className="size-4" />
        </span>
      )}
    </button>
  );
}

export function StoryTray() {
  const meId = useApp((s) => s.userId)!;
  const [tray, setTray] = useState<TrayItem[]>([]);
  const open = useGram((s) => s.story);
  const create = useGram((s) => s.create);
  const trayEpoch = useGram((s) => s.trayEpoch);
  useEffect(() => {
    if (!open && create !== "story") void storyTray().then(setTray);
  }, [open, create, trayEpoch]);
  const mine = tray.find((t) => t.author_id === meId);
  const others = tray.filter((t) => t.author_id !== meId);
  const authors = [...(mine ? [meId] : []), ...others.map((t) => t.author_id)];
  return (
    <div className="flex gap-3 overflow-x-auto px-3 py-3 [scrollbar-width:none]">
      <div className="flex w-[74px] shrink-0 flex-col items-center gap-1">
        <Ring userId={meId} size={62} unseen={!!mine?.unseen} add={!mine} onClick={() => (mine ? useGram.setState({ story: { authors, index: 0 } }) : useGram.setState({ create: "story", remixOf: null }))} />
        <span className="w-full truncate text-center text-xs">{mine ? "Your story" : "Add story"}</span>
      </div>
      {others.map((t) => (
        <TrayItemView key={t.author_id} t={t} onOpen={() => useGram.setState({ story: { authors, index: authors.indexOf(t.author_id) } })} />
      ))}
      {!others.length && <div className="self-center text-xs text-sub">Follow people to see their stories here.</div>}
    </div>
  );
}
function TrayItemView({ t, onOpen }: { t: TrayItem; onOpen: () => void }) {
  const p = useApp((s) => s.profiles[t.author_id]);
  return (
    <div className="flex w-[74px] shrink-0 flex-col items-center gap-1">
      <Ring userId={t.author_id} size={62} unseen={t.unseen > 0} onClick={onOpen} />
      <span className={cn("w-full truncate text-center text-xs", t.unseen ? "" : "text-sub")}>{p?.username ?? "…"}</span>
    </div>
  );
}

/** full-screen viewer: progress bars, tap to skip, hold to pause, like, viewers on your own */
export function StoryViewer() {
  const st = useGram((s) => s.story);
  const meId = useApp((s) => s.userId);
  const [stories, setStories] = useState<Story[] | null>(null);
  const [i, setI] = useState(0);
  const [t, setT] = useState(0);
  const [hold, setHold] = useState(false);
  const [muted, setMuted] = useState(true);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [viewers, setViewers] = useState<string[] | null>(null);
  const [vidState, setVidState] = useState<"loading" | "playing" | "error">("loading");
  const [reply, setReply] = useState(false);
  const [replyText, setReplyText] = useState("");
  const vid = useRef<HTMLVideoElement>(null);
  const author = st ? st.authors[st.index] : null;

  const close = useCallback(() => useGram.setState({ story: null }), []);
  const nextAuthor = useCallback(() => {
    if (!st) return;
    if (st.index + 1 < st.authors.length) useGram.setState({ story: { ...st, index: st.index + 1 } });
    else close();
  }, [st, close]);
  const prevAuthor = () => st && st.index > 0 && useGram.setState({ story: { ...st, index: st.index - 1 } });

  useEffect(() => {
    if (!author) return;
    setStories(null);
    setViewers(null);
    void storiesOf(author).then(async (list) => {
      const state = await myStoryState(list.map((s) => s.id));
      setLiked(state.liked);
      const firstUnseen = list.findIndex((s) => !state.seen.has(s.id));
      setI(firstUnseen >= 0 && author !== meId ? firstUnseen : 0);
      setT(0);
      setStories(list);
      if (!list.length) nextAuthor();
    });
  }, [author]); // eslint-disable-line react-hooks/exhaustive-deps

  const s = stories?.[i];
  useEffect(() => {
    if (s) viewStory(s.id);
    setT(0);
    setViewers(null);
    setVidState(s?.media.type === "video" ? "loading" : "playing");
    setReply(false);
    setReplyText("");
  }, [s?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // photos: 6s; videos: follow playback. Don't auto-advance while a video is still loading or errored.
  useEffect(() => {
    if (!s || hold || viewers || reply) return;
    if (s.media.type === "video" && vidState === "error") return;
    if (s.media.type === "video" && vidState === "loading") return;
    const fallback = s.media.type === "video" ? Math.max(6, Math.min(30, s.media.dur && s.media.dur > 0 ? s.media.dur : 15)) : 6;
    if (s.media.type === "video") {
      const id = setInterval(() => {
        const v = vid.current;
        if (v && !v.paused && Number.isFinite(v.duration) && v.duration > 0 && v.currentTime > 0.05) return;
        setT((x) => x + 0.05 / fallback);
      }, 50);
      return () => clearInterval(id);
    }
    const id = setInterval(() => setT((x) => x + 0.05 / fallback), 50);
    return () => clearInterval(id);
  }, [s, hold, viewers, vidState, reply]);
  useEffect(() => {
    if (t >= 1 && stories) {
      if (i + 1 < stories.length) setI(i + 1);
      else nextAuthor();
    }
  }, [t]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const v = vid.current;
    if (!v || !s || s.media.type !== "video") return;
    v.muted = muted;
    if (hold || viewers) {
      v.pause();
      return;
    }
    const tryPlay = () => {
      void v.play().then(() => setVidState("playing")).catch(() => {
        // muted autoplay usually works; keep loading until we get frames or an error
      });
    };
    tryPlay();
    const onPlaying = () => setVidState("playing");
    const onWaiting = () => setVidState((st) => (st === "error" ? st : "loading"));
    const onCanPlay = () => tryPlay();
    v.addEventListener("playing", onPlaying);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("canplay", onCanPlay);
    return () => {
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("canplay", onCanPlay);
    };
  }, [hold, viewers, muted, s?.id, s?.media.type]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  const go = (d: number) => {
    if (!stories) return;
    const n = i + d;
    if (n < 0) prevAuthor();
    else if (n >= stories.length) nextAuthor();
    else setI(n);
  };

  if (!st || !author) return null;
  const p = useApp.getState().profiles[author];
  const mine = author === meId;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black">
      <div className="relative h-full w-full max-w-[480px] overflow-hidden bg-black sm:h-[92vh] sm:rounded-2xl">
        {s &&
          (s.media.type === "video" ? (
            <>
              <video
                key={s.id}
                src={mediaUrl(s.media.path)}
                poster={mediaUrl(s.media.poster)}
                autoPlay
                muted={muted}
                playsInline
                preload="auto"
                ref={(el) => {
                  vid.current = el;
                  if (el) {
                    el.setAttribute("playsinline", "");
                    el.setAttribute("webkit-playsinline", "");
                  }
                }}
                onLoadedData={(e) => {
                  setVidState("playing");
                  void e.currentTarget.play().catch(() => {});
                }}
                onPlaying={() => setVidState("playing")}
                onTimeUpdate={(e) => {
                  const d = e.currentTarget.duration;
                  if (Number.isFinite(d) && d > 0) setT(e.currentTarget.currentTime / d);
                }}
                onEnded={() => setT(1)}
                onError={() => setVidState("error")}
                className="absolute inset-0 h-full w-full object-contain"
              />
              {vidState === "loading" && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <div className="size-10 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                </div>
              )}
              {vidState === "error" && (
                <div className="absolute inset-0 z-20 grid place-items-center bg-black/55 px-8 text-center text-white">
                  <div>
                    <p className="text-base font-semibold">This video couldn&apos;t play</p>
                    <p className="mt-1 text-sm text-white/70">It may use an unsupported format. Re-upload to compress it.</p>
                    <div className="mt-4 flex justify-center gap-2">
                      <button
                        onClick={() => {
                          setVidState("loading");
                          const v = vid.current;
                          if (!v) return;
                          v.load();
                          void v.play().then(() => setVidState("playing")).catch(() => setVidState("error"));
                        }}
                        className="rounded-full bg-white/20 px-4 py-2 text-sm font-semibold"
                      >
                        Retry
                      </button>
                      <button onClick={() => go(1)} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black">
                        Skip
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={s.id} src={mediaUrl(s.media.path)} alt="" className="absolute inset-0 h-full w-full object-contain" />
          ))}

        {/* tap zones */}
        {vidState !== "error" && (
          <div className="absolute inset-0 flex" onPointerDown={() => setHold(true)} onPointerUp={() => setHold(false)} onPointerLeave={() => setHold(false)}>
            <button className="h-full w-1/3" onClick={() => go(-1)} aria-label="Previous" />
            <div className="h-full w-1/3" />
            <button className="h-full w-1/3" onClick={() => go(1)} aria-label="Next" />
          </div>
        )}

        {/* top bar */}
        <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent px-2.5 pt-safe-3 pb-10 sm:px-3">
          <div className="flex gap-1">
            {(stories ?? []).map((x, k) => (
              <div key={x.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/35">
                <div className="h-full bg-white" style={{ width: `${k < i ? 100 : k === i ? Math.min(100, t * 100) : 0}%` }} />
              </div>
            ))}
          </div>
          <div className="pointer-events-auto mt-2.5 flex items-center gap-1.5 text-white sm:mt-3 sm:gap-2">
            <button
              onClick={() => {
                close();
                if (p) gramGo({ view: "profile", username: p.username });
              }}
              className="flex min-w-0 items-center gap-2"
            >
              <Avatar userId={author} size={34} plain className="shrink-0" />
              <span className="truncate text-sm font-bold">{p?.username}</span>
            </button>
            {s && <span className="hidden shrink-0 text-xs text-white/70 min-[380px]:inline">{ago(s.created_at)} · {s.duration_h}h</span>}
            {s?.media.type === "video" && (
              <button
                onClick={() => setMuted((m) => !m)}
                className="tap-target ml-auto grid place-items-center rounded-full hover:bg-white/10"
                aria-label={muted ? "Unmute" : "Mute"}
              >
                {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
              </button>
            )}
            <button onClick={close} className={cn("tap-target grid place-items-center rounded-full hover:bg-white/10", s?.media.type !== "video" && "ml-auto")} aria-label="Close">
              <X className="size-6" />
            </button>
          </div>
        </div>

        {s?.caption && <div className="pointer-events-none absolute inset-x-0 bottom-28 px-4 text-center text-base font-semibold text-white drop-shadow-[0_2px_6px_rgba(0,0,0,.8)] sm:bottom-24 sm:px-6 sm:text-lg">{s.caption}</div>}

        {/* bottom actions */}
        {s && (
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 pt-10 pb-safe-4 text-white sm:gap-3 sm:px-4">
            {mine ? (
              <>
                <button
                  onClick={async () => setViewers(await storyViewers(s.id))}
                  className="flex min-h-11 items-center gap-1.5 rounded-full bg-white/15 px-3 py-2 text-sm font-semibold"
                >
                  <Eye className="size-4" /> {s.view_count} · <Heart className="size-4" /> {s.like_count}
                </button>
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(publicContentUrl(s.id));
                    toast("Story link copied (/n/…)", "success");
                  }}
                  className="tap-target grid place-items-center rounded-full bg-white/15"
                  aria-label="Copy share link"
                >
                  <Link2 className="size-5" />
                </button>
                <button
                  onClick={async () => {
                    if (!confirm("Delete this story?")) return;
                    if (await removeStory(s.id)) {
                      const rest = (stories ?? []).filter((x) => x.id !== s.id);
                      if (!rest.length) close();
                      else {
                        setStories(rest);
                        setI(Math.min(i, rest.length - 1));
                      }
                    }
                  }}
                  className="tap-target ml-auto grid place-items-center rounded-full bg-white/15"
                  aria-label="Delete story"
                >
                  <Trash2 className="size-5" />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setReply(true)}
                  className="flex min-h-11 flex-1 items-center gap-2 rounded-full bg-white/10 px-3 py-2.5 text-left text-sm text-white/70 sm:px-4"
                >
                  <MessageCircle className="size-4 shrink-0" /> Reply…
                </button>
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(publicContentUrl(s.id));
                    toast("Story link copied", "success");
                  }}
                  className="tap-target grid place-items-center rounded-full active:scale-90"
                  aria-label="Share"
                >
                  <Link2 className="size-5" />
                </button>
                <button
                  onClick={() => {
                    const on = !liked.has(s.id);
                    haptic.light();
                    setLiked((l) => {
                      const n = new Set(l);
                      if (on) n.add(s.id);
                      else n.delete(s.id);
                      return n;
                    });
                    void likeStory(s.id, on);
                  }}
                  className="tap-target grid place-items-center rounded-full active:scale-90"
                  aria-label="Like story"
                >
                  <Heart className={cn("size-7 sm:size-8", liked.has(s.id) && "fill-[#ff3040] text-[#ff3040]")} />
                </button>
              </>
            )}
          </div>
        )}

        {reply && s && author && (
          <div className="absolute inset-x-0 bottom-0 z-30 bg-black/90 px-3 pt-3 pb-safe-4">
            <form
              className="flex items-center gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const text = replyText.trim();
                if (!text) return;
                const { data } = await supabase.rpc("get_or_create_dm", { p_user: author });
                if (!data) return toast("Couldn't open chat", "error");
                openConversation(data as string, null);
                await sendMessage(data as string, `↩️ Story reply: ${text}\n${publicContentUrl(s.id)}`);
                setReply(false);
                setReplyText("");
                toast("Reply sent", "success");
                close();
              }}
            >
              <input
                autoFocus
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Reply to story…"
                className="min-h-11 min-w-0 flex-1 rounded-full bg-white/10 px-4 py-2.5 text-sm outline-none placeholder:text-white/40"
              />
              <button type="button" onClick={() => setReply(false)} className="min-h-11 shrink-0 rounded-full px-3 py-2 text-sm text-white/60">
                Cancel
              </button>
              <button type="submit" disabled={!replyText.trim()} className="min-h-11 shrink-0 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-40">
                Send
              </button>
            </form>
          </div>
        )}

        {viewers && (
          <div className="absolute inset-x-0 bottom-0 max-h-[60%] overflow-y-auto rounded-t-3xl bg-chat p-4 text-txt" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center">
              <span className="flex-1 font-bold">Viewers ({viewers.length})</span>
              <button onClick={() => setViewers(null)} className="grid size-8 place-items-center rounded-full hover:bg-hover" aria-label="Close viewers">
                <X className="size-5" />
              </button>
            </div>
            {viewers.length === 0 ? (
              <p className="text-sm text-sub">No views yet.</p>
            ) : (
              viewers.map((v) => (
                <div key={v} className="flex items-center gap-2.5 py-1.5">
                  <Avatar userId={v} size={34} plain />
                  <NameTag userId={v} badges={false} />
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
