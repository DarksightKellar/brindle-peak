/**
 * The only module in the project that constructs an AudioContext.
 *
 * Everything below is lazy: importing this file in Node (where the constructor does not exist)
 * is inert. `createAudioRuntime()` is the single failure point and returns `null` instead of
 * throwing, so the game degrades to silence rather than a black screen.
 *
 * Graph, built once per runtime:
 *
 *   music bus ─┐
 *              ├─> master ─> compressor ─> destination
 *   sfx bus  ──┘
 *
 * Every gain starts at 0 (or 1e-4, the lowest value an exponential ramp can leave) and is raised
 * with `setTargetAtTime` by the caller, so the context opening can never produce a click.
 */
import { makeRng } from '../../core/contracts';

type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext;

interface AudioGlobals {
  AudioContext?: AudioContextCtor;
  webkitAudioContext?: AudioContextCtor;
}

function audioCtor(): AudioContextCtor | null {
  const g = globalThis as unknown as AudioGlobals;
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

/** True when the host exposes a WebAudio constructor. Never throws. */
export function isAudioSupported(): boolean {
  try {
    return audioCtor() !== null;
  } catch {
    return false;
  }
}

export interface AudioRuntime {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly compressor: DynamicsCompressorNode;
  readonly music: GainNode;
  readonly sfx: GainNode;
  /** One second of deterministic white noise, offset into by every noise transient. */
  readonly noise: AudioBuffer;
}

function buildNoise(ctx: AudioContext): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const rng = makeRng(0x5eed51);
  for (let i = 0; i < length; i++) data[i] = rng.range(-1, 1);
  return buffer;
}

/** Builds the context and its master chain, or returns null when WebAudio is missing. */
export function createAudioRuntime(): AudioRuntime | null {
  const Ctor = audioCtor();
  if (!Ctor) return null;

  let ctx: AudioContext;
  try {
    ctx = new Ctor({ latencyHint: 'interactive' });
  } catch {
    return null;
  }

  try {
    const master = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();
    const music = ctx.createGain();
    const sfx = ctx.createGain();
    const t = ctx.currentTime;

    // Gentle glue: only the loudest stacked transients are touched.
    compressor.threshold.setValueAtTime(-14, t);
    compressor.knee.setValueAtTime(18, t);
    compressor.ratio.setValueAtTime(3, t);
    compressor.attack.setValueAtTime(0.012, t);
    compressor.release.setValueAtTime(0.25, t);

    master.gain.setValueAtTime(0, t);
    music.gain.setValueAtTime(0.0001, t);
    sfx.gain.setValueAtTime(0.0001, t);

    music.connect(master);
    sfx.connect(master);
    master.connect(compressor);
    compressor.connect(ctx.destination);

    return { ctx, master, compressor, music, sfx, noise: buildNoise(ctx) };
  } catch {
    try {
      void ctx.close();
    } catch {
      /* already gone */
    }
    return null;
  }
}

/** Resumes a context the autoplay policy has left suspended. Idempotent and never throws. */
export function resumeRuntime(rt: AudioRuntime): void {
  try {
    if (rt.ctx.state === 'running') return;
    void rt.ctx.resume().catch(() => undefined);
  } catch {
    /* suspended contexts in odd hosts */
  }
}

/** Tears the graph down and closes the context, which stops every scheduled source. */
export function closeRuntime(rt: AudioRuntime): void {
  for (const node of [rt.music, rt.sfx, rt.master, rt.compressor]) {
    try {
      node.disconnect();
    } catch {
      /* already disconnected */
    }
  }
  try {
    if (rt.ctx.state !== 'closed') void rt.ctx.close().catch(() => undefined);
  } catch {
    /* already closed */
  }
}
