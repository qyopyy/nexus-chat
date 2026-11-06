/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * High-quality Three.js renderer for Global Strike.
 * Extrudes the Dust2-inspired MAP into a lit 3D arena (original meshes — not Valve assets).
 * Mobile: lower DPR, no AA, lighter fog — same pattern as Sunset Bay.
 */

import { loadThree } from "../bay/scene";

// three.js is loaded dynamically from the CDN (same as Sunset Bay)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export type HqBotPose = {
  x: number;
  y: number;
  a: number;
  hp: number;
  team: "T" | "CT";
  alive: boolean;
  name?: string;
};

export type HqFrame = {
  player: { x: number; y: number; a: number };
  bots: HqBotPose[];
  bomb: { x: number; y: number; t: number } | null;
  flash: number;
  wep: string;
};

export type HqEngine = {
  ready: boolean;
  resize: (w: number, h: number) => void;
  frame: (f: HqFrame) => void;
  dispose: () => void;
};

const CELL = 2; // world units per map cell
const WALL_H = 2.6;
const EYE = 1.55;

export async function createHqEngine(
  canvas: HTMLCanvasElement,
  map: number[][],
  opts: { mobile?: boolean } = {},
): Promise<HqEngine> {
  const mobile = !!opts.mobile;
  const THREE = await loadThree();
  const MH = map.length;
  const MW = map[0]?.length ?? 0;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !mobile,
    powerPreference: "high-performance",
    alpha: false,
  });
  renderer.setClearColor(0x87a0b8, 1);
  renderer.setPixelRatio(Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, mobile ? 1.25 : 1.75));
  renderer.shadowMap.enabled = !mobile;
  if (renderer.shadowMap) renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x9eb6c9, mobile ? 0.045 : 0.028);

  const camera = new THREE.PerspectiveCamera(72, 1, 0.08, mobile ? 48 : 80);
  camera.rotation.order = "YXZ";

  // Lights
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x3d4a3a, mobile ? 0.85 : 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d6, mobile ? 0.7 : 1.05);
  sun.position.set(18, 28, 10);
  if (!mobile) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 60;
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
  }
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x88aadd, 0.25);
  fill.position.set(-12, 10, -8);
  scene.add(fill);

  // Floor + ceiling
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x5c584e, roughness: 0.92, metalness: 0.05 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x3a4550, roughness: 1, metalness: 0 });
  const siteAMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.85, metalness: 0.1, emissive: 0x4a0505, emissiveIntensity: 0.25 });
  const siteBMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.85, metalness: 0.1, emissive: 0x04103a, emissiveIntensity: 0.25 });
  const spawnTMat = new THREE.MeshStandardMaterial({ color: 0xa16207, roughness: 0.9 });
  const spawnCtMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.9 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x6b735c, roughness: 0.88, metalness: 0.08 });
  const wallTopMat = new THREE.MeshStandardMaterial({ color: 0x4a5240, roughness: 0.95 });

  const worldW = MW * CELL;
  const worldD = MH * CELL;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(worldW, worldD), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(worldW / 2, 0, worldD / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(worldW, worldD), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(worldW / 2, WALL_H, worldD / 2);
  scene.add(ceil);

  // Extrude walls + site markers
  const box = new THREE.BoxGeometry(CELL * 0.98, WALL_H, CELL * 0.98);
  const slab = new THREE.BoxGeometry(CELL * 0.95, 0.06, CELL * 0.95);
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      const c = map[y][x];
      const wx = x * CELL + CELL / 2;
      const wz = y * CELL + CELL / 2;
      if (c === 1) {
        const m = new THREE.Mesh(box, wallMat);
        m.position.set(wx, WALL_H / 2, wz);
        m.castShadow = !mobile;
        m.receiveShadow = true;
        scene.add(m);
        const top = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.98, 0.08, CELL * 0.98), wallTopMat);
        top.position.set(wx, WALL_H + 0.04, wz);
        scene.add(top);
      } else if (c === 2 || c === 3) {
        const m = new THREE.Mesh(slab, c === 2 ? siteAMat : siteBMat);
        m.position.set(wx, 0.04, wz);
        m.receiveShadow = true;
        scene.add(m);
      } else if (c === 4 || c === 5) {
        const m = new THREE.Mesh(slab, c === 4 ? spawnTMat : spawnCtMat);
        m.position.set(wx, 0.03, wz);
        scene.add(m);
      }
    }
  }

  // Bot pool
  const botPool: Any[] = [];
  const makeBot = (team: "T" | "CT") => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.28, 0.85, 4, mobile ? 6 : 10),
      new THREE.MeshStandardMaterial({ color: team === "T" ? 0xb45309 : 0x1d4ed8, roughness: 0.7, metalness: 0.15 }),
    );
    body.position.y = 0.95;
    body.castShadow = !mobile;
    g.add(body);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, mobile ? 8 : 12, mobile ? 8 : 12),
      new THREE.MeshStandardMaterial({ color: 0xfcd34d, roughness: 0.6 }),
    );
    head.position.y = 1.7;
    head.castShadow = !mobile;
    g.add(head);
    g.visible = false;
    scene.add(g);
    return g;
  };
  for (let i = 0; i < 16; i++) botPool.push(makeBot(i % 2 === 0 ? "T" : "CT"));

  // Bomb
  const bomb = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.22, 0.32),
    new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xfbbf24, emissiveIntensity: 0.4, metalness: 0.6, roughness: 0.4 }),
  );
  bomb.visible = false;
  scene.add(bomb);

  // Viewmodel (simple rifle)
  const gun = new THREE.Group();
  const stock = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.14, 0.55),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.4, roughness: 0.5 }),
  );
  stock.position.set(0.28, -0.28, -0.55);
  gun.add(stock);
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.035, 0.7, 8),
    new THREE.MeshStandardMaterial({ color: 0x4a4a4a, metalness: 0.7, roughness: 0.35 }),
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.28, -0.22, -0.95);
  gun.add(barrel);
  camera.add(gun);
  scene.add(camera);

  // Flash overlay via camera near-plane quad
  const flashGeo = new THREE.PlaneGeometry(2, 2);
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depth: false });
  const flashMesh = new THREE.Mesh(flashGeo, flashMat);
  flashMesh.position.z = -0.2;
  camera.add(flashMesh);

  const toWorld = (mx: number, my: number) => ({
    x: mx * CELL,
    z: my * CELL,
  });

  let disposed = false;

  return {
    ready: true,
    resize(w: number, h: number) {
      if (disposed || w < 1 || h < 1) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    frame(f: HqFrame) {
      if (disposed) return;
      const p = toWorld(f.player.x, f.player.y);
      camera.position.set(p.x, EYE, p.z);
      // Map angle: 0 = +X in 2D raycaster (cos/sin). Three yaw: -a + π so forward matches.
      camera.rotation.y = -f.player.a + Math.PI / 2;
      camera.rotation.x = 0;

      // Bots
      let bi = 0;
      for (const b of f.bots) {
        if (!b.alive) continue;
        const mesh = botPool[bi++];
        if (!mesh) break;
        const color = b.team === "T" ? 0xb45309 : 0x1d4ed8;
        (mesh.children[0] as Any).material.color.setHex(color);
        const wp = toWorld(b.x, b.y);
        mesh.position.set(wp.x, 0, wp.z);
        mesh.rotation.y = -b.a + Math.PI / 2;
        mesh.visible = true;
      }
      for (; bi < botPool.length; bi++) botPool[bi].visible = false;

      if (f.bomb) {
        const wp = toWorld(f.bomb.x, f.bomb.y);
        bomb.position.set(wp.x, 0.15, wp.z);
        bomb.visible = true;
        (bomb.material as Any).emissiveIntensity = f.bomb.t < 10 ? 1.2 : 0.45;
        (bomb.material as Any).emissive.setHex(f.bomb.t < 10 ? 0xef4444 : 0xfbbf24);
      } else {
        bomb.visible = false;
      }

      flashMat.opacity = Math.min(0.92, Math.max(0, f.flash));
      // Subtle gun bob
      const t = performance.now() * 0.001;
      gun.position.y = Math.sin(t * 6) * 0.004;
      gun.rotation.z = Math.sin(t * 3) * 0.01;

      renderer.render(scene, camera);
    },
    dispose() {
      disposed = true;
      renderer.dispose();
      box.dispose();
      slab.dispose();
      floorMat.dispose();
      ceilMat.dispose();
      wallMat.dispose();
      siteAMat.dispose();
      siteBMat.dispose();
    },
  };
}
