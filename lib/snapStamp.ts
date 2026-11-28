// Date stamp printed in the corner of a photo (the pen colour and size follow the picture size).

const pad = (n: number) => String(n).padStart(2, "0");

/** 2026-11-28  14:05 */
export function stampText(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}  ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Font size in pixels for a picture of this width (readable but small). */
export const stampSize = (w: number) => Math.max(12, Math.round(w / 38));

export function drawStamp(ctx: CanvasRenderingContext2D, w: number, h: number, when: Date) {
  const size = stampSize(w);
  const pad2 = Math.round(size * 0.9);
  ctx.save();
  ctx.font = `600 ${size}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "rgba(0,0,0,.7)";
  ctx.shadowBlur = Math.round(size / 3);
  ctx.fillStyle = "#ffb347";
  ctx.fillText(stampText(when), w - pad2, h - pad2);
  ctx.restore();
}
