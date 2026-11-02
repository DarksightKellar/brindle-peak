/**
 * HUD (ART_BIBLE A6, GDD §8). Kept to what the player acts on:
 *
 *   1. Breath, bottom-left (hudStamina.ts): a bar as long as Pip's stamina, a word at its end only
 *      while a jump or a flap would be refused, and the feather and bell chips beside it.
 *   2. The goal line, the compass strip under it (hudCompass.ts) and the tracked errand's line under
 *      that (errandLine.ts), with its own dimmer mark on the strip. Before the first feather, a near one is
 *      noticed on the strip and once in words (hudFeather.ts).
 *   3. Interact prompt — a keycap plus a verb, on a pill with a notched edge so the shape,
 *      not just the LANTERN hue, distinguishes it (A5, colour-blind safety). It stands over whoever
 *      or whatever E will reach, with a tick pointing down at them (promptAnchor.ts).
 *
 * While a conversation is open the goal, the next line and the compass target hold still (`setHeld`):
 * a quest step that advances as someone starts talking used to rewrite the goal before they had said
 * it, spoiling the next step. The change lands when the conversation closes.
 *
 * Everything renders above the pixel layer at native resolution (A6) — see ui.css.
 */

import type { GameState, PlayerState, Vec2, Vec3 } from '../../core/contracts';
import type { GuideContent } from '../../core/guide/nextStep';
import { formatNextStep, nextStepFor } from '../../core/guide/nextStep';
import { goalTarget } from '../../core/guide/goal';
import { errandLineFor } from './errandLine';
import { goalLine } from './hudText';
import { createHudCompass } from './hudCompass';
import { createHudStamina } from './hudStamina';
import { createFeatherNotice } from './hudFeather';

export interface Hud {
  update(s: GameState, p: PlayerState): void;
  /** `at`: the target's spot on screen in CSS pixels, or null to sit under Pip. */
  setPrompt(text: string | null, at?: { x: number; y: number } | null): void;
  /** True while an E pill is on screen: tutorial tips step aside for it. */
  promptShowing(): boolean;
  /**
   * Show or hide the objective line. The tutorial prompt sits bottom centre and the goal at the top, so
   * the goal stays up through the opening script (docs/ONBOARDING.md).
   */
  setGoalVisible(visible: boolean): void;
  /** Camera yaw in radians; the compass is measured against the view. */
  setViewYaw(yaw: number): void;
  /**
   * The next-step line under the goal (docs/GUIDE.md §1). Hidden while the opening script runs: the
   * script's prompt is the next action then.
   */
  setNextVisible(visible: boolean): void;
  /** Hold the goal, the next line and the target where they are (a conversation is open). */
  setHeld(held: boolean): void;
  /**
   * Where the compass diamond and the world marker point, live: the story's point (core/guide/goal.ts),
   * else the errand line's step. Held with the rest during a conversation, fresh the moment it closes.
   */
  target(): Vec2 | null;
  /**
   * Called at the end of every `update` with what the HUD points at, where from, whether it is held, and
   * the tracked errand's point when it is not the goal: the world markers (world/goalMarker.ts) draw the
   * same points, so they can never disagree with the strip.
   */
  onFrame(fn: (target: Vec2 | null, from: Vec3, held: boolean, side: Vec2 | null) => void): void;
  /** Flash the stamina bar: the receipt for a lesson that cost breath. */
  pulseStamina(): void;
  destroy(): void;
}

export function createHud(root: HTMLElement, guide?: GuideContent): Hud {
  const layer = document.createElement('div');
  layer.className = 'ui-hud';
  layer.innerHTML =
    // "No indication of what to do... that is not a cozy experience." The goal is always on screen.
    '<div class="ui-hud__goal"></div>' +
    '<div class="ui-hud__next"></div>' +
    '<div class="ui-hud__prompt" hidden>' +
    '<span class="ui-hud__rim"><span class="ui-hud__pill">' +
    '<span class="ui-hud__key">E</span>' +
    '<span class="ui-hud__verb">Talk</span>' +
    '</span></span><i class="ui-hud__tick"></i></div>';
  root.appendChild(layer);
  const stamina = createHudStamina(layer);
  const compass = createHudCompass(layer);
  const featherNotice = createFeatherNotice();

  const goalEl = layer.querySelector('.ui-hud__goal') as HTMLElement;
  const nextEl = layer.querySelector('.ui-hud__next') as HTMLElement;
  const prompt = layer.querySelector('.ui-hud__prompt') as HTMLElement;
  const verb = layer.querySelector('.ui-hud__verb') as HTMLElement;

  let lastGoal = '';
  let lastNext = '';
  let lastPlace = '';
  /** Camera yaw, set by the session each frame. The compass is relative to the VIEW, not the body. */
  let viewYaw = 0;
  let nextAllowed = true;
  let held = false;
  let promptUp = false;
  /** What the HUD last pointed at, kept while held. */
  let heldTarget: Vec2 | null = null;
  let errandTarget: Vec2 | null = null;
  let lastState: GameState | null = null;
  let lastFrom: Vec2 = { x: 0, z: 0 };
  const errands = guide ? errandLineFor(guide) : null;
  const frameListeners: ((target: Vec2 | null, from: Vec3, held: boolean, side: Vec2 | null) => void)[] = [];

  const liveTarget = (): Vec2 | null => {
    if (held) return heldTarget;
    const story = guide && lastState ? goalTarget(lastState, lastFrom, guide) : null;
    return story ?? (nextAllowed ? errandTarget : null);
  };

  const writeNext = (text: string, step: ReturnType<typeof nextStepFor>): void => {
    if (text !== lastNext) {
      lastNext = text;
      nextEl.textContent = text;
      nextEl.dataset.quest = step?.questId ?? '';
      nextEl.dataset.step = step?.stepIndex === null || step?.stepIndex === undefined ? '' : String(step.stepIndex);
      nextEl.dataset.zone = step?.zone ?? '';
    }
    const hidden = text === '' || !nextAllowed;
    if (nextEl.hidden !== hidden) nextEl.hidden = hidden;
  };

  return {
    update(s: GameState, p: PlayerState): void {
      stamina.update(s, p);
      lastState = s;
      lastFrom = { x: p.pos.x, z: p.pos.z };
      const feather = featherNotice.update(s, lastFrom, performance.now());
      if (feather.started) stamina.showFeathers(6000);

      if (!held) {
        const main = guide ? nextStepFor(s, p.pos, guide, 'main') : null;
        const goal = goalLine(s, main);
        if (goal !== lastGoal) {
          lastGoal = goal;
          goalEl.textContent = goal;
        }
        // Derived every frame (a dozen comparisons over a table); the DOM is touched only on change.
        // One errand, the tracked one, stays on screen until it is done (errandLine.ts).
        const step = nextAllowed && errands ? errands.pick(s, p.pos) : null;
        errandTarget = step?.target ?? null;
        heldTarget = liveTarget();
        // The feather's one line outranks an errand for its few seconds; the errand is still in the journal.
        if (feather.line !== '') writeNext(feather.line, null);
        else writeNext(formatNextStep(step), step);
      }
      const side = nextAllowed && errandTarget && errandTarget !== heldTarget ? errandTarget : null;
      // With no story point the errand is the goal, and its line wears the goal's mark, not its own.
      nextEl.classList.toggle('is-goal', errandTarget !== null && errandTarget === heldTarget);
      compass.update({ from: lastFrom, viewYaw, goal: heldTarget, side, feather: feather.feather });
      for (const fn of frameListeners) fn(heldTarget, p.pos, held, side);
    },

    onFrame(fn): void {
      frameListeners.push(fn);
    },

    setPrompt(text: string | null, at: { x: number; y: number } | null = null): void {
      promptUp = text !== null && text.trim() !== '';
      if (!promptUp || text === null) {
        prompt.hidden = true;
        return;
      }
      if (verb.textContent !== text) {
        verb.textContent = text;
        prompt.setAttribute('aria-label', `Press E to ${text.toLowerCase()}`);
      }
      // Over whoever E will reach (promptAnchor.ts); under Pip only when that point is off camera.
      const place = at ? `${at.x}px,${at.y}px` : '';
      if (place !== lastPlace) {
        lastPlace = place;
        prompt.classList.toggle('is-over', at !== null);
        prompt.style.left = at ? `${at.x}px` : '';
        prompt.style.top = at ? `${at.y}px` : '';
      }
      prompt.hidden = false;
    },

    promptShowing: () => promptUp,

    setViewYaw(yaw: number): void {
      viewYaw = yaw;
    },

    setGoalVisible(visible: boolean): void {
      // The only writer: a per-frame write here was a layout write for a value that changes twice a run.
      goalEl.hidden = !visible;
    },

    setNextVisible(visible: boolean): void {
      nextAllowed = visible;
      if (!visible) nextEl.hidden = true;
    },

    setHeld(next: boolean): void {
      held = next;
      // The two-shot turns the camera, so a strip measured against it would say "behind you" mid-sentence.
      compass.setVisible(!next);
    },

    target: liveTarget,

    pulseStamina(): void {
      stamina.pulse();
    },

    destroy(): void {
      layer.remove();
    },
  };
}
