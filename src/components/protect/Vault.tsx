"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckSquare,
  Copy,
  Download,
  Eye,
  FolderOpen,
  Link2,
  Lock,
  Music2,
  Pause,
  Pencil,
  Play,
  Square,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast, openModal } from "@/store/app";
import { useMyTier, needPlan } from "@/lib/premium";
import { cn } from "@/lib/utils";
import {
  createShare,
  fmtBytes,
  fmtDuration,
  guessVaultKind,
  listShares,
  listVault,
  removeVault,
  removeVaultMany,
  revokeShare,
  shareLink,
  updateVault,
  uploadVault,
  VAULT_KINDS,
  vaultIsUnlimited,
  vaultLimitLabel,
  vaultUrl,
  vaultUsage,
  type VaultFile,
  type VaultKind,
  type VaultShare,
} from "@/lib/protect";

const EXPIRY: [string, number | null][] = [
  ["1 hour", 1],
  ["1 day", 24],
  ["7 days", 168],
  ["30 days", 720],
  ["Never", null],
];

type Filter = "all" | "music" | "stems" | "media" | "docs";
type Sort = "newest" | "name" | "size" | "duration" | "kind";

const kindMeta = (k?: VaultKind | null) => VAULT_KINDS.find((x) => x.id === (k || "file")) ?? VAULT_KINDS[VAULT_KINDS.length - 1]!;
const isAudio = (f: VaultFile) => !!(f.mime?.startsWith("audio/") || /\.(mp3|wav|flac|aiff?|m4a|ogg|aac)$/i.test(f.name));
const isVideo = (f: VaultFile) => !!(f.mime?.startsWith("video/") || /\.(mp4|mov|webm|mkv)$/i.test(f.name));
const isImage = (f: VaultFile) => !!(f.mime?.startsWith("image/"));
const isDoc = (f: VaultFile) => !!(f.mime?.includes("pdf") || /\.(pdf|docx?|txt|rtf)$/i.test(f.name) || f.kind === "contract");
const displayName = (f: VaultFile) => (f.title?.trim() || f.name);
const icon = (f: VaultFile) => {
  if (f.kind && f.kind !== "file") return kindMeta(f.kind).emoji;
  if (isAudio(f)) return "🎵";
  if (isVideo(f)) return "🎬";
  if (isImage(f)) return "🖼️";
  if (isDoc(f)) return "📕";
  if (f.mime?.includes("zip")) return "🗜️";
  return "📄";
};

function matchFilter(f: VaultFile, filter: Filter) {
  if (filter === "all") return true;
  if (filter === "music") return isAudio(f) && f.kind !== "stem";
  if (filter === "stems") return f.kind === "stem" || (isAudio(f) && /stem|drum|bass|vocal|guitar|synth/i.test(f.name));
  if (filter === "media") return isVideo(f) || isImage(f) || f.kind === "artwork" || f.kind === "video";
  if (filter === "docs") return isDoc(f);
  return true;
}

function sortFiles(a: VaultFile, b: VaultFile, sort: Sort) {
  if (sort === "name") return displayName(a).localeCompare(displayName(b));
  if (sort === "size") return b.bytes - a.bytes;
  if (sort === "duration") return (b.duration_ms ?? 0) - (a.duration_ms ?? 0);
  if (sort === "kind") return (a.kind || "file").localeCompare(b.kind || "file") || displayName(a).localeCompare(displayName(b));
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

/** My Vault — private storage for music masters, stems, artwork & share links */
export default function Vault() {
  const tier = useMyTier();
  const [files, setFiles] = useState<VaultFile[] | null>(null);
  const [shares, setShares] = useState<VaultShare[]>([]);
  const [usage, setUsage] = useState({ used: 0, limit: 1073741824, files: 0 });
  const [folder, setFolder] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [ups, setUps] = useState<{ name: string; p: number }[]>([]);
  const [shareFor, setShareFor] = useState<VaultFile | null>(null);
  const [editFor, setEditFor] = useState<VaultFile | null>(null);
  const [preview, setPreview] = useState<{ f: VaultFile; url: string } | null>(null);
  const [playing, setPlaying] = useState<{ id: string; url: string } | null>(null);
  const [playProg, setPlayProg] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState(false);
  const [uploadKind, setUploadKind] = useState<VaultKind | "auto">("auto");
  const [uploadArtist, setUploadArtist] = useState("");
  const pick = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(async () => {
    const [f, s, u] = await Promise.all([listVault(), listShares(), vaultUsage()]);
    setFiles(f);
    setShares(s);
    setUsage(u);
  }, []);
  useEffect(() => void load(), [load]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setPlayProg(a.duration ? a.currentTime / a.duration : 0);
    const onEnd = () => {
      setPlaying(null);
      setPlayProg(0);
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnd);
    };
  }, [playing?.url]);

  const folders = useMemo(() => [...new Set((files ?? []).map((f) => f.folder).filter(Boolean))].sort(), [files]);
  const musicBytes = useMemo(() => (files ?? []).filter(isAudio).reduce((n, f) => n + f.bytes, 0), [files]);
  const musicCount = useMemo(() => (files ?? []).filter(isAudio).length, [files]);
  const shown = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return (files ?? [])
      .filter((f) => (!folder || f.folder === folder) && matchFilter(f, filter))
      .filter(
        (f) =>
          !qq ||
          f.name.toLowerCase().includes(qq) ||
          (f.title || "").toLowerCase().includes(qq) ||
          (f.artist || "").toLowerCase().includes(qq) ||
          (f.note || "").toLowerCase().includes(qq) ||
          (f.kind || "").includes(qq) ||
          (f.folder || "").toLowerCase().includes(qq),
      )
      .sort((a, b) => sortFiles(a, b, sort));
  }, [files, folder, filter, q, sort]);

  const add = async (list: FileList | File[]) => {
    for (const f of [...list]) {
      setUps((u) => [...u, { name: f.name, p: 0 }]);
      try {
        const kind = uploadKind === "auto" ? guessVaultKind(f) : uploadKind;
        await uploadVault(f, folder, (p) => setUps((u) => u.map((x) => (x.name === f.name ? { ...x, p } : x))), {
          kind,
          artist: uploadArtist.trim() || undefined,
          title: f.name.replace(/\.[^.]+$/, "").slice(0, 200),
        });
      } catch (e) {
        toast(`${f.name}: ${(e as Error).message}`, "error");
      }
      setUps((u) => u.filter((x) => x.name !== f.name));
    }
    void load();
  };

  const togglePlay = async (f: VaultFile) => {
    if (!isAudio(f)) return;
    if (playing?.id === f.id) {
      audioRef.current?.pause();
      setPlaying(null);
      setPlayProg(0);
      return;
    }
    const url = await vaultUrl(f);
    if (!url) return toast("Couldn't open preview", "error");
    setPlaying({ id: f.id, url });
    setPlayProg(0);
    requestAnimationFrame(() => {
      const a = audioRef.current;
      if (!a) return;
      a.src = url;
      void a.play().catch(() => toast("Playback blocked — try Preview", "error"));
    });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const selectAllShown = () => {
    if (selected.size === shown.length) setSelected(new Set());
    else setSelected(new Set(shown.map((f) => f.id)));
  };

  const bulkDelete = async () => {
    const list = (files ?? []).filter((f) => selected.has(f.id));
    if (!list.length) return;
    if (!confirm(`Delete ${list.length} file${list.length > 1 ? "s" : ""} forever? Share links will stop working.`)) return;
    if (playing && selected.has(playing.id)) {
      audioRef.current?.pause();
      setPlaying(null);
    }
    if (await removeVaultMany(list)) {
      setSelected(new Set());
      void load();
    }
  };

  const bulkMove = async () => {
    const list = (files ?? []).filter((f) => selected.has(f.id));
    if (!list.length) return;
    const n = prompt("Move selected to folder (empty = none)", folder);
    if (n === null) return;
    const dest = n.trim().slice(0, 100);
    for (const f of list) await updateVault(f.id, { folder: dest });
    setSelected(new Set());
    void load();
  };

  const unlimited = vaultIsUnlimited(usage.limit);
  const pct = unlimited ? Math.min(12, usage.used > 0 ? 8 : 0) : Math.min(100, (usage.used / Math.max(1, usage.limit)) * 100);
  const FILTERS: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "music", label: "Music" },
    { id: "stems", label: "Stems" },
    { id: "media", label: "Media" },
    { id: "docs", label: "Docs" },
  ];

  return (
    <div className="space-y-4">
      <audio ref={audioRef} preload="none" className="hidden" />

      <div className="overflow-hidden rounded-3xl p-5 text-white" style={{ background: "linear-gradient(135deg,#0f172a,#1e3a5f 45%,#0ea5e9 120%)" }}>
        <div className="flex items-center gap-2 text-xs font-bold tracking-widest text-white/70 uppercase">
          <Lock className="size-4" /> Nexus Drive
        </div>
        <div className="mt-1 text-2xl font-black">Private cloud · all formats</div>
        <p className="mt-1 max-w-2xl text-sm text-white/80">
          Google Drive–clean layout with Proton-style private share links. Upload any file type, preview media, and share with expiry, password, or download caps.
        </p>
        <div className="mt-4">
          <div className="flex flex-wrap justify-between gap-2 text-xs font-semibold text-white/80">
            <span>
              {fmtBytes(usage.used)}
              {unlimited ? " · Unlimited storage" : ` of ${vaultLimitLabel(usage.limit)}`} · {usage.files} files
              {musicCount > 0 && (
                <span className="text-white/60">
                  {" "}
                  · {musicCount} audio · {fmtBytes(musicBytes)}
                </span>
              )}
            </span>
            {!unlimited && tier < 4 && (
              <button onClick={() => openModal("premium", needPlan(tier + 1).id)} className="underline">
                Get more space
              </button>
            )}
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/15">
            <div className={cn("h-full rounded-full", pct > 90 ? "bg-[#ff6b6b]" : "bg-white")} style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {playing && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3">
          <button
            onClick={() => {
              audioRef.current?.pause();
              setPlaying(null);
              setPlayProg(0);
            }}
            className="grid size-10 place-items-center rounded-full bg-accent text-white"
            aria-label="Pause"
          >
            <Pause className="size-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold">{displayName((files ?? []).find((x) => x.id === playing.id) ?? ({ name: "Playing…" } as VaultFile))}</div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/30">
              <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${playProg * 100}%` }} />
            </div>
          </div>
          <Music2 className="size-4 text-accent" />
        </div>
      )}

      <div
        onDragOver={(e) => (e.preventDefault(), setDrag(true))}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files?.length) void add(e.dataTransfer.files);
        }}
        className={cn("rounded-2xl border-2 border-dashed p-5 text-center transition", drag ? "border-accent bg-accent/10" : "border-line")}
      >
        <input
          ref={pick}
          type="file"
          multiple
          accept="*/*"
          hidden
          onChange={(e) => (e.target.files?.length && void add(e.target.files), (e.target.value = ""))}
        />
        <div className="mb-3 flex flex-wrap items-center justify-center gap-2 text-left">
          <label className="text-xs text-sub">
            Upload as{" "}
            <select value={uploadKind} onChange={(e) => setUploadKind(e.target.value as VaultKind | "auto")} className="ml-1 rounded-full border border-line bg-side px-2 py-1 text-xs text-txt outline-none">
              <option value="auto">Auto-detect</option>
              {VAULT_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.emoji} {k.label}
                </option>
              ))}
            </select>
          </label>
          <input
            value={uploadArtist}
            onChange={(e) => setUploadArtist(e.target.value.slice(0, 120))}
            placeholder="Artist credit (optional)"
            className="min-w-[10rem] flex-1 rounded-full border border-line bg-transparent px-3 py-1.5 text-xs outline-none focus:border-accent"
          />
        </div>
        <button onClick={() => pick.current?.click()} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-white">
          <Upload className="size-4" /> Upload files
        </button>
        <p className="mt-2 text-xs text-sub">
          or drop them here{folder ? ` — into “${folder}”` : ""} · any format · unlimited storage · private share links
        </p>
        {ups.map((u) => (
          <div key={u.name} className="mx-auto mt-2 max-w-md text-left text-xs">
            <div className="truncate">{u.name}</div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-black/30">
              <div className="h-full bg-accent transition-all" style={{ width: `${u.p * 100}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search title, artist, note, folder…"
          className="min-w-0 flex-1 rounded-full border border-line bg-transparent px-4 py-2 text-sm outline-none focus:border-accent"
        />
        <select value={folder} onChange={(e) => setFolder(e.target.value)} className="rounded-full border border-line bg-side px-3 py-2 text-sm outline-none">
          <option value="">All folders</option>
          {folders.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-full border border-line bg-side px-3 py-2 text-sm outline-none">
          <option value="newest">Newest</option>
          <option value="name">Name</option>
          <option value="size">Size</option>
          <option value="duration">Duration</option>
          <option value="kind">Kind</option>
        </select>
        <button
          onClick={() => {
            const n = prompt("New folder name");
            if (n?.trim()) setFolder(n.trim().slice(0, 100));
          }}
          className="flex items-center gap-1 rounded-full bg-hover px-3 py-2 text-sm font-semibold hover:bg-active"
        >
          <FolderOpen className="size-4" /> New folder
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn("rounded-full px-3 py-1.5 text-xs font-bold transition", filter === f.id ? "bg-accent text-white" : "bg-hover text-sub hover:bg-active hover:text-txt")}
          >
            {f.label}
          </button>
        ))}
        {shown.length > 0 && (
          <button onClick={selectAllShown} className="ml-auto flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-sub hover:bg-hover hover:text-txt">
            {selected.size === shown.length ? <CheckSquare className="size-3.5" /> : <Square className="size-3.5" />}
            {selected.size ? `${selected.size} selected` : "Select"}
          </button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line/70 bg-hover/40 px-3 py-2 text-sm">
          <span className="font-semibold">{selected.size} selected</span>
          <button onClick={() => void bulkMove()} className="rounded-full bg-side px-3 py-1.5 text-xs font-bold hover:bg-active">
            Move to folder
          </button>
          <button onClick={() => void bulkDelete()} className="rounded-full bg-dnd/15 px-3 py-1.5 text-xs font-bold text-dnd">
            Delete
          </button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-sub hover:text-txt">
            Clear
          </button>
        </div>
      )}

      {files === null ? (
        <p className="text-sm text-sub">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-sub">{files.length ? "Nothing matches." : "Your vault is empty — upload your first master or stem."}</p>
      ) : (
        <div className="divide-y divide-line/60 overflow-hidden rounded-2xl border border-line/70">
          {shown.map((f) => {
            const live = shares.filter((s) => s.file_id === f.id && !s.revoked);
            const on = playing?.id === f.id;
            const km = kindMeta(f.kind);
            return (
              <div key={f.id} className={cn("flex flex-wrap items-center gap-3 p-3 hover:bg-white/[.02]", selected.has(f.id) && "bg-accent/5")}>
                <button
                  onClick={() => toggleSelect(f.id)}
                  className={cn("grid size-7 shrink-0 place-items-center rounded-md border", selected.has(f.id) ? "border-accent bg-accent text-white" : "border-line text-sub")}
                  aria-label={selected.has(f.id) ? "Deselect" : "Select"}
                >
                  {selected.has(f.id) ? <CheckSquare className="size-3.5" /> : <Square className="size-3.5" />}
                </button>
                {isAudio(f) ? (
                  <button
                    onClick={() => void togglePlay(f)}
                    className={cn("grid size-10 shrink-0 place-items-center rounded-xl text-lg transition", on ? "bg-accent text-white" : "bg-hover hover:bg-active")}
                    aria-label={on ? "Pause" : "Play"}
                  >
                    {on ? <Pause className="size-4" /> : <Play className="size-4 ml-0.5" />}
                  </button>
                ) : (
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-hover text-xl">{icon(f)}</span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <div className="truncate text-sm font-semibold">{displayName(f)}</div>
                    <span className="shrink-0 rounded-full bg-hover px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sub">
                      {km.emoji} {km.label}
                    </span>
                  </div>
                  <div className="truncate text-xs text-sub">
                    {f.artist && <span className="text-txt/80">{f.artist} · </span>}
                    {fmtBytes(f.bytes)}
                    {f.duration_ms ? ` · ${fmtDuration(f.duration_ms)}` : ""}
                    {" · "}
                    {new Date(f.created_at).toLocaleDateString([], { dateStyle: "medium" })}
                    {f.folder && ` · 📁 ${f.folder}`}
                    {f.note && ` · ${f.note.slice(0, 40)}${f.note.length > 40 ? "…" : ""}`}
                    {live.length > 0 && (
                      <span className="text-accent">
                        {" "}
                        · 🔗 {live.length} link{live.length > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  {on && (
                    <div className="mt-1.5 h-1 max-w-xs overflow-hidden rounded-full bg-black/30">
                      <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${playProg * 100}%` }} />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {/^(audio|video|image)\/|pdf/.test(f.mime ?? "") && (
                    <IconBtn
                      label="Preview"
                      onClick={async () => {
                        const url = await vaultUrl(f);
                        if (url) setPreview({ f, url });
                      }}
                    >
                      <Eye className="size-4" />
                    </IconBtn>
                  )}
                  <IconBtn
                    label="Edit details"
                    onClick={() => setEditFor(f)}
                  >
                    <Pencil className="size-4" />
                  </IconBtn>
                  <IconBtn
                    label="Download"
                    onClick={async () => {
                      const url = await vaultUrl(f, true);
                      if (url) window.location.href = url;
                    }}
                  >
                    <Download className="size-4" />
                  </IconBtn>
                  <IconBtn label="Share link" onClick={() => setShareFor(f)} accent>
                    <Link2 className="size-4" />
                  </IconBtn>
                  <IconBtn
                    label="Move to folder"
                    onClick={async () => {
                      const n = prompt("Folder (empty = none)", f.folder);
                      if (n !== null && (await updateVault(f.id, { folder: n.trim().slice(0, 100) }))) void load();
                    }}
                  >
                    <FolderOpen className="size-4" />
                  </IconBtn>
                  <IconBtn
                    label="Delete"
                    danger
                    onClick={async () => {
                      if (confirm(`Delete “${displayName(f)}” forever? Its share links stop working.`) && (await removeVault(f))) {
                        if (playing?.id === f.id) {
                          audioRef.current?.pause();
                          setPlaying(null);
                        }
                        void load();
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </IconBtn>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editFor && (
        <EditDialog
          f={editFor}
          onClose={() => setEditFor(null)}
          onSaved={() => {
            setEditFor(null);
            void load();
          }}
        />
      )}
      {shareFor && <ShareDialog f={shareFor} shares={shares.filter((s) => s.file_id === shareFor.id)} onClose={() => setShareFor(null)} onChange={load} />}
      {preview && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/85 p-4" onClick={() => setPreview(null)}>
          <div className="w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2 text-white">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{displayName(preview.f)}</div>
                {(preview.f.artist || preview.f.duration_ms) && (
                  <div className="truncate text-xs text-white/70">
                    {[preview.f.artist, preview.f.duration_ms ? fmtDuration(preview.f.duration_ms) : "", kindMeta(preview.f.kind).label].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
              <button onClick={() => setPreview(null)} className="grid size-9 place-items-center rounded-full bg-white/10" aria-label="Close">
                <X className="size-5" />
              </button>
            </div>
            {preview.f.mime?.startsWith("audio/") || isAudio(preview.f) ? (
              <div className="rounded-2xl bg-white/5 p-5">
                <div className="mb-4 flex items-center gap-3">
                  <div className="grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-[#5865f2] to-[#eb459e] text-3xl">🎵</div>
                  <div className="min-w-0">
                    <div className="truncate text-lg font-bold text-white">{displayName(preview.f)}</div>
                    <div className="text-sm text-white/70">{preview.f.artist || "Unknown artist"}</div>
                  </div>
                </div>
                <audio src={preview.url} controls autoPlay className="w-full" />
              </div>
            ) : preview.f.mime?.startsWith("video/") ? (
              <video src={preview.url} controls autoPlay className="max-h-[75vh] w-full rounded-xl bg-black" />
            ) : preview.f.mime?.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.url} alt="" className="max-h-[80vh] w-full rounded-xl object-contain" />
            ) : (
              <iframe src={preview.url} title={preview.f.name} className="h-[80vh] w-full rounded-xl bg-white" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function IconBtn({ children, label, onClick, danger, accent }: { children: React.ReactNode; label: string; onClick: () => void; danger?: boolean; accent?: boolean }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className={cn("grid size-8 place-items-center rounded-full text-sub hover:bg-hover hover:text-txt", danger && "hover:bg-dnd/15 hover:text-dnd", accent && "text-accent")}>
      {children}
    </button>
  );
}

function EditDialog({ f, onClose, onSaved }: { f: VaultFile; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(f.title || f.name.replace(/\.[^.]+$/, ""));
  const [artist, setArtist] = useState(f.artist || "");
  const [name, setName] = useState(f.name);
  const [kind, setKind] = useState<VaultKind>((f.kind as VaultKind) || guessVaultKind(new File([], f.name, { type: f.mime || "" })));
  const [note, setNote] = useState(f.note || "");
  const [folder, setFolder] = useState(f.folder || "");
  const [busy, setBusy] = useState(false);

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-chat p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate text-lg font-bold">File details</h3>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-full hover:bg-hover" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="mt-4 space-y-3 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs text-sub">Display title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 200))} className="w-full rounded-lg border border-line bg-transparent px-3 py-2 outline-none focus:border-accent" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-sub">Artist</span>
            <input value={artist} onChange={(e) => setArtist(e.target.value.slice(0, 120))} className="w-full rounded-lg border border-line bg-transparent px-3 py-2 outline-none focus:border-accent" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-sub">File name</span>
            <input value={name} onChange={(e) => setName(e.target.value.slice(0, 300))} className="w-full rounded-lg border border-line bg-transparent px-3 py-2 outline-none focus:border-accent" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-sub">Kind</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as VaultKind)} className="w-full rounded-lg border border-line bg-side px-3 py-2 outline-none">
              {VAULT_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.emoji} {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-sub">Folder</span>
            <input value={folder} onChange={(e) => setFolder(e.target.value.slice(0, 100))} placeholder="e.g. Album / Singles / Stems" className="w-full rounded-lg border border-line bg-transparent px-3 py-2 outline-none focus:border-accent" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-sub">Notes / ISRC / credits</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} rows={3} placeholder="ISRC, mix version, collaborator notes…" className="w-full resize-none rounded-lg border border-line bg-transparent px-3 py-2 outline-none focus:border-accent" />
          </label>
          {(f.duration_ms || f.bytes) && (
            <div className="text-xs text-sub">
              {f.duration_ms ? `Duration ${fmtDuration(f.duration_ms)} · ` : ""}
              {fmtBytes(f.bytes)} · {f.mime || "unknown type"}
            </div>
          )}
          <button
            disabled={busy || !name.trim()}
            onClick={async () => {
              setBusy(true);
              const ok = await updateVault(f.id, {
                name: name.trim().slice(0, 300),
                title: title.trim().slice(0, 200) || null,
                artist: artist.trim().slice(0, 120) || null,
                kind,
                folder: folder.trim().slice(0, 100),
                note: note.trim().slice(0, 500) || null,
              });
              setBusy(false);
              if (ok) {
                toast("Saved", "success");
                onSaved();
              }
            }}
            className="w-full rounded-full bg-accent py-2.5 font-bold text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save details"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ShareDialog({ f, shares, onClose, onChange }: { f: VaultFile; shares: VaultShare[]; onClose: () => void; onChange: () => void }) {
  const [exp, setExp] = useState<number | null>(168);
  const [max, setMax] = useState("");
  const [pw, setPw] = useState("");
  const [dl, setDl] = useState(true);
  const [busy, setBusy] = useState(false);
  const copy = (t: string) => void navigator.clipboard.writeText(t).then(() => toast("Link copied", "success"));
  const now = Date.now();
  const audio = isAudio(f);
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-chat p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-bold">Share “{displayName(f)}”</h3>
            <p className="text-xs text-sub">
              {kindMeta(f.kind).label}
              {f.artist ? ` · ${f.artist}` : ""}
              {f.duration_ms ? ` · ${fmtDuration(f.duration_ms)}` : ""}
              {audio ? " · streamable preview" : ""}
            </p>
          </div>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-full hover:bg-hover" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="mt-4 space-y-3 text-sm">
          <div>
            <div className="mb-1 text-xs text-sub">Link expires after</div>
            <div className="flex flex-wrap gap-1.5">
              {EXPIRY.map(([l, h]) => (
                <button key={l} onClick={() => setExp(h)} className={cn("rounded-full px-3 py-1.5 font-semibold", exp === h ? "bg-accent text-white" : "bg-hover hover:bg-active")}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs text-sub">Max downloads (empty = unlimited)</span>
              <input value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" className="w-full rounded-lg border border-line bg-transparent px-3 py-2 outline-none focus:border-accent" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-sub">Password (optional)</span>
              <input value={pw} onChange={(e) => setPw(e.target.value)} type="password" autoComplete="new-password" className="w-full rounded-lg border border-line bg-transparent px-3 py-2 outline-none focus:border-accent" />
            </label>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!dl} onChange={(e) => setDl(!e.target.checked)} className="size-4" />
            View only — people can {audio ? "stream" : "open"} it but not download
          </label>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const s = await createShare(f.id, { expiresInHours: exp, maxDownloads: max ? Number(max) : null, password: pw, download: dl });
                copy(shareLink(s));
                setPw("");
                onChange();
              } catch (e) {
                toast((e as Error).message, "error");
              }
              setBusy(false);
            }}
            className="w-full rounded-full bg-accent py-2.5 font-bold text-white disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create link & copy"}
          </button>
        </div>

        {shares.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 text-xs font-bold text-sub uppercase">Links for this file</div>
            <div className="space-y-2">
              {shares.map((s) => {
                const dead = s.revoked || (s.expires_at && new Date(s.expires_at).getTime() < now) || (s.max_downloads != null && s.downloads >= s.max_downloads);
                return (
                  <div key={s.id} className={cn("rounded-xl border border-line/70 p-2.5 text-xs", dead && "opacity-50")}>
                    <div className="flex items-center gap-2">
                      <code className="min-w-0 flex-1 truncate">/s/{s.token}</code>
                      {!dead && (
                        <>
                          <button onClick={() => copy(shareLink(s))} className="grid size-7 place-items-center rounded-full bg-hover hover:bg-active" aria-label="Copy link">
                            <Copy className="size-3.5" />
                          </button>
                          <button onClick={async () => (await revokeShare(s.id)) && onChange()} className="rounded-full bg-dnd/15 px-2.5 py-1 font-semibold text-dnd">
                            Turn off
                          </button>
                        </>
                      )}
                    </div>
                    <div className="mt-1 text-sub">
                      {s.revoked ? "Turned off" : s.expires_at ? `Expires ${new Date(s.expires_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}` : "Never expires"}
                      {" · "}
                      {s.views} views · {s.downloads}
                      {s.max_downloads ? `/${s.max_downloads}` : ""} downloads{s.pass_hash ? " · 🔑 password" : ""}
                      {!s.allow_download ? " · view only" : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
