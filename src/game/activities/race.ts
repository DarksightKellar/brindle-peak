/**
 * The foot race. Gate to gate along an authored course, against the clock and nobody else.
 *
 * It used to be a seeded bearing and a 110 u line with nothing drawn on it: "to the top" ran flat,
 * and the player had no way to know where the finish was. Each race now runs the course written for
 * it in raceCourses.ts, and the world shows the way — the next gate bright with a shaft of light over
 * it, the one after it dim, so you always know where to go and roughly where the line bends. In a wood
 * the gate is often behind a trunk, so the shaft stands taller than the pines, and an arrow hangs
 * beside Pip turned toward it.
 *
 * Cozy handling of "losing": there is no opponent, a missed gate is only a few steps back the way the
 * arrow points (a missed hoop in the air is skipped; see raceGates.ts), and standing still does not
 * end the run — the clock just keeps going. Score is the
 * finish time, and the only comparison is the one in your journal.
 */

import { angleDelta } from '../../core/contracts';
import type {
  ActivityDef, ActivityHost, ActivityInstance, ActivityReadout, ActivityResult, MarkerSpec, Vec2,
} from '../../core/contracts';
import type { Collider } from '../../core/player/collide';
import { BIRD_BULK } from '../world/birdBulk';
import type { PlacedMarker } from './markerLooks';
import { courseFor, type RaceCourse } from './raceCourses';
import { advanceGates, courseLength, gateYaw } from './raceGates';
import { WORDS } from './activityWords';

/** A hoop counts within this many metres of its centre height (so walking under one does not). */
const HOOP_BAND = 2.2;
/** The hoop mesh sits this far above its marker base (world/activityMarkers.ts PROTOTYPES.hoop.lift). */
const HOOP_LIFT = 3;
/** The pointer hangs over Pip's head, nudged this far toward the next gate. */
const ARROW_OUT = 0.5;
const ARROW_UP = 2.3;
/** The next gate within this of the view's heading (radians) is "ahead"; past WAY_BEHIND, "behind you". */
const WAY_AHEAD = 0.5;
const WAY_BEHIND = 2.3;
/** The pointer leans at most this far (radians) from up: down-left or down-right, never plain down. */
const ARROW_MAX_ROLL = 2.4;

export class RaceActivity implements ActivityInstance {
  readonly def: ActivityDef;
  /** The player runs this one themselves; see session's input gate. */
  readonly freeRoam = true;
  private readonly course: RaceCourse;
  /** Index of the next gate to pass; equals the gate count once the finish is through. */
  private next = 0;
  private elapsed = 0;
  private stage: 'run' | 'done' | 'aborted' = 'run';
  private outcome: ActivityResult | null = null;
  private paid = false;
  /** Ground height under each gate, sampled at start so markers need no terrain access. */
  private ground: number[] = [];
  /** Gates actually reached (a skipped gate is passed but not reached). */
  private reached = 0;
  /** The best time on this course before this run, from the save; null on a first run. */
  private bestBefore: number | null = null;
  /** Heading from where the player stood to the first gate, so the run opens looking at it. */
  private opening = 0;
  /** Where the runner was this frame, for the pointer that hangs beside them. */
  private runner: { x: number; y: number; z: number } | null = null;
  /** The chase camera's heading this frame: the pointer faces it, like a sign held up to the lens. */
  private camYaw = 0;

  compassTarget(): Vec2 | null {
    const g = this.stage === 'run' ? this.course.gates[this.next] : undefined;
    return g ? { x: g.x, z: g.z } : null;
  }

  constructor(def: ActivityDef, course: RaceCourse = courseFor(def)) {
    this.def = def;
    this.course = course;
  }

  start(host: ActivityHost): void {
    this.ground = this.course.gates.map((g) => host.terrain.heightAt(g.x, g.z));
    const first = this.course.gates[0];
    this.opening = first ? Math.atan2(first.x - host.playerPos.x, first.z - host.playerPos.z) : host.cameraYaw;
    this.reached = 0;
    const best = host.state.sledBests[`race:${this.def.id}`];
    this.bestBefore = typeof best === 'number' ? best : null;
    this.runner = { x: host.playerPos.x, y: host.playerPos.y + 0.6, z: host.playerPos.z };
    this.camYaw = host.cameraYaw;
    this.next = 0;
    this.elapsed = 0;
    this.outcome = null;
    this.paid = false;
    this.stage = 'run';
  }

  update(dt: number, host: ActivityHost): void {
    if (this.stage !== 'run') return;
    if (host.input.cancelPressed) {
      this.abort();
      return;
    }
    this.elapsed += Math.max(0, Math.min(dt, 0.1));
    // The player's own position: the finish is somewhere you have to actually arrive at.
    // Body height, not feet, for hoops in the air.
    const body = { x: host.playerPos.x, y: host.playerPos.y + 0.6, z: host.playerPos.z };
    this.runner = body;
    this.camYaw = host.cameraYaw;
    const was = this.next;
    const skip = this.course.look === 'hoop';
    this.next = advanceGates(was, body, this.course.gates, this.course.radius, this.course.heights, HOOP_BAND, skip);
    if (this.next > was) this.reached++;
    if (this.next >= this.course.gates.length) this.finish(host);
  }

  private finish(host: ActivityHost): void {
    // The clock is the whole result. No grade band, no "good/ok" label: a time is a time.
    const outcome: ActivityResult = { score: this.elapsed };
    this.outcome = outcome;
    this.stage = 'done';
    if (!this.paid) {
      this.paid = true;
      host.award(outcome);
    }
  }

  markers(): readonly MarkerSpec[] {
    const { gates, look } = this.course;
    const out: PlacedMarker[] = [];
    if (look === 'lantern') {
      // Every post stands from the start; passing one lights it, and the lit line is the way back down.
      gates.forEach((g, i) => {
        const y = this.ground[i] ?? 0;
        const lit = i < this.next ? 1 : i === this.next ? 1 : i === this.next + 1 ? 0.35 : 0;
        out.push({ shape: 'post', look: 'lamp-post', x: g.x, y, z: g.z, yaw: 0 });
        const pulse = i === this.next ? 1 + 0.18 * Math.sin(this.elapsed * 6) : undefined;
        out.push({ shape: 'float', look: 'lamp', x: g.x, y, z: g.z, strength: lit, size: pulse, yaw: this.elapsed });
      });
    } else {
      // Hoops show three ahead, so the line through the air reads as a line. On foot only the next
      // gate stands: a dim gate after it drew runners off the course toward it (critic round 3).
      const ahead = look === 'hoop' ? 3 : 1;
      for (let i = this.next; i < Math.min(gates.length, this.next + ahead); i++) {
        const g = gates[i];
        const strength = i === this.next ? 1 : 0.35;
        const yaw = gateYaw(this.def.pos, gates, i);
        out.push({ shape: 'ring', look: look === 'hoop' ? 'hoop' : 'arch', x: g.x, y: this.baseOf(i), z: g.z, yaw, strength });
      }
    }
    const target = gates[this.next];
    if (target) {
      const y = this.baseOf(this.next) + (look === 'hoop' ? 2 : 0);
      out.push({ shape: 'ring', look: 'beam', x: target.x, y, z: target.z, yaw: 0, size: 1 });
      out.push(...this.pointer(target));
    }
    return out;
  }

  /**
   * An arrow over Pip's head pointing at the next gate, turned to face the camera and rolled toward
   * the gate as the camera sees it: straight up is "ahead", sideways is "turn that way", down is
   * "behind you". Gates in a wood are behind trunks more often than not, and the arrow is always in
   * view. It shrinks as the gate comes close, when the gate itself is the better pointer.
   */
  private pointer(target: Vec2): PlacedMarker[] {
    const p = this.runner;
    if (!p) return [];
    const dx = target.x - p.x, dz = target.z - p.z;
    const far = Math.hypot(dx, dz);
    if (far < 3) return [];
    const yaw = Math.atan2(dx, dz);
    const size = 0.55 + 0.45 * Math.min(1, (far - 3) / 6);
    const at = { x: p.x + Math.sin(yaw) * ARROW_OUT, y: p.y + ARROW_UP, z: p.z + Math.cos(yaw) * ARROW_OUT };
    const face = this.camYaw + Math.PI;
    // Never straight down: a gate behind still leans the arrow to the side to come round on.
    const delta = angleDelta(this.camYaw, yaw);
    const roll = Math.sign(delta) * Math.min(Math.abs(delta), ARROW_MAX_ROLL);
    return (['arrow-rim', 'arrow'] as const).map((look) => ({ shape: 'float', look, ...at, yaw: face, tilt: roll, size }));
  }

  /** The lamp-posts of a lantern line are solid while they stand; arches and hoops are run through. */
  solids(): Collider[] {
    if (this.course.look !== 'lantern') return [];
    return this.course.gates.map((g) => ({ kind: 'circle', x: g.x, z: g.z, r: 0.13 + BIRD_BULK }));
  }

  /** Marker base for gate `i`: the ground, or for a hoop in the air its centre less the hoop's own lift. */
  private baseOf(i: number): number {
    const h = this.course.heights?.[i];
    return h !== undefined ? h - HOOP_LIFT : this.ground[i] ?? 0;
  }

  progress(): ActivityReadout | null {
    const total = this.course.gates.length;
    const shown = Math.min(this.next + 1, total);
    const label = this.course.look === 'hoop' ? WORDS.hoops(shown, total)
      : this.course.look === 'lantern' ? WORDS.lanterns(shown, total) : WORDS.gates(shown, total);
    const g = this.course.gates[this.next], p = this.runner;
    if (!g || !p) return { label, fraction: total === 0 ? 0 : this.next / total };
    const turn = angleDelta(this.camYaw, Math.atan2(g.x - p.x, g.z - p.z));
    const way = Math.abs(turn) < WAY_AHEAD ? 'ahead' : Math.abs(turn) > WAY_BEHIND ? 'behind' : turn > 0 ? 'left' : 'right';
    return { label: `${label} · ${WORDS.gateWay(Math.hypot(g.x - p.x, g.z - p.z), way, turn > 0 ? 'left' : 'right')}`, fraction: total === 0 ? 0 : this.next / total };
  }

  /** Turn to the first gate as the run opens: it is in front of you, not behind the camera. */
  startYaw(): number {
    return this.opening;
  }

  summary(): string | null {
    if (this.stage !== 'done') return null;
    const total = this.course.gates.length;
    if (this.course.look === 'lantern') return WORDS.lanternResult(total);
    if (this.course.look === 'hoop') return WORDS.hoopResult(this.elapsed, this.reached, total);
    return WORDS.raceResult(this.elapsed, this.bestBefore);
  }

  isComplete(): boolean {
    return this.stage !== 'run';
  }

  result(): ActivityResult | null {
    return this.stage === 'done' ? this.outcome : null;
  }

  abort(): void {
    if (this.stage !== 'run') return;
    this.stage = 'aborted';
    this.outcome = null;
  }

  get seconds(): number {
    return this.elapsed;
  }

  /** Gates passed so far. */
  get gatesPassed(): number {
    return this.next;
  }

  get gates(): readonly Vec2[] {
    return this.course.gates;
  }

  get courseLength(): number {
    return courseLength(this.def.pos, this.course.gates);
  }

  get finished(): boolean {
    return this.stage === 'done' && this.next >= this.course.gates.length;
  }
}

export function createRaceActivity(def: ActivityDef, course?: RaceCourse): RaceActivity {
  return new RaceActivity(def, course);
}
