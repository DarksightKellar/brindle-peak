import { describe, expect, it } from 'vitest';
import { panToward, proximity, whistleLevel, windLevel } from '../src/game/audio/ambience';
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

describe('place sounds', () => {
  it('are full when near, gone when far, and never NaN', () => {
    expect(proximity(2, 3, 26)).toBe(1);
    expect(proximity(30, 3, 26)).toBe(0);
    const mid = proximity(14, 3, 26);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(proximity(Number.NaN, 3, 26)).toBe(0);
  });

  it('pan to the side the source is on, from the way the camera faces', () => {
    const facingNorth = { x: 0, y: 0, z: 0, fx: 0, fz: -1 };
    expect(panToward(facingNorth, 10, 0)).toBeGreaterThan(0.5); // east is on the right
    expect(panToward(facingNorth, -10, 0)).toBeLessThan(-0.5);
    expect(Math.abs(panToward(facingNorth, 0, -10))).toBeLessThan(1e-9); // dead ahead
    const facingEast = { x: 0, y: 0, z: 0, fx: 1, fz: 0 };
    expect(panToward(facingEast, 0, 10)).toBeGreaterThan(0.5); // south is on the right
  });

  it('blow harder up high and in a gust, and drop among trees', () => {
    const valley = windLevel(5, 0, false);
    expect(valley).toBeGreaterThan(0);
    expect(windLevel(90, 0, false)).toBeGreaterThan(valley);
    expect(windLevel(60, 0, true)).toBeGreaterThan(windLevel(60, 0, false));
    expect(windLevel(20, 1, false)).toBeLessThan(windLevel(20, 0, false));
    expect(whistleLevel(5, 0, false)).toBe(0);
    for (const a of [-10, 0, 50, 200, Number.NaN]) for (const sh of [0, 1, 5, Number.NaN]) for (const g of [false, true]) {
      for (const v of [windLevel(a, sh, g), whistleLevel(a, sh, g)]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
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
