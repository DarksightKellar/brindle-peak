/**
 * Onboarding glue: the only place that knows both the world and the script.
 *
 * Each frame it latches what the player has actually done — distance walked, the map opened, a dialogue
 * ever opened, the ground ever left, a flap ever spent, the journal ever opened — hands that `Snapshot`
 * to the pure machine, and turns the machine's events into what the player sees: the prompt bar, a
 * pulse of the stamina bar, a toast. When the script retires it hides the bar, lets the next-step line
 * show again and writes the save.
 *
 * Everything the script *decides* is in `core/onboarding`; everything time-, DOM- and save-shaped is
 * here. That split is why the ordering can be unit-tested without a browser.
 *
 * Progress is saved beat by beat: a player who quits after talking to Nana resumes at the map beat,
 * not at "W A S D — walk".
 */

import type { EventBus, GameState, InputFrame, PlayerState, Vec3 } from '../../core/contracts';
import type { BeatContext, BeatPayout, Snapshot, TutorialBeat } from '../../core/onboarding/steps';
import { beatApplies } from '../../core/onboarding/steps';
import type { OnboardingEvent } from '../../core/onboarding/machine';
import { createOnboarding } from '../../core/onboarding/machine';
import type { Presentation } from './presentation';
import { NPCS } from '../../data/npcs';
import { QUESTS } from '../../data/quests';
import { talkReach } from './interact';

/** The story's first chapter, and who it starts with: its giver, and how far E reaches them. */
const FIRST = QUESTS.find((q) => q.main);
const OPENER = FIRST?.giver;
const OPENER_NPC = NPCS.find((n) => n.id === OPENER) ?? null;
const OPENER_AT = OPENER_NPC?.pos ?? null;
const OPENER_REACH = OPENER_NPC ? talkReach(OPENER_NPC) : 0;

export interface OnboardingDeps {
  state: GameState;
  player: PlayerState;
  /** Where the run started: beat 1 measures from here, not from the checkpoint. */
  spawn: Vec3;
  bus: EventBus;
  ui: Presentation;
  /** Write progress now, so a beat survived a reload on the next frame. */
  persist(): void;
}

export interface Onboarding {
  /** One call per frame, after the player has moved. */
  update(dt: number, input: InputFrame): void;
}

interface Pending {
  text: string;
  icon: string;
  tier: BeatPayout['tier'];
}

export function createOnboardingScript(d: OnboardingDeps): Onboarding {
  const { state, player, spawn, bus, ui } = d;

  // Resume from the saved beat. `createOnboarding` restarts at beat 1 for an unknown id.
  const machine = createOnboarding(undefined, state.onboardingBeat);
  let active = !state.onboardingDone && !machine.isDone();

  let travelled = 0;
  let mapOpenedEver = false;
  let prevGrounded = player.grounded;
  let prevFlaps = player.flapsUsed;
  let prevStamina = player.stamina;
  let dialogueOpenedEver = false;
  let journalOpenedEver = false;
  let leftGroundEver = false;
  let flappedEver = false;
  /** A toast earned behind a full-screen panel, queued until the panel closes. */
  let pending: Pending | null = null;

  const covered = (): boolean => ui.journal.isOpen() || ui.menu.isOpen() || ui.ending.isOpen();
  /**
   * A dialogue takes the whole lower third: no prompt is drawn over someone speaking. A running
   * activity has its own panel and keys, and "M — open the map" over a viewfinder is a lie: M does
   * nothing while it runs.
   */
  const promptBlocked = (): boolean => ui.dialogue.isOpen() || ui.activity.isOpen() || covered();

  const hidePrompt = (): void => ui.tutorial.hide();

  /** This frame's moment, for `beatApplies`. Climbing and mantling are neither flying nor walking. */
  const context = (): BeatContext => ({
    airborne: player.mode === 'air' || player.mode === 'glide',
    moving: player.mode === 'ground' && Math.hypot(player.vel.x, player.vel.z) > 1,
    // The same reach the E pill uses (interact.ts), so the hint and the pill come and go together.
    openerInReach: OPENER_AT !== null && Math.hypot(player.pos.x - OPENER_AT.x, player.pos.z - OPENER_AT.z) <= OPENER_REACH,
  });

  /*
    The prompt takes the objective line's slot: the mountain goal goes away for the duration. Both on
    at once is the one thing the script must never do.
  */
  const retire = (): void => {
    if (!active) return;
    active = false;
    hidePrompt();
    ui.hud.setGoalVisible(true);
    // The field guide's next-step line waited its turn: one prompt at a time, and the script's beat
    // was the prompt. Now the derived line takes over for the rest of the run.
    ui.hud.setNextVisible(true);
    state.onboardingDone = true;
    state.onboardingBeat = null;
    d.persist();
  };

  const pay = (beat: TutorialBeat): void => {
    const p: BeatPayout = beat.payout;
    if (p.breath) ui.hud.pulseStamina();
    if (p.toast === null) return;
    // The journal is a full-screen overlay and the last beat retires behind it: a toast queued now
    // would be drawn under the panel and expire unseen, so it waits for the close.
    if (covered()) pending = { text: p.toast, icon: p.icon, tier: p.tier };
    else bus.emit('toast', { text: p.toast, icon: p.icon, tier: p.tier });
  };

  const handle = (events: readonly OnboardingEvent[]): void => {
    for (const e of events) {
      if (e.kind === 'enter') {
        ui.tutorial.show(e.beat);
        // Mid-script progress, saved as it happens rather than only at the end.
        if (state.onboardingBeat !== e.beat.id) {
          state.onboardingBeat = e.beat.id;
          d.persist();
        }
      } else if (e.kind === 'complete') pay(e.beat);
      else if (e.kind === 'retire') retire();
      // A lapsed tip pays nothing: the next beat's `enter` follows in the same list.
    }
  };

  const latch = (input: InputFrame): Snapshot => {
    const fromSpawn = (): number => Math.hypot(player.pos.x - spawn.x, player.pos.z - spawn.z);
    travelled = Math.max(travelled, fromSpawn());
    // The map page being open is the evidence. `M` and the journal tab both land here.
    if (ui.journal.isOpen() && ui.journal.currentTab() === 'Map') mapOpenedEver = true;
    /*
     * A jump is not merely "left the ground". `grounded` goes false in five places in step.ts:
     * jumping, climbing, mantling, being pushed off a ledge, and walking into a slope. Latching on the
     * edge alone paid for "Space — jump" whenever the player walked into a steep face, and then asked
     * them to flap having never taught the first press. The vertical speed is the tell: a jump leaves
     * the ground at `jumpSpeed` (9), a climb rises at `climbSpeed` (2.2), a fall is negative.
     */
    const launched = prevGrounded && !player.grounded && player.vel.y > 4;
    if (launched) leftGroundEver = true;
    if (player.flapsUsed > prevFlaps) flappedEver = true;
    prevGrounded = player.grounded;
    prevFlaps = player.flapsUsed;

    /*
     * Sprint is "spent breath", not "Shift is down". Holding Shift while standing still, or while a
     * panel is open, does not sprint — step.ts gates on grounded, a movement axis, and stamina — but
     * the raw input flag is true in all three cases, so the beat paid for nothing. Stamina actually
     * draining is the consequence that cannot be faked by holding a key.
     */
    const spentBreath = prevStamina - player.stamina > 1e-6;
    prevStamina = player.stamina;
    if (ui.dialogue.isOpen()) dialogueOpenedEver = true;
    if (ui.journal.isOpen()) journalOpenedEver = true;
    return {
      travelled, mapOpenedEver, sprintHeld: input.sprintHeld && spentBreath,
      dialogueOpenedEver, leftGroundEver, flappedEver, journalOpenedEver,
    };
  };

  if (active) {
    // The goal stays up. The prompt sits at the bottom and the goal at the top, so they do not collide;
    // hiding the mountain for the length of the script left a player who never opened the journal with
    // no stated destination at all. The *next-step* line does wait: it is a second instruction, and
    // the script is the only thing allowed to tell a new player what to do.
    // The first prompt appears on the first frame, once its context is known (a resumed run may be
    // standing far from Nana with the talk beat current).
    ui.hud.setNextVisible(false);
  }

  return {
    update(dt: number, input: InputFrame): void {
      // Deferred payouts are flushed whether or not the script is still running: the journal beat
      // retires the script on the same frame its toast is queued.
      if (pending !== null && !covered()) {
        bus.emit('toast', { text: pending.text, icon: pending.icon, tier: pending.tier });
        pending = null;
      }
      if (!active) return;

      // Out of the hollow with the story begun, the player has the hang of it: the remaining tips
      // retire rather than follow them up the mountain. "Begun" is read from the quests as well as from
      // having talked to Nana, and a finished first chapter retires them anywhere: a run whose script
      // was never closed (a hand-made or older save) showed "W A S D — walk toward the cabin" on the
      // summit after the radio call, and would have shown it again on Nana's porch.
      const first = FIRST ? state.quests[FIRST.id]?.status : undefined;
      const begun = (OPENER !== undefined && state.talked[OPENER] === true) || first === 'active' || first === 'complete';
      if ((begun && state.zone !== 'hearth') || first === 'complete') {
        handle(machine.skip());
        return;
      }

      // A tip's patience only runs while it can be read.
      const blocked = promptBlocked();
      handle(machine.observe(latch(input), blocked ? 0 : dt));

      // A panel or a conversation hides the bar at once; it comes back when the panel closes.
      if (active) {
        const beat = machine.current();
        if (promptBlocked() || beat === null) ui.tutorial.hide(promptBlocked());
        // Only in its moment (steps.ts `beatApplies`), and an optional tip steps aside for an E pill:
        // "Hold Shift — run" under "E Stack" is two instructions where one is the thing in front of you.
        else if (!beatApplies(beat, context()) || (beat.patience !== undefined && ui.hud.promptShowing())) {
          ui.tutorial.hide(false);
        } else ui.tutorial.show(beat);
      }
    },
  };
}
