// Profile banner + colour helpers (pure, no DOM): one place that turns a saved banner colour / image into valid CSS,
// and decides how a picked picture is uploaded. Saved banner_color can be "#hex" or a whole "linear-gradient(...)".

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const GRADIENT = /^(linear|radial|conic)-gradient\(.+\)$/i;
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\)|hsla?\([\d\s.,%deg/]+\))$/i;

export const isGradient = (v: unknown): v is string => typeof v === "string" && GRADIENT.test(v.trim());

/** "#abc" → "#aabbcc"; anything else → null. */
export function normalizeHex(v: unknown): string | null {
  if (typeof v !== "string" || !HEX.test(v.trim())) return null;
  let h = v.trim().toLowerCase();
  if (h.length === 4) h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  return h;
}

/** CSS `background` for a banner colour. Gradients pass through, hex becomes a soft gradient, other colours are solid; junk gets the fallback. */
export function bannerBackground(color: string | null | undefined, fallback = "#5865f2", tail = "#1e1f22"): string {
  const c = (color ?? "").trim();
  if (isGradient(c)) return c;
  const hex = normalizeHex(c);
  if (hex) return `linear-gradient(135deg, ${hex}, ${hex}66)`;
  if (SAFE_COLOR.test(c)) return c;
  const fb = normalizeHex(fallback);
  return fb ? `linear-gradient(135deg, ${fb}, ${tail})` : "#5865f2";
}

/** React style for a banner area: the picture (cover) when there is one, else the colour. */
export function bannerStyle(
  url: string | null | undefined,
  color: string | null | undefined,
  fallback?: string | null,
): { background?: string; backgroundImage?: string; backgroundSize?: string; backgroundPosition?: string } {
  if (url && /^https?:\/\//i.test(url)) return { backgroundImage: `linear-gradient(0deg, rgba(0,0,0,0), rgba(0,0,0,0)), url("${url.replace(/["\\\n\r]/g, "")}")`, backgroundSize: "cover", backgroundPosition: "center" };
  return { background: bannerBackground(color || fallback, fallback ?? "#5865f2") };
}

// ------------------------------------------------------------------ uploads

export const MAX_ANIMATED_BYTES = 8 * 1024 * 1024;
export const MAX_PICK_BYTES = 40 * 1024 * 1024;
const OK_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

/** True if these first bytes of a WebP file carry an animation chunk (ANIM). */
export function isAnimatedWebp(head: Uint8Array): boolean {
  if (head.length < 16) return false;
  const s = (a: number, t: string) => [...t].every((c, i) => head[a + i] === c.charCodeAt(0));
  if (!s(0, "RIFF") || !s(8, "WEBP")) return false;
  for (let i = 12; i + 4 <= Math.min(head.length, 200); i++) if (s(i, "ANIM")) return true;
  return false;
}

export type UploadPlan =
  | { ok: true; keepOriginal: boolean; ext: string }
  | { ok: false; error: string };

/** What to do with a picked image: keep animated GIF/WebP as they are (≤ 8 MB), shrink the rest, refuse formats browsers can't show. */
export function planProfileImage(file: { type: string; size: number }, animatedWebp = false): UploadPlan {
  const type = (file.type || "").toLowerCase();
  if (file.size <= 0) return { ok: false, error: "That file is empty." };
  if (file.size > MAX_PICK_BYTES) return { ok: false, error: "That picture is over 40 MB. Pick a smaller one." };
  if (/heic|heif/.test(type)) return { ok: false, error: "HEIC photos can't be used here. Take a screenshot of it, or export it as JPG." };
  if (type && !type.startsWith("image/")) return { ok: false, error: "Pick an image (JPG, PNG, WebP or GIF)." };
  const animated = type === "image/gif" || (type === "image/webp" && animatedWebp);
  if (animated) {
    if (file.size > MAX_ANIMATED_BYTES) return { ok: false, error: "Animated pictures can be up to 8 MB. Pick a smaller GIF." };
    return { ok: true, keepOriginal: true, ext: EXT[type] };
  }
  return { ok: true, keepOriginal: false, ext: "jpg" };
}

/** After shrinking: what we are about to upload must be something every browser can show. */
export function uploadable(blobType: string): string | null {
  const t = (blobType || "").toLowerCase();
  return OK_TYPES.includes(t) ? EXT[t] : null;
}
