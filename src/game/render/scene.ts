/**
 * The three.js stage: scene, camera and key lights.
 *
 * Two rules live here and nowhere else:
 *  - `scene.fog` is null. Fog happens once, in the composite (ART_BIBLE A2).
 *  - lighting is `MeshLambertMaterial` + `flatShading`. The key light casts a real-time shadow map
 *    that `focusShadow` keeps centred on the player. The 3-band light ramp was tried and rejected
 *    (docs/LIGHT_RAMP.md); `lightRamp.ts` is used only by tools/artspike.
 *
 * Materials are authored in sRGB hex; `THREE.Color` converts them to the linear working
 * space that the beauty target stores (ART_BIBLE A1).
 *
 * The sky dome and the aurora are built in sky.ts and aurora.ts; time of day is applied by dusk.ts,
 * which is the only code that moves these lights after boot.
 */
import * as THREE from 'three';
import { CAMERA, DAY_LIGHT, SKY } from './pixelConfig';
import { createSkyDome, sunDirection, type SkyDome } from './sky';
import { AURORA_LAYER, createAurora, type Aurora } from './aurora';

export interface SceneKit {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  lights: THREE.DirectionalLight[];
  ambient: THREE.HemisphereLight;
  /** Live key-light direction; dusk lowers it, focusShadow places the light along it. */
  keyDir: THREE.Vector3;
  sky: SkyDome;
  aurora: Aurora;
}

/** 384x216, the only aspect the composite ever sees. */
const ASPECT = 16 / 9;

/** Low, slightly north-west winter sun. Shared by the sky glow and the key light. */
export const SUN_DIR = sunDirection(SKY.sunElevation);

/**
 * Move the sun's shadow frustum with the player. The key light is directional, so only its shadow
 * camera placement needs updating; the light direction itself is `kit.keyDir`.
 */
export function focusShadow(kit: SceneKit, x: number, z: number): void {
  const key = kit.lights[0];
  if (!key) return;
  const dir = kit.keyDir;
  key.target.position.set(x, 0, z);
  key.target.updateMatrixWorld();
  key.position.set(x + dir.x * 120, dir.y * 120, z + dir.z * 120);
  key.updateMatrixWorld();
}

export function createSceneKit(): SceneKit {
  const scene = new THREE.Scene();
  scene.fog = null;
  scene.background = new THREE.Color(SKY.zenith);
  const sky = createSkyDome();
  const aurora = createAurora();
  scene.add(sky.mesh, aurora.mesh);

  const camera = new THREE.PerspectiveCamera(CAMERA.fov, ASPECT, CAMERA.near, CAMERA.far);
  camera.position.set(0, 9, 30);
  // The aurora is on its own layer so the normal pass can leave it out (pixelPipeline.ts).
  camera.layers.enable(AURORA_LAYER);

  // Key: the low sun. It must dominate the cool ambient or the two cancel to neutral on blue-ish
  // snow, but not so far that sun-facing walls blow out; see SKY.sunElevation and DAY_LIGHT.
  // Cool sun, not amber. Measured: an amber key at this intensity renders snow as TAN, because a
  // warm light on a near-white surface reads as dirt rather than as sunlight. The reference keeps
  // its snow lavender-blue (satP50 0.574 on its frosty-peak frame) and gets warmth from lanterns,
  // windows and wood instead. So the key is cool and strong; warmth is supplied by props.
  const key = new THREE.DirectionalLight(DAY_LIGHT.key, DAY_LIGHT.keyIntensity);
  key.position.copy(SUN_DIR).multiplyScalar(120);
  key.name = 'key';
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  // A tight ortho frustum that follows the player. Covering the whole 1024-unit valley at this map
  // size would give 1 texel per world unit, which is far too coarse to ground a pine.
  const cam = key.shadow.camera;
  cam.left = -42;
  cam.right = 42;
  cam.top = 42;
  cam.bottom = -42;
  cam.near = 1;
  cam.far = 260;
  key.shadow.bias = -0.0012;
  key.shadow.normalBias = 0.04;
  scene.add(key.target);

  // Rim: cool sky bounce from behind the camera. With a low front sun the shapes are backlit, and
  // this is what stops pines reading as black holes in the snow (ART_BIBLE §3: no black).
  const rim = new THREE.DirectionalLight(DAY_LIGHT.rim, DAY_LIGHT.rimIntensity);
  rim.position.set(45, 30, 90);
  rim.name = 'rim';

  // ART_BIBLE §4: hemisphere ambient is what gives snow its blue bounce for free. Kept cool and
  // fairly strong: the shade side is the frame's main source of cool chroma (§2 cool band 30-55 %).
  // Ambient is deliberately weaker than the key (DAY_LIGHT) so shade reads as cool and distinct
  // rather than washing every surface toward grey. The ground term is deep blue-violet: bounce from
  // snow is blue, and that is the colour the reference puts in its shadows.
  const hemi = new THREE.HemisphereLight(DAY_LIGHT.ambientSky, DAY_LIGHT.ambientGround, DAY_LIGHT.ambientIntensity);
  hemi.name = 'ambient';

  scene.add(key, rim, hemi);
  return { scene, camera, lights: [key, rim], ambient: hemi, keyDir: SUN_DIR.clone(), sky, aurora };
}
