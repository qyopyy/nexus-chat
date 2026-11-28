"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Copy, Download, MessageSquarePlus, Play, Radar, Send, Sparkles, Trash2, UserPlus } from "lucide-react";
import { toast, useApp, conversationTitle } from "@/store/app";
import { listVault, removeVault, uploadVault, vaultUrl, type VaultFile } from "@/lib/protect";
import { SNAP_EFFECTS, SNAP_FOLDER, applyEffect, effectByKey, formatDuration, isVideoMime, snapFileName } from "@/lib/snap";
import { snapLink, sendSnapToChat } from "@/lib/snapShare";
import { cn } from "@/lib/utils";
import SnapShareSheet from "./SnapShareSheet";
import SnapDrop from "./SnapDrop";
import { Act, Sheet, copyText } from "./SnapUi";

type Filter = "all" | "photos" | "videos";
const isVid = (f: VaultFile) => isVideoMime(f.mime) || f.kind === "video" || /\.(mp4|webm|mov|m4v)$/i.test(f.name);

/** Everything you captured with Snap (vault folder "Snap"): photos and videos, full view, effects copy, share, delete. */
export default function SnapGallery({ onClose, expiry, chatId, onAttachFile }: { onClose: () => void; expiry: number | null; chatId?: string | null; onAttachFile?: (f: File) => void }) {
  const [files, setFiles] = useState<VaultFile[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<VaultFile | null>(null);
  const [loadErr, setLoadErr] = useState("");

  useEffect(() => {
    let live = true;
    void listVault()
      .then((all) => live && setFiles(all.filter((f) => f.folder === SNAP_FOLDER).slice(0, 300)))
      .catch((e) => {
        if (!live) return;
        setLoadErr(e instanceof Error ? e.message : "Couldn't load your snaps.");
        setFiles([]);
      });
    return () => {
      live = false;
    };
  }, []);

  const shown = useMemo(() => (files ?? []).filter((f) => (filter === "all" ? true : filter === "videos" ? isVid(f) : !isVid(f))), [files, filter]);
  const remove = useCallback(async (f: VaultFile) => {
    try {
      await removeVault(f);
      setFiles((x) => (x ?? []).filter((y) => y.id !== f.id));
      toast("Deleted from your vault");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't delete", "error");
    }
  }, []);

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-black">
      <header className="flex items-center gap-2 px-3 pb-2 pt-safe-3">
        <button type="button" onClick={onClose} aria-label="Back to camera" className="grid size-10 place-items-center rounded-full bg-white/10 hover:bg-white/20">
          <ChevronLeft className="size-5" />
        </button>
        <b className="flex-1 text-center text-sm tracking-wide">GALLERY</b>
        <span className="size-10" />
      </header>
      <div className="flex justify-center gap-1.5 pb-2 text-xs">
        {(["all", "photos", "videos"] as Filter[]).map((k) => (
          <button key={k} type="button" onClick={() => setFilter(k)} className={cn("rounded-full px-3.5 py-1.5 font-semibold capitalize", filter === k ? "bg-white text-black" : "bg-white/10 text-white/80")}>
            {k}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
        {files === null && <p className="p-6 text-center text-sm text-white/60">Loading…</p>}
        {loadErr && <p className="p-6 text-center text-sm text-rose-300">{loadErr}</p>}
        {files && !loadErr && shown.length === 0 && <p className="p-6 text-center text-sm text-white/60">{files.length === 0 ? "Nothing yet. Take your first snap." : "Nothing in this filter."}</p>}
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5">
          {shown.map((f) => (
            <Tile key={f.id} f={f} onOpen={() => setOpen(f)} />
          ))}
        </div>
      </div>
      {open && (
        <Viewer
          f={open}
          expiry={expiry}
          chatId={chatId}
          onAttachFile={onAttachFile}
          onClose={() => setOpen(null)}
          onDelete={async () => {
            await remove(open);
            setOpen(null);
          }}
          onSavedCopy={(v) => setFiles((x) => [v, ...(x ?? [])])}
        />
      )}
    </div>
  );
}

function Tile({ f, onOpen }: { f: VaultFile; onOpen: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const video = isVid(f);

  useEffect(() => {
    const el = ref.current;
    let live = true;
    const load = () => void vaultUrl(f).then((u) => live && u && setUrl(u));
    if (!el || typeof IntersectionObserver === "undefined") {
      load();
      return () => {
        live = false;
      };
    }
    const io = new IntersectionObserver(
      (e) => {
        if (e.some((x) => x.isIntersecting)) {
          io.disconnect();
          load();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => {
      live = false;
      io.disconnect();
    };
  }, [f]);

  return (
    <button ref={ref} type="button" onClick={onOpen} aria-label={f.name} className="relative aspect-square overflow-hidden rounded-xl bg-white/5">
      {url &&
        (video ? (
          <video src={`${url}#t=0.1`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
        ))}
      {video && (
        <span className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-bold">
          <Play className="size-3 fill-white" />
          {f.duration_ms ? formatDuration(f.duration_ms) : "Video"}
        </span>
      )}
    </button>
  );
}

function Viewer({
  f,
  expiry,
  chatId,
  onAttachFile,
  onClose,
  onDelete,
  onSavedCopy,
}: {
  f: VaultFile;
  expiry: number | null;
  chatId?: string | null;
  onAttachFile?: (f: File) => void;
  onClose: () => void;
  onDelete: () => Promise<void>;
  onSavedCopy: (v: VaultFile) => void;
}) {
  const video = isVid(f);
  const [url, setUrl] = useState<string | null>(null);
  const [fx, setFx] = useState("none");
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState(false);
  const [drop, setDrop] = useState(false);
  const [picker, setPicker] = useState(false);
  const chats = useApp((s) => s.chatList);

  useEffect(() => {
    let live = true;
    void vaultUrl(f).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [f]);

  const copy = async () => {
    try {
      const l = await snapLink(f, expiry);
      toast((await copyText(l)) ? "Link copied" : l, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't make a link", "error");
    }
  };
  const download = async () => {
    const u = await vaultUrl(f, true);
    if (u) window.open(u, "_blank");
  };
  const sendLink = async (convId: string) => {
    try {
      await sendSnapToChat(convId, f, expiry);
      toast("Sent", "success");
      setPicker(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't send", "error");
    }
  };
  const fetchFile = async () => {
    if (!url) throw new Error("Still loading");
    const blob = await (await fetch(url)).blob();
    return new File([blob], f.name, { type: f.mime || blob.type });
  };

  /** Saves the picture with the chosen effect as a new copy (the original stays untouched). */
  const saveCopy = async () => {
    if (!url || fx === "none" || busy) return;
    setBusy(true);
    try {
      const src = URL.createObjectURL(await (await fetch(url)).blob());
      const img = new Image();
      img.src = src;
      try {
        await img.decode();
      } finally {
        URL.revokeObjectURL(src);
      }
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("Your browser can't edit pictures.");
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height);
      applyEffect(data.data, fx);
      ctx.putImageData(data, 0, 0);
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.94));
      if (!blob) throw new Error("Couldn't make the copy.");
      const file = new File([blob], snapFileName(new Date(), "environment").replace(".jpg", `-${fx}.jpg`), { type: "image/jpeg" });
      const v = await uploadVault(file, SNAP_FOLDER, undefined, { kind: "artwork", note: `Nexus Snap · ${effectByKey(fx).label}`, original: true });
      onSavedCopy(v);
      toast("Saved a copy to your vault", "success");
      setFx("none");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save the copy", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-[60] flex flex-col bg-black">
      <header className="flex items-center gap-2 px-3 pb-2 pt-safe-3">
        <button type="button" onClick={onClose} aria-label="Back" className="grid size-10 place-items-center rounded-full bg-white/10 hover:bg-white/20">
          <ChevronLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-xs font-semibold">{new Date(f.created_at).toLocaleString()}</div>
          <div className="text-[10px] text-white/45">{(f.bytes / 1048576).toFixed(1)} MB</div>
        </div>
        <span className="size-10" />
      </header>
      <div className="relative min-h-0 flex-1 bg-[#0a0a10]">
        {!url && <div className="absolute inset-0 grid place-items-center text-sm text-white/50">Loading…</div>}
        {url &&
          (video ? (
            <video src={url} controls playsInline autoPlay className="h-full w-full object-contain" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={f.name} className="h-full w-full object-contain" style={{ filter: effectByKey(fx).css }} />
          ))}
      </div>
      {!video && (
        <div className="flex items-center gap-1.5 overflow-x-auto px-3 pt-3 text-[11px]">
          <Sparkles className="size-4 shrink-0 text-white/50" />
          {SNAP_EFFECTS.map((e) => (
            <button key={e.key} type="button" onClick={() => setFx(e.key)} className={cn("shrink-0 rounded-full px-3 py-1.5 font-semibold", fx === e.key ? "bg-white text-black" : "bg-white/10 text-white/80")}>
              {e.label}
            </button>
          ))}
          {fx !== "none" && (
            <button type="button" onClick={() => void saveCopy()} disabled={busy} className="ml-1 shrink-0 rounded-full bg-emerald-400 px-3 py-1.5 font-bold text-black disabled:opacity-50">
              {busy ? "Saving…" : "Save copy"}
            </button>
          )}
        </div>
      )}
      <div className="grid grid-cols-4 gap-2 px-4 pb-safe-2 pt-3 sm:grid-cols-7">
        <Act icon={<UserPlus className="size-5" />} label="To a user" onClick={() => setShare(true)} />
        <Act icon={<Radar className="size-5" />} label="Nexus Drop" onClick={() => setDrop(true)} />
        <Act icon={<Copy className="size-5" />} label="Copy link" onClick={() => void copy()} />
        {chatId ? (
          <Act icon={<Send className="size-5" />} label="Send here" onClick={() => void sendLink(chatId)} />
        ) : (
          <Act icon={<Send className="size-5" />} label="To a chat" onClick={() => setPicker(true)} />
        )}
        <Act icon={<Download className="size-5" />} label="Download" onClick={() => void download()} />
        {onAttachFile ? (
          <Act
            icon={<MessageSquarePlus className="size-5" />}
            label="Add to msg"
            onClick={() =>
              void fetchFile()
                .then((file) => {
                  onAttachFile(file);
                  onClose();
                })
                .catch(() => toast("Couldn't add it", "error"))
            }
          />
        ) : (
          <span />
        )}
        <Act icon={<Trash2 className="size-5" />} label="Delete" onClick={() => void onDelete()} />
      </div>
      {share && <SnapShareSheet file={f} expiry={expiry} onClose={() => setShare(false)} z="z-[70]" />}
      {drop && <SnapDrop file={f} expiry={expiry} getFile={fetchFile} onClose={() => setDrop(false)} z="z-[70]" />}
      {picker && (
        <Sheet title="Send link to…" onClose={() => setPicker(false)} z="z-[70]">
          {chats.length === 0 && <p className="p-4 text-sm text-white/60">No chats yet.</p>}
          {chats.map((c) => (
            <div key={c.id} className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{conversationTitle(useApp.getState(), c.id) || "Chat"}</span>
              <button type="button" onClick={() => void sendLink(c.id)} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-black">
                Send
              </button>
            </div>
          ))}
        </Sheet>
      )}
    </div>
  );
}
