"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { fmtDur, playNextInQueue, playPrevInQueue, setPlaybackRate, useUntitled, type UntitledTrack } from "@/lib/untitled";

export default function PlayerBar({ tracks }: { tracks?: UntitledTrack[] }) {
  const playing = useUntitled((s) => s.playing);
  const rate = useUntitled((s) => s.rate);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [paused, setPaused] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);

  useEffect(() => {
    const a = audioRef.current;
    if (!a || !playing) return;
    a.src = playing.url;
    a.playbackRate = rate;
    void a.play().then(() => setPaused(false)).catch(() => setPaused(true));
  }, [playing?.url, playing?.trackId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const a = audioRef.current;
    if (a) a.playbackRate = rate;
  }, [rate]);

  if (!playing) return null;

  const queueTracks = tracks?.filter((tr) => playing.queue.includes(tr.id)) ?? [];

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 border-t border-white/5 bg-[#161310]/95 px-4 py-3 backdrop-blur-md">
      <div className="mx-auto max-w-2xl">
        <div className="mb-2 h-1 cursor-pointer rounded-full bg-white/10" onClick={(e) => {
          const a = audioRef.current;
          if (!a || !dur) return;
          const rect = e.currentTarget.getBoundingClientRect();
          a.currentTime = ((e.clientX - rect.left) / rect.width) * dur;
        }}>
          <div className="h-full rounded-full bg-[#c4a574]" style={{ width: `${dur ? (t / dur) * 100 : 0}%` }} />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void playPrevInQueue(queueTracks.length ? queueTracks : tracks ?? [])}
            className="grid size-8 place-items-center rounded-full text-[#cfc8ba] hover:bg-white/5"
            aria-label="Previous"
          >
            <SkipBack className="size-4 fill-current" />
          </button>
          <button
            onClick={() => {
              const a = audioRef.current;
              if (!a) return;
              if (a.paused) {
                void a.play();
                setPaused(false);
              } else {
                a.pause();
                setPaused(true);
              }
            }}
            className="grid size-10 place-items-center rounded-full bg-[#c4a574] text-black"
          >
            {paused ? <Play className="size-4 fill-current" /> : <Pause className="size-4 fill-current" />}
          </button>
          <button
            onClick={() => void playNextInQueue(queueTracks.length ? queueTracks : tracks ?? [])}
            className="grid size-8 place-items-center rounded-full text-[#cfc8ba] hover:bg-white/5"
            aria-label="Next"
          >
            <SkipForward className="size-4 fill-current" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{playing.title}</div>
            <div className="text-[11px] tabular-nums text-[#8a8478]">
              {fmtDur(t)} / {fmtDur(dur || null)}
            </div>
          </div>
          <select
            value={rate}
            onChange={(e) => setPlaybackRate(Number(e.target.value))}
            className="rounded-full border border-white/10 bg-transparent px-2 py-1 text-[11px] outline-none"
            aria-label="Playback speed"
          >
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
              <option key={r} value={r}>
                {r}x
              </option>
            ))}
          </select>
          <button onClick={() => useUntitled.setState({ playing: null })} className="grid size-8 place-items-center rounded-full text-[#8a8478] hover:bg-white/5" aria-label="Close player">
            <X className="size-4" />
          </button>
        </div>
      </div>
      <audio
        ref={audioRef}
        className="hidden"
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
        onEnded={() => {
          setPaused(true);
          void playNextInQueue(queueTracks.length ? queueTracks : tracks ?? []);
        }}
        onPause={() => setPaused(true)}
        onPlay={() => setPaused(false)}
      />
    </div>
  );
}
