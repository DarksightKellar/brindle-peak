/**
 * The log in hand at Bram's woodpile: lifted off the heap, swinging over its notch, laid square on a
 * press or slipping off on a crooked one (logSwing.ts holds the numbers).
 *
 * Kept out of build.ts so the build only knows "a press laid a log at this angle"; everything about
 * timing it, refusing a mashed press, and saying which way a miss went lives here.
 */

import { PALETTE } from '../../core/palette';
import type { PlacedMarker } from './markerLooks';
import { LOG } from './pieceMeshes';
import { isSquare, missSide, slipAt, swingAt, SWING } from './logSwing';

/** Shortest wait, in seconds, from a log coming up to its first square pass. */
const LEAD = 0.45;
/** How much quicker or slower than the rest a log may swing: one in eight. */
const PACE = 0.12;

export class LogHand {
  /** Clock when the log now swinging was lifted, and when a crooked one began to slip (-1: none). */
  private lifted = 0;
  private slipStart = -1;
  private slipAngle = 0;
  /** Clock at the last press of any kind, laid, crooked or ignored; a press close behind it is a mash. */
  private lastPress = Number.NEGATIVE_INFINITY;
  /** Clock at the last crooked press (-1: none), and which side of square it missed on. */
  private missAt = -1;
  /** 'mash': pressed again too soon after the last press, whatever the swing. */
  private missed: 'early' | 'late' | 'mash' = 'early';
  /** Logs lifted so far: each starts its swing somewhere else (`lift`), and swings at its own pace. */
  private lifts = 0;
  private pace = 1;

  /**
   * Lift a log off the heap. Each one comes up partway through its swing, a different way each time:
   * starting every log at the same point put square a fixed 0.65 s after the last one landed, and
   * critic round 16 laid seven of seven pressing E once every 0.7 s without looking.
   */
  private lift(now: number): void {
    this.lifts++;
    // It comes up crooked, just past a square pass, and the next square is LEAD to LEAD + spread
    // seconds away: never so soon that a deliberate press reads as a mash.
    this.pace = 1 + PACE * Math.sin(this.lifts * 2.4);
    const p = SWING.period, w = (p * Math.asin(Math.sqrt(SWING.square / SWING.amp))) / (2 * Math.PI);
    const spread = p / 2 - 2 * w - LEAD * this.pace;
    this.lifted = now - (p / 4 + w + ((this.lifts * 0.618) % 1) * spread) / this.pace;
  }

  reset(now: number): void {
    this.lifts = 0;
    this.lift(now);
    this.slipStart = -1;
    this.lastPress = Number.NEGATIVE_INFINITY;
    this.missAt = -1;
  }

  /** The swinging log's angle off square at `now`, on crib layer `layer`. */
  angle(now: number, layer: number): number {
    return swingAt((now - this.lifted) * this.pace, layer);
  }

  /** True while a press now would lay the log. */
  square(now: number, layer: number): boolean {
    return this.slipStart < 0 && isSquare(this.angle(now, layer));
  }

  /**
   * One frame. Returns the angle a log was laid at this frame, or null. Presses while a log slips are
   * ignored, but still count toward a mash: holding E down or hammering it never lays anything.
   */
  update(now: number, layer: number, pressed: boolean): number | null {
    const mashed = pressed && now - this.lastPress < SWING.mash;
    if (pressed) this.lastPress = now;
    if (this.slipStart >= 0 && now - this.slipStart >= SWING.slip) {
      this.slipStart = -1;
      this.lift(now);
    }
    if (this.slipStart >= 0 || !pressed) return null;
    const angle = this.angle(now, layer);
    if (!mashed && isSquare(angle)) {
      this.lift(now);
      return angle;
    }
    const t = (now - this.lifted) * this.pace;
    this.slipStart = now;
    this.slipAngle = angle;
    this.missAt = now;
    // A mash is said as one: critic round 23 hammered E for a minute, was told "Too late" every time,
    // and never learned that one press per swing was the way.
    this.missed = mashed ? 'mash' : missSide(t, layer);
    return null;
  }

  /** Which way the last press missed, for as long as its log is rolling off and coming back. */
  miss(now: number): 'early' | 'late' | 'mash' | null {
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
    // Square: a ring lights on the crib under the log as well. From the side the camera keeps, a log's
    // swing is a change of length more than of angle, and critic round 8 could not time it by eye.
    const ring: PlacedMarker[] = square
      ? [{ shape: 'ring', look: 'halo', x: rest.x, y: rest.y + LOG.radius * 2 + 0.05, z: rest.z, size: LOG.length * 0.6, strength: 1 }]
      : [];
    return [log, ...ends, ...ring];
  }
}
