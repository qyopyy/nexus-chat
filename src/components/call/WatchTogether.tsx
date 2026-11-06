"use client";

import { useEffect, useRef, useState } from "react";
import { Clapperboard, Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX, X } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { startWatch, stopWatch, useCall, watchControl, watchPos } from "@/lib/call";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";

// ─────────────────────────── players ───────────────────────────
// Both players sit behind one small interface so the sync loop doesn't care where the video comes from.
type Player = {
  time(): number;
  duration(): number;
  playing(): boolean;
  play(): Promise<boolean>;
  pause(): void;
  seek(s: number): void;
  volume(v: number): void;
  title(): string | null;
  destroy(): void;
};

type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(s: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  setVolume(v: number): void;
  unMute(): void;
  destroy(): void;
  getVideoData?: () => { title?: string };
};
type YTNs = { Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer };
type YTWindow = Window & { YT?: YTNs; onYouTubeIframeAPIReady?: () => void };

let ytLoading: Promise<YTNs> | null = null;
function loadYT(): Promise<YTNs> {
  const w = window as YTWindow;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (ytLoading) return ytLoading;
  ytLoading = new Promise<YTNs>((resolve, reject) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (w.YT) resolve(w.YT);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => {
      ytLoading = null;
      reject(new Error("Couldn't load YouTube"));
    };
    document.head.appendChild(s);
  });
  return ytLoading;
}

function youtubePlayer(host: HTMLElement, id: string, onReady: () => void): Player {
  const el = document.createElement("div");
  el.className = "size-full";
  host.appendChild(el);
  let yt: YTPlayer | null = null;
  let dead = false;
  void loadYT().then((YT) => {
    if (dead) return;
    yt = new YT.Player(el, {
      videoId: id,
      width: "100%",
      height: "100%",
      playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0, modestbranding: 1, iv_load_policy: 3, fs: 0, origin: location.origin },
      events: { onReady: () => !dead && onReady() },
    });
  });
  const state = () => (yt ? yt.getPlayerState() : -1);
  return {
    time: () => yt?.getCurrentTime?.() ?? 0,
    duration: () => yt?.getDuration?.() ?? 0,
    playing: () => state() === 1 || state() === 3,
    play: async () => {
      if (!yt) return false;
      yt.unMute();
      yt.playVideo();
      await new Promise((r) => setTimeout(r, 1200));
      return state() === 1 || state() === 3;
    },
    pause: () => yt?.pauseVideo(),
    seek: (s) => yt?.seekTo(s, true),
    volume: (v) => yt?.setVolume(Math.round(v * 100)),
    title: () => yt?.getVideoData?.()?.title || null,
    destroy: () => {
      dead = true;
      try {
        yt?.destroy();
      } catch {
        /* already gone */
      }
      host.innerHTML = "";
    },
  };
}

function videoPlayer(host: HTMLElement, src: string, onReady: () => void): Player {
  const v = document.createElement("video");
  v.src = src;
  v.playsInline = true;
  v.preload = "auto";
  v.className = "size-full bg-black object-contain";
  v.addEventListener("loadedmetadata", onReady, { once: true });
  host.appendChild(v);
  return {
    time: () => v.currentTime,
    duration: () => (Number.isFinite(v.duration) ? v.duration : 0),
    playing: () => !v.paused && !v.ended,
    play: () =>
      v.play().then(
        () => true,
        () => false,
      ),
    pause: () => v.pause(),
    seek: (s) => {
      v.currentTime = s;
    },
    volume: (x) => {
      v.volume = x;
    },
    title: () => null,
    destroy: () => {
      v.pause();
      v.removeAttribute("src");
      v.load();
      host.innerHTML = "";
    },
  };
}

const fmt = (s: number) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = Math.floor(s % 60);
  return `${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${String(x).padStart(2, "0")}`;
};

const VOL_KEY = "nexus:watch:vol";
function loadVol() {
  try {
    const v = Number(localStorage.getItem(VOL_KEY));
    return Number.isFinite(v) && localStorage.getItem(VOL_KEY) !== null ? Math.min(1, Math.max(0, v)) : 0.8;
  } catch {
    return 0.8;
  }
}

// ─────────────────────────── the shared screen ───────────────────────────
/** The video everyone in the call is watching, kept in sync. Anyone can play, pause, seek or stop. */
export function WatchStage({ compact }: { compact?: boolean }) {
  const w = useCall((s) => s.watch);
  const me = useApp((s) => s.userId);
  const starter = useApp((s) => (w ? s.profiles[w.by]?.display_name : null));
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<Player | null>(null);
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const [vol, setVol] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [title, setTitle] = useState<string | null>(null);
  const key = w ? `${w.kind}:${w.src}` : "";

  useEffect(() => setVol(loadVol()), []);

  // create / replace the player when the video changes
  useEffect(() => {
    const st = useCall.getState().watch;
    if (!st || !host.current) return;
    setReady(false);
    setBlocked(false);
    setTitle(null);
    setCur(0);
    setDur(0);
    const p = st.kind === "youtube" && st.id ? youtubePlayer(host.current, st.id, () => setReady(true)) : videoPlayer(host.current, st.src, () => setReady(true));
    player.current = p;
    return () => {
      p.destroy();
      if (player.current === p) player.current = null;
    };
  }, [key]);

  useEffect(() => {
    player.current?.volume(muted ? 0 : vol);
  }, [vol, muted, ready]);

  // keep this device on the shared timeline
  useEffect(() => {
    if (!ready) return;
    let trying = false;
    let lastSeek = 0;
    const t = setInterval(() => {
      const st = useCall.getState().watch;
      const p = player.current;
      if (!st || !p) return;
      const now = performance.now();
      const d = p.duration();
      const target = d ? Math.min(watchPos(st, now), d) : watchPos(st, now);
      const ended = !!d && target >= d - 0.25;
      if (st.playing && !ended) {
        if (!p.playing() && !trying) {
          trying = true;
          void p.play().then((ok) => {
            trying = false;
            setBlocked(!ok);
          });
        } else if (p.playing()) setBlocked(false);
      } else if (p.playing()) p.pause();
      if (Math.abs(p.time() - target) > (st.playing ? 1 : 0.3) && now - lastSeek > 1500) {
        lastSeek = now;
        p.seek(target);
      }
      // whoever started it marks the end so everyone's controls show "play" again
      if (ended && st.playing && st.by === useApp.getState().userId) watchControl({ playing: false, pos: d });
      setCur(p.time());
      setDur(d);
      setTitle((x) => x ?? p.title());
    }, 400);
    return () => clearInterval(t);
  }, [ready, key]);

  if (!w) return null;
  const shown = drag ?? cur;
  const toggle = () => {
    // first tap on a device that blocked autoplay just joins in; it doesn't pause everyone
    if (blocked) return void player.current?.play().then((ok) => setBlocked(!ok));
    watchControl({ playing: !w.playing, pos: player.current?.time() });
  };
  const seekBy = (d: number) => watchControl({ pos: Math.max(0, Math.min(dur || Infinity, (player.current?.time() ?? 0) + d)) });
  const commitDrag = () => {
    if (drag !== null) watchControl({ pos: drag });
    setDrag(null);
  };

  return (
    <div className="relative flex size-full flex-col overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
      <div className="relative min-h-0 flex-1">
        <div ref={host} className="absolute inset-0 [&>iframe]:size-full" />
        {/* shield: clicks go to our shared controls, not the player's own (which would only change this device) */}
        {!(blocked && w.kind === "youtube") && <button className="absolute inset-0 z-10 cursor-pointer" onClick={toggle} aria-label={w.playing ? "Pause for everyone" : "Play for everyone"} />}
        {blocked && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
            <span className="rounded-full bg-black/75 px-3 py-1.5 text-sm font-semibold text-white">Tap the video to join the watch party</span>
          </div>
        )}
        {!ready && <div className="absolute inset-0 grid place-items-center text-sm text-white/60">Loading video…</div>}
      </div>
      <div className={cn("shrink-0 bg-[#111214] px-3 text-white", compact ? "py-2" : "py-2.5")}>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={Math.max(1, dur)}
            step={0.1}
            value={Math.min(shown, Math.max(1, dur))}
            onChange={(e) => setDrag(Number(e.target.value))}
            onPointerUp={commitDrag}
            onKeyUp={commitDrag}
            onTouchEnd={commitDrag}
            className="h-1 min-w-0 flex-1 accent-accent"
            aria-label="Seek for everyone"
          />
          <span className="shrink-0 text-[11px] text-white/60 tabular-nums">
            {fmt(shown)} / {fmt(dur)}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-1">
          <button onClick={() => seekBy(-10)} className="grid size-8 place-items-center rounded-full hover:bg-white/10" aria-label="Back 10 seconds">
            <RotateCcw className="size-4" />
          </button>
          <button onClick={toggle} className="grid size-9 place-items-center rounded-full bg-white text-black" aria-label={w.playing ? "Pause for everyone" : "Play for everyone"}>
            {w.playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
          </button>
          <button onClick={() => seekBy(10)} className="grid size-8 place-items-center rounded-full hover:bg-white/10" aria-label="Forward 10 seconds">
            <RotateCw className="size-4" />
          </button>
          <button onClick={() => setMuted((m) => !m)} className="ml-1 grid size-8 place-items-center rounded-full hover:bg-white/10" aria-label={muted ? "Unmute video" : "Mute video"}>
            {muted || vol === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
          {!compact && (
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : vol}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVol(v);
                setMuted(false);
                try {
                  localStorage.setItem(VOL_KEY, String(v));
                } catch {
                  /* private mode */
                }
              }}
              className="h-1 w-20 accent-white"
              aria-label="Video volume (only you)"
            />
          )}
          <div className="ml-2 flex min-w-0 flex-1 items-center gap-1.5 text-xs text-white/70">
            <Avatar userId={w.by} size={18} plain />
            <span className="truncate">
              <b className="text-white">{title || w.title}</b>
              {!compact && <> · started by {w.by === me ? "you" : (starter ?? "someone")}</>}
            </span>
          </div>
          <button onClick={stopWatch} className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1.5 text-xs font-bold hover:bg-dnd" title="Stop for everyone">
            <X className="size-3.5" /> Stop
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── start button ───────────────────────────
export function WatchButton({ mobile }: { mobile?: boolean }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const active = useCall((s) => !!s.watch);
  const go = () => {
    const err = startWatch(url);
    if (err) return toast(err, "error");
    setUrl("");
    setOpen(false);
  };
  const panel = (
    <div className="w-[min(92vw,360px)] animate-pop rounded-2xl bg-menu p-3 text-txt shadow-2xl ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2 font-bold">
        <Clapperboard className="size-4 text-accent" /> Watch together
      </div>
      <p className="mt-0.5 text-xs text-sub">Everyone in the call sees the same video, in sync. Anyone can pause or skip.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
        className="mt-2 flex gap-2"
      >
        <input
          autoFocus={!mobile}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="YouTube link or .mp4 link"
          inputMode="url"
          className="min-w-0 flex-1 rounded-lg bg-rail px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/60"
        />
        <button className="rounded-lg bg-accent px-3 text-sm font-bold text-white">{active ? "Switch" : "Start"}</button>
      </form>
      {active && (
        <button
          onClick={() => {
            stopWatch();
            setOpen(false);
          }}
          className="mt-2 w-full rounded-lg bg-hover py-2 text-sm font-semibold hover:bg-dnd hover:text-white"
        >
          Stop for everyone
        </button>
      )}
    </div>
  );
  if (mobile)
    return (
      <>
        <button onClick={() => setOpen(true)} className="flex flex-col items-center gap-1.5" aria-label="Watch together">
          <span className={cn("grid size-[52px] place-items-center rounded-full active:scale-90", active ? "bg-accent text-white" : "bg-white/15 text-white")}>
            <Clapperboard className="size-6" />
          </span>
          <span className="text-[11px] font-medium text-white/80">Watch</span>
        </button>
        {open && (
          <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 pb-safe-4" onClick={() => setOpen(false)}>
            <div className="mb-24">{panel}</div>
          </div>
        )}
      </>
    );
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        title="Watch together"
        aria-label="Watch together"
        className={cn("grid size-14 place-items-center rounded-full text-white transition", active || open ? "bg-accent" : "bg-[#2b2d31] hover:bg-[#3a3c42]")}
      >
        <Clapperboard className="size-6" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute bottom-16 left-1/2 z-30 -translate-x-1/2">{panel}</div>
        </>
      )}
    </div>
  );
}
