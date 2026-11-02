import { describe, expect, it } from 'vitest';
import { layerGainsFor, stepSequence, type LayerGains } from '../src/game/audio/score';
import { voiceCapAllows } from '../src/game/audio/sfx';
import { createAudio } from '../src/game/audio/audio';

const KEYS: readonly (keyof LayerGains)[] = ['pad', 'pluck', 'strings', 'bell'];
const WEATHERS = ['calm', 'snow', 'gust'] as const;

/**
 * Everything here is pure. The oscillator graph cannot be exercised under `environment: 'node'` —
 * there is no AudioContext to build it against — so these tests cover only what would break the
 * game rather than the mix: a gain WebAudio refuses, a scheduler that never advances, an unbounded
 * voice count, and a kit that throws where there is no audio at all. How it sounds is judged by ear.
 */
describe('score inputs WebAudio will accept', () => {
  it('keeps every layer gain inside [0, 1] at every altitude and weather', () => {
    for (const weather of WEATHERS) {
      for (let a = 0; a <= 100; a++) {
        const g = layerGainsFor(a, weather);
        for (const key of KEYS) {
          expect(g[key], `${key} @${a} ${weather}`).toBeGreaterThanOrEqual(0);
          expect(g[key], `${key} @${a} ${weather}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('clamps nonsense altitude instead of returning NaN', () => {
    expect(layerGainsFor(Number.NaN, 'calm')).toEqual(layerGainsFor(0, 'calm'));
    expect(layerGainsFor(-40, 'calm')).toEqual(layerGainsFor(0, 'calm'));
    expect(layerGainsFor(5000, 'calm')).toEqual(layerGainsFor(120, 'calm'));
  });

  it('never schedules a zero or non-finite step interval', () => {
    for (const [bpm, sub] of [
      [70, 2],
      [0, 2],
      [-70, 2],
      [70, 0],
      [Number.NaN, Number.NaN],
    ]) {
      const { intervalSec } = stepSequence(bpm, sub);
      expect(Number.isFinite(intervalSec)).toBe(true);
      expect(intervalSec).toBeGreaterThan(0);
    }
  });
});

describe('voiceCapAllows', () => {
  it('allows below the cap and refuses at or above it', () => {
    expect(voiceCapAllows(0, 24)).toBe(true);
    expect(voiceCapAllows(23, 24)).toBe(true);
    expect(voiceCapAllows(24, 24)).toBe(false);
    expect(voiceCapAllows(25, 24)).toBe(false);
  });

  it('refuses everything when there is no headroom', () => {
    expect(voiceCapAllows(0, 0)).toBe(false);
    expect(voiceCapAllows(Number.NaN, 24)).toBe(false);
  });
});

describe('degradation without WebAudio', () => {
  it('is silent and throw-free before unlock, and when unlock cannot build a context', () => {
    const kit = createAudio();
    expect(() => {
      kit.setAltitude(60);
      kit.setWeather('snow');
      kit.setMode('glide');
      kit.setVolume(0.5, 0.4);
      kit.sfx('bell');
      kit.chirp(3, 520);
      kit.update(1 / 60);
      kit.unlock();
      kit.sfx('achievement');
      kit.chirp(1, 520);
      kit.update(1 / 60);
      kit.destroy();
      kit.destroy();
    }).not.toThrow();
  });
});
