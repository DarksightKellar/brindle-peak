/**
 * The key bindings, and how each key is written on screen, in one place. Input reads the bindings;
 * every hint in the game (the HUD prompt, dialogue, activity lines, the pause menu, the first steps)
 * reads the names. Rebinding a key here changes what the game listens for and everything that names it.
 *
 * Bindings are `KeyboardEvent.key`, lower-cased. The first key of an action is the one hints name.
 */

export type Action =
  | 'up' | 'down' | 'left' | 'right'
  | 'jump' | 'sprint' | 'interact' | 'lookLeft' | 'lookRight'
  | 'pause' | 'journal' | 'map';

export const BINDINGS: Readonly<Record<Action, readonly string[]>> = {
  up: ['w', 'arrowup'],
  down: ['s', 'arrowdown'],
  left: ['a', 'arrowleft'],
  right: ['d', 'arrowright'],
  jump: [' ', 'spacebar', 'space'],
  sprint: ['shift'],
  // The director's binding: Q and E look, either side of W; interact moved to F for it.
  interact: ['f', 'enter'],
  lookLeft: ['q'],
  lookRight: ['e'],
  pause: ['escape'],
  journal: ['tab', 'j'],
  map: ['m'],
};

const NAMES: Readonly<Record<string, string>> = {
  ' ': 'Space', spacebar: 'Space', space: 'Space', shift: 'Shift', escape: 'Esc', enter: 'Enter', tab: 'Tab',
  arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→',
};

/** A key as the screen writes it: "F", "Space", "Esc", "↑". */
export function keyName(key: string): string {
  return NAMES[key] ?? key.toUpperCase();
}

/** The key a hint names for an action (its first binding). */
export function keyFor(action: Action): string {
  return keyName(BINDINGS[action][0] ?? '');
}

/** Every key that does an action, named and joined: "Tab · J". Aliases that print the same appear once. */
export function keysFor(action: Action, joiner = ' · '): string {
  return [...new Set(BINDINGS[action].filter((k) => !k.startsWith('arrow')).map(keyName))].join(joiner);
}

/** The names hints use, read once. */
export const KEY = {
  interact: keyFor('interact'),
  jump: keyFor('jump'),
  sprint: keyFor('sprint'),
  pause: keyFor('pause'),
  map: keyFor('map'),
  journal: keyFor('journal'),
  journalAll: keysFor('journal'),
  look: `${keyFor('lookLeft')} · ${keyFor('lookRight')}`,
  up: keyFor('up'),
  down: keyFor('down'),
  left: keyFor('left'),
  right: keyFor('right'),
  /** The four walking keys in the order players say them: "W A S D". */
  walk: [keyFor('up'), keyFor('left'), keyFor('down'), keyFor('right')].join(' '),
  /** Left and right, as activities that steer or aim name them: "A / D". */
  steer: `${keyFor('left')} / ${keyFor('right')}`,
  /** Up and down, as the viewfinder's tilt names them: "W / S". */
  tilt: `${keyFor('up')} / ${keyFor('down')}`,
} as const;

/** The action a key does, if any. */
export function actionOf(key: string): Action | null {
  for (const a of Object.keys(BINDINGS) as Action[]) if (BINDINGS[a].includes(key)) return a;
  return null;
}
