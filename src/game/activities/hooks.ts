/**
 * Optional things an activity can ask of the session beyond the shared contract.
 *
 * `ActivityInstance` lives in core/contracts.ts and is shared with other work, so these stay here as
 * duck-typed extras the runner (session/activityRunner.ts) looks for. An activity that has none of
 * them behaves exactly as before.
 */

import type { ActivityInstance, Vec3 } from '../../core/contracts';
import type { Collider } from '../../core/player/collide';

export interface ActivityExtras {
  /** Heading the body (and so the chase camera) should hold every frame, e.g. a throw's aim. */
  facing?(): number;
  /** Heading to turn to once as the activity opens, so what it is about is on screen. */
  startYaw?(): number | null;
  /** Where the activity is carrying Pip this frame (a sled), or null to leave the body alone. */
  ride?(): (Vec3 & { yaw: number }) | null;
  /**
   * A point the camera should frame together with Pip, from the side (the conversation two-shot), or
   * null for the chase view. Fishing uses it: from behind, the bird stands exactly over the float.
   * `facing` (0 = +Z) is the side the camera should favour, as a speaker's face is in a conversation.
   */
  focus?(): (Vec3 & { facing?: number }) | null;
  /** The panel's instruction when the kind's generic one would not say what to do (a photo names its subject). */
  instruction?(): string | null;
  /** One line saying how the finished attempt went, in the player's terms. Null if aborted. */
  summary?(): string | null;
  /** What Pip bumps into while the activity runs: the race's lamp-posts stand only during the race. */
  solids?(): readonly Collider[];
  /** What Pip bumps into for good once the activity has finished: a snowman, once it stands. */
  lasting?(): readonly Collider[];
}

export const extras = (a: ActivityInstance): ActivityExtras => a as unknown as ActivityExtras;
