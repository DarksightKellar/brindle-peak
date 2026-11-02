/**
 * The sky dome, day and dusk.
 *
 * Back-side sphere with baked vertex colours: cool zenith, bright haze at the horizon, and a warm lobe
 * around the sun. Two colour sets are baked at build time, day and blue hour, and `setDusk` blends them
 * into the colour attribute only when the dusk amount actually moves — once dusk has settled, the dome
 * costs one draw call and no per-frame maths again.
 *
 * `depthWrite: false` keeps it out of the depth buffer so the composite can tell sky from geometry
 * (depth 1.0) and leave it unfogged; `allowOverride = false` keeps the normal pass from rendering the
 * dome as an opaque ball of normals (ART_BIBLE A3).
 *
 * The dome follows the camera. It used to sit at the world origin with radius 320, which put the
 * summit (the mast is ~500 u from the origin) outside it: from Brindle Peak the sky was the flat
 * background colour. Centred on the camera it is the same sky from everywhere, as a sky should be.
 */
import * as THREE from 'three';
import { DUSK, SKY, SKY_HIGH } from './pixelConfig';
import { AURORA_LAYER } from './aurora';

export interface SkyDome {
  mesh: THREE.Mesh;
  /** t: 0 day .. 1 blue hour. h: 0 valley .. 1 high on the mountain (SKY_HIGH); kept if omitted. */
  setDusk(t: number, h?: number): void;
  follow(at: THREE.Vector3): void;
}

/** Direction of a sun at the shared azimuth and the given elevation. */
export function sunDirection(elevation: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(
    Math.cos(SKY.sunAzimuth) * Math.cos(elevation),
    Math.sin(elevation),
    Math.sin(SKY.sunAzimuth) * Math.cos(elevation),
  ).normalize();
}

interface Look {
  zenith: string; horizon: string; sun: string; glow: number; elevation: number; low: boolean; below?: string;
  /** Height above the horizon (direction y) where the zenith colour is reached; default by `low`. */
  band?: number;
}

function bake(pos: THREE.BufferAttribute, look: Look): Float32Array {
  const out = new Float32Array(pos.count * 3);
  const zenith = new THREE.Color(look.zenith);
  const horizon = new THREE.Color(look.horizon);
  const sun = new THREE.Color(look.sun);
  const sunDir = sunDirection(look.elevation);
  const dir = new THREE.Vector3();
  const c = new THREE.Color();
  const below = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    dir.fromBufferAttribute(pos, i).normalize();
    const t = THREE.MathUtils.clamp((dir.y + 0.05) / (look.band ?? (look.low ? 0.32 : 0.6)), 0, 1);
    // At dusk the lilac is a band on the horizon, not half the sky: the zenith colour arrives sooner.
    c.copy(horizon).lerp(zenith, Math.pow(t, look.low ? 0.7 : 0.85));
    const d = Math.max(0, dir.dot(sunDir));
    // After sunset the glow hugs the horizon (`low`); by day it is the broad lobe around the sun.
    const hug = look.low ? Math.pow(1 - t, 2.5) : 1;
    // By day the dome carries only a narrow haze round the sun (the disc is a sprite), never a broad
    // lobe: the composite
    // multiplies chroma by 2.6, and a wide blue-to-amber blend crosses grey, which the grade turns
    // into a hard-edged orange disc filling a corner of the sky (critic, kettles and summit frames).
    const lobe = look.low
      ? Math.pow(d, 4) * 0.65 + Math.pow(d, 1.15) * 0.4
      : Math.pow(d, 10) * 0.24;
    const glow = Math.min(1, lobe) * look.glow * hug;
    c.lerp(sun, glow);
    // Below the horizon is the world's edge. By day it is horizon haze; at dusk it darkens to the
    // valley-in-shadow blue, so the lilac band has a line to sit on (seen from the peak, looking north).
    if (look.below) c.lerp(below.set(look.below), THREE.MathUtils.smoothstep(-dir.y, 0.005, 0.09));
    out[i * 3] = c.r;
    out[i * 3 + 1] = c.g;
    out[i * 3 + 2] = c.b;
  }
  return out;
}

/** A solid round core and a glow falling away from it, as one small texture. */
function sunTexture(): THREE.DataTexture {
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2);
      const glow = Math.pow(Math.max(0, 1 - d), 2.2) * 0.55;
      const a = d < 0.16 ? 1 : Math.min(1, glow + 1 - THREE.MathUtils.smoothstep(d, 0.16, 0.2));
      data.set([255, 255, 255, Math.round(255 * a)], (y * n + x) * 4);
    }
  }
  const tex = new THREE.DataTexture(data, n, n);
  tex.needsUpdate = true;
  return tex;
}

export function createSkyDome(): SkyDome {
  // Dense enough that the sun lobe's edge is a gradient rather than a visible facet staircase at
  // 384x216; still one draw call and a couple of thousand vertices. Radius stays inside CAMERA.far.
  const geo = new THREE.SphereGeometry(320, 48, 30);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const day = bake(pos, { zenith: SKY.zenith, horizon: SKY.horizon, sun: SKY.sun, glow: 1, elevation: SKY.sunElevation, low: false });
  // High on the mountain the deep blue comes down close to the horizon, so the chase camera, which
  // sees only the lowest band of sky, has a dark sky behind the pale ridge (SKY_HIGH).
  const high = bake(pos, {
    zenith: SKY_HIGH.zenith, horizon: SKY.horizon, sun: SKY.sun, glow: 1, elevation: SKY.sunElevation, low: false,
    band: SKY_HIGH.band,
  });
  const dusk = bake(pos, {
    zenith: DUSK.zenith, horizon: DUSK.horizon, sun: DUSK.sun, glow: DUSK.sunGlow, elevation: DUSK.sunElevation, low: true, below: DUSK.below,
  });
  const colours = new THREE.BufferAttribute(day.slice(), 3);
  geo.setAttribute('color', colours);

  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  mat.allowOverride = false;

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  mesh.name = 'sky';

  // The sun itself: a small soft disc in the haze. The dome's vertices are ~7 degrees apart, so a disc
  // baked into them came out as a polygon; a sprite is round at any size.
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunTexture(), color: new THREE.Color('#FFF4E2'), transparent: true, depthWrite: false, fog: false,
  }));
  sun.material.allowOverride = false;
  sun.position.copy(sunDirection(SKY.sunElevation)).multiplyScalar(300);
  sun.scale.setScalar(46);
  sun.renderOrder = -1;
  sun.name = 'sun';
  // Beauty only, like the aurora: a translucent disc has no business in the normal pass.
  sun.layers.set(AURORA_LAYER);
  mesh.add(sun);

  let current = 0, height = 0;
  const moved = (t: number, was: number): boolean =>
    Math.abs(t - was) >= 0.002 || (t === 0 && was !== 0) || (t === 1 && was !== 1);
  return {
    mesh,
    setDusk(t, h = height): void {
      if (!moved(t, current) && !moved(h, height)) return;
      current = t;
      height = h;
      // The sun is down by blue hour.
      sun.material.opacity = 1 - THREE.MathUtils.smoothstep(t, 0.1, 0.7);
      sun.visible = sun.material.opacity > 0.01;
      const out = colours.array as Float32Array;
      for (let i = 0; i < out.length; i++) {
        const lit = day[i] + (high[i] - day[i]) * h;
        out[i] = lit + (dusk[i] - lit) * t;
      }
      colours.needsUpdate = true;
    },
    follow(at): void {
      mesh.position.copy(at);
    },
  };
}
