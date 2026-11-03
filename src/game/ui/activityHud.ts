/**
 * Activity HUD — the presentation layer the minigames never had.
 *
 * QA found that starting any of the 22 activities removed the prompt, froze the player and drew
 * nothing at all: no title, no instruction, no score, no target, no progress. Nineteen of them were
 * brute-forceable only by guesswork, and the three `build` ones were impossible outright.
 *
 * This panel is deliberately text-first rather than a set of 3D props. The mechanics that matter are
 * timing and counting — when the float dips, whether the subject is centred, how many targets are
 * left — and those can be stated exactly, which also means they are legible without a renderer, at
 * any resolution, and for a colour-blind player. It also keeps the pixel scene clean: a floating
 * marker over the snow would fight the look the whole project is built around.
 *
 * The copy below is derived from what each module actually reads:
 *   build   — interactPressed, one piece per press
 *   fish    — interactPressed inside the strike window
 *   photo   — the viewfinder's own aim (moveX turns, moveZ tilts), interactPressed to shoot
 *   throw   — moveX aims, interactPressed throws, eight throws a round
 *   race    — free movement through authored gates
 *   skate   — moveX leans against the balance meter
 *   sled    — moveX
 */

import type { ActivityKind, ActivityReadout } from '../../core/contracts';

export interface ActivityHud {
  /** `hint` replaces the kind's generic line when an activity needs its own (activities/activityWords.ts). */
  show(def: { name: string; kind: ActivityKind; prompt: string; hint?: string }): void;
  /** The run is over: keep the panel up with one line saying how it went, until hide(). */
  showResult(line: string): void;
  update(readout: ActivityReadout | null, seconds: number): void;
  hide(): void;
  isOpen(): boolean;
}

const HINTS: Readonly<Record<ActivityKind, string>> = {
  build: 'Press E at the spot to set the next piece.',
  fish: 'Watch the float. Press E the moment it dips.',
  // The viewfinder overlay already lists the keys, so this line only states the goal.
  photo: 'Centre it in the frame, then press E.',
  throw: 'A / D aims. E throws when the dots brighten.',
  // The race is the one activity that leaves the controls with the player; the next gate is the bright one.
  race: 'Run for the bright gate; A / D to steer.',
  skate: 'Lean with A / D to keep your balance.',
  sled: 'Steer down the hill with A / D.',
};

export function hintFor(kind: ActivityKind): string {
  return HINTS[kind];
}

/** Clamp and format the elapsed clock; minutes only appear when they must. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

/** Seconds the instruction stays up before the panel shrinks to the readout. */
export const HINT_SECONDS = 6;

export function createActivityHud(root: HTMLElement): ActivityHud {
  const panel = document.createElement('section');
  panel.className = 'ui-activity';
  panel.hidden = true;
  panel.innerHTML =
    '<p class="ui-activity__kicker">Activity</p>' +
    '<h2 class="ui-activity__name"></h2>' +
    '<p class="ui-activity__hint"></p>' +
    '<div class="ui-activity__track"><i class="ui-activity__fill"></i></div>' +
    '<p class="ui-activity__label"></p>' +
    '<footer class="ui-activity__foot">Esc — stop</footer>';
  root.appendChild(panel);

  const name = panel.querySelector('.ui-activity__name') as HTMLElement;
  const hint = panel.querySelector('.ui-activity__hint') as HTMLElement;
  const fill = panel.querySelector('.ui-activity__fill') as HTMLElement;
  const label = panel.querySelector('.ui-activity__label') as HTMLElement;
  const track = panel.querySelector('.ui-activity__track') as HTMLElement;
  const foot = panel.querySelector('.ui-activity__foot') as HTMLElement;

  return {
    show(def): void {
      name.textContent = def.name;
      hint.textContent = def.hint ?? hintFor(def.kind);
      hint.hidden = false;
      track.hidden = false;
      foot.hidden = false;
      label.textContent = formatClock(0);
      fill.style.width = '0%';
      panel.classList.remove('is-urgent', 'is-compact');
      panel.hidden = false;
    },
    update(readout, seconds): void {
      if (panel.hidden) return;
      if (seconds >= HINT_SECONDS) panel.classList.add('is-compact');
      if (readout) {
        label.textContent = `${readout.label} · ${formatClock(seconds)}`;
        fill.style.width = readout.fraction === null ? '0%' : `${Math.round(readout.fraction * 100)}%`;
        panel.classList.toggle('is-urgent', readout.urgent === true);
      } else {
        label.textContent = formatClock(seconds);
      }
    },
    showResult(line): void {
      // The same panel stripped to the name and the outcome; the lantern colour marks it as the result.
      hint.hidden = true;
      track.hidden = true;
      foot.hidden = true;
      label.textContent = line;
      panel.classList.add('is-urgent');
      panel.classList.remove('is-compact');
      panel.hidden = false;
    },
    hide(): void {
      panel.hidden = true;
      panel.classList.remove('is-urgent', 'is-compact');
    },
    isOpen: () => !panel.hidden,
  };
}
