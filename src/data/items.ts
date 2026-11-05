/**
 * Ten things that fit in a pocket. Items are never consumed by the system that hands them
 * out — they exist so a conversation can refer to something concrete later.
 *
 * `icon` is 12x12 stroke path data, drawn single-colour by the journal.
 */

import type { ItemDef } from '../core/contracts';

export const ITEMS: readonly ItemDef[] = [
  {
    id: 'mitten',
    name: "Hollis's Spare Mitten",
    desc: "Cream wool, thumb out. One mitten is no use to a bird either, but he wouldn't hear it.",
    icon: 'M3 10V5a2 2 0 0 1 4 0v5M3 8h4M7 10h2',
  },
  {
    id: 'headband',
    name: 'Moss-Green Headband',
    desc: 'Knitted for Hollis, tried on by Hollis, a little tight on Hollis. Tamsin says this one was practice.',
    icon: 'M2 7a4 4 0 0 1 8 0M2 7v2h8V7',
  },
  {
    id: 'soup',
    name: 'Tin of Barley Soup',
    desc: 'Two tins from Orla at the bakery. Barley, mostly. One is meant for Nana.',
    icon: 'M2 6h8a4 4 0 0 1-8 0zM3 3v1M5 2v2M7 3v1',
  },
  {
    id: 'bait',
    name: 'The Good Bait Tin',
    desc: 'Small hooks, smaller hopes. She said this one was the good tin.',
    icon: 'M2 4h8v6H2zM5 4V2h4',
  },
  {
    id: 'key',
    name: 'Bent Brass Key',
    desc: 'Tuck found it tied into the old bridge rope. Bent at the bow. Tuck says Bram will know what it opens.',
    icon: 'M4 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0M8 6h3M9 6v2',
    // Bram knows it when Pip tells him the rope is tied, and takes it back.
    handedOver: { kind: 'quest', id: 'tuck-rope' },
  },
  {
    id: 'sketchbook',
    name: "Wren's Full Notebook",
    desc: 'Years of valley sounds, every page full. The last one is yours: a stove cooling, a kettle arguing.',
    icon: 'M3 2h6v8H3zM3 5h6M5 8h2',
  },
  {
    id: 'charm',
    name: 'Warm Stone',
    desc: "From the bottom of Ivy's pool. Warm for an hour, then it wants more. So do you.",
    icon: 'M6 3a3 3 0 1 0 0 6a3 3 0 1 0 0-6M6 1v1M6 10v1',
  },
  {
    id: 'batteries',
    name: 'Spare Batteries',
    desc: "Two squat cells from behind Bram's woodpile. Heavier than they look.",
    icon: 'M3 3h6v7H3zM5 1h2v2M5 6h2',
    // Edda takes them at the mast, which is what finishes the climb.
    handedOver: { kind: 'quest', id: 'the-climb' },
  },
  {
    id: 'rope',
    name: 'The Good Rope',
    desc: "Forty feet, coiled, no splices. Bram checked. He'll measure it back.",
    icon: 'M3 3c4 0 4 3 0 3s-4 3 0 3h6',
    // Tuck takes it and hands back his key in the same talk.
    handedOver: { kind: 'hasItem', id: 'key' },
  },
  {
    // Handed over with Nana's first errand (data/quests.ts the-line `gives`), so the camera every
    // photograph is taken with, and the one Edda asks for at the mast, has been seen arriving.
    id: 'camera',
    name: "Nana's Camera",
    desc: 'Old, heavy, and it still takes a good picture. Nana handed it over with the first errand: Edda wants it at the mast.',
    icon: 'M2 4h8v6H2zM4 4l1-2h2l1 2M6 6a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3',
  },
];
