/**
 * The stone in hand at Ivy's dam: the current carries it off its gap, Pip steers it back with A / D until
 * it catches there, and F sets it.
 *
 * It used to be the woodpile's game in the dam's clothes: a stone swung over its gap and E was pressed
 * on the beat. Critic round 25 played both and called them one minigame. So the dam is steered, not
 * timed: the stream pushes each stone downstream, harder and softer as it eddies, and the work is
 * bringing it back across the current. Left alone, a stone drifts to the end of its reach and waits there.
 *
 * Offsets are metres along the wall (the site's local x), + downstream. Pure numbers, as logHand.ts.
 */

import { PALETTE } from '../../core/palette';
import type { PlacedMarker } from './markerLooks';
import { SWING } from './logSwing';

export const DAM = {
  /** The stream's push, metres a second: `current` on average, eddying `eddy` either side. */
  current: 0.5,
  eddy: 0.25,
  /**
   * How fast A / D moves the stone along the wall, metres a second, against or with the current. At 1.3,
   * against a strong eddy it crept back at 0.55 a second, and critic round 76 called the stone sluggish;
   * at 1.6 critic round 78 still held A a full second to bring it home.
   */
  steer: 2,
  /** Within this many metres of its gap the stone catches there. */
  gap: 0.3,
  /** Furthest the stone goes off its gap: over a neighbour, in either direction. */
  reach: 1.6,
  /** Where each stone comes up: downstream, where the water has carried it. */
  start: 1.1,
  /** Seconds the "not yet" line stays after a press that came too soon. */
  early: 1.6,
} as const;

/** The stream's push on a stone `t` seconds into its lift; `lifts` varies the eddies stone to stone. */
export function currentAt(t: number, lifts: number): number {
  return DAM.current + DAM.eddy * Math.sin(t * 1.3 + lifts * 1.9);
}

/**
 * Steered over its gap, a stone catches there and stays until it is set. It used to stay only while the
 * key was held against the current, and a press off the gap sank it and brought up the next one back
 * where it started: critic round 77 pressed on what looked like the gap, lost the stone every time, and
 * set none of five in seventy seconds. Now the work is bringing it across the current, and a press that
 * comes too soon only says so.
 */
export class DamHand {
  private lifted = 0;
  private lifts = 0;
  private offset: number = DAM.start;
  private caught = false;
  private earlyAt = Number.NEGATIVE_INFINITY;

  private lift(now: number): void {
    this.lifts++;
    this.lifted = now;
    this.offset = DAM.start;
    this.caught = false;
  }

  reset(now: number): void {
    this.lifts = 0;
    this.lift(now);
    this.earlyAt = Number.NEGATIVE_INFINITY;
  }

  /** Metres off its gap, + downstream. */
  get off(): number {
    return this.offset;
  }

  /** True while a press now would set the stone: it has caught in its gap. */
  over(): boolean {
    return this.caught;
  }

  /**
   * One frame: the current and Pip's push (`push`, -1..1 along the wall, + downstream) move the stone
   * until it catches in its gap, and a press sets a caught stone. Returns true when a stone was set.
   */
  update(now: number, dt: number, pressed: boolean, push: number): boolean {
    if (!this.caught) {
      const drift = currentAt(now - this.lifted, this.lifts) + Math.max(-1, Math.min(1, push)) * DAM.steer;
      const was = this.offset;
      this.offset = Math.max(-DAM.reach, Math.min(DAM.reach, this.offset + drift * dt));
      // Caught on the way through too: a quick stone can cross the whole gap inside one frame.
      if (Math.abs(this.offset) <= DAM.gap || Math.sign(was) !== Math.sign(this.offset)) {
        this.caught = true;
        this.offset = Math.max(-DAM.gap, Math.min(DAM.gap, this.offset)) * 0.5;
      }
    } else {
      // Settling into the notch.
      this.offset *= Math.max(0, 1 - dt * 6);
    }
    if (!pressed) return false;
    if (this.caught) {
      this.earlyAt = Number.NEGATIVE_INFINITY;
      this.lift(now);
      return true;
    }
    this.earlyAt = now;
    return false;
  }

  /** A press that came before the stone caught, while its line is still up. */
  miss(now: number): 'off' | null {
    return now - this.earlyAt < DAM.early ? 'off' : null;
  }

  /**
   * The stone over the wall, a light either side of its gap, and two flecks riding the current past it
   * so the push has something to see. `place(drop, off)` puts the stone `drop` above its rest, `off`
   * metres along the wall; `along` is the wall's direction in the world.
   */
  markers(now: number, rest: PlacedMarker, place: (drop: number, off: number) => PlacedMarker, along: { x: number; z: number }): PlacedMarker[] {
    const off = this.offset;
    const stone: PlacedMarker = { ...place(this.caught ? SWING.hover * 0.5 : SWING.hover, off), look: 'stone-held' };
    const near = Math.max(0, 1 - (Math.abs(off) - DAM.gap) / (DAM.reach - DAM.gap));
    // The gap is the space between two lights, and only the stone in hand has a ring: critic round 77
    // saw a ring on the gap and another under the stone and could not tell which one it steered.
    const y = rest.y + 0.5;
    const ends: PlacedMarker[] = [-1, 1].map((end) => ({
      shape: 'float', look: 'dot', size: this.caught ? 2.6 : 1.9, strength: this.caught ? 1 : 0.7 + 0.3 * near,
      x: rest.x + along.x * end * (DAM.gap + 0.35), y, z: rest.z + along.z * end * (DAM.gap + 0.35),
    }));
    const flecks: PlacedMarker[] = [0, 0.5].map((phase) => {
      const k = ((now * 0.35 + phase) % 1) * 2 - 1;
      return { shape: 'float', look: 'dot', size: 0.9, strength: 0.5, x: rest.x + along.x * k * 2.4, y: rest.y + 0.08, z: rest.z + along.z * k * 2.4 };
    });
    const held: PlacedMarker = { shape: 'float', look: 'dot', size: 1.4, strength: 1, x: stone.x, y: stone.y + 0.9 + 0.08 * Math.sin(now * 4), z: stone.z };
    // A warm ring on the water under the stone in hand: among the pool's blue boulders, critic round 64
    // could not pick out which one was theirs, or see it move.
    const mine: PlacedMarker = { shape: 'ring', look: 'halo', x: stone.x, y: rest.y + 0.1, z: stone.z, size: 0.65, strength: 1, color: PALETTE.PIP_SCARF };
    return [stone, held, mine, ...ends, ...flecks];
  }
}
