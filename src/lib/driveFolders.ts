// Folder helpers for Nexus Drive. A file's `folder` is a plain string; "Music/Masters" means a folder inside "Music".
// Everything here is pure so it can be tested without a browser.

export const MAX_FOLDER = 100; // vault_files.folder is cut to this length on insert

export function cleanFolder(s: string): string {
  return s
    .replace(/\\/g, "/")
    .split("/")
    .map((p) => p.trim())
    .filter((p) => p && p !== "." && p !== "..")
    .join("/")
    .slice(0, MAX_FOLDER)
    .replace(/\/+$/, "");
}
export const joinPath = (...parts: string[]) => cleanFolder(parts.filter(Boolean).join("/"));
export const parentPath = (p: string) => p.split("/").slice(0, -1).join("/");
export const baseName = (p: string) => p.split("/").pop() ?? p;

export function breadcrumbs(path: string): { name: string; path: string }[] {
  const parts = cleanFolder(path).split("/").filter(Boolean);
  return parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join("/") }));
}

type F = { folder: string };

/** Files that sit directly in `path` (not in a sub-folder). */
export const filesIn = <T extends F>(files: T[], path: string) => files.filter((f) => cleanFolder(f.folder) === cleanFolder(path));

/** Immediate sub-folders of `path`, with how many files they hold in total (including deeper levels). */
export function childFolders(files: F[], path: string, extra: string[] = []): { name: string; path: string; count: number }[] {
  const base = cleanFolder(path);
  const prefix = base ? base + "/" : "";
  const map = new Map<string, number>();
  const add = (folder: string, n: number) => {
    const f = cleanFolder(folder);
    if (!f.startsWith(prefix) || f === base) return;
    const name = f.slice(prefix.length).split("/")[0]!;
    map.set(name, (map.get(name) ?? 0) + n);
  };
  for (const f of files) add(f.folder, 1);
  for (const e of extra) add(e, 0); // empty folders the user just made
  return [...map.entries()].map(([name, count]) => ({ name, path: prefix + name, count })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/** Same file picked again after a reload = same fingerprint, so its upload can continue. */
export const fingerprint = (f: { name: string; size: number; lastModified?: number }, folder: string) => `${cleanFolder(folder)}|${f.name}|${f.size}|${f.lastModified ?? 0}`;

// ------------------------------------------------------------------ folder sync
export type LocalFile = { rel: string; size: number; mtime: number };
export type RemoteFile = { name: string; folder: string; bytes: number };
export const syncKey = (l: LocalFile) => `${l.rel}|${l.size}|${l.mtime}`;

/**
 * Which local files still need uploading. A file counts as there if the drive already holds the same name + size
 * in the matching folder, or if an earlier sync of the very same file (path, size, mtime) finished.
 */
export function planSync(local: LocalFile[], remote: RemoteFile[], root: string, done: ReadonlySet<string> = new Set()): LocalFile[] {
  const have = new Set(remote.map((r) => `${cleanFolder(r.folder)}|${r.name}|${r.bytes}`));
  return local.filter((l) => {
    if (done.has(syncKey(l))) return false;
    const folder = joinPath(root, parentPath(l.rel));
    return !have.has(`${folder}|${baseName(l.rel)}|${l.size}`);
  });
}

// ------------------------------------------------------------------ what a file is
export type Playable = "video" | "audio" | "image" | "pdf" | "other";
const LOSSLESS = /\.(flac|wav|aiff?|alac|ape|wv)$/i;
export const isLossless = (name: string, mime?: string | null) => LOSSLESS.test(name) || /audio\/(flac|x-flac|wav|x-wav|aiff|x-aiff)/i.test(mime ?? "");
export function playableKind(name: string, mime?: string | null): Playable {
  const m = mime ?? "";
  if (m.startsWith("video/") || /\.(mp4|m4v|mov|webm|mkv|avi|ogv)$/i.test(name)) return "video";
  if (m.startsWith("audio/") || /\.(mp3|wav|flac|aiff?|m4a|ogg|oga|opus|aac|alac|wma)$/i.test(name)) return "audio";
  if (m.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif|svg|heic)$/i.test(name)) return "image";
  if (m === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  return "other";
}
/** Direct media links we can hand to <video>/<audio>. Returns null when the text isn't an http(s) URL. */
export function parseStreamUrl(text: string): { url: string; kind: "video" | "audio"; name: string } | null {
  let u: URL;
  try {
    u = new URL(text.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const name = decodeURIComponent(baseName(u.pathname)) || u.hostname;
  const k = playableKind(name);
  return { url: u.toString(), kind: k === "audio" ? "audio" : "video", name };
}
export const isHls = (url: string) => /\.m3u8(\?|#|$)/i.test(url);
