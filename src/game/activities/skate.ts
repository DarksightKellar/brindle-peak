/**
 * Skating. Keep the weight over the blades.
 *
 * An unstable balance meter: it leans further the further you lean, so the only way to
 * hold it is small alternating corrections. Fall too far off centre for too long and the
 * run simply ends — you keep the seconds you skated, there is no scolding, no retry wall
 * (GDD pillar 1). Score is time held.
 *
 * Round 8's critic stood on the ice for twenty seconds while the clock ran, under a name that promised
 * a race, and read "Balance right" as the way to press. Now Pip skates a lap of the Reach while the
 * meter is held (the session carries the bird, as it does a sled); the panel names the key that
 * rights you ("Tipping right — hold A"); and a result card says how it went.
 */

import { clamp } from '../../core/contracts';
import type {
  ActivityDef, ActivityHost, ActivityInstance, ActivityReadout, ActivityResult, TerrainSampler, Vec3,
} from '../../core/contracts';
import { WORDS } from './activityWords';

export const SKATE = {
  /**
   * The ice breathes: a slow, wide wander big enough to need a correction about once a
   * second. Tuned so holding a single direction cannot pin the meter — you must alternate.
   */
  wobble: 1.6,
  wobbleRate: 0.7,
  /** Positive feedback: leaning costs more than it gives. */
  lean: 0.6,
  /** How hard a left/right press pushes the meter. */
  inputForce: 2.4,
  /**
   * Critic round 17 fell in at 11 s, reacting to every cue. With 1.6 a player holding the named key a
   * third of a second late overshot into the other edge; at 3.6 one up to two thirds of a second late
   * crosses, while one held key or no input still tips over within three seconds.
   */
  damping: 3.6,
  /** |balance| beyond this counts as off centre. */
  offCentre: 0.72,
  /** Seconds off centre before the run ends. */
  fallAfter: 2,
  /** Seconds of held balance that counts as crossing the pond. */
  goal: 20,
  /** Radius of the lap Pip skates in that time, starting at the post and curving away east. */
  lap: 11,
  /** |balance| under this reads as steady in the panel. */
  steady: 0.15,
  /**
   * Wobbles Pip rides out before a fall ends the lap: the bird windmills, comes back upright, and the
   * lap goes on. Critics rounds 17 and 21 both went down at about 12 s of 20 and called it too strict
   * for a cozy game; now the third time off the edge is the fall.
   */
  catches: 2,
  /** Seconds the panel says Pip caught it. */
  caughtFor: 1.5,
} as const;

export interface BalanceState {
  balance: number;
  velocity: number;
  offCentreFor: number;
}

export function newBalance(balance = 0): BalanceState {
  return { balance, velocity: 0, offCentreFor: 0 };
}

export function isOffCentre(balance: number): boolean {
  return Math.abs(balance) > SKATE.offCentre;
}

export function lostBalance(state: BalanceState): boolean {
  return state.offCentreFor >= SKATE.fallAfter;
}

/**
 * One balance step. `moveX` is the lean input (-1 left, +1 right). The wobble phase is
 * passed in rather than randomised so a replay is identical.
 */
export function skateStep(
  state: BalanceState,
  dt: number,
  moveX: number,
  elapsed: number,
  phase: number,
): void {
  const wobble = SKATE.wobble * Math.sin(elapsed * SKATE.wobbleRate + phase);
  const accel =
    wobble + SKATE.lean * state.balance + SKATE.inputForce * clamp(moveX, -1, 1) - SKATE.damping * state.velocity;
  state.velocity += accel * dt;
  state.balance = clamp(state.balance + state.velocity * dt, -1.2, 1.2);
  state.offCentreFor = isOffCentre(state.balance) ? state.offCentreFor + dt : 0;
}

function seedOf(def: ActivityDef): number {
  return Math.abs(def.pos.x * 1229 + def.pos.z * 4513);
}

export class SkateActivity implements ActivityInstance {
  readonly def: ActivityDef;
  private balanceState: BalanceState = newBalance();
  private elapsed = 0;
  private phase = 0;
  private stage: 'skate' | 'done' | 'aborted' = 'skate';
  private outcome: ActivityResult | null = null;
  private paid = false;
  private terrain: TerrainSampler | null = null;
  private catchesLeft: number = SKATE.catches;
  /** `elapsed` when Pip last caught a wobble, or -Infinity. */
  private caughtAt = -Infinity;

  constructor(def: ActivityDef) {
    this.def = def;
  }

  start(host: ActivityHost): void {
    this.terrain = host.terrain;
    // You never step onto the ice perfectly centred: the seeded lean is the first thing to correct.
    const seed = seedOf(this.def);
    this.balanceState = newBalance(seed % 2 === 0 ? 0.24 : -0.24);
    this.elapsed = 0;
    this.phase = ((seed % 6283) / 1000) % (Math.PI * 2);
    this.outcome = null;
    this.paid = false;
    this.stage = 'skate';
    this.catchesLeft = SKATE.catches;
    this.caughtAt = -Infinity;
  }

  update(dt: number, host: ActivityHost): void {
    if (this.stage !== 'skate') return;
    if (host.input.cancelPressed) {
      this.abort();
      return;
    }

    const step = Math.max(0, Math.min(dt, 0.1));
    this.elapsed += step;
    skateStep(this.balanceState, step, host.input.moveX, this.elapsed, this.phase);

    if (lostBalance(this.balanceState) && this.catchesLeft > 0) {
      // Windmilling, back upright, still leaning a touch the way it went.
      this.catchesLeft--;
      this.caughtAt = this.elapsed;
      const b = this.balanceState;
      this.balanceState = { balance: Math.sign(b.balance) * 0.2, velocity: 0, offCentreFor: 0 };
    } else if (lostBalance(this.balanceState)) this.finish(host, false);
    else if (this.elapsed >= SKATE.goal) this.finish(host, true);
  }

  private finish(host: ActivityHost, crossed: boolean): void {
    const outcome: ActivityResult = { score: this.elapsed };
    if (crossed) outcome.bonus = 'pond-crossed';
    this.outcome = outcome;
    this.stage = 'done';
    if (!this.paid) {
      this.paid = true;
      host.award(outcome);
    }
  }

  /**
   * Where the lap has carried Pip: a circle through the post, going round as the seconds are held. A
   * fall stops the bird where it is.
   */
  ride(): (Vec3 & { yaw: number }) | null {
    if (this.stage !== 'skate') return null;
    const a = (this.elapsed / SKATE.goal) * Math.PI * 2;
    const x = this.def.pos.x + SKATE.lap * (1 - Math.cos(a));
    const z = this.def.pos.z + SKATE.lap * Math.sin(a);
    // Heading along the circle, leaning into the meter a little so a tip shows on the bird.
    return { x, y: this.terrain?.heightAt(x, z) ?? 0, z, yaw: a + this.balanceState.balance * 0.35 };
  }

  progress(): ActivityReadout | null {
    const b = this.balanceState;
    const off = isOffCentre(b.balance);
    const tip = b.balance > SKATE.steady ? WORDS.skateTipRight : b.balance < -SKATE.steady ? WORDS.skateTipLeft : WORDS.skateSteady;
    const warn = off ? ` · falling in ${Math.max(0, SKATE.fallAfter - b.offCentreFor).toFixed(1)}s` : '';
    const caught = this.elapsed - this.caughtAt < SKATE.caughtFor ? `${WORDS.skateCaught(this.catchesLeft)} · ` : '';
    return {
      label: `${caught}${tip}${warn} · ${this.elapsed.toFixed(0)} / ${SKATE.goal}s`,
      fraction: Math.min(1, this.elapsed / SKATE.goal),
      urgent: off && b.offCentreFor > SKATE.fallAfter * 0.5,
    };
  }

  /** The result card. */
  summary(): string | null {
    if (this.stage !== 'done') return null;
    return this.crossedPond ? WORDS.skateLap : WORDS.skateResult(this.elapsed);
  }

  isComplete(): boolean {
    return this.stage !== 'skate';
  }

  result(): ActivityResult | null {
    return this.stage === 'done' ? this.outcome : null;
  }

  abort(): void {
    if (this.stage !== 'skate') return;
    this.stage = 'aborted';
    this.outcome = null;
  }

  get balance(): number {
    return this.balanceState.balance;
  }

  /** How fast the meter is currently leaning; the UI tilts Pip with it. */
  get leanRate(): number {
    return this.balanceState.velocity;
  }

  get secondsHeld(): number {
    return this.elapsed;
  }

  get offCentreFor(): number {
    return this.balanceState.offCentreFor;
  }

  get crossedPond(): boolean {
    return this.outcome?.bonus === 'pond-crossed';
  }
}

export function createSkateActivity(def: ActivityDef): SkateActivity {
  return new SkateActivity(def);
}
