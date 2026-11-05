"use client";

import { useRef, useState } from "react";
import { Music2, Pause, Play, Trash2, Upload } from "lucide-react";
import {
  addMenuTrack,
  pauseMenuMusic,
  playMenuTrack,
  removeMenuTrack,
  selectMenuTrack,
  setMenuMusicVolume,
  useMenuMusic,
} from "@/lib/menuMusic";
import { formatBytes, cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { toast } from "@/store/app";

export default function MenuMusic() {
  const tracks = useMenuMusic((s) => s.tracks);
  const currentId = useMenuMusic((s) => s.currentId);
  const playing = useMenuMusic((s) => s.playing);
  const volume = useMenuMusic((s) => s.volume);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const current = tracks.find((t) => t.id === currentId) ?? tracks[0];

  async function onFile(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    const res = await addMenuTrack(f);
    setBusy(false);
    if (!res.ok) {
      toast(res.error, "error");
      return;
    }
    haptic.success();
    toast("Track added — play it anytime from this menu", "success");
    void playMenuTrack();
  }

  return (
    <div className="mt-1 rounded-lg bg-black/25 p-2 ring-1 ring-white/5">
      <div className="mb-1.5 flex items-center gap-2 px-1">
        <Music2 className="size-3.5 text-accent" />
        <span className="flex-1 text-[11px] font-bold tracking-wide text-sub uppercase">Menu music</span>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
          hidden
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-accent hover:bg-white/5 disabled:opacity-50"
        >
          <Upload className="size-3" /> Upload
        </button>
      </div>

      {current ? (
        <div className="flex items-center gap-2 rounded-md bg-side/80 px-2 py-1.5">
          <button
            type="button"
            onClick={() => {
              if (playing) pauseMenuMusic();
              else void playMenuTrack(current.id);
            }}
            className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-white"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="size-3.5 fill-current" /> : <Play className="ml-0.5 size-3.5 fill-current" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold">{current.name}</div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setMenuMusicVolume(Number(e.target.value))}
              className="mt-0.5 w-full accent-[var(--accent)]"
              aria-label="Menu music volume"
            />
          </div>
        </div>
      ) : (
        <p className="px-1 py-1 text-[11px] text-sub">Upload a song to play while you browse.</p>
      )}

      {tracks.length > 0 && (
        <ul className="mt-1.5 max-h-28 space-y-0.5 overflow-y-auto">
          {tracks.map((t) => (
            <li key={t.id} className={cn("flex items-center gap-1 rounded-md px-1.5 py-1", t.id === current?.id && "bg-white/5")}>
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-[11px] font-medium hover:text-accent"
                onClick={() => {
                  selectMenuTrack(t.id);
                  void playMenuTrack(t.id);
                }}
              >
                {t.name}
                <span className="ml-1 text-sub">{formatBytes(t.size)}</span>
              </button>
              <button
                type="button"
                aria-label="Remove track"
                className="grid size-6 place-items-center rounded text-sub hover:bg-white/5 hover:text-dnd"
                onClick={() => void removeMenuTrack(t.id)}
              >
                <Trash2 className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
