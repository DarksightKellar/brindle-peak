import { describe, expect, it } from 'vitest';
import { ambienceFor } from '../src/game/audio/ambience';
import { createTrackChooser, HOLD_SECONDS, trackFor } from '../src/game/audio/music';
import { voiceCapAllows } from '../src/game/audio/sfx';
import { createAudio } from '../src/game/audio/audio';

/**
 * Everything here is pure. No AudioContext exists under `environment: 'node'`, so these tests cover
 * only the decisions: which track plays where, that a change of place has to hold before the music
 * follows, and that every ambience level is one WebAudio will take. How it sounds is judged by ear.
 */
describe('which track plays', () => {
  it('is the valley by day, the heights up high, and dusk once blue hour falls', () => {
    expect(trackFor({ zone: 'hearth', altitude: 5, dusk: 0 })).toBe('valley');
    expect(trackFor({ zone: 'pinewind', altitude: 20, dusk: 0 })).toBe('valley');
    expect(trackFor({ zone: 'ridge', altitude: 40, dusk: 0 })).toBe('heights');
    expect(trackFor({ zone: 'hamlet', altitude: 90, dusk: 0 })).toBe('heights');
    expect(trackFor({ zone: 'ridge', altitude: 90, dusk: 1 })).toBe('dusk');
  });

  it('holds a change of place for a few seconds before following it', () => {
    const c = createTrackChooser();
    expect(c.update(1 / 60, 'valley')).toBe('valley');
    expect(c.update(HOLD_SECONDS / 2, 'heights')).toBe('valley');
    expect(c.update(1 / 60, 'valley')).toBe('valley');
    expect(c.update(HOLD_SECONDS / 2, 'heights')).toBe('valley'); // the hop back reset the hold
    expect(c.update(HOLD_SECONDS / 2 + 0.1, 'heights')).toBe('heights');
  });

  it('follows dusk at once', () => {
    const c = createTrackChooser();
    c.update(1 / 60, 'valley');
    expect(c.update(1 / 60, 'dusk')).toBe('dusk');
  });
});

describe('ambience levels', () => {
  const ZONES = ['hearth', 'pinewind', 'reach', 'kettles', 'hamlet', 'ridge', 'peak', 'nowhere'];
  it('keeps every layer inside [0, 1] everywhere, day and dusk, gust or not', () => {
    for (const z of ZONES) for (const gust of [false, true]) for (const d of [0, 0.5, 1, Number.NaN, 7]) {
      for (const [k, v] of Object.entries(ambienceFor(z, gust, d))) {
        expect(v, `${z} ${gust} ${d} ${k}`).toBeGreaterThanOrEqual(0);
        expect(v, `${z} ${gust} ${d} ${k}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('has wind everywhere, louder up high and in a gust', () => {
    expect(ambienceFor('hearth', false, 0).wind).toBeGreaterThan(0);
    expect(ambienceFor('ridge', false, 0).wind).toBeGreaterThan(ambienceFor('hearth', false, 0).wind);
    expect(ambienceFor('ridge', true, 0).wind).toBeGreaterThan(ambienceFor('ridge', false, 0).wind);
  });

  it('trades the birds for the owl at dusk', () => {
    expect(ambienceFor('pinewind', false, 0).birds).toBe(1);
    expect(ambienceFor('pinewind', false, 0).owls).toBe(0);
    expect(ambienceFor('pinewind', false, 1).birds).toBe(0);
    expect(ambienceFor('pinewind', false, 1).owls).toBe(1);
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
      kit.setPlace('ridge', 0.5);
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
