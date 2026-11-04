/**
 * Beauty (linear, HalfFloat + depth) + normal (flat MeshNormalMaterial override) -> ONE composite
 * pass: nearest fetch -> depth edge -> normal edge (x1.15 rim) -> capped exp2 haze -> linear->sRGB ->
 * grade -> distance fade -> snow veil, each exactly once (ART_BIBLE §1, A1, A2, A3). Edge maths transcribed from
 * three/addons/postprocessing/RenderPixelatedPass.js, window-depth constants rescaled to metres.
 */
import * as THREE from 'three';
import { PALETTE } from '../../core/palette';
import {
  CAMERA, DEFAULT_PIXEL_SIZE, EDGE, FOG, GRADE, INTERNAL_H, INTERNAL_W, SAT_TAPER, SKY, backingSize, renderSize,
} from './pixelConfig';
import type { SceneKit } from './scene';
import type { SnowVeil } from './weather';
import { AURORA_LAYER } from './aurora';
import { installViewFade } from './viewFade';

export interface LookOverride {
  saturation?: number;
  lift?: number;
  splitTonality?: number;
  fogDensity?: number;
  /** [luma where the highlight taper starts, where it ends, saturation there] (SAT_TAPER). */
  satTaper?: [number, number, number];
}

export interface PixelPipeline {
  render(): void;
  resize(w: number, h: number): void;
  setPixelSize(n: number): void;
  setSnow(veil: SnowVeil): void;
  /**
   * The composite's two fog colours: the near haze, and the far fade (the sky's horizon colour, so
   * distant hills melt into the sky). render/dusk.ts moves both between day and blue hour.
   */
  setFogColor(haze: THREE.Color, far: THREE.Color): void;
  /** Tuning seam for the measured grade sweep (tools/artspike/gradesweep.ts). */
  setLook(look: LookOverride): void;
  dispose(): void;
}

function makeTarget(w: number, h: number, withDepth: boolean): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    depthBuffer: true, stencilBuffer: false, samples: 0, generateMipmaps: false,
  });
  if (withDepth) target.depthTexture = new THREE.DepthTexture(w, h);
  return target;
}

import { FRAG, VERT } from './compositeShader';

export function createPixelPipeline(canvas: HTMLCanvasElement, kit: SceneKit): PixelPipeline {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: false, alpha: false,
    // The art harness reads frames back with readPixels; keeping the buffer keeps that deterministic.
    preserveDrawingBuffer: true, powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(1); // A4: the backing store is ours, never DPR-multiplied.

  /*
   * Dev seam: per-frame render cost. Headless runs use SwiftShader, so frame time here says nothing
   * about a real GPU — but draw calls, triangles and program count do, and they are the numbers that
   * decide whether this runs on a laptop at all. Same contract as `__ground` and `__ramp`: dev only.
   */
  if (import.meta.env.DEV) {
    // `info` resets itself on every render call, and one frame is several passes (shadow, beauty,
    // normals, composite). Hand the object over so a harness can set autoReset = false, reset, then
    // step one frame and read the sum across all passes.
    (window as unknown as { __renderInfo?: unknown }).__renderInfo = renderer.info;
  }

  // Shadows ON. ART_BIBLE §4 originally disabled them on the theory that at 384x216 they would read
  // as noise. Measured across all seven zones that was wrong: with no shadows every surface was lit
  // by ambient alone, giving p1 = 0.40-0.57 (reference band 0.16-0.36), contrast 0.05 and detail
  // density 0.0017 — a featureless whiteout. Hard shadows are used rather than soft ones because a
  // crisp 1-block shadow edge suits the pixel grid and costs one depth pass.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;

  let pixelSize = DEFAULT_PIXEL_SIZE;
  const beauty = makeTarget(INTERNAL_W, INTERNAL_H, true), normal = makeTarget(INTERNAL_W, INTERNAL_H, false);
  // Dev seam: the linear beauty target, so a harness can see what the lights put in before the grade.
  if (import.meta.env.DEV) (window as unknown as { __beauty?: unknown }).__beauty = { renderer, target: beauty };
  const normalMaterial = new THREE.MeshNormalMaterial({ flatShading: true });
  // The see-through cut applies to the normal pass too, or the outline would trace the removed faces.
  installViewFade(normalMaterial, false);
  const shadowLinear = new THREE.Color(PALETTE.SHADOW_FLOOR), fog = new THREE.Color(FOG.color);
  const far = new THREE.Color(SKY.horizon);

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
    uniforms: {
      tBeauty: { value: beauty.texture }, tNormal: { value: normal.texture }, tDepth: { value: beauty.depthTexture },
      uRes: { value: new THREE.Vector2(INTERNAL_W, INTERNAL_H) }, uNear: { value: CAMERA.near }, uFar: { value: CAMERA.far },
      uEdge: { value: new THREE.Vector3(EDGE.depth, EDGE.normal, EDGE.normalGain) }, uFogDensity: { value: FOG.density },
      uDepthThreshold: { value: new THREE.Vector2(...EDGE.depthThreshold) }, uNormalDepthBias: { value: EDGE.normalDepthBias },
      uFogColor: { value: new THREE.Vector3(fog.r, fog.g, fog.b) }, uFogFarColor: { value: new THREE.Vector3(far.r, far.g, far.b) },
      uFogShape: { value: new THREE.Vector4(FOG.hazeCap, FOG.fadeStart, FOG.fadeEnd, FOG.fadeMax) },
      uShadowSrgb: { value: new THREE.Vector3(...GRADE.shadowFloor) },
      uShadowLinear: { value: new THREE.Vector3(shadowLinear.r, shadowLinear.g, shadowLinear.b) },
      uGrade: { value: new THREE.Vector3(GRADE.lift, GRADE.saturation, GRADE.splitTonality) },
      uHueShift: { value: GRADE.hueShift }, uSnow: { value: new THREE.Vector3(0, 0, 0) },
      uSatTaper: { value: new THREE.Vector3(SAT_TAPER.from, SAT_TAPER.to, SAT_TAPER.saturation) },
    },
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene().add(quad);
  const quadCamera = new THREE.Camera();

  function render(): void {
    const { scene, camera } = kit;
    const previousOverride = scene.overrideMaterial, previousBackground = scene.background;
    renderer.setRenderTarget(beauty);
    renderer.clear();
    renderer.render(scene, camera);
    // A3: flat-shaded override, no background, so the normal target holds geometry normals only. The
    // aurora layer is beauty-only: its folds in the normal target would be outlined as edges.
    camera.layers.disable(AURORA_LAYER);
    scene.overrideMaterial = normalMaterial;
    scene.background = null;
    // Put back in `finally`: a throw mid-pass left the normal override on the scene, and from then on
    // the beauty pass drew the world in normal colours, pink and mint, until a reload (critic round 12).
    try {
      renderer.setRenderTarget(normal);
      renderer.clear();
      renderer.render(scene, camera);
    } finally {
      scene.overrideMaterial = previousOverride;
      scene.background = previousBackground;
      camera.layers.enable(AURORA_LAYER);
    }
    (material.uniforms.uNear.value as number) = camera.near;
    (material.uniforms.uFar.value as number) = camera.far;
    renderer.setRenderTarget(null);
    renderer.render(quadScene, quadCamera);
  }

  function setSnow(veil: SnowVeil): void {
    (material.uniforms.uSnow.value as THREE.Vector3).set(veil.drift, veil.fall, veil.amount);
  }
  function setFogColor(haze: THREE.Color, distant: THREE.Color): void {
    (material.uniforms.uFogColor.value as THREE.Vector3).set(haze.r, haze.g, haze.b);
    (material.uniforms.uFogFarColor.value as THREE.Vector3).set(distant.r, distant.g, distant.b);
  }
  function setLook(look: LookOverride): void {
    const g = material.uniforms.uGrade.value as THREE.Vector3;
    if (look.lift !== undefined) g.x = look.lift;
    if (look.saturation !== undefined) g.y = look.saturation;
    if (look.splitTonality !== undefined) g.z = look.splitTonality;
    if (look.fogDensity !== undefined) (material.uniforms.uFogDensity.value as number) = look.fogDensity;
    if (look.satTaper) (material.uniforms.uSatTaper.value as THREE.Vector3).set(...look.satTaper);
  }
  function setPixelSize(n: number): void {
    pixelSize = Math.min(12, Math.max(1, Math.round(n)));
    const size = renderSize(pixelSize);
    beauty.setSize(size.width, size.height);
    normal.setSize(size.width, size.height);
    (material.uniforms.uRes.value as THREE.Vector2).set(size.width, size.height);
  }
  function resize(cssW: number, cssH: number): void {
    if (cssW <= 0 || cssH <= 0) return;
    const b = backingSize(cssW, cssH);
    renderer.setSize(b.width, b.height, false);
    Object.assign(canvas.style, { width: `${cssW}px`, height: `${cssH}px`, imageRendering: 'pixelated' });
    setPixelSize(pixelSize);
  }
  function dispose(): void {
    beauty.depthTexture?.dispose();
    for (const r of [beauty, normal, normalMaterial, material, quad.geometry]) r.dispose();
    renderer.dispose();
  }

  // Establish the backing store now, so a caller that never calls resize() still gets a blocky canvas.
  resize(canvas.clientWidth || INTERNAL_W, canvas.clientHeight || INTERNAL_H);

  return { render, resize, setPixelSize, setSnow, setFogColor, setLook, dispose };
}
