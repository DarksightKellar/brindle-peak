/**
 * Throwing: turn the aim with A / D, press E, watch it fly.
 *
 * The old round resolved each press instantly against the camera's yaw, which does not move during
 * an activity: the aim was frozen, misses were invisible, and five presses "completed" it with no
 * hits. Now the activity owns its aim (moveX turns it), an arc of dots shows where a throw will go,
 * and each throw is a projectile (throwFlight.ts) that strikes the real target or lands in the snow.
 *
 * What is thrown at, and how many hits finish it, comes from throwSetups.ts. A round ends early on
 * enough hits, or when the pouch is empty and the last throw has landed — and either way it counts,
 * so a miss costs a throw and nothing else. Score = hits.
 */

import { angleDelta } from '../../core/contracts';
import type {
  ActivityDef, ActivityHost, ActivityInstance, ActivityReadout, ActivityResult, MarkerSpec,
  TerrainSampler, Vec3,
} from '../../core/contracts';
import type { PlacedMarker } from './markerLooks';
import { launch, linedUp, previewArc, stepShot, turnAim, type Shot, type Strikeable } from './throwFlight';
import { bellTarget, FAN, makeFan, setupFor, targetFoot, type ThrowSetup, type ThrowTarget } from './throwSetups';
import { WORDS } from './activityWords';

export { targetAngle } from './throwSetups';

export const THROW = {
  /** Seconds between throws, so a held key cannot dump the whole pouch in one frame. */
  cooldown: 0.35,
  /** Seconds the round lingers after it is decided, so the last hit is seen landing. */
  linger: 0.7,
  /** Radians the aim opens away from the target, so nothing is won by pressing E once. */
  openOffset: 0.3,
  /** Seconds a puff of snow (a hit or a landing) stays visible. */
  puff: 0.35,
} as const;

interface Puff { pos: Vec3; age: number }

export class TargetActivity implements ActivityInstance {
  readonly def: ActivityDef;
  readonly setup: ThrowSetup;
  private fan: ThrowTarget[] = [];
  private bell: Strikeable | null = null;
  private terrain: TerrainSampler | null = null;
  private feet: Vec3 = { x: 0, y: 0, z: 0 };
  private aim = 0;
  private shots: Shot[] = [];
  private puffs: Puff[] = [];
  /** Seconds since the bell was last struck, for its ring; negative before the first hit. */
  private rang = -1;
  private elapsed = 0;
  private throwsLeft = 0;
  private hits = 0;
  private cooldown = 0;
  /** `elapsed` when the round was decided, or -1 while it is still open. */
  private decidedAt = -1;
  private stage: 'throwing' | 'done' | 'aborted' = 'throwing';
  private outcome: ActivityResult | null = null;
  private paid = false;
  private swallowPress = false;

  constructor(def: ActivityDef) {
    this.def = def;
    this.setup = setupFor(def);
  }

  private groundAt = (x: number, z: number): number => this.terrain?.heightAt(x, z) ?? 0;

  start(host: ActivityHost): void {
    this.terrain = host.terrain;
    this.feet = { ...host.playerPos };
    this.fan = this.setup.kind === 'fan' ? makeFan(this.def, this.setup.facing ?? host.cameraYaw) : [];
    this.bell = this.setup.kind === 'bell' ? bellTarget(this.groundAt) : null;
    this.shots = [];
    this.puffs = [];
    this.rang = -1;
    this.elapsed = 0;
    this.throwsLeft = this.setup.budget;
    this.hits = 0;
    this.cooldown = 0;
    this.decidedAt = -1;
    this.outcome = null;
    this.paid = false;
    this.stage = 'throwing';
    this.swallowPress = true;
    /*
     * Open aimed near the middle of what is to be hit, but not on it: pointed straight at the bell, the
     * first press rang it and the round was over before it began. The aim starts a little way off,
     * on the side the camera is looking, so the player always lines the throw up themselves.
     */
    const mid = this.bell?.pos ?? this.strikeables()[1]?.pos ?? this.strikeables()[0]?.pos;
    const bearing = mid ? Math.atan2(mid.x - this.feet.x, mid.z - this.feet.z) : host.cameraYaw;
    const side = angleDelta(bearing, host.cameraYaw) < 0 ? -1 : 1;
    this.aim = bearing + side * THROW.openOffset;
  }

  /** Hit volumes this instant, index-aligned with the fan (null once a post is down). */
  private strikeables(): (Strikeable | null)[] {
    if (this.bell) return [this.bell];
    return this.fan.map((t) => {
      if (t.down) return null;
      const foot = targetFoot(this.def.pos, t, this.elapsed);
      return { pos: { x: foot.x, y: this.groundAt(foot.x, foot.z) + FAN.centre, z: foot.z }, radius: FAN.radius, half: FAN.half };
    });
  }

  update(dt: number, host: ActivityHost): void {
    if (this.stage !== 'throwing') return;
    if (host.input.cancelPressed) {
      this.abort();
      return;
    }
    const step = Math.max(0, Math.min(dt, 0.1));
    const pressed = host.input.interactPressed && !this.swallowPress;
    this.swallowPress = false;
    this.feet = { ...host.playerPos };
    this.aim = turnAim(this.aim, host.input.moveX, step);

    if (pressed && this.decidedAt < 0 && this.cooldown <= 0 && this.throwsLeft > 0) {
      this.throwsLeft--;
      this.cooldown = THROW.cooldown;
      this.shots.push(launch(this.feet, this.aim, this.strikeables(), this.groundAt));
    }

    this.elapsed += step;
    this.cooldown -= step;
    this.rang = this.rang >= 0 ? this.rang + step : this.rang;
    for (const p of this.puffs) p.age += step;
    this.puffs = this.puffs.filter((p) => p.age < THROW.puff);

    const targets = this.strikeables();
    for (const shot of this.shots) {
      const was = shot.done;
      const hit = stepShot(shot, step, targets, this.groundAt);
      if (hit >= 0) this.strike(hit);
      if (!was && shot.done) this.puffs.push({ pos: { ...shot.pos }, age: 0 });
    }
    this.shots = this.shots.filter((s) => !s.done);

    const decided = this.hits >= this.setup.need || (this.throwsLeft <= 0 && this.shots.length === 0);
    if (decided && this.decidedAt < 0) this.decidedAt = this.elapsed;
    if (this.decidedAt >= 0 && this.elapsed - this.decidedAt >= THROW.linger) this.finish(host);
  }

  private strike(index: number): void {
    this.hits++;
    if (this.bell) this.rang = 0;
    else if (this.fan[index]) {
      this.fan[index].down = true;
      this.fan[index].downAt = this.elapsed;
    }
  }

  private finish(host: ActivityHost): void {
    const outcome: ActivityResult = { score: this.hits };
    if (this.bell && this.hits > 0) outcome.bonus = 'clean';
    else if (this.fan.length > 0 && this.fan.every((t) => t.down)) outcome.bonus = 'clean-sweep';
    this.outcome = outcome;
    this.stage = 'done';
    if (!this.paid) {
      this.paid = true;
      host.award(outcome);
    }
  }

  markers(): readonly MarkerSpec[] {
    const out: PlacedMarker[] = [];
    // The snowmen are kept pieces (lit like the world), in one group that is emptied when the round ends.
    const keep = `throw:${this.def.id}`;
    if (this.fan.length > 0 && this.stage !== 'throwing') out.push({ shape: 'post', look: 'empty', keep, x: 0, y: 0, z: 0 });
    else if (this.fan.length > 0) {
      this.fan.forEach((t) => {
        const foot = targetFoot(this.def.pos, t, this.elapsed);
        const toward = Math.atan2(this.feet.x - foot.x, this.feet.z - foot.z);
        // A struck snowman falls flat on its back, away from the thrower, pivoting on its foot.
        const tip = t.down ? Math.min(1, (this.elapsed - t.downAt) / 0.3) * 1.45 : 0;
        out.push({
          shape: 'post', look: 'snowman-target', keep,
          x: foot.x, y: this.groundAt(foot.x, foot.z), z: foot.z,
          yaw: toward, pitch: -tip, size: 1,
        });
      });
    }
    if (this.bell && this.rang >= 0 && this.rang < 1.2) {
      const b = this.bell.pos;
      const toward = Math.atan2(this.feet.x - b.x, this.feet.z - b.z);
      for (const lag of [0, 0.25]) {
        const age = this.rang - lag;
        if (age > 0) out.push({ shape: 'ring', look: 'pulse', x: b.x, y: b.y, z: b.z, yaw: toward, size: 0.6 + age * 2.4, strength: 1 - age / 1.2 });
      }
    }
    // The aim line steps aside while a throw is in the air, so the thing in flight is the thing you see.
    if (this.stage === 'throwing' && this.decidedAt < 0 && this.throwsLeft > 0 && this.shots.length === 0) {
      const targets = this.strikeables();
      const on = targets.some((t) => t !== null && linedUp(this.feet, this.aim, t));
      for (const p of previewArc(this.feet, this.aim, targets, this.groundAt)) {
        out.push({ shape: 'float', look: 'dot', x: p.x, y: p.y, z: p.z, strength: on ? 1 : 0.35, size: on ? 1.35 : 1 });
      }
    }
    for (const s of this.shots) out.push({ shape: 'float', look: this.setup.missile, x: s.pos.x, y: s.pos.y, z: s.pos.z, yaw: s.age * 9, size: 1 });
    for (const p of this.puffs) {
      const k = p.age / THROW.puff;
      out.push({ shape: 'lump', look: 'puff', x: p.pos.x, y: p.pos.y, z: p.pos.z, size: 0.5 + k * 1.1, strength: 1 - k, yaw: k * 2 });
    }
    return out;
  }

  progress(): ActivityReadout | null {
    const need = this.setup.need;
    return {
      label: `Hits ${Math.min(this.hits, need)} / ${need} · ${this.throwsLeft} left`,
      fraction: need === 0 ? 0 : Math.min(1, this.hits / need),
    };
  }

  /** The result card: critic round 4 used all eight throws and the panel just went away. */
  summary(): string | null {
    return this.stage === 'done' ? WORDS.throwResult(this.hits, this.setup.need) : null;
  }

  isComplete(): boolean {
    return this.stage !== 'throwing';
  }

  result(): ActivityResult | null {
    return this.stage === 'done' ? this.outcome : null;
  }

  abort(): void {
    if (this.stage !== 'throwing') return;
    this.stage = 'aborted';
    this.outcome = null;
  }

  /** Heading Pip should face: the aim. The session may turn the body (and so the camera) to it. */
  facing(): number {
    return this.aim;
  }

  get aimYaw(): number {
    return this.aim;
  }

  /** Current hit volumes (bell or standing posts), for tests and tools. */
  get hitVolumes(): readonly (Strikeable | null)[] {
    return this.strikeables();
  }

  get hitCount(): number {
    return this.hits;
  }

  get inFlight(): number {
    return this.shots.length;
  }
}

export function createTargetActivity(def: ActivityDef): TargetActivity {
  return new TargetActivity(def);
}
