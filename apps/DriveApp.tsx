"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CloudDownload,
  CloudOff,
  Download,
  FileAudio,
  FileText,
  FileVideo,
  Folder,
  FolderPlus,
  FolderSync,
  HardDrive,
  Image as ImageIcon,
  Link2,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Search,
  Share2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast, useApp } from "@/store/app";
import { cn } from "@/lib/utils";
import { fmtBytes, fmtDuration, listShares, listVault, removeVault, updateVault, vaultIsUnlimited, vaultLimitLabel, vaultUsage, type VaultFile, type VaultShare } from "@/lib/protect";
import { baseName, breadcrumbs, childFolders, cleanFolder, filesIn, isLossless, joinPath, parseStreamUrl, playableKind } from "@/lib/driveFolders";
import { fmtEta } from "@/lib/driveTus";
import { addFiles, cancel, clearFinished, forgetUnfinished, guardUnload, pause, pauseAll, resume, resumeAll, unfinished, useDrive } from "@/lib/driveStore";
import { deviceStorage, isOffline, offlineList, offlineSupported, removeOffline, saveOffline } from "@/lib/driveOffline";
import { addSyncFolder, listSync, removeSync, syncNow, syncSupported, type SyncEntry } from "@/lib/driveSync";
import { ShareDialog } from "@/components/protect/Vault";
import { DrivePlayer, type PlayItem } from "./DrivePlayer";

const input = "w-full rounded-xl bg-menu px-3 py-2.5 text-sm outline-none ring-1 ring-black/20 placeholder:text-sub focus:ring-accent";
const btn = "rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50";
const primary = `${btn} bg-accent text-white`;
const quiet = `${btn} bg-hover`;

type Tab = "files" | "transfers" | "offline" | "stream" | "sync";
type Sort = "new" | "name" | "size";

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-chat pb-safe-2 shadow-xl sm:max-w-md sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between bg-chat px-4 py-3">
          <b>{title}</b>
          <button onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full bg-hover">
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-3 px-4 pb-4">{children}</div>
      </div>
    </div>
  );
}

const KindIcon = ({ f, className }: { f: VaultFile; className?: string }) => {
  const k = playableKind(f.name, f.mime);
  const I = k === "video" ? FileVideo : k === "audio" ? FileAudio : k === "image" ? ImageIcon : FileText;
  return <I className={className} />;
};

// ------------------------------------------------------------------ dropped folders
type FsEntry = { isFile: boolean; isDirectory: boolean; name: string; file?: (cb: (f: File) => void, err?: (e: unknown) => void) => void; createReader?: () => { readEntries: (cb: (e: FsEntry[]) => void, err?: (e: unknown) => void) => void } };
async function readDropped(dt: DataTransfer, base: string): Promise<{ file: File; folder: string }[]> {
  const out: { file: File; folder: string }[] = [];
  const walk = async (e: FsEntry, dir: string) => {
    if (e.isFile) {
      const file = await new Promise<File>((res, rej) => e.file!(res, rej));
      out.push({ file, folder: dir });
    } else if (e.isDirectory) {
      const rd = e.createReader!();
      for (;;) {
        const batch = await new Promise<FsEntry[]>((res, rej) => rd.readEntries(res, rej));
        if (!batch.length) break;
        for (const c of batch) await walk(c, joinPath(dir, e.name));
      }
    }
  };
  const entries = [...dt.items].map((i) => (i as unknown as { webkitGetAsEntry?: () => FsEntry | null }).webkitGetAsEntry?.() ?? null);
  if (entries.some(Boolean)) for (const e of entries) e && (await walk(e, base));
  else for (const f of dt.files) out.push({ file: f, folder: base });
  return out;
}

// ------------------------------------------------------------------ the app
export default function DriveApp({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const userId = useApp((s) => s.userId);
  const [tab, setTab] = useState<Tab>("files");
  const [files, setFiles] = useState<VaultFile[] | null>(null);
  const [usage, setUsage] = useState({ used: 0, limit: 0, files: 0 });
  const [path, setPath] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [made, setMade] = useState<string[]>([]);
  const [play, setPlay] = useState<PlayItem | null>(null);
  const [shareFor, setShareFor] = useState<VaultFile | null>(null);
  const [shares, setShares] = useState<VaultShare[]>([]);
  const [editFor, setEditFor] = useState<VaultFile | null>(null);
  const [delFor, setDelFor] = useState<VaultFile | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [, tick] = useState(0);
  const pick = useRef<HTMLInputElement>(null);
  const pickDir = useRef<HTMLInputElement>(null);
  const transfers = useDrive((s) => s.items);
  const landed = useDrive((s) => s.landed);
  const active = transfers.filter((t) => t.state === "uploading" || t.state === "queued").length;

  const load = useCallback(async () => {
    const [f, u] = await Promise.all([listVault(), vaultUsage()]);
    setFiles(f);
    setUsage(u);
  }, []);
  useEffect(() => {
    if (userId) void load();
  }, [userId, load, landed]);
  useEffect(() => guardUnload(), []);

  const upload = (list: { file: File; folder: string }[]) => {
    const n = addFiles(list);
    if (n) {
      toast(`${n} file${n > 1 ? "s" : ""} added to the upload queue`, "success");
      setTab("transfers");
    }
  };

  const openShare = async (f: VaultFile) => {
    setShares(await listShares([f.id]));
    setShareFor(f);
  };

  const folders = useMemo(() => childFolders(files ?? [], path, made), [files, path, made]);
  const here = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = s ? (files ?? []).filter((f) => `${f.name} ${f.title ?? ""} ${f.folder}`.toLowerCase().includes(s)) : filesIn(files ?? [], path);
    return [...base].sort((a, b) => (sort === "name" ? (a.title || a.name).localeCompare(b.title || b.name, undefined, { numeric: true }) : sort === "size" ? b.bytes - a.bytes : +new Date(b.created_at) - +new Date(a.created_at)));
  }, [files, path, q, sort]);
  const queue = useMemo(() => here.filter((f) => ["audio", "video"].includes(playableKind(f.name, f.mime))), [here]);

  const openFile = (f: VaultFile) => setPlay({ kind: "file", f });

  return (
    <div
      className="relative flex h-full min-h-0 flex-col bg-chat"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) (e.preventDefault(), setDrag(true));
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDrag(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setDrag(false);
        upload(await readDropped(e.dataTransfer, path));
      }}
    >
      <header className={cn("flex shrink-0 items-center gap-2 border-b border-black/20 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        <button onClick={onBack} className="grid size-9 place-items-center rounded-full hover:bg-hover" aria-label="Back to apps">
          <ChevronLeft className="size-5" />
        </button>
        <HardDrive className="size-5 text-sky-400" />
        <span className="min-w-0 flex-1 truncate font-bold">Nexus Drive</span>
        <button onClick={() => pick.current?.click()} className={cn(primary, "inline-flex items-center gap-1.5 !px-3")} aria-label="Upload files">
          <Upload className="size-4" /> <span className="hidden sm:inline">Upload</span>
        </button>
        <input
          ref={pick}
          type="file"
          multiple
          hidden
          aria-label="Choose files to upload"
          onChange={(e) => {
            upload([...(e.target.files ?? [])].map((file) => ({ file, folder: path })));
            e.target.value = "";
          }}
        />
        <input
          ref={pickDir}
          type="file"
          hidden
          aria-label="Choose a folder to upload"
          {...({ webkitdirectory: "", directory: "" } as object)}
          onChange={(e) => {
            upload([...(e.target.files ?? [])].map((file) => ({ file, folder: joinPath(path, (file as File & { webkitRelativePath?: string }).webkitRelativePath?.split("/").slice(0, -1).join("/") ?? "") })));
            e.target.value = "";
          }}
        />
      </header>

      <div className="shrink-0 space-y-2 px-3 pt-2">
        <div className="flex items-center gap-2 text-[11px] text-sub" data-testid="usage">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-hover">
            <div className="h-full rounded-full bg-sky-400" style={{ width: vaultIsUnlimited(usage.limit) ? `${Math.min(100, usage.used / 1e10)}%` : `${Math.min(100, (usage.used / Math.max(1, usage.limit)) * 100)}%` }} />
          </div>
          <span>
            {fmtBytes(usage.used)} of {vaultLimitLabel(usage.limit || 1)} · {usage.files} file{usage.files === 1 ? "" : "s"}
          </span>
        </div>
        <nav className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Drive sections">
          {(
            [
              ["files", "Files"],
              ["transfers", active ? `Transfers (${active})` : "Transfers"],
              ["offline", "Offline"],
              ["stream", "Stream a link"],
              ["sync", "Folder sync"],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn("shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold", tab === id ? "bg-accent text-white" : "bg-hover")}>
              {label}
            </button>
          ))}
        </nav>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
        <div className="mx-auto max-w-3xl space-y-3">
          {tab === "files" && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[8rem] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-sub" />
                  <input className={cn(input, "pl-9")} placeholder="Search your Drive" aria-label="Search your Drive" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort" className="rounded-xl bg-menu px-3 py-2.5 text-sm outline-none">
                  <option value="new">Newest</option>
                  <option value="name">Name</option>
                  <option value="size">Largest</option>
                </select>
                <button onClick={() => setNewFolder("")} className={cn(quiet, "inline-flex items-center gap-1.5 !px-3")} aria-label="New folder">
                  <FolderPlus className="size-4" />
                </button>
                <button onClick={() => pickDir.current?.click()} className={cn(quiet, "inline-flex items-center gap-1.5 !px-3")} aria-label="Upload a folder">
                  <FolderSync className="size-4" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1 text-sm" aria-label="Folder path">
                <button onClick={() => (setPath(""), setQ(""))} className={cn("rounded-full px-2.5 py-1 font-semibold", !path ? "bg-hover" : "text-sub hover:bg-hover")}>
                  Drive
                </button>
                {breadcrumbs(path).map((b) => (
                  <span key={b.path} className="inline-flex items-center gap-1">
                    <ChevronRight className="size-3.5 text-sub" />
                    <button onClick={() => setPath(b.path)} className={cn("rounded-full px-2.5 py-1 font-semibold", b.path === path ? "bg-hover" : "text-sub hover:bg-hover")}>
                      {b.name}
                    </button>
                  </span>
                ))}
              </div>

              {files === null ? (
                <p className="py-10 text-center text-sm text-sub">Loading…</p>
              ) : (
                <ul className="space-y-1.5" data-testid="file-list">
                  {!q &&
                    folders.map((d) => (
                      <li key={d.path}>
                        <button onClick={() => setPath(d.path)} className="flex w-full items-center gap-3 rounded-2xl bg-menu px-3 py-2.5 text-left hover:bg-hover" data-testid="folder-row">
                          <Folder className="size-5 text-amber-300" />
                          <span className="min-w-0 flex-1 truncate font-semibold">{d.name}</span>
                          <span className="text-xs text-sub">{d.count} file{d.count === 1 ? "" : "s"}</span>
                        </button>
                      </li>
                    ))}
                  {here.map((f) => (
                    <li key={f.id} className="relative flex items-center gap-2 rounded-2xl bg-menu px-3 py-2" data-testid="file-row">
                      <button onClick={() => openFile(f)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Open ${f.title || f.name}`}>
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-hover">
                          <KindIcon f={f} className="size-5 text-sky-300" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <b className="block truncate text-sm">{f.title || f.name}</b>
                          <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-sub">
                            <span>{fmtBytes(f.bytes)}</span>
                            {f.duration_ms ? <span>{fmtDuration(f.duration_ms)}</span> : null}
                            <span>{new Date(f.created_at).toLocaleDateString()}</span>
                            {q && f.folder && <span>in {f.folder}</span>}
                            {isLossless(f.name, f.mime) && <span className="font-semibold text-amber-300">Lossless</span>}
                            {isOffline(f.id) && <span className="font-semibold text-emerald-400">Offline</span>}
                          </span>
                        </span>
                      </button>
                      <button onClick={() => void openShare(f)} className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/15 text-accent hover:bg-accent/25" aria-label={`Share link for ${f.title || f.name}`}>
                        <Share2 className="size-4" />
                      </button>
                      <button onClick={() => setMenu(menu === f.id ? null : f.id)} className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-hover" aria-label="More actions" aria-expanded={menu === f.id}>
                        <MoreVertical className="size-4" />
                      </button>
                      {menu === f.id && (
                        <div className="absolute right-2 top-12 z-20 w-48 overflow-hidden rounded-2xl bg-chat py-1 text-sm shadow-xl ring-1 ring-black/30" role="menu">
                          <MenuBtn icon={<Play className="size-4" />} onClick={() => (setMenu(null), openFile(f))}>Open / play</MenuBtn>
                          <OfflineToggle f={f} onChange={() => (setMenu(null), tick((n) => n + 1))} />
                          <MenuBtn icon={<Download className="size-4" />} onClick={() => (setMenu(null), void dl(f))}>Download</MenuBtn>
                          <MenuBtn icon={<Pencil className="size-4" />} onClick={() => (setMenu(null), setEditFor(f))}>Rename / move</MenuBtn>
                          <MenuBtn icon={<Trash2 className="size-4" />} danger onClick={() => (setMenu(null), setDelFor(f))}>Delete</MenuBtn>
                        </div>
                      )}
                    </li>
                  ))}
                  {!here.length && !folders.length && (
                    <li className="rounded-2xl bg-menu p-8 text-center text-sm text-sub">
                      {q ? "Nothing matches that search." : "Nothing here yet. Tap Upload, or drop files and folders anywhere on this page."}
                    </li>
                  )}
                </ul>
              )}
            </>
          )}

          {tab === "transfers" && <Transfers />}
          {tab === "offline" && <OfflineTab files={files ?? []} onOpen={openFile} onChange={() => tick((n) => n + 1)} />}
          {tab === "stream" && <StreamTab onPlay={(p) => setPlay(p)} />}
          {tab === "sync" && <SyncTab remote={files ?? []} onUploadFolder={() => pickDir.current?.click()} />}
        </div>
      </div>

      {drag && <div className="pointer-events-none absolute inset-0 z-50 grid place-items-center border-4 border-dashed border-sky-400 bg-black/60 text-lg font-bold">Drop to upload to {path || "Drive"}</div>}

      {play && <DrivePlayer item={play} list={queue} onPick={openFile} onClose={() => setPlay(null)} onShare={(f) => void openShare(f)} />}
      {shareFor && (
        <ShareDialog
          f={shareFor}
          shares={shares.filter((s) => s.file_id === shareFor.id)}
          onClose={() => setShareFor(null)}
          onChange={async () => setShares(await listShares([shareFor.id]))}
        />
      )}
      {newFolder !== null && (
        <Sheet title="New folder" onClose={() => setNewFolder(null)}>
          <input className={input} autoFocus placeholder="Folder name" aria-label="Folder name" value={newFolder} maxLength={60} onChange={(e) => setNewFolder(e.target.value)} />
          <p className="text-xs text-sub">It appears in the list once you put a file in it. Upload straight into it by opening it first.</p>
          <button
            className={primary}
            disabled={!cleanFolder(newFolder)}
            onClick={() => {
              const p = joinPath(path, newFolder);
              setMade((m) => [...m, p]);
              setPath(p);
              setNewFolder(null);
            }}
          >
            Create and open
          </button>
        </Sheet>
      )}
      {editFor && <EditSheet f={editFor} onClose={() => setEditFor(null)} onSaved={() => (setEditFor(null), void load())} />}
      {delFor && (
        <Sheet title="Delete this file?" onClose={() => setDelFor(null)}>
          <p className="text-sm">
            “{delFor.title || delFor.name}” will be deleted for good, and its share links stop working.
          </p>
          <div className="flex gap-2">
            <button className={cn(btn, "bg-dnd text-white")} onClick={async () => ((await removeVault(delFor)) && (await removeOffline(delFor.id), toast("Deleted", "success"), void load()), setDelFor(null))}>
              Delete forever
            </button>
            <button className={quiet} onClick={() => setDelFor(null)}>
              Keep it
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

async function dl(f: VaultFile) {
  const { supabase } = await import("@/lib/supabase");
  const { data } = await supabase.storage.from("user-vault").createSignedUrl(f.path, 600, { download: f.name });
  if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  else toast("Could not start the download", "error");
}

function MenuBtn({ icon, children, onClick, danger }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button role="menuitem" onClick={onClick} className={cn("flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-hover", danger && "text-dnd")}>
      {icon} {children}
    </button>
  );
}

// ------------------------------------------------------------------ keep offline
const offCtl = new Map<string, AbortController>();
function OfflineToggle({ f, onChange }: { f: VaultFile; onChange: () => void }) {
  const on = isOffline(f.id);
  return (
    <MenuBtn
      icon={on ? <CloudOff className="size-4" /> : <CloudDownload className="size-4" />}
      onClick={async () => {
        if (on) {
          await removeOffline(f.id);
          toast("Offline copy removed", "success");
          return onChange();
        }
        if (!offlineSupported()) return toast("This browser can't keep files offline", "error");
        const ctl = new AbortController();
        offCtl.set(f.id, ctl);
        toast(`Saving “${f.title || f.name}” for offline…`, "info");
        onChange();
        try {
          await saveOffline(f, () => {}, ctl.signal);
          toast("Ready offline", "success");
        } catch (e) {
          if (!ctl.signal.aborted) toast(e instanceof Error ? e.message : "Could not save offline", "error");
        } finally {
          offCtl.delete(f.id);
          onChange();
        }
      }}
    >
      {on ? "Remove offline copy" : "Keep offline"}
    </MenuBtn>
  );
}

function OfflineTab({ files, onOpen, onChange }: { files: VaultFile[]; onOpen: (f: VaultFile) => void; onChange: () => void }) {
  const [dev, setDev] = useState<{ used: number; quota: number } | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => void deviceStorage().then(setDev), [n]);
  const list = offlineList();
  const byId = new Map(files.map((f) => [f.id, f]));
  return (
    <>
      <p className="text-sm text-sub">Files kept offline are saved on this device only. They play without internet and you can remove them any time. Use “Keep offline” in a file’s menu.</p>
      {dev && dev.quota > 0 && (
        <p className="text-xs text-sub">
          This device: {fmtBytes(dev.used)} used of about {fmtBytes(dev.quota)} the browser allows.
        </p>
      )}
      <ul className="space-y-1.5" data-testid="offline-list">
        {list.map((e) => {
          const f = byId.get(e.id);
          return (
            <li key={e.id} className="flex items-center gap-2 rounded-2xl bg-menu px-3 py-2">
              <CloudDownload className="size-5 text-emerald-400" />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-sm">{e.name}</b>
                <span className="text-[11px] text-sub">{fmtBytes(e.bytes)}</span>
              </span>
              {f && (
                <button onClick={() => onOpen(f)} className="grid size-9 place-items-center rounded-full bg-hover" aria-label={`Play ${e.name} offline`}>
                  <Play className="size-4" />
                </button>
              )}
              <button
                onClick={async () => (await removeOffline(e.id), setN((x) => x + 1), onChange())}
                className="grid size-9 place-items-center rounded-full bg-hover text-dnd"
                aria-label={`Remove offline copy of ${e.name}`}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          );
        })}
        {!list.length && <li className="rounded-2xl bg-menu p-8 text-center text-sm text-sub">No offline files yet.</li>}
      </ul>
    </>
  );
}

// ------------------------------------------------------------------ transfers
function Transfers() {
  const items = useDrive((s) => s.items);
  const [open, setOpen] = useState(() => unfinished());
  useEffect(() => setOpen(unfinished()), [items]);
  const stale = open.filter((u) => !items.some((t) => t.key === u.key));
  return (
    <>
      {stale.length > 0 && (
        <div className="space-y-2 rounded-2xl bg-amber-400/10 p-3 text-sm text-amber-100" data-testid="unfinished">
          <b>Unfinished from earlier</b>
          <p className="text-xs text-amber-100/80">Add the same file again and it carries on from where it stopped. Only the missing part is sent.</p>
          <ul className="space-y-1">
            {stale.map((u) => (
              <li key={u.key} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate">
                  {u.folder ? u.folder + "/" : ""}
                  {u.name} · {fmtBytes(u.size)}
                </span>
                <button onClick={() => (forgetUnfinished(u.key), setOpen(unfinished()))} className="rounded-full bg-black/20 px-2.5 py-1 font-semibold">
                  Discard
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button onClick={pauseAll} className={cn(quiet, "inline-flex items-center gap-1.5")}>
            <Pause className="size-4" /> Pause all
          </button>
          <button onClick={resumeAll} className={cn(quiet, "inline-flex items-center gap-1.5")}>
            <Play className="size-4" /> Resume all
          </button>
          <button onClick={clearFinished} className={quiet}>
            Clear finished
          </button>
        </div>
      )}
      <ul className="space-y-1.5" data-testid="transfer-list">
        {items.map((t) => {
          const pct = t.size ? Math.min(100, (t.sent / t.size) * 100) : t.state === "done" ? 100 : 0;
          return (
            <li key={t.key} className="space-y-1.5 rounded-2xl bg-menu px-3 py-2.5" data-testid="transfer" data-state={t.state}>
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t.name}</span>
                <span className="text-xs text-sub">{t.state === "done" ? "Done" : t.state === "error" ? "Failed" : t.state === "paused" ? "Paused" : t.state === "queued" ? "Waiting" : `${Math.floor(pct)}%`}</span>
                {t.state === "uploading" && (
                  <button onClick={() => pause(t.key)} className="grid size-8 place-items-center rounded-full bg-hover" aria-label={`Pause ${t.name}`}>
                    <Pause className="size-4" />
                  </button>
                )}
                {(t.state === "paused" || t.state === "error") && (
                  <button onClick={() => resume(t.key)} className="grid size-8 place-items-center rounded-full bg-hover" aria-label={`Resume ${t.name}`}>
                    {t.state === "error" ? <RefreshCw className="size-4" /> : <Play className="size-4" />}
                  </button>
                )}
                {t.state !== "done" && (
                  <button onClick={() => cancel(t.key)} className="grid size-8 place-items-center rounded-full bg-hover" aria-label={`Cancel ${t.name}`}>
                    <X className="size-4" />
                  </button>
                )}
                {t.state === "done" && <Check className="size-4 text-emerald-400" />}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-hover" role="progressbar" aria-valuenow={Math.floor(pct)} aria-valuemin={0} aria-valuemax={100}>
                <div className={cn("h-full rounded-full transition-[width]", t.state === "error" ? "bg-dnd" : t.state === "done" ? "bg-emerald-400" : "bg-sky-400")} style={{ width: `${pct}%` }} />
              </div>
              <div className="flex flex-wrap gap-x-3 text-[11px] text-sub">
                <span>
                  {fmtBytes(t.sent)} of {fmtBytes(t.size)}
                </span>
                {t.state === "uploading" && t.rate > 0 && (
                  <span>
                    {fmtBytes(t.rate)}/s · {fmtEta(t.size - t.sent, t.rate)}
                  </span>
                )}
                {t.folder && <span>to {t.folder}</span>}
                {t.error && <span className="text-dnd">{t.error}</span>}
              </div>
            </li>
          );
        })}
        {!items.length && !stale.length && <li className="rounded-2xl bg-menu p-8 text-center text-sm text-sub">No uploads. Files over 6 MB go up in pieces, so you can pause, lose signal or close the tab and carry on later.</li>}
      </ul>
    </>
  );
}

// ------------------------------------------------------------------ stream any link
const RECENT = "nexus.drive.streams.v1";
function StreamTab({ onPlay }: { onPlay: (p: PlayItem) => void }) {
  const [url, setUrl] = useState("");
  const [recent, setRecent] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(RECENT) ?? "[]");
    } catch {
      return [];
    }
  });
  const go = (u: string) => {
    const p = parseStreamUrl(u);
    if (!p) return toast("Paste a direct http(s) link to a video or audio file", "error");
    const next = [p.url, ...recent.filter((x) => x !== p.url)].slice(0, 8);
    setRecent(next);
    try {
      localStorage.setItem(RECENT, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    onPlay({ kind: "url", url: p.url, name: p.name, media: p.kind });
  };
  return (
    <>
      <p className="text-sm text-sub">Paste a direct link to a video or audio file (.mp4, .webm, .mp3, .flac, .wav …) and it plays here without downloading it first.</p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          go(url);
        }}
      >
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-sub" />
          <input className={cn(input, "pl-9")} placeholder="https://…/song.flac" aria-label="Media link" inputMode="url" autoCapitalize="none" autoCorrect="off" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <button className={primary} disabled={!url.trim()}>
          Play
        </button>
      </form>
      <p className="text-xs text-sub">Some sites don’t allow other pages to play their files. If a link won’t start, that site is blocking it.</p>
      {recent.length > 0 && (
        <ul className="space-y-1.5" data-testid="recent-streams">
          {recent.map((u) => (
            <li key={u}>
              <button onClick={() => go(u)} className="flex w-full items-center gap-2 rounded-2xl bg-menu px-3 py-2.5 text-left hover:bg-hover">
                <Play className="size-4 shrink-0 text-sky-300" />
                <span className="min-w-0 flex-1 truncate text-sm">{baseName(new URL(u).pathname) || u}</span>
                <span className="max-w-[40%] truncate text-xs text-sub">{new URL(u).hostname}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ------------------------------------------------------------------ folder sync
function SyncTab({ remote, onUploadFolder }: { remote: VaultFile[]; onUploadFolder: () => void }) {
  const [list, setList] = useState<SyncEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [auto, setAuto] = useState(() => {
    try {
      return localStorage.getItem("nexus.drive.autosync") === "1";
    } catch {
      return false;
    }
  });
  const reload = useCallback(async () => setList(await listSync()), []);
  useEffect(() => void reload(), [reload]);
  const run = useCallback(
    async (e: SyncEntry, quiet?: boolean) => {
      setBusy(e.id);
      const r = await syncNow(e, remote);
      setBusy(null);
      if ("error" in r) return !quiet && toast(r.error, "error");
      if (!quiet || r.queued) toast(r.queued ? `${r.queued} new file${r.queued > 1 ? "s" : ""} from “${e.name}” queued` : `“${e.name}” is up to date`, "success");
      void reload();
    },
    [remote, reload],
  );
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => list.forEach((e) => void run(e, true)), 10 * 60_000);
    return () => clearInterval(t);
  }, [auto, list, run]);
  if (!syncSupported())
    return (
      <>
        <p className="text-sm text-sub">This browser can’t keep a folder linked. You can still upload a whole folder with its sub-folders in one go (it keeps the structure). For automatic syncing, open Nexus on desktop Chrome or Edge.</p>
        <button onClick={onUploadFolder} className={cn(primary, "inline-flex items-center gap-1.5")}>
          <FolderSync className="size-4" /> Upload a folder
        </button>
      </>
    );
  return (
    <>
      <p className="text-sm text-sub">Link a folder on this device. New and changed files are uploaded to Drive under “Synced”. Nothing is ever deleted from your computer or from Drive.</p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={async () => {
            const e = await addSyncFolder();
            if (e) (await reload(), void run(e));
          }}
          className={cn(primary, "inline-flex items-center gap-1.5")}
        >
          <FolderSync className="size-4" /> Link a folder
        </button>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => {
              setAuto(e.target.checked);
              try {
                localStorage.setItem("nexus.drive.autosync", e.target.checked ? "1" : "0");
              } catch {
                /* ignore */
              }
            }}
          />
          Re-check every 10 min while this page is open
        </label>
      </div>
      <ul className="space-y-1.5" data-testid="sync-list">
        {list.map((e) => (
          <li key={e.id} className="flex items-center gap-2 rounded-2xl bg-menu px-3 py-2.5">
            <FolderSync className="size-5 text-sky-300" />
            <span className="min-w-0 flex-1">
              <b className="block truncate text-sm">{e.name}</b>
              <span className="text-[11px] text-sub">
                to {e.root}
                {e.last ? ` · synced ${new Date(e.last).toLocaleString()}` : ""}
              </span>
            </span>
            <button onClick={() => void run(e)} disabled={busy === e.id} className={cn(quiet, "!px-3")} aria-label={`Sync ${e.name} now`}>
              {busy === e.id ? "Checking…" : "Sync now"}
            </button>
            <button onClick={async () => (await removeSync(e.id), reload())} className="grid size-9 place-items-center rounded-full bg-hover" aria-label={`Unlink ${e.name}`}>
              <X className="size-4" />
            </button>
          </li>
        ))}
        {!list.length && <li className="rounded-2xl bg-menu p-8 text-center text-sm text-sub">No linked folders.</li>}
      </ul>
    </>
  );
}

// ------------------------------------------------------------------ rename / move
function EditSheet({ f, onClose, onSaved }: { f: VaultFile; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(f.name);
  const [folder, setFolder] = useState(f.folder);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title="Rename or move" onClose={onClose}>
      <input className={input} aria-label="File name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
      <input className={input} aria-label="Folder" placeholder="Folder, e.g. Music/Masters (empty = top level)" value={folder} onChange={(e) => setFolder(e.target.value)} />
      <button
        className={primary}
        disabled={busy || !name.trim()}
        onClick={async () => {
          setBusy(true);
          const ok = await updateVault(f.id, { name: name.trim(), folder: cleanFolder(folder) });
          setBusy(false);
          if (ok) onSaved();
        }}
      >
        Save
      </button>
    </Sheet>
  );
}


