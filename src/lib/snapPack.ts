// Nexus Snap · the "Pack": 14 extra looks, 8 frames, 6 sticker packs, sticker size and corner, 5 caption styles, caption
// position, frame colours, watermark, event caption, daily prompt, featured picks, Surprise me, recents and more.
// Pure data + canvas drawing helpers (no React, no network). The owner switches groups on or off live from the server
// (Live Control): see packFlags().

type G = CanvasRenderingContext2D;

/** Rounded-rectangle path that also works on older Safari (no ctx.roundRect). */
function roundPath(g: G, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.min(r, w / 2, h / 2);
  g.moveTo(x + k, y);
  g.arcTo(x + w, y, x + w, y + h, k);
  g.arcTo(x + w, y + h, x, y + h, k);
  g.arcTo(x, y + h, x, y, k);
  g.arcTo(x, y, x + w, y, k);
  g.closePath();
}

// ------------------------------------------------------------------ looks (one recipe → CSS filter AND pixel maths)
export type LookParams = { gray?: number; sepia?: number; hue?: number; sat?: number; con?: number; bri?: number };
export type PackLook = { key: string; label: string; p: LookParams };

export const PACK_LOOKS: PackLook[] = [
  { key: "golden", label: "Golden", p: { sepia: 0.25, sat: 1.25, bri: 1.05, hue: -8 } },
  { key: "rose", label: "Rose", p: { sepia: 0.15, hue: -28, sat: 1.2, bri: 1.03 } },
  { key: "mint", label: "Mint", p: { hue: 38, sat: 1.1, bri: 1.05, con: 0.96 } },
  { key: "dream", label: "Dream", p: { con: 0.88, bri: 1.12, sat: 1.2 } },
  { key: "punch", label: "Punch", p: { con: 1.35, sat: 1.4 } },
  { key: "cyber", label: "Cyber", p: { hue: 190, sat: 1.5, con: 1.15 } },
  { key: "retro", label: "Retro", p: { sepia: 0.55, con: 1.1, hue: -10, sat: 1.1 } },
  { key: "ice", label: "Ice", p: { hue: 160, sat: 0.9, bri: 1.08, con: 1.05 } },
  { key: "sunset", label: "Sunset", p: { sepia: 0.3, hue: -20, sat: 1.5, bri: 1.04 } },
  { key: "forest", label: "Forest", p: { hue: 40, sat: 1.2, con: 1.05, bri: 0.98 } },
  { key: "dusk", label: "Dusk", p: { hue: -35, sat: 1.15, con: 1.12, bri: 0.92 } },
  { key: "matte", label: "Matte", p: { con: 0.85, bri: 1.05, sat: 0.85 } },
  { key: "hdr", label: "HDR", p: { con: 1.3, sat: 1.25, bri: 1.02 } },
  { key: "chrome", label: "Chrome", p: { gray: 0.35, con: 1.25, sat: 1.1 } },
];
export const PACK_LOOK_KEYS: readonly string[] = PACK_LOOKS.map((l) => l.key);
export const lookByKey = (k: string | null | undefined) => PACK_LOOKS.find((l) => l.key === k) ?? null;

const f2 = (n: number) => String(Math.round(n * 100) / 100);
/** The same look as a CSS filter (live preview and video recording). */
export function lookCss(p: LookParams): string {
  const parts: string[] = [];
  if (p.gray) parts.push(`grayscale(${f2(p.gray)})`);
  if (p.sepia) parts.push(`sepia(${f2(p.sepia)})`);
  if (p.hue) parts.push(`hue-rotate(${Math.round(p.hue)}deg)`);
  if (p.sat !== undefined && p.sat !== 1) parts.push(`saturate(${f2(p.sat)})`);
  if (p.con !== undefined && p.con !== 1) parts.push(`contrast(${f2(p.con)})`);
  if (p.bri !== undefined && p.bri !== 1) parts.push(`brightness(${f2(p.bri)})`);
  return parts.length ? parts.join(" ") : "none";
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Same recipe applied to RGBA pixels, in place (works where ctx.filter does not). Order matches the CSS filter. */
export function applyLookPixels(d: Uint8ClampedArray | number[], p: LookParams): void {
  const hue = ((p.hue ?? 0) * Math.PI) / 180;
  const cs = Math.cos(hue);
  const sn = Math.sin(hue);
  // CSS hue-rotate matrix
  const m = [
    0.213 + cs * 0.787 - sn * 0.213, 0.715 - cs * 0.715 - sn * 0.715, 0.072 - cs * 0.072 + sn * 0.928,
    0.213 - cs * 0.213 + sn * 0.143, 0.715 + cs * 0.285 + sn * 0.14, 0.072 - cs * 0.072 - sn * 0.283,
    0.213 - cs * 0.213 - sn * 0.787, 0.715 - cs * 0.715 + sn * 0.715, 0.072 + cs * 0.928 + sn * 0.072,
  ];
  const gray = p.gray ?? 0;
  const sepia = p.sepia ?? 0;
  const sat = p.sat ?? 1;
  const con = p.con ?? 1;
  const bri = p.bri ?? 1;
  for (let i = 0; i + 2 < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    if (gray) {
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r += (l - r) * gray; g += (l - g) * gray; b += (l - b) * gray;
    }
    if (sepia) {
      const sr = 0.393 * r + 0.769 * g + 0.189 * b;
      const sg = 0.349 * r + 0.686 * g + 0.168 * b;
      const sb = 0.272 * r + 0.534 * g + 0.131 * b;
      r += (sr - r) * sepia; g += (sg - g) * sepia; b += (sb - b) * sepia;
    }
    if (hue) {
      const nr = m[0] * r + m[1] * g + m[2] * b;
      const ng = m[3] * r + m[4] * g + m[5] * b;
      const nb = m[6] * r + m[7] * g + m[8] * b;
      r = nr; g = ng; b = nb;
    }
    if (sat !== 1) {
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
    }
    if (con !== 1) {
      r = (r - 128) * con + 128; g = (g - 128) * con + 128; b = (b - 128) * con + 128;
    }
    if (bri !== 1) {
      r *= bri; g *= bri; b *= bri;
    }
    d[i] = clamp(r); d[i + 1] = clamp(g); d[i + 2] = clamp(b);
  }
}

// ------------------------------------------------------------------ frames
export type PackFrame = { key: string; label: string; tinted: boolean };
export const PACK_FRAMES: PackFrame[] = [
  { key: "neon", label: "Neon", tinted: true },
  { key: "scan", label: "Scanlines", tinted: false },
  { key: "cinema", label: "Cinema", tinted: false },
  { key: "corners", label: "Viewfinder", tinted: true },
  { key: "rounded", label: "Rounded", tinted: true },
  { key: "leak", label: "Light leak", tinted: true },
  { key: "glow", label: "Glow", tinted: true },
  { key: "strip", label: "Film strip", tinted: false },
];
export const PACK_FRAME_KEYS: readonly string[] = PACK_FRAMES.map((f) => f.key);
export const isPackFrame = (k: string | null | undefined) => PACK_FRAME_KEYS.includes(k ?? "");

export const FRAME_COLORS = [
  { key: "white", label: "White", hex: "#ffffff" },
  { key: "pink", label: "Pink", hex: "#ff2bd6" },
  { key: "cyan", label: "Cyan", hex: "#00e5ff" },
  { key: "lime", label: "Lime", hex: "#b6ff00" },
  { key: "red", label: "Red", hex: "#ff2a2a" },
  { key: "gold", label: "Gold", hex: "#ffc933" },
] as const;
export const frameColorKey = (k: unknown): string => (FRAME_COLORS.some((c) => c.key === k) ? (k as string) : "white");
export const frameHex = (k: unknown) => FRAME_COLORS.find((c) => c.key === k)?.hex ?? "#ffffff";

export function drawPackFrame(g: G, w: number, h: number, key: string, hex = "#ffffff") {
  g.save();
  const u = w / 100;
  switch (key) {
    case "neon": {
      g.strokeStyle = hex;
      g.shadowColor = hex;
      g.shadowBlur = u * 2.4;
      g.lineWidth = u * 1.1;
      g.strokeRect(u * 3, u * 3, w - u * 6, h - u * 6);
      g.shadowBlur = 0;
      g.globalAlpha = 0.55;
      g.lineWidth = u * 0.35;
      g.strokeRect(u * 5, u * 5, w - u * 10, h - u * 10);
      break;
    }
    case "scan": {
      g.fillStyle = "rgba(0,0,0,.2)";
      const step = Math.max(3, Math.round(u * 0.9));
      for (let y = 0; y < h; y += step * 2) g.fillRect(0, y, w, step);
      break;
    }
    case "cinema": {
      g.fillStyle = "#000";
      const bar = h * 0.11;
      g.fillRect(0, 0, w, bar);
      g.fillRect(0, h - bar, w, bar);
      break;
    }
    case "corners": {
      g.strokeStyle = hex;
      g.lineWidth = u * 0.7;
      const a = u * 4, l = u * 9;
      const corner = (x: number, y: number, dx: number, dy: number) => {
        g.beginPath();
        g.moveTo(x + dx * l, y);
        g.lineTo(x, y);
        g.lineTo(x, y + dy * l);
        g.stroke();
      };
      corner(a, a, 1, 1);
      corner(w - a, a, -1, 1);
      corner(a, h - a, 1, -1);
      corner(w - a, h - a, -1, -1);
      g.beginPath();
      g.arc(w - u * 8, u * 8.5, u * 1.1, 0, Math.PI * 2);
      g.fillStyle = "#ff2a2a";
      g.fill();
      break;
    }
    case "rounded": {
      const t = u * 4, r = u * 7;
      g.fillStyle = hex;
      g.beginPath();
      g.rect(0, 0, w, h);
      roundPath(g, t, t, w - t * 2, h - t * 2, r);
      g.fill("evenodd");
      break;
    }
    case "leak": {
      g.globalCompositeOperation = "screen";
      const a = g.createLinearGradient(0, 0, w * 0.55, h * 0.2);
      a.addColorStop(0, hex);
      a.addColorStop(1, "rgba(0,0,0,0)");
      g.globalAlpha = 0.55;
      g.fillStyle = a;
      g.fillRect(0, 0, w, h);
      const b = g.createRadialGradient(w, h, 0, w, h, w * 0.7);
      b.addColorStop(0, hex);
      b.addColorStop(1, "rgba(0,0,0,0)");
      g.globalAlpha = 0.3;
      g.fillStyle = b;
      g.fillRect(0, 0, w, h);
      break;
    }
    case "glow": {
      const depth = u * 14;
      const edge = (x0: number, y0: number, x1: number, y1: number, rx: number, ry: number, rw: number, rh: number) => {
        const gr = g.createLinearGradient(x0, y0, x1, y1);
        gr.addColorStop(0, hex);
        gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr;
        g.fillRect(rx, ry, rw, rh);
      };
      g.globalAlpha = 0.5;
      g.globalCompositeOperation = "screen";
      edge(0, 0, 0, depth, 0, 0, w, depth);
      edge(0, h, 0, h - depth, 0, h - depth, w, depth);
      edge(0, 0, depth, 0, 0, 0, depth, h);
      edge(w, 0, w - depth, 0, w - depth, 0, depth, h);
      break;
    }
    case "strip": {
      g.fillStyle = "#0c0c0c";
      const band = u * 8;
      g.fillRect(0, 0, band, h);
      g.fillRect(w - band, 0, band, h);
      g.fillStyle = "#f2f0e8";
      const hole = u * 2.6;
      const gap = u * 6.2;
      for (let y = gap / 2; y < h; y += gap) {
        g.beginPath();
        roundPath(g, band / 2 - hole / 2, y, hole, hole * 1.3, hole * 0.3);
        roundPath(g, w - band / 2 - hole / 2, y, hole, hole * 1.3, hole * 0.3);
        g.fill();
      }
      break;
    }
  }
  g.restore();
}

// ------------------------------------------------------------------ stickers
export type StickerPack = { key: string; label: string; items: string[] };
export const STICKER_PACKS: StickerPack[] = [
  { key: "music", label: "Music", items: ["🎧", "🎤", "🎸", "🎹", "🥁", "🎺", "🎷", "🎻", "🎼", "🎵", "📻", "💿"] },
  { key: "fire", label: "Fire", items: ["🔥", "💥", "⚡", "☄️", "🌋", "💣", "🧨", "🚀", "🏎️", "🤘", "👊", "💯"] },
  { key: "love", label: "Love", items: ["❤️", "💖", "💘", "💝", "😍", "🥰", "😘", "💋", "🌹", "💌", "🫶", "💞"] },
  { key: "party", label: "Party", items: ["🎉", "🎊", "🥳", "🍾", "🎂", "🎈", "🎁", "🪩", "🕺", "💃", "🍕", "🍻"] },
  { key: "cool", label: "Cool", items: ["😎", "🕶️", "🧊", "🏆", "👑", "💎", "💰", "🛹", "🧢", "👟", "⌚", "🦾"] },
  { key: "space", label: "Space", items: ["🌙", "🪐", "🌌", "🛸", "👽", "🌠", "☀️", "🌍", "🔭", "🧑‍🚀", "🤖", "✨"] },
];
export const stickerPackByKey = (k: unknown) => STICKER_PACKS.find((p) => p.key === k) ?? STICKER_PACKS[0];
export const ALL_PACK_STICKERS: readonly string[] = STICKER_PACKS.flatMap((p) => p.items);

export const STICKER_SIZES = [
  { key: "s", label: "S", k: 0.11 },
  { key: "m", label: "M", k: 0.17 },
  { key: "l", label: "L", k: 0.26 },
] as const;
export const stickerSizeKey = (k: unknown): string => (STICKER_SIZES.some((s) => s.key === k) ? (k as string) : "m");

export const STICKER_CORNERS = [
  { key: "tr", label: "↗", x: 0.8, y: 0.16 },
  { key: "tl", label: "↖", x: 0.2, y: 0.16 },
  { key: "br", label: "↘", x: 0.8, y: 0.6 },
  { key: "bl", label: "↙", x: 0.2, y: 0.6 },
  { key: "c", label: "◎", x: 0.5, y: 0.4 },
] as const;
export const stickerCornerKey = (k: unknown): string => (STICKER_CORNERS.some((c) => c.key === k) ? (k as string) : "tr");

/** Where and how big a sticker is drawn (fractions of the picture). Default (tr, m) is exactly the classic spot. */
export function stickerSpot(corner: unknown, size: unknown, polaroid: boolean): { x: number; y: number; k: number } {
  const c = STICKER_CORNERS.find((x) => x.key === stickerCornerKey(corner))!;
  const s = STICKER_SIZES.find((x) => x.key === stickerSizeKey(size))!;
  const y = c.key === "tr" || c.key === "tl" ? (polaroid ? 0.2 : c.y) : c.y;
  return { x: c.x, y, k: s.k };
}

/** Most recent first, no repeats, at most 8. */
export function pushRecent(list: readonly string[], item: string, max = 8): string[] {
  if (!item) return [...list].slice(0, max);
  return [item, ...list.filter((x) => x !== item)].slice(0, max);
}
export function parseRecents(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length < 12).slice(0, 8) : [];
  } catch {
    return [];
  }
}

// ------------------------------------------------------------------ captions
export const CAPTION_STYLES = [
  { key: "bar", label: "Bar" },
  { key: "bold", label: "Bold" },
  { key: "neon", label: "Neon" },
  { key: "outline", label: "Outline" },
  { key: "type", label: "Typewriter" },
  { key: "meme", label: "Meme" },
] as const;
export const captionStyleKey = (k: unknown): string => (CAPTION_STYLES.some((s) => s.key === k) ? (k as string) : "bar");

export const CAPTION_POSITIONS = [
  { key: "bottom", label: "Bottom", y: 0.76 },
  { key: "middle", label: "Middle", y: 0.46 },
  { key: "top", label: "Top", y: 0.1 },
] as const;
export const captionPosKey = (k: unknown): string => (CAPTION_POSITIONS.some((s) => s.key === k) ? (k as string) : "bottom");

const FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';

/** Caption in one of the pack styles. `bar` is handled by the classic code in snapFx. */
export function drawCaptionStyled(g: G, w: number, h: number, text: string, style: string, pos: string, hex = "#ffffff", polaroid = false) {
  const spot = CAPTION_POSITIONS.find((p) => p.key === captionPosKey(pos))!;
  const yFrac = polaroid && spot.key === "bottom" ? 0.68 : spot.y;
  g.save();
  g.textAlign = "center";
  g.textBaseline = "middle";
  const fit = (size: number, weight: string, family = FONT, upper = false) => {
    const t = upper ? text.toUpperCase() : text;
    g.font = `${weight} ${size}px ${family}`;
    const tw = g.measureText(t).width;
    const k = tw > w * 0.92 ? (w * 0.92) / tw : 1;
    return { t, k };
  };
  switch (captionStyleKey(style)) {
    case "bar": {
      const size = Math.round(w * 0.052);
      const { t, k } = fit(size, "700");
      const bandH = size * 1.9;
      const y = h * yFrac;
      g.fillStyle = "rgba(0,0,0,.58)";
      g.fillRect(0, y, w, bandH);
      g.translate(w / 2, y + bandH / 2);
      g.scale(k, k);
      g.fillStyle = "#fff";
      g.fillText(t, 0, 0);
      break;
    }
    case "bold": {
      const size = Math.round(w * 0.085);
      const { t, k } = fit(size, "900");
      g.translate(w / 2, h * yFrac + size);
      g.scale(k, k);
      g.shadowColor = "rgba(0,0,0,.85)";
      g.shadowBlur = size * 0.25;
      g.fillStyle = "#fff";
      g.fillText(t, 0, 0);
      break;
    }
    case "neon": {
      const size = Math.round(w * 0.075);
      const { t, k } = fit(size, "800");
      g.translate(w / 2, h * yFrac + size);
      g.scale(k, k);
      g.shadowColor = hex;
      g.shadowBlur = size * 0.6;
      g.fillStyle = "#fff";
      g.fillText(t, 0, 0);
      g.shadowBlur = size * 0.25;
      g.fillText(t, 0, 0);
      break;
    }
    case "outline": {
      const size = Math.round(w * 0.09);
      const { t, k } = fit(size, "900", FONT, true);
      g.translate(w / 2, h * yFrac + size);
      g.scale(k, k);
      g.lineJoin = "round";
      g.lineWidth = size * 0.16;
      g.strokeStyle = "#000";
      g.strokeText(t, 0, 0);
      g.fillStyle = hex;
      g.fillText(t, 0, 0);
      break;
    }
    case "type": {
      const size = Math.round(w * 0.05);
      const { t, k } = fit(size, "700", '"Courier New",monospace');
      const tw = g.measureText(t).width * k;
      g.translate(w / 2, h * yFrac + size);
      g.fillStyle = "rgba(255,255,255,.92)";
      g.fillRect(-tw / 2 - size * 0.5, -size * 0.8, tw + size, size * 1.6);
      g.scale(k, k);
      g.fillStyle = "#111";
      g.fillText(t, 0, 0);
      break;
    }
    case "meme": {
      const size = Math.round(w * 0.1);
      const { t, k } = fit(size, "900", "Impact,Haettenschweiler,'Arial Black',sans-serif", true);
      const y = spot.key === "top" ? h * 0.1 + size : spot.key === "middle" ? h * 0.5 : h * 0.9;
      g.translate(w / 2, y);
      g.scale(k, k);
      g.lineJoin = "round";
      g.lineWidth = size * 0.14;
      g.strokeStyle = "#000";
      g.strokeText(t, 0, 0);
      g.fillStyle = "#fff";
      g.fillText(t, 0, 0);
      break;
    }
  }
  g.restore();
}

/** Small corner mark from the server ("@nexus" and the like). */
export function drawWatermark(g: G, w: number, h: number, text: string) {
  const t = text.trim();
  if (!t) return;
  g.save();
  const size = Math.round(w * 0.032);
  g.font = `700 ${size}px ${FONT}`;
  g.textAlign = "left";
  g.textBaseline = "bottom";
  g.globalAlpha = 0.85;
  g.shadowColor = "rgba(0,0,0,.7)";
  g.shadowBlur = size * 0.4;
  g.fillStyle = "#fff";
  g.fillText(t, w * 0.04, h - h * 0.025);
  g.restore();
}

// ------------------------------------------------------------------ server switches (Live Control)
export type LiveLike = Record<string, unknown>;
export type PackFlags = {
  looks: boolean;
  frames: boolean;
  stickers: boolean;
  captions: boolean;
  featuredLook: string;
  featuredFrame: string;
  featuredSticker: string;
  dailyPrompt: string;
  eventCaption: string;
  watermark: string;
};

const b = (m: LiveLike, k: string) => (typeof m[k] === "boolean" ? (m[k] as boolean) : true);
const t = (m: LiveLike, k: string) => (typeof m[k] === "string" ? (m[k] as string) : "");

export function packFlags(map: LiveLike): PackFlags {
  const look = t(map, "snap.featured_look");
  const frame = t(map, "snap.featured_frame");
  return {
    looks: b(map, "snap.pack_looks"),
    frames: b(map, "snap.pack_frames"),
    stickers: b(map, "snap.pack_stickers"),
    captions: b(map, "snap.pack_captions"),
    featuredLook: look,
    featuredFrame: frame,
    featuredSticker: t(map, "snap.featured_sticker"),
    dailyPrompt: t(map, "snap.daily_prompt"),
    eventCaption: t(map, "snap.event_caption"),
    watermark: t(map, "snap.watermark"),
  };
}

/** Looks the camera may offer: the originals always, the pack only while the server allows it. Featured first. */
export function availableLooks<T extends { key: string }>(all: readonly T[], baseKeys: readonly string[], f: PackFlags): T[] {
  const list = all.filter((e) => baseKeys.includes(e.key) || f.looks);
  const i = list.findIndex((e) => e.key === f.featuredLook && e.key !== "none");
  if (i > 0) return [list[0], list[i], ...list.filter((_, j) => j !== 0 && j !== i)];
  return list;
}

/** A saved choice the server has since switched off falls back to "none"/"bar"/default. */
export const lookAllowed = (key: string, baseKeys: readonly string[], f: PackFlags) => (baseKeys.includes(key) || f.looks ? key : "none");
export const frameAllowed = (key: string, f: PackFlags) => (isPackFrame(key) && !f.frames ? "none" : key);

export const SURPRISE_EMOJI = ["✨", "🔥", "🎧", "💎", "🪩", "🌙", "😎", "🦋"];
/** "Surprise me": one random pick of look, frame and sticker (rng injectable for tests). */
export function surprise(f: PackFlags, baseLooks: readonly string[], rng: () => number = Math.random) {
  const pick = <T,>(a: readonly T[]) => a[Math.min(a.length - 1, Math.floor(rng() * a.length))];
  const looks = [...baseLooks.filter((k) => k !== "none"), ...(f.looks ? PACK_LOOK_KEYS : [])];
  const frames = f.frames ? [...PACK_FRAME_KEYS, "vignette", "film", "polaroid"] : ["vignette", "film", "polaroid"];
  const stickers = f.stickers ? ALL_PACK_STICKERS : SURPRISE_EMOJI;
  return { look: pick(looks), frame: pick(frames), sticker: pick(stickers), color: pick(FRAME_COLORS).key };
}

/** What the caption box starts with: the server's event caption fills it only while the person has typed nothing. */
export const effectiveCaption = (typed: string, f: PackFlags) => (typed.trim() ? typed : f.eventCaption);
