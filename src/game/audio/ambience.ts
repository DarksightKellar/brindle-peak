/**
 * The sound of the place, under the music. Every sound but the wind comes from somewhere real, and is
 * louder the nearer Pip is to it and to the left or right as it lies from the camera:
 *
 *   the hot pools  — each one simmers and bubbles; walk up to one and it fills the ear
 *   stoves         — Nana's cabin and the hamlet houses tick and crackle (more after dusk)
 *   lake ice       — now and then a low moan as it settles, somewhere on the ice around you
 *   pines          — snow slides off a bough near you; chickadees call from them by day
 *   the owl        — Fen hoots from his branch after dusk, and other owls from deep in the pines
 *   wind           — everywhere, but set by where you stand: stronger the higher and more open the
 *                    ground, a whistle in it up high, a roar in ridge gusts, hushed among trees
 *
 * The pure decisions (how near is near, which way a sound pans, how much wind) are unit-tested; the
 * rest renders them. Beds (wind, whistle, simmer) are looped noise through filters; everything else is
 * a one-shot scheduled a little ahead. All synthesised: nothing to load, and it never repeats exactly.
 */
import { clamp, makeRng, smoothstep } from '../../core/contracts';
import { releaseWhenDone } from './teardown';

export interface SoundSpot { x: number; y: number; z: number }

/** Where things are that make a noise. Built once from the world (world/assemble.ts). */
export interface SoundWorld {
  pools: readonly SoundSpot[];
  stoves: readonly SoundSpot[];
  /** Pine trunks, as x, z pairs. */
  pines: Float32Array;
  owls: readonly SoundSpot[];
  isIce(x: number, z: number): boolean;
}

/** Where the ears are: Pip's position, and the camera's facing (unit, on the ground plane). */
export interface Listener { x: number; y: number; z: number; fx: number; fz: number }

export interface AmbientPlace {
  /** Height of the ground under Pip, world units: about 2 on the lake, 94 on the peak. */
  altitude: number;
  /** A ridge gust is blowing. */
  gust: boolean;
  /** 0 day .. 1 blue hour. */
  dusk: number;
}

/** 1 within `near`, fading to 0 by `far`. */
export function proximity(dist: number, near: number, far: number): number {
  return Number.isFinite(dist) ? 1 - smoothstep(near, far, dist) : 0;
}

/** -0.8 left .. 0.8 right (never hard over), for a sound at (x, z) heard by `l`. */
export function panToward(l: Listener, x: number, z: number): number {
  const dx = x - l.x, dz = z - l.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-3) return 0;
  // The camera's right on the ground plane: forward (fx, fz) turned a quarter to the right.
  return clamp((dx * -l.fz + dz * l.fx) / len, -1, 1) * 0.8;
}

/**
 * The wind, 0..1: a breath on the valley floor, rising with the height of the ground, roaring in a
 * gust; trees around you (`shelter`, 0 open .. 1 deep in the pines) take much of it away.
 */
export function windLevel(altitude: number, shelter: number, gust: boolean): number {
  const open = 0.25 + 0.55 * smoothstep(12, 90, Number.isFinite(altitude) ? altitude : 0);
  const lee = 1 - 0.6 * clamp(Number.isFinite(shelter) ? shelter : 0, 0, 1);
  return clamp((open + (gust ? 0.3 : 0)) * lee, 0, 1);
}

/** The high, narrow whistle in the wind: exposed heights only. */
export function whistleLevel(altitude: number, shelter: number, gust: boolean): number {
  const high = smoothstep(40, 90, Number.isFinite(altitude) ? altitude : 0);
  return clamp((0.55 * high + (gust ? 0.4 : 0)) * (1 - clamp(Number.isFinite(shelter) ? shelter : 0, 0, 1)), 0, 1);
}

/** This many pines within SHELTER_RADIUS shelter you fully. */
const SHELTER_COUNT = 9;
const SHELTER_RADIUS = 12;
/** Pines further than this are not listened to. */
const TREE_HEARING = 34;

/** Bus level for the whole ambience, under the master make-up gain. */
const LEVEL = 0.06;
/** Bed gains at full level. The wind used to sit level with the music; the director called it too loud. */
const WIND = 0.24, WHISTLE = 0.09, SIMMER = 0.2;
/** How quickly a bed follows, seconds (time constant). */
const BED_TAU = 0.8;
/** Most events a second, before distance thins them. */
const RATE = { bubble: 7, crackle: 5, ice: 1 / 22, bough: 1 / 7, bird: 1 / 6, owl: 1 / 12 } as const;
type EventKind = keyof typeof RATE;
const KINDS = Object.keys(RATE) as EventKind[];
/** Schedule this far ahead of the clock. */
const AHEAD = 0.2;

export interface Ambience {
  /** Once a frame: where the ears are and what the place is like. */
  update(listener: Listener, place: AmbientPlace): void;
  setWorld(world: SoundWorld): void;
  dispose(): void;
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number, seed: number): AudioBuffer {
  const length = Math.max(2, Math.floor(ctx.sampleRate * seconds));
  const fade = Math.floor(ctx.sampleRate * 0.25);
  const raw = new Float32Array(length);
  const rng = makeRng(seed);
  // Pinkish: white through a gentle one-pole, so the wind has weight without a rumble.
  let last = 0;
  for (let i = 0; i < length; i++) {
    last = last * 0.86 + rng.range(-1, 1) * 0.14;
    raw[i] = last * 3.2;
  }
  // Cross-fade the seam so the loop has no click.
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    raw[i] = raw[i] * t + raw[length - fade + i] * (1 - t);
  }
  const buffer = ctx.createBuffer(1, length - fade, ctx.sampleRate);
  buffer.getChannelData(0).set(raw.subarray(0, length - fade));
  return buffer;
}

interface Heard { x: number; z: number; d: number }
const EMPTY_WORLD: SoundWorld = { pools: [], stoves: [], pines: new Float32Array(0), owls: [], isIce: () => false };

export function createAmbience(ctx: BaseAudioContext, out: AudioNode): Ambience {
  const rng = makeRng(0xa3b1e7);
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(LEVEL, ctx.currentTime);
  bus.connect(out);
  const noise = noiseBuffer(ctx, 7, 0x77d1);
  const white = noiseBuffer(ctx, 3, 0x3c2f);
  let world: SoundWorld = EMPTY_WORLD;

  const bed = (type: BiquadFilterType, hz: number, q: number): { filter: BiquadFilterNode; gain: GainNode; pan: StereoPannerNode; src: AudioBufferSourceNode } => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(hz, ctx.currentTime);
    filter.Q.setValueAtTime(q, ctx.currentTime);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    const pan = ctx.createStereoPanner();
    src.connect(filter).connect(gain).connect(pan).connect(bus);
    src.start(ctx.currentTime, rng.range(0, 6));
    return { src, filter, gain, pan };
  };
  const wind = bed('bandpass', 420, 0.7);
  const whistle = bed('bandpass', 900, 9);
  const simmer = bed('lowpass', 520, 0.5);

  const next = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<EventKind, number>;
  let started = false;
  let disposed = false;
  // What is near, refreshed a few times a second rather than every frame.
  let surveyed = -1;
  let shelter = 0;
  let pinesNear: Heard[] = [];
  let pool: Heard | null = null;
  let stove: Heard | null = null;

  /** Seconds until the next event for a rate, never zero. */
  const gap = (rate: number): number => -Math.log(1 - rng.range(0, 0.98)) / Math.max(rate, 1e-3);
  const nearest = (spots: readonly SoundSpot[], l: Listener): Heard | null => {
    let best: Heard | null = null;
    for (const s of spots) {
      const d = Math.hypot(s.x - l.x, s.z - l.z);
      if (!best || d < best.d) best = { x: s.x, z: s.z, d };
    }
    return best;
  };
  const survey = (l: Listener): void => {
    const p = world.pines;
    const near: Heard[] = [];
    let close = 0;
    for (let i = 0; i + 1 < p.length; i += 2) {
      const dx = p[i] - l.x, dz = p[i + 1] - l.z;
      if (Math.abs(dx) > TREE_HEARING || Math.abs(dz) > TREE_HEARING) continue;
      const d = Math.hypot(dx, dz);
      if (d > TREE_HEARING) continue;
      if (d < SHELTER_RADIUS) close++;
      if (near.length < 80) near.push({ x: p[i], z: p[i + 1], d });
    }
    pinesNear = near;
    shelter = Math.min(1, close / SHELTER_COUNT);
    pool = nearest(world.pools, l);
    stove = nearest(world.stoves, l);
  };
  const pick = <T>(list: readonly T[]): T | undefined => list[Math.floor(rng.range(0, list.length - 1e-9))];

  /** A panned voice: every one-shot goes through one, so each sound sits where its source is. */
  const voice = (at: number, gain: number, pan: number): { env: GainNode; tail: AudioNode[] } => {
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(pan, at);
    env.connect(g).connect(p).connect(bus);
    return { env, tail: [env, g, p] };
  };

  function tone(at: number, hz: number, toHz: number, dur: number, peak: number, gain: number, pan: number, attack = 0.03): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(hz, at);
    osc.frequency.exponentialRampToValueAtTime(toHz, at + dur);
    const v = voice(at, gain, pan);
    v.env.gain.exponentialRampToValueAtTime(peak, at + Math.min(attack, dur * 0.4));
    v.env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(v.env);
    osc.start(at);
    osc.stop(at + dur + 0.05);
    releaseWhenDone([osc], v.tail);
  }

  /** A filtered noise burst; the filter sweeps from `hz` to `toHz` (pass the same to hold it). */
  function burst(at: number, dur: number, peak: number, type: BiquadFilterType, hz: number, toHz: number, gain: number, pan: number): void {
    const src = ctx.createBufferSource();
    src.buffer = white;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(hz, at);
    if (toHz !== hz) filter.frequency.exponentialRampToValueAtTime(toHz, at + dur);
    const v = voice(at, gain, pan);
    v.env.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.08, dur * 0.3));
    v.env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filter).connect(v.env);
    src.start(at, rng.range(0, 2));
    src.stop(at + dur + 0.05);
    releaseWhenDone([src], [filter, ...v.tail]);
  }

  /** Where one event comes from and how loud, or null when nothing is near enough to make it. */
  const source = (k: EventKind, l: Listener, p: AmbientPlace): { x: number; z: number; g: number } | null => {
    switch (k) {
      case 'bubble': {
        const g = pool ? proximity(pool.d, 3, 26) : 0;
        return pool && g > 0.02 ? { x: pool.x, z: pool.z, g } : null;
      }
      case 'crackle': {
        const g = stove ? proximity(stove.d, 3, 15) * (0.75 + 0.25 * p.dusk) : 0;
        return stove && g > 0.02 ? { x: stove.x, z: stove.z, g } : null;
      }
      case 'ice': {
        // Somewhere on the ice around you: a few tries at a point in a ring, and only if it is ice.
        for (let i = 0; i < 6; i++) {
          const a = rng.range(0, Math.PI * 2), r = rng.range(5, 40);
          const x = l.x + Math.cos(a) * r, z = l.z + Math.sin(a) * r;
          if (world.isIce(x, z)) return { x, z, g: proximity(r, 8, 44) };
        }
        return null;
      }
      case 'bough': {
        const t = pick(pinesNear);
        return t ? { x: t.x, z: t.z, g: proximity(t.d, 4, TREE_HEARING) * Math.min(1, pinesNear.length / 6) } : null;
      }
      case 'bird': {
        const t = pick(pinesNear);
        const day = 1 - p.dusk;
        return t && day > 0.05 ? { x: t.x, z: t.z, g: proximity(t.d, 6, TREE_HEARING) * day } : null;
      }
      case 'owl': {
        if (p.dusk < 0.05) return null;
        const fen = nearest(world.owls, l);
        if (fen && fen.d < 90) return { x: fen.x, z: fen.z, g: proximity(fen.d, 10, 90) * p.dusk };
        const t = pinesNear.length > 8 ? pick(pinesNear) : undefined;
        return t ? { x: t.x, z: t.z, g: 0.5 * p.dusk } : null;
      }
    }
  };

  const play: Record<EventKind, (at: number, g: number, pan: number) => void> = {
    // A bubble rises in pitch as it breaks.
    bubble: (at, g, pan) => tone(at, rng.range(260, 520), rng.range(700, 1300), rng.range(0.04, 0.09), 0.5, g, pan),
    crackle: (at, g, pan) => {
      const hz = rng.range(1800, 4000);
      burst(at, rng.range(0.006, 0.016), rng.range(1.6, 3.2), 'highpass', hz, hz, g, pan);
      if (rng.range(0, 1) < 0.15) burst(at + 0.01, 0.06, 2.2, 'bandpass', 900, 900, g, pan);
    },
    // Lake ice settling, far off under the surface: a low, slow moan that swells in and sinks, sometimes
    // with a soft thud under it. It was a bright, sudden "pew" every few seconds; the director found it
    // jarring. Rarer now, quieter, and with a gentle onset so it never startles.
    ice: (at, g, pan) => {
      const hz = rng.range(520, 900), dur = rng.range(1.2, 1.9);
      tone(at, hz, hz * 0.4, dur, 0.1, g, pan, 0.25);
      tone(at + 0.05, hz * 0.75, hz * 0.32, dur * 1.1, 0.05, g, pan, 0.3);
      if (rng.range(0, 1) < 0.4) burst(at, 0.45, 0.45, 'lowpass', 150, 150, g, pan);
    },
    // Snow sliding off a bough: a soft, dull rush.
    bough: (at, g, pan) => burst(at, rng.range(0.5, 0.9), 0.8, 'lowpass', 900, 260, g, pan),
    // A chickadee's "fee-bee": two clean whistles, the second lower.
    bird: (at, g, pan) => {
      const hz = rng.range(3200, 3700);
      tone(at, hz, hz * 0.98, 0.32, 0.22, g, pan);
      tone(at + 0.38, hz * 0.84, hz * 0.83, 0.3, 0.2, g, pan);
      if (rng.range(0, 1) < 0.4) {
        tone(at + 0.9, hz, hz * 0.98, 0.3, 0.16, g, pan);
        tone(at + 1.26, hz * 0.84, hz * 0.83, 0.28, 0.14, g, pan);
      }
    },
    // An owl: two soft hoots.
    owl: (at, g, pan) => {
      tone(at, 410, 380, 0.45, 0.32, g, pan);
      tone(at + 0.75, 400, 360, 0.7, 0.26, g, pan);
    },
  };

  return {
    setWorld(w): void {
      world = w;
      surveyed = -1;
    },
    update(l, place): void {
      if (disposed) return;
      const now = ctx.currentTime;
      if (!started) {
        started = true;
        for (const k of KINDS) next[k] = now + gap(RATE[k]);
      }
      if (surveyed < 0 || now - surveyed > 0.25) {
        survey(l);
        surveyed = now;
      }

      // The wind breathes: three slow sines at unrelated rates, so it never settles into a loop.
      const b = 0.5 + 0.22 * Math.sin(now * 0.31) + 0.17 * Math.sin(now * 0.73 + 1.3) + 0.11 * Math.sin(now * 1.37 + 4.1);
      const w = windLevel(place.altitude, shelter, place.gust);
      const wh = whistleLevel(place.altitude, shelter, place.gust);
      wind.gain.gain.setTargetAtTime(WIND * w * (0.55 + 0.6 * b), now, BED_TAU * 0.5);
      // Among trees the wind is lower and duller: the high end is the first thing the boughs take.
      wind.filter.frequency.setTargetAtTime((300 + 380 * b + 260 * wh) * (1 - 0.35 * shelter), now, 0.6);
      whistle.gain.gain.setTargetAtTime(WHISTLE * wh * b * b, now, BED_TAU * 0.5);
      whistle.filter.frequency.setTargetAtTime(760 + 520 * b, now, 0.5);
      simmer.gain.gain.setTargetAtTime(SIMMER * (pool ? proximity(pool.d, 3, 26) : 0), now, BED_TAU);
      if (pool) simmer.pan.pan.setTargetAtTime(panToward(l, pool.x, pool.z), now, 0.15);

      for (const k of KINDS) {
        let guard = 0;
        while (next[k] < now + AHEAD && guard++ < 16) {
          if (next[k] >= now - 0.05) {
            const s = source(k, l, place);
            // Thinning: a far source makes fewer sounds as well as quieter ones.
            if (s && rng.range(0, 1) < 0.35 + 0.65 * s.g) play[k](Math.max(next[k], now), s.g, panToward(l, s.x, s.z));
          }
          next[k] += gap(RATE[k]);
          if (next[k] < now - 1) next[k] = now + gap(RATE[k]); // after a stall, don't replay the backlog
        }
      }
    },
    dispose(): void {
      disposed = true;
      for (const n of [wind, whistle, simmer]) {
        try {
          n.src.stop();
        } catch {
          /* never started */
        }
      }
      try {
        bus.disconnect();
      } catch {
        /* already gone */
      }
    },
  };
}
