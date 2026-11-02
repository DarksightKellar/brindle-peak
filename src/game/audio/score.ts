/**
 * The adaptive score: four layers, one pentatonic world, 70 bpm.
 *
 * `layerGainsFor`, `noteFrequencies` and `stepSequence` are pure decisions, unit-tested under
 * `environment: 'node'`. The voice builders are deliberately dumb: they render those decisions.
 *
 *   pad always · pluck above 20 u · strings above 45 u (swells gliding) · bell above 70 u
 *
 * Weather thins the sparkle (a gust pulls pluck and bell down hard) while pad and strings hold,
 * so a gale reads as less music rather than different music.
 */
import { clamp, smoothstep } from '../../core/contracts';
import type { AudioRuntime } from './context';

export type Weather = 'calm' | 'snow' | 'gust';
export type ScoreMode = 'ground' | 'air' | 'glide' | 'climb' | 'sled';

export const TEMPO_BPM = 70;
/** Steps per beat. 2 = eighth notes, i.e. one step every 0.43 s at 70 bpm. */
export const SUBDIVISION = 2;

export interface LayerGains { pad: number; pluck: number; strings: number; bell: number }

/** Per-layer bus trim, applied after the musical gain. Keeps the mix balanced at every altitude. */
const TRIM: LayerGains = { pad: 0.3, pluck: 0.26, strings: 0.2, bell: 0.16 };

const WEATHER_MIX: Record<Weather, LayerGains> = {
  calm: { pad: 1, pluck: 1, strings: 1, bell: 1 },
  snow: { pad: 0.94, pluck: 0.55, strings: 1, bell: 0.7 },
  gust: { pad: 0.88, pluck: 0.28, strings: 1.12, bell: 0.32 },
};

/** Mode is a performance instruction, not a band change: it bends the layer targets slightly. */
const MODE_MIX: Record<ScoreMode, LayerGains> = {
  ground: { pad: 1, pluck: 1, strings: 1, bell: 1 },
  air: { pad: 1.04, pluck: 0.85, strings: 1.15, bell: 1.05 },
  glide: { pad: 1.06, pluck: 0.9, strings: 1.5, bell: 1.15 },
  climb: { pad: 1, pluck: 0.62, strings: 0.9, bell: 0.9 },
  sled: { pad: 0.98, pluck: 1.2, strings: 1, bell: 1.1 },
};

/** Altitude (0 at the valley floor, ~100 at the summit) to layer target gains. */
export function layerGainsFor(altitude: number, weather: Weather): LayerGains {
  const a = Number.isFinite(altitude) ? clamp(altitude, 0, 120) : 0;
  const mix = WEATHER_MIX[weather] ?? WEATHER_MIX.calm;
  return {
    pad: clamp((0.42 + 0.16 * smoothstep(55, 100, a)) * mix.pad, 0, 1),
    pluck: clamp(0.66 * smoothstep(20, 36, a) * mix.pluck, 0, 1),
    strings: clamp(0.6 * smoothstep(45, 62, a) * mix.strings, 0, 1),
    bell: clamp(0.5 * smoothstep(70, 86, a) * mix.bell, 0, 1),
  };
}

/**
 * The same pitches shifted by whole octaves. `octave` 1 is one octave up (double), -1 one down
 * (half). The shift is clamped to +/-4 so a bad caller cannot produce a 0 Hz oscillator.
 */
export function noteFrequencies(scaleHz: readonly number[], octave: number): number[] {
  const raw = Number.isFinite(octave) ? octave : 0;
  const mul = Math.pow(2, clamp(Math.round(raw), -4, 4));
  return scaleHz.map((hz) => hz * mul);
}

/** Seconds between steps. `subdivision` is steps per beat (2 = eighths). */
export function stepSequence(tempoBpm: number, subdivision: number): { intervalSec: number } {
  const bpm = Number.isFinite(tempoBpm) ? clamp(tempoBpm, 20, 300) : TEMPO_BPM;
  const sub = Number.isFinite(subdivision) ? clamp(Math.round(subdivision), 1, 8) : 1;
  return { intervalSec: 60 / bpm / sub };
}

const midiHz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/** D major pentatonic — D E F# A B. Bright enough for snow, no leading tone pulling at the ear. */
export const PENTATONIC_HZ: readonly number[] = [62, 64, 66, 69, 71].map(midiHz);

interface ChordDef { pad: readonly number[]; arp: readonly number[] }

/** D - Bm - G - A, back to D. Four bars, and the loop closes on the tonic rather than drifting. */
const CHORDS: readonly ChordDef[] = [
  { pad: [50, 57, 62, 66], arp: [62, 66, 69, 74] },
  { pad: [47, 54, 62, 66], arp: [59, 62, 66, 71] },
  { pad: [43, 50, 59, 62], arp: [55, 59, 62, 67] },
  { pad: [45, 52, 61, 64], arp: [57, 61, 64, 69] },
];

const STEPS_PER_BAR = 8;
const TOTAL_STEPS = STEPS_PER_BAR * CHORDS.length; // 32 steps: four bars of eighths
const LOOKAHEAD = 0.25;
/** Time constant for every gain move: 0.4 s, long enough to be inaudible. */
const RAMP_TAU = 0.4;
type BusKey = keyof LayerGains;
interface SustainSpec { type: OscillatorType; filterHz: number; toHz: number; q: number; peak: number; detune: number }
/** Pad/strings: detuned stack, slow sweep, and a hold-then-release envelope so the next chord
 * attacks into a still-sounding tail. Releasing at the bar line instead leaves an audible hole. */
function sustain(ctx: AudioContext, bus: GainNode, notes: readonly number[], at: number, hold: number, spec: SustainSpec): void {
  const rel = hold * 0.35;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(spec.filterHz, at);
  filter.frequency.linearRampToValueAtTime(spec.toHz, at + hold * 0.55);
  filter.Q.setValueAtTime(spec.q, at);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  // Linear attack: an exponential rise from 1e-4 sags the bed between chords. Release stays exp.
  env.gain.linearRampToValueAtTime(spec.peak, at + hold * 0.45);
  env.gain.setValueAtTime(spec.peak, at + hold);
  env.gain.exponentialRampToValueAtTime(0.0001, at + hold + rel);
  filter.connect(env);
  env.connect(bus);

  for (let i = 0; i < notes.length; i++) {
    const osc = ctx.createOscillator();
    osc.type = spec.type;
    osc.frequency.setValueAtTime(midiHz(notes[i]), at);
    osc.detune.setValueAtTime(i % 2 === 0 ? -spec.detune : spec.detune, at);
    osc.connect(filter);
    osc.start(at);
    osc.stop(at + hold + rel + 0.05);
  }
}

/** `sweep`: the pluck's body closes as the string decays; the bell's filter stays open. */
interface StrikeSpec { type: OscillatorType; dur: number; peak: number; partials: readonly [number, number][]; sweep: boolean }
/** One struck note — pluck and bell are the same gesture with different partials. */
function strike(ctx: AudioContext, bus: GainNode, note: number, at: number, spec: StrikeSpec): void {
  const hz = midiHz(note);
  const body = ctx.createBiquadFilter();
  body.type = 'lowpass';
  body.frequency.setValueAtTime(spec.sweep ? 2800 : 7000, at);
  if (spec.sweep) body.frequency.exponentialRampToValueAtTime(900, at + 0.3);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(spec.peak, at + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, at + spec.dur);
  body.connect(env);
  env.connect(bus);

  for (const [mult, amp] of spec.partials) {
    const osc = ctx.createOscillator();
    osc.type = spec.type;
    osc.frequency.setValueAtTime(hz * mult, at);
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp, at);
    osc.connect(g);
    g.connect(body);
    osc.start(at);
    osc.stop(at + spec.dur + 0.05);
  }
}

/** A struck bell is inharmonic: 2.76 and 5.4 are the classic partial ratios, not a chord. */
const BELL_PARTIALS: readonly [number, number][] = [[1, 1], [2.76, 0.34], [5.4, 0.12]];
const PLUCK_PARTIALS: readonly [number, number][] = [[1, 1]]; // one fundamental, no harmonics
export interface Score { setAltitude(y: number): void; setWeather(w: Weather): void; setMode(m: ScoreMode): void; update(): void; dispose(): void }
export function createScore(rt: AudioRuntime): Score {
  const { ctx } = rt;
  const buses: Record<BusKey, GainNode> = {
    pad: ctx.createGain(), pluck: ctx.createGain(), strings: ctx.createGain(), bell: ctx.createGain(),
  };
  for (const key of Object.keys(buses) as BusKey[]) {
    buses[key].gain.setValueAtTime(0.0001, ctx.currentTime);
    buses[key].connect(rt.music);
  }

  const { intervalSec } = stepSequence(TEMPO_BPM, SUBDIVISION);
  const barSec = intervalSec * STEPS_PER_BAR;
  const applied: LayerGains = { pad: -1, pluck: -1, strings: -1, bell: -1 };
  let altitude = 0;
  let weather: Weather = 'calm';
  let mode: ScoreMode = 'ground';
  let step = 0;
  let nextTime = 0;
  let disposed = false;

  function targets(): LayerGains {
    const base = layerGainsFor(altitude, weather);
    const m = MODE_MIX[mode];
    const mix = (low: number, modeMul: number): number => clamp(low * modeMul, 0, 1);
    return { pad: mix(base.pad, m.pad), pluck: mix(base.pluck, m.pluck), strings: mix(base.strings, m.strings), bell: mix(base.bell, m.bell) };
  }

  function applyGains(): void {
    const target = targets();
    const now = ctx.currentTime;
    for (const key of Object.keys(buses) as BusKey[]) {
      const value = target[key] * TRIM[key];
      if (Math.abs(value - applied[key]) < 0.002) continue;
      // setTargetAtTime, never `.value =`: the parameter glides from wherever it is, so a move
      // from 0.02 to 0.4 is a 0.4 s swell instead of a step discontinuity (a click).
      buses[key].gain.setTargetAtTime(value, now, RAMP_TAU);
      applied[key] = value;
    }
  }

  function scheduleStep(index: number, at: number): void {
    const bar = Math.floor(index / STEPS_PER_BAR);
    const pos = index % STEPS_PER_BAR;
    const chord = CHORDS[bar];

    if (pos === 0) {
      sustain(ctx, buses.pad, chord.pad, at, barSec, { type: 'triangle', filterHz: 680, toHz: 1050, q: 0.6, peak: 0.055, detune: 5 });
      sustain(ctx, buses.strings, chord.pad.slice(0, 3), at, barSec, { type: 'sawtooth', filterHz: 900, toHz: 1500, q: 0.9, peak: 0.045, detune: 7 });
    }

    const note = chord.arp[pos % chord.arp.length];
    strike(ctx, buses.pluck, note, at, { type: 'triangle', dur: 0.5, peak: pos % 2 === 0 ? 0.22 : 0.15, partials: PLUCK_PARTIALS, sweep: true });
    if ((pos === 2 || pos === 6) && targets().bell > 0.02) {
      strike(ctx, buses.bell, note + 12, at, { type: 'sine', dur: 1.9, peak: 0.16, partials: BELL_PARTIALS, sweep: false });
    }
  }

  function update(): void {
    if (disposed) return;
    const now = ctx.currentTime;
    if (nextTime === 0) nextTime = now + 0.12;
    // After a stall, restart on the downbeat: replaying missed bars is worse than a re-entry.
    if (nextTime < now - 0.5) { nextTime = now + 0.05; step = 0; }
    let guard = 0;
    while (nextTime < now + LOOKAHEAD && guard++ < 32) {
      scheduleStep(step, nextTime);
      nextTime += intervalSec;
      step = (step + 1) % TOTAL_STEPS;
    }
  }

  applyGains(); // the opening chord must sound before the player's altitude moves at all
  return {
    setAltitude(y: number): void {
      if (!Number.isFinite(y)) return;
      const next = clamp(y, 0, 120);
      if (Math.abs(next - altitude) < 0.05) return;
      altitude = next;
      applyGains();
    },
    setWeather(w: Weather): void {
      if (w === weather) return;
      weather = w;
      applyGains();
    },
    setMode(m: ScoreMode): void {
      if (m === mode) return;
      mode = m;
      applyGains();
    },
    update,
    dispose(): void {
      disposed = true;
      for (const key of Object.keys(buses) as BusKey[]) {
        try {
          buses[key].disconnect();
        } catch {
          /* already gone */
        }
      }
    },
  };
}
