/**
 * Save cadence and storage access.
 *
 * The key carries the save version, because `load` rejects anything whose `version` does not match
 * `SAVE_VERSION` — keeping the v1 key while the version moved to 2 meant every old save was read,
 * rejected and silently discarded on each boot.
 */

import type { GameState } from '../../core/contracts';
import { SAVE_VERSION } from '../../core/contracts';
import { load, save } from '../../core/progress/save';

// Named before the game was renamed Brindle Peak; kept, so saves made under the old name still load.
export const SAVE_KEY = `first-snow.save.v${SAVE_VERSION}`;
/** Seconds between autosaves. Zone changes also save. */
export const SAVE_EVERY = 30;

export interface Persistence {
  /** Write now. Returns true when the write landed. */
  persist(): void;
  /** Seconds since the last write, advanced by the frame. */
  tick(dt: number): void;
  /** True when an autosave is due. */
  due(): boolean;
  /** Read a previous run, or null if absent/unreadable/from another version. */
  load(): GameState | null;
}

export function createPersistence(getState: () => GameState): Persistence {
  let sinceSave = 0;

  return {
    persist(): void {
      sinceSave = 0;
      try {
        localStorage.setItem(SAVE_KEY, save(getState()));
      } catch {
        // Private mode or a full quota: running unsaved is not a crash.
      }
    },
    tick(dt: number): void {
      sinceSave += dt;
    },
    due: () => sinceSave > SAVE_EVERY,
    load(): GameState | null {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        return raw ? load(raw) : null;
      } catch {
        return null;
      }
    },
  };
}
