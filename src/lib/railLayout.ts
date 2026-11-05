"use client";

import { create } from "zustand";
import { loadJSON, saveJSON } from "@/lib/utils";

/** Built-in left-rail hub icons (spaces stay below the divider). */
export type RailHubId =
  | "dm"
  | "gram"
  | "videos"
  | "live"
  | "pulse"
  | "music"
  | "cutroom"
  | "radio"
  | "games"
  | "apps"
  | "studio"
  | "staff";

export const RAIL_HUB_IDS: RailHubId[] = [
  "dm",
  "gram",
  "videos",
  "live",
  "pulse",
  "music",
  "cutroom",
  "radio",
  "games",
  "apps",
  "studio",
  "staff",
];

export type RailFolder = {
  id: string;
  name: string;
  color: string;
  items: RailHubId[];
};

export type RailEntry = { kind: "hub"; id: RailHubId } | { kind: "folder"; id: string };

export type RailLayoutState = {
  entries: RailEntry[];
  folders: Record<string, RailFolder>;
};

const KEY = "nexus.railLayout";
const FOLDER_COLORS = ["#5865f2", "#eb459e", "#23a55a", "#f0b232", "#00a8fc", "#ed4245", "#9146ff", "#1DB954"];

export const DEFAULT_ENTRIES: RailEntry[] = RAIL_HUB_IDS.map((id) => ({ kind: "hub", id }));

const EMPTY: RailLayoutState = { entries: DEFAULT_ENTRIES, folders: {} };

function isHub(id: string): id is RailHubId {
  return (RAIL_HUB_IDS as string[]).includes(id);
}

function sanitize(raw: Partial<RailLayoutState> | null | undefined): RailLayoutState {
  const folders: Record<string, RailFolder> = {};
  const used = new Set<RailHubId>();
  if (raw?.folders && typeof raw.folders === "object") {
    for (const [id, f] of Object.entries(raw.folders)) {
      if (!f || typeof f !== "object") continue;
      const items = (Array.isArray(f.items) ? f.items : []).filter(isHub).filter((h) => {
        if (used.has(h)) return false;
        used.add(h);
        return true;
      });
      folders[id] = {
        id,
        name: String(f.name || "Folder").slice(0, 24),
        color: typeof f.color === "string" && f.color.startsWith("#") ? f.color : FOLDER_COLORS[0],
        items,
      };
    }
  }

  const entries: RailEntry[] = [];
  const seenFolder = new Set<string>();
  const list = Array.isArray(raw?.entries) ? raw!.entries : DEFAULT_ENTRIES;
  for (const e of list) {
    if (!e || typeof e !== "object") continue;
    if (e.kind === "hub" && isHub(e.id) && !used.has(e.id)) {
      used.add(e.id);
      entries.push({ kind: "hub", id: e.id });
    } else if (e.kind === "folder" && folders[e.id] && !seenFolder.has(e.id)) {
      seenFolder.add(e.id);
      entries.push({ kind: "folder", id: e.id });
    }
  }
  // Append any hubs missing from the layout (new features)
  for (const id of RAIL_HUB_IDS) {
    if (!used.has(id)) entries.push({ kind: "hub", id });
  }
  // Drop empty folder refs already handled; prune orphan folders not in entries
  for (const id of Object.keys(folders)) {
    if (!seenFolder.has(id) && !entries.some((e) => e.kind === "folder" && e.id === id)) {
      // keep orphan folders only if they have items — re-add
      if (folders[id].items.length) entries.push({ kind: "folder", id });
      else delete folders[id];
    }
  }
  return { entries, folders };
}

export const useRailLayout = create<RailLayoutState>(() => {
  if (typeof window === "undefined") return EMPTY;
  return sanitize(loadJSON<RailLayoutState>(KEY, EMPTY));
});

function persist() {
  saveJSON(KEY, useRailLayout.getState());
}

function setLayout(next: RailLayoutState) {
  useRailLayout.setState(sanitize(next));
  persist();
}

export function resetRailLayout() {
  setLayout({ entries: DEFAULT_ENTRIES, folders: {} });
}

export function moveRailEntry(from: number, to: number) {
  const { entries, folders } = useRailLayout.getState();
  if (from < 0 || to < 0 || from >= entries.length || to >= entries.length || from === to) return;
  const next = [...entries];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  setLayout({ entries: next, folders });
}

export function moveRailEntryBy(id: string, kind: RailEntry["kind"], dir: -1 | 1) {
  const { entries } = useRailLayout.getState();
  const i = entries.findIndex((e) => e.kind === kind && e.id === id);
  if (i < 0) return;
  moveRailEntry(i, i + dir);
}

export function createRailFolder(name = "Folder", hubIds: RailHubId[] = []) {
  const { entries, folders } = useRailLayout.getState();
  const id = `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const take = hubIds.filter((h) => {
    // only hubs currently at top level
    return entries.some((e) => e.kind === "hub" && e.id === h);
  });
  const color = FOLDER_COLORS[Object.keys(folders).length % FOLDER_COLORS.length];
  const nextFolders = {
    ...folders,
    [id]: { id, name: name.trim().slice(0, 24) || "Folder", color, items: take },
  };
  const nextEntries = entries.filter((e) => !(e.kind === "hub" && take.includes(e.id)));
  // insert folder near first removed hub, else at end of hubs
  let insertAt = nextEntries.length;
  if (take.length) {
    const firstRemoved = entries.findIndex((e) => e.kind === "hub" && e.id === take[0]);
    if (firstRemoved >= 0) insertAt = Math.min(firstRemoved, nextEntries.length);
  }
  nextEntries.splice(insertAt, 0, { kind: "folder", id });
  setLayout({ entries: nextEntries, folders: nextFolders });
  return id;
}

export function renameRailFolder(id: string, name: string) {
  const { entries, folders } = useRailLayout.getState();
  const f = folders[id];
  if (!f) return;
  setLayout({
    entries,
    folders: { ...folders, [id]: { ...f, name: name.trim().slice(0, 24) || f.name } },
  });
}

export function setRailFolderColor(id: string, color: string) {
  const { entries, folders } = useRailLayout.getState();
  const f = folders[id];
  if (!f) return;
  setLayout({ entries, folders: { ...folders, [id]: { ...f, color } } });
}

export function deleteRailFolder(id: string) {
  const { entries, folders } = useRailLayout.getState();
  const f = folders[id];
  if (!f) return;
  const nextFolders = { ...folders };
  delete nextFolders[id];
  const nextEntries: RailEntry[] = [];
  for (const e of entries) {
    if (e.kind === "folder" && e.id === id) {
      for (const h of f.items) nextEntries.push({ kind: "hub", id: h });
    } else nextEntries.push(e);
  }
  setLayout({ entries: nextEntries, folders: nextFolders });
}

export function addHubToFolder(folderId: string, hubId: RailHubId) {
  const { entries, folders } = useRailLayout.getState();
  const f = folders[folderId];
  if (!f || f.items.includes(hubId)) return;
  // remove hub from top-level or other folders
  let nextFolders: Record<string, RailFolder> = { ...folders };
  for (const [fid, folder] of Object.entries(nextFolders)) {
    if (folder.items.includes(hubId)) {
      nextFolders[fid] = { ...folder, items: folder.items.filter((x) => x !== hubId) };
    }
  }
  nextFolders[folderId] = { ...nextFolders[folderId], items: [...nextFolders[folderId].items, hubId] };
  const nextEntries = entries.filter((e) => !(e.kind === "hub" && e.id === hubId));
  setLayout({ entries: nextEntries, folders: nextFolders });
}

export function removeHubFromFolder(folderId: string, hubId: RailHubId) {
  const { entries, folders } = useRailLayout.getState();
  const f = folders[folderId];
  if (!f || !f.items.includes(hubId)) return;
  const nextFolders = {
    ...folders,
    [folderId]: { ...f, items: f.items.filter((x) => x !== hubId) },
  };
  const fi = entries.findIndex((e) => e.kind === "folder" && e.id === folderId);
  const nextEntries = [...entries];
  nextEntries.splice(fi >= 0 ? fi + 1 : nextEntries.length, 0, { kind: "hub", id: hubId });
  setLayout({ entries: nextEntries, folders: nextFolders });
}

export function moveHubInFolder(folderId: string, hubId: RailHubId, dir: -1 | 1) {
  const { entries, folders } = useRailLayout.getState();
  const f = folders[folderId];
  if (!f) return;
  const i = f.items.indexOf(hubId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= f.items.length) return;
  const items = [...f.items];
  [items[i], items[j]] = [items[j], items[i]];
  setLayout({ entries, folders: { ...folders, [folderId]: { ...f, items } } });
}

export type RailTemplate = {
  v: 1;
  name?: string;
  entries: RailEntry[];
  folders: Record<string, RailFolder>;
};

export function exportRailTemplate(name?: string): string {
  const { entries, folders } = useRailLayout.getState();
  const payload: RailTemplate = { v: 1, name: name?.slice(0, 40), entries, folders };
  const json = JSON.stringify(payload);
  const b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `nexusrail1.${b64}`;
}

export function importRailTemplate(code: string): { ok: true; name?: string } | { ok: false; error: string } {
  const raw = code.trim().replace(/^nexusrail:\/\//i, "").replace(/^https?:\/\/[^\s#]*#?/i, "");
  const m = raw.match(/nexusrail1\.([A-Za-z0-9_-]+)/);
  const body = m ? m[1] : raw.startsWith("nexusrail1.") ? raw.slice("nexusrail1.".length) : raw;
  try {
    const padded = body.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((body.length + 3) % 4);
    const json = decodeURIComponent(escape(atob(padded)));
    const data = JSON.parse(json) as RailTemplate;
    if (!data || data.v !== 1) return { ok: false, error: "Unknown template version" };
    setLayout({ entries: data.entries, folders: data.folders || {} });
    return { ok: true, name: data.name };
  } catch {
    return { ok: false, error: "Couldn't read that template" };
  }
}

export function railTemplateShareUrl(code: string) {
  if (typeof window === "undefined") return code;
  return `${window.location.origin}${window.location.pathname}#${code}`;
}

export { FOLDER_COLORS };
