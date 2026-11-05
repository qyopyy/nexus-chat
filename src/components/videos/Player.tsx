"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Download, Gauge, Link2, PictureInPicture2, Repeat, VolumeX } from "lucide-react";
import { preparePlayback } from "@/lib/mediaAudio";
import { toast } from "@/store/app";
import { canDownloadVideos, downloadVideo, playbackUrl, qualityLabel, recordView, videoLink } from "@/lib/videos";
import { cn } from "@/lib/utils";
import type { Video } from "@/lib/types";

/** Video player: original-quality file (up to 4K), keyboard shortcuts, view counting, timestamp seeking */
export default function Player({ v, start, className, tools }: { v: Video; start?: number; className?: string; tools?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [cors, setCors] = useState(true); // allows frame snapshots; dropped if the file host refuses
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const [silent, setSilent] = useState(false); // autoplay was only allowed muted → show "tap for sound"
  const counted = useRef(false);
  const watched = useRef(0);

  useEffect(() => {
    let alive = true;
    counted.current = false;
    watched.current = 0;
    setSrc(null);
    setFailed(false);
    setCors(true);
    setSilent(false);
    void playbackUrl(v).then((u) => alive && (u ? setSrc(u) : setFailed(true)));
    return () => {
      alive = false;
      if (watched.current > 1) void recordView(v.id, watched.current);
    };
  }, [v.id, v.video_path]); // eslint-disable-line react-hooks/exhaustive-deps

  // seek from description timestamps / ?t=
  useEffect(() => {
    const seek = (e: Event) => {
      const t = (e as CustomEvent<number>).detail;
      const el = ref.current;
      if (!el) return;
      el.currentTime = t;
      void el.play().catch(() => {});
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    window.addEventListener("nexus:seek", seek);
    return () => window.removeEventListener("nexus:seek", seek);
  }, []);

  // keyboard: k/space play, j/l ±10s, ←/→ ±5s, f fullscreen, m mute
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = ref.current;
      const t = e.target as HTMLElement;
      if (!el || t.closest("input,textarea,[contenteditable=true]")) return;
      const k = e.key.toLowerCase();
      if (k === "k" || k === " ") (el.paused ? void el.play() : el.pause(), e.preventDefault());
      else if (k === "j") el.currentTime = Math.max(0, el.currentTime - 10);
      else if (k === "l") el.currentTime = Math.min(el.duration, el.currentTime + 10);
      else if (k === "arrowleft") el.currentTime = Math.max(0, el.currentTime - 5);
      else if (k === "arrowright") el.currentTime = Math.min(el.duration, el.currentTime + 5);
      else if (k === "m") el.muted = !el.muted;
      else if (k === "f") void (document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen?.());
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  // autoplay with sound when the browser allows it; otherwise start muted and offer a big unmute button
  const autoplay = async (el: HTMLVideoElement) => {
    el.muted = false;
    try {
      preparePlayback();
      await el.play();
      setSilent(false);
    } catch (e) {
      if ((e as DOMException)?.name !== "NotAllowedError") return;
      el.muted = true;
      try {
        await el.play();
        setSilent(true);
      } catch {
        setSilent(false); // stays paused with the play button visible
      }
    }
  };
  const unmute = () => {
    const el = ref.current;
    if (!el) return;
    preparePlayback();
    el.muted = false;
    if (el.volume === 0) el.volume = 1;
    void el.play().catch(() => {});
    setSilent(false);
  };

  const q = qualityLabel(v.height, v.width);
  useEffect(() => {
    if (ref.current) ref.current.playbackRate = speed;
  }, [speed, src]);

  const snapshot = () => {
    const el = ref.current;
    if (!el || !el.videoWidth) return;
    try {
      const c = document.createElement("canvas");
      c.width = el.videoWidth;
      c.height = el.videoHeight;
      c.getContext("2d")!.drawImage(el, 0, 0);
      c.toBlob((b) => {
        if (!b) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = `${(v.title || "frame").replace(/[^\w\- ]+/g, "").slice(0, 40)} ${Math.floor(el.currentTime)}s.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      }, "image/png");
    } catch {
      toast("Snapshots aren't available for this video", "error");
    }
  };
  const pip = async () => {
    const el = ref.current as (HTMLVideoElement & { webkitSetPresentationMode?: (m: string) => void }) | null;
    if (!el) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (el.requestPictureInPicture) await el.requestPictureInPicture();
      else el.webkitSetPresentationMode?.("picture-in-picture");
    } catch {
      toast("Picture-in-picture isn't available here", "error");
    }
  };
  const linkAt = () => {
    const t = Math.floor(ref.current?.currentTime ?? 0);
    void navigator.clipboard?.writeText(`${videoLink(v)}${t ? `?t=${t}` : ""}`);
    toast(`Link copied at ${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`, "success");
  };

  return (
    <div className={tools ? "w-full" : "contents"}>
    <div className={cn("relative aspect-video w-full overflow-hidden bg-black", className)}>
      {src ? (
        <video
          ref={ref}
          key={src + String(cors)}
          data-nexus-player=""
          src={src}
          crossOrigin={cors ? "anonymous" : undefined}
          loop={loop}
          poster={v.thumb_url ?? undefined}
          controls
          controlsList={canDownloadVideos() ? undefined : "nodownload"}
          playsInline
          preload="metadata"
          className="size-full bg-black object-contain"
          onLoadedMetadata={(e) => {
            if (start) e.currentTarget.currentTime = start;
            void autoplay(e.currentTarget);
          }}
          onPlay={(e) => !e.currentTarget.muted && preparePlayback()}
          onVolumeChange={(e) => !e.currentTarget.muted && setSilent(false)}
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            watched.current = Math.max(watched.current, el.currentTime);
            const need = Math.min(5, (el.duration || 10) * 0.3);
            if (!counted.current && el.currentTime >= need) {
              counted.current = true;
              void recordView(v.id, el.currentTime);
            }
          }}
          onPause={() => watched.current > 1 && void recordView(v.id, watched.current)}
          onError={() => (cors ? setCors(false) : setFailed(true))}
        />
      ) : failed ? (
        <div className="grid size-full place-items-center p-6 text-center text-sm text-white/70">
          {v.status === "uploading" ? "Still uploading — it'll play as soon as the upload finishes." : "This video can't be played in this browser. MP4 (H.264/HEVC) works everywhere."}
        </div>
      ) : (
        <div className="grid size-full place-items-center">
          <div className="size-10 animate-spin rounded-full border-4 border-white/70 border-t-transparent" />
        </div>
      )}
      {silent && src && (
        <button onClick={unmute} className="absolute top-3 left-3 z-10 flex animate-pop items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-black shadow-xl">
          <VolumeX className="size-4" /> Tap for sound
        </button>
      )}
      {q && src && <span className="pointer-events-none absolute top-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-bold text-white backdrop-blur">{q}</span>}
    </div>
    {tools && src && (
      <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto px-3 pt-2 text-sm lg:px-0">
        <label className="flex shrink-0 items-center gap-1 rounded-full bg-side px-3 py-1.5 font-semibold" title="Playback speed">
          <Gauge className="size-4" />
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="bg-transparent outline-none">
            {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((x) => (
              <option key={x} value={x} className="bg-menu">
                {x === 1 ? "Normal" : `${x}×`}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => setLoop(!loop)} className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold", loop ? "bg-accent text-white" : "bg-side hover:bg-hover")}>
          <Repeat className="size-4" /> Loop
        </button>
        <button onClick={() => void pip()} className="flex shrink-0 items-center gap-1.5 rounded-full bg-side px-3 py-1.5 font-semibold hover:bg-hover">
          <PictureInPicture2 className="size-4" /> Mini player
        </button>
        {cors && (
          <button onClick={snapshot} className="flex shrink-0 items-center gap-1.5 rounded-full bg-side px-3 py-1.5 font-semibold hover:bg-hover">
            <Camera className="size-4" /> Snapshot
          </button>
        )}
        <button onClick={linkAt} className="flex shrink-0 items-center gap-1.5 rounded-full bg-side px-3 py-1.5 font-semibold hover:bg-hover">
          <Link2 className="size-4" /> Link at this time
        </button>
        {canDownloadVideos() && (
          <button onClick={() => void downloadVideo(v)} className="flex shrink-0 items-center gap-1.5 rounded-full bg-side px-3 py-1.5 font-semibold hover:bg-hover" title="Download (VIP+)">
            <Download className="size-4" /> Download
          </button>
        )}
      </div>
    )}
    </div>
  );
}

/** the <video> element of the current watch page (for clip tools) */
export function currentVideoEl(): HTMLVideoElement | null {
  return document.querySelector("video[data-nexus-player]");
}
