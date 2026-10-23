"use client";

import { useEffect, useRef, useState } from "react";
import { playbackUrl, qualityLabel, recordView } from "@/lib/videos";
import { cn } from "@/lib/utils";
import type { Video } from "@/lib/types";

/** Video player: original-quality file (up to 4K), keyboard shortcuts, view counting, timestamp seeking */
export default function Player({ v, start, className }: { v: Video; start?: number; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const counted = useRef(false);
  const watched = useRef(0);

  useEffect(() => {
    let alive = true;
    counted.current = false;
    watched.current = 0;
    setSrc(null);
    setFailed(false);
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

  const q = qualityLabel(v.height, v.width);

  return (
    <div className={cn("relative aspect-video w-full overflow-hidden bg-black", className)}>
      {src ? (
        <video
          ref={ref}
          key={src}
          src={src}
          poster={v.thumb_url ?? undefined}
          controls
          playsInline
          autoPlay
          preload="metadata"
          className="size-full bg-black object-contain"
          onLoadedMetadata={(e) => {
            if (start) e.currentTarget.currentTime = start;
          }}
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
          onError={() => setFailed(true)}
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
      {q && src && <span className="pointer-events-none absolute top-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-bold text-white backdrop-blur">{q}</span>}
    </div>
  );
}
