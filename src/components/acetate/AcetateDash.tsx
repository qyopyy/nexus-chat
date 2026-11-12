"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Download, MoreHorizontal, Pause, Play, Plus, Search, Share2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast, useApp } from "@/store/app";
import {
  acetateSigned,
  createProject,
  deleteProject,
  markNotices,
  moveInProject,
  updateProject,
  uploadAudio,
  type AcetateNotice,
  type AcetateProject,
  type AcetateShare,
  type AcetateStorage,
  type AcetateTrack,
} from "@/lib/acetate";
import { fmtBytes, fmtTime } from "@/lib/acetateAudio";
import { dropOffline, isOffline, keepOffline, offlineCuts, offlinePlaybackUrl } from "@/lib/acetateOffline";
import { exportTheme, useAcetateTheme, ACETATE_THEMES } from "@/lib/acetateTheme";
import { useAcetatePlayer } from "@/lib/acetatePlayer";
import { loadProfiles } from "@/lib/data";
import Avatar from "@/components/ui/Avatar";
import type { Profile } from "@/lib/types";

type Chip = "all" | "projects" | "tracks";
type Library = {
  projects: AcetateProject[];
  tracks: AcetateTrack[];
  memberships: { project_id: string; track_id: string; position: number }[];
  storage: AcetateStorage;
  shares: AcetateShare[];
};

async function saveOwnedVault(tracks: AcetateTrack[]) {
  if (!tracks.length) {
    toast("Vault is empty", "info");
    return;
  }
  const { data, error } = await supabase.from("acetate_versions").select("id, track_id, version, path, bytes").in("track_id", tracks.map((track) => track.id));
  if (error) throw new Error(error.message);
  const latest = new Map<string, { id: string; path: string; version: number; bytes: number }>();
  for (const row of data ?? []) {
    const prev = latest.get(row.track_id as string);
    if (!prev || (row.version as number) > prev.version) {
      latest.set(row.track_id as string, { id: row.id as string, path: row.path as string, version: row.version as number, bytes: Number(row.bytes) || 0 });
    }
  }
  let saved = 0;
  for (const [trackId, row] of latest) {
    const url = await acetateSigned(row.path);
    if (!url) continue;
    const title = tracks.find((track) => track.id === trackId)?.title || "Vault track";
    await keepOffline(row.id, url, title, { trackId, bytes: row.bytes });
    saved += 1;
  }
  toast(saved ? `Saved ${saved} on this device` : "Nothing to save yet", saved ? "success" : "info");
}

export default function AcetateDash(props: {
  library: Library;
  art: Record<string, string | null>;
  notices: AcetateNotice[];
  me: Profile | undefined;
  userId: string;
  email: string | null;
  admin: boolean;
  theme: ReturnType<typeof useAcetateTheme>;
  screen: "home" | "project" | "vault" | "projects";
  projectId?: string;
  onOpenProject: (id: string) => void;
  onOpenTrack: (id: string, from: "home" | "vault") => void;
  onHome: () => void;
  onVault: () => void;
  onPlay: (ids: string[], album: string | null, startId?: string) => Promise<void>;
  onShare: (kind: "track" | "project", id: string, title: string) => void;
  run: (task: () => Promise<void>) => void;
  onNotices: () => void;
  onNavigate: (name: "radio" | "recap" | "premium" | "bring") => void;
}) {
  const [chip, setChip] = useState<Chip>(props.screen === "projects" ? "projects" : "all");
  const [query, setQuery] = useState("");
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [account, setAccount] = useState(false);
  const [bell, setBell] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const shelfProjects = props.library.projects.filter((project) => (project.library ?? "shelf") !== "vault");
  const vaultProjects = props.library.projects.filter((project) => project.library === "vault");
  const shelfTracks = props.library.tracks.filter((track) => track.owner_id === props.userId && (track.library ?? "shelf") !== "vault");
  const vaultTracks = props.library.tracks.filter((track) => track.owner_id === props.userId && track.library === "vault");
  const q = query.trim().toLowerCase();
  const projects = (props.screen === "vault" ? vaultProjects : shelfProjects).filter((project) => !q || project.title.toLowerCase().includes(q) || (project.note ?? "").toLowerCase().includes(q));
  const tracks = (props.screen === "vault" ? vaultTracks : shelfTracks).filter((track) => !q || track.title.toLowerCase().includes(q) || (track.note ?? "").toLowerCase().includes(q) || (track.folder ?? "").toLowerCase().includes(q));
  const showProjects = props.screen === "vault" || chip !== "tracks";
  const showTracks = props.screen === "vault" || chip === "tracks" || (chip === "all" && projects.length === 0);
  const ownerName = props.me?.display_name || props.me?.username || "You";
  const unread = props.notices.filter((notice) => !notice.read_at).length;
  useEffect(() => {
    if (props.screen === "projects") setChip("projects");
  }, [props.screen]);

  function upload(files: File[], library: "shelf" | "vault", projectId?: string, label?: string) {
    if (!files.length) return;
    props.run(async () => {
      const failed: string[] = [];
      let done = 0;
      for (const file of files) {
        setUploadName(`${done + 1} of ${files.length} · ${file.name}`);
        setProgress(0);
        try {
          await uploadAudio(file, {
            library,
            projectId,
            title: file.name.replace(/\.[^.]+$/, ""),
            label,
            onProgress: setProgress,
          });
          done += 1;
        } catch {
          failed.push(file.name);
        }
      }
      setProgress(null);
      setUploadName(null);
      if (failed.length) toast(`Added ${done}. Couldn't add ${failed.slice(0, 2).join(", ")}`, "error");
      else toast(library === "vault" ? (files.length === 1 ? "In Vault" : `Added ${files.length} to Vault`) : `Added ${files.length}`, "success");
    });
  }

  const project = props.library.projects.find((item) => item.id === props.projectId) ?? null;

  return (
    <div className="relative" style={{ fontFamily: "var(--ac-font)" }}>
      {props.theme.mark === "999" && (
        <p aria-hidden className="pointer-events-none absolute top-16 right-4 text-6xl font-black tracking-tighter opacity-10" style={{ color: "#ff4da6" }}>999</p>
      )}
      <header className="flex items-center gap-3 px-4 pt-4">
        {props.screen === "project" ? (
          <button type="button" onClick={props.onHome} className="grid size-10 place-items-center rounded-full" style={{ background: "var(--ac-card)" }} aria-label="Back">←</button>
        ) : (
          <div className="flex items-center gap-2">
            <WaveLogo />
            <span className="text-xl font-black tracking-tight">Acetate</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {props.screen === "project" ? (
            <>
              <ProjectDownload project={project} tracks={tracksFor(props.library, props.projectId)} />
              <button type="button" className="grid size-10 place-items-center rounded-full" style={{ background: "var(--ac-card)" }} aria-label="More" onClick={() => setMenu(menu === "project" ? null : "project")}>
                <MoreHorizontal className="size-4" />
              </button>
            </>
          ) : (
            <>
              <button type="button" aria-label="Notifications" className="relative grid size-10 place-items-center rounded-full" style={{ background: "var(--ac-card)" }} onClick={() => setBell((on) => !on)}>
                <Bell className="size-4" />
                {unread > 0 && <span className="absolute top-1 right-1 size-2 rounded-full" style={{ background: "var(--ac-accent)" }} />}
              </button>
              <button type="button" aria-label="Search" className="grid size-10 place-items-center rounded-full" style={{ background: "var(--ac-card)" }} onClick={() => setSearching((on) => !on)}>
                <Search className="size-4" />
              </button>
              <button type="button" aria-label="Account" className="grid size-10 place-items-center overflow-hidden rounded-full" style={{ background: "var(--ac-card)" }} onClick={() => setAccount(true)}>
                <Avatar userId={props.userId} size={36} plain />
              </button>
            </>
          )}
        </div>
      </header>
      {bell && (
        <div className="mx-4 mt-3 rounded-2xl p-3 text-sm" style={{ background: "var(--ac-card)" }}>
          {props.notices.length === 0 && <p style={{ color: "var(--ac-muted)" }}>No comments or invites yet.</p>}
          {props.notices.slice(0, 8).map((notice) => (
            <p key={notice.id} className="py-1">{notice.body}</p>
          ))}
          <button type="button" className="text-xs" style={{ color: "var(--ac-accent)" }} onClick={() => void markNotices().then(props.onNotices)}>Mark read</button>
        </div>
      )}
      {searching && props.screen !== "project" && (
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={props.screen === "vault" ? "Search the vault" : "Search"} className="mx-4 mt-3 w-[calc(100%-2rem)] rounded-2xl px-4 py-3 text-sm outline-none" style={{ background: "var(--ac-card)" }} />
      )}
      {props.screen !== "project" && props.screen !== "vault" && (
        <div className="flex gap-2 px-4 pt-4">
          {(["all", "projects", "tracks"] as const).map((item) => (
            <button key={item} type="button" onClick={() => setChip(item)} className="rounded-full px-4 py-2 text-sm font-bold capitalize" style={{ background: chip === item ? "var(--ac-accent)" : "var(--ac-card)", color: chip === item ? "var(--ac-accent-text)" : "var(--ac-text)" }}>
              {item === "all" ? "All" : item === "projects" ? "Projects" : "Tracks"}
            </button>
          ))}
          <button type="button" onClick={() => props.onNavigate("bring")} className="rounded-full px-4 py-2 text-sm font-bold" style={{ background: "var(--ac-card)" }}>Bring</button>
        </div>
      )}
      {props.screen === "vault" && (
        <div className="px-4 pt-4">
          <p className="text-xs font-bold tracking-[0.18em] uppercase" style={{ color: "var(--ac-accent)" }}>Vault</p>
          <h1 className="text-3xl font-black">Private masters</h1>
          <p className="mt-1 max-w-xl text-sm" style={{ color: "var(--ac-muted)" }}>
            Vault storage is {props.library.storage.vault_limit == null ? "unlimited" : fmtBytes(props.library.storage.vault_limit)}. It does not use the free library quota. Files still have a per-file cap of {fmtBytes(props.library.storage.file_bytes ?? 5 * 1024 ** 3)}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="rounded-full px-4 py-2 text-sm font-bold" style={{ background: "var(--ac-accent)", color: "var(--ac-accent-text)" }} onClick={() => props.onNavigate("bring")}>Convert or import</button>
            <button type="button" className="rounded-full px-4 py-2 text-sm font-bold" style={{ background: "var(--ac-card)" }} onClick={() => props.run(() => saveOwnedVault(vaultTracks))}>Keep Vault on this device</button>
          </div>
        </div>
      )}
      {props.screen === "project" && project && (
        <ProjectStage
          project={project}
          tracks={tracksFor(props.library, project.id)}
          art={props.art}
          ownerName={ownerName}
          onPlay={(id) => void props.onPlay(tracksFor(props.library, project.id).map((track) => track.id), project.title, id)}
          onShare={() => props.onShare("project", project.id, project.title)}
          onOpenTrack={(id) => props.onOpenTrack(id, project.library === "vault" ? "vault" : "home")}
          onUpload={(files, versionLabel) => upload(files, project.library === "vault" ? "vault" : "shelf", project.id, versionLabel)}
          onMove={(trackId, dir) => props.run(() => moveInProject(project.id, trackId, dir, props.library.memberships))}
          menu={menu === "project"}
          onDelete={() => {
            if (window.confirm("Delete this project? Tracks stay in your library.")) props.run(() => deleteProject(project.id).then(props.onHome));
          }}
          onRename={(title) => props.run(() => updateProject(project.id, { title }))}
        />
      )}
      {props.screen !== "project" && (
        <div
          className="px-4 pt-4 pb-28"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const files = [...e.dataTransfer.files];
            if (files.length) upload(files, props.screen === "vault" ? "vault" : "shelf");
          }}
        >
          {showProjects && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {projects.map((project) => {
                const count = props.library.memberships.filter((row) => row.project_id === project.id).length;
                return (
                  <article key={project.id} className="min-w-0">
                    <button type="button" className="relative block w-full overflow-hidden rounded-2xl" style={{ background: "var(--ac-card)" }} onClick={() => props.onOpenProject(project.id)}>
                      <Cover url={props.art[project.id]} title={project.title} />
                      <span className="absolute right-2 bottom-2 grid size-10 place-items-center rounded-full" style={{ background: "var(--ac-accent)", color: "var(--ac-accent-text)" }} onClick={(e) => { e.stopPropagation(); void props.onPlay(tracksFor(props.library, project.id).map((track) => track.id), project.title); }}>
                        <Play className="size-4 fill-current" />
                      </span>
                    </button>
                    <div className="mt-2 flex items-start gap-2">
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => props.onOpenProject(project.id)}>
                        <span className="block truncate font-bold">{project.title}</span>
                        <span className="block truncate text-sm" style={{ color: "var(--ac-muted)" }}>{ownerName}</span>
                        <span className="block text-xs" style={{ color: "var(--ac-muted)" }}>{count} tracks</span>
                      </button>
                      <button type="button" aria-label="Project menu" onClick={() => setMenu(menu === project.id ? null : project.id)}><MoreHorizontal className="size-4" /></button>
                    </div>
                    {menu === project.id && (
                      <div className="mt-1 rounded-2xl p-2 text-sm" style={{ background: "var(--ac-card)" }}>
                        <button type="button" className="block w-full px-2 py-1 text-left" onClick={() => props.onShare("project", project.id, project.title)}>Share</button>
                        <button type="button" className="block w-full px-2 py-1 text-left" onClick={() => { if (window.confirm("Delete this project? Tracks stay.")) props.run(() => deleteProject(project.id)); }}>Delete</button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
          {showTracks && (
            <ul className="mt-4 space-y-2">
              {tracks.map((track) => (
                <li key={track.id}>
                  <button type="button" className="flex w-full items-center gap-3 rounded-2xl p-2 text-left" style={{ background: "var(--ac-card)" }} onClick={() => props.onOpenTrack(track.id, props.screen === "vault" ? "vault" : "home")}>
                    <span className="grid size-12 place-items-center overflow-hidden rounded-xl" style={{ background: "var(--ac-line)" }}>{props.art[track.id] ? <img src={props.art[track.id] ?? ""} alt="" className="size-full object-cover" /> : track.title.slice(0, 1)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{track.title}</span>
                      <span className="block text-xs capitalize" style={{ color: "var(--ac-muted)" }}>{track.status || "demo"}{track.folder ? ` · ${track.folder}` : ""}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {projects.length === 0 && tracks.length === 0 && (
            <p className="rounded-3xl border border-dashed px-4 py-10 text-center text-sm" style={{ borderColor: "var(--ac-line)", color: "var(--ac-muted)" }}>
              {props.screen === "vault" ? "Drop a WAV, AIFF, FLAC, or MP3 to start a private version stack." : "Drop audio to start a project. Your library stays private."}
            </p>
          )}
          {progress != null && <p className="mt-3 text-sm" style={{ color: "var(--ac-muted)" }}>{uploadName || "Uploading"} · {Math.round(progress * 100)}%</p>}
        </div>
      )}
      {props.screen !== "project" && (
        <>
          <label className="fixed bottom-24 left-4 grid size-14 cursor-pointer place-items-center rounded-full shadow-lg" style={{ background: "var(--ac-accent)", color: "var(--ac-accent-text)" }}>
            <Plus className="size-6" />
            <span className="sr-only">Upload</span>
            <input type="file" accept="audio/*,.wav,.aiff,.aif,.flac,.mp3" multiple className="hidden" onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ""; if (files.length) upload(files, props.screen === "vault" ? "vault" : "shelf"); }} />
          </label>
          {props.screen !== "vault" && (
            <button type="button" aria-label="Vault" className="fixed right-4 bottom-24 grid size-14 place-items-center rounded-full" style={{ background: "var(--ac-card)" }} onClick={props.onVault}>
              <StackIcon />
            </button>
          )}
          {props.screen === "vault" && (
            <button type="button" className="fixed right-4 bottom-24 rounded-full px-4 py-3 text-sm font-bold" style={{ background: "var(--ac-card)" }} onClick={() => {
              const title = window.prompt("Folder name");
              if (title?.trim()) props.run(() => createProject("project", title.trim(), undefined, "vault").then(() => undefined));
            }}>New folder</button>
          )}
        </>
      )}
      {account && (
        <AccountSheet
          onClose={() => setAccount(false)}
          me={props.me}
          userId={props.userId}
          email={props.email}
          storage={props.library.storage}
          shares={props.library.shares.length}
          admin={props.admin}
          theme={props.theme}
          onPlan={() => { setAccount(false); props.onNavigate("premium"); }}
          onNavigate={(name) => { setAccount(false); props.onNavigate(name); }}
        />
      )}
    </div>
  );
}

function tracksFor(library: Library, projectId?: string) {
  if (!projectId) return [];
  const ids = library.memberships.filter((row) => row.project_id === projectId).sort((a, b) => a.position - b.position).map((row) => row.track_id);
  return ids.map((id) => library.tracks.find((track) => track.id === id)).filter((track): track is AcetateTrack => !!track);
}

function Cover({ url, title }: { url?: string | null; title: string }) {
  if (url) return <img src={url} alt="" className="aspect-square w-full object-cover" />;
  return <span className="grid aspect-square w-full place-items-center text-3xl font-black" style={{ color: "var(--ac-muted)" }}>{title.slice(0, 1)}</span>;
}

function WaveLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path d="M2 13h2l2-6 3 10 3-8 2 4h8" fill="none" stroke="var(--ac-accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StackIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 3 3 8l9 5 9-5-9-5Zm-9 8 9 5 9-5M3 16l9 5 9-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function ProjectDownload({ project, tracks }: { project: AcetateProject | null; tracks: AcetateTrack[] }) {
  const [busy, setBusy] = useState(false);
  if (!project || project.library !== "vault") return null;
  return (
    <button
      type="button"
      aria-label="Keep on this device"
      className="grid size-10 place-items-center rounded-full"
      style={{ background: "var(--ac-card)", color: "var(--ac-accent)" }}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void (async () => {
          await saveOwnedVault(tracks);
        })().catch((error: Error) => toast(error.message, "error")).finally(() => setBusy(false));
      }}
    >
      <Download className="size-4" />
    </button>
  );
}

function ProjectStage(props: {
  project: AcetateProject;
  tracks: AcetateTrack[];
  art: Record<string, string | null>;
  ownerName: string;
  onPlay: (id?: string) => void;
  onShare: () => void;
  onOpenTrack: (id: string) => void;
  onUpload: (files: File[], label?: string) => void;
  menu: boolean;
  onDelete: () => void;
  onRename: (title: string) => void;
  onMove?: (trackId: string, dir: -1 | 1) => void;
}) {
  const [rows, setRows] = useState<{ id: string; duration: number | null; offline: boolean }[]>([]);
  const [top, setTop] = useState<{ name: string; plays: number } | null>(null);
  const [listeners, setListeners] = useState(false);
  const [label, setLabel] = useState("demo");
  const playing = useAcetatePlayer((s) => s.playing);
  useEffect(() => {
    const ids = props.tracks.map((track) => track.id);
    if (!ids.length) return;
    let live = true;
    void (async () => {
      const { data } = await supabase.from("acetate_versions").select("id, track_id, version, duration").in("track_id", ids);
      const latest = new Map<string, { id: string; duration: number | null; version: number }>();
      for (const row of data ?? []) {
        const prev = latest.get(row.track_id as string);
        if (!prev || (row.version as number) > prev.version) latest.set(row.track_id as string, { id: row.id as string, duration: row.duration as number | null, version: row.version as number });
      }
      const next = [];
      for (const [trackId, row] of latest) next.push({ id: trackId, duration: row.duration, offline: await isOffline(row.id) });
      const listens = await supabase.from("acetate_listens").select("listener_id, who").in("track_id", ids).limit(400);
      const counts = new Map<string, { name: string; plays: number; profile?: string }>();
      for (const row of listens.data ?? []) {
        const key = (row.listener_id as string | null) || (row.who as string) || "guest";
        const current = counts.get(key) ?? { name: (row.who as string) || "Listener", plays: 0, profile: row.listener_id as string | undefined };
        current.plays += 1;
        counts.set(key, current);
      }
      const ranked = [...counts.values()].sort((a, b) => b.plays - a.plays);
      const winner = ranked[0];
      if (winner?.profile) {
        await loadProfiles([winner.profile]);
        const profile = useApp.getState().profiles[winner.profile];
        winner.name = profile?.display_name || profile?.username || winner.name;
      }
      if (!live) return;
      setRows(next);
      if (winner && winner.plays > 0) setTop({ name: winner.name, plays: winner.plays });
    })();
    return () => {
      live = false;
    };
  }, [props.project.id, props.tracks]);
  const total = rows.reduce((sum, row) => sum + (row.duration || 0), 0);
  const offline = new Map(rows.map((row) => [row.id, row.offline]));
  return (
    <div className="px-4 pt-6 pb-28">
      <div className="mx-auto max-w-[280px] overflow-hidden rounded-3xl">
        <Cover url={props.art[props.project.id]} title={props.project.title} />
      </div>
      <p className="mt-4 text-center text-xs font-bold tracking-[0.16em]" style={{ color: "var(--ac-muted)" }}>
        {props.tracks.length} TRACKS{total > 0 ? ` · ${fmtTime(total)}` : ""}
      </p>
      <h1 className="mt-1 text-center text-3xl font-black">{props.project.title}</h1>
      <p className="text-center" style={{ color: "var(--ac-muted)" }}>{props.ownerName}</p>
      {top && (
        <button type="button" className="mx-auto mt-3 flex items-center gap-2 rounded-full px-3 py-1 text-sm" style={{ background: "var(--ac-card)" }} onClick={() => setListeners((on) => !on)}>
          <span aria-hidden>🏆</span> {top.name} · {top.plays} {top.plays === 1 ? "play" : "plays"} ›
        </button>
      )}
      {listeners && <p className="mt-2 text-center text-xs" style={{ color: "var(--ac-muted)" }}>Play counts come from Acetate listens. Minutes are not stored, so they are not shown.</p>}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button type="button" className="flex items-center justify-center gap-2 rounded-full bg-white py-3 font-bold text-black" onClick={() => props.onPlay()}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4 fill-current" />} Play
        </button>
        <button type="button" className="flex items-center justify-center gap-2 rounded-full py-3 font-bold" style={{ background: "var(--ac-card)" }} onClick={props.onShare}>
          <Share2 className="size-4" /> Share
        </button>
      </div>
      {props.menu && (
        <div className="mt-3 rounded-2xl p-3 text-sm" style={{ background: "var(--ac-card)" }}>
          <button type="button" className="block py-1" onClick={() => { const title = window.prompt("Rename", props.project.title); if (title?.trim()) props.onRename(title.trim()); }}>Rename</button>
          <label className="block py-1">
            Add tracks
            <input type="file" accept="audio/*,.wav,.aiff,.aif,.flac,.mp3" multiple className="block text-xs" onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ""; if (files.length) props.onUpload(files, props.project.library === "vault" ? label : undefined); }} />
          </label>
          {props.project.library === "vault" && (
            <label className="block py-1 text-xs" style={{ color: "var(--ac-muted)" }}>
              Version label
              <select value={label} onChange={(e) => setLabel(e.target.value)} className="ml-2 rounded-full px-2 py-1" style={{ background: "var(--ac-bg)" }}>
                <option value="demo">Demo</option>
                <option value="mix">Mix</option>
                <option value="master">Master</option>
              </select>
            </label>
          )}
          <button type="button" className="block py-1 text-red-400" onClick={props.onDelete}>Delete project</button>
        </div>
      )}
      <ol className="mt-4">
        {props.tracks.map((track, index) => (
          <li key={track.id} className="flex items-center gap-3 border-b py-3" style={{ borderColor: "var(--ac-line)" }}>
            <span className="flex w-10 flex-col text-[10px]" style={{ color: "var(--ac-muted)" }}>
              <button type="button" aria-label="Move up" disabled={index === 0} className="disabled:opacity-30" onClick={() => props.onMove?.(track.id, -1)}>↑</button>
              <button type="button" aria-label="Move down" disabled={index === props.tracks.length - 1} className="disabled:opacity-30" onClick={() => props.onMove?.(track.id, 1)}>↓</button>
            </span>
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => props.onOpenTrack(track.id)}>
              <span className="block truncate font-semibold">{track.title}</span>
              {offline.get(track.id) && <span className="mt-1 inline-block size-2 rounded-full" style={{ background: "var(--ac-accent)" }} aria-label="On this device" />}
            </button>
            <span className="text-sm" style={{ color: "var(--ac-muted)" }}>{fmtTime(rows.find((row) => row.id === track.id)?.duration)}</span>
            <button type="button" aria-label="Track menu" onClick={() => props.onOpenTrack(track.id)}><MoreHorizontal className="size-4" /></button>
          </li>
        ))}
      </ol>
      {props.tracks.length === 0 && <p className="mt-6 text-center text-sm" style={{ color: "var(--ac-muted)" }}>No tracks in this project yet.</p>}
    </div>
  );
}

function AccountSheet(props: {
  onClose: () => void;
  me: Profile | undefined;
  userId: string;
  email: string | null;
  storage: AcetateStorage;
  shares: number;
  admin: boolean;
  theme: ReturnType<typeof useAcetateTheme>;
  onPlan: () => void;
  onNavigate: (name: "radio" | "recap" | "premium" | "bring") => void;
}) {
  const crossfade = useAcetatePlayer((s) => s.crossfade);
  const [saved, setSaved] = useState<ReturnType<typeof offlineCuts>>([]);
  const [importText, setImportText] = useState("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(props.me?.display_name || "");
  const music = Number(props.storage.music_bytes ?? 0);
  const covers = Number(props.storage.cover_bytes ?? 0);
  const used = music + covers;
  const unlimited = props.storage.vault_limit == null;
  const cap = props.storage.vault_limit ?? null;
  const musicShare = used > 0 ? music / used : 0;
  const coverShare = used > 0 ? covers / used : 0;
  const exported = exportTheme(props.theme.tokens);
  useEffect(() => {
    let live = true;
    void (async () => {
      const rows = [];
      for (const cut of offlineCuts()) if (await isOffline(cut.id)) rows.push(cut);
      if (live) setSaved(rows);
    })();
    return () => {
      live = false;
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/60 p-3 sm:place-items-center" onClick={props.onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl p-4" style={{ background: "var(--ac-bg)", color: "var(--ac-text)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="flex-1 text-center text-lg font-bold">Account</h2>
          <button type="button" className="rounded-full px-3 py-1 text-sm font-bold" style={{ background: "var(--ac-card)" }} onClick={props.onClose}>Done</button>
        </div>
        <div className="mt-4 flex items-center gap-3 rounded-2xl p-3" style={{ background: "var(--ac-card)" }}>
          <Avatar userId={props.userId} size={56} />
          <div className="min-w-0 flex-1">
            {editing ? (
              <form onSubmit={(e) => { e.preventDefault(); void supabase.from("profiles").update({ display_name: name.trim().slice(0, 40) || props.me?.display_name }).eq("id", props.userId).then(() => setEditing(false)); }}>
                <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg bg-transparent font-bold outline-none" />
              </form>
            ) : <p className="truncate font-bold">{props.me?.display_name || "Acetate"}</p>}
            <p className="text-sm" style={{ color: "var(--ac-accent)" }}>@{props.me?.username}</p>
            {props.email && <p className="truncate text-xs" style={{ color: "var(--ac-muted)" }}>{props.email}</p>}
          </div>
          <button type="button" className="rounded-full px-3 py-1 text-sm" style={{ background: "var(--ac-bg)" }} onClick={() => setEditing(true)}>Edit</button>
        </div>
        <div className="mt-3 rounded-2xl p-4" style={{ background: "var(--ac-card)" }}>
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">{props.storage.premium ? (props.storage.lifetime ? "Lifetime Premium" : "Premium") : "Acetate"}</span>
            <span style={{ color: "var(--ac-muted)" }}>{unlimited ? "Vault unlimited" : "Vault capped"}</span>
          </div>
          <p className="mt-2 text-2xl font-black">{fmtBytes(used)} <span className="text-base font-semibold" style={{ color: "var(--ac-muted)" }}>{unlimited ? "of Unlimited" : `of ${fmtBytes(cap)}`}</span></p>
          <div className="mt-2 flex h-1.5 overflow-hidden rounded-full" style={{ background: "var(--ac-line)" }}>
            <span style={{ width: `${musicShare * 100}%`, background: "var(--ac-accent)" }} />
            <span style={{ width: `${coverShare * 100}%`, background: "#e4a15a" }} />
          </div>
          <p className="mt-2 text-xs" style={{ color: "var(--ac-muted)" }}>
            <span style={{ color: "var(--ac-accent)" }}>●</span> Music {fmtBytes(music)} <span className="ml-2 text-[#e4a15a]">●</span> Covers {fmtBytes(covers)}
          </p>
          <p className="mt-2 text-xs" style={{ color: "var(--ac-muted)" }}>
            Library {props.storage.premium || props.storage.limit == null ? "unlimited" : `${fmtBytes(Number(props.storage.bytes))} of ${fmtBytes(Number(props.storage.limit))}`}. Vault {fmtBytes(Number(props.storage.vault_bytes ?? 0))}{unlimited ? ", unlimited" : ` of ${fmtBytes(cap)}`}.
          </p>
          <button type="button" className="mt-3 block w-full rounded-xl py-2 text-center text-sm font-semibold" style={{ background: "var(--ac-bg)" }} onClick={props.onPlan}>Plan</button>
        </div>
        <ul className="mt-3 overflow-hidden rounded-2xl text-sm" style={{ background: "var(--ac-card)" }}>
          <Row label="Playback" value={crossfade > 0 ? `${Math.round(crossfade / 100) / 10}s crossfade` : "No crossfade"} onClick={() => useAcetatePlayer.getState().setCrossfade(crossfade > 0 ? 0 : 4000)} />
          <Row label="What's new" value="1.2.0" onClick={() => window.dispatchEvent(new Event("acetate-whats-new"))} />
          <Row label="On this device" value={saved.length ? String(saved.length) : "None"} />
          <Row label="Privacy" value={props.shares ? "Private · links on" : "Private"} />
          <Row label="Share links" value={String(props.shares)} />
        </ul>
        {saved.length > 0 && (
          <ul className="mt-3 space-y-2 text-sm">
            {saved.map((cut) => (
              <li key={cut.id} className="flex items-center gap-2 rounded-2xl px-3 py-2" style={{ background: "var(--ac-card)" }}>
                <span className="min-w-0 flex-1 truncate">{cut.title}</span>
                <button type="button" className="text-xs font-semibold" style={{ color: "var(--ac-accent)" }} onClick={() => void offlinePlaybackUrl(cut.id).then((url) => {
                  if (!url) return;
                  useAcetatePlayer.getState().setQueue([{
                    key: cut.id,
                    trackId: cut.trackId || cut.id,
                    versionId: cut.id,
                    title: cut.title,
                    versionLabel: "On this device",
                    artist: "",
                    album: null,
                    artUrl: null,
                    peaks: [],
                    duration: 0,
                    url,
                    shareUrl: null,
                  }], 0);
                  useAcetatePlayer.getState().setPlaying(true);
                  props.onClose();
                })}>Play</button>
                <button type="button" className="text-xs" style={{ color: "var(--ac-muted)" }} onClick={() => void dropOffline(cut.id).then(() => setSaved((rows) => rows.filter((row) => row.id !== cut.id)))}>Remove</button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 rounded-2xl p-3" style={{ background: "var(--ac-card)" }}>
          <p className="text-sm font-semibold">Theme</p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {ACETATE_THEMES.map((theme) => (
              <button key={theme.id} type="button" className="rounded-xl p-2 text-left text-[10px] font-bold" style={{ background: theme.bg, color: theme.text, outline: props.theme.id === theme.id ? `2px solid ${theme.accent}` : undefined }} onClick={() => void props.theme.choose(theme.id).catch((error: Error) => toast(error.message, "error"))}>
                <span className="mb-1 block h-2 rounded-full" style={{ background: theme.accent }} />
                {theme.name}
              </button>
            ))}
          </div>
          <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Paste a theme JSON or code" className="mt-2 w-full rounded-xl bg-transparent p-2 text-xs outline-none" style={{ boxShadow: "inset 0 0 0 1px var(--ac-line)" }} />
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <button type="button" className="rounded-full px-3 py-1 font-bold" style={{ background: "var(--ac-accent)", color: "var(--ac-accent-text)" }} onClick={() => void props.theme.importRaw(importText).then(() => toast("Theme saved", "success")).catch((error: Error) => toast(error.message, "error"))}>Import</button>
            <label className="rounded-full px-3 py-1" style={{ background: "var(--ac-bg)" }}>
              File
              <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                void file.text().then((text) => props.theme.importRaw(text)).then(() => toast("Theme saved", "success")).catch((error: Error) => toast(error.message, "error"));
              }} />
            </label>
            <button type="button" onClick={() => void navigator.clipboard.writeText(exported.json).then(() => toast("Theme JSON copied", "success"))}>Copy JSON</button>
            <button type="button" onClick={() => void navigator.clipboard.writeText(exported.code).then(() => toast("Theme code copied", "success"))}>Copy code</button>
          </div>
        </div>
        <div className="mt-3 space-y-2 text-sm">
          <button type="button" className="block w-full rounded-2xl px-3 py-3 text-left" style={{ background: "var(--ac-card)" }} onClick={() => props.onNavigate("bring")}>Convert or import</button>
          <button type="button" className="block w-full rounded-2xl px-3 py-3 text-left" style={{ background: "var(--ac-card)" }} onClick={() => props.onNavigate("radio")}>Radio</button>
          <button type="button" className="block w-full rounded-2xl px-3 py-3 text-left" style={{ background: "var(--ac-card)" }} onClick={() => props.onNavigate("recap")}>Recap</button>
          <Link href="/contact" className="block rounded-2xl px-3 py-3" style={{ background: "var(--ac-card)" }}>Contact support</Link>
          {props.admin && <Link href="/admin" className="block rounded-2xl px-3 py-3" style={{ background: "var(--ac-card)" }}>Admin desk</Link>}
          {props.admin && <Link href="/acetate/admin" className="block rounded-2xl px-3 py-3" style={{ background: "var(--ac-card)" }}>Acetate premium grants</Link>}
          <button type="button" className="block w-full rounded-2xl px-3 py-3 text-left" style={{ background: "var(--ac-card)" }} onClick={() => void supabase.auth.signOut()}>Sign out</button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="flex w-full items-center justify-between gap-3 border-b px-3 py-3 text-left last:border-0" style={{ borderColor: "var(--ac-line)" }}>
        <span>{label}</span>
        <span style={{ color: "var(--ac-muted)" }}>{value}</span>
      </button>
    );
  }
  return (
    <div className="flex w-full items-center justify-between gap-3 border-b px-3 py-3 text-left last:border-0" style={{ borderColor: "var(--ac-line)" }}>
      <span>{label}</span>
      <span style={{ color: "var(--ac-muted)" }}>{value}</span>
    </div>
  );
}
