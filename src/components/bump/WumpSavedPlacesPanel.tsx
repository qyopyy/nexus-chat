"use client";

import { useEffect, useMemo, useState } from "react";
import { Bookmark, ExternalLink, Folder, FolderPlus, MapPin, Pencil, Trash2, X } from "lucide-react";
import { appleMapsLink } from "@/lib/appleMaps";
import { timeAgo } from "@/lib/videos";
import { wumpPlaceSubtitle, type WumpSavedPlace } from "@/lib/wumpPlaces";
import { createPlaceFolder, deletePlaceFolder, listPlaceFolders, renamePlaceFolder, setPlaceFolder, type WumpPlaceFolder } from "@/lib/wumpShare";
import { cn } from "@/lib/utils";

const FOLDER_EMOJI = ["📁", "🏠", "🍔", "☕", "🎉", "🏋️", "🛍️", "🌳", "🎵", "❤️", "✈️", "🏖️"];

export default function WumpSavedPlacesPanel({
  places,
  open,
  onToggle,
  onDelete,
  onChanged,
  className,
}: {
  places: WumpSavedPlace[];
  open: boolean;
  onToggle: () => void;
  onDelete: (id: string) => void;
  /** a place moved folder — parent keeps its list in sync */
  onChanged?: (id: string, patch: Partial<WumpSavedPlace>) => void;
  className?: string;
}) {
  const [folders, setFolders] = useState<WumpPlaceFolder[]>([]);
  const [active, setActive] = useState<string | "all" | "none">("all");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("📁");
  const [editing, setEditing] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);

  useEffect(() => {
    void listPlaceFolders().then(setFolders);
  }, []);

  const shown = useMemo(
    () => (active === "all" ? places : active === "none" ? places.filter((p) => !p.folder_id) : places.filter((p) => p.folder_id === active)),
    [places, active],
  );
  const count = (id: string) => places.filter((p) => p.folder_id === id).length;

  async function addFolder() {
    if (!name.trim()) return;
    if (editing) {
      if (await renamePlaceFolder(editing, { name: name.trim(), emoji })) setFolders((f) => f.map((x) => (x.id === editing ? { ...x, name: name.trim(), emoji } : x)));
    } else {
      const f = await createPlaceFolder(name, emoji);
      if (f) {
        setFolders((prev) => [...prev, f]);
        setActive(f.id);
      }
    }
    setCreating(false);
    setEditing(null);
    setName("");
  }

  async function move(placeId: string, folderId: string | null) {
    if (await setPlaceFolder(placeId, folderId)) onChanged?.(placeId, { folder_id: folderId });
    setMoving(null);
  }

  return (
    <section className={cn("overflow-hidden rounded-2xl bg-side ring-1 ring-white/5", className)}>
      <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
        <div className="grid size-9 place-items-center rounded-xl bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/20">
          <Bookmark className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold tracking-tight">Saved places</div>
          <div className="text-[11px] text-sub">
            {places.length ? `${places.length} saved · ${folders.length} folder${folders.length === 1 ? "" : "s"}` : "Tap the map or bookmark while Live"}
          </div>
        </div>
        <button type="button" onClick={onToggle} className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-sub transition hover:bg-white/10 hover:text-txt">
          {open ? "Hide" : places.length ? `Show ${places.length}` : "Show"}
        </button>
      </div>

      {open && (
        <>
          <div className="flex gap-1.5 overflow-x-auto border-b border-white/5 px-3 py-2 [scrollbar-width:none]">
            {(
              [
                ["all", "All", places.length],
                ["none", "Unsorted", places.filter((p) => !p.folder_id).length],
              ] as const
            ).map(([id, label, n]) => (
              <button key={id} type="button" onClick={() => setActive(id)} className={cn("shrink-0 rounded-full px-3 py-1 text-[11px] font-bold", active === id ? "bg-sky-500 text-white" : "bg-white/5 text-sub hover:bg-white/10")}>
                {label} · {n}
              </button>
            ))}
            {folders.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setActive(f.id)}
                onDoubleClick={() => (setEditing(f.id), setName(f.name), setEmoji(f.emoji || "📁"), setCreating(true))}
                className={cn("shrink-0 rounded-full px-3 py-1 text-[11px] font-bold", active === f.id ? "bg-sky-500 text-white" : "bg-white/5 text-sub hover:bg-white/10")}
              >
                {f.emoji || "📁"} {f.name} · {count(f.id)}
              </button>
            ))}
            <button type="button" onClick={() => (setEditing(null), setName(""), setEmoji("📁"), setCreating(true))} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/5 px-3 py-1 text-[11px] font-bold text-sky-300 hover:bg-white/10">
              <FolderPlus className="size-3" /> Folder
            </button>
          </div>

          {creating && (
            <div className="space-y-2 border-b border-white/5 bg-black/20 px-3 py-3">
              <div className="flex gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 40))}
                  onKeyDown={(e) => e.key === "Enter" && void addFolder()}
                  autoFocus
                  placeholder="Folder name (Food, Gym, Home…)"
                  className="min-w-0 flex-1 rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-transparent focus:ring-sky-400"
                />
                <button type="button" disabled={!name.trim()} onClick={() => void addFolder()} className="rounded-xl bg-sky-500 px-3 text-xs font-bold text-white disabled:opacity-40">
                  {editing ? "Save" : "Create"}
                </button>
                <button type="button" onClick={() => (setCreating(false), setEditing(null))} className="grid size-9 place-items-center rounded-xl bg-white/5 text-sub" aria-label="Cancel">
                  <X className="size-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {FOLDER_EMOJI.map((e) => (
                  <button key={e} type="button" onClick={() => setEmoji(e)} className={cn("grid size-8 place-items-center rounded-lg text-base", emoji === e ? "bg-sky-500/30 ring-1 ring-sky-400" : "bg-white/5")}>
                    {e}
                  </button>
                ))}
              </div>
              {editing && (
                <button
                  type="button"
                  onClick={() =>
                    void deletePlaceFolder(editing).then((ok) => {
                      if (!ok) return;
                      setFolders((f) => f.filter((x) => x.id !== editing));
                      places.filter((p) => p.folder_id === editing).forEach((p) => onChanged?.(p.id, { folder_id: null }));
                      setActive("all");
                      setCreating(false);
                      setEditing(null);
                    })
                  }
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-dnd"
                >
                  <Trash2 className="size-3" /> Delete folder (places stay saved)
                </button>
              )}
            </div>
          )}

          <ul className="max-h-72 divide-y divide-white/5 overflow-y-auto">
            {!shown.length ? (
              <li className="flex items-start gap-3 px-4 py-5">
                <MapPin className="mt-0.5 size-4 shrink-0 text-sub" />
                <div>
                  <div className="text-sm font-semibold text-txt">{places.length ? "Nothing in this folder" : "No places yet"}</div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-sub">
                    {places.length ? "Use the folder button on a place to move it here." : "Tap anywhere on the map to name a spot, or save your Live location with the bookmark control."}
                  </p>
                </div>
              </li>
            ) : (
              shown.map((p) => {
                const f = folders.find((x) => x.id === p.folder_id);
                return (
                  <li key={p.id} className="px-3 py-2.5 sm:px-4">
                    <div className="flex items-center gap-2.5">
                      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/5 text-sky-300">{f?.emoji ? <span className="text-base">{f.emoji}</span> : <MapPin className="size-3.5" />}</div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-txt">{p.name}</div>
                        <div className="truncate text-[11px] text-sub">
                          {wumpPlaceSubtitle(p)}
                          {p.created_at ? ` · ${timeAgo(p.created_at)}` : ""}
                        </div>
                      </div>
                      <a
                        href={appleMapsLink(p.lat, p.lng, p.name)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2.5 py-1 text-[11px] font-bold text-sky-300 transition hover:bg-sky-500/25"
                        aria-label={`Open ${p.name} in Maps`}
                      >
                        Maps
                        <ExternalLink className="size-2.5 opacity-70" />
                      </a>
                      <button type="button" onClick={() => setMoving(moving === p.id ? null : p.id)} className="grid size-8 place-items-center rounded-full text-sub transition hover:bg-white/10 hover:text-txt" aria-label={`Move ${p.name} to a folder`} title="Folder">
                        <Folder className="size-3.5" />
                      </button>
                      <button type="button" onClick={() => onDelete(p.id)} className="grid size-8 place-items-center rounded-full text-sub transition hover:bg-white/10 hover:text-dnd" aria-label={`Remove ${p.name}`} title="Remove">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    {moving === p.id && (
                      <div className="mt-2 flex flex-wrap gap-1.5 pl-11">
                        <button type="button" onClick={() => void move(p.id, null)} className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", !p.folder_id ? "bg-sky-500 text-white" : "bg-white/5 text-sub")}>
                          Unsorted
                        </button>
                        {folders.map((x) => (
                          <button key={x.id} type="button" onClick={() => void move(p.id, x.id)} className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", p.folder_id === x.id ? "bg-sky-500 text-white" : "bg-white/5 text-sub")}>
                            {x.emoji || "📁"} {x.name}
                          </button>
                        ))}
                        {!folders.length && <span className="text-[11px] text-sub">Create a folder first ↑</span>}
                      </div>
                    )}
                  </li>
                );
              })
            )}
          </ul>
          {folders.length > 0 && (
            <p className="flex items-center gap-1 px-4 py-2 text-[10px] text-sub">
              <Pencil className="size-2.5" /> Double-tap a folder to rename or delete it
            </p>
          )}
        </>
      )}
    </section>
  );
}
