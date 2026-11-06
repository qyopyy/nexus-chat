"use client";

import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import {
  bumpMusicCurrent,
  formatBumpTime,
  pauseBumpMusic,
  playBumpTrack,
  playNextBumpTrack,
  playPrevBumpTrack,
  seekBumpMusic,
  useBumpMusic,
} from "@/lib/bumpMusic";
import { cn } from "@/lib/utils";

/** Docked player — keeps audio going while browsing Wump tabs. */
export default function BumpMiniPlayer({ onOpen }: { onOpen?: () => void }) {
  const playing = useBumpMusic((s) => s.playing);
  const currentId = useBumpMusic((s) => s.currentId);
  const currentTime = useBumpMusic((s) => s.currentTime);
  const duration = useBumpMusic((s) => s.duration);
  const track = bumpMusicCurrent();
  if (!currentId || !track) return null;

  return (
    <div className="shrink-0 border-t border-white/10 bg-[#071a10]/95 px-3 pt-2 pb-safe-2 backdrop-blur-xl">
      <div className="mx-auto max-w-lg">
        <input
          type="range"
          min={0}
          max={Math.max(1, duration || 1)}
          step={0.1}
          value={Math.min(currentTime, duration || 0)}
          onChange={(e) => seekBumpMusic(Number(e.target.value))}
          className="mb-1.5 h-1 w-full accent-[#22c55a]"
          aria-label="Seek"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpen}
            className="grid size-11 shrink-0 place-items-center rounded-xl text-lg font-black text-white"
            style={{ background: "linear-gradient(135deg,#22c55a,#0b3d24)" }}
            aria-label="Open music"
          >
            ♪
          </button>
          <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
            <div className="truncate text-sm font-bold text-white">{track.name}</div>
            <div className="truncate text-[11px] tabular-nums text-white/50">
              Wump Music · {formatBumpTime(currentTime)} / {formatBumpTime(duration)}
            </div>
          </button>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              aria-label="Previous"
              onClick={() => void playPrevBumpTrack()}
              className="grid size-9 place-items-center rounded-full text-white/70 hover:bg-white/10"
            >
              <SkipBack className="size-4" />
            </button>
            <button
              type="button"
              aria-label={playing ? "Pause" : "Play"}
              onClick={() => (playing ? pauseBumpMusic() : void playBumpTrack())}
              className={cn("grid size-10 place-items-center rounded-full bg-white text-[#0b3d24] shadow")}
            >
              {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
            </button>
            <button
              type="button"
              aria-label="Next"
              onClick={() => void playNextBumpTrack()}
              className="grid size-9 place-items-center rounded-full text-white/70 hover:bg-white/10"
            >
              <SkipForward className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
