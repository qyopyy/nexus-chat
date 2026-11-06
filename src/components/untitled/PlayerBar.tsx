"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import {
  fmtDur,
  playNextInQueue,
  playPrevInQueue,
  setLoopA,
  setLoopB,
  setLoopOn,
  setPlaybackRate,
  useUntitled,
  type UntitledTrack,
} from "@/lib/untitled";

export default function PlayerBar({ tracks }: { tracks?: UntitledTrack[] }) {
  const playing = useUntitled((s) => s.playing);
  const rate = useUntitled((s) => s.rate);
  const loopA = useUntitled((s) => s.loopA);
  const loopB = useUntitled((s) => s.loopB);
  const loopOn = useUntitled((s) => s.loopOn);
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
  const loopReady = loopA != null && loopB != null && loopB > loopA;

  const seekTo = (clientX: number, el: HTMLElement) => {
    const a = audioRef.current;
    if (!a || !dur) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    a.currentTime = ratio * dur;
    setT(a.currentTime);
  };

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 border-t border-white/5 bg-[#161310]/95 px-4 py-3 backdrop-blur-md">
      <div className="mx-auto max-w-2xl">
        <div
          className="relative mb-2 h-1 cursor-pointer rounded-full bg-white/10"
          onClick={(e) => seekTo(e.clientX, e.currentTarget)}
        >
          {loopReady && (
            <div
              className="pointer-events-none absolute inset-y-0 rounded-full bg-[#c4a574]/25"
              style={{
                left: `${(loopA! / dur) * 100}%`,
                width: `${((loopB! - loopA!) / dur) * 100}%`,
              }}
            />
          )}
          <div className="relative h-full rounded-full bg-[#c4a574]" style={{ width: `${dur ? (t / dur) * 100 : 0}%` }} />
          {loopA != null && dur > 0 && (
            <div
              className="pointer-events-none absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#c4a574] ring-1 ring-black/40"
              style={{ left: `${(loopA / dur) * 100}%` }}
              title={`A ${fmtDur(loopA)}`}
            />
          )}
          {loopB != null && dur > 0 && (
            <div
              className="pointer-events-none absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#e8d5b0] ring-1 ring-black/40"
              style={{ left: `${(loopB / dur) * 100}%` }}
              title={`B ${fmtDur(loopB)}`}
            />
          )}
        </div>
        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] tabular-nums text-[#8a8478]">
          <button
            type="button"
            onClick={() => (loopA != null ? setLoopA(null) : setLoopA(t))}
            className={`rounded px-1.5 py-0.5 font-medium tracking-wide ${
              loopA != null ? "bg-[#c4a574]/20 text-[#c4a574]" : "hover:bg-white/5 hover:text-[#cfc8ba]"
            }`}
            aria-label={loopA != null ? "Clear loop A" : "Set loop A"}
            title={loopA != null ? "Clear A" : "Set A"}
          >
            A{loopA != null ? ` ${fmtDur(loopA)}` : ""}
          </button>
          <button
            type="button"
            onClick={() => (loopB != null ? setLoopB(null) : setLoopB(t))}
            className={`rounded px-1.5 py-0.5 font-medium tracking-wide ${
              loopB != null ? "bg-[#e8d5b0]/20 text-[#e8d5b0]" : "hover:bg-white/5 hover:text-[#cfc8ba]"
            }`}
            aria-label={loopB != null ? "Clear loop B" : "Set loop B"}
            title={loopB != null ? "Clear B" : "Set B"}
          >
            B{loopB != null ? ` ${fmtDur(loopB)}` : ""}
          </button>
          <button
            type="button"
            disabled={!loopReady}
            onClick={() => setLoopOn(!loopOn)}
            className={`rounded px-1.5 py-0.5 font-medium tracking-wide disabled:opacity-30 ${
              loopOn ? "bg-white/10 text-[#cfc8ba]" : "hover:bg-white/5 hover:text-[#cfc8ba]"
            }`}
            aria-label={loopOn ? "Disable A–B loop" : "Enable A–B loop"}
            title={loopOn ? "Loop on" : "Loop off"}
          >
            {loopOn ? "Loop" : "A–B"}
          </button>
          <span className="ml-auto">{fmtDur(t)} / {fmtDur(dur || null)}</span>
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
          <button
            onClick={() => useUntitled.setState({ playing: null, loopA: null, loopB: null, loopOn: false })}
            className="grid size-8 place-items-center rounded-full text-[#8a8478] hover:bg-white/5"
            aria-label="Close player"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
      <audio
        ref={audioRef}
        className="hidden"
        onTimeUpdate={(e) => {
          const cur = e.currentTarget.currentTime;
          if (loopOn && loopA != null && loopB != null && loopB > loopA && cur >= loopB) {
            e.currentTarget.currentTime = loopA;
            setT(loopA);
            return;
          }
          setT(cur);
        }}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
        onEnded={() => {
          if (loopOn && loopA != null && loopB != null && loopB > loopA) {
            const a = audioRef.current;
            if (a) {
              a.currentTime = loopA;
              void a.play();
              setPaused(false);
              setT(loopA);
            }
            return;
          }
          setPaused(true);
          void playNextInQueue(queueTracks.length ? queueTracks : tracks ?? []);
        }}
        onPause={() => setPaused(true)}
        onPlay={() => setPaused(false)}
      />
    </div>
  );
}
