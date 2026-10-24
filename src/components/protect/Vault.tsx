"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, Eye, FolderOpen, Link2, Lock, Trash2, Upload, X } from "lucide-react";
import { toast, openModal } from "@/store/app";
import { useMyTier, needPlan } from "@/lib/premium";
import { cn } from "@/lib/utils";
import {
  createShare,
  fmtBytes,
  listShares,
  listVault,
  removeVault,
  revokeShare,
  shareLink,
  updateVault,
  uploadVault,
  vaultUrl,
  vaultUsage,
  type VaultFile,
  type VaultShare,
} from "@/lib/protect";

const EXPIRY: [string, number | null][] = [
  ["1 hour", 1],
  ["1 day", 24],
  ["7 days", 168],
  ["30 days", 720],
  ["Never", null],
];
const icon = (m?: string | null) => (!m ? "📄" : m.startsWith("audio/") ? "🎵" : m.startsWith("video/") ? "🎬" : m.startsWith("image/") ? "🖼️" : m.includes("pdf") ? "📕" : m.includes("zip") ? "🗜️" : "📄");

/** My Vault — private storage for everyone, with expiring / password / download-limited share links */
export default function Vault() {
  const tier = useMyTier();
  const [files, setFiles] = useState<VaultFile[] | null>(null);
  const [shares, setShares] = useState<VaultShare[]>([]);
  const [usage, setUsage] = useState({ used: 0, limit: 1073741824, files: 0 });
  const [folder, setFolder] = useState("");
  const [q, setQ] = useState("");
  const [ups, setUps] = useState<{ name: string; p: number }[]>([]);
  const [shareFor, setShareFor] = useState<VaultFile | null>(null);
  const [preview, setPreview] = useState<{ f: VaultFile; url: string } | null>(null);
  const [drag, setDrag] = useState(false);
  const pick = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [f, s, u] = await Promise.all([listVault(), listShares(), vaultUsage()]);
    setFiles(f);
    setShares(s);
    setUsage(u);
  }, []);
  useEffect(() => void load(), [load]);

  const folders = useMemo(() => [...new Set((files ?? []).map((f) => f.folder).filter(Boolean))].sort(), [files]);
  const shown = (files ?? []).filter((f) => (!folder || f.folder === folder) && (!q || f.name.toLowerCase().includes(q.toLowerCase())));

  const add = async (list: FileList | File[]) => {
    for (const f of [...list]) {
      setUps((u) => [...u, { name: f.name, p: 0 }]);
      try {
        await uploadVault(f, folder, (p) => setUps((u) => u.map((x) => (x.name === f.name ? { ...x, p } : x))));
      } catch (e) {
        toast(`${f.name}: ${(e as Error).message}`, "error");
      }
      setUps((u) => u.filter((x) => x.name !== f.name));
    }
    void load();
  };

  const pct = Math.min(100, (usage.used / Math.max(1, usage.limit)) * 100);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-3xl p-5 text-white" style={{ background: "linear-gradient(135deg,#1b2a6b,#4b1b6b 60%,#6b1b4b)" }}>
        <div className="flex items-center gap-2 text-xs font-bold tracking-widest text-white/70 uppercase">
          <Lock className="size-4" /> My Vault
        </div>
        <div className="mt-1 text-2xl font-black">Private files, shared on your terms</div>
        <p className="mt-1 max-w-2xl text-sm text-white/80">Only you can open what&apos;s in here. Share a file with a link that expires, needs a password, allows a set number of downloads — and turn it off any time.</p>
        <div className="mt-4">
          <div className="flex justify-between text-xs font-semibold text-white/80">
            <span>
              {fmtBytes(usage.used)} of {fmtBytes(usage.limit)} used · {usage.files} files
            </span>
            {tier < 4 && (
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
        <input ref={pick} type="file" multiple hidden onChange={(e) => (e.target.files?.length && void add(e.target.files), (e.target.value = ""))} />
        <button onClick={() => pick.current?.click()} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-white">
          <Upload className="size-4" /> Upload files
        </button>
        <p className="mt-2 text-xs text-sub">
          or drop them here{folder ? ` — into “${folder}”` : ""} · up to 2 GB each · songs, stems, videos, contracts, artwork…
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
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search files" className="min-w-0 flex-1 rounded-full border border-line bg-transparent px-4 py-2 text-sm outline-none focus:border-accent" />
        <select value={folder} onChange={(e) => setFolder(e.target.value)} className="rounded-full border border-line bg-side px-3 py-2 text-sm outline-none">
          <option value="">All folders</option>
          {folders.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
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

      {files === null ? (
        <p className="text-sm text-sub">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-sub">{files.length ? "Nothing matches." : "Your vault is empty — upload your first file."}</p>
      ) : (
        <div className="divide-y divide-line/60 overflow-hidden rounded-2xl border border-line/70">
          {shown.map((f) => {
            const live = shares.filter((s) => s.file_id === f.id && !s.revoked);
            return (
              <div key={f.id} className="flex flex-wrap items-center gap-3 p-3 hover:bg-white/[.02]">
                <span className="text-2xl">{icon(f.mime)}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{f.name}</div>
                  <div className="truncate text-xs text-sub">
                    {fmtBytes(f.bytes)} · {new Date(f.created_at).toLocaleDateString([], { dateStyle: "medium" })}
                    {f.folder && ` · 📁 ${f.folder}`}
                    {live.length > 0 && <span className="text-accent"> · 🔗 {live.length} link{live.length > 1 ? "s" : ""}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {/^(audio|video|image)\/|pdf/.test(f.mime ?? "") && (
                    <IconBtn label="Preview" onClick={async () => { const url = await vaultUrl(f); if (url) setPreview({ f, url }); }}>
                      <Eye className="size-4" />
                    </IconBtn>
                  )}
                  <IconBtn label="Download" onClick={async () => { const url = await vaultUrl(f, true); if (url) window.location.href = url; }}>
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
                      if (confirm(`Delete “${f.name}” forever? Its share links stop working.`) && (await removeVault(f))) void load();
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

      {shareFor && <ShareDialog f={shareFor} shares={shares.filter((s) => s.file_id === shareFor.id)} onClose={() => setShareFor(null)} onChange={load} />}
      {preview && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/85 p-4" onClick={() => setPreview(null)}>
          <div className="w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2 text-white">
              <span className="min-w-0 flex-1 truncate font-semibold">{preview.f.name}</span>
              <button onClick={() => setPreview(null)} className="grid size-9 place-items-center rounded-full bg-white/10" aria-label="Close">
                <X className="size-5" />
              </button>
            </div>
            {preview.f.mime?.startsWith("audio/") ? (
              <audio src={preview.url} controls autoPlay className="w-full" />
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

function ShareDialog({ f, shares, onClose, onChange }: { f: VaultFile; shares: VaultShare[]; onClose: () => void; onChange: () => void }) {
  const [exp, setExp] = useState<number | null>(168);
  const [max, setMax] = useState("");
  const [pw, setPw] = useState("");
  const [dl, setDl] = useState(true);
  const [busy, setBusy] = useState(false);
  const copy = (t: string) => void navigator.clipboard.writeText(t).then(() => toast("Link copied", "success"));
  const now = Date.now();
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-chat p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate text-lg font-bold">Share “{f.name}”</h3>
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
            View only — people can play / open it but not download
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
