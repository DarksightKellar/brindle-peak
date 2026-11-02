/**
 * The log in hand at Bram's woodpile: lifted off the heap, swinging over its notch, laid square on a
 * press or slipping off on a crooked one (logSwing.ts holds the numbers).
 *
 * Kept out of build.ts so the build only knows "a press laid a log at this angle"; everything about
 * timing it, holding a press made just before square, and saying which way a miss went lives here.
 */

import { PALETTE } from '../../core/palette';
import type { PlacedMarker } from './markerLooks';
import { LOG } from './pieceMeshes';
import { isSquare, missSide, slipAt, squareSoon, swingAt, SWING } from './logSwing';

export class LogHand {
  /** Clock when the log now swinging was lifted, and when a crooked one began to slip (-1: none). */
  private lifted = 0;
  private slipStart = -1;
  private slipAngle = 0;
  /** A press made just before square, waiting to lay the log when it gets there. */
  private held = false;
  /** Clock at the last crooked press (-1: none), and which side of square it missed on. */
  private missAt = -1;
  private missed: 'early' | 'late' = 'early';

  reset(now: number): void {
    this.lifted = now;
    this.slipStart = -1;
    this.held = false;
    this.missAt = -1;
  }

  /** The swinging log's angle off square at `now`, on crib layer `layer`. */
  angle(now: number, layer: number): number {
    return swingAt(now - this.lifted, layer);
  }

  /** True while a press now would lay the log. */
  square(now: number, layer: number): boolean {
    return this.slipStart < 0 && isSquare(this.angle(now, layer));
  }

  /**
   * One frame. Returns the angle a log was laid at this frame, or null. A press counts once: while a
   * log slips or a held press waits, further presses are ignored rather than queued.
   */
  update(now: number, layer: number, pressed: boolean): number | null {
    if (this.slipStart >= 0 && now - this.slipStart >= SWING.slip) {
      this.slipStart = -1;
      this.lifted = now;
    }
    if (this.slipStart >= 0) return null;
    const angle = this.angle(now, layer);
    if (pressed && !this.held) {
      const t = now - this.lifted;
      if (isSquare(angle)) return this.lay(now, angle);
      if (squareSoon(t, layer)) this.held = true;
      else {
        this.slipStart = now;
        this.slipAngle = angle;
        this.missAt = now;
        this.missed = missSide(t, layer);
      }
      return null;
    }
    return this.held && isSquare(angle) ? this.lay(now, angle) : null;
  }

  private lay(now: number, angle: number): number {
    this.held = false;
    this.lifted = now;
    return angle;
  }

  /** Which way the last press missed, for as long as its log is rolling off and coming back. */
  miss(now: number): 'early' | 'late' | null {
    return this.missAt >= 0 && now - this.missAt < SWING.slip + 0.5 ? this.missed : null;
  }

  /**
   * The log in hand, swinging over its place (or slipping off it), and a light at each end of the
   * notch it must drop into. `place(drop, angle)` puts the log `drop` above its rest at `angle`.
   */
  markers(now: number, layer: number, rest: PlacedMarker, place: (drop: number, angle: number) => PlacedMarker): PlacedMarker[] {
    const slipping = this.slipStart >= 0;
    const slip = slipping ? slipAt(now - this.slipStart, this.slipAngle) : null;
    const angle = slip ? slip.angle : this.angle(now, layer);
    const log = place(slip ? slip.drop : SWING.hover, angle);
    if (slip) log.tilt = (log.tilt ?? 0) + slip.tilt;
    const yaw = rest.yaw ?? 0;
    // The notch lights warm up as the log swings in and flare while it is square; a crooked press
    // flashes them red for as long as the log takes to roll off and come back.
    const near = Math.max(0, 1 - (Math.abs(angle) - SWING.square) / (SWING.amp - SWING.square));
    const square = !slipping && isSquare(angle);
    const lit = slipping || square ? 1 : 0.15 + 0.45 * near * near;
    const ends: PlacedMarker[] = [-1, 1].map((end) => ({
      shape: 'float', look: 'dot', size: square ? 2.3 : 1.5, strength: lit, color: slipping ? PALETTE.PIP_SCARF : undefined,
      x: rest.x + Math.cos(yaw) * end * LOG.length * 0.5, y: rest.y + LOG.radius * 2 + 0.15, z: rest.z - Math.sin(yaw) * end * LOG.length * 0.5,
    }));
    return [log, ...ends];
  }
}
