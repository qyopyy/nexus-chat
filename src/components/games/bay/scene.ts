/* eslint-disable @typescript-eslint/no-explicit-any */
// Sunset Bay — 3D scene construction (three.js, loaded at runtime from the CDN).
import { BRIDGE, DOCK, GRASS, LOT, N, PARK, ROAD, SAND, SIZE, T, WALK, WATER, type World } from "./world";

type Any = any;
const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js";
let threeP: Promise<Any> | null = null;
export function loadThree(): Promise<Any> {
  threeP ??= (new Function("u", "return import(u)") as (u: string) => Promise<Any>)(THREE_URL).catch((e) => {
    threeP = null;
    throw e;
  });
  return threeP;
}

// ── time of day palette (t: 0 midnight · .25 sunrise · .5 noon · .75 sunset)
type Pal = { top: number[]; hor: number[]; bot: number[]; sun: number[]; amb: number[]; gnd: number[]; water: number[]; fog: number[] };
const hex = (h: number) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const KEYS: [number, Pal][] = [
  [0.0, { top: hex(0x05031a), hor: hex(0x2a0f4a), bot: hex(0x040313), sun: hex(0x6f7cff), amb: hex(0x2b2a5e), gnd: hex(0x120a24), water: hex(0x070d2a), fog: hex(0x1d0e38) }],
  [0.23, { top: hex(0x1b1450), hor: hex(0xff7a6b), bot: hex(0x2a1240), sun: hex(0xffa070), amb: hex(0x5a4a8a), gnd: hex(0x3a2440), water: hex(0x173a6e), fog: hex(0xc76f86) }],
  [0.33, { top: hex(0x3a8cff), hor: hex(0xbfe6ff), bot: hex(0x6aa9d9), sun: hex(0xfff1d6), amb: hex(0x9cc8ff), gnd: hex(0x8a7a6a), water: hex(0x1f78c9), fog: hex(0xbfe0ff) }],
  [0.62, { top: hex(0x3a8cff), hor: hex(0xc8eaff), bot: hex(0x6aa9d9), sun: hex(0xfff1d6), amb: hex(0x9cc8ff), gnd: hex(0x8a7a6a), water: hex(0x1f78c9), fog: hex(0xc4e4ff) }],
  [0.74, { top: hex(0x2b1055), hor: hex(0xff4f9a), bot: hex(0x1a0b2e), sun: hex(0xffb347), amb: hex(0x8a5aa8), gnd: hex(0x3a1c44), water: hex(0x2a2a6e), fog: hex(0xd0507f) }],
  [0.82, { top: hex(0x120838), hor: hex(0x7a1f6e), bot: hex(0x08051a), sun: hex(0xff5a8a), amb: hex(0x45306e), gnd: hex(0x1a0e2a), water: hex(0x0f1240), fog: hex(0x4a1a55) }],
  [1.0, { top: hex(0x05031a), hor: hex(0x2a0f4a), bot: hex(0x040313), sun: hex(0x6f7cff), amb: hex(0x2b2a5e), gnd: hex(0x120a24), water: hex(0x070d2a), fog: hex(0x1d0e38) }],
];
export function palette(t: number) {
  t = ((t % 1) + 1) % 1;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1][0] < t) i++;
  const [t0, a] = KEYS[i],
    [t1, b] = KEYS[i + 1];
  const k = (t - t0) / (t1 - t0 || 1);
  const mix = (x: number[], y: number[]) => x.map((v, j) => v + (y[j] - v) * k);
  const out = {} as Pal;
  for (const key of Object.keys(a) as (keyof Pal)[]) out[key] = mix(a[key], b[key]);
  // sun path: rises east (+x), sets west… we set it so sunsets sit over the ocean/bay view
  const ang = (t - 0.25) * Math.PI * 2; // 0 at sunrise
  const elev = Math.sin(ang);
  const sunDir = [Math.cos(ang) * -0.85, Math.max(-0.4, elev), 0.45];
  const night = Math.max(0, Math.min(1, (0.12 - elev) / 0.3));
  return { ...out, sunDir, night, elev };
}

const merge = (THREE: Any, geos: Any[]) => {
  // minimal non-indexed merge (position/normal/color)
  let count = 0;
  const parts = geos.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    count += n.attributes.position.count;
    return n;
  });
  const pos = new Float32Array(count * 3),
    nor = new Float32Array(count * 3);
  const hasColor = parts.every((p: Any) => p.attributes.color);
  const col = hasColor ? new Float32Array(count * 3) : null;
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, o * 3);
    if (!p.attributes.normal) p.computeVertexNormals();
    nor.set(p.attributes.normal.array, o * 3);
    if (col) col.set(p.attributes.color.array, o * 3);
    o += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  if (col) g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
};
const paint = (THREE: Any, g: Any, c: number) => {
  const n = g.index ? g.toNonIndexed() : g;
  const col = new THREE.Color(c);
  const a = new Float32Array(n.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) (a[i] = col.r), (a[i + 1] = col.g), (a[i + 2] = col.b);
  n.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return n;
};

const FOG_V = `
#include <fog_pars_vertex>
`;
const FOG_F = `
#include <fog_pars_fragment>
`;

export type Built = ReturnType<typeof buildScene>;

export function buildScene(THREE: Any, w: World, opts: { mobile: boolean }) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xd0507f, 250, opts.mobile ? 900 : 1500);
  const U = {
    time: { value: 0 },
    night: { value: 0 },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    sunCol: { value: new THREE.Color() },
    ambSky: { value: new THREE.Color() },
    ambGround: { value: new THREE.Color() },
    skyTop: { value: new THREE.Color() },
    skyHor: { value: new THREE.Color() },
    skyBot: { value: new THREE.Color() },
    water: { value: new THREE.Color() },
  };
  const fogU = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);

  // ── sky dome with a retro striped sun
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(3500, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: U.skyTop, hor: U.skyHor, bot: U.skyBot, sunDir: U.sunDir, sunCol: U.sunCol, night: U.night, time: U.time },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 top, hor, bot, sunDir, sunCol; uniform float night, time; varying vec3 vDir;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        void main(){
          vec3 d = normalize(vDir); float h = d.y;
          vec3 col = h > 0.0 ? mix(hor, top, pow(h, 0.5)) : mix(hor, bot, pow(-h, 0.35));
          vec3 sd = normalize(sunDir);
          float c = max(dot(d, sd), 0.0);
          col += sunCol * (pow(c, 6.0) * 0.35 + pow(c, 60.0) * 0.6);
          float dist = acos(clamp(dot(d, sd), -1.0, 1.0));
          float r = 0.09;
          if (dist < r) {
            float sy = (d.y - sd.y) / r; // -1..1 across the disc
            float stripes = sy < 0.0 ? step(0.18 + (-sy) * 0.45, fract(sy * 5.0 + time * 0.12)) : 1.0;
            vec3 disc = mix(vec3(1.0, 0.95, 0.45), vec3(1.0, 0.25, 0.6), clamp(0.5 - sy * 0.6, 0.0, 1.0));
            float edge = smoothstep(r, r * 0.96, dist);
            col = mix(col, mix(disc, vec3(0.85, 0.9, 1.0), night), edge * stripes * (h > -0.02 ? 1.0 : 0.0));
          }
          if (h > 0.0) {
            vec2 g = floor(d.xz / (d.y + 0.25) * 260.0);
            float s = step(0.9965, hash(g)) * night * smoothstep(0.0, 0.25, h);
            col += vec3(s) * (0.6 + 0.4 * sin(time * 3.0 + hash(g) * 40.0));
          }
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.renderOrder = -1;
  scene.add(sky);

  // ── lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  scene.add(sun);

  // ── water
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(SIZE * 4, SIZE * 4, 1, 1),
    new THREE.ShaderMaterial({
      fog: true,
      uniforms: { ...fogU(), time: U.time, sunDir: U.sunDir, sunCol: U.sunCol, deep: U.water, hor: U.skyHor, night: U.night },
      vertexShader: `varying vec3 vW; ${FOG_V}
void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`,
      fragmentShader: `
        uniform float time, night; uniform vec3 sunDir, sunCol, deep, hor; varying vec3 vW; ${FOG_F}
        void main(){
          vec3 v = normalize(cameraPosition - vW);
          float a = sin(vW.x * 0.09 + time * 1.3) + sin(vW.z * 0.12 - time * 1.05) + 0.5 * sin((vW.x + vW.z) * 0.23 + time * 2.1) + 0.3 * sin((vW.x - vW.z) * 0.5 + time * 3.0);
          float b = cos(vW.z * 0.08 + time * 1.1) + cos(vW.x * 0.15 - time * 1.4) + 0.4 * cos((vW.x - vW.z) * 0.31 + time * 2.6);
          vec3 n = normalize(vec3(a * 0.045, 1.0, b * 0.045));
          vec3 r = reflect(-v, n);
          vec3 sd = normalize(sunDir);
          float s = max(dot(r, sd), 0.0);
          float spec = pow(s, 120.0) * 2.2 + pow(s, 12.0) * 0.25;
          float fres = pow(1.0 - max(v.y, 0.0), 4.0);
          vec3 col = mix(deep, hor, fres * 0.75) + sunCol * spec * (sd.y > -0.05 ? 1.0 : 0.25);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(SIZE / 2, -0.9, SIZE / 2);
  scene.add(water);

  // ── land tiles (one merged mesh with vertex colours + coast skirts)
  {
    const COL: Record<number, number> = { [SAND]: 0xf2d4a0, [GRASS]: 0x5cc26e, [ROAD]: 0x3b3a48, [LOT]: 0x9b97a6, [BRIDGE]: 0x5d5f6e, [WALK]: 0xf0b8cf, [PARK]: 0x48b45e, [DOCK]: 0x8a6a4c };
    const pos: number[] = [],
      col: number[] = [],
      idx: number[] = [];
    const c = new THREE.Color();
    const quad = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, dx: number, dy: number, dz: number, color: number, jitter = 0) => {
      const i = pos.length / 3;
      pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
      c.setHex(color);
      if (jitter) c.offsetHSL(0, 0, jitter);
      for (let k = 0; k < 4; k++) col.push(c.r, c.g, c.b);
      idx.push(i, i + 2, i + 1, i, i + 3, i + 2);
    };
    const isW = (x: number, y: number) => x < 0 || y < 0 || x >= N || y >= N || w.tiles[y * N + x] === WATER;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const t = w.tiles[y * N + x];
        if (t === WATER) continue;
        const h = t === SAND ? -0.15 : t === DOCK ? 0.3 : t === BRIDGE ? 0.05 : 0;
        const x0 = x * T,
          z0 = y * T,
          x1 = x0 + T,
          z1 = z0 + T;
        const j = ((x * 7 + y * 13) % 5) * 0.006 - 0.012;
        quad(x0, h, z0, x1, h, z0, x1, h, z1, x0, h, z1, COL[t] ?? 0x888888, t === ROAD || t === BRIDGE ? 0 : j);
        // skirts down to the water where the neighbour is water
        const sk = t === BRIDGE ? 0x3f4150 : t === SAND ? 0xd9b47a : 0x6d6a78;
        const lo = -3;
        if (isW(x, y - 1)) quad(x1, h, z0, x0, h, z0, x0, lo, z0, x1, lo, z0, sk);
        if (isW(x, y + 1)) quad(x0, h, z1, x1, h, z1, x1, lo, z1, x0, lo, z1, sk);
        if (isW(x - 1, y)) quad(x0, h, z0, x0, h, z1, x0, lo, z1, x0, lo, z0, sk);
        if (isW(x + 1, y)) quad(x1, h, z1, x1, h, z0, x1, lo, z0, x1, lo, z1, sk);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })));
  }

  // ── road markings (dashed centre line + bridge rails)
  {
    const geos: Any[] = [];
    const rails: Any[] = [];
    for (const l of w.lines) {
      const c = (l.at + 1) * T;
      const a = l.from * T,
        b = (l.to + 1) * T;
      for (let p = a + 2; p < b - 2; p += 7) {
        const g = new THREE.PlaneGeometry(l.axis === "v" ? 0.35 : 3.2, l.axis === "v" ? 3.2 : 0.35);
        g.rotateX(-Math.PI / 2);
        g.translate(l.axis === "v" ? c : p + 1.6, 0.04, l.axis === "v" ? p + 1.6 : c);
        geos.push(g);
      }
      if (l.bridge) {
        for (let p = a; p < b; p += T) {
          const tx = l.axis === "h" ? Math.floor(p / T) : l.at;
          const tz = l.axis === "h" ? l.at : Math.floor(p / T);
          if (w.tiles[tz * N + tx] !== BRIDGE) continue;
          for (const side of [-1, 1]) {
            const g = new THREE.BoxGeometry(l.axis === "h" ? T : 0.4, 1.1, l.axis === "h" ? 0.4 : T);
            g.translate(l.axis === "h" ? p + T / 2 : c + side * (T - 0.2), 0.6, l.axis === "h" ? c + side * (T - 0.2) : p + T / 2);
            rails.push(g);
          }
        }
      }
    }
    if (geos.length) scene.add(new THREE.Mesh(merge(THREE, geos), new THREE.MeshBasicMaterial({ color: 0xffd84d })));
    if (rails.length) scene.add(new THREE.Mesh(merge(THREE, rails), new THREE.MeshLambertMaterial({ color: 0xe8e4f0 })));
  }

  // ── buildings: instanced boxes with procedural windows + neon roof bands
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  bGeo.translate(0, 0.5, 0);
  const neonAttr = new Float32Array(w.buildings.length * 3);
  const bMat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: { ...fogU(), sunDir: U.sunDir, sunCol: U.sunCol, ambSky: U.ambSky, ambGround: U.ambGround, night: U.night, time: U.time },
    vertexShader: `
      attribute vec3 neon; varying vec3 vN; varying vec3 vW; varying vec3 vColor; varying vec3 vNeon; varying float vH; ${FOG_V}
      void main(){
        mat4 m = modelMatrix * instanceMatrix;
        vec4 wp = m * vec4(position, 1.0);
        vW = wp.xyz; vN = normalize(mat3(m) * normal); vH = length(m[1].xyz);
        #ifdef USE_INSTANCING_COLOR
          vColor = instanceColor;
        #else
          vColor = vec3(0.8);
        #endif
        vNeon = neon;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform vec3 sunDir, sunCol, ambSky, ambGround; uniform float night, time;
      varying vec3 vN; varying vec3 vW; varying vec3 vColor; varying vec3 vNeon; varying float vH; ${FOG_F}
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        vec3 n = normalize(vN);
        float diff = max(dot(n, normalize(sunDir)), 0.0);
        vec3 amb = mix(ambGround, ambSky, n.y * 0.5 + 0.5);
        vec3 col = vColor * (amb * 0.75 + sunCol * diff * 0.85);
        if (abs(n.y) < 0.5) {
          float u = abs(n.x) > 0.5 ? vW.z : vW.x;
          float fl = vW.y / 3.4;
          vec2 id = vec2(floor(u / 2.8), floor(fl));
          vec2 f = vec2(fract(u / 2.8), fract(fl));
          float win = step(0.16, f.x) * step(f.x, 0.84) * step(0.22, f.y) * step(f.y, 0.78);
          win *= step(3.0, vW.y) * step(vW.y, vH - 2.2);
          float lit = step(0.52, hash(id + floor(vW.xz * 0.013) * 7.0));
          vec3 glass = vec3(0.10, 0.14, 0.22) + sunCol * 0.18 + ambSky * 0.12;
          col = mix(col, glass, win * 0.75);
          col += win * lit * night * mix(vec3(1.0, 0.8, 0.5), vec3(0.6, 0.9, 1.0), hash(id + 3.1)) * 1.15;
          float band = smoothstep(vH - 1.7, vH - 1.4, vW.y) * (1.0 - smoothstep(vH - 0.9, vH - 0.6, vW.y));
          col = mix(col, vNeon * (0.55 + night * 1.5), band * (0.25 + night * 0.75));
          // ground-floor shop glow
          float shop = (1.0 - step(2.6, vW.y)) * step(0.6, vW.y) * step(0.1, f.x) * step(f.x, 0.9);
          col = mix(col, vNeon * 0.25 + vec3(0.9, 0.85, 0.7) * 0.35, shop * (0.3 + night * 0.6));
        } else col *= 0.92;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const bMesh = new THREE.InstancedMesh(bGeo, bMat, w.buildings.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v3 = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  const col = new THREE.Color();
  const caps: { x: number; z: number; sx: number; sz: number; y: number; h: number; neon: number }[] = [];
  w.buildings.forEach((b, i) => {
    m4.compose(v3.set((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2), q.identity(), s3.set(b.x1 - b.x0, b.h, b.z1 - b.z0));
    bMesh.setMatrixAt(i, m4);
    bMesh.setColorAt(i, col.setHex(b.color));
    const nc = new THREE.Color(b.neon);
    neonAttr.set([nc.r, nc.g, nc.b], i * 3);
    if (b.deco || b.h > 90) caps.push({ x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, sx: (b.x1 - b.x0) * (b.deco ? 0.35 : 0.5), sz: (b.z1 - b.z0) * (b.deco ? 0.35 : 0.5), y: b.h, h: b.deco ? 4 + (i % 3) * 2 : 8 + (i % 4) * 4, neon: b.neon });
  });
  bGeo.setAttribute("neon", new THREE.InstancedBufferAttribute(neonAttr, 3));
  scene.add(bMesh);
  // rooftop spires / art-deco crowns that glow at night
  const capMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
  const capMesh = new THREE.InstancedMesh(bGeo, capMat, Math.max(1, caps.length));
  caps.forEach((c, i) => {
    m4.compose(v3.set(c.x, c.y, c.z), q.identity(), s3.set(c.sx, c.h, c.sz));
    capMesh.setMatrixAt(i, m4);
    capMesh.setColorAt(i, col.setHex(c.neon));
  });
  capMesh.count = caps.length;
  scene.add(capMesh);

  // ── palms
  const trunkG = new THREE.CylinderGeometry(0.28, 0.5, 1, 6);
  trunkG.translate(0, 0.5, 0);
  const trunk = new THREE.InstancedMesh(trunkG, new THREE.MeshLambertMaterial({ color: 0x8a6440 }), w.palms.length);
  const fronds: Any[] = [];
  for (let k = 0; k < 7; k++) {
    const f = new THREE.ConeGeometry(0.9, 6.5, 4, 1);
    f.scale(1, 1, 0.25);
    f.rotateZ(Math.PI / 2 + 0.55);
    f.translate(3, -0.9, 0);
    f.rotateY((k / 7) * Math.PI * 2);
    fronds.push(paint(THREE, f, k % 2 ? 0x2fae5a : 0x3fcf6a));
  }
  const leavesG = merge(THREE, fronds);
  const leaves = new THREE.InstancedMesh(leavesG, new THREE.MeshLambertMaterial({ vertexColors: true }), w.palms.length);
  const e3 = new THREE.Euler();
  w.palms.forEach((p, i) => {
    q.setFromEuler(e3.set(0, p.rot, p.lean));
    m4.compose(v3.set(p.x, 0, p.z), q, s3.set(1, p.h, 1));
    trunk.setMatrixAt(i, m4);
    const top = new THREE.Vector3(0, p.h, 0).applyQuaternion(q);
    m4.compose(v3.set(p.x + top.x, top.y, p.z + top.z), new THREE.Quaternion().setFromEuler(e3.set(0, p.rot, 0)), s3.set(1, 1, 1));
    leaves.setMatrixAt(i, m4);
  });
  scene.add(trunk, leaves);

  // ── decor: umbrellas, lifeguard towers, boats, lighthouse
  const umbr = w.decor.filter((d) => d.kind === "umbrella");
  const umbTop = new THREE.InstancedMesh(new THREE.ConeGeometry(2.2, 0.9, 8).translate(0, 3, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), umbr.length);
  const umbPole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 4).translate(0, 1.5, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), umbr.length);
  umbr.forEach((d, i) => {
    m4.compose(v3.set(d.x, -0.15, d.z), q.setFromEuler(e3.set(0.08, d.rot, 0)), s3.set(1, 1, 1));
    umbTop.setMatrixAt(i, m4);
    umbTop.setColorAt(i, col.setHex(d.color));
    umbPole.setMatrixAt(i, m4);
  });
  scene.add(umbTop, umbPole);
  const towerG = merge(THREE, [
    paint(THREE, new THREE.BoxGeometry(3, 2.2, 3).translate(0, 4.2, 0), 0xffe1ec),
    paint(THREE, new THREE.ConeGeometry(2.6, 1.2, 4).rotateY(Math.PI / 4).translate(0, 5.9, 0), 0xff5a8a),
    paint(THREE, new THREE.BoxGeometry(0.3, 3.2, 0.3).translate(-1.2, 1.6, -1.2), 0xffffff),
    paint(THREE, new THREE.BoxGeometry(0.3, 3.2, 0.3).translate(1.2, 1.6, -1.2), 0xffffff),
    paint(THREE, new THREE.BoxGeometry(0.3, 3.2, 0.3).translate(-1.2, 1.6, 1.2), 0xffffff),
    paint(THREE, new THREE.BoxGeometry(0.3, 3.2, 0.3).translate(1.2, 1.6, 1.2), 0xffffff),
  ]);
  for (const d of w.decor.filter((x) => x.kind === "tower")) {
    const m = new THREE.Mesh(towerG, new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.position.set(d.x, -0.15, d.z);
    scene.add(m);
  }
  const boats = w.decor.filter((d) => d.kind === "boat");
  const boatG = merge(THREE, [
    paint(THREE, new THREE.BoxGeometry(3, 1.2, 9).translate(0, 0.3, 0), 0xffffff),
    paint(THREE, new THREE.ConeGeometry(1.5, 3, 4).rotateX(-Math.PI / 2).rotateZ(Math.PI / 4).scale(1, 0.55, 1).translate(0, 0.35, -5.8), 0xffffff),
    paint(THREE, new THREE.BoxGeometry(2.2, 1.3, 3).translate(0, 1.5, 0.8), 0x1d2b44),
  ]);
  const boatMesh = new THREE.InstancedMesh(boatG, new THREE.MeshLambertMaterial({ vertexColors: true }), Math.max(1, boats.length));
  scene.add(boatMesh);
  const lh = w.decor.find((d) => d.kind === "lighthouse");
  let beam: Any = null;
  if (lh) {
    const g = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.6, 22, 12), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    tower.position.y = 11;
    const band1 = new THREE.Mesh(new THREE.CylinderGeometry(2.05, 2.25, 3, 12), new THREE.MeshLambertMaterial({ color: 0xff3b5c }));
    band1.position.y = 8;
    const band2 = band1.clone();
    band2.position.y = 16;
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.4, 10), new THREE.MeshBasicMaterial({ color: 0xfff3a0 }));
    lamp.position.y = 23.2;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2, 2, 10), new THREE.MeshLambertMaterial({ color: 0xff3b5c }));
    roof.position.y = 25.4;
    beam = new THREE.Mesh(
      new THREE.ConeGeometry(14, 220, 16, 1, true).rotateZ(Math.PI / 2).translate(110, 0, 0),
      new THREE.MeshBasicMaterial({ color: 0xfff6c0, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
    );
    beam.position.y = 23.2;
    g.add(tower, band1, band2, lamp, roof, beam);
    g.position.set(lh.x, 0, lh.z);
    scene.add(g);
  }

  // ── street lights (pole + bulb) and their glow pools at night
  const lamps: { x: number; z: number }[] = [];
  for (const l of w.lines) {
    if (l.bridge) continue;
    const c = (l.at + 1) * T;
    for (let p = l.from * T + 15; p < (l.to + 1) * T; p += 30) {
      const off = T + 0.6;
      lamps.push(l.axis === "v" ? { x: c + off, z: p } : { x: p, z: c + off });
      lamps.push(l.axis === "v" ? { x: c - off, z: p + 15 } : { x: p + 15, z: c - off });
    }
  }
  const lampN = Math.min(lamps.length, opts.mobile ? 500 : 1400);
  const poleM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 5).translate(0, 3.5, 0), new THREE.MeshLambertMaterial({ color: 0x3c3a48 }), lampN);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe6a8 });
  const bulbM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.45, 6, 4).translate(0, 7.1, 0), bulbMat, lampN);
  const glowTex = (() => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const g = cv.getContext("2d")!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.4, "rgba(255,255,255,.35)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const poolMat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffc88a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const poolM = new THREE.InstancedMesh(new THREE.PlaneGeometry(16, 16).rotateX(-Math.PI / 2).translate(0, 0.06, 0), poolMat, lampN);
  for (let i = 0; i < lampN; i++) {
    const p = lamps[Math.floor((i * lamps.length) / lampN)];
    m4.makeTranslation(p.x, 0, p.z);
    poleM.setMatrixAt(i, m4);
    bulbM.setMatrixAt(i, m4);
    poolM.setMatrixAt(i, m4);
  }
  scene.add(poleM, bulbM, poolM);

  // ── stunt ramps
  for (const r of w.ramps) {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(r.len, 0);
    s.lineTo(r.len, r.h);
    s.lineTo(0, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: r.w, bevelEnabled: false });
    g.translate(0, 0, -r.w / 2);
    g.rotateY(Math.PI / 2); // length now along -Z
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0xff8a00 }));
    m.position.set(r.x, -0.1, r.z);
    m.rotation.y = -r.dir;
    // stripes
    const st = new THREE.Mesh(new THREE.PlaneGeometry(r.w, 1.2), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    st.rotation.x = -Math.PI / 2 + Math.atan2(r.h, r.len);
    st.position.set(0, r.h * 0.5 + 0.05, -r.len * 0.5);
    m.add(st);
    scene.add(m);
  }

  // ── collectible tapes (spinning cassettes + light beams)
  const tapeG = merge(THREE, [
    paint(THREE, new THREE.BoxGeometry(3.2, 2, 0.5), 0x1b1b24),
    paint(THREE, new THREE.BoxGeometry(2.6, 0.8, 0.55).translate(0, 0.35, 0), 0xff2bd6),
    paint(THREE, new THREE.CylinderGeometry(0.32, 0.32, 0.6, 10).rotateX(Math.PI / 2).translate(-0.7, -0.25, 0), 0xffffff),
    paint(THREE, new THREE.CylinderGeometry(0.32, 0.32, 0.6, 10).rotateX(Math.PI / 2).translate(0.7, -0.25, 0), 0xffffff),
  ]);
  const tapeMesh = new THREE.InstancedMesh(tapeG, new THREE.MeshBasicMaterial({ vertexColors: true }), w.tapes.length);
  const beamMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1.1, 1.1, 60, 8, 1, true).translate(0, 30, 0),
    new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
    w.tapes.length,
  );
  scene.add(tapeMesh, beamMesh);

  // ── checkpoint ring
  const ring = new THREE.Group();
  const torus = new THREE.Mesh(new THREE.TorusGeometry(9, 0.7, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffd400, fog: false }));
  torus.position.y = 9;
  const cpBeam = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 3, 140, 12, 1, true).translate(0, 70, 0),
    new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
  );
  ring.add(torus, cpBeam);
  ring.visible = false;
  scene.add(ring);

  // ── player car: wedge sports car extruded from a side profile
  const car = new THREE.Group();
  const prof = new THREE.Shape();
  // side profile (x = length forward…back, y = height)
  prof.moveTo(-2.3, 0.35);
  prof.lineTo(2.35, 0.35);
  prof.lineTo(2.35, 0.95);
  prof.lineTo(1.0, 1.1);
  prof.lineTo(0.15, 1.55);
  prof.lineTo(-1.1, 1.55);
  prof.lineTo(-1.9, 1.15);
  prof.lineTo(-2.3, 1.05);
  prof.lineTo(-2.3, 0.35);
  const bodyG = new THREE.ExtrudeGeometry(prof, { depth: 2.0, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 1 });
  bodyG.translate(0, 0, -1.0);
  bodyG.rotateY(Math.PI / 2); // forward = -Z
  const paintMat = new THREE.MeshLambertMaterial({ color: 0xff2bd6 });
  const body = new THREE.Mesh(bodyG, paintMat);
  const glassM = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.38, 1.5), new THREE.MeshLambertMaterial({ color: 0x141a2c }));
  glassM.position.set(0, 1.32, 0.35);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.09, 4.4), new THREE.MeshBasicMaterial({ color: 0x00e5ff }));
  stripe.position.set(0, 0.8, 0);
  const lightsMat = new THREE.MeshBasicMaterial({ color: 0xfff6d0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff1744 });
  const hl1 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.08), lightsMat);
  hl1.position.set(-0.65, 0.82, -2.42);
  const hl2 = hl1.clone();
  hl2.position.x = 0.65;
  const tl = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.16, 0.08), tailMat);
  tl.position.set(0, 0.9, 2.4);
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.5), paintMat);
  spoiler.position.set(0, 1.35, 2.1);
  const wheelG = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12).rotateZ(Math.PI / 2);
  const wheelM = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheels: Any[] = [];
  for (const [x, z] of [
    [-0.98, -1.45],
    [0.98, -1.45],
    [-0.98, 1.5],
    [0.98, 1.5],
  ]) {
    const wh = new THREE.Mesh(wheelG, wheelM);
    wh.position.set(x, 0.42, z);
    wheels.push(wh);
  }
  const under = new THREE.Mesh(
    new THREE.PlaneGeometry(4.5, 7).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: glowTex, color: 0xff2bd6, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
  );
  under.position.y = 0.08;
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
  shadow.position.y = 0.05;
  const headPool = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 18).rotateX(-Math.PI / 2).translate(0, 0.07, -11),
    new THREE.MeshBasicMaterial({ map: glowTex, color: 0xfff1c0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
  );
  const carBody = new THREE.Group();
  carBody.add(body, glassM, stripe, hl1, hl2, tl, spoiler, ...wheels);
  car.add(carBody, under, headPool);
  scene.add(car, shadow);

  // ── traffic (instanced)
  const trafficN = opts.mobile ? 34 : 70;
  const tBody = new THREE.InstancedMesh(new THREE.BoxGeometry(2.1, 0.9, 4.4).translate(0, 0.85, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), trafficN);
  const tTop = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.7, 2.2).translate(0, 1.6, 0.3), new THREE.MeshLambertMaterial({ color: 0x1a2030 }), trafficN);
  const tLights = new THREE.InstancedMesh(new THREE.BoxGeometry(1.9, 0.2, 0.1).translate(0, 0.95, 2.22), new THREE.MeshBasicMaterial({ color: 0xff2a3a }), trafficN);
  const tWheels = new THREE.InstancedMesh(
    merge(THREE, [
      new THREE.CylinderGeometry(0.4, 0.4, 2.2, 8).rotateZ(Math.PI / 2).translate(0, 0.4, -1.4),
      new THREE.CylinderGeometry(0.4, 0.4, 2.2, 8).rotateZ(Math.PI / 2).translate(0, 0.4, 1.4),
    ]),
    new THREE.MeshLambertMaterial({ color: 0x111111 }),
    trafficN,
  );
  const tColors = [0xffffff, 0xff4d6d, 0x00c2ff, 0xffd400, 0x2bd67b, 0xb388ff, 0xff8a00, 0x222222, 0xe0e0e8];
  for (let i = 0; i < trafficN; i++) tBody.setColorAt(i, col.setHex(tColors[i % tColors.length]));
  scene.add(tBody, tTop, tLights, tWheels);

  return {
    scene,
    U,
    sky,
    sun,
    hemi,
    water,
    car,
    carBody,
    wheels,
    under,
    shadow,
    headPool,
    paintMat,
    bulbMat,
    poolMat,
    capMat,
    beam,
    tapeMesh,
    beamMesh,
    ring,
    torus,
    boats,
    boatMesh,
    traffic: { n: trafficN, body: tBody, top: tTop, lights: tLights, wheels: tWheels },
    tmp: { m4, q, v3, s3, e3 },
  };
}

/** apply the time-of-day palette to all uniforms and lights */
export function applyTime(THREE: Any, b: Built, t: number) {
  const p = palette(t);
  const set = (c: Any, a: number[]) => c.setRGB(a[0], a[1], a[2], THREE.SRGBColorSpace);
  set(b.U.skyTop.value, p.top);
  set(b.U.skyHor.value, p.hor);
  set(b.U.skyBot.value, p.bot);
  set(b.U.sunCol.value, p.sun);
  set(b.U.ambSky.value, p.amb);
  set(b.U.ambGround.value, p.gnd);
  set(b.U.water.value, p.water);
  b.U.sunDir.value.set(p.sunDir[0], p.sunDir[1], p.sunDir[2]).normalize();
  b.U.night.value = p.night;
  set(b.scene.fog.color, p.fog);
  b.sun.color.copy(b.U.sunCol.value);
  b.sun.intensity = 0.25 + Math.max(0, p.elev) * 1.6;
  b.sun.position.copy(b.U.sunDir.value).multiplyScalar(500);
  b.hemi.color.copy(b.U.ambSky.value);
  b.hemi.groundColor.copy(b.U.ambGround.value);
  b.hemi.intensity = 0.7 + Math.max(0, p.elev) * 0.6;
  b.poolMat.opacity = p.night * 0.55;
  b.bulbMat.color.setHSL(0.11, 1, 0.55 + p.night * 0.35);
  b.headPool.material.opacity = p.night * 0.55;
  b.under.material.opacity = 0.15 + p.night * 0.55;
  if (b.beam) b.beam.material.opacity = 0.05 + p.night * 0.16;
  return p;
}
