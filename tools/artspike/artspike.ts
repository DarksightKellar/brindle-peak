/**
 * Art spike — a self-contained slice of the winter look, built ONLY from the render modules plus raw
 * three primitives, so the pipeline can be measured before the world modules land. It is also the
 * QA seam: `window.__artspike` drives four fixed poses, sets size/look/weather, and reads the
 * canvas back as raw RGBA so the frame instrument can assert ART_BIBLE §2.
 */
import * as THREE from 'three';
import { PALETTE } from '../../src/core/palette';
import { createPixelPipeline, type LookOverride, type PixelPipeline } from '../../src/game/render/pixelPipeline';
import { createSceneKit, type SceneKit } from '../../src/game/render/scene';
import { applyLightRamp } from '../../src/game/render/lightRamp';
import { createSnowfall, type Snowfall } from '../../src/game/render/weather';

export interface ArtMetrics {
  /** RGBA, 8 bit, row 0 = top of frame. */
  rgba: Uint8Array;
  width: number;
  height: number;
}

export interface ArtSpike {
  setPose(i: number): void;
  setPixelSize(n: number): void;
  setLook(look: LookOverride): void;
  setSnow(on: boolean): void;
  setWeatherTime(seconds: number): void;   // deterministic clock: pose + time reproduce a frame
  getMetrics(): ArtMetrics;
}

type Pose = { pos: [number, number, number]; look: [number, number, number] };
const POSES: Pose[] = [
  { pos: [0, 8.5, 34], look: [2.0, 4.6, -12] },
  { pos: [3.2, 4.2, 12.5], look: [7.6, 2.9, 2.6] },
  { pos: [14, 6.5, 8], look: [2, 7.0, -40] },
  { pos: [-9, 11.5, 26], look: [4, 6.0, -18] },
];

/** One low-frequency surface shared by the ground mesh and every prop's footing. */
function groundHeight(x: number, z: number): number {
  return Math.sin(x * 0.135) * 0.55 + Math.cos(z * 0.11) * 0.7
    + Math.sin((x + z) * 0.052) * 1.25 + Math.max(0, -z - 18) * 0.06;
}

function lambert(hex: string, opts: THREE.MeshLambertMaterialParameters = {}): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ color: hex, flatShading: true, ...opts });
  applyLightRamp(m);
  return m;
}

function buildGround(): THREE.Mesh {
  const size = 300;
  const geo = new THREE.PlaneGeometry(size, size, 84, 84);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const colours = new Float32Array(pos.count * 3);
  const mid = new THREE.Color(PALETTE.SNOW_MID), deep = new THREE.Color(PALETTE.SNOW_DEEP);
  const hi = new THREE.Color(PALETTE.SNOW_LT), c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = groundHeight(x, z);
    pos.setY(i, h);
    // Vertex colours: hollows deep blue, crests near-white. Cheaper and punchier than texture.
    const t = THREE.MathUtils.clamp((h + 1.4) / 3.2, 0, 1);
    c.copy(deep).lerp(mid, THREE.MathUtils.clamp(t * 2.2, 0, 1)).lerp(hi, Math.pow(t, 4.0) * 0.45);
    colours[i * 3] = c.r;
    colours[i * 3 + 1] = c.g;
    colours[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, lambert('#FFFFFF', { vertexColors: true }));
  mesh.name = 'ground';
  return mesh;
}

function buildPine(x: number, z: number, scale: number, tint: string): THREE.Group {
  const group = new THREE.Group();
  const material = lambert(tint);
  const y = groundHeight(x, z);
  const tiers = [
    { r: 1.15, h: 2.1, y: 1.35 }, { r: 0.85, h: 1.8, y: 2.75 }, { r: 0.52, h: 1.5, y: 4.05 },
  ];
  for (const t of tiers) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(t.r, t.h, 7), material);
    cone.position.set(0, t.y, 0);
    group.add(cone);
  }
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.1, 5), lambert(PALETTE.BARK));
  trunk.position.y = 0.55;
  group.add(trunk);
  group.position.set(x, y, z);
  group.scale.setScalar(scale);
  group.rotation.y = (x * 1.7 + z) % Math.PI;
  return group;
}

function buildRock(x: number, z: number, scale: number, spin: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), lambert(PALETTE.ROCK_MID));
  mesh.position.set(x, groundHeight(x, z) + scale * 0.45, z);
  mesh.scale.set(scale * 1.35, scale * 0.8, scale);
  mesh.rotation.set(spin * 0.7, spin, spin * 0.3);
  return mesh;
}

function buildCabin(x: number, z: number): THREE.Group {
  const group = new THREE.Group();
  const y = groundHeight(x, z);

  const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.6, 3.2), lambert(PALETTE.WOOD_LT));
  body.position.y = 1.3;
  group.add(body);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.7, 4), lambert(PALETTE.WOOD_MID));
  roof.position.y = 3.45;
  roof.rotation.y = Math.PI / 4;
  group.add(roof);

  const snowCap = new THREE.Mesh(new THREE.ConeGeometry(3.55, 1.1, 4), lambert(PALETTE.SNOW_LT));
  snowCap.position.y = 3.85;
  snowCap.rotation.y = Math.PI / 4;
  group.add(snowCap);

  // The emissive window: unlit, full LANTERN, and exempt from the normal pass (A3).
  const glass = new THREE.MeshBasicMaterial({ color: PALETTE.LANTERN });
  glass.allowOverride = false; // emissive: must not become an opaque normal-pass quad (A3)
  for (const wx of [-1.0, 0.85]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.7, 0.12), glass);
    win.position.set(wx, 1.5, 1.65);
    win.name = 'window';
    group.add(win);
  }

  const spill = new THREE.PointLight(PALETTE.LANTERN, 9, 16, 2);
  spill.position.set(0, 1.7, 2.2);
  group.add(spill);

  group.position.set(x, y, z);
  group.rotation.y = -0.35;
  return group;
}

function buildRidge(): THREE.Group {
  const group = new THREE.Group();
  const peaks = [
    { x: -52, z: -118, r: 58, h: 34 }, { x: 6, z: -128, r: 72, h: 44 }, { x: 62, z: -112, r: 52, h: 30 },
  ];
  for (const p of peaks) {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(p.r, p.h, 6), lambert(PALETTE.SKY_LOW));
    mesh.position.set(p.x, p.h * 0.5 - 6, p.z);
    mesh.rotation.y = p.x * 0.01;
    group.add(mesh);
  }
  return group;
}

function buildDrifts(): THREE.Group {
  const group = new THREE.Group();
  const spots: [number, number, number][] = [[-6, 9, 1.9], [4.5, -3, 2.6], [-12, -2, 2.2], [10, 8, 1.5]];
  for (const [x, z, s] of spots) {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), lambert(PALETTE.SNOW_LT));
    mesh.position.set(x, groundHeight(x, z) + s * 0.18, z);
    mesh.scale.set(s * 1.6, s * 0.42, s);
    group.add(mesh);
  }
  return group;
}

function buildScene(): SceneKit {
  const kit = createSceneKit();
  kit.scene.add(buildGround(), buildRidge(), buildDrifts(), buildCabin(7.5, 2.5));

  const pines: [number, number, number, string][] = [
    [-9, 6, 1.5, PALETTE.PINE_MID], [-3.5, -1, 1.15, PALETTE.PINE_DK], [-13, -4, 1.7, PALETTE.PINE_MID],
    [2, -9, 1.3, PALETTE.PINE_MID], [12, -5, 1.05, PALETTE.PINE_DK], [-19, 2, 1.45, PALETTE.PINE_MID],
    [17.5, 6, 1.25, PALETTE.PINE_MID], [-5, 13, 1.1, PALETTE.PINE_DK],
    // Near foreground: dark silhouettes at the frame edge are what give the shot its depth, and
    // they are the only pixels dark enough to populate the p1 the benchmark measures.
    [-5.5, 25, 1.9, PALETTE.PINE_MID], [7.2, 27, 1.55, PALETTE.PINE_MID], [-11.5, 20, 1.5, PALETTE.PINE_DK],
  ];
  for (const [x, z, s, tint] of pines) kit.scene.add(buildPine(x, z, s, tint));

  kit.scene.add(buildRock(-4.5, 4, 1.5, 0.7));
  kit.scene.add(buildRock(9.5, 9, 1.1, 1.9));
  kit.scene.add(buildRock(-11, 9.5, 1.9, 2.6));

  return kit;
}

function readFrame(canvas: HTMLCanvasElement, pipeline: PixelPipeline): ArtMetrics {
  pipeline.render();
  const gl = canvas.getContext('webgl2');
  if (!gl) throw new Error('artspike: no WebGL2 context');
  const w = canvas.width, h = canvas.height;
  const raw = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);
  const rgba = new Uint8Array(w * h * 4);
  const row = w * 4; // readPixels is bottom-up; flip so row 0 is the top of the frame
  for (let y = 0; y < h; y++) rgba.set(raw.subarray((h - 1 - y) * row, (h - y) * row), y * row);
  return { rgba, width: w, height: h };
}

declare global {
  interface Window {
    __artspike?: ArtSpike;
  }
}
function boot(): void {
  const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('artspike: #stage missing');

  const kit = buildScene();
  const pipeline = createPixelPipeline(canvas, kit);
  let snow: Snowfall = createSnowfall();
  let pose = 0, wind = 0.9;
  pipeline.resize(window.innerWidth, window.innerHeight);

  function setPose(i: number): void {
    pose = Math.max(0, Math.min(POSES.length - 1, Math.round(i)));
    const p = POSES[pose] as Pose;
    kit.camera.position.set(p.pos[0], p.pos[1], p.pos[2]);
    kit.camera.lookAt(p.look[0], p.look[1], p.look[2]);
    // ARCHITECTURE §4: reproducible from pose + weather time, never from page uptime. The veil is
    // a pure function of that clock, so rewinding is enough — and it keeps the weather flag.
    snow.seek(0, wind);
  }
  setPose(0);

  window.addEventListener('resize', () => pipeline.resize(window.innerWidth, window.innerHeight));

  const timer = new THREE.Timer();
  timer.connect(document);
  function frame(): void {
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.05);
    wind = 0.9 + Math.sin(timer.getElapsed() * 0.3) * 0.5;
    pipeline.setSnow(snow.update(dt, wind));
    pipeline.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.__artspike = {
    setPose,
    setPixelSize: (n: number) => pipeline.setPixelSize(n),
    setLook: (look: LookOverride) => pipeline.setLook(look),
    setSnow: (on: boolean) => snow.setEnabled(on),
    setWeatherTime: (seconds: number) => pipeline.setSnow(snow.seek(seconds, wind)),
    getMetrics: (): ArtMetrics => readFrame(canvas, pipeline),
  };

  // Spike, not the game: release GPU buffers when the harness navigates away.
  window.addEventListener('beforeunload', () => { snow.dispose(); pipeline.dispose(); });
}

boot();
