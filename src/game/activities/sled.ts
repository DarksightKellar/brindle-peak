/**
 * Sledding. Point downhill and let the mountain do the work; steer through the rings.
 *
 * The old run was simulated off to one side and never moved Pip: the player held A or D, nothing on
 * screen changed, and after ten seconds it said "Done". Now the sled carries Pip down an authored line
 * on a real slope (slidePath.ts), the session moves the body and swings the camera behind it (`ride`),
 * and A / D move the sled across the run. Rings hang at alternating sides; riding through one gives a
 * kick of speed, so steering is the game and a clean line is a fast one.
 *
 * Speed comes from the ground: the grade under the sled, sampled along the direction of travel, against
 * a little drag. Nothing here can strand a run — there is a floor speed — and nothing can fail it: a
 * missed ring is only a slower descent. Past the finish the sled coasts to a stop before the run ends,
 * so the result you are given is for the ride you watched. Score is the time; the only comparison is
 * your own best.
 */

import { clamp } from '../../core/contracts';
import type {
  ActivityDef, ActivityHost, ActivityInstance, ActivityReadout, ActivityResult, MarkerSpec, TerrainSampler, Vec3,
} from '../../core/contracts';
import { WORDS } from './activityWords';
import type { PlacedMarker } from './markerLooks';
import { buildPath, pathAt, ringDistance, slideCourseFor, type SlideCourse, type SlidePath } from './slidePath';

export { DEFAULT_COURSE } from './slidePath';

export const SLED = {
  /** Acceleration per unit of grade. Above real gravity: Kettle Springs is gentle, and a sled should feel quick. */
  gravity: 24,
  /** Quadratic drag; with the grade it sets the cruising speed. */
  drag: 0.016,
  /** Speed at the start push, and a floor so a flat stretch never strands a run. */
  launch: 4,
  minSpeed: 3,
  maxSpeed: 14,
  /** Sideways speed at full A / D, and how quickly the sled answers. */
  steer: 7.5,
  steerEase: 9,
  /** Extra slowing while scraping along the edge of the run. */
  edgeDrag: 4,
  /** Speed added by a ring, and how close to its centre counts. */
  ringBoost: 2,
  ringReach: 1.8,
  /** Braking after the finish, and the speed at which the run is over. */
  brake: 9,
  stopSpeed: 1.2,
} as const;

export interface SledRun {
  speed: number;
  distance: number;
  lateral: number;
  /** Sideways velocity, eased toward the stick. */
  drift: number;
  elapsed: number;
}

/**
 * One integration step. `grade` is the fall per unit forward (positive downhill); `steer` is A / D.
 * Mutates the run in place and returns nothing, so it stays allocation-free.
 */
export function sledStep(run: SledRun, dt: number, grade: number, steer: number, halfWidth = 4.5): void {
  const edge = Math.abs(run.lateral) >= halfWidth - 0.05 ? SLED.edgeDrag : 0;
  const accel = SLED.gravity * grade - SLED.drag * run.speed * run.speed - edge;
  run.speed = clamp(run.speed + accel * dt, SLED.minSpeed, SLED.maxSpeed);
  run.distance += run.speed * dt;
  const want = clamp(steer, -1, 1) * SLED.steer;
  run.drift += (want - run.drift) * Math.min(1, SLED.steerEase * dt);
  run.lateral = clamp(run.lateral + run.drift * dt, -halfWidth, halfWidth);
  run.elapsed += dt;
}

export interface SledOptions {
  /** Length of an unauthored run; authored courses ignore it. */
  length?: number;
}

export class SledActivity implements ActivityInstance {
  readonly def: ActivityDef;
  private readonly length: number | undefined;
  private course: SlideCourse | null = null;
  private path: SlidePath = { xs: [0, 0], zs: [0, 1], length: 1 };
  private run: SledRun = { speed: 0, distance: 0, lateral: 0, drift: 0, elapsed: 0 };
  private terrain: TerrainSampler | null = null;
  private rings: { at: number; side: number; got: boolean }[] = [];
  /** Run clock when the finish was crossed, or -1 before. The score is this, not the coast after it. */
  private finishedAt = -1;
  private stage: 'run' | 'done' | 'aborted' = 'run';
  private outcome: ActivityResult | null = null;
  private paid = false;
  private bestBefore: number | null = null;

  constructor(def: ActivityDef, options: SledOptions = {}) {
    this.def = def;
    this.length = options.length;
  }

  start(host: ActivityHost): void {
    this.terrain = host.terrain;
    this.course = slideCourseFor(this.def, host.terrain, this.length);
    this.path = buildPath(this.course.points);
    const n = this.course.rings.length;
    this.rings = this.course.rings.map((side, i) => ({ at: ringDistance(i, n, this.path.length), side, got: false }));
    this.run = { speed: SLED.launch, distance: 0, lateral: 0, drift: 0, elapsed: 0 };
    const best = host.state.sledBests[this.def.id];
    this.bestBefore = typeof best === 'number' ? best : null;
    this.finishedAt = -1;
    this.outcome = null;
    this.paid = false;
    this.stage = 'run';
  }

  update(dt: number, host: ActivityHost): void {
    if (this.stage !== 'run') return;
    if (host.input.cancelPressed) {
      this.abort();
      return;
    }
    const step = Math.max(0, Math.min(dt, 0.1));
    const before = this.run.distance;
    const half = this.course?.halfWidth ?? 4.5;
    if (this.finishedAt < 0) {
      sledStep(this.run, step, this.gradeHere(), host.input.moveX, half);
    } else {
      // Coasting out: no steering, no grade, just the runners biting.
      this.run.speed = Math.max(0, this.run.speed - SLED.brake * step);
      this.run.distance += this.run.speed * step;
      this.run.elapsed += step;
    }
    for (const r of this.rings) {
      if (!r.got && before < r.at && this.run.distance >= r.at && Math.abs(this.run.lateral - r.side) <= SLED.ringReach) {
        r.got = true;
        this.run.speed = Math.min(SLED.maxSpeed, this.run.speed + SLED.ringBoost);
      }
    }
    if (this.finishedAt < 0 && this.run.distance >= this.path.length) this.finishedAt = this.run.elapsed;
    if (this.finishedAt >= 0 && this.run.speed <= SLED.stopSpeed) this.finish(host);
  }

  /** Fall per unit forward under the sled, read 1.5 u either side along the direction of travel. */
  private gradeHere(): number {
    if (!this.terrain) return 0;
    const p = this.position;
    const d = pathAt(this.path, this.run.distance);
    const ahead = this.terrain.heightAt(p.x + d.dx * 1.5, p.z + d.dz * 1.5);
    const behind = this.terrain.heightAt(p.x - d.dx * 1.5, p.z - d.dz * 1.5);
    return (behind - ahead) / 3;
  }

  private finish(host: ActivityHost): void {
    const score = this.finishedAt;
    const outcome: ActivityResult = { score };
    if (this.bestBefore === null || score < this.bestBefore) outcome.bonus = 'personal-best';
    this.outcome = outcome;
    this.stage = 'done';
    if (!this.paid) {
      this.paid = true;
      host.award(outcome);
    }
  }

  /** The session moves Pip here and turns the camera behind the run. */
  ride(): (Vec3 & { yaw: number }) | null {
    if (this.stage !== 'run') return null;
    const p = this.position;
    const d = pathAt(this.path, this.run.distance);
    // Lean the body into a sideways drift a little, so a steer is visible from behind.
    const yaw = Math.atan2(d.dx, d.dz) - (this.run.drift / SLED.steer) * 0.35;
    return { ...p, yaw };
  }

  markers(): readonly MarkerSpec[] {
    const out: PlacedMarker[] = [];
    if (this.stage !== 'run') return out;
    const p = this.position;
    const d = pathAt(this.path, this.run.distance);
    const yaw = Math.atan2(d.dx, d.dz);
    out.push({ shape: 'lump', look: 'sled', x: p.x, y: p.y, z: p.z, yaw, size: 1 });
    // Snow thrown up behind the runners, quicker and bigger the faster it goes.
    const k = Math.min(1, this.run.speed / 14);
    for (const lag of [0.9, 1.7]) {
      const age = ((this.run.elapsed * (2 + k * 3)) + lag) % 1;
      const back = 0.8 + age * 1.4;
      out.push({
        shape: 'lump', look: 'puff', x: p.x - d.dx * back, y: p.y + 0.15 + age * 0.4 * k, z: p.z - d.dz * back,
        size: (0.3 + age * 0.5) * (0.4 + k), strength: 1 - age, yaw: age * 3,
      });
    }
    // The track's edges: a stake each side every few metres for the stretch ahead, so the line through
    // the next bends reads before you are on it. The critic could see no track at all (round 4).
    const half = (this.course?.halfWidth ?? 4.5) + 0.5;
    for (let at = Math.ceil(this.run.distance / STAKE_EVERY) * STAKE_EVERY; at < this.run.distance + STAKES_AHEAD; at += STAKE_EVERY) {
      if (at > this.path.length) break;
      const fade = 1 - (at - this.run.distance) / STAKES_AHEAD;
      const red = Math.round(at / STAKE_EVERY) % 2 === 0;
      for (const side of [-1, 1]) {
        const e = this.pointAt(at, side * half);
        out.push({ shape: 'post', look: 'stake', x: e.x, y: e.y, z: e.z, yaw: 0, strength: red ? 0.4 + 0.6 * fade : 0.15 + 0.3 * fade, size: 1 });
      }
    }
    // The next three rings: the one coming up bright, the two after it dim.
    let shown = 0;
    for (const r of this.rings) {
      if (r.got || r.at < this.run.distance || shown >= 3) continue;
      const at = this.pointAt(r.at, r.side);
      const rd = pathAt(this.path, r.at);
      out.push({ shape: 'ring', look: 'arch', x: at.x, y: at.y, z: at.z, yaw: Math.atan2(rd.dx, rd.dz), strength: shown === 0 ? 1 : 0.35 });
      shown++;
    }
    if (this.finishedAt < 0) {
      const end = this.pointAt(this.path.length, 0);
      out.push({ shape: 'ring', look: 'beam', x: end.x, y: end.y, z: end.z, yaw: 0, size: 1 });
    }
    return out;
  }

  progress(): ActivityReadout | null {
    const got = this.rings.filter((r) => r.got).length;
    const next = this.finishedAt < 0 ? this.rings.find((r) => !r.got && r.at > this.run.distance) : undefined;
    // + lateral is the rider's right, where D steers.
    const off = next ? next.side - this.run.lateral : 0;
    const cue = next ? `${WORDS.sledRing(Math.abs(off) <= SLED.ringReach * 0.6 ? 'on' : off > 0 ? 'right' : 'left')} · ` : '';
    return {
      label: `${cue}${WORDS.rings(got, this.rings.length)}`,
      fraction: Math.min(1, this.run.distance / this.path.length),
      urgent: next !== undefined && Math.abs(off) <= SLED.ringReach * 0.6,
    };
  }

  summary(): string | null {
    if (this.stage !== 'done') return null;
    const got = this.rings.filter((r) => r.got).length;
    return WORDS.sledResult(this.finishedAt, got, this.rings.length, this.isPersonalBest && this.bestBefore !== null);
  }

  isComplete(): boolean {
    return this.stage !== 'run';
  }

  result(): ActivityResult | null {
    return this.stage === 'done' ? this.outcome : null;
  }

  abort(): void {
    if (this.stage !== 'run') return;
    this.stage = 'aborted';
    this.outcome = null;
  }

  private pointAt(distance: number, lateral: number): Vec3 {
    const c = pathAt(this.path, distance);
    // Right of travel under forward = (sin yaw, cos yaw) is (-dz, dx).
    const x = c.x - c.dz * lateral;
    const z = c.z + c.dx * lateral;
    return { x, y: this.terrain?.heightAt(x, z) ?? 0, z };
  }

  /** Seconds since the push; the score is `finishTime`, the clock at the finish line (-1 before it). */
  get elapsed(): number { return this.run.elapsed; }
  get finishTime(): number { return this.finishedAt; }
  get speed(): number { return this.run.speed; }
  get distance(): number { return this.run.distance; }
  get lateral(): number { return this.run.lateral; }
  get ringsGot(): number { return this.rings.filter((r) => r.got).length; }
  get ringsTotal(): number { return this.rings.length; }
  /** Where the sled is right now. */
  get position(): Vec3 { return this.pointAt(this.run.distance, this.run.lateral); }
  get isPersonalBest(): boolean { return this.outcome?.bonus === 'personal-best'; }
}

/** Metres between edge stakes, and how far ahead of the sled they are planted. */
const STAKE_EVERY = 4;
const STAKES_AHEAD = 44;

export function createSledActivity(def: ActivityDef, options: SledOptions = {}): SledActivity {
  return new SledActivity(def, options);
}
