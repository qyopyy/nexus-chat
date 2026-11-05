"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { FolderPlus, Music2, Pause, Play, Plus, SkipBack, SkipForward, Trash2 } from "lucide-react";
import { connectSpotify, startSpotifySync, useSpotifyUser } from "@/lib/spotifyUser";
import { NowPlayingCard, SpotifyMark, liveNow } from "@/components/profile/NowPlaying";
import { useApp, toast } from "@/store/app";
import {
  useWumpMusic,
  wumpAddFolder,
  wumpAddProject,
  wumpAddSongs,
  wumpAssignSong,
  wumpDeleteFolder,
  wumpDeleteProject,
  wumpDeleteSong,
  wumpSetPlaying,
  wumpSongUrl,
} from "@/lib/wumpMusic";
import { cn } from "@/lib/utils";
import { WUMP } from "@/lib/wumpBrand";

/** Built-in Spotify + local songs / folders / projects for Wump. */
export default function WumpMusic() {
  const me = useApp((s) => s.userId);
  const sp = useSpotifyUser();
  const np = useApp((s) => liveNow(me ? s.profiles[me]?.now_playing : null));
  const folders = useWumpMusic((s) => s.folders);
  const projects = useWumpMusic((s) => s.projects);
  const songs = useWumpMusic((s) => s.songs);
  const currentId = useWumpMusic((s) => s.currentId);
  const playing = useWumpMusic((s) => s.playing);
  const [folderFilter, setFolderFilter] = useState<string | "all" | "loose">("all");
  const audio = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    startSpotifySync();
  }, []);

  useEffect(() => {
    const el = audio.current;
    if (!el || !currentId) return;
    let alive = true;
    void wumpSongUrl(currentId).then((url) => {
      if (!alive || !url || !audio.current) return;
      if (audio.current.src !== url) {
        audio.current.src = url;
        void audio.current.play().catch(() => wumpSetPlaying(currentId, false));
      } else if (playing) void audio.current.play().catch(() => {});
      else audio.current.pause();
    });
    return () => {
      alive = false;
    };
  }, [currentId, playing]);

  const visible = songs.filter((s) => {
    if (folderFilter === "all") return true;
    if (folderFilter === "loose") return !s.folderId;
    return s.folderId === folderFilter;
  });
  const current = songs.find((s) => s.id === currentId);

  const playAt = (id: string) => {
    if (currentId === id && playing) wumpSetPlaying(id, false);
    else wumpSetPlaying(id, true);
  };

  const skip = (dir: 1 | -1) => {
    if (!visible.length) return;
    const i = Math.max(0, visible.findIndex((s) => s.id === currentId));
    const next = visible[(i + dir + visible.length) % visible.length];
    if (next) wumpSetPlaying(next.id, true);
  };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <audio
        ref={audio}
        onEnded={() => skip(1)}
        onPlay={() => currentId && wumpSetPlaying(currentId, true)}
        onPause={() => currentId && wumpSetPlaying(currentId, false)}
      />

      {/* Spotify */}
      <section className="overflow-hidden rounded-3xl bg-white p-4 text-slate-900 shadow-lg shadow-black/10 ring-1 ring-black/5">
        <div className="mb-3 flex items-center gap-2">
          <SpotifyMark className="size-8" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-extrabold">Spotify in {WUMP}</div>
            <div className="text-[11px] text-slate-500">Now playing on your profile + mini player</div>
          </div>
          {!sp.connected ? (
            <button type="button" onClick={() => void connectSpotify()} className="rounded-full bg-[#1DB954] px-3 py-1.5 text-xs font-bold text-white">
              Link
            </button>
          ) : (
            <span className="rounded-full bg-[#1DB954]/15 px-2 py-0.5 text-[10px] font-bold text-[#1DB954]">Linked</span>
          )}
        </div>
        {sp.connected && np ? (
          <NowPlayingCard np={np} />
        ) : (
          <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
            <div className="grid size-14 place-items-center rounded-xl bg-gradient-to-br from-[#1DB954] to-[#191414] text-2xl text-white">♪</div>
            <div className="min-w-0 flex-1 text-sm text-slate-600">
              Link Spotify to show what you&apos;re listening to on the map and your {WUMP} profile — Now Playing on your card.
            </div>
          </div>
        )}
      </section>

      {/* Local player dock */}
      <section className="rounded-3xl bg-gradient-to-br from-[#7c3aed] via-[#2563eb] to-[#ff4d6d] p-4 text-white shadow-xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => (current ? playAt(current.id) : visible[0] && playAt(visible[0].id))}
            className="grid size-16 place-items-center rounded-full bg-white/20 ring-2 ring-white/40 backdrop-blur active:scale-95"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="size-7 fill-white" /> : <Play className="ml-0.5 size-7 fill-white" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-extrabold">{current?.name ?? "Local library"}</div>
            <div className="text-[11px] text-white/70">{songs.length} songs · {folders.length} folders · {projects.length} projects</div>
          </div>
          <button type="button" onClick={() => skip(-1)} className="grid size-10 place-items-center rounded-full bg-white/15" aria-label="Previous">
            <SkipBack className="size-4 fill-white" />
          </button>
          <button type="button" onClick={() => skip(1)} className="grid size-10 place-items-center rounded-full bg-white/15" aria-label="Next">
            <SkipForward className="size-4 fill-white" />
          </button>
        </div>
      </section>

      {/* Folders / projects */}
      <section className="rounded-3xl bg-side p-4 ring-1 ring-white/10">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="flex-1 text-sm font-extrabold">Folders & projects</h2>
          <button
            type="button"
            onClick={() => {
              const name = prompt("Folder name");
              if (name) wumpAddFolder(name);
            }}
            className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold"
          >
            <FolderPlus className="size-3.5" /> Folder
          </button>
          <button
            type="button"
            onClick={() => {
              const name = prompt("Project name");
              if (name) wumpAddProject(name, folderFilter !== "all" && folderFilter !== "loose" ? folderFilter : null);
            }}
            className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-2.5 py-1 text-[11px] font-bold text-accent"
          >
            <Plus className="size-3.5" /> Project
          </button>
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          <Chip active={folderFilter === "all"} onClick={() => setFolderFilter("all")}>
            All
          </Chip>
          <Chip active={folderFilter === "loose"} onClick={() => setFolderFilter("loose")}>
            Unfiled
          </Chip>
          {folders.map((f) => (
            <Chip key={f.id} active={folderFilter === f.id} onClick={() => setFolderFilter(f.id)} onRemove={() => wumpDeleteFolder(f.id)}>
              {f.name}
            </Chip>
          ))}
        </div>
        {!!projects.length && (
          <ul className="mb-3 space-y-1.5">
            {projects
              .filter((p) => folderFilter === "all" || folderFilter === "loose" || p.folderId === folderFilter)
              .map((p) => (
                <li key={p.id} className="flex items-center gap-2 rounded-xl bg-black/25 px-3 py-2">
                  <Music2 className="size-4 text-accent" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name}</span>
                  <span className="text-[10px] text-sub">{p.songIds.length} tracks</span>
                  <button type="button" className="text-sub hover:text-dnd" onClick={() => wumpDeleteProject(p.id)} aria-label="Delete project">
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
          </ul>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac"
          multiple
          hidden
          onChange={(e) => {
            const files = e.target.files;
            if (!files?.length) return;
            const folderId = folderFilter !== "all" && folderFilter !== "loose" ? folderFilter : null;
            void wumpAddSongs(files, folderId).then((n) => {
              toast(n ? `Added ${n} song${n === 1 ? "" : "s"} to ${WUMP}` : "No audio files found", n ? "success" : "info");
            });
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 bg-white/5 py-3 text-sm font-bold hover:bg-white/10"
        >
          <Plus className="size-4" /> Add local songs
        </button>
        {!visible.length ? (
          <p className="py-6 text-center text-sm text-sub">No songs yet — add MP3 / M4A / WAV from your phone.</p>
        ) : (
          <ul className="space-y-1">
            {visible.map((s) => (
              <li key={s.id} className={cn("flex items-center gap-2 rounded-xl px-2 py-2", currentId === s.id && "bg-accent/15")}>
                <button type="button" onClick={() => playAt(s.id)} className="grid size-9 place-items-center rounded-full bg-white/10" aria-label="Play">
                  {currentId === s.id && playing ? <Pause className="size-3.5 fill-current" /> : <Play className="ml-0.5 size-3.5 fill-current" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{s.name}</div>
                  <div className="truncate text-[10px] text-sub">
                    {folders.find((f) => f.id === s.folderId)?.name ?? "Unfiled"}
                    {s.projectId ? ` · ${projects.find((p) => p.id === s.projectId)?.name}` : ""}
                  </div>
                </div>
                <select
                  className="max-w-[7rem] truncate rounded-lg bg-black/30 px-1.5 py-1 text-[10px] outline-none"
                  value={s.projectId ?? ""}
                  onChange={(e) => wumpAssignSong(s.id, { projectId: e.target.value || null })}
                  title="Assign to project"
                >
                  <option value="">No project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => void wumpDeleteSong(s.id)} className="text-sub hover:text-dnd" aria-label="Delete">
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Chip({ active, onClick, onRemove, children }: { active?: boolean; onClick: () => void; onRemove?: () => void; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold", active ? "bg-accent text-white" : "bg-white/10 text-sub")}>
      <button type="button" onClick={onClick}>
        {children}
      </button>
      {onRemove && (
        <button type="button" onClick={onRemove} className="opacity-70 hover:opacity-100" aria-label="Remove">
          ×
        </button>
      )}
    </span>
  );
}
