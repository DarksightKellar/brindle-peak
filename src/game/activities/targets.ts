/**
 * Throwing: turn the aim with A / D, hold F to draw, let go to throw, watch it fly.
 *
 * Holding E draws the throw: its strength swells and ebbs (THROW.draw), and the arc of dots grows and
 * shrinks with it. Let go as the arc reaches the target. Critic round 19 found every throw decided by
 * the panel's "Lined up: press F"; the words still say which way to turn and when the aim is on, but
 * how hard to throw is the player's own timing, and a throw let go early falls short.
 *
 * The old round resolved each press instantly against the camera's yaw, which does not move during
 * an activity: the aim was frozen, misses were invisible, and five presses "completed" it with no
 * hits. Now the activity owns its aim (moveX turns it), an arc of dots shows where a throw will go,
 * and each throw is a projectile (throwFlight.ts) that strikes the real target or lands in the snow.
 *
 * What is thrown at, and how many hits finish it, comes from throwSetups.ts. A round ends early on
 * enough hits, or when the pouch is empty and the last throw has landed — and either way it counts,
 * so a miss costs a throw and nothing else. Score = hits.
 */

import { angleDelta } from '../../core/contracts';
import type {
  ActivityDef, ActivityHost, ActivityInstance, ActivityReadout, ActivityResult, MarkerSpec,
  TerrainSampler, Vec3,
} from '../../core/contracts';
import type { PlacedMarker } from './markerLooks';
import { signTo } from './pointer';
import { FLIGHT, launch, previewArc, stepShot, turnAim, type Shot, type Strikeable } from './throwFlight';
import { bellTarget, FAN, makeFan, setupFor, targetFoot, type ThrowSetup, type ThrowTarget } from './throwSetups';
import { WORDS } from './activityWords';

export { targetAngle } from './throwSetups';

/**
 * The bell's gusts in turn, -1..1 of WIND_PUSH across the line to it (+ to the left). Light ones a straight
 * throw still rings; strong ones carry it past the bell unless the aim leans into them.
 */
const BELL_WIND = [0.9, -0.5, -1, 0.35, 0.75, -0.85, 1, -0.6] as const;
/** Within this many radians of the mark, A / D turn the aim at FINE_TURN of full speed. */
const FINE_AIM = 0.12;
const FINE_TURN = 0.4;

/** How far a full gust carries a straight throw sideways by the time it reaches the bell, metres. */
const WIND_DRIFT = 2;

export const THROW = {
  /** Seconds between throws, so a held key cannot dump the whole pouch in one frame. */
  cooldown: 0.35,
  /** Seconds the round lingers after it is decided, so the last hit is seen landing. */
  linger: 0.7,
  /** Radians the aim opens away from the target, so nothing is won by pressing E once. */
  openOffset: 0.3,
  /**
   * The draw: seconds for strength to swell from a lob to a heave and back, and that range of speed as
   * a share of the throw that arrives on the target. Half way through the swell it does.
   */
  drawPeriod: 1.8,
  drawMin: 0.75,
  drawMax: 1.25,
  /** Seconds a puff of snow (a hit or a landing) stays visible. */
  puff: 0.35,
  /** Seconds "Hit!" or "Missed" stays in the panel, and a struck snowman's ring spreads. */
  call: 1.2,
} as const;

interface Puff { pos: Vec3; age: number }

/** Radians nearer another target must be before the aim words switch to it. */
const AIM_KEEP = 0.12;
/**
 * The aim words hold still near the centre. Critic round 46 saw "Aim left (A)" and "Aim right (D)" take
 * turns every frame as a swaying snowman crossed the aim: the side is kept until the aim is this many
 * radians past the target, and "on target" is kept for AIM_ON_HOLD seconds after it was last true.
 */
const AIM_SIDE_KEEP = 0.05;
const AIM_ON_HOLD = 0.2;

/**
 * Seconds a player has to react to "Let go!": a release this soon after the arc was last bold is thrown
 * as it was then. The cue used to be lit only where a release 0.08 s later still hit, which left a few
 * frames of it and less than a reaction; critic round 35 let go on the cue and missed twice running.
 */
const LET_GO_REACT = 0.25;

/**
 * The bell's swell is this share of the toss's. Up on its post and close by, the bell takes a lob that
 * strength changes a lot: at the full swell its window was 0.08 s, and critic round 20 rang it once in
 * fifteen throws. At this share it is about as wide as the toss's.
 */
const BELL_SPREAD = 0.35;

/** How a missed throw missed, or null when it was close or there was nothing to miss. */
type Side = 'left' | 'right' | 'short' | 'long' | null;
/** When a throw on the line was let go, against the swell: before the arc reached the target, or after. */
type Timing = 'early' | 'late';

/** Strength of a throw drawn for `held` seconds, as a share of the throw that arrives on the target. */
export function drawReach(held: number, spread = 1): number {
  const swell = 0.5 - 0.5 * Math.cos((2 * Math.PI * held) / THROW.drawPeriod);
  return 1 + spread * (THROW.drawMin + (THROW.drawMax - THROW.drawMin) * swell - 1);
}

export class TargetActivity implements ActivityInstance {
  readonly def: ActivityDef;
  readonly setup: ThrowSetup;
  private fan: ThrowTarget[] = [];
  private bell: Strikeable | null = null;
  private terrain: TerrainSampler | null = null;
  private feet: Vec3 = { x: 0, y: 0, z: 0 };
  private aim = 0;
  private shots: Shot[] = [];
  private puffs: Puff[] = [];
  /** Seconds since the bell was last struck, for its ring; negative before the first hit. */
  private rang = -1;
  private elapsed = 0;
  private throwsLeft = 0;
  private hits = 0;
  /** progress() is saying "Let go!" this frame; it goes up as the big cue too. */
  private sayingNow = false;
  /** Which target the aim words coached toward last (strikeables() index), or -1. */
  private coached = -1;
  /** The side the aim words last said, and when the aim was last on (AIM_SIDE_KEEP, AIM_ON_HOLD). */
  private saidSide: 'left' | 'right' | null = null;
  private onAt = -Infinity;
  private cooldown = 0;
  /** Seconds E has been held for the throw being drawn; -1 when none is. */
  private draw = -1;
  /** The draw when letting go last would have hit, and `elapsed` then (LET_GO_REACT). */
  private litDraw = -1;
  private litAt = -Infinity;
  /** `elapsed` when the round was decided, or -1 while it is still open. */
  private decidedAt = -1;
  private stage: 'throwing' | 'done' | 'aborted' = 'throwing';
  private outcome: ActivityResult | null = null;
  private paid = false;
  private swallowPress = false;
  /** The last throw's outcome and when it landed (`elapsed`), for the panel and the hit ring. */
  private call: { hit: boolean; at: number; pos: Vec3; side: Side; timing?: Timing } | null = null;
  /**
   * How the throw in flight was let go: whether the aim was on the target (so a miss was the strength)
   * and whether the swell was still growing. Critic round 20 let go at every length of hold and was told
   * "wide left / right" each time, because a long throw lands far enough past to be off the line.
   */
  private released: { aimedOn: boolean; rising: boolean } | null = null;
  /**
   * The target the throw was lined up on when E went down, or -1. While drawing, the aim keeps on it as
   * it swings, so holding E is only about when to let go: critic round 20's snowmen swung out of line
   * mid-draw, and every throw let go after that was called wide.
   */
  private locked = -1;
  /**
   * The bell's crosswind: its push on a shot (u/s², across the line to the bell), and which gust of
   * BELL_WIND it is. Critic round 25 played the toss and the bell as one hold-and-release game; the bell
   * is still, so the wind is what it asks: read the arrow over it and aim upwind. It shifts every throw.
   */
  private wind = { x: 0, z: 0 };
  private gust = 0;
  /** Unit vector to the left of the line from the throwing spot to the bell. */
  private across = { x: 0, z: 0 };
  /** The aim that would ring the bell in this gust (cached per gust), or null when none would. */
  private windAim: { gust: number; yaw: number | null } | null = null;
  /** Camera yaw last frame, for the wind arrow over the bell. */
  private camYaw = 0;

  constructor(def: ActivityDef) {
    this.def = def;
    this.setup = setupFor(def);
  }

  private groundAt = (x: number, z: number): number => this.terrain?.heightAt(x, z) ?? 0;

  start(host: ActivityHost): void {
    this.terrain = host.terrain;
    this.feet = { ...host.playerPos };
    this.fan = this.setup.kind === 'fan' ? makeFan(this.def, this.setup.facing ?? host.cameraYaw) : [];
    this.bell = this.setup.kind === 'bell' ? bellTarget(this.groundAt) : null;
    this.shots = [];
    this.puffs = [];
    this.rang = -1;
    this.elapsed = 0;
    this.throwsLeft = this.setup.budget;
    this.hits = 0;
    this.cooldown = 0;
    this.draw = -1;
    this.locked = -1;
    this.decidedAt = -1;
    this.outcome = null;
    this.paid = false;
    this.stage = 'throwing';
    this.swallowPress = true;
    this.call = null;
    /*
     * Open aimed near the middle of what is to be hit, but not on it: pointed straight at the bell, the
     * first press rang it and the round was over before it began. The aim starts a little way off,
     * on the side the camera is looking, so the player always lines the throw up themselves.
     */
    const mid = this.bell?.pos ?? this.strikeables()[1]?.pos ?? this.strikeables()[0]?.pos;
    const bearing = mid ? Math.atan2(mid.x - this.feet.x, mid.z - this.feet.z) : host.cameraYaw;
    const side = angleDelta(bearing, host.cameraYaw) < 0 ? -1 : 1;
    this.aim = bearing + side * THROW.openOffset;
    this.camYaw = host.cameraYaw;
    this.across = { x: Math.cos(bearing), z: -Math.sin(bearing) };
    this.gust = 0;
    this.windAim = null;
    this.setWind();
  }

  /** The bell's wind for the current gust; still air anywhere else. */
  private setWind(): void {
    // The push that drifts a throw WIND_DRIFT over its flight (range / speed seconds), wherever Pip stands.
    const range = this.bell ? Math.hypot(this.bell.pos.x - this.feet.x, this.bell.pos.z - this.feet.z) : 0;
    const flight = Math.max(0.3, range / FLIGHT.speed);
    const k = this.bell ? (BELL_WIND[this.gust % BELL_WIND.length] * 2 * WIND_DRIFT) / (flight * flight) : 0;
    this.wind = { x: this.across.x * k, z: this.across.z * k };
  }

  /** The gust's strength, -1..1, + blowing to the left of the line to the bell. */
  private get gustNow(): number {
    return this.bell ? BELL_WIND[this.gust % BELL_WIND.length] : 0;
  }

  /** Hit volumes this instant (or at `at`), index-aligned with the fan (null once a post is down). */
  private strikeables(at = this.elapsed): (Strikeable | null)[] {
    if (this.bell) return [this.bell];
    return this.fan.map((t) => {
      if (t.down) return null;
      const foot = targetFoot(this.def.pos, t, at);
      return { pos: { x: foot.x, y: this.groundAt(foot.x, foot.z) + FAN.centre, z: foot.z }, radius: FAN.radius, half: FAN.half };
    });
  }

  update(dt: number, host: ActivityHost): void {
    if (this.stage !== 'throwing') return;
    if (host.input.cancelPressed) {
      this.abort();
      return;
    }
    const step = Math.max(0, Math.min(dt, 0.1));
    const pressed = host.input.interactPressed && !this.swallowPress;
    this.swallowPress = false;
    this.feet = { ...host.playerPos };
    this.camYaw = host.cameraYaw;
    if (this.draw >= 0 && this.locked >= 0) this.follow(this.locked);
    else {
      // Slower near the mark, so a tap settles on it: critic round 26 watched the cue flip between "Aim
      // right" and "Lined up" with every press.
      const goal = this.bell ? this.bellAim() : this.nearestToAim()?.bearing ?? null;
      const fine = goal !== null && Math.abs(angleDelta(this.aim, goal)) < FINE_AIM;
      this.aim = turnAim(this.aim, host.input.moveX * (fine ? FINE_TURN : 1), step);
    }

    if (this.draw < 0) {
      if (pressed && this.decidedAt < 0 && this.cooldown <= 0 && this.throwsLeft > 0 && this.shots.length === 0) {
        this.draw = 0;
        this.locked = this.predict();
        this.litAt = -Infinity;
      }
    } else if (host.input.interactHeld) {
      this.draw += step;
      if (this.letGoHits) {
        this.litDraw = this.draw;
        this.litAt = this.elapsed;
      }
    } else {
      this.locked = -1;
      this.throwsLeft--;
      this.cooldown = THROW.cooldown;
      // Let go a reaction after the cue, it goes as it would have on the cue.
      let reach = this.reachAt(this.draw);
      if (this.predict(reach) < 0 && this.elapsed - this.litAt <= LET_GO_REACT && this.predict(this.reachAt(this.litDraw)) >= 0) {
        reach = this.reachAt(this.litDraw);
      }
      this.released = { aimedOn: this.predict() >= 0, rising: this.draw % THROW.drawPeriod < THROW.drawPeriod / 2 };
      this.shots.push(launch(this.feet, this.aim, this.strikeables(), this.groundAt, reach, this.bell ? { ...this.wind } : undefined));
      this.draw = -1;
      // The wind shifts once the throw is away: the one in flight keeps the gust it was let go in.
      if (this.bell) {
        this.gust++;
        this.setWind();
      }
    }

    this.elapsed += step;
    this.cooldown -= step;
    this.rang = this.rang >= 0 ? this.rang + step : this.rang;
    for (const p of this.puffs) p.age += step;
    this.puffs = this.puffs.filter((p) => p.age < THROW.puff);

    const targets = this.strikeables();
    for (const shot of this.shots) {
      const was = shot.done;
      const hit = stepShot(shot, step, targets, this.groundAt);
      if (hit >= 0) this.strike(hit);
      if (!was && shot.done) {
        this.puffs.push({ pos: { ...shot.pos }, age: 0 });
        const side = hit >= 0 ? null : this.sideOf(shot.pos, this.released?.aimedOn === true);
        // Short on a growing swell was let go too soon; short on an ebbing one, too late; long, the reverse.
        const timing: Timing | undefined = side === 'short' || side === 'long'
          ? ((side === 'short') === (this.released?.rising !== false) ? 'early' : 'late')
          : undefined;
        this.call = { hit: hit >= 0, at: this.elapsed, pos: { ...shot.pos }, side, timing };
      }
    }
    this.shots = this.shots.filter((s) => !s.done);

    const decided = this.hits >= this.setup.need || (this.throwsLeft <= 0 && this.shots.length === 0);
    if (decided && this.decidedAt < 0) this.decidedAt = this.elapsed;
    if (this.decidedAt >= 0 && this.elapsed - this.decidedAt >= THROW.linger) this.finish(host);
  }

  /** The strength of a throw drawn for `held` seconds at this activity. */
  private reachAt(held: number): number {
    return drawReach(held, this.bell ? BELL_SPREAD : 1);
  }

  /**
   * Nudge the aim, by the least that does it, back onto target `index` as it swings: for the throw as it
   * is drawn now, then for a middling one. Aimed only for the middling throw, a far snowman had swung on
   * by the time a stronger or weaker one arrived, so "Let go!" never lit for it (critic round 38).
   */
  private follow(index: number): void {
    const from = this.aim;
    for (const reach of [this.reachAt(this.draw), 1]) {
      if (this.predict(reach) === index) return;
      for (const d of [0.01, -0.01, 0.025, -0.025, 0.05, -0.05, 0.09, -0.09]) {
        this.aim = from + d;
        if (this.predict(reach) === index) return;
      }
      this.aim = from;
    }
  }

  /** The standing target nearest the aim, by bearing from Pip's feet. */
  private nearestToAim(): { bearing: number; pos: Vec3 } | null {
    const all = this.strikeables().map((t) => {
      if (!t) return null;
      const bearing = Math.atan2(t.pos.x - this.feet.x, t.pos.z - this.feet.z);
      return { bearing, pos: t.pos, err: Math.abs(angleDelta(this.aim, bearing)) };
    });
    let pick = -1;
    for (const [i, t] of all.entries()) if (t && (pick < 0 || t.err < (all[pick]?.err ?? Infinity))) pick = i;
    // The one coached toward last frame is kept unless another is clearly nearer: with the aim between
    // two swaying snowmen, "Aim left" and "Aim right" took turns while E was held (critic round 33).
    const kept = all[this.coached];
    if (kept && pick >= 0 && kept.err < (all[pick]?.err ?? Infinity) + AIM_KEEP) pick = this.coached;
    this.coached = pick;
    const best = all[pick];
    return best ? { bearing: best.bearing, pos: best.pos } : null;
  }

  /**
   * Which side of the nearest target a missed throw landed on. Critic round 13 missed eight times and
   * never knew why: the loft is solved for the player, so a miss is always wide, and saying which way
   * says how to fix it.
   */
  private sideOf(at: Vec3, aimedOn: boolean): Side {
    const t = this.nearestToAim();
    if (!t) return null;
    const along = (at.x - t.pos.x) * Math.sin(t.bearing) + (at.z - t.pos.z) * Math.cos(t.bearing);
    // Let go lined up, so it was the strength: landed before the target, or flew past it.
    if (aimedOn) return along < 0 ? 'short' : 'long';
    // A raises the aim yaw, which turns it left; left of the line to the target is +(cos, -sin).
    const lateral = (at.x - t.pos.x) * Math.cos(t.bearing) - (at.z - t.pos.z) * Math.sin(t.bearing);
    if (Math.abs(lateral) >= 0.6) return lateral > 0 ? 'left' : 'right';
    return along < -0.3 ? 'short' : along > 0.3 ? 'long' : null;
  }

  /**
   * Which target a throw pressed now would strike, flying it against where the snowmen will have swung
   * to, or -1. Round 8: "lined up" judged where they stood at the press, and a throw on the cue to the
   * edge of a swinging snowman could land behind it. The cue now says what the throw will do.
   */
  private predict(reach = 1, yaw = this.aim): number {
    const shot = launch(this.feet, yaw, this.strikeables(), this.groundAt, reach, this.bell ? this.wind : undefined);
    const h = 1 / 60;
    for (let t = h; !shot.done; t += h) {
      const hit = stepShot(shot, h, this.strikeables(this.elapsed + t), this.groundAt);
      if (hit >= 0) return hit;
    }
    return -1;
  }

  private strike(index: number): void {
    this.hits++;
    if (this.bell) this.rang = 0;
    else if (this.fan[index]) {
      this.fan[index].down = true;
      this.fan[index].downAt = this.elapsed;
    }
  }

  private finish(host: ActivityHost): void {
    const outcome: ActivityResult = { score: this.hits };
    if (this.bell && this.hits > 0) outcome.bonus = 'clean';
    else if (this.fan.length > 0 && this.fan.every((t) => t.down)) outcome.bonus = 'clean-sweep';
    this.outcome = outcome;
    this.stage = 'done';
    // A bell that never rang is not news to carry: critic round 12 missed all eight and Pell still
    // heard it "clean". Any other round counts, misses and all.
    if (this.bell && this.hits === 0) return;
    if (!this.paid) {
      this.paid = true;
      host.award(outcome);
    }
  }

  markers(): readonly MarkerSpec[] {
    const out: PlacedMarker[] = [];
    // The snowmen are kept pieces (lit like the world), in one group that is emptied when the round ends.
    const keep = `throw:${this.def.id}`;
    if (this.fan.length > 0 && this.stage !== 'throwing') out.push({ shape: 'post', look: 'empty', keep, x: 0, y: 0, z: 0 });
    else if (this.fan.length > 0) {
      this.fan.forEach((t) => {
        const foot = targetFoot(this.def.pos, t, this.elapsed);
        const toward = Math.atan2(this.feet.x - foot.x, this.feet.z - foot.z);
        // A struck snowman falls flat on its back, away from the thrower, pivoting on its foot.
        const tip = t.down ? Math.min(1, (this.elapsed - t.downAt) / 0.3) * 1.45 : 0;
        out.push({
          shape: 'post', look: 'snowman-target', keep,
          x: foot.x, y: this.groundAt(foot.x, foot.z), z: foot.z,
          yaw: toward, pitch: -tip, size: 1,
        });
      });
    }
    // While aiming at the bell, a lit ring round it says which thing on the post is the target: from the
    // throwing spot the bell is a small shape under a crossbar (critic round 7; the director chose this).
    if (this.bell && this.stage === 'throwing' && this.rang < 0) {
      const b = this.bell.pos;
      out.push({ shape: 'ring', look: 'pulse', x: b.x, y: b.y - 0.1, z: b.z, yaw: Math.atan2(this.feet.x - b.x, this.feet.z - b.z), size: 0.95 });
      // The wind over the bell: an arrow pointing the way it blows, bigger the harder it blows.
      const g = this.gustNow;
      if (g !== 0) {
        const to = { x: b.x + Math.sign(g) * this.across.x * 10, z: b.z + Math.sign(g) * this.across.z * 10 };
        for (const m of signTo({ x: b.x, y: b.y - 0.9, z: b.z }, to, this.camYaw)) out.push({ ...m, size: (m.size ?? 1) * (0.6 + 0.5 * Math.abs(g)) });
      }
    }
    if (this.bell && this.rang >= 0 && this.rang < 1.2) {
      const b = this.bell.pos;
      const toward = Math.atan2(this.feet.x - b.x, this.feet.z - b.z);
      for (const lag of [0, 0.25]) {
        const age = this.rang - lag;
        if (age > 0) out.push({ shape: 'ring', look: 'pulse', x: b.x, y: b.y, z: b.z, yaw: toward, size: 0.6 + age * 2.4, strength: 1 - age / 1.2 });
      }
    }
    // A struck snowman throws off a ring, the way the bell does, so a hit is seen as well as counted.
    const since = this.call ? this.elapsed - this.call.at : Infinity;
    if (this.fan.length > 0 && this.call?.hit && since < THROW.call) {
      const c = this.call.pos;
      const toward = Math.atan2(this.feet.x - c.x, this.feet.z - c.z);
      out.push({ shape: 'ring', look: 'pulse', x: c.x, y: c.y, z: c.z, yaw: toward, size: 0.6 + since * 2, strength: 1 - since / THROW.call });
    }
    // The aim line steps aside while a throw is in the air, so the thing in flight is the thing you see.
    // Round 8: the line was a faint blue until lined up, and lost on snow; it is amber throughout now,
    // and a lined-up snowman gets a ring on the snow at its feet as well as a brighter, bigger line.
    if (this.stage === 'throwing' && this.decidedAt < 0 && this.throwsLeft > 0 && this.shots.length === 0) {
      const targets = this.strikeables();
      const on = this.predict();
      // Before the draw the arc is a faint guide for the aim; drawing, it is the throw as it stands, and
      // it turns bold while letting go would hit.
      const drawing = this.draw >= 0;
      const reach = drawing ? this.reachAt(this.draw) : 1;
      const lands = drawing && this.letGoHits;
      for (const p of previewArc(this.feet, this.aim, targets, this.groundAt, 9, reach, this.bell ? this.wind : undefined)) {
        // Sized to read at the game's resolution: at 1.25 the dots were a few pixels each, and critic round
        // 28 played the toss by the words alone, never seeing the arc turn bold.
        out.push({ shape: 'float', look: 'dot', x: p.x, y: p.y, z: p.z, strength: lands ? 1 : drawing ? 0.85 : 0.6, size: lands ? 2.8 : drawing ? 1.9 : 1.6 });
      }
      const t = on >= 0 && this.fan.length > 0 ? targets[on] : null;
      if (t) out.push({ shape: 'ring', look: 'halo', x: t.pos.x, y: this.groundAt(t.pos.x, t.pos.z), z: t.pos.z, size: 0.9, strength: 1 });
    }
    for (const s of this.shots) out.push({ shape: 'float', look: this.setup.missile, x: s.pos.x, y: s.pos.y, z: s.pos.z, yaw: s.age * 9, size: 1 });
    for (const p of this.puffs) {
      const k = p.age / THROW.puff;
      out.push({ shape: 'lump', look: 'puff', x: p.pos.x, y: p.pos.y, z: p.pos.z, size: 0.5 + k * 1.1, strength: 1 - k, yaw: k * 2 });
    }
    return out;
  }

  progress(): ActivityReadout | null {
    const need = this.setup.need;
    const fresh = this.call !== null && this.elapsed - this.call.at < THROW.call;
    const said = fresh && this.call ? `${this.call.hit ? WORDS.throwHit : WORDS.throwWide(this.call.side, this.call.timing)} · ` : '';
    // While the aim line is up, it says which way to turn, then that it will hit: critic round 13 could
    // not see the line "turn bold" and threw blind.
    const aiming = this.stage === 'throwing' && this.decidedAt < 0 && this.throwsLeft > 0 && this.shots.length === 0;
    let cue = '';
    let on = false;
    this.sayingNow = false;
    if (aiming && !fresh) {
      // Drawing on a locked target, the aim keeps itself on it: the words are only about letting go. They
      // used to flick to "Aim right (D)" every few frames as the snowman swung (critic round 38).
      on = (this.draw >= 0 && this.locked >= 0) || this.predict() >= 0;
      if (on) this.onAt = this.elapsed;
      else if (this.draw < 0 && this.elapsed - this.onAt < AIM_ON_HOLD) on = true;
      // Said for the whole round. Round 16 tried coaching to the first hit only, and critic round 16 was
      // left with a hit count and no idea which way to turn; round 13 hit nothing without the words.
      // The aim is coached, while drawing too (a snowman swings out of line); the strength is not:
      // on line and drawing, the words only say to let go on the arc.
      // Drawing, it says "Let go!" (in the urgent colour) for exactly the moment the arc is bold: critic
      // round 20 could not see the window in the dots and timed the release by trial.
      // At the bell the turn is toward the aim that rings it in this wind, not toward the bell itself.
      // "Let go!" is said until the first hit: after that the bold arc is the cue. Critic round 27 won the
      // toss reading the words alone and said the arc hardly mattered.
      const goal = on ? null : this.bell ? this.bellAim() : this.nearestToAim()?.bearing ?? null;
      const now = on && this.letGoHits;
      const sayNow = now && this.hits === 0;
      const lined = this.draw >= 0 ? (sayNow ? WORDS.throwNow : WORDS.throwDrawing) : WORDS.throwOn;
      this.sayingNow = this.draw >= 0 && sayNow;
      if (goal !== null && !on) {
        const off = angleDelta(this.aim, goal);
        if (this.saidSide === null || Math.abs(off) > AIM_SIDE_KEEP) this.saidSide = off > 0 ? 'left' : 'right';
      }
      cue = on ? `${lined} · ` : goal !== null && this.saidSide !== null ? `${WORDS.throwTurn(this.saidSide)} · ` : '';
      on = this.draw >= 0 ? now : on;
    }
    const g = this.gustNow;
    const wind = this.bell && this.stage === 'throwing' && this.decidedAt < 0 && this.throwsLeft > 0
      ? `${WORDS.bellWind(g > 0 ? 'right' : 'left', Math.abs(g))} · `
      : '';
    return {
      label: `${said}${wind}${cue}Hits ${Math.min(this.hits, need)} / ${need} · ${this.throwsLeft} left`,
      fraction: need === 0 ? 0 : Math.min(1, this.hits / need),
      urgent: on,
      cue: this.sayingNow ? WORDS.throwNow : undefined,
    };
  }

  /**
   * The aim that rings the bell in this gust: the middle of the run of aims that would, searched either
   * side of the bell's bearing. Worked out once a gust.
   */
  private bellAim(): number | null {
    if (!this.bell) return null;
    if (this.windAim?.gust === this.gust) return this.windAim.yaw;
    const b = Math.atan2(this.bell.pos.x - this.feet.x, this.bell.pos.z - this.feet.z);
    const hits: number[] = [];
    for (let d = -0.4; d <= 0.4001; d += 0.02) if (this.predict(1, b + d) >= 0) hits.push(b + d);
    const yaw = hits.length > 0 ? (hits[0] + hits[hits.length - 1]) / 2 : null;
    this.windAim = { gust: this.gust, yaw };
    return yaw;
  }

  /** The result card: critic round 4 used all eight throws and the panel just went away. */
  summary(): string | null {
    if (this.stage !== 'done') return null;
    if (this.bell) return this.hits === 0 ? WORDS.bellSilent : WORDS.bellRang;
    return WORDS.throwResult(this.hits, this.setup.need);
  }

  isComplete(): boolean {
    return this.stage !== 'throwing';
  }

  result(): ActivityResult | null {
    return this.stage === 'done' ? this.outcome : null;
  }

  abort(): void {
    if (this.stage !== 'throwing') return;
    this.stage = 'aborted';
    this.outcome = null;
  }

  /** Heading Pip should face: the aim. The session may turn the body (and so the camera) to it. */
  facing(): number {
    return this.aim;
  }

  get aimYaw(): number {
    return this.aim;
  }

  /** At the bell, the aim that rings it in the wind now blowing (null elsewhere): for tests and tools. */
  get ringAim(): number | null {
    return this.bell ? this.bellAim() : null;
  }

  /** Current hit volumes (bell or standing posts), for tests and tools. */
  get hitVolumes(): readonly (Strikeable | null)[] {
    return this.strikeables();
  }

  get hitCount(): number {
    return this.hits;
  }

  get inFlight(): number {
    return this.shots.length;
  }

  /**
   * A throw is being drawn and letting go now would hit: the moment the arc turns bold and the words say
   * "Let go!". A release up to LET_GO_REACT after it still goes as it would have then.
   */
  get letGoHits(): boolean {
    return this.draw >= 0 && this.predict(this.reachAt(this.draw)) >= 0;
  }
}

export function createTargetActivity(def: ActivityDef): TargetActivity {
  return new TargetActivity(def);
}
