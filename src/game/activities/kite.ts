/**
 * Sable's kite. Get it above the crest and hold it there.
 *
 * Pip stands on the crest of Windscar Ridge with the kite out over the north drop. Wind rises up the
 * face in one column of lifting snow that wanders slowly from side to side; A / D walk the kite across
 * the sky to stay in it. In the lift the kite climbs, out of it the kite sinks. Get it above the line of
 * the crest (a row of lights) and keep it there for a few seconds, and the wind has it.
 *
 * The first version was unreadable: the column was five flecks, nothing changed when the kite was in
 * it, and the kite started low enough to sit exactly behind Pip in the chase view. Now:
 *   - the kite never sinks below a height that keeps it above Pip's head on screen;
 *   - the column is a dense stream of snow you can see from the start, right beside the kite;
 *   - in the lift the line pulls taut and bright, the tail streams up and the kite steadies;
 *   - the kite starts just beside the column, and the column holds almost still at first and only
 *     grows its wander over the first few seconds, so the first climb teaches the rule and the hold tests it.
 *
 *
 * Round 3: the critic flew for a minute and a half without a win and never saw the crest lights (they
 * were specks), and nothing said how high the kite was. Now the crest is a row of big lights across the
 * kite's sky, cold blue until the kite clears them; a dotted plumb line hangs from the kite to the
 * crest while it is below, so the gap to climb is drawn; and once over, the lights come on one by one
 * from the middle out as the hold counts up. The lift is wider and wanders less, the kite sinks slowly
 * once it is over the crest, and the hold is shorter, so a first flight lands in about twenty seconds.
 *
 * Nothing fails: the kite cannot crash and there is no clock. The score is the time it took.
 */

import { clamp } from '../../core/contracts';
import type {
  ActivityDef, ActivityHost, ActivityInstance, ActivityReadout, ActivityResult, MarkerSpec,
} from '../../core/contracts';
import { WORDS } from './activityWords';
import type { PlacedMarker } from './markerLooks';

export const KITE = {
  /** Heading Pip faces from the crest post: north, out over the drop. */
  facing: Math.PI,
  /** How far out the kite flies, and how far either side A / D can carry it. */
  reach: 22,
  span: 7,
  /**
   * Starting height and floor, metres relative to the crest; above `line` counts as above it. The
   * chase camera sits behind and above Pip, so anything lower than about a metre under the crest at
   * this range is drawn behind the bird. The floor keeps the kite clear of that.
   */
  start: -0.5,
  floor: -1,
  ceiling: 5.5,
  line: 2.5,
  /** Climb rate in the lift (full across most of its width), the steady sink, and the sink over the crest. */
  climb: 2.4,
  sink: 0.8,
  sinkAbove: 0.55,
  /** Sideways speed at full A / D, in fractions of the span per second. */
  steer: 0.9,
  /** How fast the wind slides a kite outside the lift further away from it, in the same fraction. */
  slide: 0.1,
  /** Half-width of the lifting column, in the same fraction. */
  lane: 0.4,
  /** Seconds above the line that count as done. */
  hold: 4,
  /** Seconds over which the column's wander grows from almost nothing to its full swing. */
  settle: 14,
} as const;

/** Where the lift is at time `t`: a slow wander across the sky, -1..1 of the span, calm at first. */
export function liftAt(t: number): number {
  const calm = Math.min(1, 0.1 + t / KITE.settle);
  return clamp(-0.2 + calm * (0.5 * Math.sin(t * 0.3) + 0.22 * Math.sin(t * 0.75 + 1)), -0.9, 0.9);
}

/** Rising snowflakes drawn in the column; enough that it reads as a stream, not as flecks. */
const FLAKES = 16;
/** Crest lights across the kite's sky, and the most dots the plumb line from the kite ever uses. */
const BEACONS = 7;
const PLUMB = 8;

export class KiteActivity implements ActivityInstance {
  readonly def: ActivityDef;
  private t = 0;
  private side = 0;
  private height: number = KITE.start;
  private held = 0;
  private crest = 0;
  private hand = { x: 0, y: 0, z: 0 };
  private stage: 'fly' | 'done' | 'aborted' = 'fly';
  private outcome: ActivityResult | null = null;
  private paid = false;

  constructor(def: ActivityDef) {
    this.def = def;
  }

  start(host: ActivityHost): void {
    this.crest = host.terrain.heightAt(this.def.pos.x, this.def.pos.z);
    this.hand = { x: host.playerPos.x, y: host.playerPos.y + 0.9, z: host.playerPos.z };
    this.t = 0;
    // Just right of the column: one press of A and the kite is in it and climbing.
    this.side = liftAt(0) + KITE.lane * 1.3;
    this.height = KITE.start;
    this.held = 0;
    this.outcome = null;
    this.paid = false;
    this.stage = 'fly';
  }

  update(dt: number, host: ActivityHost): void {
    if (this.stage !== 'fly') return;
    if (host.input.cancelPressed) {
      this.abort();
      return;
    }
    const step = Math.max(0, Math.min(dt, 0.1));
    this.t += step;
    // Out of the lift the wind slides the kite further off it, so it has to be flown, not waited on.
    const off = this.inLift() > 0 ? 0 : Math.sign(this.side - liftAt(this.t)) * KITE.slide;
    this.side = clamp(this.side + (host.input.moveX * KITE.steer + off) * step, -1, 1);
    const lift = Math.min(1, this.inLift() * 1.8);
    const sink = this.height >= KITE.line ? KITE.sinkAbove : KITE.sink;
    this.height = clamp(this.height + (KITE.climb * lift - sink) * step, KITE.floor, KITE.ceiling);
    this.held = this.height >= KITE.line ? this.held + step : Math.max(0, this.held - step);
    if (this.held >= KITE.hold) this.finish(host);
  }

  /** 0..1: how squarely the kite sits in the rising column. */
  private inLift(): number {
    return clamp(1 - Math.abs(this.side - liftAt(this.t)) / KITE.lane, 0, 1);
  }

  private finish(host: ActivityHost): void {
    this.outcome = { score: this.t, bonus: 'above-crest' };
    this.stage = 'done';
    if (!this.paid) {
      this.paid = true;
      host.award(this.outcome);
    }
  }

  /** World point `out` metres north of the post, `across` east of it, `up` above the crest. */
  private at(out: number, across: number, up: number): { x: number; y: number; z: number } {
    const fx = Math.sin(KITE.facing), fz = Math.cos(KITE.facing);
    return { x: this.def.pos.x + fx * out - fz * across, y: this.crest + up, z: this.def.pos.z + fz * out + fx * across };
  }

  markers(): readonly MarkerSpec[] {
    const out: PlacedMarker[] = [];
    if (this.stage !== 'fly') return out;
    const above = this.height >= KITE.line;
    const lift = this.inLift();
    const kite = this.at(KITE.reach, this.side * KITE.span, this.height);
    // Out of the lift it wobbles and droops; in it, it steadies.
    const sway = Math.sin(this.t * 3) * 0.3 * (1 - lift);
    out.push({ shape: 'float', look: 'kite', ...kite, yaw: KITE.facing, tilt: sway, size: 1.5 + 0.25 * lift });
    // The tail: hanging and fluttering below it, streaming up and out behind it when the wind has it.
    for (let k = 1; k <= 4; k++) {
      const flutter = Math.sin(this.t * 5 + k) * 0.25 * k * (1 - lift * 0.6);
      const down = (0.8 + k * 0.5) * (1 - lift * 0.7);
      out.push({ shape: 'float', look: 'dot', x: kite.x + flutter, y: kite.y - 0.9 - down, z: kite.z - lift * k * 0.5, size: 1.1, strength: 0.4 + 0.6 * lift });
    }
    // The line from Pip's wing out to the kite: slack and dim when it sinks, taut and bright when it pulls.
    const sagBy = 1.6 * (1 - lift);
    for (let k = 1; k <= 7; k++) {
      const f = k / 8;
      const sag = Math.sin(f * Math.PI) * sagBy;
      out.push({
        shape: 'float', look: 'dot', size: 0.7, strength: 0.3 + 0.7 * lift,
        x: this.hand.x + (kite.x - this.hand.x) * f, y: this.hand.y + (kite.y - this.hand.y) * f - sag, z: this.hand.z + (kite.z - this.hand.z) * f,
      });
    }
    out.push(...this.crestLights(kite, above));
    // The lift: wind lines and snow rising up the face where the wind comes up, as wide as the column.
    // White flakes alone vanished against the snowfield behind; the blue lines read on snow and sky.
    const lane = liftAt(this.t) * KITE.span;
    const half = KITE.lane * KITE.span * 0.8;
    for (let k = 0; k < FLAKES; k++) {
      const rise = (this.t * 0.45 + (k * 7) / FLAKES) % 1;
      const across = lane + Math.sin(k * 2.3 + this.t * 0.8) * half;
      const p = this.at(KITE.reach + 0.6, across, KITE.floor - 3 + rise * (KITE.ceiling - KITE.floor + 5));
      const fade = Math.sin(rise * Math.PI);
      if (k % 2 === 0) out.push({ shape: 'lump', look: 'streak', ...p, size: 0.6 + 0.6 * fade, strength: fade, yaw: 0 });
      else out.push({ shape: 'lump', look: 'puff', ...p, size: 0.3 + 0.25 * fade, strength: 1, yaw: rise * 6 + k });
    }
    return out;
  }

  /**
   * The crest: a row of lights across the kite's sky at the height to clear, cold until the kite is
   * over, then lit from the middle outward as the hold counts (all lit = done). Below it, a dotted
   * plumb line from the kite up to the crest is the height still to climb.
   */
  private crestLights(kite: { x: number; y: number; z: number }, above: boolean): PlacedMarker[] {
    const out: PlacedMarker[] = [];
    const lit = above ? Math.ceil((this.held / KITE.hold) * BEACONS) : 0;
    for (let k = 0; k < BEACONS; k++) {
      const slot = (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2); // 0, -1, 1, -2, 2 ...: middle first
      const p = this.at(KITE.reach + 0.4, slot * KITE.span * 0.36, KITE.line);
      const on = k < lit;
      out.push({ shape: 'float', look: 'beacon', ...p, size: on ? 1.25 : 1, strength: on ? 1 : above ? 0.45 : 0, yaw: this.t * (on ? 2 : 0.4) });
    }
    const gap = KITE.line - this.height;
    if (gap > 0.3) {
      const n = Math.min(PLUMB, Math.ceil(gap / 0.45));
      for (let k = 1; k <= n; k++) {
        out.push({ shape: 'float', look: 'dot', x: kite.x, y: kite.y + (gap * k) / n, z: kite.z, size: 1.2, strength: 0.55 });
      }
    }
    return out;
  }

  progress(): ActivityReadout | null {
    const above = this.height >= KITE.line;
    const fraction = above ? 0.8 + 0.2 * (this.held / KITE.hold) : 0.8 * ((this.height - KITE.floor) / (KITE.line - KITE.floor));
    const label = above ? WORDS.kiteHigh : this.inLift() > 0.25 ? WORDS.kiteRising : WORDS.kiteLow;
    return { label, fraction: clamp(fraction, 0, 1), urgent: above };
  }

  /** Pip keeps facing out over the drop, so the camera sits behind and the kite is in front. */
  facing(): number {
    return KITE.facing;
  }

  summary(): string | null {
    return this.stage === 'done' ? WORDS.kiteResult : null;
  }

  isComplete(): boolean {
    return this.stage !== 'fly';
  }

  result(): ActivityResult | null {
    return this.stage === 'done' ? this.outcome : null;
  }

  abort(): void {
    if (this.stage !== 'fly') return;
    this.stage = 'aborted';
    this.outcome = null;
  }

  get kiteHeight(): number { return this.height; }
  get kiteSide(): number { return this.side; }
  get seconds(): number { return this.t; }
}

/** Activity ids that fly a kite rather than throw. Their kind stays 'throw' in the shared contract. */
export const KITE_IDS: ReadonlySet<string> = new Set(['ridge-kite']);

export function createKiteActivity(def: ActivityDef): KiteActivity {
  return new KiteActivity(def);
}
