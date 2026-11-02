/**
 * The seven zone names, in one place.
 *
 * They lived in `game/ui/journal.ts` until the field guide needed them: `src/core/**` may not import
 * the UI layer, and a map that names a zone differently from the journal would be a second, wrong
 * source of truth. Pure data — no logic, no DOM.
 */

import type { ZoneId } from '../core/contracts';

export const ZONE_NAMES: Readonly<Record<ZoneId, string>> = {
  hearth: 'Hearth Hollow',
  pinewind: 'Pinewind Wood',
  reach: 'The Frozen Reach',
  kettles: 'Kettle Springs',
  hamlet: 'Hollowpine Hamlet',
  ridge: 'Windscar Ridge',
  peak: 'Brindle Peak',
};
