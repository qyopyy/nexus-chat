// Nexus Snap · glue between the classic camera helpers (snap.ts, snapFx.ts) and the Snap Pack (snapPack.ts).
// The classic files stay untouched; the camera and gallery import the combined lists and drawing from here.

import { BASE_EFFECT_KEYS_LIST, SNAP_EFFECTS, applyEffect, type SnapEffect } from "./snap";
import { SNAP_OVERLAYS, SNAP_STICKERS, cleanCaption, decorate, hasDeco, overlayKey, stickerKey, type Deco } from "./snapFx";
import {
  ALL_PACK_STICKERS,
  PACK_FRAMES,
  PACK_LOOKS,
  applyLookPixels,
  captionPosKey,
  captionStyleKey,
  drawCaptionStyled,
  drawPackFrame,
  drawWatermark,
  frameColorKey,
  frameHex,
  isPackFrame,
  lookByKey,
  lookCss,
  stickerCornerKey,
  stickerSizeKey,
  stickerSpot,
} from "./snapPack";

export const ALL_EFFECTS: SnapEffect[] = [...SNAP_EFFECTS, ...PACK_LOOKS.map((l) => ({ key: l.key, label: l.label, css: lookCss(l.p) }))];
export const effectByKeyAll = (k: string | null | undefined) => ALL_EFFECTS.find((e) => e.key === k) ?? ALL_EFFECTS[0];
export const BASE_EFFECT_KEYS = BASE_EFFECT_KEYS_LIST;

/** Pixel effect for any look (classic or Pack). */
export function applyEffectAll(d: Uint8ClampedArray | number[], key: string): void {
  const pack = lookByKey(key);
  if (pack) return applyLookPixels(d, pack.p);
  applyEffect(d, key);
}

export const ALL_OVERLAYS = [...SNAP_OVERLAYS, ...PACK_FRAMES.map((f) => ({ key: f.key, label: f.label }))];
export const overlayKeyAll = (k: string | null | undefined) => (ALL_OVERLAYS.some((o) => o.key === k) ? (k as string) : "none");
export const stickerKeyAll = (s: string | null | undefined) => (s && (SNAP_STICKERS.includes(s) || ALL_PACK_STICKERS.includes(s)) ? s : "");

export type DecoAll = Deco;
export const hasDecoAll = (d: Pick<Deco, "overlay" | "caption" | "sticker"> & { watermark?: string }) =>
  overlayKeyAll(d.overlay) !== "none" || !!cleanCaption(d.caption) || !!stickerKeyAll(d.sticker) || !!d.watermark?.trim();

export const isClassicSticker = (s: string) => SNAP_STICKERS.includes(s);

/** Is anything beyond the classic look in play? (the live preview then draws exactly what will be saved) */
export function usesPack(d: Pick<Deco, "overlay" | "sticker" | "capStyle" | "capPos" | "stickerSize" | "stickerCorner" | "watermark">): boolean {
  return (
    isPackFrame(d.overlay) ||
    (!!d.sticker && !isClassicSticker(d.sticker)) ||
    captionStyleKey(d.capStyle) !== "bar" ||
    captionPosKey(d.capPos) !== "bottom" ||
    stickerSizeKey(d.stickerSize) !== "m" ||
    stickerCornerKey(d.stickerCorner) !== "tr" ||
    !!d.watermark?.trim()
  );
}

/** Burn frame, sticker, caption and watermark into the picture. The classic look goes through the classic code unchanged. */
export function decorateAll(g: CanvasRenderingContext2D, w: number, h: number, d: Deco) {
  const ov = overlayKeyAll(d.overlay);
  const sticker = stickerKeyAll(d.sticker);
  const cap = cleanCaption(d.caption);
  const customSticker = !!sticker && (!isClassicSticker(sticker) || stickerSizeKey(d.stickerSize) !== "m" || stickerCornerKey(d.stickerCorner) !== "tr");
  const customCap = !!cap && (captionStyleKey(d.capStyle) !== "bar" || captionPosKey(d.capPos) !== "bottom");
  if (isPackFrame(ov)) drawPackFrame(g, w, h, ov, frameHex(frameColorKey(d.frameColor)));
  const classicOv = isPackFrame(ov) ? "none" : overlayKey(ov);
  const rest: Deco = { overlay: classicOv, caption: customCap ? "" : cap, sticker: customSticker ? "" : stickerKey(sticker), when: d.when };
  if (hasDeco(rest)) decorate(g, w, h, rest);
  if (customSticker) {
    const spot = stickerSpot(d.stickerCorner, d.stickerSize, classicOv === "polaroid");
    g.save();
    g.font = `${Math.round(w * spot.k)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.translate(w * spot.x, h * spot.y);
    g.rotate(spot.x === 0.5 ? 0 : spot.x < 0.5 ? -0.2 : 0.2);
    g.fillText(sticker, 0, 0);
    g.restore();
  }
  if (customCap) drawCaptionStyled(g, w, h, cap, captionStyleKey(d.capStyle), captionPosKey(d.capPos), frameHex(frameColorKey(d.frameColor)), classicOv === "polaroid");
  if (d.watermark) drawWatermark(g, w, h, d.watermark);
}
