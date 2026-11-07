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
import { goalTarget, unmetAfterStory } from '../../core/guide/goal';
import { aroundAim, routeAim, type GuideBox } from '../../core/guide/route';
import { formatDistance } from '../../core/guide/compass';
import { errandLineFor, type ErrandLine } from './errandLine';
import { goalLine } from './hudText';
import { bearing, createHudCompass } from './hudCompass';
import { createHudStamina } from './hudStamina';
import { createNearbyNotice, NOTICE_RANGE, nearbyTodo, viewWay } from './hudNearby';
import { hopBlocked, hopPlaces } from '../session/travel';
import { ACTIVITIES } from '../../data/activities';
import { PICKUPS } from '../../data/pickups';
import { QUESTS } from '../../data/quests';
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
  /** Point the compass strip at a running activity's own target (a race's next gate); null for the goal. */
  setCourse(at: Vec2 | null): void;
  /** The buildings' footprints: a near goal behind one is pointed at round it (route.ts `aroundAim`). */
  setBuildings(boxes: readonly GuideBox[]): void;
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

/** Other errands' places nearer than this get a mark on the compass strip, in world units. */
const ERRAND_SEEN = 200;

/** Farther than this, an errand step in ground already walked is worth a hop rather than a walk. */
const HOP_HINT = 150;

/**
 * " · the map can take you back" on an errand step that lies far off in a place Pip has already walked. Critic round 6
 * walked 180 units back to Ilsa and to Hollis with the map hop one key away and never thought of it.
 */
function hopHint(s: GameState, step: ReturnType<typeof nextStepFor>): string {
  if (!step || step.zone === null || (step.distance ?? 0) < HOP_HINT) return '';
  if (hopBlocked(s, false) !== null || !hopPlaces(s).includes(step.zone)) return '';
  // A step that asks for the walk itself is not one the map can do (critic round 60 hopped to Pinewind for Jory).
  const when = QUESTS.find((q) => q.id === step.questId)?.steps[step.stepIndex ?? -1]?.when;
  if (when?.kind === 'visited' && when.hop !== true) return '';
  // The way, not the keys (critic round 55 read "M, E" as a key prompt on the goal line).
  return ' · the map can take you back';
}

/** Two errands' places closer than this are one place: the line names only the one it follows. */
const SAME_PLACE = 6;

/** Milliseconds the line says which errand it moved on to. */
const SWITCH_SHOW = 5000;

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
  const nearbyNotice = guide ? createNearbyNotice(ACTIVITIES) : null;

  const goalEl = layer.querySelector('.ui-hud__goal') as HTMLElement;
  const nextEl = layer.querySelector('.ui-hud__next') as HTMLElement;
  const prompt = layer.querySelector('.ui-hud__prompt') as HTMLElement;
  const verb = layer.querySelector('.ui-hud__verb') as HTMLElement;

  let lastGoal = '';
  let lastNext = '';
  let lastPlace = '';
  /** Camera yaw, set by the session each frame. The compass is relative to the VIEW, not the body. */
  let viewYaw = 0;
  let switchedTitle = '';
  let switchedUntil = 0;
  let nextAllowed = true;
  let held = false;
  let promptUp = false;
  /** What the HUD last pointed at, kept while held. */
  let heldTarget: Vec2 | null = null;
  /** A running activity's own point (its next gate), which the strip shows instead of the goal. */
  let course: Vec2 | null = null;
  let errandTarget: Vec2 | null = null;
  let otherErrands: ReturnType<ErrandLine['others']> = [];
  let lastState: GameState | null = null;
  let lastFrom: Vec2 = { x: 0, z: 0 };
  const errands = guide ? errandLineFor(guide) : null;
  const frameListeners: ((target: Vec2 | null, from: Vec3, held: boolean, side: Vec2 | null) => void)[] = [];

  /** The walk left to the goal when it follows a route rather than the straight line (route.ts). */
  let goalDistance: number | undefined;
  let buildings: readonly GuideBox[] = [];
  /** After the story with an errand under way: the unmet villager the goal line names, for its own mark. */
  let helloAt: Vec2 | null = null;

  const liveTarget = (): Vec2 | null => {
    if (held) return heldTarget;
    // After the story, an errand under way has the pin, and the hello waits: critic round 41 picked an
    // errand on the Quests page and watched the compass stay on a villager it had not met. The hello gets
    // a mark of its own instead (critic round 49 found nothing pointing at Orla); round 50 gave it the pin
    // when it was nearer, and in the hamlet the pin swapped between villagers under critic round 50.
    const unmet =
      guide && lastState && errandTarget && Object.values(lastState.quests).some((q) => q.status === 'active')
        ? unmetAfterStory(lastState, lastFrom, guide)
        : null;
    helloAt = unmet ? { x: unmet.pos.x, z: unmet.pos.z } : null;
    const errandFirst = unmet !== null;
    const story = guide && lastState && !errandFirst ? goalTarget(lastState, lastFrom, guide) : null;
    storyMarked = story !== null;
    // An errand standing as the goal walks the trail too (route.ts): Tuck's bridge sits over a gorge.
    const point = story ?? (nextAllowed ? errandTarget : null);
    pointed = point;
    const routed = point && guide?.routes ? routeAim(guide.routes, lastFrom, point) : null;
    goalDistance = routed?.distance;
    return routed?.aim ?? point;
  };

  /**
   * Where the errand lies when its mark is off the compass strip. Critic round 11 saw the errand's
   * diamond pinned to the strip's edge, read no way to turn, and walked away from it. The goal's own
   * distance says "behind you"; the errand's line now says the same. No key named: the director's call
   * (round 47), the opening teaches walking.
   */
  /** What the goal points at before any route bends it: the errand's own place when it is the goal. */
  let pointed: Vec2 | null = null;
  /** The goal line's own place is the compass's big diamond. */
  let storyMarked = false;
  let offSide = 0;
  const offStrip = (at: Vec2 | null): string => {
    if (!at) return '';
    const rel = bearing(at.x - lastFrom.x, at.z - lastFrom.z, viewYaw);
    // The strip's own rule (hudCompass.ts): off its half of the horizon is "behind you", and which way
    // round (critic round 47). Nearly straight behind, the side said last is kept, so it doesn't flicker.
    if (Math.abs(rel) <= Math.PI / 2) {
      offSide = 0;
      return '';
    }
    if (offSide === 0 || Math.abs(rel) < (Math.PI * 5) / 6) offSide = Math.sign(rel) || 1;
    return ` · behind you, to your ${offSide > 0 ? 'right' : 'left'}`;
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
      const feather = featherNotice.update(s, lastFrom, performance.now(), viewYaw);
      if (feather.started) stamina.showFeathers(6000);

      if (!held) {
        const main = guide ? nextStepFor(s, p.pos, guide, 'main') : null;
        const unmet = guide && !main ? unmetAfterStory(s, p.pos, guide) : null;
        const line = goalLine(s, main, unmet?.name ? { name: unmet.name, zone: guide?.zoneNames[unmet.zone] ?? '' } : null);
        // The hello says where it is itself: critic round 54 read "say hello to Margit, in The Frozen Reach"
        // with nothing saying how far or which way, and round 67 still did with no errand under way, when
        // the hello is the compass's own goal. Then it gives the compass's number (the walk, route.ts).
        const straight = unmet ? Math.hypot(unmet.pos.x - p.pos.x, unmet.pos.z - p.pos.z) : 0;
        const away = helloAt ? straight : goalDistance ?? straight;
        // The story's line carries the compass's own number, as the errand's line carries its own: critic
        // round 69 read 1164 u on the strip and 773 u under it and could not tell which line each was.
        const storyAway = storyMarked && pointed ? goalDistance ?? Math.hypot(pointed.x - p.pos.x, pointed.z - p.pos.z) : null;
        const goal = unmet
          ? `${line.replace(/\.$/, '')}: ${formatDistance(away)}, ${viewWay(unmet.pos.x - p.pos.x, unmet.pos.z - p.pos.z, viewYaw)}.`
          : storyAway !== null && line !== ''
            ? `${line.replace(/\.$/, '')} — ${formatDistance(storyAway)}`
            : line;
        if (goal !== lastGoal) {
          lastGoal = goal;
          goalEl.textContent = goal;
        }
        // Derived every frame (a dozen comparisons over a table); the DOM is touched only on change.
        // One errand, the tracked one, stays on screen until it is done (errandLine.ts).
        const step = nextAllowed && errands ? errands.pick(s, p.pos) : null;
        // The line moved to another errand by itself (one finished): it says so for a few seconds, so
        // a new name under the goal is not a surprise (critic round 22).
        const moved = errands?.switched() ?? null;
        if (moved !== null) {
          switchedTitle = moved;
          switchedUntil = performance.now() + SWITCH_SHOW;
        }
        errandTarget = step?.target ?? null;
        heldTarget = liveTarget();
        // The feather's one line outranks an errand for its few seconds; the errand is still in the journal.
        // So does a thing to do coming near for the first time (hudNearby.ts), for its few seconds.
        // The other live errands: named the same way when one comes near, and marked on the strip.
        otherErrands = nextAllowed && errands ? errands.others(s, lastFrom) : [];
        const notable = otherErrands
          .filter((o) => o.questId !== null && o.target !== null && (o.distance ?? Infinity) < NOTICE_RANGE)
          // Not when it waits at the same place as the errand on the line: two errands with Skiff gave
          // critic round 67 "Next: … 35 u" over "Errand nearby: … 35 u", the same walk said twice.
          .filter((o) => !errandTarget || Math.hypot((o.target as Vec2).x - errandTarget.x, (o.target as Vec2).z - errandTarget.z) > SAME_PLACE)
          .map((o) => ({ id: `errand:${o.questId}:${o.stepIndex}`, label: `Errand nearby: ${o.questTitle}`, pos: o.target as Vec2 }));
        // Gus's counter, once Pip can pay for a feather: critic round 36 had 201 bells, read "Spend them on
        // Gus's feathers in the hamlet" and walked through the square without finding him.
        const shop = PICKUPS.find((q) => q.price !== undefined && s.flags[`picked:${q.id}`] !== true && s.bells >= q.price);
        if (shop) notable.push({ id: 'shop:gus', label: `Gus's feathers nearby: ${shop.price} bells each`, pos: { x: shop.pos.x, z: shop.pos.z } });
        const noticed = nextAllowed && feather.line === ''
          ? nearbyNotice?.update(s, lastFrom, performance.now(), notable, viewYaw) ?? ''
          : '';
        // Not the place the errand line already names: critic round 49 read "Creek Pool nearby… 43 u" under
        // "Next: Fish the Creek Pool… 43 u".
        const named = step?.target ? ACTIVITIES.find((a) => a.pos.x === step.target?.x && a.pos.z === step.target?.z) : undefined;
        const nearby = named && noticed.startsWith(`${named.name} nearby`) ? '' : noticed;
        // A thing nearby goes on a second line under the errand, not over it: critic round 16 lost the
        // errand's distance to "Pressure Ridges nearby" and "Boathouse Hill nearby" again and again.
        const now = performance.now() < switchedUntil ? `Now on the line: ${switchedTitle}
` : '';
        // A word on the way (errandLine.ts) says so, so the followed errand isn't thought dropped.
        const said = errands?.onTheWay() ? formatNextStep(step).replace(/^Next: /, 'On the way: ') : formatNextStep(step);
        const errandText = step ? `${now}${said}${offStrip(step.target ?? null)}${hopHint(s, step)}` : '';
        if (feather.line !== '') writeNext(feather.line, null);
        // Two lines at most under the compass: critic round 57 read four, "Now on the line", the errand,
        // its wrap and a nearby line. The nearby line waits while the switch is being said.
        else if (nearby !== '' && errandText !== '' && now !== '') writeNext(errandText, step);
        else if (nearby !== '' && errandText !== '') writeNext(`${errandText}\n${nearby}`, step);
        else if (nearby !== '') writeNext(nearby, null);
        else writeNext(errandText, step);
      }
      const side = nextAllowed && errandTarget && errandTarget !== pointed ? errandTarget : null;
      // Each line wears the mark it has on the strip. Critic round 69 read "Take the batteries to Edda"
      // over "Next: Take Bram's good rope… 773 u", saw one diamond and 1164 u, and could not tell whose.
      goalEl.classList.toggle('is-goal', !held && storyMarked);
      goalEl.classList.toggle('is-hello', !held && !storyMarked && helloAt !== null);
      // With no story point the errand is the goal, and its line wears the goal's mark, not its own.
      nextEl.classList.toggle('is-goal', errandTarget !== null && errandTarget === pointed);
      const todo = nextAllowed && !held ? nearbyTodo(ACTIVITIES, s, lastFrom) : [];
      const errandMarks = nextAllowed && !held
        ? otherErrands.filter((o) => (o.distance ?? Infinity) < ERRAND_SEEN).map((o) => o.target as Vec2)
        : [];
      // The villager the goal line says to greet, wherever they are: the same hollow mark as an errand's.
      if (helloAt && nextAllowed && !held) errandMarks.push(helloAt);
      // The strip goes round a building in the way; the beam over the target stays where it is.
      const round = heldTarget && !held ? aroundAim(buildings, lastFrom, heldTarget) : null;
      if (course) compass.update({ from: lastFrom, viewYaw, goal: course, side: null, feather: null, todo: [], errands: [] });
      else compass.update({ from: lastFrom, viewYaw, goal: round?.aim ?? heldTarget, goalDistance: round?.distance ?? goalDistance, side, feather: feather.feather, todo, errands: errandMarks });
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

    setCourse(at: Vec2 | null): void {
      course = at;
    },

    setBuildings(boxes): void {
      buildings = boxes;
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
