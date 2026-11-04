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
import { HINT_FOR_ID } from '../activities/activityWords';
import { extras } from '../activities/hooks';
import { activityOffered } from '../activities/offered';
import { standingSolids } from '../activities/startProps';
import type { ActivityHud } from '../ui/activityHud';
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
/** Seconds the result stays in the panel after a finish. 3.2 was gone before critic round 5 looked down at it. */
const RESULT_HOLD = 5;

export interface ActivityRunner {
  start(def: ActivityDef): void;
  /** Advance the live activity, if any. Returns true while one is running. */
  update(dt: number, input: InputFrame): boolean;
  isRunning(): boolean;
  /** True when the live activity needs the player's movement input left alone. */
  freeRoam(): boolean;
  /** Abandon the live activity (the player pressed cancel, or the session is shutting down). */
  cancel(): void;
  /** A point the live activity wants framed with Pip (activities/hooks.ts `focus`), or null. */
  focus(): (Vec3 & { facing?: number }) | null;
}

export function createActivityRunner(d: ActivityRunnerDeps): ActivityRunner {
  let active: ActivityInstance | null = null;
  let seconds = 0;
  let openingYaw: number | null = null;
  let openingLeft = 0;
  let resultLeft = 0;
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
    active = null;
    const line = a.result() !== null ? extras(a).summary?.() ?? null : null;
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
      active.start(host);
      seconds = 0;
      resultLeft = 0;
      openingYaw = extras(active).startYaw?.() ?? null;
      openingLeft = openingYaw === null ? 0 : OPENING_TURN;
      running = extras(active).solids?.() ?? [];
      d.solids?.push(...running);
      const hint = HINT_FOR_ID[def.id] ?? extras(active).instruction?.() ?? undefined;
      d.ui.activity.show({ name: def.name, kind: def.kind, prompt: def.prompt, hint });
    },
    update(dt, input): boolean {
      if (!active) {
        if (resultLeft > 0) {
          resultLeft -= dt;
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
        if (input.cancelPressed) a.abort();
        finish(a);
      }
      return active !== null;
    },
    isRunning: () => active !== null,
    freeRoam: () => active !== null && active.freeRoam === true,
    focus: () => (active ? extras(active).focus?.() ?? null : null),
    cancel(): void {
      if (!active) return;
      const a = active;
      a.abort();
      finish(a);
    },
  };
}
