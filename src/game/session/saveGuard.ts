/**
 * A one-way gate on writing saves, for the one case where writing is the bug.
 *
 * Reset progress clears the save key and reloads. But the game saves on `pagehide` — which is exactly
 * what a reload fires — so the reload rewrote the run it had just deleted, and reset appeared to do
 * nothing: the player came back where they stood, with their journal intact. Clearing and reloading
 * cannot work while an unload hook is armed.
 *
 * Suppression is deliberately one-way and process-wide: it is only ever used immediately before a
 * reload, in a page that is about to cease to exist.
 */

let suppressed = false;

/** Stop all further writes. Call immediately before clearing the save and reloading. */
export function suppressSaves(): void {
  suppressed = true;
}

export function savesAllowed(): boolean {
  return !suppressed;
}
