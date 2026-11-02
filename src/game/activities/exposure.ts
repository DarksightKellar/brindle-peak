/**
 * The aurora photo as a long exposure: press E with the curtains in the middle of the frame and the
 * shutter stays open for a couple of seconds, while Pip, cold on the summit at night, shivers and the
 * frame drifts. Keep the curtain in the middle until the exposure fills.
 *
 * The aurora photo used to open already centred and was one press. This is the small bit of play it
 * was missing, and it is what night-sky photographs ask of a real photographer: hold still. Drifting
 * off pauses the exposure rather than spoiling it, and the keys turn the view finely while it is open.
 * With reduced motion on the drift is much gentler.
 */

export const EXPOSURE = {
  /** Seconds on the curtain that fill the exposure. */
  seconds: 2.4,
  /** The keys turn the view this much slower while the shutter is open: steady hands. */
  fine: 0.4,
  /** Peak drift, radians a second, sideways and up/down. */
  driftYaw: 0.16,
  driftPitch: 0.08,
} as const;

function reducedMotion(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.documentElement.dataset.reduceMotion === 'on') return true;
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

export class Exposure {
  private openFlag = false;
  private t = 0;
  private held = 0;

  get open(): boolean {
    return this.openFlag;
  }

  /** 0..1 of the exposure gathered so far. */
  get fraction(): number {
    return Math.min(1, this.held / EXPOSURE.seconds);
  }

  begin(): void {
    this.openFlag = true;
    this.t = 0;
    this.held = 0;
  }

  reset(): void {
    this.openFlag = false;
  }

  /** How far the shivering frame drifts this frame, radians. Two slow waves, so it wanders, not shakes. */
  drift(dt: number): { yaw: number; pitch: number } {
    this.t += dt;
    const k = reducedMotion() ? 0.3 : 1;
    const t = this.t;
    return {
      yaw: k * EXPOSURE.driftYaw * (0.65 * Math.sin(t * 1.3 + 0.5) + 0.35 * Math.sin(t * 3.1)) * dt,
      pitch: k * EXPOSURE.driftPitch * Math.sin(t * 1.9 + 1.2) * dt,
    };
  }

  /** Gather exposure while the curtain is in the middle. True once it is full. */
  hold(dt: number, onTarget: boolean): boolean {
    if (onTarget) this.held += dt;
    return this.held >= EXPOSURE.seconds;
  }
}
