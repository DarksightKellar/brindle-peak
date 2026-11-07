/**
 * The sound of the place, under the music: wind everywhere, and something particular to each corner.
 *
 *   Hearth Hollow  — a soft breeze, Nana's stove ticking, a chickadee now and then
 *   Pinewind Wood  — wind hushed by the pines, snow sliding off a bough, birds; an owl after dusk
 *   Frozen Reach   — open wind, and the lake ice singing as it settles (the falling "pew" of real ice)
 *   the springs    — the pools simmering and bubbling
 *   the hamlet     — stoves crackling, a bird or two
 *   Windscar Ridge — strong wind with a whistle in it, roaring in the gusts; the peak is wilder still
 *
 * `ambienceFor` is the pure decision (levels per layer, 0..1), unit-tested; the rest renders it.
 * Beds (wind, whistle, simmer) are looped noise through filters; everything else is a one-shot
 * scheduled a little ahead. All of it is synthesised: nothing to load, and it never repeats exactly.
 */
import { clamp, makeRng } from '../../core/contracts';
import { releaseWhenDone } from './teardown';

export interface AmbienceMix {
  /** The wind bed. */
  wind: number;
  /** A high, narrow whistle in the wind: exposed ground only. */
  whistle: number;
  /** Hot water simmering, and the bubbles breaking in it. */
  simmer: number;
  /** A stove's crackle and tick. */
  crackle: number;
  /** Lake ice settling. */
  ice: number;
  /** Snow sliding off pine boughs. */
  boughs: number;
  /** Small birds calling, by day. */
  birds: number;
  /** An owl, after dusk. */
  owls: number;
}

type Layer = keyof AmbienceMix;
const LAYERS: readonly Layer[] = ['wind', 'whistle', 'simmer', 'crackle', 'ice', 'boughs', 'birds', 'owls'];
const SILENT: AmbienceMix = { wind: 0, whistle: 0, simmer: 0, crackle: 0, ice: 0, boughs: 0, birds: 0, owls: 0 };

const PLACES: Record<string, Partial<AmbienceMix>> = {
  hearth: { wind: 0.3, crackle: 0.45, birds: 0.5, owls: 0.3 },
  pinewind: { wind: 0.32, boughs: 1, birds: 1, owls: 1 },
  reach: { wind: 0.5, whistle: 0.12, ice: 1, birds: 0.15 },
  kettles: { wind: 0.22, simmer: 1, birds: 0.3 },
  hamlet: { wind: 0.28, crackle: 0.7, birds: 0.4, owls: 0.25 },
  ridge: { wind: 0.75, whistle: 0.45 },
  peak: { wind: 0.85, whistle: 0.65 },
};

/** Levels for a place; `gust` is a ridge gust, `dusk` 0 day .. 1 blue hour. */
export function ambienceFor(zone: string, gust: boolean, dusk: number): AmbienceMix {
  const d = Number.isFinite(dusk) ? clamp(dusk, 0, 1) : 0;
  const base = { ...SILENT, ...(PLACES[zone] ?? { wind: 0.3 }) };
  if (gust) {
    base.wind = Math.min(1, base.wind + 0.3);
    base.whistle = Math.min(1, base.whistle + 0.4);
  }
  // Birds go quiet as the light goes; the owl wakes; stoves are fed for the evening.
  base.birds *= 1 - d;
  base.owls *= d;
  base.crackle = Math.min(1, base.crackle * (1 + 0.5 * d));
  for (const k of LAYERS) base[k] = clamp(base[k], 0, 1);
  return base;
}

/** Bus level for the whole ambience, under the master make-up gain. */
const LEVEL = 0.06;
/** Bed gains at full layer level. */
const WIND = 0.5, WHISTLE = 0.16, SIMMER = 0.15;
/** How quickly a bed follows the place, seconds (time constant). */
const BED_TAU = 1.2;
/** One-shot rates per second at full layer level. */
const RATE: Record<'bubble' | 'crackle' | 'ice' | 'bough' | 'bird' | 'owl', number> = {
  bubble: 6, crackle: 4, ice: 1 / 11, bough: 1 / 12, bird: 1 / 9, owl: 1 / 16,
};
/** Schedule this far ahead of the clock. */
const AHEAD = 0.2;

export interface Ambience {
  /** Once a frame: the place's mix. The wind's slow breathing runs on the audio clock. */
  update(mix: AmbienceMix): void;
  dispose(): void;
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number, seed: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const rng = makeRng(seed);
  // Pinkish: white through a gentle one-pole, so the wind has weight without a rumble.
  let last = 0;
  for (let i = 0; i < length; i++) {
    last = last * 0.86 + rng.range(-1, 1) * 0.14;
    data[i] = last * 3.2;
  }
  // Cross-fade the seam so the loop has no click.
  const fade = Math.floor(ctx.sampleRate * 0.25);
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    data[i] = data[i] * t + data[length - fade + i] * (1 - t);
  }
  return buffer.length > fade ? trimmed(ctx, buffer, length - fade) : buffer;
}

function trimmed(ctx: BaseAudioContext, src: AudioBuffer, length: number): AudioBuffer {
  const out = ctx.createBuffer(1, length, ctx.sampleRate);
  out.getChannelData(0).set(src.getChannelData(0).subarray(0, length));
  return out;
}

export function createAmbience(ctx: BaseAudioContext, out: AudioNode): Ambience {
  const rng = makeRng(0xa3b1e7);
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(LEVEL, ctx.currentTime);
  bus.connect(out);
  const noise = noiseBuffer(ctx, 7, 0x77d1);
  const white = noiseBuffer(ctx, 3, 0x3c2f);

  const bed = (type: BiquadFilterType, hz: number, q: number): { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(hz, ctx.currentTime);
    filter.Q.setValueAtTime(q, ctx.currentTime);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    src.connect(filter).connect(gain).connect(bus);
    src.start(ctx.currentTime, rng.range(0, 6));
    return { src, filter, gain };
  };
  const wind = bed('bandpass', 420, 0.7);
  const whistle = bed('bandpass', 900, 9);
  const simmer = bed('lowpass', 520, 0.5);

  const next: Record<keyof typeof RATE, number> = { bubble: 0, crackle: 0, ice: 0, bough: 0, bird: 0, owl: 0 };
  let started = false;
  let disposed = false;

  /** Seconds until the next event for a Poisson-ish rate, never zero. */
  const gap = (rate: number): number => -Math.log(1 - rng.range(0, 0.98)) / Math.max(rate, 1e-3);

  function tone(at: number, hz: number, toHz: number, dur: number, peak: number, type: OscillatorType = 'sine'): void {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(hz, at);
    osc.frequency.exponentialRampToValueAtTime(toHz, at + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.03, dur * 0.25));
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(env).connect(bus);
    osc.start(at);
    osc.stop(at + dur + 0.05);
    releaseWhenDone([osc], [env]);
  }

  function burst(at: number, dur: number, peak: number, type: BiquadFilterType, hz: number, toHz = hz): void {
    const src = ctx.createBufferSource();
    src.buffer = white;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(hz, at);
    if (toHz !== hz) filter.frequency.exponentialRampToValueAtTime(toHz, at + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.08, dur * 0.3));
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filter).connect(env).connect(bus);
    src.start(at, rng.range(0, 2));
    src.stop(at + dur + 0.05);
    releaseWhenDone([src], [filter, env]);
  }

  const events: Record<keyof typeof RATE, (at: number, level: number) => void> = {
    // A bubble rises in pitch as it breaks.
    bubble: (at, l) => tone(at, rng.range(260, 520), rng.range(700, 1300), rng.range(0.04, 0.09), 0.5 * l),
    crackle: (at, l) => {
      burst(at, rng.range(0.004, 0.012), rng.range(0.6, 1.4) * l, 'highpass', rng.range(1800, 4000));
      if (rng.range(0, 1) < 0.12) burst(at + 0.01, 0.05, 0.9 * l, 'bandpass', 900);
    },
    // Lake ice: a falling, dispersive "pew", sometimes with a low knock under it.
    ice: (at, l) => {
      const hz = rng.range(1600, 2600);
      tone(at, hz, hz * 0.09, rng.range(0.45, 0.8), 0.35 * l);
      tone(at + 0.02, hz * 0.62, hz * 0.06, rng.range(0.5, 0.9), 0.2 * l);
      if (rng.range(0, 1) < 0.5) burst(at, 0.25, 1.2 * l, 'lowpass', 180);
    },
    // Snow sliding off a bough: a soft, dull rush.
    bough: (at, l) => burst(at, rng.range(0.5, 0.9), 1.6 * l, 'lowpass', 900, 260),
    // A chickadee's "fee-bee": two clean whistles, the second lower.
    bird: (at, l) => {
      const hz = rng.range(3200, 3700);
      tone(at, hz, hz * 0.98, 0.32, 0.22 * l);
      tone(at + 0.38, hz * 0.84, hz * 0.83, 0.3, 0.2 * l);
      if (rng.range(0, 1) < 0.4) {
        tone(at + 0.9, hz, hz * 0.98, 0.3, 0.16 * l);
        tone(at + 1.26, hz * 0.84, hz * 0.83, 0.28, 0.14 * l);
      }
    },
    // A tawny owl, far off: two soft hoots.
    owl: (at, l) => {
      tone(at, 410, 380, 0.45, 0.32 * l);
      tone(at + 0.75, 400, 360, 0.7, 0.26 * l);
    },
  };
  const LAYER_OF: Record<keyof typeof RATE, Layer> = {
    bubble: 'simmer', crackle: 'crackle', ice: 'ice', bough: 'boughs', bird: 'birds', owl: 'owls',
  };

  return {
    update(mix): void {
      if (disposed) return;
      const now = ctx.currentTime;
      if (!started) {
        started = true;
        for (const k of Object.keys(next) as (keyof typeof RATE)[]) next[k] = now + gap(RATE[k]);
      }
      // The wind breathes: three slow sines at unrelated rates, so it never settles into a loop.
      const b = 0.5 + 0.22 * Math.sin(now * 0.31) + 0.17 * Math.sin(now * 0.73 + 1.3) + 0.11 * Math.sin(now * 1.37 + 4.1);
      wind.gain.gain.setTargetAtTime(WIND * mix.wind * (0.55 + 0.6 * b), now, BED_TAU * 0.5);
      wind.filter.frequency.setTargetAtTime(300 + 380 * b + 260 * mix.whistle, now, 0.6);
      whistle.gain.gain.setTargetAtTime(WHISTLE * mix.whistle * b * b, now, BED_TAU * 0.5);
      whistle.filter.frequency.setTargetAtTime(760 + 520 * b, now, 0.5);
      simmer.gain.gain.setTargetAtTime(SIMMER * mix.simmer, now, BED_TAU);

      for (const k of Object.keys(next) as (keyof typeof RATE)[]) {
        const level = mix[LAYER_OF[k]];
        let guard = 0;
        while (next[k] < now + AHEAD && guard++ < 16) {
          if (level > 0.02 && next[k] >= now - 0.05) events[k](Math.max(next[k], now), level);
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
