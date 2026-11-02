/**
 * Turning a simulated frame into what the player sees and hears, then deciding about the autosave.
 *
 * The one rule encoded here, and the reason it is not inlined any more: **events are applied to state
 * before they are routed to feedback**, so a toast can never announce something the state did not
 * record. Gameplay events are flushed by `mech`; they mutate `state` when routed, so the HUD is updated
 * after the flush rather than before it.
 *
 * Dependencies are described structurally rather than by importing the audio kit, the store and the
 * mechanics object, so this module can be read (and reasoned about) without those systems in scope.
 */

import type { GameState, PlayerState } from '../../core/contracts';
import { routeEvent } from './router';
import type { Presentation } from './presentation';

type GameEvent = Parameters<typeof routeEvent>[0];
export type Weather = 'calm' | 'snow' | 'gust';

export interface FeedbackDeps {
  state: GameState;
  player: PlayerState;
  ui: Presentation;
  mech: { flush(): readonly GameEvent[] };
  audio: {
    setAltitude(y: number): void;
    setWeather(w: Weather): void;
    setMode(m: string): void;
    update(dt: number): void;
  };
  store: { tick(dt: number): void; due(): boolean };
  persist(): void;
  /** An overlay or a non-free-roam activity is up: do not write a save from behind it. */
  blocked: boolean;
  weather: Weather;
}

export function pushFrame(d: FeedbackDeps, dt: number): void {
  const { state, player, ui } = d;

  // Mirror the body into GameState first: everything below reads `state`, and a save taken this frame
  // must describe where the player actually is.
  state.player.pos = { ...player.pos };
  state.player.facing = player.facing;
  state.player.stamina = player.stamina;

  for (const e of d.mech.flush()) routeEvent(e, ui.router);

  ui.hud.update(state, player);
  ui.dialogue.update(dt);
  // The ending card holds them too: a toast slid in beside the card read as a second, smaller card.
  ui.toasts.update(dt, ui.dialogue.isOpen() || ui.ending.isOpen());
  if (ui.journal.isOpen()) ui.journal.rerender(state);

  d.audio.setAltitude(player.pos.y);
  d.audio.setWeather(d.weather);
  // Mantling is a ground verb as far as the audio is concerned; there is no climbing loop for it.
  d.audio.setMode(player.mode === 'mantle' ? 'ground' : player.mode);
  d.audio.update(dt);

  d.store.tick(dt);
  if (d.store.due() && !d.blocked) d.persist();
}
