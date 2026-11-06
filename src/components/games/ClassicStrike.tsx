"use client";

/**
 * Classic / Global Strike — Classic uses Canvas2D raycast; Global defaults to the
 * high-quality Three.js engine (mobile-tuned). Original homage, not Valve assets.
 */

import { useEffect, useRef, useState } from "react";
import { type GameProps } from "./common";
import { peerPose, type CsNet } from "./classicstrike/net";
import MobileControls from "./classicstrike/MobileControls";
import { freshTouchCtl } from "./classicstrike/touchCtl";
import { createHqEngine, type HqEngine } from "./classicstrike/hqEngine";

export type StrikeEngine = "raycast" | "hq";

type Team = "T" | "CT";
export type StrikeEdition = "classic" | "global";
type WepId =
  | "knife"
  | "glock"
  | "usp"
  | "p250"
  | "deagle"
  | "mac10"
  | "mp9"
  | "galil"
  | "famas"
  | "ak47"
  | "m4a1"
  | "aug"
  | "awp"
  | "ssg"
  | "he"
  | "flash"
  | "zeus";

type Wep = {
  id: WepId;
  name: string;
  price: number;
  dmg: number;
  rpm: number; // ms between shots
  mag: number;
  reserve: number;
  spread: number;
  team?: Team;
  /** classic-only or global-only; omit = both */
  edition?: StrikeEdition;
};

const ARSENAL: Wep[] = [
  { id: "knife", name: "Knife", price: 0, dmg: 55, rpm: 400, mag: 1, reserve: 0, spread: 0 },
  { id: "glock", name: "Glock-18", price: 200, dmg: 25, rpm: 150, mag: 20, reserve: 120, spread: 0.045, team: "T" },
  { id: "usp", name: "USP-S", price: 200, dmg: 30, rpm: 170, mag: 12, reserve: 100, spread: 0.03, team: "CT" },
  { id: "p250", name: "P250", price: 300, dmg: 28, rpm: 160, mag: 13, reserve: 52, spread: 0.035, edition: "global" },
  { id: "deagle", name: "Desert Eagle", price: 700, dmg: 54, rpm: 350, mag: 7, reserve: 35, spread: 0.02 },
  { id: "mac10", name: "MAC-10", price: 1050, dmg: 26, rpm: 70, mag: 30, reserve: 100, spread: 0.055, team: "T", edition: "global" },
  { id: "mp9", name: "MP9", price: 1250, dmg: 24, rpm: 65, mag: 30, reserve: 120, spread: 0.04, team: "CT", edition: "global" },
  { id: "galil", name: "Galil AR", price: 1800, dmg: 30, rpm: 95, mag: 35, reserve: 90, spread: 0.04, team: "T", edition: "global" },
  { id: "famas", name: "FAMAS", price: 2050, dmg: 28, rpm: 90, mag: 25, reserve: 90, spread: 0.03, team: "CT", edition: "global" },
  { id: "ak47", name: "AK-47", price: 2700, dmg: 36, rpm: 100, mag: 30, reserve: 90, spread: 0.035, team: "T" },
  { id: "m4a1", name: "M4A4", price: 3100, dmg: 32, rpm: 90, mag: 30, reserve: 90, spread: 0.025, team: "CT" },
  { id: "aug", name: "AUG", price: 3300, dmg: 33, rpm: 95, mag: 30, reserve: 90, spread: 0.02, team: "CT", edition: "global" },
  { id: "ssg", name: "SSG 08", price: 1700, dmg: 88, rpm: 1200, mag: 10, reserve: 90, spread: 0.004, edition: "global" },
  { id: "awp", name: "AWP", price: 4750, dmg: 110, rpm: 1400, mag: 10, reserve: 30, spread: 0.001 },
  { id: "zeus", name: "Zeus x27", price: 200, dmg: 100, rpm: 900, mag: 1, reserve: 0, spread: 0.01, edition: "global" },
  { id: "he", name: "HE Grenade", price: 300, dmg: 80, rpm: 800, mag: 1, reserve: 0, spread: 0.08 },
  { id: "flash", name: "Flashbang", price: 200, dmg: 0, rpm: 800, mag: 1, reserve: 0, spread: 0.1, edition: "global" },
];

function arsenalFor(edition: StrikeEdition) {
  return ARSENAL.filter((w) => !w.edition || w.edition === edition);
}

// Dust2-inspired grid (1 wall, 0 floor, 2 site A, 3 site B, 4 T spawn, 5 CT spawn)
const MAP: number[][] = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 4, 4, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 5, 5, 5, 1],
  [1, 4, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 5, 5, 1],
  [1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1],
  [1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 1, 2, 2, 2, 0, 0, 0, 0, 3, 3, 1, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 0, 0, 0, 1, 2, 2, 2, 0, 0, 0, 0, 3, 3, 1, 0, 0, 0, 1, 0, 0, 1],
  [1, 0, 1, 0, 0, 0, 0, 2, 2, 0, 0, 1, 1, 0, 0, 3, 0, 0, 0, 0, 1, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1],
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
  [1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];
const MH = MAP.length;
const MW = MAP[0].length;

type Bot = {
  x: number;
  y: number;
  a: number;
  hp: number;
  team: Team;
  wep: WepId;
  cool: number;
  alive: boolean;
  id?: string; // peer id when online remote
  name?: string;
  isPeer?: boolean;
};

type Phase = "buy" | "live" | "planted" | "over";

export type ClassicStrikeProps = GameProps & {
  mode?: "solo" | "online";
  net?: CsNet | null;
  playerName?: string;
  initialTeam?: Team;
  /** classic = 1.6 homage; global = CS:GO-style loadout */
  edition?: StrikeEdition;
  /** Global defaults to hq (Three.js); classic stays raycast */
  engine?: StrikeEngine;
};

export default function ClassicStrike({
  onOver,
  onScore,
  mode = "solo",
  net = null,
  playerName = "You",
  initialTeam = "T",
  edition = "classic",
  engine,
}: ClassicStrikeProps) {
  const online = mode === "online" && !!net;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const touchCtl = useRef(freshTouchCtl());
  const isTouch =
    typeof window !== "undefined" && (navigator.maxTouchPoints > 0 || "ontouchstart" in window);
  const preferHq = (engine ?? (edition === "global" ? "hq" : "raycast")) === "hq";
  const [hqOn, setHqOn] = useState(preferHq);
  const [hud, setHud] = useState({
    hp: 100,
    armor: 0,
    money: edition === "global" ? 800 : 800,
    kills: 0,
    deaths: 0,
    round: 1,
    time: edition === "global" ? 20 : 15,
    phase: "buy" as Phase,
    wep: (initialTeam === "CT" ? "usp" : "glock") as WepId,
    ammo: initialTeam === "CT" ? 12 : 20,
    reserve: initialTeam === "CT" ? 100 : 120,
    team: initialTeam,
    buyOpen: true,
    bomb: false,
    planted: false,
    onSite: false,
    msg: isTouch
      ? "BUY TIME — use BUY · stick to move · FIRE to shoot"
      : "BUY TIME — press B · WASD move · click to lock mouse",
  });
  const hudRef = useRef(hud);
  hudRef.current = hud;
  const [roster, setRoster] = useState<{ id: string; name: string; team: Team }[]>([]);
  const [buySheet, setBuySheet] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let hq: HqEngine | null = null;
    let ctx: CanvasRenderingContext2D | null = null;
    let useHq = preferHq;
    if (!preferHq) {
      ctx = canvas.getContext("2d");
      if (!ctx) return;
    }
    const pool = arsenalFor(edition);
    const wepOf = (id: WepId) => pool.find((w) => w.id === id) || pool[0]!;
    const ctl = touchCtl.current;

    let w = 0;
    let h = 0;
    let raf = 0;
    let alive = true;
    let ended = false;
    const onlineMode = mode === "online" && !!net;
    let lastRoundBroadcast = 0;
    let roundSeed = Math.floor(Math.random() * 1e9);

    const player = {
      x: 1.5,
      y: 1.5,
      a: 0,
      hp: 100,
      armor: 0,
      money: 800,
      team: initialTeam as Team,
      wep: (initialTeam === "CT" ? "usp" : "glock") as WepId,
      mag: initialTeam === "CT" ? 12 : 20,
      reserve: initialTeam === "CT" ? 100 : 120,
      cool: 0,
      kills: 0,
      deaths: 0,
      score: 0,
    };
    const keys: Record<string, boolean> = {};
    let pointerLocked = false;
    let phase: Phase = "buy";
    let phaseT = 15; // seconds
    let round = 1;
    let bombPlanted = false;
    let bombX = 0;
    let bombY = 0;
    let bombT = 40;
    let defuse = 0;
    let buyOpen = true;
    let flash = 0;
    let msg = hud.msg;
    let msgT = 3;
    const bots: Bot[] = [];
    const bullets: { x: number; y: number; a: number; life: number; dmg: number; from: "p" | "b"; team: Team }[] = [];
    const particles: { x: number; y: number; vx: number; vy: number; life: number; c: string }[] = [];

    const spawnCell = (code: number) => {
      const cells: { x: number; y: number }[] = [];
      for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (MAP[y][x] === code) cells.push({ x: x + 0.5, y: y + 0.5 });
      return cells[Math.floor(Math.random() * cells.length)] ?? { x: 2.5, y: 2.5 };
    };

    const giveDefault = () => {
      if (player.team === "T") {
        player.wep = "glock";
        player.mag = 20;
        player.reserve = 120;
      } else {
        player.wep = "usp";
        player.mag = 12;
        player.reserve = 100;
      }
    };

    const resetRound = (win?: Team) => {
      if (win) {
        player.money = Math.min(16000, player.money + (win === player.team ? 3250 : 1400));
        if (win === player.team) player.score += 500;
        msg = win === player.team ? "ROUND WIN — +$3250" : "ROUND LOSS — +$1400";
        msgT = 2.5;
      }
      round++;
      if (round > 8) {
        if (!ended) {
          ended = true;
          onOver(Math.max(0, Math.floor(player.score + player.kills * 100 + player.money)));
        }
        return;
      }
      const sp = spawnCell(player.team === "T" ? 4 : 5);
      player.x = sp.x;
      player.y = sp.y;
      player.hp = 100;
      player.a = player.team === "T" ? 0.2 : Math.PI;
      giveDefault();
      bombPlanted = false;
      defuse = 0;
      phase = "buy";
      phaseT = edition === "global" ? 20 : 15;
      buyOpen = true;
      setBuySheet(true);
      bots.length = 0;
      // Keep peer placeholders; refill AI bots for empty slots
      const peerIds = onlineMode && net ? [...net.peers.keys()] : [];
      let enemyPeers = 0;
      let allyPeers = 0;
      if (onlineMode && net) {
        for (const id of peerIds) {
          const p = net.peers.get(id);
          if (!p) continue;
          if (p.team !== player.team) enemyPeers++;
          else allyPeers++;
        }
      }
      const enemyTeam: Team = player.team === "T" ? "CT" : "T";
      const nEnemy = onlineMode ? Math.max(0, 4 - enemyPeers) : 4;
      const nAlly = onlineMode ? Math.max(0, 3 - allyPeers) : 3;
      for (let i = 0; i < nEnemy; i++) {
        const c = spawnCell(enemyTeam === "T" ? 4 : 5);
        bots.push({
          x: c.x + (Math.random() - 0.5) * 0.4,
          y: c.y + (Math.random() - 0.5) * 0.4,
          a: Math.random() * Math.PI * 2,
          hp: 100,
          team: enemyTeam,
          wep: enemyTeam === "T" ? (Math.random() > 0.5 ? "ak47" : "glock") : Math.random() > 0.5 ? "m4a1" : "usp",
          cool: 0,
          alive: true,
        });
      }
      for (let i = 0; i < nAlly; i++) {
        const c = spawnCell(player.team === "T" ? 4 : 5);
        bots.push({
          x: c.x + (Math.random() - 0.5) * 0.3,
          y: c.y + (Math.random() - 0.5) * 0.3,
          a: Math.random() * Math.PI * 2,
          hp: 100,
          team: player.team,
          wep: player.team === "T" ? "ak47" : "m4a1",
          cool: 0,
          alive: true,
        });
      }
      if (onlineMode && net?.isHost()) {
        lastRoundBroadcast = 0;
        broadcastRound();
      }
    };

    const broadcastRound = () => {
      if (!onlineMode || !net || !net.isHost()) return;
      net.round({
        round,
        phase,
        phaseT,
        bombPlanted,
        bombX,
        bombY,
        bombT,
        seed: roundSeed,
      });
      lastRoundBroadcast = performance.now();
    };

    const solid = (x: number, y: number) => {
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      if (ix < 0 || iy < 0 || ix >= MW || iy >= MH) return true;
      return MAP[iy][ix] === 1;
    };

    const tryMove = (nx: number, ny: number) => {
      if (!solid(nx, player.y)) player.x = nx;
      if (!solid(player.x, ny)) player.y = ny;
    };

    const shoot = (from: "p" | "b", x: number, y: number, a: number, team: Team, wid: WepId, opts?: { silent?: boolean }) => {
      const wp = wepOf(wid);
      if (wid === "flash") {
        flash = Math.max(flash, 1.1);
        if (onlineMode && net && from === "p" && !opts?.silent) {
          net.shot({ x, y, a, team, wep: wid, dmg: 0 });
        }
        return;
      }
      const spread = (Math.random() - 0.5) * wp.spread * 2;
      const ang = a + spread;
      const life = wid === "awp" || wid === "ssg" ? 80 : wid === "zeus" ? 12 : 45;
      bullets.push({ x, y, a: ang, life, dmg: wp.dmg, from, team });
      if (onlineMode && net && from === "p" && !opts?.silent) {
        net.shot({ x, y, a: ang, team, wep: wid, dmg: wp.dmg });
      }
      for (let i = 0; i < 4; i++) {
        particles.push({
          x: x + Math.cos(ang) * 0.2,
          y: y + Math.sin(ang) * 0.2,
          vx: Math.cos(ang + (Math.random() - 0.5)) * 0.05,
          vy: Math.sin(ang + (Math.random() - 0.5)) * 0.05,
          life: 8,
          c: "#fbbf24",
        });
      }
    };

    const buy = (id: WepId) => {
      if (phase !== "buy") return;
      const wp = wepOf(id);
      if (wp.team && wp.team !== player.team) {
        msg = "Wrong team weapon";
        msgT = 1.5;
        return;
      }
      if (player.money < wp.price) {
        msg = "Not enough money";
        msgT = 1.5;
        return;
      }
      player.money -= wp.price;
      player.wep = id;
      player.mag = wp.mag;
      player.reserve = wp.reserve;
      msg = `Bought ${wp.name}`;
      msgT = 1.2;
    };

    const resize = () => {
      const parent = canvas.parentElement;
      w = parent?.clientWidth || 640;
      h = parent?.clientHeight || 480;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      if (hq) {
        hq.resize(w, h);
      } else if (ctx) {
        const dpr = Math.min(devicePixelRatio || 1, isTouch ? 1.5 : 2);
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };
    resize();
    window.addEventListener("resize", resize);

    // Boot HQ Three.js engine (Global default); fall back to raycast if WebGL fails
    if (preferHq) {
      void createHqEngine(canvas, MAP, { mobile: isTouch })
        .then((eng) => {
          if (!alive) {
            eng.dispose();
            return;
          }
          hq = eng;
          useHq = true;
          setHqOn(true);
          resize();
        })
        .catch(() => {
          if (!alive) return;
          ctx = canvas.getContext("2d");
          useHq = false;
          setHqOn(false);
          resize();
        });
    }

    const onKey = (e: KeyboardEvent) => {
      keys[e.code] = e.type === "keydown";
      if (e.type === "keydown") {
        if (e.code === "KeyB") {
          buyOpen = !buyOpen && phase === "buy";
          setBuySheet(!!buyOpen);
        }
        if (e.code === "KeyR" && player.reserve > 0) {
          const wp = wepOf(player.wep);
          const need = wp.mag - player.mag;
          const take = Math.min(need, player.reserve);
          player.mag += take;
          player.reserve -= take;
        }
        if (e.code === "KeyE" && bombPlanted && player.team === "CT") {
          const d = Math.hypot(player.x - bombX, player.y - bombY);
          if (d < 0.8) defuse = Math.min(10, defuse + 0.35);
        }
        if (e.code === "KeyG") {
          // plant if on site as T
          if (player.team === "T" && phase === "live" && !bombPlanted) {
            const ix = Math.floor(player.x);
            const iy = Math.floor(player.y);
            if (MAP[iy]?.[ix] === 2 || MAP[iy]?.[ix] === 3) {
              bombPlanted = true;
              bombX = player.x;
              bombY = player.y;
              bombT = 40;
              phase = "planted";
              phaseT = 40;
              player.score += 300;
              msg = "BOMB PLANTED";
              msgT = 2;
              if (onlineMode && net) {
                net.plant(bombX, bombY, bombT);
                broadcastRound();
              }
            }
          }
        }
        if (phase === "buy" && buyOpen) {
          const slots: (WepId | "armor")[] =
            edition === "global"
              ? [
                  player.team === "T" ? "glock" : "usp",
                  "p250",
                  "deagle",
                  player.team === "T" ? "mac10" : "mp9",
                  player.team === "T" ? "galil" : "famas",
                  player.team === "T" ? "ak47" : "aug",
                  "ssg",
                  "awp",
                  "zeus",
                  "armor",
                ]
              : [player.team === "T" ? "glock" : "usp", "deagle", player.team === "T" ? "ak47" : "m4a1", "awp", "armor"];
          const digit = Number(e.code.replace("Digit", ""));
          if (digit >= 1 && digit <= slots.length) {
            const pick = slots[digit - 1];
            if (pick === "armor") {
              const cost = edition === "global" ? 1000 : 650;
              if (player.money >= cost) {
                player.money -= cost;
                player.armor = 100;
                msg = "Kevlar + Helmet";
                msgT = 1;
              }
            } else buy(pick);
          }
        }
        if (e.code === "KeyT") {
          player.team = "T";
          if (onlineMode && net) net.setTeam("T");
          giveDefault();
          resetRound();
          msg = "Joined Terrorists";
          msgT = 2;
        }
        if (e.code === "KeyC") {
          player.team = "CT";
          if (onlineMode && net) net.setTeam("CT");
          giveDefault();
          resetRound();
          msg = "Joined Counter-Terrorists";
          msgT = 2;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);

    const tryFire = () => {
      if (phase === "buy") return;
      if (player.cool > 0 || player.mag <= 0 || player.hp <= 0) return;
      const wp = wepOf(player.wep);
      player.cool = wp.rpm / 1000;
      player.mag--;
      shoot("p", player.x, player.y, player.a, player.team, player.wep);
    };
    const onClick = async () => {
      if (!isTouch && !pointerLocked) {
        try {
          await canvas.requestPointerLock();
        } catch {
          /* */
        }
      }
      if (!isTouch) tryFire();
    };
    canvas.addEventListener("click", onClick);
    const onMouse = (e: MouseEvent) => {
      if (document.pointerLockElement === canvas) {
        player.a += e.movementX * 0.0025;
      }
    };
    document.addEventListener("mousemove", onMouse);
    document.addEventListener("pointerlockchange", () => {
      pointerLocked = document.pointerLockElement === canvas;
    });

    // Legacy canvas touch fallback when overlay isn't used
    let touchX = 0;
    const onTouchMove = (e: TouchEvent) => {
      if (isTouch) return;
      if (!e.touches[0]) return;
      const dx = e.touches[0].clientX - touchX;
      touchX = e.touches[0].clientX;
      player.a += dx * 0.01;
      e.preventDefault();
    };
    const onTouchStart = (e: TouchEvent) => {
      if (isTouch) return;
      touchX = e.touches[0]?.clientX ?? 0;
      if (e.touches.length > 1) tryFire();
    };
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchstart", onTouchStart);

    // Sync team from lobby presence once online
    if (onlineMode && net) {
      // Prefer CT if more T peers already (simple balance) — keep launcher choice via presence
      net.on({
        shot: (s) => {
          if (s.id === net.me) return;
          bullets.push({
            x: s.x,
            y: s.y,
            a: s.a,
            life: s.wep === "awp" ? 80 : 45,
            dmg: s.dmg,
            from: "b",
            team: s.team,
          });
        },
        hit: (h) => {
          if (h.to !== net.me || player.hp <= 0) return;
          let dmg = h.dmg;
          if (player.armor > 0) {
            const absorb = Math.min(player.armor, dmg * 0.5);
            player.armor -= absorb;
            dmg -= absorb;
          }
          player.hp -= dmg;
          flash = 0.15;
          if (player.hp <= 0) {
            player.deaths++;
            msg = "YOU DIED";
            msgT = 2;
            setTimeout(() => {
              if (!ended) resetRound(player.team === "T" ? "CT" : "T");
            }, 1800);
          }
        },
        plant: (p) => {
          if (bombPlanted) return;
          bombPlanted = true;
          bombX = p.x;
          bombY = p.y;
          bombT = p.t;
          phase = "planted";
          phaseT = p.t;
          msg = "BOMB PLANTED";
          msgT = 2;
        },
        defuse: () => {
          if (!bombPlanted) return;
          msg = "BOMB DEFUSED";
          msgT = 2;
          resetRound("CT");
        },
        round: (r) => {
          if (net.isHost()) return;
          round = r.round;
          phase = r.phase;
          phaseT = r.phaseT;
          bombPlanted = r.bombPlanted;
          bombX = r.bombX;
          bombY = r.bombY;
          bombT = r.bombT;
          roundSeed = r.seed;
          buyOpen = r.phase === "buy";
          if (r.phase === "buy") {
            const sp = spawnCell(player.team === "T" ? 4 : 5);
            player.x = sp.x;
            player.y = sp.y;
            player.hp = 100;
            giveDefault();
            defuse = 0;
          }
        },
        peers: () => {
          const list = [...net.peers.values()].map((p) => ({ id: p.id, name: p.name, team: p.team as Team }));
          setRoster(list);
        },
        team: () => {
          const list = [...net.peers.values()].map((p) => ({ id: p.id, name: p.name, team: p.team as Team }));
          setRoster(list);
        },
      });
    }

    resetRound();

    let last = performance.now();
    const syncHud = () => {
      const ix = Math.floor(player.x);
      const iy = Math.floor(player.y);
      const cell = MAP[iy]?.[ix];
      const next = {
        hp: Math.max(0, Math.ceil(player.hp)),
        armor: player.armor,
        money: player.money,
        kills: player.kills,
        deaths: player.deaths,
        round,
        time: Math.ceil(phaseT),
        phase,
        wep: player.wep,
        ammo: player.mag,
        reserve: player.reserve,
        team: player.team,
        buyOpen,
        bomb: player.team === "T",
        planted: bombPlanted,
        onSite: cell === 2 || cell === 3,
        msg,
      };
      setHud(next);
      onScore(Math.floor(player.score + player.kills * 100));
    };

    const tick = (now: number) => {
      if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (msgT > 0) msgT -= dt;
      else msg = "";

      if (player.cool > 0) player.cool -= dt;
      if (flash > 0) flash -= dt;

      // phase timer
      phaseT -= dt;
      if (phase === "buy" && phaseT <= 0) {
        phase = "live";
        phaseT = 105;
        buyOpen = false;
        msg = "ROUND LIVE";
        msgT = 1.5;
      } else if (phase === "live" && phaseT <= 0) {
        // time up — CT win if bomb not planted
        resetRound(bombPlanted ? "T" : "CT");
      } else if (phase === "planted") {
        bombT -= dt;
        phaseT = bombT;
        if (defuse >= 10) {
          msg = "BOMB DEFUSED";
          msgT = 2;
          player.score += 300;
          if (onlineMode && net) net.defuse();
          resetRound("CT");
        } else if (bombT <= 0) {
          flash = 0.8;
          msg = "TERRORISTS WIN";
          msgT = 2;
          resetRound("T");
        }
      }

      // apply touch look / actions
      if (ctl.look) {
        player.a += ctl.look;
        ctl.look = 0;
      }
      if (ctl.fire) tryFire();
      if (ctl.reload) {
        ctl.reload = false;
        if (player.reserve > 0) {
          const wp = wepOf(player.wep);
          const need = wp.mag - player.mag;
          const take = Math.min(need, player.reserve);
          player.mag += take;
          player.reserve -= take;
        }
      }
      if (ctl.plant && player.team === "T" && phase === "live" && !bombPlanted) {
        ctl.plant = false;
        const ix = Math.floor(player.x);
        const iy = Math.floor(player.y);
        if (MAP[iy]?.[ix] === 2 || MAP[iy]?.[ix] === 3) {
          bombPlanted = true;
          bombX = player.x;
          bombY = player.y;
          bombT = 40;
          phase = "planted";
          phaseT = 40;
          player.score += 300;
          msg = "BOMB PLANTED";
          msgT = 2;
          if (onlineMode && net) {
            net.plant(bombX, bombY, bombT);
            broadcastRound();
          }
        }
      }
      if (ctl.defuse && bombPlanted && player.team === "CT") {
        const d = Math.hypot(player.x - bombX, player.y - bombY);
        if (d < 0.8) defuse = Math.min(10, defuse + dt * 1.15);
      }
      if (ctl.buyToggle) {
        ctl.buyToggle = false;
        if (phase === "buy") {
          buyOpen = !buyOpen;
          setBuySheet(buyOpen);
        }
      }
      if (ctl.buySlot != null && phase === "buy") {
        const slots: (WepId | "armor")[] =
          edition === "global"
            ? [
                player.team === "T" ? "glock" : "usp",
                "p250",
                "deagle",
                player.team === "T" ? "mac10" : "mp9",
                player.team === "T" ? "galil" : "famas",
                player.team === "T" ? "ak47" : "aug",
                "ssg",
                "awp",
                "zeus",
                "armor",
              ]
            : [player.team === "T" ? "glock" : "usp", "deagle", player.team === "T" ? "ak47" : "m4a1", "awp", "armor"];
        const pick = slots[ctl.buySlot];
        ctl.buySlot = null;
        if (pick === "armor") {
          const cost = edition === "global" ? 1000 : 650;
          if (player.money >= cost) {
            player.money -= cost;
            player.armor = 100;
            msg = "Kevlar + Helmet";
            msgT = 1;
          }
        } else if (pick) buy(pick);
      }
      if (ctl.armor) {
        ctl.armor = false;
        const cost = edition === "global" ? 1000 : 650;
        if (phase === "buy" && player.money >= cost) {
          player.money -= cost;
          player.armor = 100;
          msg = "Kevlar + Helmet";
          msgT = 1;
        }
      }

      // movement (keyboard + virtual stick)
      if (player.hp > 0) {
        const sp = keys.ShiftLeft || keys.ShiftRight ? 2.6 : 3.4;
        let mx = 0;
        let my = 0;
        if (keys.KeyW || keys.ArrowUp) {
          mx += Math.cos(player.a);
          my += Math.sin(player.a);
        }
        if (keys.KeyS || keys.ArrowDown) {
          mx -= Math.cos(player.a);
          my -= Math.sin(player.a);
        }
        if (keys.KeyA) {
          mx += Math.cos(player.a - Math.PI / 2);
          my += Math.sin(player.a - Math.PI / 2);
        }
        if (keys.KeyD) {
          mx += Math.cos(player.a + Math.PI / 2);
          my += Math.sin(player.a + Math.PI / 2);
        }
        // stick: my = forward, mx = strafe
        if (ctl.my || ctl.mx) {
          mx += Math.cos(player.a) * ctl.my + Math.cos(player.a + Math.PI / 2) * ctl.mx;
          my += Math.sin(player.a) * ctl.my + Math.sin(player.a + Math.PI / 2) * ctl.mx;
        }
        const len = Math.hypot(mx, my) || 1;
        tryMove(player.x + (mx / len) * sp * dt, player.y + (my / len) * sp * dt);
      }

      // online: sync peer sprites into bots list + broadcast pose
      if (onlineMode && net) {
        net.send({
          x: player.x,
          y: player.y,
          a: player.a,
          hp: player.hp,
          armor: player.armor,
          team: player.team,
          wep: player.wep,
          alive: player.hp > 0,
        });
        // refresh peer bots
        for (let i = bots.length - 1; i >= 0; i--) if (bots[i].isPeer) bots.splice(i, 1);
        const nowP = performance.now();
        for (const p of net.peers.values()) {
          const pose = peerPose(p, nowP);
          if (!pose || pose.stale || !pose.alive) continue;
          bots.push({
            id: p.id,
            name: p.name,
            isPeer: true,
            x: pose.x,
            y: pose.y,
            a: pose.a,
            hp: pose.hp,
            team: pose.team as Team,
            wep: (pose.wep as WepId) || "glock",
            cool: 0,
            alive: true,
          });
        }
        if (net.isHost() && nowP - lastRoundBroadcast > 2000) broadcastRound();
      }

      // bots AI
      for (const b of bots) {
        if (!b.alive || b.isPeer) continue;
        b.cool = Math.max(0, b.cool - dt);
        const enemy = b.team !== player.team && player.hp > 0;
        let tx = player.x;
        let ty = player.y;
        if (!enemy) {
          // push toward bombsite / enemy spawn
          const goal = spawnCell(b.team === "T" ? 2 : 4);
          tx = goal.x;
          ty = goal.y;
        }
        const ang = Math.atan2(ty - b.y, tx - b.x);
        b.a = ang;
        const dist = Math.hypot(tx - b.x, ty - b.y);
        if (dist > 0.6) {
          const nx = b.x + Math.cos(b.a) * 2.2 * dt;
          const ny = b.y + Math.sin(b.a) * 2.2 * dt;
          if (!solid(nx, b.y)) b.x = nx;
          if (!solid(b.x, ny)) b.y = ny;
        }
        if (enemy && dist < 14 && b.cool <= 0 && Math.random() < 0.04) {
          // line of sight rough
          b.cool = wepOf(b.wep).rpm / 1000;
          shoot("b", b.x, b.y, b.a, b.team, b.wep);
        }
        // T bots plant if on site
        if (b.team === "T" && phase === "live" && !bombPlanted) {
          const ix = Math.floor(b.x);
          const iy = Math.floor(b.y);
          if ((MAP[iy]?.[ix] === 2 || MAP[iy]?.[ix] === 3) && Math.random() < 0.002) {
            bombPlanted = true;
            bombX = b.x;
            bombY = b.y;
            bombT = 40;
            phase = "planted";
            phaseT = 40;
            msg = "BOMB PLANTED";
            msgT = 2;
          }
        }
      }

      // bullets
      for (let i = bullets.length - 1; i >= 0; i--) {
        const bl = bullets[i];
        bl.x += Math.cos(bl.a) * 28 * dt;
        bl.y += Math.sin(bl.a) * 28 * dt;
        bl.life -= 60 * dt;
        if (bl.life <= 0 || solid(bl.x, bl.y)) {
          bullets.splice(i, 1);
          continue;
        }
        if (bl.from === "b" && bl.team !== player.team && player.hp > 0) {
          if (Math.hypot(bl.x - player.x, bl.y - player.y) < 0.28) {
            let dmg = bl.dmg;
            if (player.armor > 0) {
              const absorb = Math.min(player.armor, dmg * 0.5);
              player.armor -= absorb;
              dmg -= absorb;
            }
            player.hp -= dmg;
            bullets.splice(i, 1);
            flash = 0.15;
            if (player.hp <= 0) {
              player.deaths++;
              msg = "YOU DIED";
              msgT = 2;
              setTimeout(() => {
                if (!ended) resetRound(player.team === "T" ? "CT" : "T");
              }, 1800);
            }
            continue;
          }
        }
        if (bl.from === "p") {
          for (const b of bots) {
            if (!b.alive || b.team === player.team) continue;
            if (Math.hypot(bl.x - b.x, bl.y - b.y) < 0.32) {
              bullets.splice(i, 1);
              particles.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 12, c: "#ef4444" });
              if (b.isPeer && b.id && onlineMode && net) {
                net.hit(b.id, bl.dmg);
                // optimistic FX; peer applies real HP
                msg = "HIT";
                msgT = 0.4;
              } else {
                b.hp -= bl.dmg;
                if (b.hp <= 0) {
                  b.alive = false;
                  player.kills++;
                  player.money = Math.min(16000, player.money + 300);
                  player.score += 100;
                  msg = "ENEMY DOWN +$300";
                  msgT = 1.2;
                  if (!bots.some((x) => x.alive && x.team !== player.team && !x.isPeer) &&
                      !(onlineMode && net && [...net.peers.values()].some((p) => p.team !== player.team && p.last?.alive))) {
                    msg = "ENEMY ELIMINATED";
                    msgT = 2;
                    setTimeout(() => resetRound(player.team), 1500);
                  }
                }
              }
              break;
            }
          }
        }
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        if (p.life <= 0) particles.splice(i, 1);
      }

      // ——— RENDER ———
      if (hq && useHq) {
        hq.frame({
          player: { x: player.x, y: player.y, a: player.a },
          bots: bots.map((b) => ({
            x: b.x,
            y: b.y,
            a: b.a,
            hp: b.hp,
            team: b.team,
            alive: b.alive,
            name: b.name,
          })),
          bomb: bombPlanted ? { x: bombX, y: bombY, t: bombT } : null,
          flash,
          wep: player.wep,
        });
        syncHud();
        raf = requestAnimationFrame(tick);
        return;
      }

      const g = ctx;
      if (!g) {
        syncHud();
        raf = requestAnimationFrame(tick);
        return;
      }

      // Canvas2D raycaster (Classic / HQ fallback)
      const FOV = Math.PI / 3;
      const rays = Math.min(320, w);
      g.fillStyle = "#1c1917";
      g.fillRect(0, 0, w, h / 2);
      g.fillStyle = "#292524";
      g.fillRect(0, h / 2, w, h / 2);

      for (let col = 0; col < rays; col++) {
        const rayA = player.a - FOV / 2 + (col / rays) * FOV;
        let dist = 0;
        let hit = 0;
        let hitX = 0;
        let hitY = 0;
        const step = 0.02;
        while (dist < 18) {
          dist += step;
          hitX = player.x + Math.cos(rayA) * dist;
          hitY = player.y + Math.sin(rayA) * dist;
          const ix = Math.floor(hitX);
          const iy = Math.floor(hitY);
          if (ix < 0 || iy < 0 || ix >= MW || iy >= MH) {
            hit = 1;
            break;
          }
          const cell = MAP[iy][ix];
          if (cell === 1) {
            hit = 1;
            break;
          }
          if (cell === 2 || cell === 3) {
            // mark sites lightly
            hit = cell;
            // don't stop — sites are floor
          }
        }
        const z = dist * Math.cos(rayA - player.a);
        const wallH = Math.min(h * 1.8, (h * 1.15) / Math.max(0.05, z));
        const shade = Math.max(0.15, 1 - dist / 16);
        if (hit === 1) {
          const side = Math.abs(Math.floor(hitX) - hitX) < 0.02 || Math.abs(Math.ceil(hitX) - hitX) < 0.02;
          g.fillStyle = side ? `rgb(${40 * shade | 0},${55 * shade | 0},${40 * shade | 0})` : `rgb(${70 * shade | 0},${90 * shade | 0},${55 * shade | 0})`;
          g.fillRect((col * w) / rays, (h - wallH) / 2, w / rays + 1, wallH);
        }
      }

      // sprites (bots + bomb)
      type Spr = { dist: number; draw: () => void };
      const sprs: Spr[] = [];
      for (const b of bots) {
        if (!b.alive) continue;
        const dx = b.x - player.x;
        const dy = b.y - player.y;
        const dist = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx) - player.a;
        let a = ang;
        while (a > Math.PI) a -= Math.PI * 2;
        while (a < -Math.PI) a += Math.PI * 2;
        if (Math.abs(a) > FOV) continue;
        sprs.push({
          dist,
          draw: () => {
            const size = Math.min(h * 0.9, (h * 0.55) / dist);
            const sx = w / 2 + (a / FOV) * w - size / 2;
            const sy = h / 2 - size * 0.15;
            g.fillStyle = b.team === "T" ? "#b45309" : "#1d4ed8";
            g.fillRect(sx + size * 0.3, sy + size * 0.25, size * 0.4, size * 0.55);
            g.fillStyle = "#fcd34d";
            g.beginPath();
            g.arc(sx + size / 2, sy + size * 0.2, size * 0.18, 0, Math.PI * 2);
            g.fill();
            if (b.name) {
              g.fillStyle = "#fff";
              g.font = `bold ${Math.max(10, size * 0.12)}px sans-serif`;
              g.textAlign = "center";
              g.fillText(b.name.slice(0, 12), sx + size / 2, sy - 4);
            }
            // HP bar
            g.fillStyle = "#000";
            g.fillRect(sx + size * 0.2, sy, size * 0.6, 4);
            g.fillStyle = "#22c55e";
            g.fillRect(sx + size * 0.2, sy, size * 0.6 * (b.hp / 100), 4);
          },
        });
      }
      if (bombPlanted) {
        const dx = bombX - player.x;
        const dy = bombY - player.y;
        const dist = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx) - player.a;
        let a = ang;
        while (a > Math.PI) a -= Math.PI * 2;
        while (a < -Math.PI) a += Math.PI * 2;
        if (Math.abs(a) < FOV) {
          sprs.push({
            dist,
            draw: () => {
              const size = Math.min(80, 40 / dist);
              const sx = w / 2 + (a / FOV) * w;
              const sy = h / 2 + 20;
              g.fillStyle = "#111";
              g.fillRect(sx - size / 2, sy, size, size * 0.5);
              g.fillStyle = bombT < 10 ? "#ef4444" : "#fbbf24";
              g.font = `bold ${Math.max(10, size * 0.45)}px monospace`;
              g.textAlign = "center";
              g.fillText(bombT.toFixed(1), sx, sy + size * 0.4);
            },
          });
        }
      }
      sprs.sort((a, b) => b.dist - a.dist);
      for (const s of sprs) s.draw();

      // gun viewmodel
      g.fillStyle = "#44403c";
      g.fillRect(w * 0.55, h * 0.72, w * 0.35, h * 0.28);
      g.fillStyle = "#292524";
      g.fillRect(w * 0.62, h * 0.68, w * 0.12, h * 0.1);
      g.fillStyle = "#a8a29e";
      g.fillRect(w * 0.64, h * 0.55, w * 0.06, h * 0.15);

      // crosshair
      g.strokeStyle = "#fafafa";
      g.lineWidth = 1.5;
      const cx = w / 2;
      const cy = h / 2;
      const gap = 4;
      const len = 8;
      g.beginPath();
      g.moveTo(cx - gap - len, cy);
      g.lineTo(cx - gap, cy);
      g.moveTo(cx + gap, cy);
      g.lineTo(cx + gap + len, cy);
      g.moveTo(cx, cy - gap - len);
      g.lineTo(cx, cy - gap);
      g.moveTo(cx, cy + gap);
      g.lineTo(cx, cy + gap + len);
      g.stroke();

      // minimap
      const ms = 6;
      const mox = 12;
      const moy = 12;
      g.globalAlpha = 0.85;
      for (let y = 0; y < MH; y++) {
        for (let x = 0; x < MW; x++) {
          const c = MAP[y][x];
          g.fillStyle = c === 1 ? "#3f3f46" : c === 2 ? "#b91c1c" : c === 3 ? "#1d4ed8" : c === 4 ? "#a16207" : c === 5 ? "#1e3a8a" : "#57534e";
          g.fillRect(mox + x * ms, moy + y * ms, ms - 0.5, ms - 0.5);
        }
      }
      g.fillStyle = "#fbbf24";
      g.beginPath();
      g.arc(mox + player.x * ms, moy + player.y * ms, 2.5, 0, Math.PI * 2);
      g.fill();
      for (const b of bots) {
        if (!b.alive) continue;
        g.fillStyle = b.team === "T" ? "#f97316" : "#60a5fa";
        g.fillRect(mox + b.x * ms - 1.5, moy + b.y * ms - 1.5, 3, 3);
      }
      if (bombPlanted) {
        g.fillStyle = "#ef4444";
        g.fillRect(mox + bombX * ms - 2, moy + bombY * ms - 2, 4, 4);
      }
      g.globalAlpha = 1;

      if (flash > 0) {
        g.fillStyle = `rgba(255,255,255,${Math.min(0.85, flash)})`;
        g.fillRect(0, 0, w, h);
      }

      // Desktop buy overlay (touch uses HTML sheet)
      if (buyOpen && phase === "buy" && !isTouch) {
        g.fillStyle = "rgba(0,0,0,0.72)";
        g.fillRect(w * 0.12, h * 0.12, w * 0.76, h * 0.7);
        g.strokeStyle = edition === "global" ? "#f97316" : "#fbbf24";
        g.strokeRect(w * 0.12, h * 0.12, w * 0.76, h * 0.7);
        g.fillStyle = edition === "global" ? "#f97316" : "#fbbf24";
        g.font = "bold 18px monospace";
        g.textAlign = "left";
        g.fillText(edition === "global" ? "GLOBAL BUY (B)" : "BUY MENU  (B to close)", w * 0.15, h * 0.18);
        g.font = "12px monospace";
        g.fillStyle = "#e7e5e4";
        const lines =
          edition === "global"
            ? [
                `1  ${player.team === "T" ? "Glock-18" : "USP-S"}`,
                "2  P250 $300",
                "3  Desert Eagle $700",
                `4  ${player.team === "T" ? "MAC-10 $1050" : "MP9 $1250"}`,
                `5  ${player.team === "T" ? "Galil $1800" : "FAMAS $2050"}`,
                `6  ${player.team === "T" ? "AK-47 $2700" : "AUG $3300"}`,
                "7  SSG 08 $1700",
                "8  AWP $4750",
                "9  Zeus $200   0  Armor $1000",
              ]
            : [
                `1  ${player.team === "T" ? "Glock-18" : "USP-S"}`,
                "2  Desert Eagle   $700",
                `3  ${player.team === "T" ? "AK-47 $2700" : "M4A4 $3100"}`,
                "4  AWP            $4750",
                "5  Kevlar+Helmet  $650",
              ];
        lines.forEach((l, i) => g.fillText(l, w * 0.15, h * 0.24 + i * 20));
        g.fillStyle = "#a3e635";
        g.fillText(`Money $${player.money}`, w * 0.15, h * 0.76);
      }

      if (!pointerLocked && !buyOpen && !isTouch) {
        g.fillStyle = "rgba(0,0,0,0.5)";
        g.fillRect(0, h * 0.42, w, 36);
        g.fillStyle = "#fff";
        g.font = "14px sans-serif";
        g.textAlign = "center";
        g.fillText("Click to capture mouse · WASD move · B buy · R reload", w / 2, h * 0.42 + 24);
      }

      syncHud();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      document.removeEventListener("mousemove", onMouse);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchstart", onTouchStart);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      hq?.dispose();
    };
  }, [onOver, onScore, mode, net, playerName, initialTeam, edition, isTouch, preferHq]);

  const buyItems =
    edition === "global"
      ? [
          { slot: 0, label: hud.team === "T" ? "Glock" : "USP-S", price: 200 },
          { slot: 1, label: "P250", price: 300 },
          { slot: 2, label: "Deagle", price: 700 },
          { slot: 3, label: hud.team === "T" ? "MAC-10" : "MP9", price: hud.team === "T" ? 1050 : 1250 },
          { slot: 4, label: hud.team === "T" ? "Galil" : "FAMAS", price: hud.team === "T" ? 1800 : 2050 },
          { slot: 5, label: hud.team === "T" ? "AK-47" : "AUG", price: hud.team === "T" ? 2700 : 3300 },
          { slot: 6, label: "SSG 08", price: 1700 },
          { slot: 7, label: "AWP", price: 4750 },
          { slot: 8, label: "Zeus", price: 200 },
          { slot: 9, label: "Armor", price: 1000 },
        ]
      : [
          { slot: 0, label: hud.team === "T" ? "Glock" : "USP-S", price: 200 },
          { slot: 1, label: "Deagle", price: 700 },
          { slot: 2, label: hud.team === "T" ? "AK-47" : "M4A4", price: hud.team === "T" ? 2700 : 3100 },
          { slot: 3, label: "AWP", price: 4750 },
          { slot: 4, label: "Armor", price: 650 },
        ];

  return (
    <div className="relative size-full min-h-[360px] overflow-hidden bg-black select-none">
      <canvas ref={canvasRef} className="size-full touch-none" />
      {/* HQ crosshair + engine badge (raycast draws these on canvas) */}
      {hqOn && (
        <>
          <div className="pointer-events-none absolute inset-0 z-[5] grid place-items-center">
            <div className="relative size-6">
              <div className="absolute top-1/2 left-0 h-px w-2 -translate-y-1/2 bg-white/90" />
              <div className="absolute top-1/2 right-0 h-px w-2 -translate-y-1/2 bg-white/90" />
              <div className="absolute top-0 left-1/2 h-2 w-px -translate-x-1/2 bg-white/90" />
              <div className="absolute bottom-0 left-1/2 h-2 w-px -translate-x-1/2 bg-white/90" />
            </div>
          </div>
          <div className="pointer-events-none absolute top-2 left-1/2 z-[5] -translate-x-1/2 rounded-full bg-sky-500/25 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-sky-100 ring-1 ring-sky-400/40">
            HQ ENGINE{isTouch ? " · MOBILE" : ""}
          </div>
        </>
      )}
      {isTouch && (
        <MobileControls
          ctl={touchCtl}
          team={hud.team}
          canPlant={hud.team === "T" && hud.phase === "live" && !hud.planted && hud.onSite}
          canDefuse={hud.team === "CT" && hud.planted}
          buyOpen={buySheet && hud.phase === "buy"}
          onBuyOpen={() => {
            touchCtl.current.buyToggle = true;
            setBuySheet((v) => !v);
          }}
        />
      )}
      {/* Touch buy sheet */}
      {isTouch && buySheet && hud.phase === "buy" && (
        <div className="absolute inset-x-0 top-12 bottom-40 z-30 flex flex-col bg-black/80 px-3 py-2 backdrop-blur-sm">
          <div className="mb-2 flex items-center justify-between">
            <div className="font-mono text-sm font-black text-orange-300">{edition === "global" ? "GLOBAL BUY" : "BUY MENU"}</div>
            <div className="font-mono text-sm text-lime-300">${hud.money}</div>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
            {buyItems.map((it) => (
              <button
                key={it.slot}
                type="button"
                disabled={hud.money < it.price}
                onClick={() => {
                  touchCtl.current.buySlot = it.slot;
                }}
                className="rounded-2xl bg-white/10 px-3 py-3 text-left active:bg-orange-500/40 disabled:opacity-40"
              >
                <div className="text-sm font-bold text-white">{it.label}</div>
                <div className="font-mono text-xs text-amber-300">${it.price}</div>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setBuySheet(false)} className="mt-2 rounded-full bg-lime-500 py-2.5 text-sm font-black text-black">
            Close buy · start round
          </button>
        </div>
      )}
      {/* HUD chrome — lifted on phones so it clears the virtual pads */}
      <div
        className={`pointer-events-none absolute inset-x-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/85 to-transparent text-white ${isTouch ? "bottom-[7.5rem] px-2 pb-1" : "bottom-0 p-3"}`}
      >
        <div>
          <div className={`font-mono font-black tabular-nums ${isTouch ? "text-xl" : "text-2xl"}`}>
            <span className={hud.hp < 30 ? "text-red-400" : "text-white"}>{hud.hp}</span>
            <span className="text-sm text-white/50"> HP</span>
            {hud.armor > 0 && <span className="ml-2 text-sky-300">{hud.armor} AP</span>}
          </div>
          <div className="font-mono text-xs text-amber-300">${hud.money}</div>
        </div>
        <div className="text-center">
          <div className="font-mono text-lg font-bold tabular-nums">
            {hud.phase === "planted" ? "💣 " : ""}
            {Math.floor(hud.time / 60)}:{String(hud.time % 60).padStart(2, "0")}
          </div>
          <div className="text-[10px] font-bold tracking-widest text-white/60 uppercase">
            {edition === "global" ? "GLOBAL" : "CLASSIC"} · Round {hud.round}/8 · {hud.team}
          </div>
          {hud.msg && <div className="mt-1 text-xs font-bold text-amber-200">{hud.msg}</div>}
        </div>
        <div className="text-right">
          <div className="font-mono text-sm font-bold">{arsenalFor(edition).find((w) => w.id === hud.wep)?.name}</div>
          <div className="font-mono text-xl tabular-nums">
            {hud.ammo}
            <span className="text-sm text-white/50">/{hud.reserve}</span>
          </div>
          <div className="text-[11px] text-white/60">
            {hud.kills}K / {hud.deaths}D
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute top-2 right-2 rounded bg-black/50 px-2 py-1 text-[10px] text-white/70">
        {edition === "global" ? "Global Strike" : "Classic Strike"} · fan homage · not Valve
        {online && roster.length > 0 && (
          <div className="mt-1 space-y-0.5 text-left font-mono text-[10px] text-lime-300/90">
            {roster.map((p) => (
              <div key={p.id}>
                {p.team} {p.name}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
