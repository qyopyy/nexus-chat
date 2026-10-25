"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Map as MapIcon, Maximize, Minimize, Moon, Music, Play, RotateCcw, Sun, Trophy } from "lucide-react";
import { useApp } from "@/store/app";
import { leaderboard, localBest, saveLocalBest, submitScore, type Row } from "@/lib/games";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";
import { BRIDGE, N, ROAD, SAND, SIZE, T, WATER, collide, makeWorld, tileAt, type World } from "./world";
import { applyTime, buildScene, loadThree, type Built } from "./scene";
import { Radio, STATIONS } from "./radio";

type Mode = "free" | "rush";
type Ctl = { steer: number; gas: number; brake: number; hand: boolean };
type Hud = { speed: number; msg: string; msgAt: number; time: number; score: number; cps: number; tapes: number; drift: number; air: number };

const TAPE_KEY = "nexus:bay:tapes";
const loadTapes = (): number[] => {
  try {
    return JSON.parse(localStorage.getItem(TAPE_KEY) ?? "[]");
  } catch {
    return [];
  }
};
const TAPE_NAMES = ["Pastel Skyline", "Ocean Drive '86", "Neon Palms", "Midnight Causeway", "Pink Horizon", "Lighthouse Love", "VHS Summer", "Bayfront Boulevard", "Cassette Dreams", "Sunset Rush"];

export default function SunsetBay({ onBack, mobile }: { onBack: () => void; mobile?: boolean }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [run, setRun] = useState(0);
  const [result, setResult] = useState<{ score: number; best: number; cps: number } | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const me = useApp((s) => s.userId);
  const loadBoard = useCallback(() => void leaderboard("bay").then(setRows), []);
  useEffect(loadBoard, [loadBoard]);

  if (mode && !result)
    return (
      <Game
        key={run}
        mode={mode}
        mobile={!!mobile}
        onExit={() => setMode(null)}
        onOver={(score, cps) => {
          const best = localBest("bay");
          saveLocalBest("bay", score);
          void submitScore("bay", score).then(loadBoard);
          setResult({ score, best, cps });
        }}
      />
    );

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-y-auto bg-[#0d0618] text-white">
      <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(180deg,#2b1055 0%,#ff4f9a 48%,#ffb347 62%,#0d0618 63%,#0d0618 100%)" }} />
      <div className="pointer-events-none absolute inset-x-0 top-[38%] mx-auto size-56 rounded-full sm:size-72" style={{ background: "linear-gradient(#ffe45e,#ff2bd6)", maskImage: "repeating-linear-gradient(180deg,#000 0 14px,transparent 14px 20px)" }} />
      <div className="pointer-events-none absolute inset-x-0 top-[63%] bottom-0 opacity-60" style={{ backgroundImage: "linear-gradient(#ff2bd6 1px,transparent 1px),linear-gradient(90deg,#ff2bd6 1px,transparent 1px)", backgroundSize: "44px 44px", transform: "perspective(300px) rotateX(55deg)", transformOrigin: "top" }} />
      <header className={cn("relative z-10 flex items-center gap-2 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        <button onClick={onBack} className="grid size-9 place-items-center rounded-full bg-black/30 hover:bg-black/50" aria-label="Back to games">
          <ArrowLeft className="size-5" />
        </button>
        <span className="font-bold">Games</span>
      </header>
      <div className="relative z-10 mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6">
        <div className="text-center">
          <div className="text-xs font-bold tracking-[.4em] text-white/80 uppercase">Open world · 3D</div>
          <h1 className="mt-1 text-5xl font-black tracking-tight italic drop-shadow-[0_4px_0_#7c1d6f] sm:text-7xl" style={{ background: "linear-gradient(180deg,#fff7c2,#ff8ad8 60%,#00e5ff)", WebkitBackgroundClip: "text", color: "transparent" }}>
            SUNSET BAY
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/90">Cruise an 80s neon coastal city — downtown towers, Ocean Drive, three causeways, a lighthouse island and a live synthwave radio.</p>
        </div>
        {result && (
          <div className="mx-auto mt-5 max-w-sm animate-pop rounded-2xl bg-black/55 p-4 text-center ring-1 ring-white/15 backdrop-blur">
            <div className="text-xs font-bold tracking-widest text-white/70 uppercase">Checkpoint Rush over</div>
            <div className="text-4xl font-black tabular-nums">{result.score.toLocaleString()}</div>
            <div className="text-sm text-white/75">
              {result.cps} checkpoints {result.score > result.best && result.best > 0 ? "· 🏆 new best!" : result.best ? `· best ${result.best.toLocaleString()}` : ""}
            </div>
          </div>
        )}
        <div className="mt-[34vh] grid gap-3 sm:mt-[38vh] sm:grid-cols-2">
          <button
            onClick={() => {
              setResult(null);
              setRun((r) => r + 1);
              setMode("free");
            }}
            className="rounded-2xl bg-black/55 p-4 text-left ring-1 ring-white/15 backdrop-blur transition hover:-translate-y-0.5 hover:ring-[#00e5ff]"
          >
            <div className="text-lg font-black">🌴 Free roam</div>
            <div className="text-sm text-white/75">Explore, drift, hit the stunt ramps and hunt all 25 hidden cassette tapes.</div>
          </button>
          <button
            onClick={() => {
              setResult(null);
              setRun((r) => r + 1);
              setMode("rush");
            }}
            className="rounded-2xl bg-gradient-to-br from-[#ff2bd6] to-[#7c4dff] p-4 text-left shadow-xl transition hover:-translate-y-0.5"
          >
            <div className="flex items-center gap-2 text-lg font-black">
              <Play className="size-4 fill-current" /> Checkpoint Rush
            </div>
            <div className="text-sm text-white/85">Race the clock through neon checkpoints across the city. Drifts and jumps add points. Ranked.</div>
          </button>
        </div>
        <div className="mt-4 rounded-2xl bg-black/55 p-3 ring-1 ring-white/10 backdrop-blur">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold">
            <Trophy className="size-4 text-[#ffd400]" /> Top drivers
          </div>
          {rows.length === 0 ? (
            <div className="text-sm text-white/60">No scores yet — be the first.</div>
          ) : (
            rows.slice(0, 8).map((r, i) => (
              <div key={r.user_id} className={cn("flex items-center gap-2 rounded-lg px-2 py-1 text-sm", r.user_id === me && "bg-white/10")}>
                <span className="w-5 text-center font-bold text-white/70">{i + 1}</span>
                <Avatar userId={r.user_id} size={22} plain />
                <span className="min-w-0 flex-1 truncate">
                  <NameTag userId={r.user_id} badges={false} />
                </span>
                <b className="tabular-nums">{r.best.toLocaleString()}</b>
              </div>
            ))
          )}
        </div>
        <p className="mt-3 text-center text-xs text-white/60">{mobile ? "Steer with the left pad · gas & brake on the right · DRIFT for handbrake" : "WASD / arrows · Space handbrake · C camera · M map · R reset · 1-3 radio"}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────── the game
function Game({ mode, mobile, onExit, onOver }: { mode: Mode; mobile: boolean; onExit: () => void; onOver: (score: number, cps: number) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const mini = useRef<HTMLCanvasElement>(null);
  const ctl = useRef<Ctl>({ steer: 0, gas: 0, brake: 0, hand: false });
  const ui = useRef<{ cam: number; map: boolean; tod: number | null; station: number; music: boolean }>({ cam: 0, map: false, tod: null, station: 0, music: true });
  const [hud, setHud] = useState<Hud>({ speed: 0, msg: "", msgAt: 0, time: 0, score: 0, cps: 0, tapes: loadTapes().length, drift: 0, air: 0 });
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [bigMap, setBigMap] = useState(false);
  const [station, setStation] = useState(0);
  const [music, setMusic] = useState(true);
  const [full, setFull] = useState(false);
  const radio = useRef<Radio | null>(null);
  const overRef = useRef(onOver);
  overRef.current = onOver;

  useEffect(() => {
    let alive = true;
    let raf = 0;
    let renderer: any = null;
    let resizeObs: ResizeObserver | null = null;
    const r = new Radio();
    radio.current = r;
    const keys: Record<string, boolean> = {};
    const kd = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input,textarea")) return;
      keys[e.code] = true;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
      if (e.code === "KeyC") ui.current.cam = (ui.current.cam + 1) % 3;
      if (e.code === "KeyM") setBigMap((v) => !v);
      if (e.code === "KeyR") reset = true;
      if (e.code === "KeyN") ui.current.tod = ((ui.current.tod ?? tod) + 0.25) % 1;
      if (/^Digit[1-3]$/.test(e.code)) {
        const i = Number(e.code.slice(5)) - 1;
        r.setStation(i);
        setStation(i);
      }
    };
    const ku = (e: KeyboardEvent) => (keys[e.code] = false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    let reset = false;
    let tod = 0.71; // start at golden hour

    void (async () => {
      let THREE: any;
      try {
        THREE = await loadThree();
      } catch {
        if (alive) setStatus("error");
        return;
      }
      if (!alive || !host.current) return;
      const w: World = makeWorld();
      const b: Built = buildScene(THREE, w, { mobile });
      renderer = new THREE.WebGLRenderer({ antialias: !mobile, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.75));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      host.current.appendChild(renderer.domElement);
      renderer.domElement.className = "absolute inset-0 h-full w-full";
      const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 4200);
      const size = () => {
        const el = host.current;
        if (!el) return;
        const { width, height } = el.getBoundingClientRect();
        renderer.setSize(width, height, false);
        camera.aspect = width / Math.max(1, height);
        camera.updateProjectionMatrix();
      };
      size();
      resizeObs = new ResizeObserver(size);
      resizeObs.observe(host.current);

      // minimap base image (1px per tile)
      const base = document.createElement("canvas");
      base.width = base.height = N;
      {
        const g = base.getContext("2d")!;
        const img = g.createImageData(N, N);
        const C: Record<number, number[]> = { 0: [24, 40, 92], 1: [240, 210, 160], 2: [80, 190, 110], 3: [40, 40, 52], 4: [150, 145, 165], 5: [110, 110, 125], 6: [240, 180, 205], 7: [70, 175, 95], 8: [140, 105, 75] };
        for (let i = 0; i < N * N; i++) {
          const c = C[w.tiles[i]] ?? [0, 0, 0];
          img.data.set([c[0], c[1], c[2], 255], i * 4);
        }
        g.putImageData(img, 0, 0);
      }

      // ── state
      const car = { x: w.spawn.x, z: w.spawn.z, y: 0, vy: 0, a: w.spawn.a, vx: 0, vz: 0, air: 0, pitch: 0, roll: 0, splash: 0 };
      let safe = { x: car.x, z: car.z, a: car.a };
      let safeT = 0;
      const tapes = new Set<number>(loadTapes());
      const st = { score: 0, cps: 0, timeLeft: mode === "rush" ? 50 : 0, drift: 0, driftHold: 0, msg: "", msgAt: 0, over: false, airMax: 0 };
      let cp: { x: number; z: number } | null = null;
      const say = (m: string) => {
        st.msg = m;
        st.msgAt = performance.now();
      };
      const nextCp = () => {
        for (let k = 0; k < 200; k++) {
          const n = w.nodes[Math.floor(Math.random() * w.nodes.length)];
          const d = Math.hypot(n.x - car.x, n.z - car.z);
          if (d > 260 && d < 700) {
            cp = { x: n.x, z: n.z };
            b.ring.position.set(n.x, 0, n.z);
            b.ring.visible = true;
            return d;
          }
        }
        return 300;
      };
      if (mode === "rush") {
        nextCp();
        say("Reach the yellow checkpoint!");
      } else say("Welcome to Sunset Bay 🌴 find the glowing tapes");

      // traffic agents on the road graph
      type Ag = { e: number; from: number; t: number; v: number; base: number; x: number; z: number; a: number };
      const ag: Ag[] = [];
      for (let i = 0; i < b.traffic.n; i++) {
        const e = Math.floor(Math.random() * w.edges.length);
        ag.push({ e, from: w.edges[e].a, t: Math.random() * w.edges[e].len, v: 0, base: 11 + Math.random() * 7, x: 0, z: 0, a: 0 });
      }
      const placeAgent = (g: Ag) => {
        const E = w.edges[g.e];
        const A = w.nodes[g.from],
          B = w.nodes[g.from === E.a ? E.b : E.a];
        const dx = (B.x - A.x) / E.len,
          dz = (B.z - A.z) / E.len;
        g.x = A.x + dx * g.t + -dz * 2.6;
        g.z = A.z + dz * g.t + dx * 2.6;
        g.a = Math.atan2(dx, -dz);
      };
      ag.forEach(placeAgent);

      if (ui.current.music) r.start(ui.current.station);

      let last = performance.now();
      let hudT = 0;
      const camPos = new THREE.Vector3(car.x, 8, car.z + 14);
      const look = new THREE.Vector3();
      const { m4, q, v3, s3, e3 } = b.tmp;
      setStatus("ready");

      const frame = () => {
        if (!alive) return;
        raf = requestAnimationFrame(frame);
        const now = performance.now();
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        b.U.time.value += dt;
        if (ui.current.tod != null) {
          tod = ui.current.tod;
          ui.current.tod = null;
        }
        tod = (tod + dt / 420) % 1; // full day = 7 minutes
        const pal = applyTime(THREE, b, tod);

        // ── input
        const k = ctl.current;
        const steer = Math.max(-1, Math.min(1, k.steer + (keys.ArrowLeft || keys.KeyA ? -1 : 0) + (keys.ArrowRight || keys.KeyD ? 1 : 0)));
        const gas = Math.max(k.gas, keys.ArrowUp || keys.KeyW ? 1 : 0);
        const brake = Math.max(k.brake, keys.ArrowDown || keys.KeyS ? 1 : 0);
        const hand = k.hand || !!keys.Space;
        if (reset) {
          reset = false;
          Object.assign(car, { x: safe.x, z: safe.z, a: safe.a, vx: 0, vz: 0, y: 0, vy: 0, air: 0 });
        }

        // ── car physics (arcade)
        const tile = tileAt(w, car.x, car.z);
        const offroad = tile === SAND || tile === 2 || tile === 7 || tile === 6;
        const fx = Math.sin(car.a),
          fz = -Math.cos(car.a);
        let fwd = car.vx * fx + car.vz * fz;
        let lx = car.vx - fx * fwd,
          lz = car.vz - fz * fwd;
        const maxV = offroad ? 32 : 64;
        const grounded = car.y <= 0.05 || car.air === 0;
        if (car.splash > 0) {
          car.splash -= dt;
          fwd *= 0.9;
          if (car.splash <= 0) Object.assign(car, { x: safe.x, z: safe.z, a: safe.a, vx: 0, vz: 0, y: 0, vy: 0 });
        } else if (grounded) {
          if (gas) fwd += (fwd < 0 ? 40 : 24 * (1 - Math.max(0, fwd) / maxV)) * gas * dt;
          if (brake) fwd -= (fwd > 1 ? 42 : 14 * (1 + fwd / 16)) * brake * dt;
          if (hand) fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), 10 * dt);
          fwd -= fwd * (offroad ? 0.9 : 0.18) * dt;
          if (!gas && !brake) fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), 3 * dt);
          fwd = Math.max(-16, Math.min(maxV * 1.02, fwd));
          const grip = hand ? 1.1 : offroad ? 4 : 8.5;
          const keep = Math.exp(-grip * dt);
          lx *= keep;
          lz *= keep;
          const turn = steer * 2.1 * Math.min(1, Math.abs(fwd) / 9) * (1 - Math.min(1, Math.abs(fwd) / maxV) * 0.42) * (hand ? 1.35 : 1);
          car.a += turn * Math.sign(fwd || 1) * dt;
        }
        car.vx = fx * fwd + lx;
        car.vz = fz * fwd + lz;
        const px = car.x,
          pz = car.z;
        car.x += car.vx * dt;
        car.z += car.vz * dt;
        // drift scoring
        const latSpeed = Math.hypot(lx, lz);
        if (grounded && latSpeed > 5 && Math.abs(fwd) > 14) {
          st.drift += latSpeed * dt * 10;
          st.driftHold = 0.6;
        } else if (st.driftHold > 0) {
          st.driftHold -= dt;
          if (st.driftHold <= 0 && st.drift > 30) {
            const pts = Math.round(st.drift);
            st.score += pts;
            if (mode === "rush") st.timeLeft += Math.min(4, pts / 250);
            say(`DRIFT +${pts}`);
            st.drift = 0;
          } else if (st.driftHold <= 0) st.drift = 0;
        }

        // ramps & air
        let ground = 0;
        for (const rp of w.ramps) {
          const rfx = Math.sin(rp.dir),
            rfz = -Math.cos(rp.dir);
          const dx = car.x - rp.x,
            dz = car.z - rp.z;
          const along = dx * rfx + dz * rfz;
          const across = dx * -rfz + dz * rfx;
          if (Math.abs(across) < rp.w / 2 && along >= 0 && along <= rp.len) ground = Math.max(ground, (along / rp.len) * rp.h);
          // leaving the lip: launch
          if (car.air === 0 && Math.abs(across) < rp.w / 2 && along > rp.len && along < rp.len + 3 && car.y > rp.h * 0.6) {
            car.air = 0.0001;
            car.vy = Math.max(4, fwd * (rp.h / rp.len) * 1.1);
          }
        }
        if (car.air > 0) {
          car.air += dt;
          car.vy -= 30 * dt;
          car.y += car.vy * dt;
          car.pitch += (-(car.vy / 30) * 0.5 - car.pitch) * 0.1;
          if (car.y <= ground) {
            car.y = ground;
            if (car.air > 0.55) {
              const pts = Math.round(car.air * 400 + Math.abs(fwd) * 6);
              st.score += pts;
              if (mode === "rush") st.timeLeft += 2;
              say(`STUNT JUMP ${car.air.toFixed(1)}s +${pts}`);
              r.sfx("land");
            }
            car.air = 0;
            car.vy = 0;
          }
        } else {
          car.y = ground;
          car.pitch += ((ground > 0 ? -0.28 : 0) - car.pitch) * 0.2;
        }

        // collisions
        const p = { x: car.x, z: car.z };
        if (car.y < 3 && collide(w, p, 1.9)) {
          const speed = Math.hypot(car.vx, car.vz);
          const nx = p.x - car.x,
            nz = p.z - car.z;
          const nl = Math.hypot(nx, nz) || 1;
          const dot = (car.vx * nx + car.vz * nz) / nl;
          car.vx -= (nx / nl) * dot * 1.4;
          car.vz -= (nz / nl) * dot * 1.4;
          car.vx *= 0.75;
          car.vz *= 0.75;
          car.x = p.x;
          car.z = p.z;
          if (speed > 14) r.sfx("crash");
        }
        car.x = Math.max(4, Math.min(SIZE - 4, car.x));
        car.z = Math.max(4, Math.min(SIZE - 4, car.z));
        for (const g of ag) {
          const dx = car.x - g.x,
            dz = car.z - g.z;
          const d = Math.hypot(dx, dz);
          if (d < 3.6 && car.y < 2) {
            const push = (3.6 - d) / (d || 1);
            car.x += dx * push;
            car.z += dz * push;
            const s = Math.hypot(car.vx, car.vz);
            car.vx *= 0.55;
            car.vz *= 0.55;
            g.v = 0;
            if (s > 12) r.sfx("crash");
          }
        }
        // water
        const under = tileAt(w, car.x, car.z);
        if (under === WATER && car.y <= 0.2 && car.splash <= 0) {
          car.splash = 1.3;
          r.sfx("splash");
          say("SPLASH! 🌊");
          if (mode === "rush") st.timeLeft = Math.max(0, st.timeLeft - 3);
        }
        if ((under === ROAD || under === BRIDGE) && car.splash <= 0) {
          safeT += dt;
          if (safeT > 1) {
            safeT = 0;
            safe = { x: px, z: pz, a: car.a };
          }
        }

        // ── traffic
        for (const g of ag) {
          const E = w.edges[g.e];
          // brake for the player
          const dx = car.x - g.x,
            dz = car.z - g.z;
          const ahead = dx * Math.sin(g.a) + dz * -Math.cos(g.a);
          const side = Math.abs(dx * Math.cos(g.a) + dz * Math.sin(g.a));
          const target = ahead > 0 && ahead < 11 && side < 3 ? 0 : g.base;
          g.v += (target - g.v) * Math.min(1, dt * (target < g.v ? 5 : 1.2));
          g.t += g.v * dt;
          if (g.t >= E.len) {
            const at = g.from === E.a ? E.b : E.a;
            const opts = w.nodes[at].edges.filter((x) => x !== g.e);
            g.e = opts.length ? opts[Math.floor(Math.random() * opts.length)] : g.e;
            g.from = at;
            g.t = 0;
          }
          placeAgent(g);
        }
        for (let i = 0; i < ag.length; i++) {
          const g = ag[i];
          m4.compose(v3.set(g.x, 0, g.z), q.setFromEuler(e3.set(0, -g.a, 0)), s3.set(1, 1, 1));
          b.traffic.body.setMatrixAt(i, m4);
          b.traffic.top.setMatrixAt(i, m4);
          b.traffic.lights.setMatrixAt(i, m4);
          b.traffic.wheels.setMatrixAt(i, m4);
        }
        for (const m of [b.traffic.body, b.traffic.top, b.traffic.lights, b.traffic.wheels]) m.instanceMatrix.needsUpdate = true;

        // ── tapes
        const tt = b.U.time.value;
        for (let i = 0; i < w.tapes.length; i++) {
          const tp = w.tapes[i];
          const got = tapes.has(i);
          if (!got && Math.hypot(tp.x - car.x, tp.z - car.z) < 5 && car.y < 6) {
            tapes.add(i);
            try {
              localStorage.setItem(TAPE_KEY, JSON.stringify([...tapes]));
            } catch {
              /* private mode */
            }
            r.sfx("pickup");
            st.score += 250;
            say(tapes.size === w.tapes.length ? "ALL 25 TAPES! You own the Bay 🏆" : `Tape ${tapes.size}/25 · “${TAPE_NAMES[i % TAPE_NAMES.length]}”`);
          }
          const sc = got ? 0 : 1;
          m4.compose(v3.set(tp.x, 2.4 + Math.sin(tt * 2 + i) * 0.4, tp.z), q.setFromEuler(e3.set(0, tt * 1.6 + i, 0)), s3.set(sc, sc, sc));
          b.tapeMesh.setMatrixAt(i, m4);
          m4.compose(v3.set(tp.x, 0, tp.z), q.identity(), s3.set(sc, sc, sc));
          b.beamMesh.setMatrixAt(i, m4);
        }
        b.tapeMesh.instanceMatrix.needsUpdate = true;
        b.beamMesh.instanceMatrix.needsUpdate = true;

        // boats bob
        b.boats.forEach((d, i) => {
          m4.compose(v3.set(d.x + Math.sin(tt * 0.1 + i) * 6, -0.8 + Math.sin(tt * 1.4 + i) * 0.25, d.z), q.setFromEuler(e3.set(Math.sin(tt + i) * 0.04, d.rot + tt * 0.02, Math.cos(tt * 1.2 + i) * 0.05)), s3.set(1, 1, 1));
          b.boatMesh.setMatrixAt(i, m4);
        });
        b.boatMesh.instanceMatrix.needsUpdate = true;
        if (b.beam) b.beam.rotation.y = tt * 0.6;

        // ── checkpoint rush
        if (mode === "rush" && !st.over) {
          st.timeLeft -= dt;
          b.torus.rotation.y += dt * 1.2;
          if (cp && Math.hypot(cp.x - car.x, cp.z - car.z) < 11) {
            st.cps++;
            st.score += 1000;
            r.sfx("checkpoint");
            const d = nextCp();
            const bonus = Math.round(Math.max(9, Math.min(26, d / 24)));
            st.timeLeft += bonus;
            say(`CHECKPOINT ${st.cps}! +${bonus}s`);
          }
          if (st.timeLeft <= 0) {
            st.over = true;
            st.timeLeft = 0;
            st.score += Math.round(st.drift);
            say("TIME!");
            setTimeout(() => alive && overRef.current(st.score, st.cps), 1400);
          }
        }

        // ── car visuals
        b.car.position.set(car.x, car.y + (car.splash > 0 ? -1.2 * (1.3 - car.splash) : 0), car.z);
        b.car.rotation.y = -car.a;
        const targetRoll = -steer * Math.min(1, Math.abs(fwd) / 40) * 0.06 + (hand ? -steer * 0.04 : 0);
        car.roll += (targetRoll - car.roll) * 0.15;
        b.carBody.rotation.set(car.pitch, 0, car.roll);
        for (const wh of b.wheels) wh.rotation.x -= (fwd * dt) / 0.42;
        b.wheels[0].rotation.y = b.wheels[1].rotation.y = -steer * 0.45;
        b.shadow.position.set(car.x, Math.max(0.05, ground + 0.05), car.z);
        b.shadow.rotation.y = -car.a;
        (b.shadow.material as any).opacity = 0.35 / (1 + car.y * 0.15);

        // ── camera
        const speedK = Math.min(1, Math.abs(fwd) / 64);
        const cm = ui.current.cam;
        const dist = cm === 1 ? 24 : cm === 2 ? 7.5 : 11 + speedK * 3;
        const hgt = cm === 1 ? 11 : cm === 2 ? 2.6 : 4.4 + speedK * 0.6;
        const behind = car.a + (fwd < -2 ? Math.PI : 0);
        const want = v3.set(car.x - Math.sin(behind) * dist, car.y + hgt, car.z + Math.cos(behind) * dist);
        camPos.lerp(want, 1 - Math.exp(-dt * (cm === 2 ? 14 : 6)));
        // keep the camera out of buildings
        const cp2 = { x: camPos.x, z: camPos.z };
        if (camPos.y < 40) collide(w, cp2, 1.2);
        camera.position.set(cp2.x, Math.max(1.2, camPos.y), cp2.z);
        look.set(car.x + Math.sin(car.a) * 6, car.y + 1.6, car.z - Math.cos(car.a) * 6);
        camera.lookAt(look);
        camera.fov = 60 + speedK * 14;
        camera.updateProjectionMatrix();
        b.sky.position.copy(camera.position);
        b.water.position.x = Math.round(camera.position.x / 200) * 200;
        b.water.position.z = Math.round(camera.position.z / 200) * 200;

        r.setEngine(Math.min(1, Math.abs(fwd) / 64), gas);
        renderer.render(b.scene, camera);

        // ── minimap
        const mc = mini.current;
        if (mc && now - hudT > 90) {
          const g = mc.getContext("2d")!;
          const W = mc.width;
          const span = 46; // tiles across
          g.save();
          g.clearRect(0, 0, W, W);
          g.beginPath();
          g.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2);
          g.clip();
          g.imageSmoothingEnabled = false;
          g.translate(W / 2, W / 2);
          g.rotate(-car.a);
          const sc = W / span;
          g.drawImage(base, -(car.x / T) * sc, -(car.z / T) * sc, N * sc, N * sc);
          const dot = (x: number, z: number, c: string, r0: number) => {
            g.fillStyle = c;
            g.beginPath();
            g.arc(((x - car.x) / T) * sc, ((z - car.z) / T) * sc, r0, 0, Math.PI * 2);
            g.fill();
          };
          w.tapes.forEach((tp, i) => !tapes.has(i) && dot(tp.x, tp.z, "#00e5ff", 3));
          if (cp) dot(cp.x, cp.z, "#ffd400", 5);
          g.restore();
          // player arrow (always up)
          g.fillStyle = "#ff2bd6";
          g.beginPath();
          g.moveTo(W / 2, W / 2 - 7);
          g.lineTo(W / 2 + 5, W / 2 + 6);
          g.lineTo(W / 2 - 5, W / 2 + 6);
          g.closePath();
          g.fill();
          // checkpoint direction pip on the rim
          if (cp) {
            const ang = Math.atan2(cp.x - car.x, -(cp.z - car.z)) - car.a;
            g.fillStyle = "#ffd400";
            g.beginPath();
            g.arc(W / 2 + Math.sin(ang) * (W / 2 - 6), W / 2 - Math.cos(ang) * (W / 2 - 6), 4, 0, Math.PI * 2);
            g.fill();
          }
          hudT = now;
          setHud({ speed: Math.round(Math.abs(fwd) * 3.6), msg: st.msg, msgAt: st.msgAt, time: st.timeLeft, score: st.score, cps: st.cps, tapes: tapes.size, drift: Math.round(st.drift), air: car.air });
        }
        void pal;
      };
      raf = requestAnimationFrame(frame);
    })();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      resizeObs?.disconnect();
      r.dispose();
      if (renderer) {
        renderer.dispose();
        renderer.forceContextLoss?.();
        renderer.domElement.remove();
      }
    };
  }, [mode, mobile]);

  // fullscreen
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const f = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);
  const toggleFull = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await wrap.current?.requestFullscreen();
    } catch {
      /* not allowed */
    }
  };

  const showMsg = hud.msg && performance.now() - hud.msgAt < 2600;
  const press = (k: keyof Ctl, v: number | boolean) => (e: React.PointerEvent) => {
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* gone */
    }
    (ctl.current as any)[k] = v;
    radio.current?.start(ui.current.station);
  };
  const release = (k: keyof Ctl) => () => ((ctl.current as any)[k] = typeof ctl.current[k] === "boolean" ? false : 0);

  return (
    <div ref={wrap} className="relative h-full min-h-0 w-full touch-none overflow-hidden bg-black select-none" onPointerDown={() => radio.current?.start(ui.current.station)}>
      <div ref={host} className="absolute inset-0" />
      {status !== "ready" && (
        <div className="absolute inset-0 grid place-items-center bg-[#0d0618] text-center text-white">
          {status === "loading" ? (
            <div>
              <div className="mx-auto size-12 animate-spin rounded-full border-4 border-[#ff2bd6] border-t-transparent" />
              <div className="mt-3 font-bold">Building Sunset Bay…</div>
            </div>
          ) : (
            <div className="max-w-xs">
              <div className="text-lg font-bold">Couldn&apos;t load the 3D engine</div>
              <p className="mt-1 text-sm text-white/70">Check your connection and try again — the game needs WebGL.</p>
              <button onClick={onExit} className="mt-3 rounded-full bg-white px-4 py-2 font-bold text-black">
                Back
              </button>
            </div>
          )}
        </div>
      )}

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-2 p-2 pt-safe-2">
        <button onClick={onExit} className="pointer-events-auto grid size-10 place-items-center rounded-full bg-black/45 text-white backdrop-blur" aria-label="Exit">
          <ArrowLeft className="size-5" />
        </button>
        <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-black/45 px-1 py-1 text-white backdrop-blur">
          <button
            onClick={() => {
              const r = radio.current;
              if (!r) return;
              if (music) r.stopMusic();
              else r.start(station);
              ui.current.music = !music;
              setMusic(!music);
            }}
            className={cn("grid size-8 place-items-center rounded-full", music ? "bg-[#ff2bd6]" : "bg-white/10")}
            aria-label="Radio on/off"
          >
            <Music className="size-4" />
          </button>
          <button
            onClick={() => {
              const n = (station + 1) % STATIONS.length;
              radio.current?.setStation(n);
              ui.current.station = n;
              setStation(n);
            }}
            className="px-2 text-left text-xs leading-tight font-bold"
          >
            {STATIONS[station].name}
            <span className="block text-[10px] font-normal text-white/70">{STATIONS[station].vibe}</span>
          </button>
        </div>
        <div className="flex-1" />
        <div className="pointer-events-auto flex gap-1">
          <button onClick={() => (ui.current.tod = 0.5)} className="grid size-10 place-items-center rounded-full bg-black/45 text-white backdrop-blur" aria-label="Daytime">
            <Sun className="size-4" />
          </button>
          <button onClick={() => (ui.current.tod = 0.9)} className="grid size-10 place-items-center rounded-full bg-black/45 text-white backdrop-blur" aria-label="Night">
            <Moon className="size-4" />
          </button>
          <button onClick={() => (ui.current.cam = (ui.current.cam + 1) % 3)} className="grid size-10 place-items-center rounded-full bg-black/45 text-white backdrop-blur" aria-label="Camera">
            <Camera className="size-4" />
          </button>
          <button onClick={() => setBigMap(!bigMap)} className="grid size-10 place-items-center rounded-full bg-black/45 text-white backdrop-blur" aria-label="Map">
            <MapIcon className="size-4" />
          </button>
          {!mobile && (
            <button onClick={() => void toggleFull()} className="grid size-10 place-items-center rounded-full bg-black/45 text-white backdrop-blur" aria-label="Fullscreen">
              {full ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
            </button>
          )}
        </div>
      </div>

      {/* mission panel */}
      <div className="pointer-events-none absolute top-16 left-2 rounded-xl bg-black/45 px-3 py-2 text-white backdrop-blur">
        {mode === "rush" ? (
          <>
            <div className={cn("text-3xl leading-none font-black tabular-nums", hud.time < 10 && "animate-pulse text-[#ff4d6d]")}>{Math.ceil(hud.time)}s</div>
            <div className="mt-1 text-xs font-bold text-white/80">
              {hud.cps} checkpoints · {hud.score.toLocaleString()} pts
            </div>
          </>
        ) : (
          <>
            <div className="text-xs font-bold tracking-wider text-[#00e5ff] uppercase">Tapes</div>
            <div className="text-2xl leading-none font-black tabular-nums">{hud.tapes}/25</div>
            <div className="mt-1 text-xs text-white/80">{hud.score.toLocaleString()} pts</div>
          </>
        )}
        {hud.drift > 30 && <div className="mt-1 animate-pulse text-sm font-black text-[#ffd400]">DRIFT {hud.drift}</div>}
      </div>

      {/* minimap + speed */}
      <div className={cn("pointer-events-none absolute right-2 flex flex-col items-end gap-1", mobile ? "top-16" : "bottom-3")}>
        <canvas ref={mini} width={150} height={150} className="size-[120px] rounded-full bg-[#183058] ring-2 ring-white/70 sm:size-[150px]" />
        <div className="rounded-xl bg-black/45 px-3 py-1 text-right text-white backdrop-blur">
          <span className="text-3xl font-black tabular-nums italic">{hud.speed}</span>
          <span className="ml-1 text-xs font-bold text-white/70">km/h</span>
        </div>
      </div>

      {showMsg && (
        <div key={hud.msgAt} className="pointer-events-none absolute inset-x-0 top-[22%] animate-pop text-center text-2xl font-black text-white italic drop-shadow-[0_3px_0_#ff2bd6] sm:text-4xl">
          {hud.msg}
        </div>
      )}

      {bigMap && <BigMap onClose={() => setBigMap(false)} />}

      {/* touch controls */}
      {mobile && status === "ready" && (
        <>
          <Steer ctl={ctl} />
          <div className="absolute right-3 bottom-[max(16px,env(safe-area-inset-bottom))] flex items-end gap-2">
            <button onPointerDown={press("hand", true)} onPointerUp={release("hand")} onPointerCancel={release("hand")} className="size-16 rounded-full bg-[#ffd400]/80 text-xs font-black text-black active:scale-95">
              DRIFT
            </button>
            <div className="flex flex-col gap-2">
              <button onPointerDown={press("gas", 1)} onPointerUp={release("gas")} onPointerCancel={release("gas")} className="size-20 rounded-full bg-[#00e08a]/85 text-sm font-black text-black active:scale-95">
                GAS
              </button>
              <button onPointerDown={press("brake", 1)} onPointerUp={release("brake")} onPointerCancel={release("brake")} className="size-16 self-center rounded-full bg-[#ff4d6d]/85 text-xs font-black text-white active:scale-95">
                BRAKE
              </button>
            </div>
          </div>
          <button onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyR" }))} className="absolute bottom-[max(16px,env(safe-area-inset-bottom))] left-1/2 grid size-10 -translate-x-1/2 place-items-center rounded-full bg-black/45 text-white" aria-label="Reset car">
            <RotateCcw className="size-4" />
          </button>
        </>
      )}
    </div>
  );
}

/** drag left/right anywhere on the left pad to steer */
function Steer({ ctl }: { ctl: React.MutableRefObject<Ctl> }) {
  const [x, setX] = useState(0);
  const start = useRef<number | null>(null);
  const move = (cx: number) => {
    if (start.current == null) return;
    const v = Math.max(-1, Math.min(1, (cx - start.current) / 60));
    ctl.current.steer = v;
    setX(v);
  };
  return (
    <div
      className="absolute bottom-[max(16px,env(safe-area-inset-bottom))] left-3 grid h-28 w-44 place-items-center rounded-full bg-black/35 ring-1 ring-white/25 backdrop-blur"
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        start.current = e.clientX;
      }}
      onPointerMove={(e) => move(e.clientX)}
      onPointerUp={() => {
        start.current = null;
        ctl.current.steer = 0;
        setX(0);
      }}
      onPointerCancel={() => {
        start.current = null;
        ctl.current.steer = 0;
        setX(0);
      }}
    >
      <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
      <div className="size-14 rounded-full bg-white/85 shadow-lg" style={{ transform: `translateX(${x * 56}px)` }} />
      <span className="pointer-events-none absolute bottom-1 text-[10px] font-bold text-white/70">◀ STEER ▶</span>
    </div>
  );
}

function BigMap({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const w = makeWorld();
    const c = ref.current!;
    const g = c.getContext("2d")!;
    const C: Record<number, string> = { 0: "#183058", 1: "#f0d2a0", 2: "#50be6e", 3: "#2a2a36", 4: "#9b97a6", 5: "#6e6e7d", 6: "#f0b4cd", 7: "#46af5f", 8: "#8c694b" };
    const s = c.width / N;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        g.fillStyle = C[w.tiles[y * N + x]];
        g.fillRect(x * s, y * s, s + 0.5, s + 0.5);
      }
    g.fillStyle = "#00e5ff";
    const got = new Set(loadTapes());
    w.tapes.forEach((t, i) => {
      if (got.has(i)) return;
      g.beginPath();
      g.arc((t.x / T) * s, (t.z / T) * s, 4, 0, Math.PI * 2);
      g.fill();
    });
    g.font = "bold 14px system-ui";
    g.fillStyle = "#fff";
    g.textAlign = "center";
    const label = (t: string, x: number, y: number) => g.fillText(t, x * s, y * s);
    label("DOWNTOWN", 36, 78);
    label("OCEAN BEACH", 113, 60);
    label("LIGHTHOUSE ISLE", 86, 66);
    label("PORT", 38, 150);
  }, []);
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <canvas ref={ref} width={640} height={640} className="aspect-square max-h-full w-full max-w-[640px] rounded-2xl ring-2 ring-white/40" />
      <div className="absolute bottom-4 text-sm text-white/80">Cyan dots = tapes you haven&apos;t found · tap to close</div>
    </div>
  );
}
