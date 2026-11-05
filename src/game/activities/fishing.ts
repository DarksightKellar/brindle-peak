/**
 * Fishing. Stand at the water, watch the float, and strike when something takes it.
 *
 * It used to be a metronome: the float swung on a fixed tempo and the "bite" came round every two
 * seconds, which played as a timing loop rather than as waiting for a fish. Now each cast is a wait of
 * its own length with a nibble or two in it (the float twitches and settles: not yet), then the bite —
 * the float is pulled under with a splash, and that is the moment to press E. Strike at a nibble and
 * the fish is spooked; miss the bite and it slips off. Either way the line goes back out.
 *
 * A catch is shown, not told: the fish comes up on the line and hangs in front of Pip, in its journal
 * colours. No timer, no quota; the clock, cast count and press times decide everything, so a replay
 * of the same input lands the same fish.
 */

import { makeRng } from '../../core/contracts';
import type {
  ActivityDef, ActivityHost, ActivityInstance, ActivityReadout, ActivityResult, FishDef, FishRarity, GameState, MarkerSpec, Rng, Vec3,
} from '../../core/contracts';
import { FISH, POOL_FISH } from '../../data/fish';
import { WORDS } from './activityWords';
import { fishSpotFor, floatPoint, standPoint, type FishSpot } from './fishSpots';
import { catchMarkers, floatMarkers } from './fishingLooks';

export const FISHING = {
  /**
   * Seconds after the float goes under during which a press still lands the fish. 0.9 was gone before
   * critic round 32 had read "NOW" in the corner; with the cue in the middle of the view it is 1.3.
   */
  window: 1.3,
  /** Shortest wait for a bite, and how much longer it can be. */
  waitMin: 2.6,
  waitSpread: 3.6,
  /** A nibble: how long the float twitches. */
  nibble: 0.32,
  /** Quiet beat after a spooked or lost fish before the line settles again. */
  pause: 1.3,
  /** How long the catch is held up before the activity closes. */
  reel: 2.6,
} as const;

/** True when the press lands inside the strike window that opens at `biteAt`. Early is a miss. */
export function resolveCatch(biteAt: number, pressTime: number, window: number): boolean {
  const late = pressTime - biteAt;
  // Epsilon so the closing edge is genuinely inclusive despite float accumulation.
  return late >= 0 && late <= window + 1e-9;
}

export function rarityWeight(rarity: FishRarity): number {
  if (rarity === 'rare') return 1;
  if (rarity === 'uncommon') return 3;
  return 6;
}

/** Weighted pick from the authored table; deterministic for a given rng state. */
export function pickFish(rng: Rng, table: readonly FishDef[]): FishDef {
  if (table.length === 0) return FISH[0];
  let total = 0;
  for (let i = 0; i < table.length; i++) total += rarityWeight(table[i].rarity);
  let roll = rng.next() * total;
  for (let i = 0; i < table.length; i++) {
    roll -= rarityWeight(table[i].rarity);
    if (roll <= 0) return table[i];
  }
  return table[table.length - 1];
}

/**
 * Hollis's mitten. While "fish the Creek Pool" is the mitten errand's step, what comes up on the line
 * there is the mitten, not a fish: the step used to land an Arctic Char and then ask Pip to tell Hollis
 * where a mitten they never saw had been.
 */
export const MITTEN: FishDef = { id: 'mitten', name: "Hollis's mitten", rarity: 'common', value: 0, body: '#c4574c', accent: '#f0d8b4' };
const MITTEN_POOL = 'pinewind-creek-fish';

function mittenWanted(s: Readonly<GameState>): boolean {
  const p = s.quests['hollis-mitten'];
  return p !== undefined && p.status === 'active' && Math.floor(p.step) === 1;
}

/** The pool's own fish, from the journal table; the whole table for a pool with none named. */
function poolTable(id: string, table: readonly FishDef[]): readonly FishDef[] {
  const ids = POOL_FISH[id];
  const own = ids ? ids.map((f) => table.find((t) => t.id === f)).filter((t): t is FishDef => t !== undefined) : [];
  return own.length > 0 ? own : table;
}

/** Position-derived seed: activities have authored coordinates, so no string hashing. */
function seedOf(def: ActivityDef): number {
  return Math.abs(Math.round(def.pos.x * 7919 + def.pos.z * 104729)) >>> 0;
}

type Stage = 'wait' | 'bite' | 'spooked' | 'reel' | 'done' | 'aborted';

export class FishingActivity implements ActivityInstance {
  readonly def: ActivityDef;
  private readonly table: readonly FishDef[];
  private readonly spot: FishSpot | null;
  private stage: Stage = 'wait';
  private total = 0;
  private castAt = 0;
  private biteAt = 0;
  private nibbles: number[] = [];
  private pauseLeft = 0;
  /** `total` when the current stage began, for the float's dip, the splash and the leap. */
  private since = 0;
  private casts = 0;
  private misses = 0;
  private caught: FishDef | null = null;
  private outcome: ActivityResult | null = null;
  private paid = false;
  /** The frame that opened the activity still carries its interact press; spend it. */
  private swallowPress = false;
  private floatAt: Vec3 = { x: 0, y: 0, z: 0 };
  private stand: (Vec3 & { yaw: number }) | null = null;

  constructor(def: ActivityDef, table: readonly FishDef[] = FISH) {
    this.def = def;
    this.table = poolTable(def.id, table);
    this.spot = fishSpotFor(def.id);
  }

  start(host: ActivityHost): void {
    const s = this.spot;
    this.stand = s ? standPoint(s, host.playerPos, host.terrain) : null;
    const from = this.stand ?? host.playerPos;
    if (s) this.floatAt = floatPoint(s, from, host.terrain);
    else {
      const fx = -Math.sin(host.cameraYaw), fz = -Math.cos(host.cameraYaw);
      const px = from.x + fx * 3.4, pz = from.z + fz * 3.4;
      this.floatAt = { x: px, y: host.terrain.heightAt(px, pz) + 0.22, z: pz };
    }
    this.total = 0;
    this.casts = 0;
    this.misses = 0;
    this.caught = null;
    this.outcome = null;
    this.paid = false;
    this.swallowPress = true;
    this.cast();
  }

  private cast(): void {
    const rng = makeRng(seedOf(this.def) + this.casts * 7919 + 17);
    const wait = FISHING.waitMin + rng.next() * FISHING.waitSpread;
    this.castAt = this.total;
    this.biteAt = this.total + wait;
    // One or two nibbles, never in the last half-second before the bite.
    this.nibbles = [this.total + wait * (0.25 + rng.next() * 0.2)];
    if (rng.next() < 0.6) this.nibbles.push(this.total + wait * (0.6 + rng.next() * 0.15));
    this.casts++;
    this.enter('wait');
  }

  private enter(stage: Stage): void {
    this.stage = stage;
    this.since = this.total;
  }

  private lose(): void {
    this.misses++;
    this.pauseLeft = FISHING.pause;
    this.enter('spooked');
  }

  private land(host: ActivityHost): void {
    if (this.def.id === MITTEN_POOL && mittenWanted(host.state)) {
      this.caught = MITTEN;
      this.outcome = { score: 0, bonus: 'mitten' };
      this.enter('reel');
      if (!this.paid) {
        this.paid = true;
        host.award(this.outcome);
      }
      return;
    }
    const rng = makeRng(seedOf(this.def) + this.casts * 7919 + this.misses * 104729);
    // The pool's own fish first, until the journal has it.
    const own = this.table[0];
    const fish = own && !host.state.fish[own.id] ? own : pickFish(rng, this.table);
    const isNew = !host.state.fish[fish.id];
    const outcome: ActivityResult = { score: fish.value, bonus: fish.id };
    this.caught = fish;
    this.outcome = outcome;
    this.enter('reel');
    host.emit('fish:caught', { id: fish.id, isNew });
    if (!this.paid) {
      this.paid = true;
      host.award(outcome);
    }
  }

  update(dt: number, host: ActivityHost): void {
    if (this.stage === 'done' || this.stage === 'aborted') return;
    if (host.input.cancelPressed) {
      this.abort();
      return;
    }
    this.total += Math.max(0, Math.min(dt, 0.1));
    const pressed = host.input.interactPressed && !this.swallowPress;
    this.swallowPress = false;

    if (this.stage === 'reel') {
      if (this.total - this.since >= FISHING.reel) this.stage = 'done';
      return;
    }
    if (this.stage === 'spooked') {
      this.pauseLeft -= Math.max(0, Math.min(dt, 0.1));
      if (this.pauseLeft <= 0) this.cast();
      return;
    }
    if (this.stage === 'wait' && this.total >= this.biteAt) this.enter('bite');
    if (pressed) {
      if (this.stage === 'bite' && resolveCatch(this.biteAt, this.total, FISHING.window)) this.land(host);
      else this.lose();
      return;
    }
    if (this.stage === 'bite' && this.total > this.biteAt + FISHING.window) this.lose();
  }

  /** How far the float is pulled down right now, in metres (negative is under). */
  private dip(): number {
    const t = this.total;
    if (this.stage === 'bite') return -0.3 - 0.05 * Math.sin(t * 30);
    if (this.stage === 'spooked') return Math.max(0, 0.18 - (t - this.since) * 0.4);
    if (this.stage === 'reel') return 0;
    const n = this.nibbles.find((at) => t >= at && t < at + FISHING.nibble);
    if (n !== undefined) return -0.08 * Math.sin(((t - n) / FISHING.nibble) * Math.PI * 3);
    return 0.025 * Math.sin((t - this.castAt) * 2.2);
  }

  markers(): readonly MarkerSpec[] {
    if (this.stage === 'done' || this.stage === 'aborted') return [];
    const age = this.total - this.since;
    const stand = this.stand ?? { x: this.floatAt.x, y: this.floatAt.y, z: this.floatAt.z + 2 };
    const reeling = this.stage === 'reel';
    const out = floatMarkers({
      float: this.floatAt, stand, dip: this.dip(), age, clock: this.total, showFloat: !reeling,
      ripple: this.stage !== 'spooked', splash: this.stage === 'bite' || (reeling && age < 0.5),
    });
    if (reeling && this.caught) out.push(...catchMarkers(this.caught, this.floatAt, stand, age));
    return out;
  }

  progress(): ActivityReadout | null {
    if (this.stage === 'bite') return { label: 'NOW — press E', fraction: null, urgent: true, cue: WORDS.cueBite };
    if (this.stage === 'reel' && this.caught) return { label: this.caught.name, fraction: 1, urgent: true };
    const state = this.stage === 'spooked' ? 'Let it settle' : 'Waiting for a bite';
    return { label: `${state} · cast ${this.casts}`, fraction: null };
  }

  isComplete(): boolean {
    return this.stage === 'done' || this.stage === 'aborted';
  }

  result(): ActivityResult | null {
    return this.stage === 'done' ? this.outcome : null;
  }

  abort(): void {
    if (this.stage === 'done' || this.stage === 'aborted') return;
    // Leaving while the fish is held up keeps the fish: it was already landed and counted.
    if (this.stage === 'reel') {
      this.stage = 'done';
      return;
    }
    this.stage = 'aborted';
    this.outcome = null;
  }

  /** Stand on the bank facing the water for as long as the line is out. */
  ride(): (Vec3 & { yaw: number }) | null {
    return this.stage === 'done' || this.stage === 'aborted' ? null : this.stand;
  }

  /** The camera frames Pip and the float together, from the side, so the bird never hides it. */
  focus(): Vec3 | null {
    return this.stand ? { ...this.floatAt } : null;
  }

  summary(): string | null {
    if (this.stage !== 'done' || !this.caught) return null;
    return this.caught === MITTEN ? WORDS.mittenResult : WORDS.fishResult(this.caught.name);
  }

  /** Seconds since the first cast. */
  get elapsed(): number { return this.total; }
  /** Absolute time the current bite comes (the float goes under). */
  get strikeAt(): number { return this.biteAt; }
  get castsMade(): number { return this.casts; }
  get missesMade(): number { return this.misses; }
  get lastCatch(): FishDef | null { return this.caught; }
}

export function createFishingActivity(def: ActivityDef, table?: readonly FishDef[]): FishingActivity {
  return new FishingActivity(def, table);
}
