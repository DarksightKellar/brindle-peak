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
import { VILLAGER_BESTS } from '../../data/villagerBests';
import { floorArrowTo, steadyRound, steadyWay, type Way } from './pointer';

/** Further than this from the next gate, the run has been walked away from and ends. */
// Three of the longest leg (24 u): critic round 86 ran 140 u past the Deer Trail before it was called off.
const LEFT_COURSE = 70;
/** A gate on foot this much higher than Pip is said to be up the rock. */
const GATE_ABOVE = 3;
/**
 * Past this from the next gate the line warns that the run is about to end. 30 since critic round 96 ran
 * on past gate 3 and was called off without seeing it: just past the longest leg (24 u) and its gate.
 */
const STRAY = 30;
/** On a leg longer than STRAY, the warning waits until Pip is this much further off than the leg's start. */
const STRAY_PAST_LEG = 6;
/** A hoop counts within this many metres of its centre height (so walking under one does not). */
// 3.3 since critic round 108, which glided through three of the Thermal Descent's eight and sank under the
// fourth: rounds 103 to 108 never finished it. A glide a little low still counts.
const HOOP_BAND = 3.3;
/** The hoop mesh sits this far above its marker base (world/activityMarkers.ts PROTOTYPES.hoop.lift). */
const HOOP_LIFT = 3;
/** A hoop's drawn scale: its ring (2 u at scale 1) as tall as the band a body passes it in. */
const HOOP_DRAWN = 1.4;

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
  /** The ground under the floor arrow beside the runner. */
  private groundAt: (x: number, z: number) => number = () => 0;
  /** Gates actually reached (a skipped gate is passed but not reached). */
  private reached = 0;
  /** The best time on this course before this run, from the save; null on a first run. */
  private bestBefore: number | null = null;
  /** Heading from where the player stood to the first gate, so the run opens looking at it. */
  private opening = 0;
  /** Where the runner was this frame, for the pointer that hangs beside them. */
  private runner: { x: number; y: number; z: number } | null = null;
  /** The chase camera's heading this frame: the panel's way words are measured against it. */
  private camYaw = 0;
  /** The way word the panel said last frame (pointer.ts steadyWay). */
  private way: Way | null = null;
  private round: 'left' | 'right' | null = null;
  /** The run ended because Pip walked away from it, not by Esc. */
  private left = false;

  compassTarget(): Vec2 | null {
    const g = this.stage === 'run' ? this.course.gates[this.next] : undefined;
    return g ? { x: g.x, z: g.z } : null;
  }

  constructor(def: ActivityDef, course: RaceCourse = courseFor(def)) {
    this.def = def;
    this.course = course;
  }

  start(host: ActivityHost): void {
    this.way = null;
    this.ground = this.course.gates.map((g) => host.terrain.heightAt(g.x, g.z));
    this.groundAt = (x, z) => host.terrain.heightAt(x, z);
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
    else {
      const g = this.course.gates[this.next];
      if (Math.hypot(g.x - body.x, g.z - body.z) > LEFT_COURSE) {
        this.abort();
        this.left = true;
      }
    }
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
        // A hoop is drawn as big as the space that counts (HOOP_BAND up and down): drawn at 2 u across a
        // 2.8 u band, critic round 77 found the hoops small and flew past three of them.
        const size = look === 'hoop' ? (i === this.next ? HOOP_DRAWN : HOOP_DRAWN * 0.8) : undefined;
        out.push({ shape: 'ring', look: look === 'hoop' ? 'hoop' : 'arch', x: g.x, y: this.baseOf(i), z: g.z, yaw, strength, size });
        // The next gate's ghost shows through rock and trees: on the Chimney Scramble critic round 77
        // could not see the gates on the crag behind the rock, only read where they were.
        if (i === this.next) out.push({ shape: 'ring', look: look === 'hoop' ? 'hoop' : 'arch', x: g.x, y: this.baseOf(i), z: g.z, yaw, strength, size, through: true });
      }
    }
    const aim = this.aimIndex();
    const target = gates[aim];
    if (target) {
      const y = this.baseOf(aim) + (look === 'hoop' ? 2 : 0);
      out.push({ shape: 'ring', look: 'beam', x: target.x, y, z: target.z, yaw: 0, size: 1 });
      out.push(...this.pointer(target));
    }
    return out;
  }

  /**
   * The gate the arrow and the words point at: the next one, or for hoops in the air the first not yet
   * flown past. A missed hoop is skipped by flying the next (`advanceGates`' skip), but the arrow kept
   * pointing back at it: critic round 26 missed hoop 1 and was told "behind you" all the way down.
   */
  private aimIndex(): number {
    const { gates } = this.course;
    let i = this.next;
    if (this.course.look !== 'hoop' || !this.runner) return i;
    const p = this.runner;
    while (i < gates.length - 1) {
      const yaw = gateYaw(this.def.pos, gates, i);
      const past = (p.x - gates[i].x) * Math.sin(yaw) + (p.z - gates[i].z) * Math.cos(yaw);
      if (past < 1.5) break;
      i++;
    }
    return i;
  }

  /** The arrow on the snow beside Pip to the next gate (pointer.ts): gates in a wood are behind trunks more often than not. */
  private pointer(target: Vec2): PlacedMarker[] {
    return this.runner ? floorArrowTo(this.runner, target, this.groundAt, this.elapsed) : [];
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
    const aim = this.aimIndex();
    const g = this.course.gates[aim], p = this.runner;
    if (!g || !p) return { label, fraction: total === 0 ? 0 : this.next / total };
    const turn = angleDelta(this.camYaw, Math.atan2(g.x - p.x, g.z - p.z));
    const wasBehind = this.way === 'behind';
    const way = this.way = steadyWay(turn, this.way);
    const round = this.round = steadyRound(turn, wasBehind ? this.round : null);
    // A hoop above or below the glide says so: the round-26 critic had a distance and no height.
    const h = this.course.heights?.[aim];
    // On foot, a gate up a face says so: on the Chimney Scramble critic round 79 read "8 u behind you"
    // under a ledge and could not tell the gate was above it, up the rock.
    const up = h === undefined && this.course.look === 'arch' ? (this.ground[aim] ?? p.y) - (p.y - 0.6) : 0;
    // On the snow, "4 u below you: ease off Space to sink" is no use: critic round 94 landed short on the
    // summit slope with the next hoop downhill (higher on the screen) and read it as wrong.
    const onSnow = p.y - 0.6 - this.groundAt(p.x, p.z) < 0.3;
    const rise = h !== undefined && onSnow ? ` · ${WORDS.hoopFromSnow}`
      : h !== undefined && Math.abs(h - p.y) > HOOP_BAND ? ` · ${WORDS.hoopHeight(h - p.y)}`
      : up > GATE_ABOVE ? ` · ${WORDS.gateAbove(up)}` : '';
    const lead = aim > this.next ? WORDS.hoops(aim + 1, total) : label;
    // A hoop flown past is skipped, so "Hoop 8 of 8" could follow a walk down the slope through none:
    // critic round 49 read it, then "through 1 of 8 hoops" at the end. The count through says so as it
    // goes, from the first hoop on: critic round 51 could not tell from the screen how its run stood.
    const missed = this.course.look === 'hoop' && this.next > 0 ? ` · ${WORDS.hoopsThrough(this.reached)}` : '';
    // From the gate the words point at: for hoops, a missed one behind is not the one to turn back for.
    const away = Math.hypot(g.x - p.x, g.z - p.z);
    // Never on a leg's own length: critic round 114 read the warning at 0 s on the Chimney Scramble, whose
    // post stands 30 u from gate 1 (round 111).
    const from = aim > 0 ? this.course.gates[aim - 1] : this.def.pos;
    const leg = from ? Math.hypot(g.x - from.x, g.z - from.z) : 0;
    const stray = away > Math.max(STRAY, leg + STRAY_PAST_LEG) ? `${WORDS.raceStray} · ` : '';
    return { label: `${stray}${lead}${missed} · ${WORDS.gateWay(Math.hypot(g.x - p.x, g.z - p.z), way, round)}${rise}`, fraction: total === 0 ? 0 : this.next / total, urgent: stray !== '' || undefined };
  }

  /** Turn to the first gate as the run opens: it is in front of you, not behind the camera. */
  startYaw(): number {
    return this.opening;
  }

  summary(): string | null {
    if (this.stage === 'aborted' && this.left) return WORDS.raceLeft;
    if (this.stage !== 'done') return null;
    const total = this.course.gates.length;
    if (this.course.look === 'lantern') return WORDS.lanternResult(total);
    const best = VILLAGER_BESTS[this.def.id];
    const par = best ? WORDS.parAfter(best, this.elapsed, this.reached) : '';
    if (this.course.look === 'hoop') return WORDS.hoopResult(this.elapsed, this.reached, total, par);
    return WORDS.raceResult(this.elapsed, this.bestBefore, par);
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
