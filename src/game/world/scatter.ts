/**
 * Deterministic world dressing.
 *
 * Candidates come from a jittered grid, weighted by zone / surface / slope / elevation, then
 * accepted in a seeded shuffle against a 2.2-unit spacing hash and the landmark clearance discs.
 * Same (seed, sampler) => identical Placement[]. A grove mask clusters the result, so woods have
 * stands and clearings rather than an even speckle; the shuffle truncates the map evenly.
 */
import * as THREE from 'three';
import type { Rng, TerrainSample, TerrainSampler, ZoneId } from '../../core/contracts';
import { makeRng, smoothstep } from '../../core/contracts';
import { fbm2D } from '../../core/math/noise';
import { beforeCuts, CHIMNEY } from '../../core/terrain/heightfield';
import { CLIMB_MIN_SLOPE } from '../../core/player/step';
import type { Placement } from './scatterRules';
import {
  CLEAR_ZONES, DENSITY, FENCE_PITCH, GRID, KINDS, MAX_SLOPE, MIN_SPACING, SCALE, WOOD, WORLD_MARGIN,
  ZONE_TARGET,
} from './scatterRules';
// Re-exported for callers that reason about placement constraints; the value lives in scatterRules.
export { MIN_SPACING };
import { createPropMesh, PROP_VARIANTS } from './props';
import type { PropKind } from './props';
import { trailDistance } from './landmarks';
import { clearOfNamedPlaces } from './namedPlaces';


type Candidate = Placement & { zone: ZoneId };

/** Spatial hash over accepted placements; a 3x3 neighbourhood covers every 2.2-unit conflict. */
class SpaceHash {
  private readonly cells = new Map<number, number[]>();
  constructor(private readonly cell: number) {}
  private key(ix: number, iz: number): number { return (ix + 4096) * 8192 + (iz + 4096); }

  free(x: number, z: number): boolean {
    const ix = Math.floor(x / this.cell), iz = Math.floor(z / this.cell);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const bucket = this.cells.get(this.key(ix + dx, iz + dz));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i += 2) {
          if (Math.hypot(bucket[i] - x, bucket[i + 1] - z) < MIN_SPACING) return false;
        }
      }
    }
    return true;
  }

  take(x: number, z: number): void {
    const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell));
    const bucket = this.cells.get(k);
    if (bucket) bucket.push(x, z);
    else this.cells.set(k, [x, z]);
  }
}

function clearOfLandmarks(x: number, z: number): boolean {
  for (let i = 0; i < CLEAR_ZONES.length; i++) {
    const c = CLEAR_ZONES[i];
    if (Math.hypot(x - c.x, z - c.z) < c.r) return false;
  }
  return true;
}

/** Zone, surface, slope and altitude rules, then one weighted draw for the kind. */
function choose(s: TerrainSample, rng: Rng, mask: number): { kind: PropKind; variant: number; yaw: number; scale: number } | null {
  if (s.surface === 'spring' || s.slope > MAX_SLOPE) return null;
  if (rng.next() > DENSITY[s.zone] * mask) return null;

  // Ice gets a restricted set. Intercepting here rather than in KINDS keeps the per-zone tables
  // describing what a zone looks like, while this describes what a *surface* can physically hold.
  const w: Partial<Record<PropKind, number>> = s.surface === 'ice'
    ? { drift: 0.58, rock: 0.30, brush: 0.12 }
    : { ...KINDS[s.zone] };
  if (s.height > 60) { w.pine = 0; w.brush = 0; }
  if (s.slope > 0.45) { w.rock = (w.rock ?? 0) * 3; w.pine = (w.pine ?? 0) * 0.15; w.brush = (w.brush ?? 0) * 0.1; w.drift = (w.drift ?? 0) * 0.4; w.fence = 0; w.signpost = 0; }
  if (s.slope > 0.62) { w.pine = 0; w.brush = 0; }

  let sum = 0;
  for (const key in w) sum += w[key as PropKind] ?? 0;
  if (sum <= 0) return null;
  let roll = rng.next() * sum;
  let kind: PropKind = 'drift';
  for (const key in w) {
    roll -= w[key as PropKind] ?? 0;
    if (roll <= 0) { kind = key as PropKind; break; }
  }
  const [lo, hi] = SCALE[kind];
  return { kind, variant: rng.int(0, PROP_VARIANTS[kind] - 1), yaw: rng.range(0, Math.PI * 2), scale: rng.range(lo, hi) };
}

/** A pine stands with neighbours: a clump reads as a stand, an even speckle reads as a lawn. */
function clump(start: Candidate, kind: PropKind, sampler: TerrainSampler, hash: SpaceHash, out: Placement[], rng: Rng): number {
  let added = 0;
  for (let k = 0; k < 2; k++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(2.3, 4.4);
    const x = start.x + Math.cos(a) * d;
    const z = start.z + Math.sin(a) * d;
    const s = Math.abs(x) > 500 || Math.abs(z) > 500 ? null : sampler.sampleAt(x, z);
    if (!s || s.slope > MAX_SLOPE || s.surface === 'ice' || s.surface === 'spring') continue;
    if (!clearOfLandmarks(x, z) || !hash.free(x, z)) continue;
    hash.take(x, z);
    out.push({ kind, variant: rng.int(0, PROP_VARIANTS[kind] - 1), x, y: s.height, z, yaw: rng.range(0, Math.PI * 2), scale: start.scale * rng.range(0.8, 1.15) });
    added++;
  }
  return added;
}

/** Follow an accepted fence anchor with up to two more segments, so runs read as runs. */
function fenceRun(start: Candidate, sampler: TerrainSampler, hash: SpaceHash, out: Placement[], rng: Rng): number {
  let added = 0;
  let x = start.x;
  let z = start.z;
  // Local +x under a Y rotation of `yaw` is (cos, 0, -sin): the next post sits where the rails end.
  const dx = Math.cos(start.yaw) * FENCE_PITCH;
  const dz = -Math.sin(start.yaw) * FENCE_PITCH;
  for (let k = 0; k < 2; k++) {
    x += dx;
    z += dz;
    if (Math.abs(x) > 500 || Math.abs(z) > 500) break;
    const s = sampler.sampleAt(x, z);
    if (s.slope > MAX_SLOPE || s.surface === 'ice' || s.surface === 'spring') break;
    if (!clearOfLandmarks(x, z) || !hash.free(x, z)) break;
    hash.take(x, z);
    out.push({ kind: 'fence', variant: rng.int(0, 1), x, y: s.height, z, yaw: start.yaw, scale: 1 });
    added++;
  }
  return added;
}

export function scatterProps(valley: TerrainSampler, seed: number): Placement[] {
  // Placed on the valley as baked, so the gully moves nothing else; namedPlaces clears it after.
  const sampler = beforeCuts(valley);
  const rng = makeRng(seed ^ 0x51a7c0de), lim = Math.min(500, sampler.size / 2 - WORLD_MARGIN);
  const steps = Math.floor((lim * 2) / GRID);
  const grove = fbm2D(seed ^ 0x2f1b37, 2, 2.07, 0.55);
  const candidates: Candidate[] = [];

  for (let iz = 0; iz <= steps; iz++) {
    for (let ix = 0; ix <= steps; ix++) {
      const x = -lim + ix * GRID + rng.range(-3.2, 3.2);
      const z = -lim + iz * GRID + rng.range(-3.2, 3.2);
      if (Math.abs(x) > lim || Math.abs(z) > lim) continue;
      const s = sampler.sampleAt(x, z);
      const mask = smoothstep(0.26, 0.66, 0.5 + 0.5 * grove(x / 86, z / 86));
      const wood = s.zone === 'pinewind' ? 2.3 - 1.95 * Math.min(1, Math.hypot(x - WOOD.x, z - WOOD.z) / WOOD.r) : 1;
      const yard = Math.hypot(x + 352, z - 352); // the arrival yard, dressed thicker than open hearth
      const core = wood * (yard < 80 ? 2.2 - 1.2 * (yard / 80) : 1); // trails and yards dress thicker
      const picked = choose(s, rng, mask * core * (1 + 1.5 * (1 - smoothstep(10, 36, trailDistance(x, z)))));
      if (picked) candidates.push({ ...picked, x, y: s.height, z, zone: s.zone });
    }
  }

  // Seeded Fisher-Yates: uniform truncation instead of a north-to-south fill order.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const swap = candidates[i];
    candidates[i] = candidates[j];
    candidates[j] = swap;
  }

  const byZone = new Map<ZoneId, Candidate[]>();
  for (const c of candidates) {
    const list = byZone.get(c.zone);
    if (list) list.push(c);
    else byZone.set(c.zone, [c]);
  }

  const hash = new SpaceHash(MIN_SPACING), out: Placement[] = [];
  for (const [zone, list] of byZone) {
    let quota = Math.min(ZONE_TARGET[zone], list.length);
    for (const c of list) {
      if (quota <= 0) break;
      if (sampler.sampleAt(c.x, c.z).slope > MAX_SLOPE) continue;
      if (!clearOfLandmarks(c.x, c.z) || !hash.free(c.x, c.z)) continue;
      hash.take(c.x, c.z);
      out.push({ kind: c.kind, variant: c.variant, x: c.x, y: c.y, z: c.z, yaw: c.yaw, scale: c.scale });
      quota--;
      if (c.kind === 'fence') quota -= fenceRun(c, sampler, hash, out, rng);
      else if (c.kind === 'pine' || c.kind === 'brush') quota -= clump(c, c.kind, sampler, hash, out, rng);
    }
  }
  // Named places are cleared after placement, not before: dropping a candidate here leaves its gap
  // empty instead of letting another tree take the quota somewhere a course was validated as clear.
  // Nettle Chimney's walls stay bare rock, so nothing stands in the way of a climb up them; its
  // ledges and top keep what grows there.
  const onCragWall = (p: Placement): boolean =>
    Math.hypot(p.x - CHIMNEY.x, p.z - CHIMNEY.z) < 40 && sampler.sampleAt(p.x, p.z).slope > CLIMB_MIN_SLOPE;
  return out.filter((p) => clearOfNamedPlaces(p.x, p.z) && !onCragWall(p));
}

/** One InstancedMesh per (kind, variant): 17 draw calls for the whole valley. */
export function buildScatterGroup(sampler: TerrainSampler, seed: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'scatter';
  const buckets = new Map<string, Placement[]>();
  for (const p of scatterProps(sampler, seed)) {
    const key = `${p.kind}:${p.variant}`;
    const list = buckets.get(key);
    if (list) list.push(p);
    else buckets.set(key, [p]);
  }

  const matrix = new THREE.Matrix4(), quat = new THREE.Quaternion();
  const at = new THREE.Vector3(), size = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), tone = new THREE.Color();
  let bucket = 0;

  for (const [key, list] of buckets) {
    const [kind, variant] = key.split(':');
    const proto = createPropMesh(kind as PropKind, Number(variant));
    const mesh = new THREE.InstancedMesh(proto.geometry, proto.material as THREE.Material, list.length);
    mesh.name = `scatter:${key}`;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      quat.setFromAxisAngle(up, p.yaw);
      matrix.compose(at.set(p.x, p.y, p.z), quat, size.setScalar(p.scale));
      mesh.setMatrixAt(i, matrix);
      // Deterministic +/-8% tonal variation, so a stand of pines is not one flat green.
      tone.setScalar(0.92 + ((i * 37 + bucket * 11) % 17) / 100);
      mesh.setColorAt(i, tone);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
    bucket++;
  }
  return group;
}
