"use client";

import { useEffect, useRef, useState } from "react";
import { Headphones, Pause, Play, Plus, SkipBack, SkipForward, Trash2, Volume2 } from "lucide-react";
import { useApp } from "@/store/app";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import {
  expectedPosition,
  next,
  openSpaceMusic,
  playTrack,
  prev,
  removeTrack,
  seek,
  setListening,
  setMusicVolume,
  setSpaceMusicEnabled,
  togglePlay,
  uploadTrack,
  useSpaceMusic,
} from "@/lib/spaceMusic";

const fmt = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");

/** "Music room" block in a space: shared queue + synced playback for everyone who tunes in */
export default function SpaceMusic({ spaceId }: { spaceId: string }) {
  const space = useApp((s) => s.spaces.find((x) => x.id === spaceId));
  const me = useApp((s) => s.userId);
  const tracks = useSpaceMusic((s) => s.tracks);
  const player = useSpaceMusic((s) => s.player);
  const listening = useSpaceMusic((s) => s.listening);
  const volume = useSpaceMusic((s) => s.volume);
  const progress = useSpaceMusic((s) => s.progress);
  const duration = useSpaceMusic((s) => s.duration);
  const loading = useSpaceMusic((s) => s.loading);
  const [uploading, setUploading] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const [, force] = useState(0);

  useEffect(() => {
    void openSpaceMusic(spaceId);
  }, [spaceId]);
  // keep the clock ticking for non-listeners
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (!space) return null;
  const enabled = space.music_enabled !== false;
  const isOwner = space.owner_id === me;
  const current = tracks.find((t) => t.id === player?.track_id);
  const pos = listening ? progress : expectedPosition(player);
  const dur = listening ? duration : current?.duration ?? 0;
  const playing = !!player?.is_playing && !!current;

  return (
    <div className="mt-4">
      <div className="mb-1 flex items-center justify-between px-1 text-xs font-bold tracking-wide text-sub uppercase">
        <span className="flex items-center gap-1">
          <Headphones className="size-3.5" /> Listen together
        </span>
        {isOwner && (
          <button
            role="switch"
            aria-checked={enabled}
            title={enabled ? "Turn off for this space" : "Turn on for this space"}
            onClick={() => void setSpaceMusicEnabled(spaceId, !enabled)}
            className={cn("relative h-5 w-9 rounded-full transition", enabled ? "bg-ok" : "bg-faint")}
          >
            <span className={cn("absolute top-0.5 size-4 rounded-full bg-white transition-all", enabled ? "left-[18px]" : "left-0.5")} />
          </button>
        )}
      </div>

      {!enabled ? (
        <p className="px-2 py-1 text-xs text-faint">{isOwner ? "Turned off — flip the switch to let members play music together." : "The owner turned music off for this space."}</p>
      ) : (
        <div className="overflow-hidden rounded-xl bg-black/20 ring-1 ring-white/5">
          {/* now playing */}
          <div className="flex items-center gap-2.5 p-2.5">
            <div className={cn("grid size-11 shrink-0 place-items-center rounded-lg text-lg", playing ? "bg-[#1DB954]/20" : "bg-white/5")}>
              {playing ? (
                <span className="eq-on flex h-4 items-end gap-0.5 text-[#1DB954]">
                  <span className="eq" />
                  <span className="eq" />
                  <span className="eq" />
                </span>
              ) : (
                "♫"
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{current ? current.title : tracks.length ? "Nothing playing" : "Queue is empty"}</div>
              <div className="truncate text-xs text-sub">{current ? current.artist ?? "Uploaded track" : "Upload audio to start a session"}</div>
            </div>
            {player?.updated_by && current && (
              <span title="Last controlled by">
                <Avatar userId={player.updated_by} size={20} plain />
              </span>
            )}
          </div>

          {current && (
            <div className="px-2.5">
              <input
                type="range"
                min={0}
                max={Math.max(1, dur || 1)}
                step={1}
                value={Math.min(pos, dur || pos)}
                onChange={(e) => seek(Number(e.target.value))}
                className="h-1 w-full cursor-pointer accent-[#1DB954]"
                aria-label="Seek"
              />
              <div className="flex justify-between text-[10px] text-sub tabular-nums">
                <span>{fmt(pos)}</span>
                <span>{dur ? fmt(dur) : listening ? "" : "—"}</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-center gap-1 px-2 pb-2">
            <IconBtn onClick={prev} label="Previous">
              <SkipBack className="size-4" />
            </IconBtn>
            <button
              onClick={togglePlay}
              disabled={!tracks.length}
              className="grid size-10 place-items-center rounded-full bg-white text-black transition active:scale-90 disabled:opacity-40"
              aria-label={playing ? "Pause for everyone" : "Play for everyone"}
            >
              {loading && listening ? <span className="size-4 animate-spin rounded-full border-2 border-black border-t-transparent" /> : playing ? <Pause className="size-5" /> : <Play className="size-5 translate-x-px" />}
            </button>
            <IconBtn onClick={() => void next()} label="Next">
              <SkipForward className="size-4" />
            </IconBtn>
          </div>

          <div className="flex items-center gap-2 border-t border-white/5 px-2.5 py-2">
            <button
              onClick={() => setListening(!listening)}
              className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition", listening ? "bg-[#1DB954] text-black" : "bg-white/10 text-txt hover:bg-white/15")}
            >
              <Headphones className="size-3.5" /> {listening ? "Listening" : "Tune in"}
            </button>
            {listening && (
              <label className="flex min-w-0 flex-1 items-center gap-1.5">
                <Volume2 className="size-3.5 shrink-0 text-sub" />
                <input type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => setMusicVolume(Number(e.target.value))} className="h-1 w-full accent-white" aria-label="Volume" />
              </label>
            )}
            <button onClick={() => setShowQueue((v) => !v)} className="ml-auto text-xs text-sub hover:text-txt">
              Queue ({tracks.length})
            </button>
          </div>

          {showQueue && (
            <div className="max-h-56 overflow-y-auto border-t border-white/5">
              {tracks.map((t, i) => (
                <div key={t.id} className={cn("group flex items-center gap-2 px-2.5 py-1.5 text-sm hover:bg-white/5", t.id === current?.id && "text-[#1DB954]")}>
                  <span className="w-4 text-center text-xs text-sub tabular-nums">{i + 1}</span>
                  <button onClick={() => playTrack(t.id)} className="min-w-0 flex-1 truncate text-left">
                    {t.title}
                    {t.artist && <span className="text-sub"> · {t.artist}</span>}
                  </button>
                  {(t.added_by === me || isOwner) && (
                    <button onClick={() => void removeTrack(t.id)} className="text-sub opacity-60 hover:text-dnd md:opacity-0 md:group-hover:opacity-100" aria-label="Remove">
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <input
            ref={file}
            type="file"
            accept="audio/*"
            hidden
            multiple
            onChange={async (e) => {
              const files: File[] = Array.from((e.target.files ?? []) as ArrayLike<File>);
              e.target.value = "";
              if (!files.length) return;
              setUploading(true);
              for (const f of files.slice(0, 10)) await uploadTrack(spaceId, f);
              setUploading(false);
              setShowQueue(true);
            }}
          />
          <button
            disabled={uploading}
            onClick={() => file.current?.click()}
            className="flex w-full items-center justify-center gap-1.5 border-t border-white/5 py-2 text-xs font-semibold text-sub hover:bg-white/5 hover:text-txt disabled:opacity-60"
          >
            <Plus className="size-3.5" /> {uploading ? "Uploading…" : "Add songs (private to this space)"}
          </button>
        </div>
      )}
    </div>
  );
}

function IconBtn({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="grid size-9 place-items-center rounded-full text-sub hover:bg-white/10 hover:text-txt active:scale-90" aria-label={label}>
      {children}
    </button>
  );
}
