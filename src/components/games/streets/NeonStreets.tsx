"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Flag, Map as MapIcon, Megaphone, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { BEACH, BRIDGE, BUILD, N, PARK, PLAZA, ROAD, T, WATER, drivable, hash2, hashStr, isLane, makeWorld, rng, roadPoint, type World } from "./world";
import { peerPose, type FinishMsg, type Net, type RaceMsg } from "./net";

// Neon Streets — open-world top-down city driving (classic GTA-1 feel), solo or online with friends.
//  rush   : deliver packages before the clock runs out (scored, leaderboard)
//  free   : cruise the city, do jobs, collect cash, outrun the cops
//  online : free roam with friends in a room + races started by the host

export type StreetsMode = "rush" | "free" | "online";
type Props = { mode: StreetsMode; net?: Net | null; name: string; color: string; onOver?: (score: number) => void; onExit: () => void };

type Car = { x: number; y: number; a: number; fs: number; ls: number };
type Npc = { x: number; y: number; dir: number; speed: number; color: string; stop: number };
type Cop = Car & { stuck: number };
type Ctl = { steer: number; gas: number; brake: number; hand: boolean };
type PtrEvt = { preventDefault: () => void; pointerId: number; currentTarget: EventTarget | null };
const capture = (e: PtrEvt) => {
  try {
    (e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId);
  } catch {
    /* pointer already gone */
  }
};

const NEON = ["#ff2bd6", "#00e5ff", "#7c4dff", "#ffd400", "#00ff9c", "#ff6b2b", "#2b7bff", "#ff4d6d"];
const DIRS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const; // E S W N
const EMOTES = ["👋", "😂", "🔥", "💀"];
const SOLO_SEED = hashStr("NEXUS-CITY");

export default function NeonStreets({ mode, net, name, color, onOver, onExit }: Props) {
  const cv = useRef<HTMLCanvasElement>(null);
  const ctl = useRef<Ctl>({ steer: 0, gas: 0, brake: 0, hand: false });
  const keyCtl = useRef({ l: false, r: false, u: false, d: false });
  const joy = useRef<{ id: number; x: number; dx: number } | null>(null);
  const actions = useRef({ honk: () => {}, emote: (_: string) => {}, toggleMap: () => {}, startRace: () => {} });
  const seed = useMemo(() => (net ? hashStr(net.code) : SOLO_SEED), [net]);
  const world = useMemo<World>(() => makeWorld(seed), [seed]);
  const [hud, setHud] = useState({ players: 0, host: false, race: "" as "" | "countdown" | "racing" | "done", results: [] as { name: string; ms: number; color: string }[], map: false });
  const touch = typeof window !== "undefined" && (navigator.maxTouchPoints > 0 || "ontouchstart" in window);

  // keyboard
  useEffect(() => {
    const k = keyCtl.current;
    const set = (v: boolean) => (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input,textarea")) return;
      const c = e.code;
      if (c === "ArrowLeft" || c === "KeyA") k.l = v;
      else if (c === "ArrowRight" || c === "KeyD") k.r = v;
      else if (c === "ArrowUp" || c === "KeyW") k.u = v;
      else if (c === "ArrowDown" || c === "KeyS") k.d = v;
      else if (c === "Space") ctl.current.hand = v;
      else if (v && c === "KeyH") actions.current.honk();
      else if (v && c === "KeyM") actions.current.toggleMap();
      else if (v && /^Digit[1-4]$/.test(c)) actions.current.emote(EMOTES[Number(c.slice(5)) - 1]);
      else return;
      e.preventDefault();
    };
    const d = set(true);
    const u = set(false);
    window.addEventListener("keydown", d);
    window.addEventListener("keyup", u);
    return () => {
      window.removeEventListener("keydown", d);
      window.removeEventListener("keyup", u);
    };
  }, []);

  useEffect(() => {
    const canvas = cv.current!;
    const ctx = canvas.getContext("2d")!;
    let W = 0, H = 0, dpr = 1; // prettier-ignore
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const at = world.at;
    const tileAt = (x: number, y: number) => at(Math.floor(x / T), Math.floor(y / T));
    const solid = (x: number, y: number) => !drivable(tileAt(x, y));

    // ---------------------------------------------------------------- state
    const spawn = roadPoint(world, rng(seed + 7));
    const p: Car = { x: spawn.x + (spawn.horiz ? 0 : -T / 2), y: spawn.y + (spawn.horiz ? T / 2 : 0), a: spawn.horiz ? 0 : Math.PI / 2, fs: 0, ls: 0 };
    const npcs: Npc[] = [];
    const cops: Cop[] = [];
    const skids: { x: number; y: number; a: number }[] = [];
    let cash = 0, time = 90, wanted = 0, calm = 0, busted = 0, shake = 0; // prettier-ignore
    let msg = { text: mode === "rush" ? "Deliver as many packages as you can! 📦" : mode === "online" ? `Room ${net?.code} — invite friends with the code` : "Free roam — pick up jobs 📦 and cash 💵", t: 4 };
    let job = { pickup: roadPoint(world, Math.random, p, 600, 2200), drop: { x: 0, y: 0 }, carrying: false };
    const coins: { x: number; y: number }[] = [];
    let over = false, endText = ""; // prettier-ignore
    let showMap = false;
    let horn = 0;
    let myEmote: { text: string; t: number } | null = null;
    // race
    let race: { cps: { x: number; y: number }[]; idx: number; start: number; done: boolean; results: FinishMsg[] } | null = null;

    const flash = (text: string, t = 2.4) => (msg = { text, t });

    // ---------------------------------------------------------------- audio (horn)
    let ac: AudioContext | null = null;
    const beep = (f = 400, d = 0.35, vol = 0.18) => {
      try {
        const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ac ??= new C();
        void ac.resume();
        const t0 = ac.currentTime;
        for (const ff of [f, f * 1.26]) {
          const o = ac.createOscillator();
          const g = ac.createGain();
          o.type = "sawtooth";
          o.frequency.value = ff;
          g.gain.setValueAtTime(vol, t0);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
          o.connect(g).connect(ac.destination);
          o.start(t0);
          o.stop(t0 + d);
        }
      } catch {
        /* no audio */
      }
    };

    actions.current = {
      honk: () => {
        horn = performance.now();
        beep();
        net?.honk();
      },
      emote: (e) => {
        myEmote = { text: e, t: performance.now() };
        net?.emote(e);
      },
      toggleMap: () => {
        showMap = !showMap;
        setHud((h) => ({ ...h, map: showMap }));
      },
      startRace: () => {
        if (!net) return;
        const r: RaceMsg = { seed: Math.floor(Math.random() * 1e9), at: Date.now() + 5000, laps: 1 };
        net.race(r);
        beginRace(r);
      },
    };

    const beginRace = (r: RaceMsg) => {
      const rr = rng(r.seed);
      const start = roadPoint(world, rr);
      const cps: { x: number; y: number }[] = [];
      let prev = start;
      for (let i = 0; i < 6; i++) {
        const c = roadPoint(world, rr, prev, 900, 1800);
        cps.push(c);
        prev = { ...c, horiz: c.horiz };
      }
      // line everyone up at the start, spread sideways
      const others = net ? [...net.peers.keys(), net.me].sort() : [];
      const slot = Math.max(0, others.indexOf(net?.me ?? ""));
      p.x = start.x + (start.horiz ? -slot * 50 : (slot % 2 ? -T / 2 : T / 2));
      p.y = start.y + (start.horiz ? (slot % 2 ? -T / 2 : T / 2) : -slot * 50);
      p.a = start.horiz ? (cps[0].x >= start.x ? 0 : Math.PI) : cps[0].y >= start.y ? Math.PI / 2 : -Math.PI / 2;
      p.fs = p.ls = 0;
      wanted = 0;
      cops.length = 0;
      npcs.length = 0;
      race = { cps, idx: 0, start: r.at, done: false, results: [] };
      setHud((h) => ({ ...h, race: "countdown", results: [] }));
    };
    net?.on({
      race: beginRace,
      finish: (f) => {
        if (!race) return;
        race.results = [...race.results.filter((x) => x.id !== f.id), f].sort((a, b) => a.ms - b.ms);
        pushResults();
      },
    });
    const pushResults = () => {
      if (!race || !net) return;
      setHud((h) => ({
        ...h,
        results: race!.results.map((f) => ({ name: f.id === net.me ? name : (net.peers.get(f.id)?.name ?? "Player"), color: f.id === net.me ? color : (net.peers.get(f.id)?.color ?? "#fff"), ms: f.ms })),
      }));
    };

    // ---------------------------------------------------------------- physics
    const blocked = (x: number, y: number) => {
      const r = 12;
      return solid(x - r, y - r) || solid(x + r, y - r) || solid(x - r, y + r) || solid(x + r, y + r);
    };
    const drive = (c: Car, gas: number, brake: number, steer: number, hand: boolean, dt: number, maxV: number) => {
      if (gas > 0) c.fs += 600 * gas * dt;
      if (brake > 0) c.fs -= (c.fs > 0 ? 950 : 420) * brake * dt;
      if (!gas && !brake) c.fs -= Math.sign(c.fs) * Math.min(Math.abs(c.fs), 150 * dt);
      if (hand) c.fs -= Math.sign(c.fs) * Math.min(Math.abs(c.fs), 260 * dt);
      const ground = tileAt(c.x, c.y);
      const slow = ground === PARK || ground === BEACH ? 0.55 : 1;
      c.fs = Math.max(-240, Math.min(maxV * slow, c.fs));
      const turn = steer * (hand ? 3.6 : 2.8) * dt * Math.max(-1, Math.min(1, c.fs / 170));
      c.a += turn;
      // drift: momentum keeps going sideways while turning hard or on the handbrake
      const slip = hand ? 0.85 : Math.abs(steer) > 0.6 && Math.abs(c.fs) > 360 ? 0.4 : 0;
      c.ls += -turn * c.fs * slip;
      c.ls *= Math.max(0, 1 - (hand ? 2.2 : 6) * dt);
      const vx = Math.cos(c.a) * c.fs - Math.sin(c.a) * c.ls;
      const vy = Math.sin(c.a) * c.fs + Math.cos(c.a) * c.ls;
      let hit = 0;
      const nx = c.x + vx * dt;
      if (!blocked(nx, c.y)) c.x = nx;
      else hit = Math.abs(vx);
      const ny = c.y + vy * dt;
      if (!blocked(c.x, ny)) c.y = ny;
      else hit = Math.max(hit, Math.abs(vy));
      if (hit) {
        c.fs *= -0.25;
        c.ls *= 0.3;
      }
      return hit;
    };

    // ---------------------------------------------------------------- traffic (only around the player)
    const spawnNpc = (): Npc | null => {
      const pt = roadPoint(world, Math.random, p, 700, 1400);
      const fwd = Math.random() < 0.5;
      if (pt.horiz) return { x: pt.x, y: pt.y + (fwd ? T / 2 : -T / 2), dir: fwd ? 0 : 2, speed: 120 + Math.random() * 80, color: NEON[Math.floor(Math.random() * NEON.length)], stop: 0 };
      return { x: pt.x + (fwd ? -T / 2 : T / 2), y: pt.y, dir: fwd ? 1 : 3, speed: 120 + Math.random() * 80, color: NEON[Math.floor(Math.random() * NEON.length)], stop: 0 };
    };
    const crossed = (a: number, b: number, l: number) => (a - l) * (b - l) <= 0 && a !== b;
    const stepNpc = (n: Npc, dt: number) => {
      const [dx, dy] = DIRS[n.dir];
      if (n.stop > 0) n.stop -= dt;
      const ahead = Math.hypot(p.x - (n.x + dx * 48), p.y - (n.y + dy * 48)) < 44;
      const v = ahead || n.stop > 0 ? 0 : n.speed;
      const ox = n.x, oy = n.y; // prettier-ignore
      n.x += dx * v * dt;
      n.y += dy * v * dt;
      if (!isLane(tileAt(n.x + dx * 40, n.y + dy * 40))) {
        // dead end (river, coast) → U-turn into the other lane
        n.dir = (n.dir + 2) % 4;
        if (dx === 1) n.y -= T;
        else if (dx === -1) n.y += T;
        else if (dy === 1) n.x += T;
        else n.x -= T;
        return;
      }
      if (dx !== 0) {
        for (const c of world.cols) {
          if (crossed(ox, n.x, (c + 0.5) * T) && Math.random() < 0.3 && isLane(at(c, Math.floor(n.y / T) + 1))) return void ((n.dir = 1), (n.x = (c + 0.5) * T));
          if (crossed(ox, n.x, (c + 1.5) * T) && Math.random() < 0.3 && isLane(at(c + 1, Math.floor(n.y / T) - 1))) return void ((n.dir = 3), (n.x = (c + 1.5) * T));
        }
      } else {
        for (const r of world.rows) {
          if (crossed(oy, n.y, (r + 1.5) * T) && Math.random() < 0.3 && isLane(at(Math.floor(n.x / T) + 1, r + 1))) return void ((n.dir = 0), (n.y = (r + 1.5) * T));
          if (crossed(oy, n.y, (r + 0.5) * T) && Math.random() < 0.3 && isLane(at(Math.floor(n.x / T) - 1, r))) return void ((n.dir = 2), (n.y = (r + 0.5) * T));
        }
      }
    };

    const crash = () => {
      shake = 10;
      wanted = Math.min(5, wanted + 1);
      calm = 0;
      if (wanted === 1 && !race) flash("★ The cops are after you");
    };

    // ---------------------------------------------------------------- step
    let lastHud = 0;
    const step = (dt: number, now: number) => {
      const k = keyCtl.current;
      const c = ctl.current;
      const steer = joy.current ? c.steer : (k.r ? 1 : 0) - (k.l ? 1 : 0);
      const gas = Math.max(c.gas, k.u ? 1 : 0);
      const brake = Math.max(c.brake, k.d ? 1 : 0);
      const frozen = race && Date.now() < race.start;
      if (!frozen) drive(p, gas, brake, steer, c.hand, dt, 600);
      if ((Math.abs(p.ls) > 70 && Math.abs(p.fs) > 160) || (c.hand && Math.abs(p.fs) > 120)) {
        skids.push({ x: p.x, y: p.y, a: p.a });
        if (skids.length > 400) skids.shift();
      }

      // traffic
      for (let i = npcs.length - 1; i >= 0; i--) if (Math.hypot(npcs[i].x - p.x, npcs[i].y - p.y) > 1900) npcs.splice(i, 1);
      while (npcs.length < 34) {
        const n = spawnNpc();
        if (!n) break;
        npcs.push(n);
      }
      for (const n of npcs) {
        stepNpc(n, dt);
        const d = Math.hypot(n.x - p.x, n.y - p.y);
        if (d < 30) {
          // split the overlap: shove the NPC as well so you never get pinned behind it
          const ux = (p.x - n.x) / (d || 1), uy = (p.y - n.y) / (d || 1); // prettier-ignore
          const push = (30 - d) / 2;
          p.x += ux * push;
          p.y += uy * push;
          n.x -= ux * push;
          n.y -= uy * push;
          if (n.stop <= 0) {
            if (Math.abs(p.fs) > 170 && !race) {
              crash();
              if (mode !== "online") cash = Math.max(0, cash - 15);
            }
            p.fs *= 0.55;
          }
          n.stop = 1.5;
        }
      }

      // other players: bump
      if (net)
        for (const peer of net.peers.values()) {
          const q = peerPose(peer, now);
          if (!q || q.stale) continue;
          const d = Math.hypot(q.x - p.x, q.y - p.y);
          if (d < 32) {
            const ux = (p.x - q.x) / (d || 1), uy = (p.y - q.y) / (d || 1); // prettier-ignore
            p.x += ux * (32 - d);
            p.y += uy * (32 - d);
            if (Math.abs(p.fs) > 200) shake = 6;
            p.fs *= 0.6;
          }
        }

      // police
      const wantCops = race ? 0 : Math.min(4, wanted);
      while (cops.length < wantCops) {
        const s = roadPoint(world, Math.random, p, 800, 1300);
        cops.push({ x: s.x, y: s.y, a: Math.atan2(p.y - s.y, p.x - s.x), fs: 0, ls: 0, stuck: 0 });
      }
      while (cops.length > wantCops) cops.pop();
      let near = false;
      for (const cop of cops) {
        let da = Math.atan2(p.y - cop.y, p.x - cop.x) - cop.a;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        const hit = drive(cop, Math.abs(da) > 2.3 && cop.fs > 100 ? 0 : 1, Math.abs(da) > 2.3 && cop.fs > 100 ? 1 : 0, Math.max(-1, Math.min(1, da * 2)), false, dt, 440 + wanted * 40);
        cop.stuck = hit > 0 || Math.abs(cop.fs) < 40 ? cop.stuck + dt : Math.max(0, cop.stuck - dt);
        if (cop.stuck > 2.2 || Math.hypot(p.x - cop.x, p.y - cop.y) > 1700) {
          const s = roadPoint(world, Math.random, p, 700, 1100);
          Object.assign(cop, { x: s.x, y: s.y, a: Math.atan2(p.y - s.y, p.x - s.x), fs: 140, ls: 0, stuck: 0 });
        }
        const d = Math.hypot(cop.x - p.x, cop.y - p.y);
        if (d < 30) {
          const ux = (p.x - cop.x) / (d || 1), uy = (p.y - cop.y) / (d || 1); // prettier-ignore
          p.x += ux * (30 - d);
          p.y += uy * (30 - d);
          cop.fs *= 0.5;
        }
        if (d < 50) near = true;
      }
      busted = near && Math.abs(p.fs) < 70 ? busted + dt : Math.max(0, busted - dt * 0.6);
      if (busted > 2) {
        if (mode === "rush") return end("BUSTED");
        const lost = Math.round(cash * 0.3);
        cash -= lost;
        flash(`BUSTED! Lost $${lost}`, 3);
        wanted = 0;
        busted = 0;
        cops.length = 0;
        const s = roadPoint(world, Math.random, p, 500, 1200);
        Object.assign(p, { x: s.x, y: s.y + (s.horiz ? T / 2 : 0), a: s.horiz ? 0 : Math.PI / 2, fs: 0, ls: 0 });
      }
      calm += dt;
      if (wanted > 0 && calm > 22) {
        wanted--;
        calm = 0;
        if (!wanted) flash("You lost the cops 😎");
      }

      // jobs + cash
      if (!race) {
        if (!job.carrying && Math.hypot(job.pickup.x - p.x, job.pickup.y - p.y) < 44) {
          job.carrying = true;
          job.drop = roadPoint(world, Math.random, p, 1000, 2600);
          flash("Deliver it to the 🏁 marker");
        } else if (job.carrying && Math.hypot(job.drop.x - p.x, job.drop.y - p.y) < 48) {
          const pay = 100 + (mode === "rush" ? Math.round(time) : 50) + wanted * 50;
          cash += pay;
          if (mode === "rush") time += 22;
          flash(`Delivered! +$${pay}${mode === "rush" ? "  +22s" : ""}`);
          job = { pickup: roadPoint(world, Math.random, p, 600, 2200), drop: { x: 0, y: 0 }, carrying: false };
        }
        for (let i = coins.length - 1; i >= 0; i--) {
          const c = coins[i];
          const d = Math.hypot(c.x - p.x, c.y - p.y);
          if (d < 30) {
            cash += 25;
            coins.splice(i, 1);
          } else if (d > 1600) coins.splice(i, 1);
        }
        while (coins.length < 16) coins.push(roadPoint(world, Math.random, p, 300, 1400));
      }

      // race checkpoints
      if (race && !race.done && Date.now() >= race.start) {
        const cp = race.cps[race.idx];
        if (Math.hypot(cp.x - p.x, cp.y - p.y) < 60) {
          race.idx++;
          beep(880, 0.12, 0.1);
          if (race.idx >= race.cps.length) {
            race.done = true;
            const ms = Date.now() - race.start;
            race.results = [...race.results.filter((x) => x.id !== net?.me), { id: net?.me ?? "me", ms }].sort((a, b) => a.ms - b.ms);
            net?.finish(ms);
            pushResults();
            flash(`Finished in ${(ms / 1000).toFixed(2)}s 🏁`, 4);
            setHud((h) => ({ ...h, race: "done" }));
          }
        }
      }

      if (mode === "rush") {
        time -= dt;
        if (time <= 0) return end("TIME'S UP");
      }
      msg.t -= dt;
      shake *= 0.88;
      net?.send({ x: Math.round(p.x), y: Math.round(p.y), a: Math.round(p.a * 100) / 100, v: Math.round(p.fs), w: wanted });

      if (now - lastHud > 500) {
        lastHud = now;
        setHud((h) => {
          const players = net ? net.peers.size + 1 : 1;
          const host = !!net?.isHost();
          const rs = race ? (race.done ? "done" : Date.now() < race.start ? "countdown" : "racing") : "";
          return h.players === players && h.host === host && h.race === rs ? h : { ...h, players, host, race: rs };
        });
      }
    };

    const end = (t: string) => {
      over = true;
      endText = t;
      draw(performance.now());
      setTimeout(() => onOver?.(cash), 1200);
    };

    // ---------------------------------------------------------------- drawing
    const drawCar = (x: number, y: number, a: number, col: string, kind: "me" | "npc" | "cop" | "peer", t: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillStyle = "rgba(0,0,0,.4)";
      ctx.fillRect(-18, -9, 40, 22);
      ctx.fillStyle = kind === "cop" ? "#f2f3f5" : col;
      ctx.beginPath();
      ctx.roundRect(-20, -11, 40, 22, 6);
      ctx.fill();
      if (kind === "cop") {
        ctx.fillStyle = "#101828";
        ctx.fillRect(-20, -11, 12, 22);
        ctx.fillRect(8, -11, 12, 22);
        const on = Math.floor(t * 8) % 2 === 0;
        ctx.fillStyle = on ? "#ff2b2b" : "#2b6bff";
        ctx.fillRect(-4, -9, 6, 8);
        ctx.fillStyle = on ? "#2b6bff" : "#ff2b2b";
        ctx.fillRect(-4, 1, 6, 8);
      }
      ctx.fillStyle = "rgba(10,10,20,.85)";
      ctx.fillRect(4, -8, 8, 16);
      ctx.fillRect(-14, -8, 6, 16);
      ctx.fillStyle = "#fff8c0";
      ctx.fillRect(18, -9, 3, 5);
      ctx.fillRect(18, 4, 3, 5);
      ctx.fillStyle = "#ff3355";
      ctx.fillRect(-21, -9, 2, 4);
      ctx.fillRect(-21, 5, 2, 4);
      if (kind === "me" || kind === "peer") {
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-22, -13, 44, 26, 8);
        ctx.stroke();
        ctx.globalAlpha = 1;
        // headlight cones
        const g = ctx.createLinearGradient(20, 0, 110, 0);
        g.addColorStop(0, "rgba(255,248,192,.22)");
        g.addColorStop(1, "rgba(255,248,192,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(20, -8);
        ctx.lineTo(110, -34);
        ctx.lineTo(110, 34);
        ctx.lineTo(20, 8);
        ctx.fill();
      }
      ctx.restore();
    };

    const bubble = (x: number, y: number, text: string, sub?: string, col = "#fff") => {
      ctx.font = "bold 12px ui-sans-serif, system-ui";
      ctx.textAlign = "center";
      const w = Math.max(ctx.measureText(text).width, sub ? ctx.measureText(sub).width : 0) + 14;
      ctx.fillStyle = "rgba(0,0,0,.65)";
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y - 34, w, sub ? 30 : 20, 8);
      ctx.fill();
      ctx.fillStyle = col;
      ctx.fillText(text, x, y - 20);
      if (sub) {
        ctx.font = "16px sans-serif";
        ctx.fillText(sub, x, y - 3);
      }
    };

    const roofColor = (bx: number, by: number) => NEON[Math.floor(hash2(bx + 9, by + 7) * NEON.length)];

    const draw = (now: number) => {
      const t = now / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#05060c";
      ctx.fillRect(0, 0, W, H);
      const zoom = (W < 640 ? 0.72 : 0.95) * (1 - Math.min(0.18, Math.abs(p.fs) / 3000));
      const camX = p.x + Math.cos(p.a) * p.fs * 0.28 + (Math.random() - 0.5) * shake;
      const camY = p.y + Math.sin(p.a) * p.fs * 0.28 + (Math.random() - 0.5) * shake;
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-camX, -camY);
      const vw = W / zoom / 2 + T * 2, vh = H / zoom / 2 + T * 2; // prettier-ignore
      const x0 = Math.max(0, Math.floor((camX - vw) / T)), x1 = Math.min(N - 1, Math.ceil((camX + vw) / T)); // prettier-ignore
      const y0 = Math.max(0, Math.floor((camY - vh) / T)), y1 = Math.min(N - 1, Math.ceil((camY + vh) / T)); // prettier-ignore

      // ground
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const v = at(tx, ty);
          const X = tx * T, Y = ty * T; // prettier-ignore
          if (v === ROAD || v === BRIDGE) {
            ctx.fillStyle = v === BRIDGE ? "#262635" : "#161620";
            ctx.fillRect(X, Y, T, T);
            const cs = world.colStart[tx], rs = world.rowStart[ty]; // prettier-ignore
            ctx.fillStyle = "rgba(255,212,0,.6)";
            if (rs === 1 && !cs) for (let i = 0; i < 2; i++) ctx.fillRect(X + i * 32 + 6, Y + T - 2, 18, 3);
            if (cs === 1 && !rs) for (let i = 0; i < 2; i++) ctx.fillRect(X + T - 2, Y + i * 32 + 6, 3, 18);
            if (cs && rs) {
              ctx.fillStyle = "rgba(255,255,255,.07)";
              for (let i = 0; i < 4; i++) ctx.fillRect(X + 4 + i * 15, Y + 4, 8, T - 8);
            }
            if (v === BRIDGE) {
              ctx.fillStyle = "#8a8aa8";
              if (at(tx - 1, ty) === WATER) ctx.fillRect(X, Y, 3, T);
              if (at(tx + 1, ty) === WATER) ctx.fillRect(X + T - 3, Y, 3, T);
            }
          } else if (v === WATER) {
            ctx.fillStyle = "#061a33";
            ctx.fillRect(X, Y, T, T);
            ctx.fillStyle = "rgba(80,160,255,.12)";
            const o = Math.sin(t * 1.5 + tx * 0.7 + ty * 0.4) * 10;
            ctx.fillRect(X + 10 + o, Y + 20, 20, 2);
            ctx.fillRect(X + 34 - o, Y + 44, 16, 2);
          } else if (v === BEACH) {
            ctx.fillStyle = "#b8955c";
            ctx.fillRect(X, Y, T, T);
            if (hash2(tx, ty) < 0.06) {
              ctx.font = "26px sans-serif";
              ctx.textAlign = "center";
              ctx.fillText("🌴", X + T / 2, Y + T / 2 + 9);
            } else if (hash2(ty, tx) < 0.04) {
              ctx.font = "20px sans-serif";
              ctx.textAlign = "center";
              ctx.fillText("⛱️", X + T / 2, Y + T / 2 + 7);
            }
          } else if (v === PARK) {
            ctx.fillStyle = "#0c2a18";
            ctx.fillRect(X, Y, T, T);
            if (hash2(tx, ty) < 0.4) {
              ctx.fillStyle = "#13552c";
              ctx.beginPath();
              ctx.arc(X + 18 + hash2(ty, tx) * 28, Y + 18 + hash2(tx + 3, ty) * 28, 14, 0, 7);
              ctx.fill();
            }
          } else if (v === PLAZA) {
            ctx.fillStyle = (tx + ty) % 2 ? "#1d1a2e" : "#221f36";
            ctx.fillRect(X, Y, T, T);
          } else {
            const d = world.district(tx, ty);
            ctx.fillStyle = d === "suburb" ? "#141a14" : "#0b0b14";
            ctx.fillRect(X, Y, T, T);
            if (d === "suburb") {
              const bx = world.blockX[tx], by = world.blockY[ty]; // prettier-ignore
              const h = hash2(tx * 3 + bx, ty * 5 + by);
              if (h < 0.75) {
                ctx.fillStyle = ["#7a3b3b", "#3b4f7a", "#6b5a3a", "#4a6b4a", "#6a3b6a"][Math.floor(h * 20) % 5];
                ctx.fillRect(X + 8, Y + 8, T - 16, T - 16);
                ctx.fillStyle = "rgba(255,255,255,.12)";
                ctx.fillRect(X + 8, Y + T / 2 - 1, T - 16, 2);
              } else {
                ctx.fillStyle = "#1f4a2a";
                ctx.fillRect(X + 6, Y + 6, T - 12, T - 12);
              }
            }
          }
        }
      }
      ctx.fillStyle = "rgba(0,0,0,.5)";
      for (const s of skids) {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.a);
        ctx.fillRect(-14, -10, 6, 4);
        ctx.fillRect(-14, 6, 6, 4);
        ctx.restore();
      }

      // pickups
      if (!race) {
        for (const c of coins) {
          const bob = Math.sin(t * 4 + c.x) * 2;
          ctx.fillStyle = "#00ff9c";
          ctx.beginPath();
          ctx.arc(c.x, c.y + bob, 8, 0, 7);
          ctx.fill();
          ctx.fillStyle = "#003b24";
          ctx.font = "bold 10px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("$", c.x, c.y + 4 + bob);
        }
      }
      const target = race ? race.cps[Math.min(race.idx, race.cps.length - 1)] : job.carrying ? job.drop : job.pickup;
      const tColor = race ? "#ff2bd6" : job.carrying ? "#00ff9c" : "#ffb02b";
      if (!race || !race.done) {
        ctx.strokeStyle = tColor;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(target.x, target.y, 30 + Math.sin(t * 5) * 5, 0, 7);
        ctx.stroke();
        ctx.font = "24px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(race ? (race.idx === race.cps.length - 1 ? "🏁" : String(race.idx + 1)) : job.carrying ? "🏁" : "📦", target.x, target.y + 8);
      }

      for (const n of npcs) drawCar(n.x, n.y, [0, Math.PI / 2, Math.PI, -Math.PI / 2][n.dir], n.color, "npc", t);
      for (const c of cops) drawCar(c.x, c.y, c.a, "#fff", "cop", t);
      const poses: { x: number; y: number; name: string; color: string; honk: boolean; emote?: string; w: number }[] = [];
      if (net)
        for (const peer of net.peers.values()) {
          const q = peerPose(peer, now);
          if (!q || q.stale) continue;
          drawCar(q.x, q.y, q.a, peer.color, "peer", t);
          poses.push({ x: q.x, y: q.y, name: peer.name, color: peer.color, honk: !!peer.honk && now - peer.honk < 900, emote: peer.emote && now - peer.emote.t < 2500 ? peer.emote.text : undefined, w: q.w });
        }
      drawCar(p.x, p.y, p.a, color, "me", t);

      // rooftops (parallax = fake 3D like the classic top-down games)
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          if (at(tx, ty) !== BUILD) continue;
          const d = world.district(tx, ty);
          if (d === "suburb") continue;
          const bx = world.blockX[tx], by = world.blockY[ty]; // prettier-ignore
          if (bx < 0 || by < 0) continue;
          const h = d === "downtown" ? 0.06 + hash2(bx, by) * 0.12 : 0.035;
          const sx = (world.blockCX[bx] - camX) * h, sy = (world.blockCY[by] - camY) * h; // prettier-ignore
          const X = tx * T + sx, Y = ty * T + sy; // prettier-ignore
          ctx.fillStyle = d === "downtown" ? "#171428" : "#2a2a30";
          ctx.fillRect(X, Y, T + 0.5, T + 0.5);
          const col = d === "downtown" ? roofColor(bx, by) : "#555560";
          ctx.fillStyle = col;
          ctx.globalAlpha = 0.9;
          if (world.blockX[tx - 1] !== bx || at(tx - 1, ty) !== BUILD) ctx.fillRect(X, Y, 3, T);
          if (world.blockX[tx + 1] !== bx || at(tx + 1, ty) !== BUILD) ctx.fillRect(X + T - 3, Y, 3, T);
          if (world.blockY[ty - 1] !== by || at(tx, ty - 1) !== BUILD) ctx.fillRect(X, Y, T, 3);
          if (world.blockY[ty + 1] !== by || at(tx, ty + 1) !== BUILD) ctx.fillRect(X, Y + T - 3, T, 3);
          ctx.globalAlpha = 0.16;
          if (hash2(tx, ty + 1) < 0.3) ctx.fillRect(X + 14, Y + 14, 24, 14);
          if (d === "downtown" && hash2(tx + 5, ty) < 0.08) {
            ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 3 + tx);
            ctx.fillRect(X + 28, Y + 28, 6, 6);
          }
          ctx.globalAlpha = 1;
        }
      }

      // name tags + emotes
      for (const q of poses) bubble(q.x, q.y - 6, q.name + (q.w ? " " + "★".repeat(q.w) : ""), q.honk ? "📯" : q.emote, q.color);
      if (myEmote && now - myEmote.t < 2500) bubble(p.x, p.y - 6, name, myEmote.text, color);
      else if (now - horn < 900) bubble(p.x, p.y - 6, name, "📯", color);
      ctx.restore();

      // edge arrow to target
      if (!race || !race.done) {
        const dx = (target.x - camX) * zoom, dy = (target.y - camY) * zoom; // prettier-ignore
        if (Math.abs(dx) > W / 2 - 30 || Math.abs(dy) > H / 2 - 30) {
          const ang = Math.atan2(dy, dx);
          const r = Math.min(W, H) / 2 - 40;
          ctx.save();
          ctx.translate(W / 2 + Math.cos(ang) * r, H / 2 + Math.sin(ang) * r);
          ctx.rotate(ang);
          ctx.fillStyle = tColor;
          ctx.beginPath();
          ctx.moveTo(16, 0);
          ctx.lineTo(-9, -11);
          ctx.lineTo(-9, 11);
          ctx.fill();
          ctx.restore();
          ctx.fillStyle = "#fff";
          ctx.font = "bold 11px ui-sans-serif, system-ui";
          ctx.textAlign = "center";
          ctx.fillText(`${Math.round(Math.hypot(target.x - p.x, target.y - p.y) / 10)} m`, W / 2 + Math.cos(ang) * (r - 26), H / 2 + Math.sin(ang) * (r - 26) + 4);
        }
      }

      // HUD
      const top = touch ? 56 : 14;
      ctx.textAlign = "left";
      ctx.font = "800 24px ui-sans-serif, system-ui";
      ctx.fillStyle = "#00ff9c";
      ctx.fillText(`$${cash.toLocaleString()}`, 14, top + 20);
      ctx.font = "bold 16px ui-sans-serif, system-ui";
      let line = top + 44;
      if (mode === "rush") {
        ctx.fillStyle = time < 10 ? "#ff4d4d" : "#fff";
        ctx.fillText(`⏱ ${Math.ceil(time)}s`, 14, line);
        line += 22;
      }
      ctx.fillStyle = "#ffd400";
      ctx.fillText("★".repeat(wanted) + "☆".repeat(5 - wanted), 14, line);
      ctx.fillStyle = "rgba(255,255,255,.75)";
      ctx.font = "12px ui-sans-serif, system-ui";
      ctx.fillText(`${Math.round(Math.abs(p.fs) * 0.36)} km/h`, 14, line + 18);
      if (msg.t > 0) {
        ctx.textAlign = "center";
        ctx.font = `bold ${W < 500 ? 15 : 17}px ui-sans-serif, system-ui`;
        const msgY = W < 640 ? H * 0.3 : top + 26;
        const tw = Math.min(W - 40, ctx.measureText(msg.text).width + 24);
        ctx.fillStyle = `rgba(0,0,0,${0.55 * Math.min(1, msg.t)})`;
        ctx.beginPath();
        ctx.roundRect(W / 2 - tw / 2, msgY - 20, tw, 30, 15);
        ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${Math.min(1, msg.t)})`;
        ctx.fillText(msg.text, W / 2, msgY, W - 52);
      }
      if (busted > 0.2) {
        ctx.textAlign = "center";
        ctx.fillStyle = "#4da3ff";
        ctx.font = "bold 16px ui-sans-serif, system-ui";
        ctx.fillText("Keep moving or you'll be busted!", W / 2, H / 2 - 70);
      }
      if (race) {
        ctx.textAlign = "center";
        const left = race.start - Date.now();
        if (left > 0) {
          ctx.font = "900 72px ui-sans-serif, system-ui";
          ctx.fillStyle = "#ff2bd6";
          ctx.fillText(left > 3000 ? "READY" : String(Math.ceil(left / 1000)), W / 2, H / 2 - 40);
        } else if (!race.done) {
          ctx.font = "bold 18px ui-sans-serif, system-ui";
          ctx.fillStyle = "#fff";
          ctx.fillText(`Checkpoint ${race.idx + 1}/${race.cps.length} · ${((Date.now() - race.start) / 1000).toFixed(1)}s`, W / 2, top + 50);
          if (left > -900) {
            ctx.font = "900 72px ui-sans-serif, system-ui";
            ctx.fillStyle = "#00ff9c";
            ctx.fillText("GO!", W / 2, H / 2 - 40);
          }
        }
      }

      // minimap
      const m = Math.min(140, W * 0.3);
      const mx = W - m - 10, my = touch ? 56 : 10; // prettier-ignore
      const sc = m / (N * T);
      ctx.globalAlpha = 0.92;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(world.minimap(), mx, my, m, m);
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(255,255,255,.25)";
      ctx.strokeRect(mx - 0.5, my - 0.5, m + 1, m + 1);
      const dot = (x: number, y: number, c: string, r = 2.5) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(mx + x * sc, my + y * sc, r, 0, 7);
        ctx.fill();
      };
      if (!race || !race.done) dot(target.x, target.y, tColor, 3.5);
      for (const c of cops) dot(c.x, c.y, Math.floor(t * 6) % 2 ? "#ff2b2b" : "#2b6bff");
      for (const q of poses) dot(q.x, q.y, q.color, 3);
      dot(p.x, p.y, "#fff", 4);
      dot(p.x, p.y, color, 3);

      // big map
      if (showMap) {
        const s = Math.min(W, H) - 40;
        const ox = (W - s) / 2, oy = (H - s) / 2; // prettier-ignore
        const k = s / (N * T);
        ctx.fillStyle = "rgba(0,0,0,.7)";
        ctx.fillRect(0, 0, W, H);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(world.minimap(), ox, oy, s, s);
        ctx.imageSmoothingEnabled = true;
        const bd = (x: number, y: number, c: string, r: number, label?: string) => {
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.arc(ox + x * k, oy + y * k, r, 0, 7);
          ctx.fill();
          if (label) {
            ctx.font = "bold 12px ui-sans-serif, system-ui";
            ctx.textAlign = "center";
            ctx.fillStyle = "#fff";
            ctx.fillText(label, ox + x * k, oy + y * k - r - 4);
          }
        };
        bd(world.downtown.x, world.downtown.y, "rgba(255,43,214,.25)", 40);
        if (!race || !race.done) bd(target.x, target.y, tColor, 6);
        if (race) race.cps.forEach((c, i) => i >= race!.idx && bd(c.x, c.y, "#ff2bd6", 4, String(i + 1)));
        for (const q of poses) bd(q.x, q.y, q.color, 6, q.name);
        bd(p.x, p.y, color, 7, "You");
      }

      if (over) {
        ctx.fillStyle = "rgba(0,0,0,.55)";
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = "center";
        ctx.font = "900 48px ui-sans-serif, system-ui";
        ctx.fillStyle = endText === "BUSTED" ? "#4da3ff" : "#ff4d4d";
        ctx.fillText(endText, W / 2, H / 2);
      }
    };

    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      if (!over) {
        if (!document.hidden) step(dt, now);
        if (!over) draw(now);
      }
      if (!over) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      void ac?.close();
    };
  }, [world, seed, mode, net, name, color, onOver, touch]);

  // ---------------------------------------------------------------- touch controls
  const knob = useRef<HTMLDivElement>(null);
  const setKnob = (dx: number) => knob.current && (knob.current.style.transform = `translateX(${dx}px)`);
  const hold = (key: "gas" | "brake") => ({
    onPointerDown: (e: PtrEvt) => {
      e.preventDefault();
      capture(e);
      ctl.current[key] = 1;
    },
    onPointerUp: () => (ctl.current[key] = 0),
    onPointerCancel: () => (ctl.current[key] = 0),
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
  });

  return (
    <div className="relative size-full touch-none overflow-hidden bg-[#05060c] select-none">
      <canvas ref={cv} className="size-full" />

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-2 p-2 pt-safe-2">
        <button onClick={onExit} className="pointer-events-auto grid size-10 place-items-center rounded-full bg-black/50 text-white backdrop-blur" aria-label="Leave game">
          <ArrowLeft className="size-5" />
        </button>
        {net && (
          <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-black/50 py-1.5 pr-3 pl-2 text-sm text-white backdrop-blur">
            <Users className="size-4" /> {hud.players}
            <span className="font-mono font-bold tracking-widest">{net.code}</span>
          </div>
        )}
        <div className="flex-1" />
      </div>

      {/* right-side buttons */}
      <div className="absolute top-1/2 right-2 flex -translate-y-1/2 flex-col gap-2">
        <button onClick={() => actions.current.toggleMap()} className={cn("grid size-11 place-items-center rounded-full text-white backdrop-blur", hud.map ? "bg-white/40" : "bg-black/50")} aria-label="Map (M)">
          <MapIcon className="size-5" />
        </button>
        <button onClick={() => actions.current.honk()} className="grid size-11 place-items-center rounded-full bg-black/50 text-white backdrop-blur" aria-label="Horn (H)">
          <Megaphone className="size-5" />
        </button>
        {net &&
          EMOTES.map((e) => (
            <button key={e} onClick={() => actions.current.emote(e)} className="grid size-11 place-items-center rounded-full bg-black/50 text-xl backdrop-blur">
              {e}
            </button>
          ))}
        {net && hud.host && hud.race !== "countdown" && hud.race !== "racing" && (
          <button onClick={() => actions.current.startRace()} className="flex items-center gap-1 rounded-full bg-[#ff2bd6] px-3 py-2.5 text-xs font-black text-white">
            <Flag className="size-4" /> RACE
          </button>
        )}
      </div>

      {/* race results */}
      {hud.results.length > 0 && (
        <div className="absolute top-16 left-1/2 w-56 -translate-x-1/2 rounded-2xl bg-black/70 p-3 text-white backdrop-blur">
          <div className="mb-1 text-center text-xs font-bold tracking-widest text-white/70 uppercase">Race results</div>
          {hud.results.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="w-5 font-bold">{i + 1}.</span>
              <span className="min-w-0 flex-1 truncate" style={{ color: r.color }}>
                {r.name}
              </span>
              <span className="tabular-nums">{(r.ms / 1000).toFixed(2)}s</span>
            </div>
          ))}
        </div>
      )}

      {/* mobile controls: steering pad (left), gas / brake / drift (right) */}
      {touch && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-4 pb-safe-4">
          <div
            className="pointer-events-auto relative grid h-28 w-44 place-items-center rounded-full bg-white/10 backdrop-blur"
            onPointerDown={(e) => {
              e.preventDefault();
              capture(e);
              joy.current = { id: e.pointerId, x: e.clientX, dx: 0 };
              ctl.current.steer = 0;
            }}
            onPointerMove={(e) => {
              const j = joy.current;
              if (!j || j.id !== e.pointerId) return;
              const dx = Math.max(-60, Math.min(60, e.clientX - j.x));
              j.dx = dx;
              ctl.current.steer = Math.abs(dx) < 6 ? 0 : dx / 60;
              setKnob(dx);
            }}
            onPointerUp={() => {
              joy.current = null;
              ctl.current.steer = 0;
              setKnob(0);
            }}
            onPointerCancel={() => {
              joy.current = null;
              ctl.current.steer = 0;
              setKnob(0);
            }}
          >
            <div className="absolute inset-y-0 left-3 grid place-items-center text-2xl text-white/40">‹</div>
            <div className="absolute inset-y-0 right-3 grid place-items-center text-2xl text-white/40">›</div>
            <div ref={knob} className="size-16 rounded-full bg-white/40 shadow-lg ring-2 ring-white/60 transition-transform duration-75" />
          </div>
          <div className="pointer-events-auto flex items-end gap-2">
            <div className="flex flex-col gap-2">
              <button
                {...{
                  onPointerDown: (e: PtrEvt) => {
                    e.preventDefault();
                    ctl.current.hand = true;
                  },
                  onPointerUp: () => (ctl.current.hand = false),
                  onPointerCancel: () => (ctl.current.hand = false),
                }}
                className="h-12 w-16 rounded-2xl bg-[#ffd400]/30 text-[11px] font-black text-white backdrop-blur active:bg-[#ffd400]/60"
              >
                DRIFT
              </button>
              <button {...hold("brake")} className="h-14 w-16 rounded-2xl bg-[#ff4d4d]/35 text-xs font-black text-white backdrop-blur active:bg-[#ff4d4d]/70">
                BRAKE
              </button>
            </div>
            <button {...hold("gas")} className="h-28 w-24 rounded-3xl bg-[#00ff9c]/35 text-base font-black text-white backdrop-blur active:bg-[#00ff9c]/70">
              GAS
            </button>
          </div>
        </div>
      )}
      {!touch && <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-white/45">WASD / arrows drive · Space drift · H horn · M map{net ? " · 1-4 emotes" : ""}</div>}
    </div>
  );
}
