"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FolderPlus,
  Folder,
  ListMusic,
  Pause,
  Play,
  Plus,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  Upload,
  Repeat,
  MoreHorizontal,
} from "lucide-react";
import {
  addBumpTrack,
  bumpMusicCurrent,
  bumpMusicQueue,
  createBumpFolder,
  createBumpProject,
  deleteBumpFolder,
  deleteBumpProject,
  formatBumpBytes,
  formatBumpTime,
  moveBumpTrackToFolder,
  pauseBumpMusic,
  playBumpTrack,
  playNextBumpTrack,
  playPrevBumpTrack,
  removeBumpTrack,
  seekBumpMusic,
  setActiveBumpFolder,
  setActiveBumpProject,
  setBumpMusicLoop,
  setBumpMusicShuffle,
  setBumpMusicVolume,
  useBumpMusic,
} from "@/lib/bumpMusic";
import { toast } from "@/store/app";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { connectSpotify, startSpotifySync, useSpotifyUser } from "@/lib/spotifyUser";
import { NowPlayingCard, liveNow } from "@/components/profile/NowPlaying";
import { useApp } from "@/store/app";

export default function BumpMusicPanel() {
  const projects = useBumpMusic((s) => s.projects);
  const folders = useBumpMusic((s) => s.folders);
  const tracks = useBumpMusic((s) => s.tracks);
  const activeProjectId = useBumpMusic((s) => s.activeProjectId);
  const activeFolderId = useBumpMusic((s) => s.activeFolderId);
  const currentId = useBumpMusic((s) => s.currentId);
  const playing = useBumpMusic((s) => s.playing);
  const volume = useBumpMusic((s) => s.volume);
  const loop = useBumpMusic((s) => s.loop);
  const shuffle = useBumpMusic((s) => s.shuffle);
  const currentTime = useBumpMusic((s) => s.currentTime);
  const duration = useBumpMusic((s) => s.duration);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const sp = useSpotifyUser();
  const myNp = useApp((s) => (s.userId ? s.profiles[s.userId]?.now_playing : null));
  const live = liveNow(myNp);
  const current = bumpMusicCurrent();

  useEffect(() => {
    startSpotifySync();
  }, []);

  const projectFolders = useMemo(
    () => folders.filter((f) => f.projectId === activeProjectId),
    [folders, activeProjectId],
  );
  const queue = bumpMusicQueue();
  const activeProject = projects.find((p) => p.id === activeProjectId);

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    let ok = 0;
    for (const file of Array.from(list)) {
      const r = await addBumpTrack(file);
      if (r.ok) ok++;
      else toast(r.error, "error");
    }
    setBusy(false);
    if (ok) {
      haptic.success();
      toast(ok === 1 ? "Song added" : `${ok} songs added`, "success");
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col gap-4">
      <section
        className="relative overflow-hidden rounded-3xl p-5 text-white ring-1 ring-white/10"
        style={{ background: "linear-gradient(145deg,#14532d 0%,#052e16 50%,#0a1f14 100%)" }}
      >
        <div className="pointer-events-none absolute -right-8 -top-8 size-40 rounded-full bg-[#22c55a]/20 blur-2xl" />
        <div className="relative">
          <div className="text-[11px] font-bold tracking-[0.16em] text-[#86efac] uppercase">Wump Music</div>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight">Library + Spotify</h2>
          <p className="mt-1.5 max-w-sm text-sm text-white/65">
            On-device songs with a full player, plus Spotify Now Playing on your Wump profile — keeps going across the map and chats.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-[#14532d] disabled:opacity-50"
            >
              <Upload className="size-4" /> Add songs
            </button>
            <button
              type="button"
              onClick={() => {
                const name = window.prompt("Project name", "New project");
                if (name) createBumpProject(name);
              }}
              className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/15"
            >
              <Plus className="size-4" /> Project
            </button>
            <button
              type="button"
              disabled={!activeProjectId}
              onClick={() => {
                if (!activeProjectId) return;
                const name = window.prompt("Folder name", "Folder");
                if (name) createBumpFolder(activeProjectId, name);
              }}
              className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/15 disabled:opacity-40"
            >
              <FolderPlus className="size-4" /> Folder
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac"
            multiple
            className="hidden"
            onChange={(e) => {
              void onFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </section>

      {/* Projects */}
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {projects.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setActiveBumpProject(p.id)}
            className={cn(
              "shrink-0 rounded-2xl px-3.5 py-2 text-left ring-1 transition",
              p.id === activeProjectId ? "bg-white/10 ring-white/25" : "bg-side ring-white/5 hover:bg-white/5",
            )}
          >
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full" style={{ background: p.color }} />
              <span className="text-sm font-bold">{p.name}</span>
            </div>
            <div className="mt-0.5 text-[10px] text-sub">
              {tracks.filter((t) => t.projectId === p.id).length} tracks
            </div>
          </button>
        ))}
      </div>

      {activeProject && (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-extrabold">{activeProject.name}</div>
            <div className="text-[11px] text-sub">Project · {queue.length} in view</div>
          </div>
          <button
            type="button"
            className="rounded-full px-2 py-1 text-[11px] font-semibold text-dnd hover:bg-dnd/10"
            onClick={() => {
              if (window.confirm(`Delete project “${activeProject.name}”?`)) deleteBumpProject(activeProject.id);
            }}
          >
            Delete project
          </button>
        </div>
      )}

      {/* Folders */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setActiveBumpFolder(null)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold",
            !activeFolderId ? "bg-accent text-white" : "bg-white/5 text-sub hover:bg-white/10",
          )}
        >
          <ListMusic className="size-3.5" /> All
        </button>
        {projectFolders.map((f) => (
          <span key={f.id} className="inline-flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setActiveBumpFolder(f.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold",
                activeFolderId === f.id ? "bg-accent text-white" : "bg-white/5 text-sub hover:bg-white/10",
              )}
            >
              <Folder className="size-3.5" /> {f.name}
            </button>
            <button
              type="button"
              aria-label={`Delete ${f.name}`}
              onClick={() => deleteBumpFolder(f.id)}
              className="grid size-7 place-items-center rounded-full text-sub hover:bg-white/10 hover:text-dnd"
            >
              <Trash2 className="size-3" />
            </button>
          </span>
        ))}
      </div>

      {/* Spotify */}
      <section className="rounded-2xl bg-side p-4 ring-1 ring-white/5">
        <div className="mb-2 text-sm font-bold">Spotify</div>
        {sp.connected ? (
          live ? (
            <NowPlayingCard np={live} />
          ) : (
            <p className="text-xs text-sub">Connected — play something on Spotify to show Now Playing on your profile.</p>
          )
        ) : (
          <button
            type="button"
            onClick={() => void connectSpotify()}
            className="rounded-full bg-[#1DB954] px-4 py-2 text-sm font-bold text-black"
          >
            Connect Spotify
          </button>
        )}
      </section>

      {/* Now playing / transport */}
      <div className="rounded-2xl bg-side p-4 ring-1 ring-white/5">
        <div className="mb-2 truncate text-sm font-extrabold">{current?.name || "Nothing playing"}</div>
        <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold tabular-nums text-sub">
          <span>{formatBumpTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(1, duration || 1)}
            step={0.1}
            value={Math.min(currentTime, duration || 0)}
            disabled={!current}
            onChange={(e) => seekBumpMusic(Number(e.target.value))}
            className="min-w-0 flex-1 accent-[var(--accent)] disabled:opacity-40"
            aria-label="Seek"
          />
          <span>{formatBumpTime(duration)}</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setBumpMusicShuffle(!shuffle)}
            className={cn("grid size-9 place-items-center rounded-full", shuffle ? "bg-accent/20 text-accent" : "text-sub hover:bg-white/10")}
            aria-label="Shuffle"
          >
            <Shuffle className="size-4" />
          </button>
          <button type="button" onClick={() => void playPrevBumpTrack()} className="grid size-9 place-items-center rounded-full text-sub hover:bg-white/10" aria-label="Previous">
            <SkipBack className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => (playing ? pauseBumpMusic() : void playBumpTrack())}
            className="grid size-12 place-items-center rounded-full bg-accent text-white shadow"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="size-5 fill-current" /> : <Play className="size-5 fill-current" />}
          </button>
          <button type="button" onClick={() => void playNextBumpTrack()} className="grid size-9 place-items-center rounded-full text-sub hover:bg-white/10" aria-label="Next">
            <SkipForward className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setBumpMusicLoop(!loop)}
            className={cn("grid size-9 place-items-center rounded-full", loop ? "bg-accent/20 text-accent" : "text-sub hover:bg-white/10")}
            aria-label="Loop"
          >
            <Repeat className="size-4" />
          </button>
          <label className="ml-auto flex min-w-0 flex-1 items-center gap-2 text-[11px] font-semibold text-sub">
            Vol
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setBumpMusicVolume(Number(e.target.value))}
              className="w-full accent-[var(--accent)]"
            />
          </label>
        </div>
      </div>

      {/* Track list */}
      <section className="min-h-0 flex-1 overflow-hidden rounded-2xl bg-side ring-1 ring-white/5">
        {!queue.length ? (
          <div className="px-4 py-10 text-center">
            <div className="text-3xl">🎧</div>
            <p className="mt-2 text-sm font-semibold">No songs here yet</p>
            <p className="mt-1 text-xs text-sub">Add MP3 / M4A / WAV — they stay on this phone.</p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-4 rounded-full bg-accent px-4 py-2 text-sm font-bold text-white"
            >
              Add songs
            </button>
          </div>
        ) : (
          <ul className="max-h-[min(52vh,480px)] overflow-y-auto">
            {queue.map((t) => {
              const active = t.id === currentId;
              return (
                <li key={t.id} className="border-b border-white/5 last:border-0">
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (active && playing) pauseBumpMusic();
                        else void playBumpTrack(t.id);
                      }}
                      className={cn(
                        "grid size-10 shrink-0 place-items-center rounded-xl",
                        active ? "bg-accent text-white" : "bg-white/5 text-txt hover:bg-white/10",
                      )}
                      aria-label={active && playing ? "Pause" : "Play"}
                    >
                      {active && playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
                    </button>
                    <button type="button" onClick={() => void playBumpTrack(t.id)} className="min-w-0 flex-1 text-left">
                      <div className={cn("truncate text-sm font-semibold", active && "text-accent")}>{t.name}</div>
                      <div className="truncate text-[11px] text-sub">{formatBumpBytes(t.size)}</div>
                    </button>
                    <select
                      aria-label="Move to folder"
                      value={t.folderId ?? ""}
                      onChange={(e) => moveBumpTrackToFolder(t.id, e.target.value || null)}
                      className="max-w-[7rem] truncate rounded-lg bg-black/30 px-1.5 py-1 text-[10px] text-sub outline-none"
                    >
                      <option value="">No folder</option>
                      {projectFolders.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      aria-label="Remove"
                      onClick={() => void removeBumpTrack(t.id)}
                      className="grid size-8 place-items-center rounded-full text-sub hover:bg-dnd/15 hover:text-dnd"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <p className="pb-2 text-center text-[10px] text-sub">
        <MoreHorizontal className="mr-1 inline size-3" />
        Audio keeps playing while you use Nearby, Friends, and Messages.
      </p>
    </div>
  );
}
