"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Copy,
  Disc3,
  Download,
  Eye,
  FolderOpen,
  Headphones,
  History,
  Link2,
  Lock,
  Play,
  Plus,
  RefreshCw,
  Share2,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import { useApp, toast } from "@/store/app";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import PlayerBar from "./PlayerBar";
import {
  createProject,
  createShare,
  deleteProject,
  explorePublic,
  fmtBytes,
  fmtCount,
  fmtDur,
  getProject,
  listListens,
  listMyProjects,
  listShares,
  listTrackVersions,
  listTracks,
  loadUntitledProfile,
  moveTrack,
  playTrack,
  profileUrl,
  removeTrack,
  renameTrack,
  replaceTrackAudio,
  restoreTrackVersion,
  revokeShare,
  setTrackFolder,
  setUntitledFollow,
  shareUrl,
  trackUrl,
  untitledFollowList,
  updateProject,
  updateSharePermission,
  isUntitledAudioFile,
  uploadMany,
  untitledBack,
  untitledGo,
  untitledHome,
  useUntitled,
  type SharePermission,
  type UntitledListen,
  type UntitledProfile,
  type UntitledProject,
  type UntitledShare,
  type UntitledTrack,
  type UntitledTrackVersion,
  type Visibility,
} from "@/lib/untitled";
import { loadProfiles } from "@/lib/data";

type ProjectTab = "tracks" | "share" | "activity";

const COLORS = ["#c4a574", "#7aa2a0", "#b07a8a", "#8a9a6a", "#6a8ab0", "#a08a6a"];

export default function UntitledHub({ mobile }: { mobile?: boolean }) {
  const stack = useUntitled((s) => s.stack);
  const route = stack[stack.length - 1];
  const [queueTracks, setQueueTracks] = useState<UntitledTrack[]>([]);

  return (
    <div className="relative flex h-full min-h-0 flex-col text-[#f3efe6]" style={{ background: "linear-gradient(180deg,#12100e 0%,#1a1714 45%,#0f0e0c 100%)" }}>
      <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: "radial-gradient(ellipse at 30% 0%,rgba(196,165,116,0.18),transparent 50%)" }} />

      <header className={cn("relative z-10 flex shrink-0 items-center gap-2 border-b border-white/5 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        {stack.length > 1 ? (
          <button onClick={untitledBack} className="grid size-9 place-items-center rounded-full hover:bg-white/5" aria-label="Back">
            <ArrowLeft className="size-5" />
          </button>
        ) : (
          <button onClick={() => useApp.setState(mobile ? { hub: null, mobileTab: "music" } : { hub: "music" })} className="grid size-9 place-items-center rounded-full hover:bg-white/5" aria-label="Back to Music">
            <ArrowLeft className="size-5" />
          </button>
        )}
        <button onClick={() => untitledHome()} className="font-semibold tracking-wide">
          Untitled
        </button>
        <span className="text-xs text-[#8a8478]">WIP music</span>
        <div className="ml-auto flex gap-1">
          <button onClick={() => untitledGo({ view: "explore" })} className="rounded-full px-3 py-1.5 text-xs font-semibold text-[#c4a574] hover:bg-white/5">
            Explore
          </button>
          <MeProfileBtn />
        </div>
      </header>

      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 pb-32">
        {route.view === "home" && <Home />}
        {route.view === "project" && <ProjectView id={route.id} onTracks={setQueueTracks} />}
        {route.view === "profile" && <ProfileView username={route.username} />}
        {route.view === "explore" && <Explore />}
      </div>

      <PlayerBar tracks={queueTracks} />
    </div>
  );
}

function MeProfileBtn() {
  const me = useApp((s) => s.userId);
  const p = useApp((s) => (me ? s.profiles[me] : null));
  if (!p) return null;
  return (
    <button onClick={() => untitledGo({ view: "profile", username: p.username })} className="rounded-full px-3 py-1.5 text-xs font-semibold hover:bg-white/5">
      @{p.username}
    </button>
  );
}

function Home() {
  const [projects, setProjects] = useState<UntitledProject[] | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    void listMyProjects()
      .then(setProjects)
      .catch((e) => toast(String(e.message ?? e), "error"));
  }, []);
  useEffect(() => load(), [load]);

  return (
    <div className="mx-auto max-w-2xl py-6">
      <div className="mb-8">
        <div className="text-[10px] font-semibold tracking-[0.22em] text-[#c4a574]/80 uppercase">A quiet place for drafts</div>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-[#f3efe6]">Untitled</h1>
        <p className="mt-2 max-w-md text-sm text-[#8a8478]">Upload WIP tracks (mp3, wav, m4a, mp4…), organize projects, share listen/download links, and grow a public profile.</p>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-[#cfc8ba]">Your projects</h2>
        <button
          disabled={creating}
          onClick={async () => {
            setCreating(true);
            try {
              const p = await createProject("Untitled");
              load();
              untitledGo({ view: "project", id: p.id });
            } catch (e) {
              toast(String((e as Error).message ?? e), "error");
            } finally {
              setCreating(false);
            }
          }}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#c4a574] px-3.5 py-1.5 text-xs font-semibold text-black"
        >
          <Plus className="size-3.5" /> New project
        </button>
      </div>

      {projects === null ? (
        <div className="py-16 text-center text-sm text-[#8a8478]">Loading…</div>
      ) : projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center">
          <Disc3 className="mx-auto size-8 text-[#c4a574]/70" />
          <p className="mt-3 text-sm text-[#8a8478]">No projects yet. Create one and drop in a sketch.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map((p) => (
            <button key={p.id} onClick={() => untitledGo({ view: "project", id: p.id })} className="flex w-full items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-3 text-left hover:bg-white/[0.05]">
              <span className="grid size-12 place-items-center rounded-xl" style={{ background: `linear-gradient(145deg,${p.color},#1a1714)` }}>
                <Headphones className="size-5 text-white/80" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{p.title}</span>
                <span className="block text-xs text-[#8a8478]">
                  {p.track_count} track{p.track_count === 1 ? "" : "s"} · {fmtCount(p.listen_count)} listens · {p.visibility}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectView({ id, onTracks }: { id: string; onTracks?: (t: UntitledTrack[]) => void }) {
  const me = useApp((s) => s.userId);
  const [project, setProject] = useState<UntitledProject | null | undefined>(undefined);
  const [tracks, setTracks] = useState<UntitledTrack[]>([]);
  const [shares, setShares] = useState<UntitledShare[]>([]);
  const [listens, setListens] = useState<UntitledListen[]>([]);
  const [tab, setTab] = useState<ProjectTab>("tracks");
  const [upPct, setUpPct] = useState<number | null>(null);
  const [folder, setFolder] = useState("");
  const [folderFilter, setFolderFilter] = useState<string | "all">("all");
  const [dragOver, setDragOver] = useState(false);
  const [versionsFor, setVersionsFor] = useState<{ track: UntitledTrack; versions: UntitledTrackVersion[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<{ input: HTMLInputElement | null; track: UntitledTrack | null }>({ input: null, track: null });

  const reload = useCallback(async () => {
    try {
      const p = await getProject(id);
      setProject(p);
      if (!p) return;
      const [t, s, l] = await Promise.all([listTracks(id), me === p.owner_id ? listShares(id) : Promise.resolve([]), me === p.owner_id ? listListens(id) : Promise.resolve([])]);
      setTracks(t);
      onTracks?.(t);
      setShares(s);
      setListens(l);
      if (t.length || p.owner_id) void loadProfiles([p.owner_id, ...l.map((x) => x.listener_id).filter(Boolean) as string[]]);
    } catch (e) {
      toast(String((e as Error).message ?? e), "error");
      setProject(null);
    }
  }, [id, me, onTracks]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const doUpload = async (files: FileList | File[]) => {
    const all = [...files];
    const list = all.filter(isUntitledAudioFile);
    if (!list.length) {
      const hint = all[0] ? ` (got ${all[0].type || "unknown type"} · ${all[0].name || "unnamed"})` : "";
      return toast(`Drop mp3, wav, m4a, or mp4 audio${hint}`, "error");
    }
    setUpPct(0);
    try {
      await uploadMany(id, list, folder || null, (done) => setUpPct(done));
      toast(list.length === 1 ? "Track uploaded" : `${list.length} tracks uploaded`, "success");
      await reload();
    } catch (err) {
      toast(String((err as Error).message ?? err), "error");
    } finally {
      setUpPct(null);
    }
  };

  if (project === undefined) return <div className="py-20 text-center text-sm text-[#8a8478]">Loading…</div>;
  if (!project) return <div className="py-20 text-center text-sm text-[#8a8478]">Project not found.</div>;
  const mine = project.owner_id === me;
  const folders = Array.from(new Set(tracks.map((t) => t.folder).filter(Boolean) as string[])).sort();
  const visible = folderFilter === "all" ? tracks : tracks.filter((t) => (t.folder || "") === folderFilter);

  return (
    <div
      className="mx-auto max-w-2xl py-5"
      onDragOver={(e) => {
        if (!mine) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!mine) return;
        e.preventDefault();
        setDragOver(false);
        void doUpload(e.dataTransfer.files);
      }}
    >
      {dragOver && (
        <div className="pointer-events-none fixed inset-4 z-30 grid place-items-center rounded-3xl border-2 border-dashed border-[#c4a574]/60 bg-[#12100e]/80 text-sm font-semibold text-[#c4a574]">
          Drop audio to upload
        </div>
      )}

      <div className="mb-5 flex items-start gap-4">
        <div className="grid size-20 shrink-0 place-items-center rounded-2xl" style={{ background: `linear-gradient(145deg,${project.color},#12100e)` }}>
          <Disc3 className="size-8 text-white/85" />
        </div>
        <div className="min-w-0 flex-1">
          {mine ? (
            <input
              value={project.title}
              onChange={(e) => setProject({ ...project, title: e.target.value })}
              onBlur={() => void updateProject(project.id, { title: project.title })}
              className="w-full bg-transparent text-2xl font-semibold outline-none"
            />
          ) : (
            <h1 className="text-2xl font-semibold">{project.title}</h1>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#8a8478]">
            <span>{project.track_count} tracks</span>
            <span>·</span>
            <span>{fmtCount(project.listen_count)} listens</span>
            {mine && (
              <select
                value={project.visibility}
                onChange={(e) => {
                  const visibility = e.target.value as Visibility;
                  setProject({ ...project, visibility });
                  void updateProject(project.id, { visibility });
                }}
                className="rounded-full border border-white/10 bg-transparent px-2 py-0.5 text-[11px] outline-none"
              >
                <option value="private">Private</option>
                <option value="unlisted">Unlisted</option>
                <option value="public">Public</option>
              </select>
            )}
            {!mine && <span className="capitalize">· {project.visibility}</span>}
          </div>
          {mine && (
            <textarea
              value={project.note ?? ""}
              placeholder="Notes for collaborators…"
              onChange={(e) => setProject({ ...project, note: e.target.value })}
              onBlur={() => void updateProject(project.id, { note: project.note })}
              className="mt-2 w-full resize-none rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-xs text-[#cfc8ba] outline-none"
              rows={2}
            />
          )}
          {!mine && project.note && <p className="mt-2 text-xs text-[#8a8478]">{project.note}</p>}
        </div>
      </div>

      {mine && (
        <div className="mb-4 space-y-2">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-full bg-[#c4a574] px-3.5 py-2 text-xs font-semibold text-black">
              <Upload className="size-3.5" /> Upload
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*,video/mp4,video/*,audio/mp4,.mp3,.wav,.flac,.m4a,.mp4,.aac,.ogg,.opus,.webm,.caf,application/octet-stream"
              multiple
              className="hidden"
              onChange={(e) => {
                const f = e.target.files;
                e.target.value = "";
                if (f?.length) void doUpload(f);
              }}
            />
            <input
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="Folder for new uploads"
              className="min-w-[10rem] flex-1 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs outline-none"
            />
            <div className="flex gap-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    setProject({ ...project, color: c });
                    void updateProject(project.id, { color: c });
                  }}
                  className={cn("size-7 rounded-full ring-2", project.color === c ? "ring-white" : "ring-transparent")}
                  style={{ background: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
            <button
              onClick={async () => {
                if (!confirm("Delete this project and all tracks?")) return;
                if (await deleteProject(project.id)) {
                  toast("Project deleted");
                  untitledHome();
                }
              }}
              className="ml-auto inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-2 text-xs text-[#b07a8a]"
            >
              <Trash2 className="size-3.5" /> Delete
            </button>
          </div>
          <p className="text-[11px] text-[#8a8478]">Drag & drop audio anywhere on this project, or pick multiple files.</p>
        </div>
      )}

      {upPct != null && (
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-[#c4a574]" style={{ width: `${Math.round(upPct * 100)}%` }} />
        </div>
      )}

      <div className="mb-3 flex gap-1 border-b border-white/5">
        {(mine ? (["tracks", "share", "activity"] as ProjectTab[]) : (["tracks"] as ProjectTab[])).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("px-3 py-2 text-xs font-semibold capitalize", tab === t ? "border-b-2 border-[#c4a574] text-[#c4a574]" : "text-[#8a8478]")}>
            {t}
          </button>
        ))}
      </div>

      {tab === "tracks" && (
        <div className="space-y-3">
          {(folders.length > 0 || mine) && (
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setFolderFilter("all")} className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", folderFilter === "all" ? "bg-[#c4a574] text-black" : "bg-white/5 text-[#8a8478]")}>
                All
              </button>
              {folders.map((f) => (
                <button key={f} onClick={() => setFolderFilter(f)} className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold", folderFilter === f ? "bg-[#c4a574] text-black" : "bg-white/5 text-[#8a8478]")}>
                  <FolderOpen className="size-3" /> {f}
                </button>
              ))}
            </div>
          )}

          {visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 px-4 py-12 text-center text-sm text-[#8a8478]">
              {mine ? "No tracks yet — upload or drop audio here." : "No tracks yet."}
            </div>
          ) : (
            <div className="space-y-1">
              {visible.map((t) => (
                <div key={t.id} className="group flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-white/[0.04]">
                  <button onClick={() => void playTrack(project.id, t, tracks)} className="grid size-9 place-items-center rounded-full bg-white/5 text-[#c4a574]">
                    <Play className="size-3.5 fill-current" />
                  </button>
                  <div className="min-w-0 flex-1">
                    {mine ? (
                      <input
                        defaultValue={t.title}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== t.title) void renameTrack(t.id, v).then(reload);
                        }}
                        className="w-full truncate bg-transparent text-sm font-medium outline-none"
                      />
                    ) : (
                      <div className="truncate text-sm font-medium">{t.title}</div>
                    )}
                    <div className="text-[11px] text-[#8a8478]">
                      {t.position} · {fmtDur(t.duration)} · {fmtBytes(t.bytes)} · v{t.version}
                      {t.folder ? ` · ${t.folder}` : ""} · {fmtCount(t.listen_count)} listens
                    </div>
                  </div>
                  {mine && (
                    <div className="flex items-center gap-0.5 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
                      <button onClick={() => void moveTrack(project.id, t.id, -1).then(reload)} className="rounded p-1 hover:bg-white/5" aria-label="Move up">
                        <ChevronUp className="size-3.5 text-[#8a8478]" />
                      </button>
                      <button onClick={() => void moveTrack(project.id, t.id, 1).then(reload)} className="rounded p-1 hover:bg-white/5" aria-label="Move down">
                        <ChevronDown className="size-3.5 text-[#8a8478]" />
                      </button>
                      <button
                        onClick={() => {
                          const name = prompt("Folder name (empty to clear)", t.folder ?? "");
                          if (name === null) return;
                          void setTrackFolder(t.id, name).then(reload);
                        }}
                        className="rounded p-1 hover:bg-white/5"
                        aria-label="Set folder"
                      >
                        <FolderOpen className="size-3.5 text-[#8a8478]" />
                      </button>
                      <button
                        onClick={() => {
                          replaceRef.current.track = t;
                          replaceRef.current.input?.click();
                        }}
                        className="rounded p-1 hover:bg-white/5"
                        title="Replace audio (keeps title, adds version)"
                      >
                        <RefreshCw className="size-3.5 text-[#8a8478]" />
                      </button>
                      <button
                        onClick={async () => {
                          const versions = await listTrackVersions(t.id);
                          setVersionsFor({ track: t, versions });
                        }}
                        className="rounded p-1 hover:bg-white/5"
                        aria-label="Version history"
                      >
                        <History className="size-3.5 text-[#8a8478]" />
                      </button>
                      <button
                        onClick={async () => {
                          const url = await trackUrl(t.path, t.title);
                          if (url) window.open(url, "_blank");
                        }}
                        className="rounded p-1 hover:bg-white/5"
                        aria-label="Download"
                      >
                        <Download className="size-3.5 text-[#8a8478]" />
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm("Remove this track?")) return;
                          if (await removeTrack(t)) await reload();
                        }}
                        className="rounded p-1 hover:bg-white/5"
                      >
                        <Trash2 className="size-3.5 text-[#8a8478]" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <input
            ref={(el) => {
              replaceRef.current.input = el;
            }}
            type="file"
            accept="audio/*,video/mp4,video/*,audio/mp4,.mp3,.wav,.flac,.m4a,.mp4,.aac,.ogg,.opus,.webm,.caf,application/octet-stream"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              const track = replaceRef.current.track;
              e.target.value = "";
              if (!f || !track) return;
              if (!isUntitledAudioFile(f)) {
                toast(`Pick mp3, wav, m4a, or mp4 audio (got ${f.type || "unknown type"})`, "error");
                return;
              }
              setUpPct(0);
              try {
                await replaceTrackAudio(track, f, setUpPct);
                toast(`Updated to v${track.version + 1}`, "success");
                await reload();
              } catch (err) {
                toast(String((err as Error).message ?? err), "error");
              } finally {
                setUpPct(null);
              }
            }}
          />

          {versionsFor && (
            <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4" onClick={() => setVersionsFor(null)}>
              <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#1a1714] p-4" onClick={(e) => e.stopPropagation()}>
                <div className="mb-3 text-sm font-semibold">Versions · {versionsFor.track.title}</div>
                <div className="mb-2 text-xs text-[#8a8478]">Current v{versionsFor.track.version}</div>
                {versionsFor.versions.length === 0 ? (
                  <p className="text-sm text-[#8a8478]">No previous versions yet. Replace audio to start a history.</p>
                ) : (
                  <div className="max-h-60 space-y-1 overflow-y-auto">
                    {versionsFor.versions.map((v) => (
                      <div key={v.id} className="flex items-center gap-2 rounded-xl border border-white/5 px-3 py-2 text-sm">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">v{v.version}</div>
                          <div className="text-[11px] text-[#8a8478]">
                            {fmtDur(v.duration)} · {fmtBytes(v.bytes)} · {new Date(v.created_at).toLocaleString()}
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            if (await restoreTrackVersion(versionsFor.track, v)) {
                              toast("Version restored", "success");
                              setVersionsFor(null);
                              await reload();
                            }
                          }}
                          className="rounded-full bg-[#c4a574] px-2.5 py-1 text-[11px] font-semibold text-black"
                        >
                          Restore
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={() => setVersionsFor(null)} className="mt-3 w-full rounded-full border border-white/10 py-2 text-xs font-semibold">
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "share" && mine && <SharePanel projectId={project.id} shares={shares} onChange={reload} />}
      {tab === "activity" && mine && <ActivityPanel listens={listens} tracks={tracks} />}
    </div>
  );
}

function SharePanel({ projectId, shares, onChange }: { projectId: string; shares: UntitledShare[]; onChange: () => void }) {
  const [permission, setPermission] = useState<SharePermission>("listen");
  const [password, setPassword] = useState("");
  const [hours, setHours] = useState<number | "">("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="mb-3 text-sm font-semibold">Create share link</div>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-[11px] text-[#8a8478]">
            Permission
            <select value={permission} onChange={(e) => setPermission(e.target.value as SharePermission)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#12100e] px-3 py-2 text-sm outline-none">
              <option value="listen">Listen only</option>
              <option value="download">Listen + download</option>
            </select>
          </label>
          <label className="text-[11px] text-[#8a8478]">
            Password (optional)
            <input value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#12100e] px-3 py-2 text-sm outline-none" placeholder="None" />
          </label>
          <label className="text-[11px] text-[#8a8478]">
            Expires in hours
            <input
              value={hours}
              onChange={(e) => setHours(e.target.value ? Number(e.target.value) : "")}
              type="number"
              min={1}
              className="mt-1 w-full rounded-xl border border-white/10 bg-[#12100e] px-3 py-2 text-sm outline-none"
              placeholder="Never"
            />
          </label>
        </div>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const s = await createShare(projectId, { permission, password, expiresInHours: hours || null });
              await navigator.clipboard.writeText(shareUrl(s.token));
              toast("Share link copied", "success");
              setPassword("");
              onChange();
            } catch (e) {
              toast(String((e as Error).message ?? e), "error");
            } finally {
              setBusy(false);
            }
          }}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#c4a574] px-4 py-2 text-xs font-semibold text-black"
        >
          <Link2 className="size-3.5" /> Create & copy link
        </button>
      </div>

      <div className="space-y-2">
        {shares.length === 0 ? (
          <p className="py-6 text-center text-sm text-[#8a8478]">No active share links.</p>
        ) : (
          shares.map((s) => (
            <div key={s.id} className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Share2 className="size-4 text-[#c4a574]" />
                <code className="text-xs text-[#cfc8ba]">{s.token.slice(0, 10)}…</code>
                {s.pass_hash && <Lock className="size-3.5 text-[#8a8478]" />}
                <select
                  value={s.permission}
                  onChange={(e) => void updateSharePermission(s.id, e.target.value as SharePermission).then(onChange)}
                  className="rounded-full border border-white/10 bg-transparent px-2 py-0.5 text-[11px] outline-none"
                >
                  <option value="listen">Listen</option>
                  <option value="download">Download</option>
                </select>
                <span className="text-[11px] text-[#8a8478]">
                  <Eye className="mr-0.5 inline size-3" />
                  {s.views} · {s.listens} listens
                </span>
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(shareUrl(s.token));
                    toast("Link copied", "success");
                  }}
                  className="ml-auto rounded-full p-1.5 hover:bg-white/5"
                >
                  <Copy className="size-3.5" />
                </button>
                <button
                  onClick={async () => {
                    if (await revokeShare(s.id)) {
                      toast("Link revoked");
                      onChange();
                    }
                  }}
                  className="rounded-full p-1.5 text-[#b07a8a] hover:bg-white/5"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              {s.expires_at && <div className="mt-1 text-[10px] text-[#8a8478]">Expires {new Date(s.expires_at).toLocaleString()}</div>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ActivityPanel({ listens, tracks }: { listens: UntitledListen[]; tracks: UntitledTrack[] }) {
  const profiles = useApp((s) => s.profiles);
  const trackTitle = (id: string | null) => tracks.find((t) => t.id === id)?.title ?? "Project";
  if (!listens.length) return <p className="py-8 text-center text-sm text-[#8a8478]">No listens yet — share a link to see who plays your drafts.</p>;
  return (
    <div className="space-y-2">
      {listens.map((l) => {
        const p = l.listener_id ? profiles[l.listener_id] : null;
        return (
          <div key={l.id} className="flex items-center gap-3 rounded-xl border border-white/5 px-3 py-2 text-sm">
            {l.listener_id ? <Avatar userId={l.listener_id} size={28} /> : <div className="grid size-7 place-items-center rounded-full bg-white/5 text-[10px]">?</div>}
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{p ? `@${p.username}` : l.guest_name || "Anonymous"}</div>
              <div className="truncate text-[11px] text-[#8a8478]">
                {trackTitle(l.track_id)} · {new Date(l.created_at).toLocaleString()}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProfileView({ username }: { username: string }) {
  const me = useApp((s) => s.userId);
  const profiles = useApp((s) => s.profiles);
  const [p, setP] = useState<UntitledProfile | null | undefined>(undefined);
  const [list, setList] = useState<{ which: "followers" | "following"; ids: string[] } | null>(null);

  const load = useCallback(() => {
    void loadUntitledProfile(username)
      .then(setP)
      .catch((e) => {
        toast(String(e.message ?? e), "error");
        setP(null);
      });
  }, [username]);
  useEffect(() => load(), [load]);

  if (p === undefined) return <div className="py-20 text-center text-sm text-[#8a8478]">Loading…</div>;
  if (!p) return <div className="py-20 text-center text-sm text-[#8a8478]">Profile not found.</div>;
  const mine = p.id === me;

  return (
    <div className="mx-auto max-w-2xl py-6">
      <div className="flex items-start gap-4">
        <Avatar userId={p.id} size={88} />
        <div className="min-w-0 flex-1">
          <div className="text-xl font-semibold">{p.display_name}</div>
          <div className="text-sm text-[#8a8478]">@{p.username}{p.follows_you && !mine ? " · follows you" : ""}</div>
          <div className="mt-3 flex gap-6 text-center">
            <button
              className="hover:opacity-80"
              onClick={async () => setList({ which: "followers", ids: await untitledFollowList(p.id, "followers") })}
            >
              <div className="text-lg font-semibold">{fmtCount(p.followers)}</div>
              <div className="text-[10px] tracking-wide text-[#8a8478] uppercase">Followers</div>
            </button>
            <button
              className="hover:opacity-80"
              onClick={async () => setList({ which: "following", ids: await untitledFollowList(p.id, "following") })}
            >
              <div className="text-lg font-semibold">{fmtCount(p.following)}</div>
              <div className="text-[10px] tracking-wide text-[#8a8478] uppercase">Following</div>
            </button>
            <div>
              <div className="text-lg font-semibold">{p.projects.length}</div>
              <div className="text-[10px] tracking-wide text-[#8a8478] uppercase">Projects</div>
            </div>
          </div>
          {p.bio && <p className="mt-3 text-sm text-[#cfc8ba]">{p.bio}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {mine ? (
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(profileUrl(p.username));
                  toast("Profile link copied", "success");
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3.5 py-2 text-xs font-semibold"
              >
                <Copy className="size-3.5" /> Share profile
              </button>
            ) : (
              <button
                onClick={async () => {
                  const on = !p.is_following;
                  if (await setUntitledFollow(p.id, on)) setP({ ...p, is_following: on, followers: p.followers + (on ? 1 : -1) });
                }}
                className={cn("inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold", p.is_following ? "border border-white/10" : "bg-[#c4a574] text-black")}
              >
                <UserPlus className="size-3.5" />
                {p.is_following ? "Following" : p.follows_you ? "Follow back" : "Follow"}
              </button>
            )}
          </div>
        </div>
      </div>

      <h2 className="mt-8 mb-3 text-sm font-semibold tracking-wide text-[#cfc8ba]">{mine ? "Your projects" : "Public projects"}</h2>
      {p.projects.length === 0 ? (
        <p className="text-sm text-[#8a8478]">No public projects yet.</p>
      ) : (
        <div className="space-y-2">
          {p.projects.map((pr) => (
            <button key={pr.id} onClick={() => untitledGo({ view: "project", id: pr.id })} className="flex w-full items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-3 text-left hover:bg-white/[0.05]">
              <span className="grid size-11 place-items-center rounded-xl" style={{ background: pr.color }}>
                <Headphones className="size-4 text-black/70" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{pr.title}</span>
                <span className="block text-xs text-[#8a8478]">
                  {pr.track_count} tracks · {fmtCount(pr.listen_count)} listens · {pr.visibility}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {list && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4" onClick={() => setList(null)}>
          <div className="max-h-[70vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-white/10 bg-[#1a1714] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-sm font-semibold capitalize">{list.which}</div>
            {list.ids.length === 0 ? (
              <p className="text-sm text-[#8a8478]">Nobody here yet.</p>
            ) : (
              <div className="space-y-1">
                {list.ids.map((id) => {
                  const u = profiles[id];
                  return (
                    <button
                      key={id}
                      onClick={() => {
                        setList(null);
                        if (u) untitledGo({ view: "profile", username: u.username });
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/5"
                    >
                      <Avatar userId={id} size={36} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{u?.display_name ?? "User"}</span>
                        <span className="block text-xs text-[#8a8478]">@{u?.username ?? "…"}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            <button onClick={() => setList(null)} className="mt-3 w-full rounded-full border border-white/10 py-2 text-xs font-semibold">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Explore() {
  const [list, setList] = useState<UntitledProject[] | null>(null);
  useEffect(() => {
    void explorePublic()
      .then(async (rows) => {
        setList(rows);
        await loadProfiles(rows.map((r) => r.owner_id));
      })
      .catch((e) => toast(String(e.message ?? e), "error"));
  }, []);
  const profiles = useApp((s) => s.profiles);

  return (
    <div className="mx-auto max-w-2xl py-6">
      <div className="mb-6 flex items-center gap-2">
        <Users className="size-5 text-[#c4a574]" />
        <h1 className="text-xl font-semibold">Explore public projects</h1>
      </div>
      {list === null ? (
        <div className="py-16 text-center text-sm text-[#8a8478]">Loading…</div>
      ) : list.length === 0 ? (
        <p className="text-sm text-[#8a8478]">Nothing public yet — set a project to Public to appear here.</p>
      ) : (
        <div className="space-y-2">
          {list.map((p) => {
            const owner = profiles[p.owner_id];
            return (
              <button key={p.id} onClick={() => untitledGo({ view: "project", id: p.id })} className="flex w-full items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-3 text-left hover:bg-white/[0.05]">
                <span className="grid size-12 place-items-center rounded-xl" style={{ background: p.color }}>
                  <Headphones className="size-5 text-black/70" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.title}</span>
                  <span className="block text-xs text-[#8a8478]">
                    {owner ? `@${owner.username}` : "artist"} · {p.track_count} tracks · {fmtCount(p.listen_count)} listens
                  </span>
                </span>
                {owner && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      untitledGo({ view: "profile", username: owner.username });
                    }}
                    className="text-[11px] font-semibold text-[#c4a574]"
                  >
                    Profile
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
