"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Link2, PlaySquare, Unlink } from "lucide-react";
import {
  fetchYouTubeFeed,
  linkYouTubeChannel,
  resolveYouTubeChannel,
  searchYouTubeShorts,
  unlinkYouTubeChannel,
  useYouTube,
  youtubeEmbedUrl,
  youtubeGoogleAuthUrl,
  youtubeShortUrl,
  type YtVideo,
} from "@/lib/youtube";
import { toast } from "@/store/app";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

export default function YouTubeShorts({ mobile }: { mobile?: boolean }) {
  const channel = useYouTube((s) => s.channel);
  const [q, setQ] = useState(channel?.handle || channel?.title || "");
  const [videos, setVideos] = useState<YtVideo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(true);
  const oauth = youtubeGoogleAuthUrl();

  async function connect() {
    setBusy(true);
    try {
      const { channel: ch } = await resolveYouTubeChannel(q.trim() || "@YouTube");
      linkYouTubeChannel(ch);
      haptic.success();
      toast(`Linked ${ch.title}`, "success");
      const feed = await fetchYouTubeFeed(ch.id, true);
      setVideos(feed.videos);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't link channel", "error");
    } finally {
      setBusy(false);
    }
  }

  async function loadLinked() {
    if (!channel) return;
    setBusy(true);
    try {
      const feed = await fetchYouTubeFeed(channel.id, true);
      setVideos(feed.videos);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't load Shorts", "error");
      setVideos([]);
    } finally {
      setBusy(false);
    }
  }

  async function search() {
    if (!q.trim()) return;
    setBusy(true);
    try {
      const out = await searchYouTubeShorts(q.trim());
      setVideos(out.videos);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Search failed", "error");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (channel) void loadLinked();
    else setVideos(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id]);

  return (
    <div className="flex h-full flex-col bg-black text-white">
      <div className={cn("shrink-0 space-y-2 border-b border-white/10 px-3 py-2", mobile && "pt-1")}>
        <div className="flex items-center gap-2 text-xs font-semibold text-white/70">
          <PlaySquare className="size-4 text-[#ff0033]" />
          From YouTube · original embeds
          {channel && <span className="truncate text-white/50">· {channel.title}</span>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="@handle, channel URL, or search"
            className="min-w-0 flex-1 rounded-full bg-white/10 px-3 py-1.5 text-sm outline-none placeholder:text-white/40"
            onKeyDown={(e) => e.key === "Enter" && void (channel ? search() : connect())}
          />
          <button type="button" disabled={busy || !q.trim()} onClick={() => void (channel ? search() : connect())} className="rounded-full bg-[#ff0033] px-3 py-1.5 text-xs font-bold disabled:opacity-40">
            {channel ? "Search" : "Link"}
          </button>
          {channel ? (
            <button
              type="button"
              onClick={() => {
                unlinkYouTubeChannel();
                setVideos(null);
              }}
              className="grid size-8 place-items-center rounded-full bg-white/10"
              title="Unlink"
            >
              <Unlink className="size-3.5" />
            </button>
          ) : (
            <button type="button" onClick={() => void connect()} className="grid size-8 place-items-center rounded-full bg-white/10" title="Link channel">
              <Link2 className="size-3.5" />
            </button>
          )}
        </div>
        {oauth && !channel && (
          <a href={oauth} className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#ff0033] underline-offset-2 hover:underline">
            Sign in with Google / YouTube account
          </a>
        )}
        {!oauth && !channel && <p className="text-[10px] text-white/45">Paste your YouTube @handle or channel link to pull Shorts from the original YouTube feed.</p>}
      </div>

      {videos === null && !busy && (
        <div className="grid flex-1 place-items-center p-6 text-center text-white/70">
          <div>
            <PlaySquare className="mx-auto size-12 text-[#ff0033]" />
            <p className="mt-3 font-semibold text-white">Watch YouTube Shorts here</p>
            <p className="mt-1 max-w-xs text-sm text-white/50">Link a channel to fetch videos from youtube.com and play them with the official player.</p>
          </div>
        </div>
      )}
      {busy && videos === null && <div className="grid flex-1 place-items-center text-white/60">Loading from YouTube…</div>}
      {videos && !videos.length && (
        <div className="grid flex-1 place-items-center text-white/60">No videos found</div>
      )}
      {videos && videos.length > 0 && (
        <div className="h-full snap-y snap-mandatory overflow-y-scroll overscroll-contain [scrollbar-width:none]">
          {videos.map((v) => (
            <YtSlide key={v.id} v={v} muted={muted} setMuted={setMuted} mobile={mobile} />
          ))}
        </div>
      )}
    </div>
  );
}

function YtSlide({ v, muted, setMuted, mobile }: { v: YtVideo; muted: boolean; setMuted: (m: boolean) => void; mobile?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => setOn(e.isIntersecting && e.intersectionRatio > 0.55),
      { threshold: [0, 0.55, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="relative flex h-full w-full snap-start snap-always items-center justify-center overflow-hidden bg-black">
      {on ? (
        <iframe
          key={`${v.id}-${muted ? "m" : "u"}`}
          title={v.title}
          src={youtubeEmbedUrl(v.id, { autoplay: true, mute: muted })}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="h-full w-full max-w-[480px] border-0"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={v.thumb || undefined} alt="" className="h-full w-full max-w-[480px] object-contain opacity-80" />
      )}
      <div className={cn("pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 pt-16 pb-safe-4 text-white sm:mx-auto sm:max-w-[480px]", mobile && "pb-24")}>
        <div className="pointer-events-auto flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{v.channelTitle}</div>
            <div className="line-clamp-2 text-sm text-white/85">{v.title}</div>
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <button type="button" onClick={() => setMuted(!muted)} className="rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold">
              {muted ? "Unmute" : "Mute"}
            </button>
            <a href={youtubeShortUrl(v.id)} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1 rounded-full bg-[#ff0033] px-3 py-1.5 text-[11px] font-bold">
              <ExternalLink className="size-3" /> YouTube
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
