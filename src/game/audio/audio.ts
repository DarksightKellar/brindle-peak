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
import { createAmbience, type Ambience, type Listener, type SoundWorld } from './ambience';
import { createMusic, createTrackChooser, trackFor, type MusicPlayer } from './music';
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
  /** Where the player is (zone id) and how far into blue hour (0..1): picks the track and the ambience. */
  setPlace(zone: string, dusk: number): void;
  /** Where the ears are (Pip) and which way the camera faces, so place sounds pan and fade by distance. */
  setListener(x: number, y: number, z: number, facingX: number, facingZ: number): void;
  /** Where the world's sound sources are (pools, stoves, pines, the lake, the owl). Once, at boot. */
  setSoundWorld(world: SoundWorld): void;
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
  let music: MusicPlayer | null = null;
  let ambience: Ambience | null = null;
  let player: SfxPlayer | null = null;
  let destroyed = false;
  const chooser = createTrackChooser();

  // Pre-unlock state, applied the moment the context exists.
  let altitude = 0;
  let weather: 'calm' | 'snow' | 'gust' = 'calm';
  let zone = 'hearth';
  let dusk = 0;
  const listener: Listener = { x: 0, y: 0, z: 0, fx: 0, fz: -1 };
  let sounds: SoundWorld | null = null;
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
        music = createMusic(rt);
        ambience = createAmbience(rt.ctx, rt.master);
        if (sounds) ambience.setWorld(sounds);
        player = createSfx(rt);
        applyVolume();
      }
      resumeRuntime(rt);
    },

    setAltitude(y: number): void {
      if (!Number.isFinite(y)) return;
      altitude = clamp(y, 0, 120);
    },

    setWeather(w: 'calm' | 'snow' | 'gust'): void {
      weather = w;
    },

    setMode(): void {
      // The recorded score doesn't bend to the player's verb; kept so callers needn't know.
    },

    setListener(x: number, y: number, z: number, facingX: number, facingZ: number): void {
      const len = Math.hypot(facingX, facingZ);
      if (![x, y, z, len].every(Number.isFinite) || len < 1e-6) return;
      listener.x = x;
      listener.y = y;
      listener.z = z;
      listener.fx = facingX / len;
      listener.fz = facingZ / len;
    },

    setSoundWorld(w: SoundWorld): void {
      sounds = w;
      ambience?.setWorld(w);
    },

    setPlace(z: string, d: number): void {
      zone = z;
      dusk = Number.isFinite(d) ? clamp(d, 0, 1) : 0;
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
      const gust = weather === 'gust';
      const track = chooser.update(dt, trackFor({ zone, altitude, dusk }));
      if (rt && rt.ctx.state === 'running') {
        music?.play(track, gust);
        ambience?.update(listener, { altitude, gust, dusk });
      }
    },

    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      music?.dispose();
      ambience?.dispose();
      player?.dispose();
      if (rt) closeRuntime(rt);
      music = null;
      ambience = null;
      player = null;
      rt = null;
    },
  };
}
