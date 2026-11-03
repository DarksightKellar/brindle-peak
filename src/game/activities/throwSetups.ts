/**
 * What each throwing activity is thrown at, and what counts as done.
 *
 * Read off the quest text: the pinecone toss is three swinging posts and Tamsin wants it "won,
 * badly", so any round that ends counts; Gus's bell is the real bell on the post in the middle of
 * Hollowpine Hamlet, and "cleanly" means a snowball that actually strikes it. Every round also ends
 * when the throws run out, hit or not, and is still counted — nobody gets stuck on a throw.
 */

import type { ActivityDef, Vec3 } from '../../core/contracts';
import { makeRng } from '../../core/contracts';
import { LANDMARKS } from '../world/landmarks';
import type { Strikeable } from './throwFlight';

export type ThrowKind = 'fan' | 'bell';

export interface ThrowSetup {
  kind: ThrowKind;
  /** Hits that finish the round early. */
  need: number;
  /** Throws in the pouch. Generous: the round is about landing a few, not rationing. */
  budget: number;
  /** What leaves the hand. */
  missile: 'shot' | 'pinecone';
  /**
   * Bearing the fan of targets is centred on, from the post. Fixed so the start prop can stand clear of
   * it: centred on wherever the camera happened to look, the toss's own flagpole stood in the aim line.
   */
  facing?: number;
}

export const THROW_SETUPS: Readonly<Record<string, ThrowSetup>> = {
  'pinewind-pinecone-throw': { kind: 'fan', need: 3, budget: 8, missile: 'pinecone', facing: 0 },
  'hamlet-bell-throw': { kind: 'bell', need: 1, budget: 8, missile: 'shot' },
};

export const DEFAULT_SETUP: ThrowSetup = { kind: 'fan', need: 3, budget: 8, missile: 'shot' };

export function setupFor(def: ActivityDef): ThrowSetup {
  return THROW_SETUPS[def.id] ?? DEFAULT_SETUP;
}

// ---------------------------------------------------------------------------
// The swinging posts
// ---------------------------------------------------------------------------

export const FAN = {
  /** Swing amplitude in radians either side of the post's centre bearing. */
  amplitude: 0.22,
  /** Hit radius and half-height of a post. The drawn post is 0.3 u across and 2 u tall. */
  radius: 0.85,
  half: 1.1,
  /** Height of the hit centre above the post's foot. */
  centre: 1,
} as const;

export interface ThrowTarget {
  id: number;
  /** Centre bearing from the activity post. */
  angle: number;
  distance: number;
  /** Swing speed, radians per second. */
  swing: number;
  phase: number;
  down: boolean;
  /** Round clock when it was knocked down, for the tip-over; -1 while standing. */
  downAt: number;
}

/** Bearing of a target at a given moment. Pure: same inputs, same swing. */
export function targetAngle(target: ThrowTarget, elapsed: number): number {
  return target.angle + Math.sin(elapsed * target.swing + target.phase) * FAN.amplitude;
}

/** Foot of a target on the ground plane at a given moment. */
export function targetFoot(origin: { x: number; z: number }, target: ThrowTarget, elapsed: number): { x: number; z: number } {
  const a = targetAngle(target, elapsed);
  return { x: origin.x + Math.sin(a) * target.distance, z: origin.z + Math.cos(a) * target.distance };
}

/**
 * Three posts fanned across the view, centred on `facing` (the camera's heading at the start), so
 * the round opens with every target already on screen.
 */
export function makeFan(def: ActivityDef, facing: number): ThrowTarget[] {
  const rng = makeRng(Math.abs(Math.round(def.pos.x * 3571 + def.pos.z * 823)) >>> 0);
  const offsets = [-0.42, 0.02, 0.44];
  const distances = [9, 12.5, 16];
  const swings = [0.5, 0.4, 0.32];
  return offsets.map((offset, i) => ({
    id: i,
    angle: facing + offset + rng.range(-0.04, 0.04),
    distance: distances[i],
    swing: swings[i],
    phase: rng.range(0, Math.PI * 2),
    down: false,
    downAt: -1,
  }));
}

// ---------------------------------------------------------------------------
// The bell
// ---------------------------------------------------------------------------

/** The hamlet bell: the lantern-coloured bell hung 2.85 u up the post at the square (landmarks.ts). */
const SQUARE = LANDMARKS.find((l) => l.id === 'hamlet') ?? { x: 250, z: 120 };
export const BELL = { x: SQUARE.x, z: SQUARE.z, up: 2.85, radius: 1.1, half: 0.9 } as const;

export function bellTarget(groundAt: (x: number, z: number) => number): Strikeable {
  const pos: Vec3 = { x: BELL.x, y: groundAt(BELL.x, BELL.z) + BELL.up, z: BELL.z };
  return { pos, radius: BELL.radius, half: BELL.half };
}
