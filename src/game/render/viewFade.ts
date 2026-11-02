/**
 * See Pip through whatever stands in front of the bird, and keep the lens clear of what it stands in.
 *
 * The props are batched into one InstancedMesh per kind, so there is no per-tree material to turn
 * transparent, and real alpha blending would need sorting. Instead fragments are discarded in the
 * shader, which writes depth exactly as before: no sorting, no draw-call changes.
 *
 * The rule is faces, never regions. The earlier versions cut a region round the sightline, first a
 * soft corridor of speckle, then a dithered porthole; under a pine that read as a round hole punched
 * in the foliage round Pip, with stripes through the trunk at its rim. The director's word: only the
 * faces that overlap Pip may go. So each triangle is judged whole, in the vertex shader, from its
 * three corners (an attribute added to the geometry on first draw):
 *  - it covers Pip: its outline on screen overlaps Pip's on-screen box, and its plane crosses the
 *    sightline to Pip in front of the bird. Such a face is not drawn; every other face stays solid,
 *    even right beside Pip, except a sliver (a face seen edge-on, a few pixels wide) right beside the
 *    gap, which alone would stand in it like a stray pole;
 *  - it touches the lens: a corner nearer the camera than NEAR. A face brushing the lens would be
 *    a sheet over the whole screen; it goes whole too;
 *  - its object is one the camera stands in (camera/lensClear.ts names up to CLEAR objects by where
 *    they stand: a pine whose canopy holds the lens, the mast's legs). Every face of it stipples out
 *    over a moment, so a tree the lens passes through is simply not there, rather than cut in pieces.
 * All of it is off while the camera is at Pip's eye (the photo viewfinder): nothing stands between.
 * A glow hung on a cut prop goes with it (prepareViewFade). The shader text is viewFadeGlsl.ts.
 */

import * as THREE from 'three';

import { CLEAR, EYE, FRAG_BODY, FRAG_PROLOGUE, GLOW_BODY, GLOW_PROLOGUE, PIP_HEIGHT, PIP_RADIUS, VERT_BODY, VERT_PROLOGUE } from './viewFadeGlsl';

export { CLEAR };

const shared = {
  uView: { value: new THREE.Vector3() },
  uTarget: { value: new THREE.Vector3() },
  /** Pip's box on screen in NDC (min x, min y, max x, max y); empty (min > max) when off. */
  uPipRect: { value: new THREE.Vector4(1, 1, -1, -1) },
  uOn: { value: 1 },
  uClear: { value: Array.from({ length: CLEAR }, () => new THREE.Vector4()) },
};

const CORNERS = ['fadeA', 'fadeB', 'fadeC'] as const;

/** Each vertex carries its triangle's three corners, so the vertex shader can judge the face whole. */
function cornersOf(geometry: THREE.BufferGeometry): THREE.BufferAttribute[] | null {
  const pos = geometry.getAttribute('position');
  if (!pos || geometry.index) return null;
  const n = pos.count;
  const corner = [new Float32Array(n * 3), new Float32Array(n * 3), new Float32Array(n * 3)];
  for (let t = 0; t + 2 < n; t += 3) {
    for (let k = 0; k < 3; k++) {
      const x = pos.getX(t + k), y = pos.getY(t + k), z = pos.getZ(t + k);
      for (let v = 0; v < 3; v++) corner[k].set([x, y, z], (t + v) * 3);
    }
  }
  return corner.map((c) => new THREE.BufferAttribute(c, 3));
}

/**
 * The corners are made on a geometry's first draw, which is one step too late for three: it uploads
 * attributes before the draw and caches which ones it bound during it, so attributes added then would
 * stay unbound for good. So they arrive over three draws: added (uploaded on the next), taken off
 * (the cache lets go of them), put back (bound). Until then the shader sees equal corners and cuts
 * nothing, which is the safe way round.
 */
const arriving = new WeakMap<THREE.BufferGeometry, { list: THREE.BufferAttribute[]; step: number; frame: number }>();
function bringCorners(geometry: THREE.BufferGeometry, frame: number): void {
  const st = arriving.get(geometry);
  if (!st) {
    if (geometry.getAttribute('fadeA')) return;
    const list = cornersOf(geometry);
    if (!list) return;
    CORNERS.forEach((name, i) => geometry.setAttribute(name, list[i]));
    arriving.set(geometry, { list, step: 1, frame });
    return;
  }
  if (st.step > 2 || st.frame === frame) return;
  if (st.step === 1) for (const name of CORNERS) geometry.deleteAttribute(name);
  else CORNERS.forEach((name, i) => geometry.setAttribute(name, st.list[i]));
  st.step++;
  st.frame = frame;
}

/** The materials patched with their own corners: their meshes are the ones `prepareViewFade` readies. */
const patched = new WeakSet<THREE.Material>();

/**
 * Give every patched mesh under `root` its corners now, before its first draw. The three-draw dance
 * above did not always take: the hamlet's houses rose over Pip with every face still drawn, the bird
 * a pale outline through the roof (critic: "Pip hidden behind a house"), and deleting and re-adding the
 * corners by hand cut the roof open at once. Corners present from the start are bound by every program
 * from the first draw, so the world is readied when it is built; the dance stays for meshes added later.
 */
export function prepareViewFade(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const geometry = mesh.geometry;
    if (!mats.some((m) => patched.has(m)) || geometry.getAttribute('fadeA') || arriving.has(geometry)) return;
    const list = cornersOf(geometry);
    if (list) CORNERS.forEach((name, i) => geometry.setAttribute(name, list[i]));
  });
  // The glows hung on cut props (a lit lamp's halo and far glint, the mast's beacon) go with them. A
  // glow beside props that never cut (a feather's glint, Pip's own lantern) is left alone.
  root.traverse((o) => {
    const sprite = o as THREE.Sprite;
    if (!sprite.isSprite || !o.parent || fadingGlows.has(sprite.material)) return;
    const withProp = [o.parent, ...o.parent.children].some((p) => {
      const m = (p as THREE.Mesh).isMesh ? (p as THREE.Mesh).material : null;
      return m !== null && (Array.isArray(m) ? m : [m]).some((x) => patched.has(x));
    });
    if (withProp) fadeGlow(sprite.material);
  });
}

const fadingGlows = new WeakSet<THREE.Material>();

/** Patch a glow's sprite material on top of whatever it already does (the far glint's depth clamp). */
function fadeGlow(material: THREE.SpriteMaterial): void {
  fadingGlows.add(material);
  const before = material.onBeforeCompile.bind(material);
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    Object.assign(shader.uniforms, shared);
    shader.vertexShader = GLOW_PROLOGUE + shader.vertexShader.replace('#include <logdepthbuf_vertex>', GLOW_BODY);
    shader.fragmentShader = FRAG_PROLOGUE + shader.fragmentShader.replace('void main() {', FRAG_BODY);
  };
  material.customProgramCacheKey = () => `view-fade-glow|${key}`;
  material.needsUpdate = true;
}

/**
 * Patch one material in place. Safe to call on every prop material: they share a program cache key, so
 * this compiles once per material kind and every prop batch uses it.
 *
 * The pixel pipeline's normal pass draws everything with one override material, and its edges are
 * found in that picture: unpatched, it still held the faces cut here and outlined the gap they left.
 * It is patched with `ownCorners` false, so it cuts exactly what the props' own materials cut (only a
 * geometry that has corners can be cut) and never gives corners to the terrain or the bird.
 */
export function installViewFade(material: THREE.Material, ownCorners = true): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared);
    shader.vertexShader = VERT_PROLOGUE + shader.vertexShader.replace('#include <begin_vertex>', VERT_BODY);
    shader.fragmentShader = FRAG_PROLOGUE + shader.fragmentShader.replace('void main() {', FRAG_BODY);
  };
  if (ownCorners) {
    patched.add(material);
    material.onBeforeRender = (renderer, _s, _c, geometry) => bringCorners(geometry, renderer.info.render.frame);
  }
  // Without this the patched and unpatched materials can share a compiled program, and whichever
  // compiled first silently wins — the same class of bug that made a water patch vanish.
  material.customProgramCacheKey = () => 'view-fade-v3';
}

const corner = new THREE.Vector3();

/** Aim the test at the current camera/player pair. Call once per frame, after the camera is placed. */
export function updateViewFade(camera: THREE.Camera, target: { x: number; y: number; z: number }): void {
  shared.uView.value.copy(camera.position);
  shared.uTarget.value.set(target.x, target.y, target.z);
  const rect = shared.uPipRect.value.set(1, 1, -1, -1);
  if (camera.position.distanceTo(corner.set(target.x, target.y + PIP_HEIGHT * 0.5, target.z)) <= EYE) return;
  camera.updateMatrixWorld();
  rect.set(Infinity, Infinity, -Infinity, -Infinity);
  // Pip's body as a box, its eight corners on screen.
  for (let i = 0; i < 8; i++) {
    corner.set(
      target.x + (i & 1 ? PIP_RADIUS : -PIP_RADIUS),
      target.y + (i & 2 ? PIP_HEIGHT : 0),
      target.z + (i & 4 ? PIP_RADIUS : -PIP_RADIUS),
    ).project(camera);
    rect.set(Math.min(rect.x, corner.x), Math.min(rect.y, corner.y), Math.max(rect.z, corner.x), Math.max(rect.w, corner.y));
  }
}

/** The objects to take away whole: where each stands and how far gone (0..1). At most CLEAR. */
export function setLensClear(items: readonly { x: number; z: number; weight: number }[]): void {
  const slots = shared.uClear.value;
  for (let i = 0; i < CLEAR; i++) {
    const it = items[i];
    slots[i].set(it?.x ?? 0, it?.z ?? 0, it?.weight ?? 0, 0);
  }
}

/** Off for captures that need the world untouched. */
export function setViewFadeEnabled(on: boolean): void {
  shared.uOn.value = on ? 1 : 0;
}
