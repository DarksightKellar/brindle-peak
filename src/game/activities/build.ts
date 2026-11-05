/**
 * Building: a woodpile, a snowman or a stone dam, one visible piece per press. The woodpile asks a
 * little more: each log swings over its place and goes in on a press only when it is square
 * (logSwing.ts), because "stacked straight" is the whole of what Bram wants. The dam's stones are
 * steered instead (damHand.ts): the current pushes each off its gap and A / D holds it there for E.
 * Critic round 19 set all five with five presses and no way to miss; round 25, with the stones swinging
 * on the woodpile's beat, called the two one minigame.
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
import { DAM, DamHand } from './damHand';
import { LogHand } from './logHand';

export const BUILD = {
  /** Seconds a piece takes to drop and settle. */
  settle: 0.42,
  /** Metres above its resting place a piece starts falling from. */
  drop: 1.3,
  /** Yaw a log arrives skewed by before it settles square: "stacked straight" is something you watch. */
  wobble: 0.35,
} as const;

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
  /** The dam: its stones are steered over their gaps, not timed (damHand.ts). */
  private readonly isDam: boolean;
  /** The log swinging over its notch (logHand.ts). */
  private readonly hand = new LogHand();
  /** The stone the current is tugging at (damHand.ts). */
  private readonly stone = new DamHand();
  /** The camera's yaw last frame: which key pushes the stone which way along the wall. */
  private camYaw = 0;
  /** Angle off square each log was pressed at; it settles from there to square. */
  private pressAngle: number[] = [];

  constructor(def: ActivityDef) {
    this.def = def;
    this.site = siteFor(def);
    this.steps = stepsFor(this.site);
    this.aligned = this.site.kind === 'woodpile' || this.site.kind === 'dam';
    this.isDam = this.site.kind === 'dam';
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
    this.stone.reset(0);
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
    const step = Math.max(0, Math.min(dt, 0.1));
    this.elapsed += step;
    this.camYaw = host.cameraYaw;

    const pressed = host.input.interactPressed && !this.swallowPress;
    this.swallowPress = false;
    if (pressed && this.stage < this.steps.length) this.presses++;
    if (this.stage < this.steps.length) {
      if (this.isDam) {
        const k = this.steerFor(this.camYaw);
        const push = host.input.moveX * k.d + host.input.moveZ * k.w;
        if (this.stone.update(this.elapsed, step, pressed, push)) this.lay(0);
      } else {
        const laid = this.aligned ? this.hand.update(this.elapsed, this.layer(), pressed) : pressed ? 0 : null;
        if (laid !== null) this.lay(laid);
      }
    }

    const last = this.placedAt[this.steps.length - 1];
    if (this.stage >= this.steps.length && last !== undefined && this.elapsed - last >= BUILD.settle) {
      this.finish(host);
    }
  }

  /**
   * How far D and W each push the dam's stone along the wall (+ downstream) with the camera at `camYaw`:
   * the keys are camera-relative (core/player/move.ts), and the wall runs along the site's local x.
   */
  steerFor(camYaw: number): { d: number; w: number } {
    const rel = camYaw - this.site.facing;
    return { d: -Math.cos(rel), w: Math.sin(rel) };
  }

  /** The key that brings the stone back toward its gap, or null when none points clearly that way. */
  private homeKey(): 'A' | 'D' | 'W' | 'S' | null {
    const want = -Math.sign(this.stone.off);
    const k = this.steerFor(this.camYaw);
    if (Math.abs(k.d) >= 0.5) return want * k.d > 0 ? 'D' : 'A';
    if (Math.abs(k.w) >= 0.5) return want * k.w > 0 ? 'W' : 'S';
    return null;
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
        const from = this.aligned && !this.isDam ? this.pressAngle[i] ?? 0 : BUILD.wobble * sign;
        const wobble = p.look === 'log' ? skew * from : 0;
        out.push(placePiece(this.site, this.ground, p, this.def.id, drop, wobble));
      }
    }
    const hanging = this.aligned && this.phase === 'build' ? this.steps[this.stage]?.[0] : undefined;
    if (hanging) {
      const rest = placePiece(this.site, this.ground, hanging, this.def.id);
      if (this.isDam) {
        const place = (drop: number, off: number): PlacedMarker =>
          placePiece(this.site, this.ground, { ...hanging, x: hanging.x + off }, this.def.id, drop);
        const along = { x: Math.cos(this.site.facing), z: -Math.sin(this.site.facing) };
        out.push(...this.stone.markers(this.elapsed, rest, place, along));
      } else {
        const place = (drop: number, angle: number): PlacedMarker => placePiece(this.site, this.ground, hanging, this.def.id, drop, angle);
        out.push(...this.hand.markers(this.elapsed, this.layer(), rest, place));
      }
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
    if (!this.aligned || this.phase !== 'build') return false;
    return this.isDam ? this.stone.over() : this.hand.square(this.elapsed, this.layer());
  }

  progress(): ActivityReadout | null {
    const total = this.steps.length;
    const placed = Math.min(this.stage, total);
    const count = `${nounFor(this.site)} ${placed} / ${total}`;
    if (this.isDam) return { label: `${this.stoneWords()} · ${count}`, fraction: placed / total, urgent: this.squareNow };
    const miss = this.aligned ? this.hand.miss(this.elapsed) : null;
    // The moment is said for every log. Round 16 said it for the first only, and critic round 16 read
    // that as the hint vanishing; the skill is in the swing now, each log at its own pace (logHand.ts).
    const label = miss
      ? `${miss === 'mash' ? WORDS.buildMash : miss === 'early' ? WORDS.woodEarly : WORDS.woodLate} · ${count}`
      : this.squareNow ? `${WORDS.woodNow} · ${count}` : count;
    return { label, fraction: placed / total, urgent: this.squareNow };
  }

  /** The dam's line: why a press missed, else set it now, else which key brings it home. */
  private stoneWords(): string {
    const miss = this.stone.miss(this.elapsed);
    if (miss) return miss === 'mash' ? WORDS.stoneMash : WORDS.stoneOff;
    if (this.squareNow) return WORDS.stoneNow;
    // The key is named for the first two stones, and again when a stone sits at the end of its reach.
    const key = this.stage < 2 || Math.abs(this.stone.off) >= DAM.reach - 0.05 ? this.homeKey() : null;
    return key ? WORDS.stoneSteer(key) : WORDS.stoneHold;
  }

  /** Metres the dam's stone in hand is off its gap, + downstream; 0 for any other build. */
  get stoneOff(): number {
    return this.isDam ? this.stone.off : 0;
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
    this.stone.reset(this.elapsed);
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
