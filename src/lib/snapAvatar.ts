"use client";

// Nexus Snap · full-body V-Avatar: your existing V-Avatar (head, hair, outfit, jewellery) plus legs, shoes and arms,
// standing on a floor in front of a themed backdrop (999 / Ksubi packs, studio, neon…) or your own picture.

import { drawAvatar, type Pants, type Pose, type Shoes, type VAvatar } from "./vavatar";
import { ANKLE, CUSTOM_SCENE, FEET, HIP, SCENES, WAIST, bodyLayout, coverRect, legsOf, rgba, sceneByKey, shade, type Scene } from "./snapScenes";

export * from "./snapScenes";
type G = CanvasRenderingContext2D;

// ------------------------------------------------------------------ scene painting (static layer cached)
const cache = new Map<string, HTMLCanvasElement>();

function paintScene(sc: Scene, W: number, H: number): HTMLCanvasElement {
  const key = `${sc.key}|${W}x${H}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const floorY = H * 0.74;
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const wg = g.createLinearGradient(0, 0, 0, floorY);
  wg.addColorStop(0, sc.wall[0]);
  wg.addColorStop(1, sc.wall[1]);
  g.fillStyle = wg;
  g.fillRect(0, 0, W, floorY);
  switch (sc.motif) {
    case "nine99": {
      g.save();
      g.font = `900 ${H * 0.42}px "Arial Narrow","Roboto Condensed","Helvetica Neue",Arial,sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.lineWidth = H * 0.008;
      g.strokeStyle = rgba(sc.glow, 0.5);
      g.strokeText("999", W / 2, floorY * 0.46);
      g.fillStyle = rgba(sc.glow, 0.07);
      g.fillText("999", W / 2, floorY * 0.46);
      g.restore();
      for (const x of [0.07, 0.93]) {
        const lg = g.createLinearGradient(0, 0, 0, floorY);
        lg.addColorStop(0, rgba(sc.glow, 0));
        lg.addColorStop(0.5, rgba(sc.glow, 0.95));
        lg.addColorStop(1, rgba(sc.glow, 0));
        g.fillStyle = lg;
        g.fillRect(W * x - W * 0.004, 0, W * 0.008, floorY);
        const hg = g.createRadialGradient(W * x, floorY * 0.5, 0, W * x, floorY * 0.5, W * 0.35);
        hg.addColorStop(0, rgba(sc.glow, 0.28));
        hg.addColorStop(1, rgba(sc.glow, 0));
        g.fillStyle = hg;
        g.fillRect(0, 0, W, floorY);
      }
      break;
    }
    case "stripes": {
      g.save();
      g.transform(1, 0, -0.35, 1, 0, 0);
      for (let i = -4; i < 14; i++) {
        g.fillStyle = rgba(sc.glow, i % 3 === 0 ? 0.2 : 0.06);
        g.fillRect(i * W * 0.11, 0, W * (i % 3 === 0 ? 0.03 : 0.012), floorY);
      }
      g.restore();
      const rg = g.createRadialGradient(W / 2, floorY * 0.6, 0, W / 2, floorY * 0.6, W * 0.7);
      rg.addColorStop(0, rgba(sc.glow, 0.22));
      rg.addColorStop(1, rgba(sc.glow, 0));
      g.fillStyle = rg;
      g.fillRect(0, 0, W, floorY);
      break;
    }
    case "denim": {
      g.strokeStyle = "rgba(255,255,255,.05)";
      g.lineWidth = Math.max(1, H / 540);
      for (let i = -H; i < W + H; i += Math.max(4, H / 120)) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i + floorY * 0.6, floorY);
        g.stroke();
      }
      g.strokeStyle = "rgba(255,196,110,.55)"; // contrast stitching
      g.setLineDash([H * 0.012, H * 0.008]);
      g.lineWidth = Math.max(2, H / 360);
      g.beginPath();
      g.moveTo(W * 0.12, 0);
      g.lineTo(W * 0.12, floorY);
      g.moveTo(W * 0.88, 0);
      g.lineTo(W * 0.88, floorY);
      g.stroke();
      g.setLineDash([]);
      break;
    }
    case "grid": {
      g.strokeStyle = rgba(sc.glow, 0.5);
      g.lineWidth = Math.max(1, H / 480);
      for (let i = 0; i < 14; i++) {
        const y = floorY * 0.55 + (i * i * floorY * 0.45) / 196;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(W, y);
        g.stroke();
      }
      g.strokeStyle = rgba("#ff2bd6", 0.4);
      for (let i = -8; i <= 8; i++) {
        g.beginPath();
        g.moveTo(W / 2 + i * W * 0.04, floorY * 0.55);
        g.lineTo(W / 2 + i * W * 0.16, floorY);
        g.stroke();
      }
      break;
    }
    case "stars": {
      for (let i = 0; i < 220; i++) {
        g.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.75})`;
        g.beginPath();
        g.arc(rnd() * W, rnd() * floorY, ((rnd() < 0.08 ? 1.8 : 0.9) * H) / 720, 0, Math.PI * 2);
        g.fill();
      }
      for (const [x, y, col] of [[0.2, 0.3, "#8b5cff"], [0.85, 0.55, "#ff2bd6"], [0.6, 0.12, "#00c2ff"]] as const) {
        const rg = g.createRadialGradient(W * x, floorY * y, 0, W * x, floorY * y, W * 0.5);
        rg.addColorStop(0, rgba(col, 0.3));
        rg.addColorStop(1, rgba(col, 0));
        g.fillStyle = rg;
        g.fillRect(0, 0, W, floorY);
      }
      break;
    }
    case "petals": {
      for (let i = 0; i < 40; i++) {
        g.save();
        g.translate(rnd() * W, rnd() * floorY);
        g.rotate(rnd() * 6);
        g.fillStyle = `rgba(255,${130 + rnd() * 60},${170 + rnd() * 40},.7)`;
        g.beginPath();
        g.ellipse(0, 0, (14 * H) / 720, (8 * H) / 720, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      break;
    }
    case "sun": {
      g.fillStyle = "rgba(255,240,200,.6)";
      g.beginPath();
      g.arc(W * 0.5, floorY * 0.98, H * 0.2, Math.PI, 0);
      g.fill();
      break;
    }
    case "stage": {
      for (const x of [0, 1]) {
        g.fillStyle = x ? "#3a0f5a" : "#4a1670";
        for (let i = 0; i < 6; i++) g.fillRect(x ? W - W * 0.2 + i * W * 0.034 : i * W * 0.034, 0, W * 0.02, floorY);
      }
      const cone = g.createLinearGradient(0, 0, 0, floorY);
      cone.addColorStop(0, rgba(sc.glow, 0.35));
      cone.addColorStop(1, rgba(sc.glow, 0.02));
      g.fillStyle = cone;
      g.beginPath();
      g.moveTo(W * 0.42, 0);
      g.lineTo(W * 0.58, 0);
      g.lineTo(W * 0.9, floorY);
      g.lineTo(W * 0.1, floorY);
      g.closePath();
      g.fill();
      break;
    }
    case "spot":
    default: {
      const rg = g.createRadialGradient(W / 2, floorY * 0.55, 0, W / 2, floorY * 0.55, W * 0.8);
      rg.addColorStop(0, rgba(sc.glow, 0.16));
      rg.addColorStop(1, rgba(sc.glow, 0));
      g.fillStyle = rg;
      g.fillRect(0, 0, W, floorY);
    }
  }
  paintFloor(g, sc, W, H);
  cache.set(key, c);
  if (cache.size > 24) cache.delete(cache.keys().next().value as string);
  return c;
}

function paintFloor(g: G, sc: Scene, W: number, H: number) {
  const floorY = H * 0.74;
  const fg = g.createLinearGradient(0, floorY, 0, H);
  fg.addColorStop(0, sc.floor[0]);
  fg.addColorStop(1, sc.floor[1]);
  g.fillStyle = fg;
  g.fillRect(0, floorY, W, H - floorY);
  // horizon glow + glossy reflection streak under the figure
  const hl = g.createLinearGradient(0, floorY - H * 0.01, 0, floorY + H * 0.03);
  hl.addColorStop(0, rgba(sc.glow, 0));
  hl.addColorStop(0.35, rgba(sc.glow, 0.55));
  hl.addColorStop(1, rgba(sc.glow, 0));
  g.fillStyle = hl;
  g.fillRect(0, floorY - H * 0.01, W, H * 0.04);
  const rg = g.createRadialGradient(W / 2, H * 0.9, 0, W / 2, H * 0.9, W * 0.55);
  rg.addColorStop(0, rgba(sc.glow, 0.22));
  rg.addColorStop(1, rgba(sc.glow, 0));
  g.fillStyle = rg;
  g.fillRect(0, floorY, W, H - floorY);
}

/** Paints the backdrop: a themed scene, or the user's own picture (with a floor shadow only). */
export function drawScene(g: G, sceneKey: string, W: number, H: number, img: CanvasImageSource | null, imgSize?: { w: number; h: number }) {
  if (sceneKey === CUSTOM_SCENE && img && imgSize) {
    const r = coverRect(imgSize.w, imgSize.h, W, H);
    g.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, W, H);
    return;
  }
  g.drawImage(paintScene(sceneByKey(sceneKey) ?? SCENES[0], W, H), 0, 0);
}

// ------------------------------------------------------------------ legs & shoes
function legPath(g: G, style: Pants, sd: number, bx: number, sway: number) {
  const inner = 8;
  const w0 = (style === "baggy" ? 150 : style === "slim" ? 104 : style === "joggers" ? 124 : 132) * (bx > 1 ? 1 : 0.94);
  const w1 = style === "baggy" ? 148 : style === "slim" ? 70 : style === "joggers" ? 84 : 98;
  const x0i = sd * inner;
  const x0o = sd * (inner + w0);
  const xc = sd * 8 * 0 + sway;
  const x1i = sd * (inner + (w0 - w1) * 0.12) + xc;
  const x1o = sd * (inner + (w0 - w1) * 0.12 + w1) + xc;
  const yEnd = style === "shorts" ? 470 : ANKLE;
  g.beginPath();
  g.moveTo(x0i, HIP);
  g.lineTo(x0o, HIP);
  g.lineTo(x1o, yEnd);
  g.lineTo(x1i, yEnd);
  g.closePath();
  return { x0i, x0o, x1i, x1o, yEnd };
}

function shoe(g: G, style: Shoes, sd: number, cx: number, col: string, sway: number) {
  const x = cx + sway;
  const line = shade(col, -0.55);
  const heel = x - sd * 52;
  const toe = x + sd * 104;
  const lo = Math.min(heel, toe) - 5;
  const wide = Math.abs(toe - heel) + 10;
  const soleCol = style === "boots" ? "#16181d" : style === "slides" ? shade(col, -0.25) : "#f4f4f8";
  const top = style === "highs" ? ANKLE - 46 : style === "boots" ? ANKLE - 62 : ANKLE - 14;
  g.lineWidth = 3;
  g.lineJoin = "round";
  g.strokeStyle = line;
  g.fillStyle = col;
  if (style === "slides") {
    g.fillStyle = soleCol;
    g.beginPath();
    g.roundRect(lo, FEET - 26, wide, 28, 14);
    g.fill();
    g.stroke();
    g.fillStyle = col;
    g.beginPath();
    g.roundRect(x - 40, FEET - 66, 92, 42, 14);
    g.fill();
    g.stroke();
    return;
  }
  g.beginPath();
  g.moveTo(heel, top);
  g.lineTo(x + sd * 36, top);
  g.lineTo(x + sd * 46, ANKLE + 10);
  g.quadraticCurveTo(x + sd * 82, ANKLE + 22, toe - sd * 4, FEET - 44);
  g.quadraticCurveTo(toe + sd * 8, FEET - 30, toe, FEET - 16);
  g.lineTo(heel, FEET - 16);
  g.closePath();
  g.fill();
  g.stroke();
  // toe cap / side stripe
  g.strokeStyle = shade(col, col === "#f4f4f8" ? -0.25 : 0.4);
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(x - sd * 38, FEET - 36);
  g.quadraticCurveTo(x + sd * 8, FEET - 74, x + sd * 62, FEET - 46);
  g.stroke();
  // sole
  g.strokeStyle = line;
  g.lineWidth = 3;
  g.fillStyle = soleCol;
  g.beginPath();
  g.roundRect(lo, FEET - 26, wide, 30, 13);
  g.fill();
  g.stroke();
  // laces
  g.strokeStyle = style === "boots" ? "#6b6f78" : shade(col, col === "#f4f4f8" ? -0.3 : 0.55);
  g.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    const y = top + 18 + i * 13;
    g.beginPath();
    g.moveTo(x + sd * 4, y);
    g.lineTo(x + sd * 40, y + 4);
    g.stroke();
  }
}

function drawLegs(g: G, cfg: VAvatar, t: number) {
  const L = legsOf(cfg);
  const bx = cfg.body === "masc" ? 1.1 : 0.9;
  const sway = Math.sin(t * 1.3) * 3;
  g.save();
  g.scale(bx, 1);
  g.lineJoin = "round";
  for (const sd of [-1, 1]) {
    const lp = legPath(g, L.pants, sd, bx, sway * sd * 0.4);
    const gr = g.createLinearGradient(0, HIP, 0, lp.yEnd);
    gr.addColorStop(0, shade(L.pantsColor, 0.06));
    gr.addColorStop(1, shade(L.pantsColor, -0.22));
    // skin below shorts
    if (L.pants === "shorts") {
      g.fillStyle = cfg.skin;
      g.strokeStyle = shade(cfg.skin, -0.45);
      g.lineWidth = 3;
      const mx = sd * 62 + sway * sd * 0.4;
      g.beginPath();
      g.moveTo(mx - 44, 470);
      g.lineTo(mx + 44, 470);
      g.lineTo(mx + 38, ANKLE);
      g.lineTo(mx - 38, ANKLE);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = "#f4f4f8"; // socks
      g.fillRect(mx - 40, ANKLE - 56, 80, 56);
      g.strokeRect(mx - 40, ANKLE - 56, 80, 56);
    }
    legPath(g, L.pants, sd, bx, sway * sd * 0.4);
    g.fillStyle = gr;
    g.strokeStyle = shade(L.pantsColor, -0.55);
    g.lineWidth = 3;
    g.fill();
    g.stroke();
    // seam + fold lines + cuff
    g.strokeStyle = rgba(shade(L.pantsColor, -0.6), 0.5);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(sd * (lp.x0i + 4), HIP + 20);
    g.lineTo(sd * 0 + lp.x1i + (sd > 0 ? 4 : -4), lp.yEnd - 6);
    g.stroke();
    if (L.pants === "joggers") {
      g.fillStyle = shade(L.pantsColor, -0.3);
      g.fillRect(Math.min(lp.x1i, lp.x1o) - 3, ANKLE - 26, Math.abs(lp.x1o - lp.x1i) + 6, 26);
    }
    if (L.pants === "jeans" || L.pants === "baggy") {
      g.strokeStyle = rgba(shade(L.pantsColor, -0.6), 0.45);
      for (let i = 0; i < 3; i++) {
        const y = ANKLE - 14 - i * 11;
        g.beginPath();
        g.moveTo(Math.min(lp.x1i, lp.x1o), y);
        g.quadraticCurveTo((lp.x1i + lp.x1o) / 2, y + 7, Math.max(lp.x1i, lp.x1o), y);
        g.stroke();
      }
    }
  }
  // belt / waistband under the shirt hem
  g.fillStyle = shade(L.pantsColor, -0.35);
  g.fillRect(-142, HIP - 6, 284, 22);
  // shoes (feet point slightly outward)
  for (const sd of [-1, 1]) {
    const mid = sd * (8 + (L.pants === "baggy" ? 70 : 52));
    shoe(g, L.shoes, sd, mid, L.shoesColor, sway * sd * 0.4);
  }
  g.restore();
}

// ------------------------------------------------------------------ the full-body renderer used by startAvatar({ render })
export type BodyDeps = { sceneKey: string; img: CanvasImageSource | null; imgSize?: { w: number; h: number } };

export function drawFullBody(g: G, cfg: VAvatar, p: Pose, W: number, H: number, t: number, deps: BodyDeps) {
  drawScene(g, deps.sceneKey, W, H, deps.img, deps.imgSize);
  const L = bodyLayout(W, H);
  // contact shadow
  g.save();
  g.translate(W / 2, L.feetPx - H * 0.012);
  g.scale(1, 0.16);
  const sg = g.createRadialGradient(0, 0, 0, 0, 0, W * 0.3);
  sg.addColorStop(0, "rgba(0,0,0,.6)");
  sg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = sg;
  g.beginPath();
  g.arc(0, 0, W * 0.3, 0, Math.PI * 2);
  g.fill();
  g.restore();
  // legs first, the shirt hem overlaps their top
  g.save();
  g.translate(W / 2, L.cy * H);
  g.scale(L.s, L.s);
  drawLegs(g, cfg, t);
  g.restore();
  // head + torso (clipped at the waist)
  g.save();
  g.beginPath();
  g.rect(0, 0, W, L.cy * H + WAIST * L.s);
  g.clip();
  drawAvatar(g, cfg, p, W, H, t, { noBg: true, k: L.k, cy: L.cy });
  g.restore();
  // shirt hem
  g.save();
  g.translate(W / 2, L.cy * H);
  g.scale(L.s, L.s);
  const bx = cfg.body === "masc" ? 1.1 : 0.9;
  g.fillStyle = shade(cfg.shirtColor, -0.28);
  g.strokeStyle = shade(cfg.shirtColor, -0.6);
  g.lineWidth = 3;
  g.beginPath();
  g.rect(-226 * bx, WAIST - 14, 452 * bx, 16);
  g.fill();
  g.stroke();
  arms(g, cfg, t);
  g.restore();
}

/** hanging arms + hands in front of the torso edges (the bust only draws shoulders) */
function arms(g: G, cfg: VAvatar, t: number) {
  const bx = cfg.body === "masc" ? 1.1 : 0.9;
  const bare = cfg.shirt === "tank";
  const sleeve = bare ? cfg.skin : cfg.shirtColor;
  const edge = bare ? shade(cfg.skin, -0.45) : shade(cfg.shirtColor, -0.55);
  const swing = Math.sin(t * 1.3) * 4;
  g.lineJoin = "round";
  g.lineWidth = 3;
  for (const sd of [-1, 1]) {
    const x = sd * 214 * bx;
    const y0 = 262;
    const y1 = 455;
    g.save();
    g.translate(x, y0);
    g.rotate(sd * 0.05 + (swing * sd) / 200);
    const gr = g.createLinearGradient(-48, 0, 48, 0);
    gr.addColorStop(0, shade(sleeve, sd < 0 ? 0.1 : -0.12));
    gr.addColorStop(1, shade(sleeve, sd < 0 ? -0.12 : 0.1));
    g.fillStyle = gr;
    g.strokeStyle = edge;
    g.beginPath();
    g.roundRect(-46, -20, 92, y1 - y0 + 20, 40);
    g.fill();
    g.stroke();
    if (!bare) {
      g.fillStyle = shade(sleeve, -0.3);
      g.beginPath();
      g.roundRect(-46, y1 - y0 - 34, 92, 34, 14);
      g.fill();
      g.stroke();
    }
    // hand
    g.fillStyle = cfg.skin;
    g.strokeStyle = shade(cfg.skin, -0.45);
    g.beginPath();
    g.ellipse(0, y1 - y0 + 26, 34, 40, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.restore();
  }
}

// ------------------------------------------------------------------ custom background picture
export type SceneImage = { el: HTMLImageElement; w: number; h: number; dataUrl: string };

/** Downscales the picked file (long edge ≤ 1280, JPEG) so it fits in local storage and stays fast to draw. */
export async function fileToSceneImage(file: File): Promise<SceneImage> {
  const src = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const k = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    if (!g) throw new Error("Your browser can't read this picture.");
    g.drawImage(img, 0, 0, w, h);
    return sceneImageFromUrl(c.toDataURL("image/jpeg", 0.82));
  } finally {
    URL.revokeObjectURL(src);
  }
}

export async function sceneImageFromUrl(dataUrl: string): Promise<SceneImage> {
  const el = new Image();
  el.src = dataUrl;
  await el.decode();
  return { el, w: el.naturalWidth, h: el.naturalHeight, dataUrl };
}
