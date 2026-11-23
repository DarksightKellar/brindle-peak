/**
 * Runs one activity at a time: owns which activity is live, its clock, and the three things that have
 * to happen together when it ends (clear the HUD, clear the world markers, drop the instance).
 *
 * Pulled out of the session because the session is the only place with the loop, the UI and the state
 * in scope, so every activity bug ended up there as inline code. Starting one used to blank the screen
 * (no HUD) and draw nothing (no markers); both are now impossible to forget, because start() shows the
 * HUD and update() syncs the markers as part of the same object.
 *
 * It also carries the optional extras in activities/hooks.ts: turning Pip to face what an activity is
 * about as it opens (a race's first gate), carrying the body on a sled, and holding the panel open for
 * a moment after a finish with a result the player can read ("Down in 24s", a fish's name) instead of
 * a bare score.
 */

import type { ActivityDef, ActivityHost, ActivityInstance, InputFrame, Vec3 } from '../../core/contracts';
import type { Collider } from '../../core/player/collide';
import { emptyInput } from '../../core/contracts';
import { ACTIVITY_BELLS } from '../../core/progress/progress';
import { HINT_FOR_ID, WORDS } from '../activities/activityWords';
import { extras } from '../activities/hooks';
import { KITE_IDS } from '../activities/kite';
import { activityOffered } from '../activities/offered';
import { standingSolids } from '../activities/startProps';
import { hintFor, type ActivityHud } from '../ui/activityHud';
import { VILLAGER_BESTS } from '../../data/villagerBests';
import type { ActivityMarkerLayer } from '../world/activityMarkers';

export interface ActivityRunnerDeps {
  /** Build an instance from a definition. Injected so the runner never imports the content table. */
  create(def: ActivityDef): ActivityInstance;
  /** Host bridge for an instance, given this frame's input. */
  hostFor(instance: ActivityInstance, input: InputFrame): ActivityHost;
  ui: { activity: ActivityHud };
  markers: ActivityMarkerLayer;
  /** Camera heading at the moment of starting, for activities that judge aim. */
  cameraYaw(): number;
  /**
   * Turn the player's body to a heading. Optional: a throw owns its aim and asks for the body (and
   * so the following camera) to turn with it; without this wired the aim line still shows the way,
   * but a target behind the camera stays off screen.
   */
  faceTo?(yaw: number): void;
  /**
   * The world's live collider list. Optional: the start props and the woodpile are added to it once,
   * a race's lamp-posts while the race runs, and a finished snowman for good.
   */
  solids?: Collider[];
}

/** Seconds the opening turn is held, so the camera has swung round before the player takes over. */
const OPENING_TURN = 0.7;
/** Seconds the result stays in the panel after a finish (Esc sends it away sooner). 3.2 was gone before
 * critic round 5 looked down at it, and 5 before critic rounds 20 and 21 did (skating, the deer run). */
const RESULT_HOLD = 10;
/**
 * Walked this far from where it ended, after RESULT_SEEN seconds, the result goes: critic round 97 walked
 * a long way off from the Otter Slide with its card still up over the corner of the screen.
 */
const RESULT_WALKED = 12;
const RESULT_SEEN = 3;

export interface ActivityRunner {
  start(def: ActivityDef): void;
  /** Advance the live activity, if any. Returns true while one is running. */
  update(dt: number, input: InputFrame): boolean;
  isRunning(): boolean;
  /** True when the live activity needs the player's movement input left alone. */
  freeRoam(): boolean;
  /**
   * A race is run on a full breath: critic round 21 was winded by gate 7 of a run they chose to enter,
   * and the sprint bar decided the race rather than the line through the trees.
   */
  breathFree(): boolean;
  /** Abandon the live activity (the player pressed cancel, or the session is shutting down). */
  cancel(): void;
  /** Close the result card if it is up; true when it was. Escape uses it before the pause menu. */
  dismissResult(): boolean;
  /** A point the live activity wants framed with Pip (activities/hooks.ts `focus`), or null. */
  focus(): (Vec3 & { facing?: number }) | null;
}

export function createActivityRunner(d: ActivityRunnerDeps): ActivityRunner {
  let active: ActivityInstance | null = null;
  /** The start prop, hidden while a photo or a throw is under way: it stands beside the spot, and
   * crossed the aurora shot and the toss's aim (critic round 7). */
  let framed: string | null = null;
  let seconds = 0;
  let openingYaw: number | null = null;
  let openingLeft = 0;
  let resultLeft = 0;
  /** Where the last run ended, and Pip's live position (the host's), for RESULT_WALKED. */
  let endedAt: { x: number; z: number } | null = null;
  let body: { x: number; z: number } | null = null;
  /** No run of this activity has finished before: this one's result pays ACTIVITY_BELLS (progress.ts). */
  let firstRun = false;
  let running: readonly Collider[] = [];
  d.solids?.push(...standingSolids());

  const unsolid = (): void => {
    const list = d.solids;
    if (!list) return;
    for (const c of running) {
      const i = list.indexOf(c);
      if (i >= 0) list.splice(i, 1);
    }
    running = [];
  };

  const finish = (a: ActivityInstance): void => {
    unsolid();
    if (a.result() !== null) d.solids?.push(...(extras(a).lasting?.() ?? []));
    // One last sync: an aborted build puts its pile back as it was, a finished one leaves it standing.
    d.markers.sync(a.markers?.() ?? []);
    d.markers.clear();
    if (framed) d.markers.hide(framed, false);
    framed = null;
    active = null;
    // Each summary says nothing unless it has something to say: a race walked away from does.
    const said = extras(a).summary?.() ?? null;
    const line = said && firstRun && a.result() !== null ? `${said} · ${WORDS.firstBells(ACTIVITY_BELLS)}` : said;
    if (line) {
      d.ui.activity.showResult(line);
      resultLeft = RESULT_HOLD;
    } else {
      d.ui.activity.hide();
    }
  };

  /** Move Pip where a riding activity says, and turn the camera with it. */
  const carry = (a: ActivityInstance, host: ActivityHost): void => {
    const r = extras(a).ride?.() ?? null;
    if (!r) return;
    const body = host.playerPos;
    body.x = r.x;
    body.y = r.y;
    body.z = r.z;
    d.faceTo?.(r.yaw);
  };

  return {
    start(def): void {
      const instance = d.create(def);
      const host = d.hostFor(instance, emptyInput(d.cameraYaw()));
      // A finished build stays finished: pressing beside it must not knock it down and start again.
      if (!activityOffered(def, host.state)) return;
      active = instance;
      firstRun = (host.state.counters[`activity:${def.id}`] ?? 0) === 0;
      active.start(host);
      seconds = 0;
      resultLeft = 0;
      openingYaw = extras(active).startYaw?.() ?? null;
      openingLeft = openingYaw === null ? 0 : OPENING_TURN;
      // The start prop steps out of a photo's frame and out of a throw's line (critic round 7 had the
      // pinecone toss's flagpole across the aim). The kite keeps its post: Pip holds the line from it.
      const hideProp = def.kind === 'photo' || (def.kind === 'throw' && !KITE_IDS.has(def.id));
      framed = hideProp ? `start:${def.id}` : null;
      if (framed) d.markers.hide(framed, true);
      running = extras(active).solids?.() ?? [];
      d.solids?.push(...running);
      const told = HINT_FOR_ID[def.id] ?? extras(active).instruction?.() ?? undefined;
      // Someone's best to beat, from the first go (data/villagerBests.ts).
      const best = VILLAGER_BESTS[def.id];
      const hint = best ? `${told ?? hintFor(def.kind)} ${WORDS.parStart(best)}` : told;
      d.ui.activity.show({ name: def.name, kind: def.kind, prompt: def.prompt, hint });
    },
    update(dt, input): boolean {
      if (!active) {
        if (resultLeft > 0) {
          resultLeft -= dt;
          const walked = endedAt && body ? Math.hypot(body.x - endedAt.x, body.z - endedAt.z) : 0;
          if (walked > RESULT_WALKED && resultLeft < RESULT_HOLD - RESULT_SEEN) resultLeft = 0;
          if (resultLeft <= 0) d.ui.activity.hide();
        }
        return false;
      }
      const a = active;
      const host = d.hostFor(a, input);
      a.update(dt, host);
      const x = extras(a);
      if (d.faceTo && x.facing) d.faceTo(x.facing());
      if (d.faceTo && openingLeft > 0 && openingYaw !== null) {
        openingLeft -= dt;
        d.faceTo(openingYaw);
      }
      carry(a, host);
      seconds += dt;
      d.ui.activity.update(a.progress?.() ?? null, seconds);
      d.markers.sync(a.markers?.() ?? []);
      if (a.isComplete() || input.cancelPressed) {
        body = host.playerPos;
        endedAt = { x: host.playerPos.x, z: host.playerPos.z };
        if (input.cancelPressed) a.abort();
        finish(a);
      }
      return active !== null;
    },
    isRunning: () => active !== null,
    freeRoam: () => active !== null && active.freeRoam === true,
    breathFree: () => active !== null && active.def.kind === 'race',
    focus: () => (active ? extras(active).focus?.() ?? null : null),
    dismissResult(): boolean {
      if (active || resultLeft <= 0) return false;
      resultLeft = 0;
      d.ui.activity.hide();
      return true;
    },
    cancel(): void {
      if (!active) return;
      const a = active;
      a.abort();
      finish(a);
    },
  };
}
