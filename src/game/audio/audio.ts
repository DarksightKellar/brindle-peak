/**
 * Public audio surface for the game layer.
 *
 * Contract, in one sentence: until `unlock()` is called this object holds numbers and does
 * nothing else — no context, no nodes, no sound, and no exceptions if the browser has no WebAudio
 * at all (Node, a locked-down embed, an old Safari).
 *
 * The state setters are all *last-write-wins and replayable*: calling `setAltitude` before unlock
 * is remembered and applied the moment the context exists, so the caller never has to sequence
 * its calls around the first click.
 */
import { clamp } from '../../core/contracts';
import { closeRuntime, createAudioRuntime, isAudioSupported, resumeRuntime, type AudioRuntime } from './context';
import { createScore, type Score, type ScoreMode, type Weather } from './score';
import { createSfx, type SfxPlayer } from './sfx';

export type SfxName =
  | 'bell'
  | 'feather'
  | 'quest'
  | 'achievement'
  | 'flap'
  | 'step-snow'
  | 'step-ice'
  | 'step-rock'
  | 'glide'
  | 'splash'
  | 'slam'
  | 'ui';

export interface AudioKit {
  unlock(): void;
  setAltitude(y: number): void;
  setWeather(w: 'calm' | 'snow' | 'gust'): void;
  setMode(m: 'ground' | 'air' | 'glide' | 'climb' | 'sled'): void;
  sfx(name: SfxName): void;
  chirp(syllables: number, pitch: number): void;
  setVolume(master: number, music: number): void;
  update(dt: number): void;
  destroy(): void;
}

/** False when the host has no AudioContext (Node/Vitest). Never throws. */
export function isAudioAvailable(): boolean {
  return isAudioSupported();
}

/**
 * Make-up gain on the master bus. The score and effects are written quietly so they never clip
 * against each other; this brings the whole mix up to a normal listening level.
 */
const MASTER_MAKEUP = 7.1;

export function createAudio(): AudioKit {
  let rt: AudioRuntime | null = null;
  let score: Score | null = null;
  let player: SfxPlayer | null = null;
  let destroyed = false;

  // Pre-unlock state, mirrored into the score on creation.
  let altitude = 0;
  let weather: Weather = 'calm';
  let mode: ScoreMode = 'ground';
  let masterVol = 0.9;
  let musicVol = 0.7;

  function applyVolume(): void {
    if (!rt) return;
    const at = rt.ctx.currentTime;
    // Short but non-zero time constants: the context opening and every later slider move glide.
    rt.master.gain.setTargetAtTime(masterVol * MASTER_MAKEUP, at, 0.08);
    rt.music.gain.setTargetAtTime(musicVol, at, 0.08);
    rt.sfx.gain.setTargetAtTime(1, at, 0.08);
  }

  return {
    unlock(): void {
      if (destroyed) return;
      if (!rt) {
        rt = createAudioRuntime();
        if (!rt) return;
        score = createScore(rt);
        player = createSfx(rt);
        score.setAltitude(altitude);
        score.setWeather(weather);
        score.setMode(mode);
        applyVolume();
        score.update();
      }
      resumeRuntime(rt);
    },

    setAltitude(y: number): void {
      if (!Number.isFinite(y)) return;
      altitude = clamp(y, 0, 120);
      score?.setAltitude(altitude);
    },

    setWeather(w: 'calm' | 'snow' | 'gust'): void {
      weather = w;
      score?.setWeather(w);
    },

    setMode(m: 'ground' | 'air' | 'glide' | 'climb' | 'sled'): void {
      mode = m;
      score?.setMode(m);
    },

    sfx(name: SfxName): void {
      player?.play(name);
    },

    chirp(syllables: number, pitch: number): void {
      player?.chirp(syllables, pitch);
    },

    setVolume(master: number, music: number): void {
      masterVol = clamp(Number.isFinite(master) ? master : masterVol, 0, 1);
      musicVol = clamp(Number.isFinite(music) ? music : musicVol, 0, 1);
      applyVolume();
    },

    update(dt: number): void {
      if (destroyed || dt <= 0) return;
      score?.update();
    },

    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      score?.dispose();
      player?.dispose();
      if (rt) closeRuntime(rt);
      score = null;
      player = null;
      rt = null;
    },
  };
}
