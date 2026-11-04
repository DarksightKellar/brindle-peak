/**
 * Photography. Frame the subject and press once: no focus meter, no shutter timing, no "photo ruined"
 * message. The only skill is turning to look at the thing properly.
 *
 * The view is a viewfinder: while a photo runs the activity owns an aim (A/D turn, W/S tilt) and hands
 * it to the camera rig through `view()`; the camera moves to Pip's head and looks along it. Framing is
 * a 3D dot product between the aim and the direction to the subject, so a subject in the sky has to be
 * tilted up to, not just turned toward.
 */

import { angleDelta, clamp } from '../../core/contracts';
import type {
  ActivityDef, ActivityHost, ActivityInstance, ActivityReadout, ActivityResult, Vec3,
} from '../../core/contracts';
import { WORDS } from './activityWords';
import { onAurora, photoSubjectFor } from './photoSubjects';
import { aimDirection, aimDot, bearingTo, composition, inFrame, inRange, PHOTO, targetOf, type Target } from './photoAim';

export { aimDirection, aimDot, bearingTo, composition, facingDot, inFrame, inRange, PHOTO, subjectOf } from './photoAim';
import type { PlacedMarker } from './markerLooks';
import { Exposure, EXPOSURE } from './exposure';

/** How far off the subject the viewfinder opens: inside the frame, outside the centring cone. */
const OPEN_OFF = 0.3;
/** During the aurora's exposure, the aim must stay this close (radians) to where the shutter opened. */
const STEADY = 0.06;

export class PhotoActivity implements ActivityInstance {
  readonly def: ActivityDef;
  private target: Target = { kind: 'ground', pos: { x: 0, y: 0, z: 0 } };
  private stage: 'aim' | 'done' | 'aborted' = 'aim';
  private outcome: ActivityResult | null = null;
  private paid = false;
  private swallowPress = false;
  private attempts = 0;
  private aimYaw = 0;
  private aimPitch: number = PHOTO.startPitch;
  /** 'aim' | 'tooClose' | 'tooFar' | 'turn' — a nudge for the viewfinder, never a scold. */
  private hint: 'aim' | 'tooClose' | 'tooFar' | 'turn' = 'aim';
  private lift: number = PHOTO.subjectHeight; // the aim point, above the subject's feet
  /** The aurora's long exposure (exposure.ts), and the aim the shutter opened on. */
  private readonly exposure = new Exposure();
  private opened = { yaw: 0, pitch: 0 };
  private eye: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(def: ActivityDef) {
    this.def = def;
  }

  start(host: ActivityHost): void {
    this.target = targetOf(this.def, host.terrain);
    const s = photoSubjectFor(this.def.id);
    this.lift = s?.kind === 'ground' ? s.lift : PHOTO.subjectHeight;
    this.stage = 'aim';
    this.outcome = null;
    this.paid = false;
    this.attempts = 0;
    // Opened where the chase camera looked, it often stared at a wall and seemed to do nothing. It now
    // opens with the subject in frame but off to one side (OPEN_OFF), so there is still a turn to make.
    // The sky opens on the horizon below the curtains (it used to open already on them).
    const t = this.target;
    this.aimYaw = t.kind === 'sky' ? host.cameraYaw : bearingTo(host.playerPos, t.pos) + OPEN_OFF;
    this.aimPitch = t.kind === 'sky' ? -0.06 : PHOTO.startPitch;
    this.exposure.reset();
    this.hint = 'aim';
    this.swallowPress = true;
  }

  update(dt: number, host: ActivityHost): void {
    if (this.stage !== 'aim') return;
    if (host.input.cancelPressed) {
      this.abort();
      return;
    }

    const pressed = host.input.interactPressed && !this.swallowPress;
    this.swallowPress = false;

    // D / right turns right, which is toward lower yaw under forward = (sin yaw, cos yaw).
    const fine = this.exposure.open ? EXPOSURE.fine : 1;
    const drift = this.exposure.open ? this.exposure.drift(dt) : { yaw: 0, pitch: 0 };
    this.aimYaw += drift.yaw - host.input.moveX * PHOTO.turnRate * dt * fine;
    this.aimPitch = clamp(this.aimPitch + drift.pitch + host.input.moveZ * PHOTO.tiltRate * dt * fine, PHOTO.pitchMin, PHOTO.pitchMax);
    if (this.exposure.open) {
      if (this.exposure.hold(dt, this.steady())) this.take(host, 1, null);
      return;
    }

    const { dot, distance } = this.measure(host.playerPos, this.aimYaw, this.aimPitch);

    // Refreshed every frame, not only on a press: written only on a press, a missed shot left the panel
    // claiming "Centred" while the subject was out of frame.
    if (distance !== null && !inRange(distance)) this.hint = distance < PHOTO.minRange ? 'tooClose' : 'tooFar';
    else if (!inFrame(dot)) this.hint = 'turn';
    else this.hint = 'aim';

    if (!pressed) return;

    this.attempts++;
    if (this.hint !== 'aim') return;
    if (this.target.kind === 'sky') {
      this.exposure.begin();
      this.opened = { yaw: this.aimYaw, pitch: this.aimPitch };
      this.eye = { x: host.playerPos.x, y: host.playerPos.y + PHOTO.eyeHeight, z: host.playerPos.z };
      return;
    }
    this.take(host, dot, distance);
  }

  /** True while the aim is still where the aurora's shutter opened. */
  private steady(): boolean {
    return Math.abs(angleDelta(this.aimYaw, this.opened.yaw)) < STEADY && Math.abs(this.aimPitch - this.opened.pitch) < STEADY;
  }

  private take(host: ActivityHost, dot: number, distance: number | null): void {
    // The sky has no distance; score it as if stood at the comfortable one.
    const score = composition(dot, distance ?? 12);
    const outcome: ActivityResult = { score, bonus: this.def.id };
    this.outcome = outcome;
    this.stage = 'done';
    host.emit('photo:taken', { id: this.def.id, isNew: !host.state.photos[this.def.id] });
    if (!this.paid) {
      this.paid = true;
      host.award(outcome);
    }
  }

  /** Centring and (for ground subjects) horizontal distance, from Pip's eye along an aim. */
  private measure(playerPos: Vec3, yaw: number, pitch: number): { dot: number; distance: number | null } {
    // The aurora is centred when the middle of the frame is on a curtain, wherever the curtain is.
    if (this.target.kind === 'sky') {
      return { dot: onAurora(yaw, pitch) ? 1 : Math.min(aimDot(yaw, pitch, this.target.dir), 0.9), distance: null };
    }
    const s = this.target.pos;
    const dx = s.x - playerPos.x;
    const dy = s.y - (playerPos.y + PHOTO.eyeHeight);
    const dz = s.z - playerPos.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    return { dot: aimDot(yaw, pitch, { x: dx / len, y: dy / len, z: dz / len }), distance: Math.hypot(dx, dz) };
  }

  view(): { yaw: number; pitch: number; centred: boolean } | null {
    const centred = this.exposure.open ? this.steady() : this.hint === 'aim';
    return this.stage === 'aim' ? { yaw: this.aimYaw, pitch: this.aimPitch, centred } : null;
  }

  markers(): readonly PlacedMarker[] {
    // Which thing is "it": an arrow over it, pointing down and turned to the lens, and once it is centred
    // a ring of light on the snow round its feet. The old upright ring hung through the subject and hid
    // it. The sky needs neither: it is the aurora. While its shutter is open, a star hangs where the frame
    // opened, so "hold still" has something to hold the centre on.
    if (this.target.kind !== 'ground') {
      if (!this.exposure.open) return [];
      const d = aimDirection(this.opened.yaw, this.opened.pitch);
      const star = { x: this.eye.x + d.x * 40, y: this.eye.y + d.y * 40, z: this.eye.z + d.z * 40 };
      return [{ shape: 'float', look: 'beacon', ...star, size: 1.4, strength: this.steady() ? 1 : 0.5, yaw: 0 }];
    }
    const s = this.target.pos;
    const on = this.hint === 'aim';
    const arrow: PlacedMarker[] = (['arrow-rim', 'arrow'] as const).map((look) => ({
      shape: 'float', look, x: s.x, y: s.y + 1.6, z: s.z, yaw: this.aimYaw + Math.PI, tilt: Math.PI, size: 0.6,
    }));
    return on ? [...arrow, { shape: 'ring', look: 'halo', x: s.x, y: s.y - this.lift, z: s.z, size: 1.4 }] : arrow;
  }

  progress(): ActivityReadout | null {
    if (this.exposure.open) {
      const steady = this.steady();
      return { label: steady ? WORDS.exposeHold : WORDS.exposeDrift, fraction: this.exposure.fraction, urgent: !steady };
    }
    const label = this.hint === 'aim'
      ? 'Centred — press E'
      : this.hint === 'tooClose' ? 'Too close. Step back, then press E'
        : this.hint === 'tooFar' ? 'Too far. Step closer, then press E'
          : 'Turn until it is centred';
    return { label, fraction: null, urgent: this.hint === 'aim' };
  }

  isComplete(): boolean {
    return this.stage !== 'aim';
  }

  result(): ActivityResult | null {
    return this.stage === 'done' ? this.outcome : null;
  }

  abort(): void {
    if (this.stage !== 'aim') return;
    this.stage = 'aborted';
    this.outcome = null;
  }

  /** Live subject position. A sky subject reports a point 1000 u along its direction from the viewpoint. */
  get subject(): Vec3 {
    if (this.target.kind === 'ground') return { ...this.target.pos };
    const d = this.target.dir;
    return { x: this.def.pos.x + d.x * 1000, y: d.y * 1000, z: this.def.pos.z + d.z * 1000 };
  }

  /** How centred the subject is from a given aim, -1..1. */
  aimFrom(playerPos: Vec3, yaw: number, pitch: number): number {
    return this.measure(playerPos, yaw, pitch).dot;
  }

  summary(): string | null {
    return this.stage === 'done' ? WORDS.photoResult(photoSubjectFor(this.def.id)?.what ?? 'view') : null;
  }

  /** The panel's instruction, naming what the photo is of. */
  instruction(): string | null {
    const what = photoSubjectFor(this.def.id)?.what;
    return what ? WORDS.photoHint(what) : null;
  }

  get lastHint(): 'aim' | 'tooClose' | 'tooFar' | 'turn' { return this.hint; }
  get presses(): number { return this.attempts; }
}

export function createPhotoActivity(def: ActivityDef): PhotoActivity {
  return new PhotoActivity(def);
}
