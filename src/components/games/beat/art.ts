// Beat Battle — original vector art (canvas). Characters: "Volt" (player robot) and "Hex" (opponent wraith).
// Stage: a stormy rooftop at night with lightning. Everything here is drawn in code — no sprite sheets.

export type Pose = "idle" | "left" | "down" | "up" | "right" | "miss";
export const LANE_COLORS = ["#c24bff", "#00d6ff", "#12fa05", "#ff2e63"];
export const LANE_DARK = ["#5b1a80", "#055a72", "#0b6b07", "#7a1230"];
const ROT = [-Math.PI / 2, Math.PI, 0, Math.PI / 2]; // left, down, up, right (arrow points up at 0)

/** rounded "chevron" arrow, pointing up when rot = 0 */
export function arrow(g: CanvasRenderingContext2D, x: number, y: number, size: number, lane: number, mode: "note" | "strum" | "press" | "glow", alpha = 1) {
  g.save();
  g.translate(x, y);
  g.rotate(ROT[lane]);
  g.globalAlpha = alpha;
  const s = size / 2;
  const path = () => {
    g.beginPath();
    g.moveTo(0, -s);
    g.quadraticCurveTo(s * 0.18, -s * 0.98, s * 0.92, -s * 0.08);
    g.quadraticCurveTo(s * 1.0, s * 0.14, s * 0.62, s * 0.16);
    g.lineTo(s * 0.34, s * 0.16);
    g.lineTo(s * 0.34, s * 0.8);
    g.quadraticCurveTo(s * 0.34, s * 0.98, s * 0.16, s * 0.98);
    g.lineTo(-s * 0.16, s * 0.98);
    g.quadraticCurveTo(-s * 0.34, s * 0.98, -s * 0.34, s * 0.8);
    g.lineTo(-s * 0.34, s * 0.16);
    g.lineTo(-s * 0.62, s * 0.16);
    g.quadraticCurveTo(-s * 1.0, s * 0.14, -s * 0.92, -s * 0.08);
    g.quadraticCurveTo(-s * 0.18, -s * 0.98, 0, -s);
    g.closePath();
  };
  if (mode === "strum") {
    path();
    g.fillStyle = "rgba(20,18,30,.55)";
    g.fill();
    g.lineWidth = size * 0.07;
    g.strokeStyle = "rgba(200,200,220,.55)";
    g.stroke();
  } else {
    if (mode === "glow" || mode === "press") {
      g.shadowColor = LANE_COLORS[lane];
      g.shadowBlur = size * (mode === "glow" ? 0.6 : 0.3);
    }
    path();
    const gr = g.createLinearGradient(0, -s, 0, s);
    gr.addColorStop(0, mode === "press" ? LANE_DARK[lane] : "#ffffff");
    gr.addColorStop(0.18, LANE_COLORS[lane]);
    gr.addColorStop(1, LANE_DARK[lane]);
    g.fillStyle = gr;
    g.fill();
    g.shadowBlur = 0;
    g.lineWidth = size * 0.075;
    g.strokeStyle = mode === "press" ? "rgba(255,255,255,.35)" : "#15101e";
    g.stroke();
    // inner highlight
    g.beginPath();
    g.moveTo(0, -s * 0.62);
    g.quadraticCurveTo(s * 0.12, -s * 0.6, s * 0.55, -s * 0.12);
    g.lineWidth = size * 0.06;
    g.strokeStyle = "rgba(255,255,255,.45)";
    g.stroke();
  }
  g.restore();
}

/** sustain trail */
export function trail(g: CanvasRenderingContext2D, x: number, y0: number, y1: number, size: number, lane: number, alpha = 1) {
  const w = size * 0.3;
  g.save();
  g.globalAlpha = alpha * 0.85;
  const top = Math.min(y0, y1),
    h = Math.abs(y1 - y0);
  const gr = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  gr.addColorStop(0, LANE_DARK[lane]);
  gr.addColorStop(0.5, LANE_COLORS[lane]);
  gr.addColorStop(1, LANE_DARK[lane]);
  g.fillStyle = gr;
  g.beginPath();
  g.roundRect(x - w / 2, top, w, h, w / 2);
  g.fill();
  g.restore();
}

/** burst particles for a PERFECT hit */
export type Spark = { x: number; y: number; vx: number; vy: number; life: number; lane: number; r: number };
export function burst(list: Spark[], x: number, y: number, lane: number) {
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3;
    const v = 140 + Math.random() * 220;
    list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.45 + Math.random() * 0.2, lane, r: 4 + Math.random() * 6 });
  }
}
export function drawSparks(g: CanvasRenderingContext2D, list: Spark[], dt: number) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.life -= dt;
    if (p.life <= 0) {
      list.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.9;
    p.vy *= 0.9;
    g.globalAlpha = Math.min(1, p.life * 2.4);
    g.fillStyle = LANE_COLORS[p.lane];
    g.beginPath();
    g.arc(p.x, p.y, p.r * (p.life * 2), 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

// ─────────────────────────────── stage ───────────────────────────────
export type StageState = { flash: number; rain: { x: number; y: number; l: number }[] };
export const newStage = (): StageState => ({
  flash: 0,
  rain: Array.from({ length: 140 }, () => ({ x: Math.random() * 2400 - 600, y: Math.random() * 1400 - 400, l: 18 + Math.random() * 26 })),
});

export function drawStage(g: CanvasRenderingContext2D, st: StageState, t: number, dt: number) {
  // world space: roughly x -600…1900, y -300…1000, floor at y = 640
  const sky = g.createLinearGradient(0, -300, 0, 700);
  sky.addColorStop(0, "#0b0618");
  sky.addColorStop(0.55, "#2a1046");
  sky.addColorStop(1, "#4b1d5c");
  g.fillStyle = sky;
  g.fillRect(-800, -400, 2900, 1500);
  // moon behind clouds
  g.save();
  g.shadowColor = "#d9c8ff";
  g.shadowBlur = 80;
  g.fillStyle = "#efe6ff";
  g.beginPath();
  g.arc(980, 40, 70, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.fillStyle = "rgba(43,16,70,.85)";
  for (let i = 0; i < 6; i++) {
    const cx = ((i * 420 + t * 12) % 2600) - 700;
    g.beginPath();
    g.ellipse(cx, 60 + (i % 3) * 50, 220, 38, 0, 0, Math.PI * 2);
    g.fill();
  }
  // city / gothic skyline silhouette
  g.fillStyle = "#170a26";
  const sky1 = [
    [-700, 420, 160, 300],
    [-520, 380, 120, 340],
    [-380, 300, 90, 420],
    [-270, 360, 170, 360],
    [1320, 330, 140, 390],
    [1470, 260, 100, 460],
    [1580, 380, 200, 340],
    [1790, 340, 160, 380],
  ];
  for (const [x, y, w, h] of sky1) {
    g.fillRect(x, y, w, h);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + w / 2, y - w * 0.7);
    g.lineTo(x + w, y);
    g.fill();
  }
  // lit windows
  g.fillStyle = "rgba(255,190,90,.55)";
  for (const [x, y, w, h] of sky1)
    for (let yy = y + 30; yy < y + h - 40; yy += 46)
      for (let xx = x + 18; xx < x + w - 18; xx += 34) if (Math.sin(xx * 12.9898 + yy * 78.233) > 0.35) g.fillRect(xx, yy, 12, 20);
  // rooftop floor + railing
  const fl = g.createLinearGradient(0, 600, 0, 1000);
  fl.addColorStop(0, "#2d1b3d");
  fl.addColorStop(1, "#120a1a");
  g.fillStyle = fl;
  g.fillRect(-800, 620, 2900, 500);
  g.strokeStyle = "#3d2a52";
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(-800, 560);
  g.lineTo(2100, 560);
  g.stroke();
  for (let x = -780; x < 2100; x += 60) {
    g.beginPath();
    g.moveTo(x, 560);
    g.lineTo(x, 622);
    g.stroke();
  }
  // puddle reflections
  g.fillStyle = "rgba(160,120,255,.12)";
  g.beginPath();
  g.ellipse(300, 760, 260, 26, 0, 0, Math.PI * 2);
  g.ellipse(1100, 800, 220, 22, 0, 0, Math.PI * 2);
  g.fill();
  // rain
  g.strokeStyle = "rgba(190,170,255,.35)";
  g.lineWidth = 2;
  g.beginPath();
  for (const d of st.rain) {
    d.y += 1300 * dt;
    d.x -= 260 * dt;
    if (d.y > 1000) {
      d.y = -400;
      d.x = Math.random() * 2600 - 600;
    }
    g.moveTo(d.x, d.y);
    g.lineTo(d.x - d.l * 0.2, d.y + d.l);
  }
  g.stroke();
}

/** lightning flash overlay (screen space) */
export function drawFlash(g: CanvasRenderingContext2D, st: StageState, w: number, h: number, dt: number) {
  if (st.flash <= 0) return;
  g.fillStyle = `rgba(235,225,255,${Math.min(0.85, st.flash)})`;
  g.fillRect(0, 0, w, h);
  st.flash -= dt * 2.6;
}

// ─────────────────────────────── boombox (centre prop) ───────────────────────────────
export function drawBoombox(g: CanvasRenderingContext2D, x: number, y: number, bop: number) {
  g.save();
  g.translate(x, y);
  g.scale(1 + bop * 0.04, 1 - bop * 0.05);
  g.fillStyle = "#231733";
  g.beginPath();
  g.roundRect(-150, -120, 300, 130, 22);
  g.fill();
  g.strokeStyle = "#9b6bff";
  g.lineWidth = 5;
  g.stroke();
  g.strokeStyle = "#6c4aa8";
  g.lineWidth = 8;
  g.beginPath();
  g.moveTo(-90, -120);
  g.quadraticCurveTo(0, -190, 90, -120);
  g.stroke();
  for (const sx of [-80, 80]) {
    g.fillStyle = "#0d0816";
    g.beginPath();
    g.arc(sx, -55, 44, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#3a2a55";
    g.beginPath();
    g.arc(sx, -55, 30 + bop * 6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#c9b3ff";
    g.beginPath();
    g.arc(sx, -55, 8, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = "#00e5ff";
  g.fillRect(-26, -96, 52, 18);
  g.fillStyle = "#ff3df2";
  for (let i = 0; i < 5; i++) g.fillRect(-24 + i * 10, -36 - Math.abs(Math.sin(bop * 3 + i)) * 20, 6, Math.abs(Math.sin(bop * 3 + i)) * 20 + 4);
  g.restore();
}

// ─────────────────────────────── characters ───────────────────────────────
type Rig = { dx: number; dy: number; lean: number; squash: number; armL: number; armR: number };
function rig(pose: Pose, k: number, idleBop: number): Rig {
  // k: 0..1 how fresh the pose is (1 = just hit) — eases back towards neutral
  const e = Math.pow(k, 0.6);
  switch (pose) {
    case "left":
      return { dx: -26 * e, dy: 0, lean: -0.16 * e, squash: 0, armL: -1.2 * e, armR: 0.3 };
    case "right":
      return { dx: 26 * e, dy: 0, lean: 0.16 * e, squash: 0, armL: -0.3, armR: 1.2 * e };
    case "up":
      return { dx: 0, dy: -30 * e, lean: 0, squash: -0.08 * e, armL: -0.4, armR: 2.3 * e };
    case "down":
      return { dx: 0, dy: 26 * e, lean: 0, squash: 0.12 * e, armL: 0.6 * e, armR: -0.6 * e };
    case "miss":
      return { dx: -8 * e, dy: 10 * e, lean: -0.1 * e, squash: 0.05, armL: 0.5, armR: -0.5 };
    default:
      return { dx: 0, dy: idleBop * 10, lean: 0, squash: idleBop * 0.05, armL: 0.25 - idleBop * 0.15, armR: -0.25 + idleBop * 0.15 };
  }
}

/** player: "Volt" — a little stage robot with a visor face, antenna and a mic */
export function drawVolt(g: CanvasRenderingContext2D, x: number, y: number, pose: Pose, k: number, idleBop: number, t: number) {
  const r = rig(pose, k, idleBop);
  const miss = pose === "miss" && k > 0.05;
  const body = miss ? "#7f8aa6" : "#e9f4ff";
  const trim = miss ? "#6b5aa0" : "#00d6ff";
  g.save();
  g.translate(x + r.dx, y + r.dy);
  // shadow
  g.fillStyle = "rgba(0,0,0,.35)";
  g.beginPath();
  g.ellipse(-r.dx * 0.5, 4 - r.dy, 110, 18, 0, 0, Math.PI * 2);
  g.fill();
  g.rotate(r.lean);
  g.scale(1 + r.squash * 0.6, 1 - r.squash);
  // legs + sneakers
  g.fillStyle = "#2b2f45";
  g.fillRect(-48, -110, 30, 90);
  g.fillRect(18, -110, 30, 90);
  g.fillStyle = trim;
  g.beginPath();
  g.roundRect(-70, -26, 62, 28, 12);
  g.roundRect(8, -26, 62, 28, 12);
  g.fill();
  g.fillStyle = "#fff";
  g.fillRect(-66, -6, 54, 6);
  g.fillRect(12, -6, 54, 6);
  // torso
  g.fillStyle = body;
  g.beginPath();
  g.roundRect(-72, -260, 144, 160, 34);
  g.fill();
  g.strokeStyle = "#1a1d2e";
  g.lineWidth = 6;
  g.stroke();
  // chest light ring
  g.strokeStyle = trim;
  g.lineWidth = 8;
  g.beginPath();
  g.arc(0, -180, 26, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = trim;
  g.beginPath();
  g.arc(0, -180, 10 + Math.sin(t * 6) * 2, 0, Math.PI * 2);
  g.fill();
  // arms (left = screen left)
  const arm = (side: number, ang: number, mic: boolean) => {
    g.save();
    g.translate(side * 76, -236);
    g.rotate(side * 0.25 + ang * side * -1 * -1);
    g.strokeStyle = "#1a1d2e";
    g.lineWidth = 6;
    g.fillStyle = body;
    g.beginPath();
    g.roundRect(-16, 0, 32, 104, 16);
    g.fill();
    g.stroke();
    g.fillStyle = trim;
    g.beginPath();
    g.arc(0, 112, 20, 0, Math.PI * 2);
    g.fill();
    if (mic) {
      g.fillStyle = "#30344a";
      g.fillRect(-7, 112, 14, 46);
      g.fillStyle = "#c7cbe0";
      g.beginPath();
      g.arc(0, 168, 16, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  };
  arm(-1, r.armL, false);
  arm(1, -r.armR, true);
  // head (visor screen)
  g.save();
  g.translate(0, -282);
  g.rotate(-r.lean * 0.6);
  g.fillStyle = body;
  g.strokeStyle = "#1a1d2e";
  g.lineWidth = 6;
  g.beginPath();
  g.roundRect(-96, -150, 192, 150, 44);
  g.fill();
  g.stroke();
  // antenna
  g.beginPath();
  g.moveTo(0, -150);
  g.lineTo(10, -196);
  g.stroke();
  g.fillStyle = miss ? "#6b5aa0" : "#ff3df2";
  g.shadowColor = g.fillStyle as string;
  g.shadowBlur = 16;
  g.beginPath();
  g.arc(12, -204, 13, 0, Math.PI * 2);
  g.fill();
  g.shadowBlur = 0;
  // screen
  g.fillStyle = "#0d1022";
  g.beginPath();
  g.roundRect(-74, -128, 148, 104, 28);
  g.fill();
  // face
  g.strokeStyle = miss ? "#a993ff" : trim;
  g.fillStyle = g.strokeStyle;
  g.lineWidth = 9;
  g.lineCap = "round";
  if (miss) {
    for (const ex of [-34, 34]) {
      g.beginPath();
      g.moveTo(ex - 12, -96);
      g.lineTo(ex + 12, -72);
      g.moveTo(ex + 12, -96);
      g.lineTo(ex - 12, -72);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(-18, -46);
    g.quadraticCurveTo(0, -60, 18, -46);
    g.stroke();
  } else if (pose !== "idle" && k > 0.05) {
    // singing: open mouth
    for (const ex of [-34, 34]) {
      g.beginPath();
      g.arc(ex, -86, 10, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.ellipse(0, -50, 18, 8 + 10 * k, 0, 0, Math.PI * 2);
    g.fill();
  } else {
    const blink = Math.sin(t * 1.7) > 0.985;
    for (const ex of [-34, 34]) {
      g.beginPath();
      if (blink) {
        g.moveTo(ex - 12, -84);
        g.lineTo(ex + 12, -84);
      } else g.arc(ex, -80, 12, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
    }
    g.beginPath();
    g.arc(0, -56, 14, 0.2, Math.PI - 0.2);
    g.stroke();
  }
  g.restore();
  g.restore();
}

/** opponent: "Hex" — a hooded storm wraith with glowing eyes and floating hands */
export function drawHex(g: CanvasRenderingContext2D, x: number, y: number, pose: Pose, k: number, idleBop: number, t: number) {
  const r = rig(pose, k, idleBop);
  const hover = Math.sin(t * 2.2) * 12;
  g.save();
  g.translate(x + r.dx, y + r.dy * 0.8 + hover - 30);
  // ground glow
  g.save();
  g.translate(0, 30 - hover);
  const glow = g.createRadialGradient(0, 0, 10, 0, 0, 140);
  glow.addColorStop(0, "rgba(170,90,255,.45)");
  glow.addColorStop(1, "rgba(170,90,255,0)");
  g.fillStyle = glow;
  g.beginPath();
  g.ellipse(0, 0, 150, 30, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.rotate(r.lean);
  g.scale(1 + r.squash * 0.5, 1 - r.squash * 0.8);
  // cloak
  const cl = g.createLinearGradient(0, -420, 0, 0);
  cl.addColorStop(0, "#3a1a5c");
  cl.addColorStop(1, "#140822");
  g.fillStyle = cl;
  g.beginPath();
  g.moveTo(0, -420);
  g.bezierCurveTo(110, -410, 130, -260, 140, -120);
  // tattered hem
  for (let i = 0; i <= 8; i++) {
    const hx = 140 - i * 35;
    const hy = -20 + Math.sin(t * 4 + i) * 10 + (i % 2 ? -30 : 0);
    g.lineTo(hx, hy);
  }
  g.bezierCurveTo(-130, -260, -110, -410, 0, -420);
  g.closePath();
  g.fill();
  g.strokeStyle = "#7a3cff";
  g.lineWidth = 4;
  g.stroke();
  // hood opening
  g.fillStyle = "#07030d";
  g.beginPath();
  g.ellipse(0, -310, 66, 80, 0, 0, Math.PI * 2);
  g.fill();
  // eyes
  const singing = pose !== "idle" && pose !== "miss" && k > 0.05;
  g.fillStyle = singing ? "#ffe066" : "#d6b3ff";
  g.shadowColor = g.fillStyle as string;
  g.shadowBlur = 24;
  for (const ex of [-24, 24]) {
    g.beginPath();
    g.ellipse(ex, -322, 12, singing ? 5 : 9, ex < 0 ? 0.25 : -0.25, 0, Math.PI * 2);
    g.fill();
  }
  if (singing) {
    g.beginPath();
    g.ellipse(0, -276, 20, 6 + 12 * k, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.shadowBlur = 0;
  // floating hands
  const hand = (side: number, ang: number) => {
    const hx = side * (150 + Math.cos(ang) * 30);
    const hy = -230 + Math.sin(t * 3 + side) * 10 - ang * 60 * side;
    g.fillStyle = "#cdb6ff";
    g.shadowColor = "#9b6bff";
    g.shadowBlur = 18;
    g.beginPath();
    g.ellipse(hx, hy, 22, 28, side * 0.4, 0, Math.PI * 2);
    g.fill();
    for (let f = 0; f < 3; f++) {
      g.beginPath();
      g.ellipse(hx + side * (6 - f * 12) * 0.6, hy - 30, 6, 14, side * 0.3, 0, Math.PI * 2);
      g.fill();
    }
    g.shadowBlur = 0;
  };
  hand(-1, r.armL);
  hand(1, -r.armR);
  // orbiting wisps
  for (let i = 0; i < 3; i++) {
    const a = t * 1.5 + (i * Math.PI * 2) / 3;
    g.fillStyle = "rgba(200,150,255,.7)";
    g.beginPath();
    g.arc(Math.cos(a) * 170, -300 + Math.sin(a) * 50, 7, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/** tiny head icons for the health bar */
export function iconVolt(g: CanvasRenderingContext2D, x: number, y: number, s: number, losing: boolean) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.fillStyle = losing ? "#7f8aa6" : "#e9f4ff";
  g.strokeStyle = "#1a1d2e";
  g.lineWidth = 4;
  g.beginPath();
  g.roundRect(-40, -34, 80, 64, 18);
  g.fill();
  g.stroke();
  g.fillStyle = "#0d1022";
  g.beginPath();
  g.roundRect(-30, -24, 60, 42, 12);
  g.fill();
  g.strokeStyle = losing ? "#a993ff" : "#00d6ff";
  g.lineWidth = 5;
  g.lineCap = "round";
  for (const ex of [-13, 13]) {
    g.beginPath();
    if (losing) {
      g.moveTo(ex - 5, -12);
      g.lineTo(ex + 5, -2);
      g.moveTo(ex + 5, -12);
      g.lineTo(ex - 5, -2);
    } else g.arc(ex, -6, 5, Math.PI * 1.1, Math.PI * 1.9);
    g.stroke();
  }
  g.restore();
}
export function iconHex(g: CanvasRenderingContext2D, x: number, y: number, s: number, losing: boolean) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.fillStyle = "#3a1a5c";
  g.strokeStyle = "#7a3cff";
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(0, -46);
  g.bezierCurveTo(44, -42, 46, 10, 40, 34);
  g.lineTo(-40, 34);
  g.bezierCurveTo(-46, 10, -44, -42, 0, -46);
  g.fill();
  g.stroke();
  g.fillStyle = "#07030d";
  g.beginPath();
  g.ellipse(0, -2, 24, 28, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = losing ? "#8b7aa8" : "#ffe066";
  for (const ex of [-9, 9]) {
    g.beginPath();
    g.ellipse(ex, -6, 5, losing ? 2 : 4, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}
