/**
 * The snowman, rolled. It used to be four presses of E on the spot, one ball a press; the critic
 * called it trivial, and it was. Now it is what building a snowman is: Pip pushes a small snowball
 * across the open snow, it grows as it rolls, and once it is big enough you push it back onto the
 * snowman's spot and it goes on. Base, middle, head; then one press of E for the face and arms.
 *
 * Short on purpose: the base takes about twelve metres of rolling, the head four, so the whole thing is
 * half a minute of walking in circles on a flat lawn. Nothing can go wrong: a ball rolled too far is
 * only pushed back, and an unfinished snowman comes down when you walk away, as any build does.
 *
 * The ball sits just ahead of Pip along the way Pip is walking, so it is pushed rather than carried.
 * Pip walks freely while rolling (`freeRoam`), with the chase camera; the face is put on standing still,
 * framed from the side like the other builds.
 */

import { angleDelta } from '../../core/contracts';
import { PALETTE } from '../../core/palette';
import type {
  ActivityDef, ActivityHost, ActivityInstance, ActivityReadout, ActivityResult, MarkerSpec, Vec2, Vec3,
} from '../../core/contracts';
import type { Collider } from '../../core/player/collide';
import type { PlacedMarker } from './markerLooks';
import { nounFor, placePiece, siteFor, stepsFor, type BuildSite, type Piece } from './buildSites';
import { BUILD, settleAt } from './build';
import { WORDS } from './activityWords';
import { floorArrowTo, steadyWay, type Way } from './pointer';

/** A full ball further than this (metres, rim to ring) from the spot raises a beam over it. */
const BEAM_GAP = 5;

export const ROLL = {
  /**
   * Radius a fresh ball starts at, and how much it grows per metre rolled. At 0.04 the three balls took
   * 23 m of rolling, and critic round 22 put one on and walked away; at 0.08 it is about 12. It starts
   * at 0.24, not 0.16: critic round 24 saw "a tiny faceted shard" rather than a snowball.
   */
  start: 0.24,
  grow: 0.08,
  /** Gap kept between Pip and the ball's surface. */
  gap: 0.35,
  /** A full-size ball whose centre comes within this of the snowman's spot (plus its radius) goes on. */
  set: 1.0,
  /** Radians a second the ball swings round Pip when Pip turns: it goes round the outside, not through. */
  swing: 5,
} as const;

/** Height of the "bring it here" light over the spot, for each step: above the snowman as it stands. */
const DOT_LIFT = [1.7, 2.4, 2.9, 2.75];

interface Ball { x: number; z: number; r: number; spin: number; heading: number }

export class SnowmanActivity implements ActivityInstance {
  readonly def: ActivityDef;
  private readonly site: BuildSite;
  private readonly steps: readonly Piece[][];
  /** Steps done: 0-2 balls, 3 the face. */
  private stage = 0;
  private placedAt: number[] = [];
  private ball: Ball | null = null;
  private last: { x: number; z: number } = { x: 0, z: 0 };
  private elapsed = 0;
  private ground = 0;
  /** The way word the panel said last frame (pointer.ts steadyWay). */
  private way: Way | null = null;
  private groundAt: (x: number, z: number) => number = () => this.ground;
  private phase: 'build' | 'done' | 'aborted' = 'build';
  private outcome: ActivityResult | null = null;
  private paid = false;
  private swallowPress = false;
  /** The view's heading, for saying which way the ring is. */
  private camYaw = 0;

  constructor(def: ActivityDef) {
    this.def = def;
    this.site = siteFor(def);
    this.steps = stepsFor(this.site);
  }

  /** Pip walks while a ball is being rolled; the face goes on standing still. */
  get freeRoam(): boolean {
    return this.phase === 'build' && this.stage < this.balls;
  }

  private get balls(): number {
    return this.steps.length - 1;
  }

  start(host: ActivityHost): void {
    this.way = null;
    this.ground = host.terrain.heightAt(this.site.at.x, this.site.at.z);
    this.groundAt = (x, z) => host.terrain.heightAt(x, z);
    this.stage = 0;
    this.placedAt = [];
    this.elapsed = 0;
    this.phase = 'build';
    this.outcome = null;
    this.paid = false;
    this.swallowPress = true;
    this.last = { x: host.playerPos.x, z: host.playerPos.z };
    this.spawn(host.cameraYaw);
  }

  /** A fresh small ball just ahead of Pip, the way the camera looks (the way W walks). */
  private spawn(heading: number): void {
    const r = ROLL.start;
    const out = 0.4 + r + ROLL.gap;
    this.ball = { x: this.last.x + Math.sin(heading) * out, z: this.last.z + Math.cos(heading) * out, r, spin: 0, heading };
  }

  update(dt: number, host: ActivityHost): void {
    if (this.phase !== 'build') return;
    if (host.input.cancelPressed) {
      this.abort();
      return;
    }
    const step = Math.max(0, Math.min(dt, 0.1));
    this.elapsed += step;
    this.camYaw = host.cameraYaw;
    const pressed = host.input.interactPressed && !this.swallowPress;
    this.swallowPress = false;
    const p = host.playerPos;
    const moved = Math.hypot(p.x - this.last.x, p.z - this.last.z);
    const b = this.ball;
    if (b && moved > 0.002) {
      const want = angleDelta(b.heading, Math.atan2(p.x - this.last.x, p.z - this.last.z));
      b.heading += Math.max(-ROLL.swing * step, Math.min(ROLL.swing * step, want));
      const target = this.size(this.stage);
      b.r = Math.min(target, b.r + ROLL.grow * moved);
      b.spin += moved / b.r;
    }
    this.last = { x: p.x, z: p.z };
    if (b) {
      // Pushed, not carried: it stays just ahead of Pip along the way Pip walks.
      const out = 0.4 + b.r + ROLL.gap;
      b.x = p.x + Math.sin(b.heading) * out;
      b.z = p.z + Math.cos(b.heading) * out;
      const full = b.r >= this.size(this.stage) - 1e-6;
      if (full && Math.hypot(b.x - this.site.at.x, b.z - this.site.at.z) < ROLL.set + b.r) this.set(b.heading);
    } else if (this.stage === this.balls && pressed) {
      this.placedAt[this.stage] = this.elapsed;
      this.stage++;
    }
    const lastAt = this.placedAt[this.steps.length - 1];
    if (this.stage >= this.steps.length && lastAt !== undefined && this.elapsed - lastAt >= BUILD.settle) this.finish(host);
  }

  /** The rolled ball goes on the snowman; the next one starts at Pip's feet. */
  private set(heading: number): void {
    this.placedAt[this.stage] = this.elapsed;
    this.stage++;
    this.ball = null;
    if (this.stage < this.balls) this.spawn(heading);
  }

  /** Full radius of ball `i`, from the snowman's own layout. */
  private size(i: number): number {
    return this.steps[i]?.[0]?.size ?? 0.5;
  }

  private finish(host: ActivityHost): void {
    this.outcome = { score: this.steps.length, bonus: this.def.id };
    this.phase = 'done';
    if (!this.paid) {
      this.paid = true;
      host.award(this.outcome);
    }
  }

  markers(): readonly MarkerSpec[] {
    const out: PlacedMarker[] = [];
    for (let i = 0; i < this.stage; i++) {
      const { drop } = settleAt(this.elapsed - (this.placedAt[i] ?? 0));
      for (const p of this.steps[i]) out.push(placePiece(this.site, this.ground, p, this.def.id, drop));
    }
    const b = this.phase === 'build' ? this.ball : null;
    if (b) {
      out.push({ shape: 'lump', look: 'snowball', keep: this.def.id, x: b.x, y: this.groundAt(b.x, b.z) - b.r * 0.08, z: b.z, size: b.r, yaw: b.spin });
    }
    if (out.length === 0) out.push({ shape: 'lump', look: 'empty', keep: this.def.id, x: 0, y: 0, z: 0 });
    if (this.phase !== 'build') return out;
    // Where the ball goes: a lit ring on the snow with a light bobbing over it, from the first step.
    // Critic round 5 rolled for twenty seconds before it knew where the ball was going: the ring was
    // a faint white circle and the light only came on once the ball was full. Both are up from the
    // start now; a full ball brightens them, and for the face the light hangs where the face goes.
    const full = b !== null && b.r >= this.size(this.stage) - 1e-6;
    const at = this.site.at;
    out.push({ shape: 'ring', look: 'halo', x: at.x, y: this.ground, z: at.z, size: 1.3, strength: full || !b ? 1 : 0.65 });
    // Critic round 10 lost the ball itself, pale on blue night snow, and was not sure which round thing
    // was theirs. The ball being pushed stands in its own light, and once it is full a line of lights
    // runs from it to the spot.
    // Critic round 13 then saw two gold rings and could not tell which was the target: the ball's own
    // ring is mint now, gold is only ever where it goes, and a beam stands over the spot while the ball is away.
    if (b) {
      const by = this.groundAt(b.x, b.z);
      out.push({ shape: 'ring', look: 'halo', x: b.x, y: by, z: b.z, size: b.r + 0.35, strength: full ? 0.9 : 0.6, color: PALETTE.AURORA_G });
      const dx = at.x - b.x, dz = at.z - b.z;
      const gap = Math.hypot(dx, dz) - b.r - 1.3;
      // The beam is for finding the spot from afar. Close to it, between the camera and the bird, it
      // stood as a wide orange column across the view (critic round 19); the ring and the lights do.
      // From the first roll, not only once the ball is full: critic round 28 rolled a small ball 700 u off
      // with nothing standing over the ring to come back to.
      if (gap > BEAM_GAP) out.push({ shape: 'ring', look: 'beam', x: at.x, y: this.ground, z: at.z, yaw: 0, size: 1 });
      if (full && gap > 1) {
        const n = Math.min(5, Math.floor(gap / 1.2));
        for (let i = 1; i <= n; i++) {
          const t = (b.r + (gap * i) / (n + 1)) / Math.hypot(dx, dz);
          const x = b.x + dx * t, z = b.z + dz * t;
          const pulse = 0.55 + 0.45 * Math.max(0, Math.sin(this.elapsed * 5 - i * 0.9));
          out.push({ shape: 'float', look: 'dot', x, y: this.groundAt(x, z) + 0.25, z, size: 0.7, strength: pulse });
        }
      }
    }
    // While a ball is out, the arrow on the snow beside Pip points at the ring, as the race's does at its
    // gate: critic round 24 rolled a ball 141 u off and gave up looking for the way back.
    if (b) out.push(...floorArrowTo({ x: this.last.x, y: this.groundAt(this.last.x, this.last.z), z: this.last.z }, at, (x, z) => this.groundAt(x, z), this.elapsed));
    const lift = DOT_LIFT[this.stage] ?? 2.6;
    out.push({ shape: 'float', look: 'dot', x: at.x, y: this.ground + lift + 0.12 * Math.sin(this.elapsed * 4), z: at.z, size: full || !b ? 1.6 : 1.2, strength: 1 });
    return out;
  }

  /** The lit ring, while a ball is being rolled: critic round 11 had a full ball and no idea which way. */
  compassTarget(): Vec2 | null {
    return this.phase === 'build' && this.ball ? { x: this.site.at.x, z: this.site.at.z } : null;
  }

  progress(): ActivityReadout | null {
    const total = this.steps.length;
    const count = `${nounFor(this.site)} ${Math.min(this.stage, total)} / ${total}`;
    const b = this.ball;
    // Dressed, it says so: critic round 20 still read "Press E to give it a face" under the hat.
    if (!b && this.stage >= total) return { label: count, fraction: 1 };
    if (!b) return { label: `${WORDS.snowFace} · ${count}`, fraction: this.stage / total, urgent: this.stage === this.balls };
    const target = this.size(this.stage);
    const full = b.r >= target - 1e-6;
    const grown = (b.r - ROLL.start) / Math.max(0.01, target - ROLL.start);
    // Which way the ring is, as the race says where its gate is: critic round 20 circled for three
    // minutes looking for it with a ball in front of them.
    const at = this.site.at;
    const far = Math.hypot(at.x - b.x, at.z - b.z) - b.r - 1.3;
    const turn = angleDelta(this.camYaw, Math.atan2(at.x - b.x, at.z - b.z));
    const way = this.way = steadyWay(turn, this.way);
    const where = far > 2 ? ` · ${WORDS.gateWay(far, way, turn > 0 ? 'left' : 'right')}` : '';
    return { label: `${full ? WORDS.snowPush : WORDS.snowRoll}${where} · ${count}`, fraction: (this.stage + grown) / total, urgent: full };
  }

  /** The face goes on framed from the side, as the other builds are; rolling keeps the chase view. */
  focus(): (Vec3 & { facing: number }) | null {
    if (this.phase !== 'build' || this.ball) return null;
    return { x: this.site.at.x, y: this.ground + 1.2, z: this.site.at.z, facing: this.site.facing };
  }

  /** A standing snowman is solid: Pip walks round it, not through it. */
  lasting(): Collider[] {
    if (this.phase !== 'done') return [];
    return [{ kind: 'circle', x: this.site.at.x, z: this.site.at.z, r: this.size(0) + 0.1, top: 2.3 }];
  }

  summary(): string | null {
    return this.phase === 'done' ? WORDS.buildResult.snowman ?? null : null;
  }

  isComplete(): boolean {
    return this.phase !== 'build';
  }

  result(): ActivityResult | null {
    return this.phase === 'done' ? this.outcome : null;
  }

  abort(): void {
    if (this.phase !== 'build') return;
    this.phase = 'aborted';
    this.stage = 0; // the half-built snowman comes down, as any unfinished build does
    this.ball = null;
    this.outcome = null;
  }

  get placed(): number { return this.stage; }
  get stepCount(): number { return this.steps.length; }
  get ballRadius(): number { return this.ball?.r ?? 0; }
}

export function createSnowmanActivity(def: ActivityDef): SnowmanActivity {
  return new SnowmanActivity(def);
}
