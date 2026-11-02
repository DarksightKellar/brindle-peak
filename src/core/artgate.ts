/**
 * The acceptance gate: turns measurements into pass/fail verdicts.
 *
 * Split from `imagemetrics.ts` deliberately. That module *measures* and knows nothing about what
 * counts as good; this module holds the opinion. Keeping them apart means the instrument can never
 * be quietly bent to make a frame pass — which already happened once in this project (see
 * ART_BIBLE A8).
 */

import type { FrameMetrics } from './imagemetrics';

export interface Threshold {
  name: string;
  pass: boolean;
  actual: number;
  expected: string;
  /** Reported but never fails a frame (main.ts `artgate.measure`). */
  informational?: boolean;
}

/**
 * Per-frame rules.
 *
 * DERIVATION NOTE (important): an earlier version of this gate used the *pooled* statistics of all
 * seven reference screenshots as per-frame thresholds. That was wrong — the real A Short Hike frames
 * failed their own gate, because pooled percentiles ignore how much individual frames vary (p50
 * across the reference ranges 0.386 to 0.790). The bands below are the observed min/max across the
 * seven official screenshots, so **the benchmark passes its own gate**. The gate is a guide for a
 * human looking at frames, not a verdict: nothing in the build depends on it passing.
 *
 * The warm/cool split is deliberately NOT a per-frame rule: one reference frame is 50% warm / 0%
 * cool and another is 7% warm / 65% cool. It is a property of a set of frames — see judgeSet().
 */
export function judge(m: FrameMetrics): Threshold[] {
  const t = (name: string, pass: boolean, actual: number, expected: string): Threshold => ({
    name,
    pass,
    actual,
    expected,
  });
  const info = (name: string, pass: boolean, actual: number, expected: string): Threshold => ({
    name,
    pass,
    actual,
    expected,
    informational: true,
  });
  return [
    t('no pixels below L 0.10', m.below010 === 0, m.below010, '== 0'),
    t('min luminance >= 0.10', m.min >= 0.1, m.min, '>= 0.10'),
    t('luminance p1 in reference band', m.p1 >= 0.16 && m.p1 <= 0.36, m.p1, '0.16 .. 0.36'),
    t('luminance p50 in reference band', m.p50 >= 0.36 && m.p50 <= 0.8, m.p50, '0.36 .. 0.80'),
    t('luminance p95 in reference band', m.p95 >= 0.65 && m.p95 <= 0.96, m.p95, '0.65 .. 0.96'),
    t('saturation p50 >= 0.38', m.satP50 >= 0.38, m.satP50, '>= 0.38'),
    t('blown highlights <= 30%', m.blownShare <= 0.3, m.blownShare, '<= 0.30'),
    t('contrast >= 0.09', m.contrast >= 0.09, m.contrast, '>= 0.09'),
    info('block period is 5', m.blockPeriod === 5, m.blockPeriod, '== 5 at a 5x upscale'),
    info('detail density >= 0.005', m.edgeDensity >= 0.005, m.edgeDensity, '>= 0.005'),
  ];
}

export interface SetVerdict {
  meanCool: number;
  meanWarm: number;
  meanEdge: number;
  hasCoolFrame: boolean;
  hasWarmFrame: boolean;
  pass: boolean;
  notes: string[];
}

/**
 * Set-level palette identity. This is where "is it winter" is actually answered: the game as a
 * whole must be cool-dominant while keeping a real warm minority, and every frame must carry
 * enough chroma to read as painted rather than grey.
 *
 * A snow game is expected to skew cooler than the autumn reference (reference mean cool share is
 * ~21%), so the target band is set for winter, not copied from autumn.
 */
export function judgeSet(frames: readonly FrameMetrics[]): SetVerdict {
  const notes: string[] = [];
  if (frames.length === 0) {
    return { meanCool: 0, meanWarm: 0, meanEdge: 0, hasCoolFrame: false, hasWarmFrame: false, pass: false, notes: ['no frames'] };
  }
  const n = frames.length;
  const meanCool = frames.reduce((a, f) => a + f.coolShare, 0) / n;
  const meanWarm = frames.reduce((a, f) => a + f.warmShare, 0) / n;
  const meanEdge = frames.reduce((a, f) => a + f.edgeDensity, 0) / n;
  const hasCoolFrame = frames.some((f) => f.coolShare > 0.4);
  const hasWarmFrame = frames.some((f) => f.warmShare > 0.4);

  if (meanCool < 0.25) notes.push(`mean cool share ${meanCool.toFixed(2)} < 0.25: not reading as winter`);
  if (meanWarm < 0.15) notes.push(`mean warm share ${meanWarm.toFixed(2)} < 0.15: no cosy light contrast`);
  if (!hasCoolFrame) notes.push('no frame is cool-dominant');
  if (!hasWarmFrame) notes.push('no frame is warm-dominant: set has no tonal variety');
  if (meanEdge < 0.005) notes.push(`mean detail density ${meanEdge.toFixed(4)} < 0.005: world is too empty`);

  return { meanCool, meanWarm, meanEdge, hasCoolFrame, hasWarmFrame, pass: notes.length === 0, notes };
}
