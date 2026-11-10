"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { asPeaks, fmtTime } from "@/lib/acetateAudio";
import { openShare, shareInfo, type SharedOpen } from "@/lib/acetate";
import { Waveform } from "./AcetateBits";

const TOKEN = /\/acetate\/s\/([a-f0-9]{16,64})/i;

/** Inline player for an Acetate share link dropped into a Nexus chat or DM. */
export default function AcetateEmbed({ text }: { text: string }) {
  const token = text.match(TOKEN)?.[1] ?? null;
  const [title, setTitle] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [opened, setOpened] = useState<SharedOpen | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [failed, setFailed] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!token) return;
    let live = true;
    void shareInfo(token).then((info) => {
      if (!live || !info?.ok) return;
      setTitle(info.title || "Acetate");
      if (info.password) {
        setLocked(true);
        return;
      }
      void openShare(token, null, false)
        .then((data) => {
          if (live) setOpened(data);
        })
        .catch(() => {
          if (live) setFailed(true);
        });
    });
    return () => {
      live = false;
    };
  }, [token]);

  const track = opened?.tracks[0];
  const version = track?.versions[0];
  const duration = version?.duration || 0;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !version?.url) return;
    if (audio.src !== version.url) audio.src = version.url;
    if (playing) void audio.play().catch(() => setPlaying(false));
    else audio.pause();
  }, [version, playing]);

  if (!token) return null;
  const href = `/acetate/s/${token}`;

  return (
    <div className="mt-2 w-full max-w-[340px] overflow-hidden rounded-xl border border-[#e4a15a]/30 bg-[#1a1612] text-[#f3eadf]" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2 px-3 pt-2 text-[10px] font-bold tracking-[0.18em] text-[#e4a15a] uppercase">
        <span className="size-2 rounded-full bg-[#e4a15a]" /> Acetate
      </div>
      <div className="px-3 pt-1 pb-3">
        <a href={href} className="line-clamp-2 text-sm font-semibold hover:underline">
          {opened?.title || title || "Shared cut"}
        </a>
        {locked && <a href={href} className="mt-2 block text-xs text-[#a3988c]">Password protected — open the link to play.</a>}
        {failed && <a href={href} className="mt-2 block text-xs text-[#a3988c]">Open the link to play.</a>}
        {version?.url && (
          <>
            <audio ref={audioRef} preload="none" onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)} onEnded={() => setPlaying(false)} />
            <div className="mt-2">
              <Waveform
                peaks={asPeaks(version.peaks)}
                progress={duration ? current / duration : 0}
                onSeek={(ratio) => {
                  const audio = audioRef.current;
                  if (!audio) return;
                  audio.currentTime = ratio * (duration || audio.duration || 0);
                }}
              />
            </div>
            <div className="mt-1 flex items-center gap-2">
              <button type="button" aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying((p) => !p)} className="grid size-8 place-items-center rounded-full bg-[#e4a15a] text-[#100e0c]">
                {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5 translate-x-px" />}
              </button>
              <span className="text-[11px] text-[#a3988c]">{fmtTime(current)} / {fmtTime(duration)}</span>
              {track?.title && opened?.kind === "project" && <span className="truncate text-[11px] text-[#a3988c]">{track.title}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
