/**
 * One-shot synthesised SFX and the NPC "animalese" chirp.
 *
 * Pure half (`stepSoundFor`, `voiceCapAllows`) is unit-tested in Node; the voice half is not, and
 * cannot be — it is oscillators and filters, which do not exist under Vitest.
 *
 * Footsteps are the interesting case. Snow is broadband and dull (bandpass noise, ~1.4 kHz);
 * ice is bright and pitched (highpassed noise plus a 2 kHz ping that rings); rock is a single
 * 25 ms click with almost no body. Same event, three different physical stories.
 */
import { clamp, makeRng } from '../../core/contracts';
import type { SfxName } from './audio';
import type { AudioRuntime } from './context';

export type FootSurface = 'snow' | 'ice' | 'rock' | 'wood' | 'spring' | 'deep-snow';

/** Simultaneous one-shots. Twenty rapid bells would otherwise be sixty oscillators. */
export const VOICE_CAP = 24;

/** True while another voice may be added. At or above the cap, the newest event is dropped. */
export function voiceCapAllows(active: number, cap: number): boolean {
  if (!Number.isFinite(active) || !Number.isFinite(cap)) return false;
  return cap > 0 && active < cap;
}

/**
 * Footstep mapping. Wood is a hard, dry surface, so it borrows the rock click rather than
 * pretending to be snow; a hot spring is a splash. The frozen lake is ice, never snow — the
 * difference is the whole point of the zone.
 */
export function stepSoundFor(surface: FootSurface): SfxName {
  switch (surface) {
    case 'ice':
      return 'step-ice';
    case 'rock':
    case 'wood':
      return 'step-rock';
    case 'spring':
      return 'splash';
    case 'deep-snow':
    case 'snow':
      return 'step-snow';
  }
}

interface ToneSpec {
  type: OscillatorType;
  hz: number;
  toHz?: number;
  dur: number;
  peak: number;
}

interface BurstSpec {
  dur: number;
  peak: number;
  filter: BiquadFilterType;
  hz: number;
  toHz?: number;
  q?: number;
}

function tone(ctx: AudioContext, dest: AudioNode, at: number, spec: ToneSpec): void {
  const osc = ctx.createOscillator();
  osc.type = spec.type;
  osc.frequency.setValueAtTime(spec.hz, at);
  if (spec.toHz !== undefined) osc.frequency.exponentialRampToValueAtTime(spec.toHz, at + spec.dur);

  const env = ctx.createGain();
  const attack = Math.min(0.008, spec.dur * 0.25);
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(spec.peak, at + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, at + spec.dur);

  osc.connect(env);
  env.connect(dest);
  osc.start(at);
  osc.stop(at + spec.dur + 0.02);
}

function burst(ctx: AudioContext, dest: AudioNode, noise: AudioBuffer, at: number, offset: number, spec: BurstSpec): void {
  const src = ctx.createBufferSource();
  src.buffer = noise;

  const filter = ctx.createBiquadFilter();
  filter.type = spec.filter;
  filter.frequency.setValueAtTime(spec.hz, at);
  if (spec.toHz !== undefined) filter.frequency.exponentialRampToValueAtTime(spec.toHz, at + spec.dur);
  if (spec.q !== undefined) filter.Q.setValueAtTime(spec.q, at);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(spec.peak, at + Math.min(0.005, spec.dur * 0.3));
  env.gain.exponentialRampToValueAtTime(0.0001, at + spec.dur);

  src.connect(filter);
  filter.connect(env);
  env.connect(dest);
  src.start(at, offset, spec.dur + 0.02);
  src.stop(at + spec.dur + 0.02);
}

/** Longest tail per voice, used to hold a slot in the cap for exactly as long as it sounds. */
const TAILS: Record<SfxName, number> = {
  bell: 1.0,
  feather: 0.32,
  quest: 0.55,
  achievement: 0.78,
  flap: 0.24,
  'step-snow': 0.1,
  'step-ice': 0.2,
  'step-rock': 0.05,
  glide: 0.62,
  splash: 0.4,
  slam: 0.3,
  ui: 0.08,
};

export interface SfxPlayer {
  play(name: SfxName): void;
  chirp(syllables: number, pitch: number): void;
  dispose(): void;
}

export function createSfx(rt: AudioRuntime): SfxPlayer {
  const { ctx } = rt;
  let active = 0;
  let seq = 0;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const lastFired: Partial<Record<SfxName, number>> = {};

  function claim(seconds: number): boolean {
    if (!voiceCapAllows(active, VOICE_CAP)) return false;
    active++;
    const timer = setTimeout(() => {
      timers.delete(timer);
      active = Math.max(0, active - 1);
    }, seconds * 1000 + 60);
    timers.add(timer);
    return true;
  }

  /**
   * The cap bounds the node count; this bounds the amplitude. A burst of bells is scheduled in
   * one JS task, so they all start at the same instant — a bus ramp cannot duck them in time and
   * the stack would clip. Scaling each voice at schedule time can.
   */
  function loadScale(): number {
    return 1 / (1 + Math.max(0, active - 4) * 0.22);
  }

  function render(name: SfxName, at: number, rng: ReturnType<typeof makeRng>, dest: AudioNode, scale: number): void {
    const p = (peak: number): number => peak * scale;
    switch (name) {
      case 'bell':
        tone(ctx, dest, at, { type: 'sine', hz: 1568, dur: 0.9, peak: p(0.12) });
        tone(ctx, dest, at, { type: 'sine', hz: 2349, dur: 0.7, peak: p(0.05) });
        break;
      case 'feather':
        tone(ctx, dest, at, { type: 'sine', hz: 880, toHz: 1320, dur: 0.28, peak: p(0.07) });
        break;
      case 'quest':
        tone(ctx, dest, at, { type: 'triangle', hz: 659.25, dur: 0.3, peak: p(0.07) });
        tone(ctx, dest, at + 0.1, { type: 'triangle', hz: 987.77, dur: 0.4, peak: p(0.06) });
        break;
      case 'achievement':
        tone(ctx, dest, at, { type: 'triangle', hz: 523.25, dur: 0.5, peak: p(0.06) });
        tone(ctx, dest, at + 0.11, { type: 'triangle', hz: 659.25, dur: 0.5, peak: p(0.06) });
        tone(ctx, dest, at + 0.22, { type: 'triangle', hz: 783.99, dur: 0.55, peak: p(0.055) });
        break;
      case 'flap':
        burst(ctx, dest, rt.noise, at, rng.range(0, 0.4), { dur: 0.22, peak: p(0.1), filter: 'lowpass', hz: 1200, toHz: 320, q: 0.7 });
        break;
      case 'step-snow':
        burst(ctx, dest, rt.noise, at, rng.range(0, 0.6), {
          dur: 0.085,
          peak: p(0.09),
          filter: 'bandpass',
          hz: rng.range(1300, 1750),
          q: 0.8,
        });
        break;
      case 'step-ice':
        burst(ctx, dest, rt.noise, at, rng.range(0, 0.6), { dur: 0.12, peak: p(0.05), filter: 'highpass', hz: 2600, q: 0.6 });
        tone(ctx, dest, at, { type: 'sine', hz: rng.range(2000, 2250), dur: 0.18, peak: p(0.05) });
        break;
      case 'step-rock':
        burst(ctx, dest, rt.noise, at, rng.range(0, 0.6), { dur: 0.025, peak: p(0.11), filter: 'highpass', hz: 1800 });
        tone(ctx, dest, at, { type: 'square', hz: 1200, dur: 0.02, peak: p(0.03) });
        break;
      case 'glide':
        burst(ctx, dest, rt.noise, at, 0.1, { dur: 0.6, peak: p(0.07), filter: 'bandpass', hz: 420, toHz: 1250, q: 1.4 });
        break;
      case 'splash':
        burst(ctx, dest, rt.noise, at, 0.2, { dur: 0.35, peak: p(0.09), filter: 'lowpass', hz: 1400, toHz: 320, q: 0.8 });
        tone(ctx, dest, at, { type: 'sine', hz: 320, toHz: 170, dur: 0.25, peak: p(0.06) });
        break;
      case 'slam':
        tone(ctx, dest, at, { type: 'sine', hz: 92, toHz: 44, dur: 0.28, peak: p(0.18) });
        burst(ctx, dest, rt.noise, at, 0.3, { dur: 0.2, peak: p(0.08), filter: 'lowpass', hz: 220 });
        break;
      case 'ui':
        tone(ctx, dest, at, { type: 'triangle', hz: 1046.5, dur: 0.06, peak: p(0.05) });
        break;
    }
  }

  return {
    play(name: SfxName): void {
      const tail = TAILS[name];
      if (tail === undefined) return;
      // Retrigger guard: a cluster collected in one frame is one chime, not twenty stacked
      // copies of it. Distinct sounds still overlap freely.
      const now = ctx.currentTime;
      if (now - (lastFired[name] ?? -1) < 0.03) return;
      lastFired[name] = now;
      if (!claim(tail)) return;
      render(name, ctx.currentTime + 0.005, makeRng(0x9e3779b9 ^ (seq++ * 0x85ebca6b)), rt.sfx, loadScale());
    },

    chirp(syllables: number, pitch: number): void {
      const count = clamp(Math.round(Number.isFinite(syllables) ? syllables : 1), 1, 8);
      const base = clamp(Number.isFinite(pitch) ? pitch : 440, 80, 1600);
      // Seeded by the voice's pitch: the same NPC always has the same lilt.
      const rng = makeRng((Math.round(base) * 2654435761) ^ (count * 7919));
      const level = loadScale(); // one utterance, one level: syllables do not fade out mid-word
      let at = ctx.currentTime + 0.01;

      for (let i = 0; i < count; i++) {
        const dur = rng.range(0.04, 0.07);
        if (!claim(dur)) return;
        const hz = base * Math.pow(2, rng.range(-2.5, 2.5) / 12);
        tone(ctx, rt.sfx, at, { type: 'triangle', hz, toHz: hz * rng.range(0.94, 1.06), dur, peak: 0.055 * level });
        at += dur + 0.012;
      }
    },

    dispose(): void {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      active = 0;
    },
  };
}
