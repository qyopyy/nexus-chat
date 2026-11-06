/** Per-conversation chat wallpaper overrides (localStorage). */

const KEY = "nexus.chat.wallpapers";

type WallpaperMap = Record<string, string>;

const listeners = new Set<() => void>();

function load(): WallpaperMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: WallpaperMap = {};
    for (const [id, url] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof url === "string" && url.trim()) out[id] = url.trim();
    }
    return out;
  } catch {
    return {};
  }
}

function save(map: WallpaperMap) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* quota / private mode */
  }
  for (const cb of listeners) cb();
}

export function getChatWallpaper(conversationId: string): string | null {
  const url = load()[conversationId];
  return url || null;
}

export function setChatWallpaper(conversationId: string, url: string) {
  const trimmed = url.trim();
  if (!trimmed) {
    clearChatWallpaper(conversationId);
    return;
  }
  const map = load();
  map[conversationId] = trimmed;
  save(map);
}

export function clearChatWallpaper(conversationId: string) {
  const map = load();
  if (!(conversationId in map)) return;
  delete map[conversationId];
  save(map);
}

export function subscribeChatWallpapers(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Read a local image file as a data URL (for wallpaper upload). */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") resolve(result);
      else reject(new Error("Could not read file"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}
