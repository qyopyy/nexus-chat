// Nexus Snap · photo decorations burned in at capture time: frames/looks, a caption bar and a sticker.
// Drawing helpers take a 2D context so the same code serves camera photos and avatar photos.

export type SnapOverlay = { key: string; label: string };
export const SNAP_OVERLAYS: SnapOverlay[] = [
  { key: "none", label: "None" },
  { key: "vignette", label: "Vignette" },
  { key: "film", label: "Film" },
  { key: "date", label: "Date stamp" },
  { key: "polaroid", label: "Polaroid" },
];
export const overlayKey = (k: string | null | undefined) => (SNAP_OVERLAYS.some((o) => o.key === k) ? (k as string) : "none");

export const SNAP_STICKERS = ["🔥", "💀", "🖤", "❤️‍🔥", "😎", "👑", "✨", "🦋", "⭐", "💎", "🎧", "📍"];
export const stickerKey = (s: string | null | undefined) => (s && SNAP_STICKERS.includes(s) ? s : "");

export const CAPTION_MAX = 60;
/** single line, no control characters, trimmed to 60 */
export const cleanCaption = (s: unknown) =>
  (typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim() : "").slice(0, CAPTION_MAX);

const p2 = (n: number) => String(n).padStart(2, "0");
/** camera-style date stamp: 27 11 '26 */
export const stampText = (d: Date) => `${p2(d.getDate())} ${p2(d.getMonth() + 1)} '${p2(d.getFullYear() % 100)}`;

export type Deco = { overlay: string; caption: string; sticker: string; when: Date };
export const hasDeco = (d: Pick<Deco, "overlay" | "caption" | "sticker">) => overlayKey(d.overlay) !== "none" || !!cleanCaption(d.caption) || !!stickerKey(d.sticker);

type G = CanvasRenderingContext2D;

function vignette(g: G, w: number, h: number, strength: number) {
  const r = Math.hypot(w, h) / 2;
  const gr = g.createRadialGradient(w / 2, h / 2, r * 0.45, w / 2, h / 2, r);
  gr.addColorStop(0, "rgba(0,0,0,0)");
  gr.addColorStop(1, `rgba(0,0,0,${strength})`);
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
}

function grain(g: G, w: number, h: number) {
  const t = document.createElement("canvas");
  t.width = t.height = 160;
  const tg = t.getContext("2d");
  if (!tg) return;
  const img = tg.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  tg.putImageData(img, 0, 0);
  const pat = g.createPattern(t, "repeat");
  if (!pat) return;
  g.save();
  g.globalAlpha = 0.13;
  g.globalCompositeOperation = "overlay";
  g.fillStyle = pat;
  g.fillRect(0, 0, w, h);
  g.restore();
}

/** Draws overlay, sticker and caption onto an already-drawn picture of size w×h. */
export function decorate(g: G, w: number, h: number, d: Deco) {
  const ov = overlayKey(d.overlay);
  if (ov === "vignette") vignette(g, w, h, 0.55);
  if (ov === "film") {
    vignette(g, w, h, 0.4);
    grain(g, w, h);
  }
  if (ov === "date") {
    g.save();
    g.font = `700 ${Math.round(w * 0.045)}px "Courier New",monospace`;
    g.textAlign = "right";
    g.textBaseline = "bottom";
    g.shadowColor = "rgba(255,120,0,.9)";
    g.shadowBlur = w * 0.012;
    g.fillStyle = "#ff9a1f";
    g.fillText(stampText(d.when), w - w * 0.05, h - h * 0.035);
    g.restore();
  }
  if (ov === "polaroid") {
    const side = w * 0.045;
    const bottom = h * 0.15;
    g.save();
    g.fillStyle = "#f6f3ec";
    g.fillRect(0, 0, w, side);
    g.fillRect(0, 0, side, h);
    g.fillRect(w - side, 0, side, h);
    g.fillRect(0, h - bottom, w, bottom);
    g.strokeStyle = "rgba(0,0,0,.18)";
    g.lineWidth = Math.max(1, w * 0.002);
    g.strokeRect(side, side, w - side * 2, h - side - bottom);
    g.restore();
  }
  const st = stickerKey(d.sticker);
  if (st) {
    g.save();
    g.font = `${Math.round(w * 0.17)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.translate(w * 0.8, h * (ov === "polaroid" ? 0.2 : 0.16));
    g.rotate(0.2);
    g.fillText(st, 0, 0);
    g.restore();
  }
  const cap = cleanCaption(d.caption);
  if (cap) {
    const size = Math.round(w * 0.052);
    g.save();
    g.font = `700 ${size}px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif`;
    const maxW = w * 0.94;
    const tw = g.measureText(cap).width;
    const k = tw > maxW ? maxW / tw : 1;
    const bandH = size * 1.9;
    const y = h * (ov === "polaroid" ? 0.68 : 0.76);
    g.fillStyle = "rgba(0,0,0,.58)";
    g.fillRect(0, y, w, bandH);
    g.fillStyle = "#fff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.translate(w / 2, y + bandH / 2);
    g.scale(k, k);
    g.fillText(cap, 0, 0);
    g.restore();
  }
}
