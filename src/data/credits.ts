/**
 * Who made the game and what it is made with: shown at the foot of the journal's Settings page
 * (ui/journalTabs.ts), with a pointer to it in the pause menu.
 *
 * Licences are the libraries' own files, read in at build time, so a notice can never drift from the
 * version that ships. three.js is the only library in the game itself (package.json "dependencies");
 * the type is the player's own system monospace, so no font needs a notice.
 */

import THREE_LICENSE from '../../node_modules/three/LICENSE?raw';

export const MAKER = 'DarksightKellar';

export interface CreditLine {
  role: string;
  who: string;
}

export const CREDITS: readonly CreditLine[] = [
  { role: 'Made by', who: MAKER },
  { role: 'Music', who: 'Three tracks made with Lyria 3 Pro, Google’s music model' },
  { role: 'Sound', who: 'Every effect and the wind, water and birds are made by the game as it plays' },
  { role: 'Built with', who: 'three.js, under the MIT licence below' },
];

export const LICENCES: readonly { name: string; text: string }[] = [{ name: 'three.js', text: THREE_LICENSE.trim() }];
