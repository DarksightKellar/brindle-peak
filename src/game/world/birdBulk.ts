/**
 * How far the drawn bird reaches past its collision circle. The player resolves as a 0.42 circle
 * (session/worldRules.ts), but the drawn torso is 0.56 across and the beak and wings reach 0.87 to
 * 0.9, so a collider the size of a trunk let Pip's body sink into lantern posts, trees and stakes.
 * Thin solid things are padded by this, so Pip stops with the body against what you see, not in it.
 *
 * Its own module because the colliders, the trail and the landmarks all use it, and the landmarks
 * are imported by the scatter rules the colliders read: one shared number must not close that loop.
 */
export const BIRD_BULK = 0.3;
