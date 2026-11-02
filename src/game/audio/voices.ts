/** The score's two gestures: a held chord (pad, strings) and a struck note (pluck, bell). */
import { midiHz } from './harmony';
import { releaseWhenDone } from './teardown';

export interface SustainSpec { type: OscillatorType; filterHz: number; toHz: number; q: number; peak: number; detune: number }

/** Pad/strings: detuned stack, slow sweep, and a hold-then-release envelope so the next chord
 * attacks into a still-sounding tail. Releasing at the bar line instead leaves an audible hole. */
export function sustain(ctx: AudioContext, bus: GainNode, notes: readonly number[], at: number, hold: number, spec: SustainSpec): void {
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

  const oscs: OscillatorNode[] = [];
  for (let i = 0; i < notes.length; i++) {
    const osc = ctx.createOscillator();
    osc.type = spec.type;
    osc.frequency.setValueAtTime(midiHz(notes[i]), at);
    osc.detune.setValueAtTime(i % 2 === 0 ? -spec.detune : spec.detune, at);
    osc.connect(filter);
    osc.start(at);
    osc.stop(at + hold + rel + 0.05);
    oscs.push(osc);
  }
  releaseWhenDone(oscs, [filter, env]);
}

/** `sweep`: the pluck's body closes as the string decays; the bell's filter stays open. */
export interface StrikeSpec { type: OscillatorType; dur: number; peak: number; partials: readonly [number, number][]; sweep: boolean }

/** One struck note — pluck and bell are the same gesture with different partials. */
export function strike(ctx: AudioContext, bus: GainNode, note: number, at: number, spec: StrikeSpec): void {
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

  const oscs: OscillatorNode[] = [];
  const gains: GainNode[] = [];
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
    oscs.push(osc);
    gains.push(g);
  }
  releaseWhenDone(oscs, [body, env, ...gains]);
}
