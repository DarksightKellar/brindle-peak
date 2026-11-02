/**
 * Skating. Keep the weight over the blades.
 *
 * An unstable balance meter: it leans further the further you lean, so the only way to
 * hold it is small alternating corrections. Fall too far off centre for too long and the
 * run simply ends — you keep the seconds you skated, there is no scolding, no retry wall
 * (GDD pillar 1). Score is time held.
 */

import { clamp } from '../../core/contracts';
import type { ActivityDef, ActivityHost, ActivityInstance, ActivityReadout, ActivityResult } from '../../core/contracts';

export const SKATE = {
  /**
   * The ice breathes: a slow, wide wander big enough to need a correction about once a
   * second. Tuned so holding a single direction cannot pin the meter — you must alternate.
   */
  wobble: 1.6,
  wobbleRate: 0.7,
  /** Positive feedback: leaning costs more than it gives. */
  lean: 0.9,
  /** How hard a left/right press pushes the meter. */
  inputForce: 2.4,
  damping: 1.6,
  /** |balance| beyond this counts as off centre. */
  offCentre: 0.72,
  /** Seconds off centre before the run ends. */
  fallAfter: 1.6,
  /** Seconds of held balance that counts as crossing the pond. */
  goal: 20,
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

  constructor(def: ActivityDef) {
    this.def = def;
  }

  start(_host: ActivityHost): void {
    // You never step onto the ice perfectly centred: the seeded lean is the first thing to correct.
    const seed = seedOf(this.def);
    this.balanceState = newBalance(seed % 2 === 0 ? 0.24 : -0.24);
    this.elapsed = 0;
    this.phase = ((seed % 6283) / 1000) % (Math.PI * 2);
    this.outcome = null;
    this.paid = false;
    this.stage = 'skate';
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

    if (lostBalance(this.balanceState)) this.finish(host, false);
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

  progress(): ActivityReadout | null {
    const b = this.balanceState;
    const off = isOffCentre(b.balance);
    const side = b.balance > 0.02 ? 'right' : b.balance < -0.02 ? 'left' : 'centred';
    const warn = off ? ` · falling in ${Math.max(0, SKATE.fallAfter - b.offCentreFor).toFixed(1)}s` : '';
    return {
      label: `Balance ${side}${warn} — ${this.elapsed.toFixed(1)} / ${SKATE.goal}s`,
      fraction: Math.min(1, this.elapsed / SKATE.goal),
      urgent: off && b.offCentreFor > SKATE.fallAfter * 0.5,
    };
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
