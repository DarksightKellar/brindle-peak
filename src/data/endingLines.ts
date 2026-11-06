/**
 * What the ending says about the errands the player actually finished.
 *
 * The ending card used to list an open oven, warm pools and ice that holds whether or not the player
 * had been anywhere near them. Now the card's fixed paragraph says only what is true on every run
 * (the radio call), and this table adds one sentence per finished errand, so the side stories pay
 * off and nothing is claimed that the player did not do.
 *
 * `VALLEY_LINES` is in the order the card prefers when there are more finished errands than room:
 * the threads between two people first, then the single favours.
 *
 * `NANA_HEARD` is what Nana would say at the homecoming about each errand. The dialogue engine
 * cannot yet choose a line by completed quest (see the writer's report), so nothing reads it yet.
 */

/** The card shows at most this many errand lines; the rest are counted. */
export const VALLEY_LINES_SHOWN = 4;

export const VALLEY_LINES: readonly (readonly [quest: string, line: string])[] = [
  ['ilsa-kindling', 'Ilsa is going down to the springs tomorrow, carrying nothing, to let her sister feed her.'],
  ['hollis-mitten', 'Hollis has his mitten back on its hook, and is working up to saying sorry to an owl.'],
  ['jory-first-step', 'Jory thinks he can go as far as the pines. Not today. Tomorrow.'],
  ['tamsin-headband', 'Hollis has tried on a headband knitted just for him. The next one will have more room for his ears.'],
  ['fen-ledger', 'Fen has asked the marten next door something, for the first time in twenty winters.'],
  ['corm-news', 'Corm has checked something, and it was true.'],
  ['wren-sounds', "Wren's old notebook is full. The last page is in your words."],
  // What the two of them said, not more: critic round 68 never heard either tell the valley anything.
  ['tuck-rope', "Bram's rope is on Tuck's bridge, his old woodshed key is back in his pocket, and come spring he's walking up with a tape."],
  ['chimney-line', 'Tuck is thinking about climbing Nettle Chimney. Just thinking.'],
  ['ivy-springs', "The pools are warm again behind Ivy's dam."],
  ['pell-letter', "Pell's last letter found the right door."],
  ['pell-address', 'Pell writes names on his letters now, not colours.'],
  ['orla-flour', "There is flour on its way up the hill to Orla's oven."],
  ['orla-night-bake', 'Nine loaves came out of the night bake, and the queue went home fed.'],
  ['gus-ledger', 'Gus knows his shop bell carries the whole hamlet. The big one is next.'],
  ['skiff-sled', "Skiff's sled is out of the rafters at last."],
  ['margit-ice', "Margit's record says where the pike sit."],
  ['sable-kite', 'Sable has filed a reading worth filing: forty, gusting.'],
];

/**
 * The journal's line under a finished chapter of the main story. A quest's blurb sets up the problem
 * ("Edda is waiting at the mast…"), which reads wrong once it is solved; the errands use their
 * `VALLEY_LINES` sentence there instead, and the chapters use these.
 */
export const CHAPTER_DONE: Readonly<Record<string, string>> = {
  // Said while the batteries are still on their way: "went up the mountain" was written before they had
  // (critic round 31).
  'the-line': "Bram's batteries are in your bag, for the mast on Brindle Peak.",
  'the-climb': 'Edda has the batteries, and the set at the mast is warm.',
  'the-mast': 'The aurora cleared the sky, and the valley heard the radio.',
  'nana-home': 'You followed the lit posts home. Nana already knew.',
};

/**
 * Nana at the homecoming, on the trail posts (chosen by src/data/dialogueFills.ts, by how many Pip lit).
 *
 * What is true: Pip lit the posts reached on the way up; after Edda signs off, the valley lights the
 * rest, from the top down to the cabin, because Nana asked over the radio (game/session/wayHome.ts).
 * So from the porch Nana watched a line of light come down the mountain toward her ahead of Pip.
 */
export const NANA_POSTS: Readonly<Record<'all' | 'some' | 'none', string>> = {
  all: "I watched your lights go up the mountain, one post at a time. Every one of them. I knew where you were the whole way.",
  some: "I watched a few of your lights go up the mountain. Then after the call the rest came on, from the top, all the way down to my door.",
  none: "After the call I stood here and watched the posts come on, one after another, from the top down to my door. The whole valley, lighting you home.",
};

/** Nana at the homecoming, one line per finished errand (chosen by src/data/dialogueFills.ts). */
export const NANA_HEARD: Readonly<Record<string, string>> = {
  'hollis-mitten': "Hollis came past with both mittens on, waving them at me. He says he owes an owl an apology.",
  'wren-sounds': "Wren tells me her book's full, and the last page isn't even in her words.",
  'tamsin-headband': "Hollis came by in a green headband, tight round the ears. Says the marten from the pines made it. He looked pleased, for Hollis.",
  'fen-ledger': "Fen asked Tamsin a question, I hear. Fen. Asked. Twenty years I've known that owl.",
  'ilsa-kindling': "Ilsa sat down in my kitchen and didn't get up for ten minutes. I don't know what you said.",
  'skiff-sled': "Skiff says his sled's out at last. He sounded almost cheerful. Almost.",
  'margit-ice': "Margit has a new line in her record, and won't tell me what it is.",
  'orla-flour': "One of those soups in your bag is mine, I expect. Orla fusses. I'll pretend I needed it.",
  'pell-letter': "That letter. You brought it. I've read it six times now.",
  // On the radio, not at her door: Gus keeps his shop in the hamlet, the far side of the valley (critic round 30).
  'gus-ledger': "Gus was on the radio, telling the whole valley how far his bell carries. Twice.",
  'orla-night-bake': "Orla's sent a loaf up from the night bake. Still warm. She says you earned it.",
  'pell-address': "Pell's letters have names on now, not colours. He'll sleep, at last.",
  'ivy-springs': "Ivy says the pools are warm again, and that's as near as she'll come to thanks.",
  'corm-news': "Corm came round with the news, and every word of it was true. I nearly dropped the kettle.",
  'jory-first-step': "Little Jory at the springs had a foot out of the water. Imagine.",
  'tuck-rope': "Bram's rope is on Tuck's bridge. Those two haven't spoken in years.",
  'sable-kite': "Sable filed a report with something in it besides 'windy'. She'll be insufferable.",
  'chimney-line': "Tuck's talking about the chimney on the ridge. Tuck, climbing. I'll believe it when I see it.",
};

/**
 * The errand lines for a run, in the card's order. `more` counts finished errands left off the card.
 */
export function valleyLines(done: (quest: string) => boolean): { lines: string[]; more: number } {
  const all = VALLEY_LINES.filter(([quest]) => done(quest)).map(([, line]) => line);
  return { lines: all.slice(0, VALLEY_LINES_SHOWN), more: Math.max(0, all.length - VALLEY_LINES_SHOWN) };
}
