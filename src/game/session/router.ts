/**
 * Turns game events into feedback the player can perceive: a toast, a sound, a journal update.
 *
 * Kept separate from the session so the reward cadence lives in one readable table rather than
 * being scattered as `if` statements through the update loop. The tiers here are the binding
 * decision from GDD R5 — bells are pickup tier and fire nothing but a chirp, because 60 bells
 * each demanding attention is not charm, it is noise.
 */

import type { GameEvent } from '../../core/contracts';
import type { RewardTier } from '../../core/contracts';
import type { Toasts } from '../ui/toasts';
import type { AudioKit, SfxName } from '../audio/audio';

export interface Naming {
  zone(id: string): string;
  quest(id: string): string;
  achievement(id: string): string;
}

export interface RouterDeps {
  toasts: Toasts;
  audio: AudioKit;
  naming: Naming;
  featherTotal: number;
  lanternTotal: number;
}

export function routeEvent(e: GameEvent, d: RouterDeps): void {
  switch (e.name) {
    case 'feather:collected':
      d.audio.sfx('feather');
      push(d, `Feather ${e.data.total}/${d.featherTotal}`, 'feather', 'discovery');
      return;

    case 'bell:collected':
      // Pickup tier: a chirp and nothing else. The HUD counter is the only other acknowledgement.
      d.audio.sfx('bell');
      return;

    case 'zone:entered':
      d.audio.sfx('ui');
      push(d, d.naming.zone(e.data.id), 'mountain', 'milestone');
      return;

    case 'quest:started':
      d.audio.sfx('ui');
      push(d, d.naming.quest(e.data.id), 'quest', 'milestone');
      return;

    case 'quest:completed':
      d.audio.sfx('quest');
      push(d, d.naming.quest(e.data.id), 'check', 'milestone');
      return;

    case 'fish:caught':
      d.audio.sfx('quest');
      if (e.data.isNew) push(d, 'New fish in the journal', 'fish', 'discovery');
      return;

    case 'photo:taken':
      d.audio.sfx('ui');
      if (e.data.isNew) push(d, 'Photograph kept', 'camera', 'discovery');
      return;

    case 'lantern:lit':
      d.audio.sfx('bell');
      push(d, `Lantern ${e.data.lit}/${d.lanternTotal}`, 'lantern', 'discovery');
      return;

    case 'activity:completed':
      d.audio.sfx('quest');
      // The activity panel shows the result in words; a toast here would only repeat it.
      return;

    case 'achievement:unlocked':
      d.audio.sfx('achievement');
      push(d, d.naming.achievement(e.data.id), 'achievement', 'milestone');
      return;

    case 'item:gained':
      d.audio.sfx('ui');
      return;

    case 'spring:soaked':
      d.audio.sfx('splash');
      return;

    case 'summit:reached':
      d.audio.sfx('achievement');
      push(d, 'The summit', 'mountain', 'finale');
      return;

    case 'npc:talked':
      return;

    case 'toast':
      push(d, e.data.text, e.data.icon, e.data.tier);
      return;

    default:
      return;
  }
}

function push(d: RouterDeps, text: string, icon: string, tier: RewardTier): void {
  d.toasts.push(text, icon, tier);
}

/** Sound for a footstep on a surface kind. Kept here so the mapping is visible in one place. */
export function stepSfx(surface: string): SfxName {
  if (surface === 'ice') return 'step-ice';
  if (surface === 'rock' || surface === 'wood') return 'step-rock';
  return 'step-snow';
}
