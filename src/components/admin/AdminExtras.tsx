"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, File, Folder, Lock, LockOpen } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { lockVault, reviewClaim, unlockVault, vaultList, vaultSign, vaultSignUrl, vaultUnlocked, type VaultItem } from "@/lib/admin";
import { pendingClaims } from "@/lib/music";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";
import type { ArtistClaim } from "@/lib/types";

export function ClaimsTab() {
  const [rows, setRows] = useState<ArtistClaim[] | null>(null);
  const load = useCallback(() => void pendingClaims().then(setRows), []);
  useEffect(load, [load]);
  if (!rows) return <p className="text-sub">Loading…</p>;
  if (!rows.length) return <p className="rounded-xl bg-side p-6 text-center text-sub">No pending artist claims.</p>;
  return (
    <div className="space-y-2">
      {rows.map((c) => (
        <div key={c.id} className="rounded-xl bg-side p-3">
          <div className="flex items-center gap-3">
            {c.artist_image ? <img src={c.artist_image} alt="" className="size-12 rounded-full object-cover" /> : <div className="grid size-12 place-items-center rounded-full bg-rail">🎤</div>}
            <div className="min-w-0 flex-1">
              <div className="font-bold">
                {c.artist_name} <span className="font-normal text-sub">→ @{c.requested_handle}</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-sub">
                claimed by <Avatar userId={c.user_id} size={18} plain /> <NameTag userId={c.user_id} className="text-txt" />
              </div>
            </div>
            <a href={`https://open.spotify.com/artist/${c.spotify_id}`} target="_blank" rel="noreferrer" className="text-sub hover:text-txt" title="Open on Spotify">
              <ExternalLink className="size-4" />
            </a>
          </div>
          {c.proof && <p className="mt-2 rounded-lg bg-rail p-2.5 text-sm whitespace-pre-wrap">{c.proof}</p>}
          <div className="mt-2 flex gap-2">
            <button onClick={async () => (await reviewClaim(c.id, true)) && load()} className="flex-1 rounded-lg bg-ok py-2 text-sm font-semibold text-white hover:bg-ok/85">
              Approve
            </button>
            <button onClick={async () => (await reviewClaim(c.id, false)) && load()} className="flex-1 rounded-lg bg-hover py-2 text-sm font-semibold hover:bg-active">
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

const BUCKETS = [
  ["attachments", "Chat uploads"],
  ["space-music", "Space music"],
  ["artist-media", "Artist posts"],
  ["avatars", "Avatars & banners"],
] as const;

/** Password-protected browser for every uploaded file */
export function VaultTab() {
  const [open, setOpen] = useState(vaultUnlocked());
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [bucket, setBucket] = useState<string>("attachments");
  const [prefix, setPrefix] = useState("");
  const [items, setItems] = useState<VaultItem[] | null>(null);
  const [link, setLink] = useState("");
  const [preview, setPreview] = useState<{ url: string; type: string | null; name: string } | null>(null);

  const list = useCallback(async (b: string, p: string) => {
    setItems(null);
    try {
      setItems(await vaultList(b, p));
    } catch (e) {
      toast((e as Error).message, "error");
      if (!vaultUnlocked()) setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (open) void list(bucket, prefix);
  }, [open, bucket, prefix, list]);

  if (!open) {
    return (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await unlockVault(pw);
            setPw("");
            setOpen(true);
          } catch (err) {
            toast((err as Error).message, "error");
          }
          setBusy(false);
        }}
        className="mx-auto max-w-sm space-y-3 rounded-2xl bg-side p-6 text-center"
      >
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-dnd/15">
          <Lock className="size-6 text-dnd" />
        </div>
        <div>
          <div className="text-lg font-bold">File vault</div>
          <p className="text-sm text-sub">Uploaded images, videos, audio and files are private. Enter the admin vault password to browse and open them.</p>
        </div>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="Admin password"
          autoComplete="off"
          className="w-full rounded-lg bg-rail px-3 py-2.5 outline-none focus:ring-2 focus:ring-accent/60"
        />
        <button disabled={busy || !pw} className="w-full rounded-lg bg-accent py-2.5 font-semibold text-white hover:bg-accent-2 disabled:opacity-50">
          {busy ? "Checking…" : "Unlock"}
        </button>
      </form>
    );
  }

  const openFile = async (name: string, type: string | null) => {
    try {
      const url = await vaultSign(bucket, `${prefix ? `${prefix}/` : ""}${name}`);
      setPreview({ url, type, name });
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-full bg-ok/15 px-3 py-1 text-xs font-semibold text-ok">
          <LockOpen className="size-3.5" /> Unlocked for 30 min
        </span>
        <button onClick={() => (lockVault(), setOpen(false))} className="text-xs text-sub hover:text-txt">
          Lock now
        </button>
      </div>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const url = await vaultSignUrl(link.trim());
            window.open(url, "_blank", "noopener");
          } catch (err) {
            toast((err as Error).message, "error");
          }
        }}
        className="flex gap-2"
      >
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste a Supabase storage link to open it" className="min-w-0 flex-1 rounded-lg bg-rail px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/60" />
        <button disabled={!link.trim()} className="rounded-lg bg-accent px-3 text-sm font-semibold text-white disabled:opacity-40">
          Open
        </button>
      </form>

      <div className="no-scrollbar flex gap-1 overflow-x-auto">
        {BUCKETS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => {
              setBucket(id);
              setPrefix("");
            }}
            className={cn("shrink-0 rounded-lg px-3 py-1.5 text-sm", bucket === id ? "bg-active text-txt" : "text-sub hover:bg-hover")}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl bg-side">
        <div className="flex items-center gap-2 border-b border-line/60 px-3 py-2 text-xs text-sub">
          {prefix && (
            <button onClick={() => setPrefix(prefix.split("/").slice(0, -1).join("/"))} className="grid size-6 place-items-center rounded hover:bg-hover" aria-label="Up">
              <ArrowLeft className="size-4" />
            </button>
          )}
          <span className="truncate font-mono">
            {bucket}/{prefix}
          </span>
        </div>
        {items === null ? (
          <p className="p-4 text-sm text-sub">Loading…</p>
        ) : items.length === 0 ? (
          <p className="p-4 text-sm text-sub">Empty.</p>
        ) : (
          items.map((it) => (
            <button
              key={it.name}
              onClick={() => (it.folder ? setPrefix(prefix ? `${prefix}/${it.name}` : it.name) : void openFile(it.name, it.type))}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-hover"
            >
              {it.folder ? <Folder className="size-4 text-accent" /> : <File className="size-4 text-sub" />}
              <span className="min-w-0 flex-1 truncate">{it.folder ? <FolderName bucket={bucket} name={it.name} /> : it.name}</span>
              {!it.folder && <span className="shrink-0 text-xs text-sub">{it.size != null ? `${(it.size / 1024 / 1024).toFixed(2)} MB` : ""}</span>}
            </button>
          ))
        )}
      </div>

      {preview && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/85 p-4" onClick={() => setPreview(null)}>
          <div className="max-h-full w-full max-w-3xl space-y-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-sm text-white">
              <span className="min-w-0 flex-1 truncate">{preview.name}</span>
              <a href={preview.url} target="_blank" rel="noreferrer" className="rounded-md bg-white/10 px-2.5 py-1">
                Open
              </a>
              <button onClick={() => setPreview(null)} className="rounded-md bg-white/10 px-2.5 py-1">
                Close
              </button>
            </div>
            {preview.type?.startsWith("image/") ? (
              <img src={preview.url} alt="" className="mx-auto max-h-[80dvh] rounded-lg" />
            ) : preview.type?.startsWith("video/") ? (
              <video src={preview.url} controls autoPlay playsInline className="mx-auto max-h-[80dvh] w-full rounded-lg" />
            ) : preview.type?.startsWith("audio/") ? (
              <audio src={preview.url} controls autoPlay className="w-full" />
            ) : (
              <a href={preview.url} target="_blank" rel="noreferrer" className="block rounded-lg bg-white/10 p-6 text-center text-white">
                Download file
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Folder names are conversation / space / user ids — show something readable when we know it */
function FolderName({ bucket, name }: { bucket: string; name: string }) {
  const label = useApp((s) => {
    if (bucket === "avatars") return s.profiles[name]?.display_name;
    if (bucket === "space-music") return s.spaces.find((x) => x.id === name)?.name;
    if (bucket === "attachments") {
      const c = s.chatList.find((x) => x.id === name);
      if (c) return c.kind === "dm" ? `DM · ${s.profiles[c.other_user_id ?? ""]?.display_name ?? ""}` : (c.name ?? "Group");
      for (const list of Object.values(s.channels)) {
        const ch = list.find((x) => x.id === name);
        if (ch) return `#${ch.name}`;
      }
    }
    return undefined;
  });
  return (
    <>
      {label && <b className="mr-2">{label}</b>}
      <span className="font-mono text-xs text-sub">{name}</span>
    </>
  );
}
