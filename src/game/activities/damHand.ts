/**
 * The stone in hand at Ivy's dam: the current carries it off its gap, Pip holds it there with A / D, and
 * E sets it.
 *
 * It used to be the woodpile's game in the dam's clothes: a stone swung over its gap and E was pressed
 * on the beat. Critic round 25 played both and called them one minigame. So the dam is steered, not
 * timed: the stream pushes each stone downstream, harder and softer as it eddies, and the work is
 * holding it over the gap long enough to press. Left alone, a stone drifts to the end of its reach and
 * waits there; nothing is lost but a second for a stone set crooked.
 *
 * Offsets are metres along the wall (the site's local x), + downstream. Pure numbers, as logHand.ts.
 */

import { PALETTE } from '../../core/palette';
import type { PlacedMarker } from './markerLooks';
import { slipAt, SWING } from './logSwing';

export const DAM = {
  /** The stream's push, metres a second: `current` on average, eddying `eddy` either side. */
  current: 0.5,
  eddy: 0.25,
  /** How fast A / D moves the stone along the wall, metres a second, against or with the current. */
  steer: 1.3,
  /** Within this many metres of its gap the stone drops in true. */
  gap: 0.22,
  /**
   * Over its gap, Pip's push counts for this share: the stone settles into the notch while the key is
   * held, against the current, instead of sailing through it. At full steer it crossed the gap in half a
   * second, and critic round 33 pressed at "Over the gap" and was told "Not over the gap".
   */
  notch: 0.35,
  /**
   * Seconds a press still sets a stone that has just slid off its gap: a player reacting to "Over the gap"
   * as it goes out. Critic round 38 saw "Over the gap — press E" turn to "Not over the gap" a frame later.
   */
  react: 0.25,
  /** Furthest the stone goes off its gap: over a neighbour, in either direction. */
  reach: 1.6,
  /** Where each stone comes up: downstream, where the water has carried it. */
  start: 1.1,
} as const;

/** The stream's push on a stone `t` seconds into its lift; `lifts` varies the eddies stone to stone. */
export function currentAt(t: number, lifts: number): number {
  return DAM.current + DAM.eddy * Math.sin(t * 1.3 + lifts * 1.9);
}

export class DamHand {
  private lifted = 0;
  private lifts = 0;
  private offset: number = DAM.start;
  private slipStart = -1;
  private slipOffset = 0;
  private lastPress = Number.NEGATIVE_INFINITY;
  /** When this stone was last over its gap (DAM.react). */
  private overAt = Number.NEGATIVE_INFINITY;
  private missAt = -1;
  private missed: 'off' | 'mash' = 'off';

  private lift(now: number): void {
    this.lifts++;
    this.lifted = now;
    this.offset = DAM.start;
    this.overAt = Number.NEGATIVE_INFINITY;
  }

  reset(now: number): void {
    this.lifts = 0;
    this.lift(now);
    this.slipStart = -1;
    this.lastPress = Number.NEGATIVE_INFINITY;
    this.missAt = -1;
  }

  /** Metres off its gap, + downstream. */
  get off(): number {
    return this.offset;
  }

  /** True while a press now would set the stone. */
  over(): boolean {
    return this.slipStart < 0 && Math.abs(this.offset) <= DAM.gap;
  }

  /**
   * One frame: the current and Pip's push (`push`, -1..1 along the wall, + downstream) move the stone,
   * and a press sets it if it is over its gap. Returns true when a stone was set.
   */
  update(now: number, dt: number, pressed: boolean, push: number): boolean {
    const mashed = pressed && now - this.lastPress < SWING.mash;
    if (pressed) this.lastPress = now;
    if (this.slipStart >= 0) {
      if (now - this.slipStart < SWING.slip) return false;
      this.slipStart = -1;
      this.lift(now);
    }
    const steer = Math.abs(this.offset) <= DAM.gap ? DAM.steer * DAM.notch : DAM.steer;
    const drift = currentAt(now - this.lifted, this.lifts) + Math.max(-1, Math.min(1, push)) * steer;
    this.offset = Math.max(-DAM.reach, Math.min(DAM.reach, this.offset + drift * dt));
    if (this.over()) this.overAt = now;
    if (!pressed) return false;
    if (!mashed && now - this.overAt <= DAM.react) {
      this.lift(now);
      return true;
    }
    this.slipStart = now;
    this.slipOffset = this.offset;
    this.missAt = now;
    this.missed = mashed ? 'mash' : 'off';
    return false;
  }

  /** Why the last press missed, while its stone is still going under and the next coming up. */
  miss(now: number): 'off' | 'mash' | null {
    return this.missAt >= 0 && now - this.missAt < SWING.slip + 0.5 ? this.missed : null;
  }

  /**
   * The stone over the wall (or sinking off it), a light either side of its gap, and two flecks riding
   * the current past it so the push has something to see. `place(drop, off)` puts the stone `drop`
   * above its rest, `off` metres along the wall; `along` is the wall's direction in the world.
   */
  markers(now: number, rest: PlacedMarker, place: (drop: number, off: number) => PlacedMarker, along: { x: number; z: number }): PlacedMarker[] {
    const slipping = this.slipStart >= 0;
    const slip = slipping ? slipAt(now - this.slipStart, 0) : null;
    const off = slipping ? this.slipOffset : this.offset;
    const stone = place(slip ? slip.drop : SWING.hover, off);
    const over = !slipping && Math.abs(off) <= DAM.gap;
    const near = Math.max(0, 1 - (Math.abs(off) - DAM.gap) / (DAM.reach - DAM.gap));
    // Never faint: critic rounds 52 to 54 could not tell which stone was theirs or where its gap was.
    const lit = slipping || over ? 1 : 0.5 + 0.4 * near * near;
    const y = rest.y + 0.5;
    const ends: PlacedMarker[] = [-1, 1].map((end) => ({
      shape: 'float', look: 'dot', size: over ? 2.3 : 1.5, strength: lit, color: slipping ? PALETTE.PIP_SCARF : undefined,
      x: rest.x + along.x * end * (DAM.gap + 0.35), y, z: rest.z + along.z * end * (DAM.gap + 0.35),
    }));
    const flecks: PlacedMarker[] = [0, 0.5].map((phase) => {
      const k = ((now * 0.35 + phase) % 1) * 2 - 1;
      return { shape: 'float', look: 'dot', size: 0.9, strength: 0.5, x: rest.x + along.x * k * 2.4, y: rest.y + 0.08, z: rest.z + along.z * k * 2.4 };
    });
    // The gap's ring stands all the time, brighter once the stone is over it; a light rides the stone in hand.
    const ring: PlacedMarker = { shape: 'ring', look: 'halo', x: rest.x, y: rest.y + 0.3, z: rest.z, size: over ? 0.9 : 0.75, strength: over ? 1 : 0.5 };
    const held: PlacedMarker = { shape: 'float', look: 'dot', size: 1.4, strength: 1, x: stone.x, y: stone.y + 0.9 + 0.08 * Math.sin(now * 4), z: stone.z };
    // A warm ring on the water under the stone in hand: among the pool's blue boulders, critic round 64
    // could not pick out which one was theirs, or see it move.
    const mine: PlacedMarker = { shape: 'ring', look: 'halo', x: stone.x, y: rest.y + 0.1, z: stone.z, size: 0.65, strength: 1, color: PALETTE.PIP_SCARF };
    return [stone, held, mine, ...ends, ...flecks, ring];
  }
}
