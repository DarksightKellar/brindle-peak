/**
 * The dialogue's reveal and chirp cadence, pure and clock-free so it is testable without a DOM.
 *
 * Chirps are per **word**, carrying that word's syllable count, never per character — a per-character
 * hook is 45 audio events a second.
 */

export const CHARS_PER_SEC = 45;

/** Vowel groups, minus a silent trailing `e`. Good enough for chirp cadence, not for poetry. */
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z']/g, '');
  if (w === '') return 0;
  const groups = w.match(/[aeiouy]+/g);
  let n = groups ? groups.length : 1;
  if (n > 1 && w.endsWith('e') && !w.endsWith('le') && !w.endsWith('ee')) n--;
  return Math.max(1, n);
}

/** A single line revealing at a fixed character rate. Pure; the clock is passed in. */
export class Typewriter {
  private full: string;
  private shown = 0;
  private carry = 0;

  constructor(text = '', private readonly cps: number = CHARS_PER_SEC) {
    this.full = text;
  }

  load(text: string): void {
    this.full = text;
    this.shown = 0;
    this.carry = 0;
  }

  update(dt: number): string {
    if (this.shown >= this.full.length) return this.full;
    this.carry += Math.max(0, dt) * this.cps;
    const step = Math.floor(this.carry);
    if (step > 0) {
      this.carry -= step;
      this.shown = Math.min(this.full.length, this.shown + step);
    }
    return this.text;
  }

  /** Reveal everything at once. */
  skip(): string {
    this.shown = this.full.length;
    this.carry = 0;
    return this.text;
  }

  get text(): string {
    return this.full.slice(0, this.shown);
  }

  get complete(): boolean {
    return this.shown >= this.full.length;
  }

  get revealed(): number {
    return this.shown;
  }

  get total(): number {
    return this.full.length;
  }
}
