"use client";

/**
 * Classic Strike — browser FPS homage to Counter-Strike 1.6.
 * Original map art & code (not Valve assets). Fan recreation of classic
 * bomb-defuse flow: buy menu, economy, sites, bots, pointer-lock aim.
 */

import { useEffect, useRef, useState } from "react";
import { type GameProps } from "./common";

type Team = "T" | "CT";
type WepId = "knife" | "glock" | "usp" | "deagle" | "ak47" | "m4a1" | "awp" | "he";

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
};

const ARSENAL: Wep[] = [
  { id: "knife", name: "Knife", price: 0, dmg: 55, rpm: 400, mag: 1, reserve: 0, spread: 0 },
  { id: "glock", name: "Glock-18", price: 400, dmg: 25, rpm: 150, mag: 20, reserve: 120, spread: 0.045, team: "T" },
  { id: "usp", name: "USP-45", price: 500, dmg: 30, rpm: 170, mag: 12, reserve: 100, spread: 0.03, team: "CT" },
  { id: "deagle", name: "Desert Eagle", price: 650, dmg: 54, rpm: 350, mag: 7, reserve: 35, spread: 0.02 },
  { id: "ak47", name: "AK-47", price: 2500, dmg: 36, rpm: 100, mag: 30, reserve: 90, spread: 0.035, team: "T" },
  { id: "m4a1", name: "M4A1", price: 3100, dmg: 32, rpm: 90, mag: 30, reserve: 90, spread: 0.025, team: "CT" },
  { id: "awp", name: "AWP", price: 4750, dmg: 110, rpm: 1400, mag: 10, reserve: 30, spread: 0.001 },
  { id: "he", name: "HE Grenade", price: 300, dmg: 80, rpm: 800, mag: 1, reserve: 0, spread: 0.08 },
];

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
};

type Phase = "buy" | "live" | "planted" | "over";

export default function ClassicStrike({ onOver, onScore }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState({
    hp: 100,
    armor: 0,
    money: 800,
    kills: 0,
    deaths: 0,
    round: 1,
    time: 15,
    phase: "buy" as Phase,
    wep: "glock" as WepId,
    ammo: 20,
    reserve: 120,
    team: "T" as Team,
    buyOpen: true,
    bomb: false,
    planted: false,
    msg: "BUY TIME — press B · WASD move · click to lock mouse",
  });
  const hudRef = useRef(hud);
  hudRef.current = hud;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let raf = 0;
    let alive = true;
    let ended = false;

    const player = {
      x: 1.5,
      y: 1.5,
      a: 0,
      hp: 100,
      armor: 0,
      money: 800,
      team: "T" as Team,
      wep: "glock" as WepId,
      mag: 20,
      reserve: 120,
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
      phaseT = 15;
      buyOpen = true;
      bots.length = 0;
      const enemyTeam: Team = player.team === "T" ? "CT" : "T";
      const n = 4;
      for (let i = 0; i < n; i++) {
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
      // teammate bots
      for (let i = 0; i < 3; i++) {
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

    const wepOf = (id: WepId) => ARSENAL.find((w) => w.id === id)!;

    const shoot = (from: "p" | "b", x: number, y: number, a: number, team: Team, wid: WepId) => {
      const wp = wepOf(wid);
      const spread = (Math.random() - 0.5) * wp.spread * 2;
      bullets.push({ x, y, a: a + spread, life: wid === "awp" ? 80 : 45, dmg: wp.dmg, from, team });
      for (let i = 0; i < 4; i++) {
        particles.push({
          x: x + Math.cos(a) * 0.2,
          y: y + Math.sin(a) * 0.2,
          vx: Math.cos(a + (Math.random() - 0.5)) * 0.05,
          vy: Math.sin(a + (Math.random() - 0.5)) * 0.05,
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
      canvas.width = w * devicePixelRatio;
      canvas.height = h * devicePixelRatio;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const onKey = (e: KeyboardEvent) => {
      keys[e.code] = e.type === "keydown";
      if (e.type === "keydown") {
        if (e.code === "KeyB") buyOpen = !buyOpen && phase === "buy";
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
        if (e.code === "Digit5" || e.code === "KeyG") {
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
            }
          }
        }
        if (phase === "buy" && buyOpen) {
          if (e.code === "Digit1") buy(player.team === "T" ? "glock" : "usp");
          if (e.code === "Digit2") buy("deagle");
          if (e.code === "Digit3") buy(player.team === "T" ? "ak47" : "m4a1");
          if (e.code === "Digit4") buy("awp");
          if (e.code === "Digit6") {
            if (player.money >= 650) {
              player.money -= 650;
              player.armor = 100;
              msg = "Kevlar + Helmet";
              msgT = 1;
            }
          }
        }
        if (e.code === "KeyT") {
          player.team = "T";
          giveDefault();
          resetRound();
          msg = "Joined Terrorists";
          msgT = 2;
        }
        if (e.code === "KeyC") {
          player.team = "CT";
          giveDefault();
          resetRound();
          msg = "Joined Counter-Terrorists";
          msgT = 2;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);

    const onClick = async () => {
      if (!pointerLocked) {
        try {
          await canvas.requestPointerLock();
        } catch {
          /* mobile */
        }
      }
      if (phase === "buy") return;
      if (player.cool > 0 || player.mag <= 0 || player.hp <= 0) return;
      const wp = wepOf(player.wep);
      player.cool = wp.rpm / 1000;
      player.mag--;
      shoot("p", player.x, player.y, player.a, player.team, player.wep);
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

    // touch look / fire
    let touchX = 0;
    const onTouchMove = (e: TouchEvent) => {
      if (!e.touches[0]) return;
      const dx = e.touches[0].clientX - touchX;
      touchX = e.touches[0].clientX;
      player.a += dx * 0.01;
      e.preventDefault();
    };
    const onTouchStart = (e: TouchEvent) => {
      touchX = e.touches[0]?.clientX ?? 0;
      if (e.touches.length > 1) onClick();
    };
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchstart", onTouchStart);

    resetRound();

    let last = performance.now();
    const syncHud = () => {
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
          resetRound("CT");
        } else if (bombT <= 0) {
          flash = 0.8;
          msg = "TERRORISTS WIN";
          msgT = 2;
          resetRound("T");
        }
      }

      // movement
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
        const len = Math.hypot(mx, my) || 1;
        tryMove(player.x + (mx / len) * sp * dt, player.y + (my / len) * sp * dt);
      }

      // bots AI
      for (const b of bots) {
        if (!b.alive) continue;
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
              b.hp -= bl.dmg;
              bullets.splice(i, 1);
              particles.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 12, c: "#ef4444" });
              if (b.hp <= 0) {
                b.alive = false;
                player.kills++;
                player.money = Math.min(16000, player.money + 300);
                player.score += 100;
                msg = "ENEMY DOWN +$300";
                msgT = 1.2;
                // check round wipe
                if (!bots.some((x) => x.alive && x.team !== player.team)) {
                  msg = "ENEMY ELIMINATED";
                  msgT = 2;
                  setTimeout(() => resetRound(player.team), 1500);
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

      // ——— RENDER raycaster ———
      const FOV = Math.PI / 3;
      const rays = Math.min(320, w);
      ctx.fillStyle = "#1c1917";
      ctx.fillRect(0, 0, w, h / 2);
      ctx.fillStyle = "#292524";
      ctx.fillRect(0, h / 2, w, h / 2);

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
          ctx.fillStyle = side ? `rgb(${40 * shade | 0},${55 * shade | 0},${40 * shade | 0})` : `rgb(${70 * shade | 0},${90 * shade | 0},${55 * shade | 0})`;
          ctx.fillRect((col * w) / rays, (h - wallH) / 2, w / rays + 1, wallH);
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
            ctx.fillStyle = b.team === "T" ? "#b45309" : "#1d4ed8";
            ctx.fillRect(sx + size * 0.3, sy + size * 0.25, size * 0.4, size * 0.55);
            ctx.fillStyle = "#fcd34d";
            ctx.beginPath();
            ctx.arc(sx + size / 2, sy + size * 0.2, size * 0.18, 0, Math.PI * 2);
            ctx.fill();
            // HP bar
            ctx.fillStyle = "#000";
            ctx.fillRect(sx + size * 0.2, sy, size * 0.6, 4);
            ctx.fillStyle = "#22c55e";
            ctx.fillRect(sx + size * 0.2, sy, size * 0.6 * (b.hp / 100), 4);
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
              ctx.fillStyle = "#111";
              ctx.fillRect(sx - size / 2, sy, size, size * 0.5);
              ctx.fillStyle = bombT < 10 ? "#ef4444" : "#fbbf24";
              ctx.font = `bold ${Math.max(10, size * 0.45)}px monospace`;
              ctx.textAlign = "center";
              ctx.fillText(bombT.toFixed(1), sx, sy + size * 0.4);
            },
          });
        }
      }
      sprs.sort((a, b) => b.dist - a.dist);
      for (const s of sprs) s.draw();

      // gun viewmodel
      ctx.fillStyle = "#44403c";
      ctx.fillRect(w * 0.55, h * 0.72, w * 0.35, h * 0.28);
      ctx.fillStyle = "#292524";
      ctx.fillRect(w * 0.62, h * 0.68, w * 0.12, h * 0.1);
      ctx.fillStyle = "#a8a29e";
      ctx.fillRect(w * 0.64, h * 0.55, w * 0.06, h * 0.15);

      // crosshair
      ctx.strokeStyle = "#fafafa";
      ctx.lineWidth = 1.5;
      const cx = w / 2;
      const cy = h / 2;
      const gap = 4;
      const len = 8;
      ctx.beginPath();
      ctx.moveTo(cx - gap - len, cy);
      ctx.lineTo(cx - gap, cy);
      ctx.moveTo(cx + gap, cy);
      ctx.lineTo(cx + gap + len, cy);
      ctx.moveTo(cx, cy - gap - len);
      ctx.lineTo(cx, cy - gap);
      ctx.moveTo(cx, cy + gap);
      ctx.lineTo(cx, cy + gap + len);
      ctx.stroke();

      // minimap
      const ms = 6;
      const mox = 12;
      const moy = 12;
      ctx.globalAlpha = 0.85;
      for (let y = 0; y < MH; y++) {
        for (let x = 0; x < MW; x++) {
          const c = MAP[y][x];
          ctx.fillStyle = c === 1 ? "#3f3f46" : c === 2 ? "#b91c1c" : c === 3 ? "#1d4ed8" : c === 4 ? "#a16207" : c === 5 ? "#1e3a8a" : "#57534e";
          ctx.fillRect(mox + x * ms, moy + y * ms, ms - 0.5, ms - 0.5);
        }
      }
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(mox + player.x * ms, moy + player.y * ms, 2.5, 0, Math.PI * 2);
      ctx.fill();
      for (const b of bots) {
        if (!b.alive) continue;
        ctx.fillStyle = b.team === "T" ? "#f97316" : "#60a5fa";
        ctx.fillRect(mox + b.x * ms - 1.5, moy + b.y * ms - 1.5, 3, 3);
      }
      if (bombPlanted) {
        ctx.fillStyle = "#ef4444";
        ctx.fillRect(mox + bombX * ms - 2, moy + bombY * ms - 2, 4, 4);
      }
      ctx.globalAlpha = 1;

      if (flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${Math.min(0.85, flash)})`;
        ctx.fillRect(0, 0, w, h);
      }

      if (buyOpen && phase === "buy") {
        ctx.fillStyle = "rgba(0,0,0,0.72)";
        ctx.fillRect(w * 0.15, h * 0.18, w * 0.7, h * 0.55);
        ctx.strokeStyle = "#fbbf24";
        ctx.strokeRect(w * 0.15, h * 0.18, w * 0.7, h * 0.55);
        ctx.fillStyle = "#fbbf24";
        ctx.font = "bold 18px monospace";
        ctx.textAlign = "left";
        ctx.fillText("BUY MENU  (B to close)", w * 0.18, h * 0.24);
        ctx.font = "13px monospace";
        ctx.fillStyle = "#e7e5e4";
        const lines = [
          `1  ${player.team === "T" ? "Glock-18" : "USP-45"}`,
          "2  Desert Eagle   $650",
          `3  ${player.team === "T" ? "AK-47 $2500" : "M4A1 $3100"}`,
          "4  AWP            $4750",
          "6  Kevlar+Helmet  $650",
          "G/5 Plant bomb on site (T)",
          "E  Defuse (CT, hold near bomb)",
          "T / C  Switch team",
        ];
        lines.forEach((l, i) => ctx.fillText(l, w * 0.18, h * 0.3 + i * 22));
        ctx.fillStyle = "#a3e635";
        ctx.fillText(`Money $${player.money}`, w * 0.18, h * 0.68);
      }

      if (!pointerLocked && !buyOpen) {
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(0, h * 0.42, w, 36);
        ctx.fillStyle = "#fff";
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Click to capture mouse · WASD move · B buy · R reload", w / 2, h * 0.42 + 24);
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
    };
  }, [onOver, onScore]);

  return (
    <div className="relative size-full min-h-[360px] bg-black select-none">
      <canvas ref={canvasRef} className="size-full touch-none" />
      {/* HUD chrome */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/80 to-transparent p-3 text-white">
        <div>
          <div className="font-mono text-2xl font-black tabular-nums">
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
            Round {hud.round}/8 · {hud.team} · {hud.phase}
          </div>
          {hud.msg && <div className="mt-1 text-xs font-bold text-amber-200">{hud.msg}</div>}
        </div>
        <div className="text-right">
          <div className="font-mono text-sm font-bold">{ARSENAL.find((w) => w.id === hud.wep)?.name}</div>
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
        Fan homage · not affiliated with Valve
      </div>
    </div>
  );
}
