"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  FolderPlus,
  Link2,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import {
  FOLDER_COLORS,
  addHubToFolder,
  createRailFolder,
  deleteRailFolder,
  exportRailTemplate,
  importRailTemplate,
  moveHubInFolder,
  moveRailEntryBy,
  railTemplateShareUrl,
  removeHubFromFolder,
  renameRailFolder,
  resetRailLayout,
  setRailFolderColor,
  useRailLayout,
  type RailHubId,
} from "@/lib/railLayout";
import { haptic } from "@/lib/haptics";
import { toast } from "@/store/app";
import { cn } from "@/lib/utils";

export const HUB_META: Record<RailHubId, { label: string; hint: string }> = {
  dm: { label: "Direct Messages", hint: "Chats & friends" },
  gram: { label: "NexusGram", hint: "Posts, Shorts & stories" },
  videos: { label: "Videos", hint: "Watch & upload" },
  live: { label: "Nexus Live", hint: "Streams & screen share" },
  pulse: { label: "Pulse", hint: "Twitter-style posts" },
  music: { label: "Music", hint: "Listen & distribute" },
  cutroom: { label: "Cutroom", hint: "WIP music" },
  radio: { label: "Nexus Radio", hint: "Listen & jam" },
  games: { label: "Games", hint: "Play together" },
  apps: { label: "Apps", hint: "Tools & utilities" },
  studio: { label: "Studio", hint: "Upload & distribute" },
  staff: { label: "Staff Desk", hint: "VIP & staff perks" },
};

type Props = { open: boolean; onClose: () => void };

export default function RailCustomize({ open, onClose }: Props) {
  const entries = useRailLayout((s) => s.entries);
  const folders = useRailLayout((s) => s.folders);
  const [folderName, setFolderName] = useState("Media");
  const [importCode, setImportCode] = useState("");
  const [shareName, setShareName] = useState("My rail");

  const topLevelHubs = useMemo(
    () => entries.filter((e): e is { kind: "hub"; id: RailHubId } => e.kind === "hub").map((e) => e.id),
    [entries],
  );

  if (!open || typeof document === "undefined") return null;

  async function copyShare() {
    const code = exportRailTemplate(shareName.trim() || "My rail");
    const url = railTemplateShareUrl(code);
    try {
      await navigator.clipboard.writeText(url);
      toast("Template link copied", "success");
      haptic.success();
    } catch {
      try {
        await navigator.clipboard.writeText(code);
        toast("Template code copied", "success");
      } catch {
        toast("Couldn't copy — select the code manually", "error");
      }
    }
  }

  function applyImport() {
    const res = importRailTemplate(importCode);
    if (res.ok) {
      toast(res.name ? `Applied “${res.name}”` : "Template applied", "success");
      haptic.success();
      setImportCode("");
    } else toast(res.error, "error");
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-3 sm:items-center" role="dialog" aria-modal onClick={onClose}>
      <div
        className="flex max-h-[min(92vh,720px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#1e1f22] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Customize rail</div>
            <div className="text-xs text-sub">Reorder icons, group into folders, share a template</div>
          </div>
          <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full text-sub hover:bg-white/5" aria-label="Close">
            <X className="size-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-3">
          <section className="space-y-1.5">
            <div className="text-[11px] font-bold tracking-wide text-sub uppercase">Order</div>
            {entries.map((e) => {
              if (e.kind === "hub") {
                const meta = HUB_META[e.id];
                return (
                  <Row
                    key={`h-${e.id}`}
                    title={meta.label}
                    subtitle={meta.hint}
                    onUp={() => moveRailEntryBy(e.id, "hub", -1)}
                    onDown={() => moveRailEntryBy(e.id, "hub", 1)}
                  />
                );
              }
              const f = folders[e.id];
              if (!f) return null;
              return (
                <div key={`f-${e.id}`} className="rounded-xl bg-white/[.04] ring-1 ring-white/10">
                  <div className="flex items-center gap-2 px-2.5 py-2">
                    <span className="grid size-8 shrink-0 place-items-center rounded-xl text-[10px] font-bold text-white" style={{ background: f.color }}>
                      {f.items.length || "·"}
                    </span>
                    <input
                      value={f.name}
                      onChange={(ev) => renameRailFolder(e.id, ev.target.value)}
                      className="min-w-0 flex-1 rounded-md bg-black/25 px-2 py-1 text-sm font-semibold outline-none ring-accent focus:ring-1"
                      maxLength={24}
                      aria-label="Folder name"
                    />
                    <div className="flex gap-0.5">
                      {FOLDER_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          title={c}
                          onClick={() => setRailFolderColor(e.id, c)}
                          className={cn("size-4 rounded-full ring-offset-1 ring-offset-[#1e1f22]", f.color === c && "ring-2 ring-white")}
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                    <IconBtn label="Move up" onClick={() => moveRailEntryBy(e.id, "folder", -1)}>
                      <ChevronUp className="size-4" />
                    </IconBtn>
                    <IconBtn label="Move down" onClick={() => moveRailEntryBy(e.id, "folder", 1)}>
                      <ChevronDown className="size-4" />
                    </IconBtn>
                    <IconBtn label="Delete folder" onClick={() => deleteRailFolder(e.id)}>
                      <Trash2 className="size-4 text-dnd" />
                    </IconBtn>
                  </div>
                  <div className="space-y-1 border-t border-white/5 px-2 py-2">
                    {f.items.length === 0 && <div className="px-1 text-[11px] text-sub">Empty — add icons below</div>}
                    {f.items.map((hid) => (
                      <div key={hid} className="flex items-center gap-1 rounded-lg bg-black/20 px-2 py-1.5">
                        <div className="min-w-0 flex-1 truncate text-xs font-medium">{HUB_META[hid].label}</div>
                        <IconBtn label="Move up in folder" onClick={() => moveHubInFolder(e.id, hid, -1)}>
                          <ChevronUp className="size-3.5" />
                        </IconBtn>
                        <IconBtn label="Move down in folder" onClick={() => moveHubInFolder(e.id, hid, 1)}>
                          <ChevronDown className="size-3.5" />
                        </IconBtn>
                        <button
                          type="button"
                          className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-sub hover:bg-white/5 hover:text-txt"
                          onClick={() => removeHubFromFolder(e.id, hid)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    {topLevelHubs.length > 0 && (
                      <select
                        className="mt-1 w-full rounded-lg bg-black/30 px-2 py-1.5 text-xs outline-none"
                        defaultValue=""
                        onChange={(ev) => {
                          const v = ev.target.value as RailHubId;
                          if (v) addHubToFolder(e.id, v);
                          ev.target.value = "";
                        }}
                      >
                        <option value="" disabled>
                          Add icon to folder…
                        </option>
                        {topLevelHubs.map((hid) => (
                          <option key={hid} value={hid}>
                            {HUB_META[hid].label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              );
            })}
          </section>

          <section className="space-y-2 rounded-xl bg-white/[.04] p-3 ring-1 ring-white/10">
            <div className="text-[11px] font-bold tracking-wide text-sub uppercase">New folder</div>
            <div className="flex gap-2">
              <input
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="Folder name"
                maxLength={24}
                className="min-w-0 flex-1 rounded-lg bg-black/30 px-3 py-2 text-sm outline-none ring-accent focus:ring-1"
              />
              <button
                type="button"
                onClick={() => {
                  createRailFolder(folderName || "Folder");
                  haptic.light();
                  setFolderName("Folder");
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-bold text-white"
              >
                <FolderPlus className="size-4" /> Create
              </button>
            </div>
            <p className="text-[11px] text-sub">Create an empty folder, then add icons from the dropdown inside it.</p>
          </section>

          <section className="space-y-2 rounded-xl bg-white/[.04] p-3 ring-1 ring-white/10">
            <div className="text-[11px] font-bold tracking-wide text-sub uppercase">Share as template</div>
            <input
              value={shareName}
              onChange={(e) => setShareName(e.target.value)}
              placeholder="Template name"
              maxLength={40}
              className="w-full rounded-lg bg-black/30 px-3 py-2 text-sm outline-none ring-accent focus:ring-1"
            />
            <button type="button" onClick={() => void copyShare()} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white/10 py-2.5 text-sm font-semibold hover:bg-white/15">
              <Copy className="size-4" /> Copy template link
            </button>
            <div className="text-[11px] font-bold tracking-wide text-sub uppercase">Import template</div>
            <textarea
              value={importCode}
              onChange={(e) => setImportCode(e.target.value)}
              rows={2}
              placeholder="Paste nexusrail1… code or link"
              className="w-full resize-none rounded-lg bg-black/30 px-3 py-2 font-mono text-[11px] outline-none ring-accent focus:ring-1"
            />
            <button
              type="button"
              disabled={!importCode.trim()}
              onClick={applyImport}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent/90 py-2.5 text-sm font-bold text-white disabled:opacity-40"
            >
              <Link2 className="size-4" /> Apply template
            </button>
          </section>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-white/10 px-4 py-3">
          <button
            type="button"
            onClick={() => {
              resetRailLayout();
              toast("Rail reset to default", "info");
            }}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-sub hover:bg-white/5 hover:text-txt"
          >
            <RotateCcw className="size-3.5" /> Reset
          </button>
          <button type="button" onClick={onClose} className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-white">
            Done
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function Row({ title, subtitle, onUp, onDown }: { title: string; subtitle: string; onUp: () => void; onDown: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-white/[.04] px-2.5 py-2 ring-1 ring-white/5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{title}</div>
        <div className="truncate text-[11px] text-sub">{subtitle}</div>
      </div>
      <IconBtn label="Move up" onClick={onUp}>
        <ChevronUp className="size-4" />
      </IconBtn>
      <IconBtn label="Move down" onClick={onDown}>
        <ChevronDown className="size-4" />
      </IconBtn>
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="grid size-8 place-items-center rounded-lg text-sub hover:bg-white/10 hover:text-txt">
      {children}
    </button>
  );
}

/** Apply `#nexusrail1.…` from the URL once on mount. */
export function applyRailTemplateFromHash() {
  if (typeof window === "undefined") return;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash.includes("nexusrail1.")) return;
  const res = importRailTemplate(hash);
  if (res.ok) {
    toast(res.name ? `Rail template “${res.name}” applied` : "Rail template applied", "success");
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}
