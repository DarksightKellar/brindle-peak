import { describe, expect, it } from 'vitest';
import { DEFAULT_PIXEL_SIZE, INTERNAL_H, INTERNAL_W, backingSize, renderSize } from '../src/game/render/pixelConfig';
import { createSnowfall } from '../src/game/render/weather';

/** ART_BIBLE A4 — integer blocks off the CSS size, devicePixelRatio never involved. */
describe('backing store scale', () => {
  const cases: [number, number, number][] = [
    [1920, 1080, 5],
    [1440, 1080, 3],
    [800, 600, 2],
    [384, 216, 1],
  ];

  it('uses whole multiples of the internal size and clamps to one block', () => {
    for (const [w, h, scale] of cases) {
      const b = backingSize(w, h);
      expect(b.scale).toBe(scale);
      expect(b.width).toBe(INTERNAL_W * Math.max(1, Math.floor(w / INTERNAL_W)));
      expect(b.height).toBe(INTERNAL_H * scale);
    }
    // Narrower than one tile: still a legal internal-size block, never a fractional upscale.
    expect(backingSize(320, 200)).toEqual({ width: INTERNAL_W, height: INTERNAL_H, scale: 1 });
  });

  it('divides the backing store evenly into whole-pixel blocks', () => {
    for (const [w, h] of cases) {
      const b = backingSize(w, h);
      expect(b.width % b.scale).toBe(0);
      expect(b.height % b.scale).toBe(0);
      expect(b.width / b.scale).toBe(INTERNAL_W);
      expect(b.height / b.scale).toBe(INTERNAL_H);
    }
  });

  it('is driven by the CSS box, not by devicePixelRatio', () => {
    // A 1280x720 CSS canvas on a 2x display still renders 3-px blocks, not 6-px ones.
    const b = backingSize(1280, 720);
    expect(b.scale).toBe(3);
    expect(b.width).not.toBe(1280 * 2);
  });
});

describe('pixel size setting', () => {
  it('holds the internal size at the default and keeps 16:9 at every setting', () => {
    expect(renderSize(DEFAULT_PIXEL_SIZE)).toEqual({ width: INTERNAL_W, height: INTERNAL_H });
    for (const n of [3, 5, 8]) {
      const r = renderSize(n);
      expect(r.width / r.height).toBeCloseTo(16 / 9, 1);
    }
  });
});

describe('snowfall veil', () => {
  it('is deterministic in weather time, so a pose reproduces a frame', () => {
    const a = createSnowfall().seek(4, 0.9);
    const b = createSnowfall().seek(4, 0.9);
    expect(a).toEqual(b);
    expect(a.amount).toBeGreaterThan(0);
  });

  it('reports no weather at all when switched off', () => {
    const snow = createSnowfall();
    snow.setEnabled(false);
    const veil = snow.update(1 / 60, 1);
    expect(veil.amount).toBe(0);
  });

  it('advances the fall only while enabled', () => {
    const snow = createSnowfall();
    const before = snow.update(1 / 60, 1).fall;
    snow.setEnabled(false);
    expect(snow.update(1, 1).fall).toBeCloseTo(before, 6);
  });

  it('starts at the place it loads in, then eases between places', () => {
    const snow = createSnowfall();
    expect(snow.update(1 / 60, 0.6, 2).amount).toBe(2);
    const next = snow.update(1 / 20, 0.6, 1).amount;
    expect(next).toBeLessThan(2);
    expect(next).toBeGreaterThan(1.9);
  });

  it('speeds the drift up in a gust instead of jumping it', () => {
    const snow = createSnowfall();
    const calm = snow.update(1 / 20, 0.6).drift;
    const gust = snow.update(1 / 20, 2.4).drift;
    expect(gust - calm).toBeGreaterThan(calm);
    expect(gust - calm).toBeLessThan(1);
  });
});
