/**
 * Building: a woodpile, a snowman or a stone dam, one visible piece per press. The woodpile asks a
 * little more: each log swings over its place and goes in on a press only when it is square
 * (logSwing.ts), because "stacked straight" is the whole of what Bram wants. The dam's stones take the
 * same timing, swaying side to side over their gap instead of turning: critic round 19 set all five
 * with five presses and no way to miss.
 *
 * Each piece (buildSites.ts) drops onto the site with a short settle and is kept: the finished thing
 * still stands when the activity closes, and finishedBuildMarkers() stands it back up after a reload.
 * No time limit, nothing to miss; the camera frames Pip and the site from the side (`focus`), and the
 * last piece lands before the build is called done, so the result rewarded is the one you can see.
 */

import type {
  ActivityDef, ActivityHost, ActivityInstance, ActivityReadout, ActivityResult, MarkerSpec, Vec3,
} from '../../core/contracts';
import type { PlacedMarker } from './markerLooks';
import { heapLeft, nounFor, placePiece, siteFor, stepsFor, type BuildSite, type Piece } from './buildSites';
import { WORDS } from './activityWords';
import { LogHand } from './logHand';

export const BUILD = {
  /** Seconds a piece takes to drop and settle. */
  settle: 0.42,
  /** Metres above its resting place a piece starts falling from. */
  drop: 1.3,
  /** Yaw a log arrives skewed by before it settles square: "stacked straight" is something you watch. */
  wobble: 0.35,
} as const;

/** A dam stone sways this many metres off its gap per radian of swing: at the widest, over a neighbour. */
const DAM_SWAY = 1.6;

/** Drop height and leftover skew for a piece `age` seconds after its press. Pure, for tests. */
export function settleAt(age: number): { drop: number; skew: number } {
  const t = Math.max(0, Math.min(1, age / BUILD.settle));
  const fall = 1 - t * t; // accelerates in, like something let go
  // A small hop on landing, gone by the end.
  const hop = t > 0.7 ? Math.sin(((t - 0.7) / 0.3) * Math.PI) * 0.06 : 0;
  return { drop: BUILD.drop * fall + hop, skew: (1 - t) * (1 - t) };
}

export class BuildActivity implements ActivityInstance {
  readonly def: ActivityDef;
  private readonly site: BuildSite;
  private readonly steps: readonly Piece[][];
  private stage = 0;
  private presses = 0;
  private elapsed = 0;
  /** `elapsed` at the press that placed each step. */
  private placedAt: number[] = [];
  private outcome: ActivityResult | null = null;
  private paid = false;
  private phase: 'build' | 'done' | 'aborted' = 'build';
  private swallowPress = false;
  /** Ground height under the site, cached at start so markers need no terrain access. */
  private ground = 0;
  private groundAt: (x: number, z: number) => number = () => this.ground;
  /** Heading from the player to the site at the start. */
  private opening = 0;
  /** Woodpile and dam: each piece swings and must be laid square (a log) or over its gap (a stone). */
  private readonly aligned: boolean;
  /** The dam's stones sway sideways rather than turn: metres off the gap per radian of swing. */
  private readonly sway: number;
  /** The log swinging over its notch (logHand.ts). */
  private readonly hand = new LogHand();
  /** Angle off square each log was pressed at; it settles from there to square. */
  private pressAngle: number[] = [];

  constructor(def: ActivityDef) {
    this.def = def;
    this.site = siteFor(def);
    this.steps = stepsFor(this.site);
    this.aligned = this.site.kind === 'woodpile' || this.site.kind === 'dam';
    this.sway = this.site.kind === 'dam' ? DAM_SWAY : 0;
  }

  start(host: ActivityHost): void {
    this.ground = host.terrain.heightAt(this.site.at.x, this.site.at.z);
    this.groundAt = (x, z) => host.terrain.heightAt(x, z);
    this.opening = Math.atan2(this.site.at.x - host.playerPos.x, this.site.at.z - host.playerPos.z);
    this.stage = 0;
    this.presses = 0;
    this.elapsed = 0;
    this.placedAt = [];
    this.pressAngle = [];
    this.hand.reset(0);
    this.outcome = null;
    this.paid = false;
    this.phase = 'build';
    this.swallowPress = true;
  }

  update(dt: number, host: ActivityHost): void {
    if (this.phase !== 'build') return;
    if (host.input.cancelPressed) {
      this.abort();
      return;
    }
    this.elapsed += Math.max(0, Math.min(dt, 0.1));

    const pressed = host.input.interactPressed && !this.swallowPress;
    this.swallowPress = false;
    if (pressed && this.stage < this.steps.length) this.presses++;
    if (this.stage < this.steps.length) {
      const laid = this.aligned ? this.hand.update(this.elapsed, this.layer(), pressed) : pressed ? 0 : null;
      if (laid !== null) this.lay(laid);
    }

    const last = this.placedAt[this.steps.length - 1];
    if (this.stage >= this.steps.length && last !== undefined && this.elapsed - last >= BUILD.settle) {
      this.finish(host);
    }
  }

  /** The swinging log drops into its notch at `angle` off square and the next one comes up. */
  private lay(angle: number): void {
    this.pressAngle[this.stage] = angle;
    this.placedAt[this.stage] = this.elapsed;
    this.stage++;
  }

  private layer(): number {
    return Math.floor(this.stage / 2);
  }

  private finish(host: ActivityHost): void {
    const outcome: ActivityResult = { score: this.steps.length, bonus: this.def.id };
    this.outcome = outcome;
    this.phase = 'done';
    if (!this.paid) {
      this.paid = true;
      host.award(outcome);
    }
  }

  markers(): readonly MarkerSpec[] {
    const out: PlacedMarker[] = [];
    for (let i = 0; i < this.stage; i++) {
      const { drop, skew } = settleAt(this.elapsed - (this.placedAt[i] ?? 0));
      const sign = i % 2 === 0 ? 1 : -1;
      for (const p of this.steps[i]) {
        const from = this.aligned && this.sway === 0 ? this.pressAngle[i] ?? 0 : BUILD.wobble * sign;
        const wobble = p.look === 'log' ? skew * from : 0;
        out.push(placePiece(this.site, this.ground, p, this.def.id, drop, wobble));
      }
    }
    const hanging = this.aligned && this.phase === 'build' ? this.steps[this.stage]?.[0] : undefined;
    if (hanging) {
      const rest = placePiece(this.site, this.ground, hanging, this.def.id);
      const place = (drop: number, angle: number): PlacedMarker => {
        if (this.sway === 0) return placePiece(this.site, this.ground, hanging, this.def.id, drop, angle);
        return placePiece(this.site, this.ground, { ...hanging, x: hanging.x + angle * this.sway }, this.def.id, drop);
      };
      out.push(...this.hand.markers(this.elapsed, this.layer(), rest, place));
    }
    // Whatever is still waiting to be built from (Bram's crooked heap) shrinks as the build grows.
    for (const p of heapLeft(this.site, this.stage + (hanging ? 1 : 0))) out.push(placePiece(this.site, this.ground, p, this.def.id));
    // Nothing standing at all: say so explicitly, which clears a pile left from an earlier run.
    if (out.length === 0) out.push({ shape: 'lump', look: 'empty', keep: this.def.id, x: 0, y: 0, z: 0 });
    // A small bobbing light over where the next piece lands, so the first press has a referent.
    const next = this.steps[this.stage]?.[0];
    if (next && this.phase === 'build' && !this.aligned) {
      const at = placePiece(this.site, this.ground, next, this.def.id);
      const bob = 0.12 * Math.sin(this.elapsed * 4);
      out.push({ shape: 'float', look: 'dot', x: at.x, y: at.y + 1.1 + bob, z: at.z, size: 1.6, strength: 1 });
    }
    return out;
  }

  /**
   * The camera frames Pip and the build from the side: from behind, the bird stood in front of it. The
   * woodpile favours the open side, away from the woodstore that would otherwise fill the shot.
   */
  focus(): (Vec3 & { facing: number }) | null {
    const first = this.steps[0]?.[0];
    if (!first || this.phase !== 'build') return null;
    const at = placePiece(this.site, this.ground, first, this.def.id);
    return { x: at.x, y: this.ground + 0.6, z: at.z, facing: this.site.facing + (this.aligned ? 0.35 : 0) };
  }

  /** True while the swinging log is square: a press now lays it. */
  get squareNow(): boolean {
    return this.aligned && this.phase === 'build' && this.hand.square(this.elapsed, this.layer());
  }

  progress(): ActivityReadout | null {
    const total = this.steps.length;
    const placed = Math.min(this.stage, total);
    const miss = this.aligned ? this.hand.miss(this.elapsed) : null;
    const count = `${nounFor(this.site)} ${placed} / ${total}`;
    // The moment is said for every log. Round 16 said it for the first only, and critic round 16 read
    // that as the hint vanishing; the skill is in the swing now, each log at its own pace (logHand.ts).
    const label = miss
      ? `${miss === 'mash' ? WORDS.buildMash : this.sway > 0 ? (miss === 'early' ? WORDS.stoneEarly : WORDS.stoneLate) : miss === 'early' ? WORDS.woodEarly : WORDS.woodLate} · ${count}`
      : this.squareNow ? `${this.sway > 0 ? WORDS.stoneNow : WORDS.woodNow} · ${count}` : count;
    return { label, fraction: placed / total, urgent: this.squareNow };
  }

  /** Where the site wants Pip to stand (buildSites.ts `stand`), facing the work, or null to stay put. */
  ride(): (Vec3 & { yaw: number }) | null {
    const s = this.site.stand;
    if (!s || this.phase !== 'build') return null;
    const at = placePiece(this.site, this.ground, { look: 'empty', x: s.x, y: 0, z: s.z }, this.def.id);
    const aim = placePiece(this.site, this.ground, { look: 'empty', x: s.lookX, y: 0, z: s.lookZ }, this.def.id);
    return { x: at.x, y: this.groundAt(at.x, at.z), z: at.z, yaw: Math.atan2(aim.x - at.x, aim.z - at.z) };
  }

  /** Face the site as the build opens, so the first piece lands in view. */
  startYaw(): number {
    return this.opening;
  }

  summary(): string | null {
    return this.phase === 'done' ? WORDS.buildResult[this.site.kind] ?? null : null;
  }

  isComplete(): boolean {
    return this.phase !== 'build';
  }

  result(): ActivityResult | null {
    return this.phase === 'done' ? this.outcome : null;
  }

  abort(): void {
    if (this.phase !== 'build') return;
    this.phase = 'aborted';
    this.stage = 0; // the half-built pile goes back to how it was, as it would after a reload
    this.hand.reset(this.elapsed);
    this.outcome = null;
  }

  /** Steps placed so far. */
  get placed(): number { return this.stage; }
  get stepCount(): number { return this.steps.length; }
  get pressCount(): number { return this.presses; }
  get buildSite(): BuildSite { return this.site; }
}

export function createBuildActivity(def: ActivityDef): BuildActivity {
  return new BuildActivity(def);
}
