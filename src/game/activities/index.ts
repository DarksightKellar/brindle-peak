/**
 * Activity factory. The world hands in an ActivityDef and gets back something it can
 * start/update/stop without knowing which minigame it is.
 *
 * Lifecycle contract used by every implementation here:
 *   start()   resets to a fresh attempt; the activation press is swallowed.
 *   update()  advances one frame, emits domain events, and calls award() exactly once on
 *             success. A cancel press aborts before anything else in the frame is read.
 *   abort()   terminal. isComplete() becomes true, result() is null, nothing is emitted or
 *             awarded afterwards. The host closes the activity and the player keeps walking.
 *
 * No kind can be failed in a way that costs progress: fishing recasts, skating banks the
 * seconds you held, throwing ends when the snowballs run out, and the photo can be retried
 * from the same spot forever.
 */

import type { ActivityDef, ActivityInstance, FishDef } from '../../core/contracts';
import { FISH } from '../../data/fish';
import { createFishingActivity } from './fishing';
import { createPhotoActivity } from './photo';
import { createSledActivity } from './sled';
import { createSkateActivity } from './skate';
import { createTargetActivity } from './targets';
import { createBuildActivity } from './build';
import { createRaceActivity } from './race';
import { createKiteActivity, KITE_IDS } from './kite';
import { createSnowmanActivity } from './snowman';
import { siteFor } from './buildSites';

export { createFishingActivity } from './fishing';
export { createPhotoActivity } from './photo';
export { createSledActivity } from './sled';
export { createSkateActivity } from './skate';
export { createTargetActivity } from './targets';
export { createBuildActivity } from './build';
export { createRaceActivity } from './race';

function assertNever(kind: never): never {
  throw new Error(`createActivity: unhandled activity kind ${String(kind)}`);
}

/**
 * `fish` is the authored journal table (src/data/fish.ts). The default is id-compatible with
 * it, so passing it is about names and palette, not about correctness.
 */
export function createActivity(def: ActivityDef, fish: readonly FishDef[] = FISH): ActivityInstance {
  switch (def.kind) {
    case 'fish':
      return createFishingActivity(def, fish);
    case 'photo':
      return createPhotoActivity(def);
    case 'sled':
      return createSledActivity(def);
    case 'skate':
      return createSkateActivity(def);
    case 'throw':
      // Sable's kite is a throw in the shared contract's terms (a launch); it plays as a kite.
      return KITE_IDS.has(def.id) ? createKiteActivity(def) : createTargetActivity(def);
    case 'build':
      // The snowman is rolled, not stacked by presses (snowman.ts).
      return siteFor(def).kind === 'snowman' ? createSnowmanActivity(def) : createBuildActivity(def);
    case 'race':
      return createRaceActivity(def);
    default:
      return assertNever(def.kind);
  }
}