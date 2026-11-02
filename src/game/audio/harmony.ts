/** The score's harmony: four bars of chords the pad, strings, pluck and bell all draw from. */

export const midiHz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/** `tones`: the chord's pitch classes (0 = C), for checking an arp note belongs to its chord. */
export interface ChordDef { pad: readonly number[]; arp: readonly number[]; tones: readonly number[] }

/** D - Bm - G - A, back to D. Four bars, and the loop closes on the tonic rather than drifting. */
export const CHORDS: readonly ChordDef[] = [
  { pad: [50, 57, 62, 66], arp: [62, 66, 69, 74], tones: [2, 6, 9] },
  { pad: [47, 54, 62, 66], arp: [59, 62, 66, 71], tones: [11, 2, 6] },
  { pad: [43, 50, 59, 62], arp: [55, 59, 62, 67], tones: [7, 11, 2] },
  { pad: [45, 52, 64, 69], arp: [57, 61, 64, 69], tones: [9, 1, 4] },
];

export const STEPS_PER_BAR = 8;
