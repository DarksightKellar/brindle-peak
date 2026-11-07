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
  all: "I watched your lights go up the mountain, one post at a time. Every single one. I knew where you were the whole way up.",
  some: "I watched a few of your lights go up the mountain. Then after the call the rest came on, from the top, all the way down to my door.",
  none: "After the call I stood out here and watched the posts come on, one after the other, from the top right down to my door. The whole valley, lighting you home.",
};

/**
 * Nana's last word before the porch: one villager Pip has not met, named the way the goal line will
 * name them next (core/guide/goal.ts `unmetAfterStory`, from her door), with a reason to go. Critic
 * round 69 heard "The valley will be there in the morning. All of it." and then a generic hello line.
 */
export const NANA_TOMORROW: Readonly<Record<string, string>> = {
  hollis: "In the morning, look in on Hollis down by the road head. He's lost a mitten, and he's got it into his head that somebody took it.",
  wren: "In the morning, go up into Pinewind and find Wren. She writes the valley down, and she's run short of things worth writing.",
  tamsin: "In the morning, there's a marten in Pinewind called Tamsin who knits for folk she's never even met. She'll want to measure your head.",
  fen: "In the morning, Fen will be up his pine in Pinewind, counting everything that moves. Say hello before he counts you.",
  ilsa: "In the morning, Ilsa's in Pinewind, carrying something for somebody. Make her put it down for a minute.",
  skiff: "In the morning, go out on the Frozen Reach and find Skiff. He's a boat captain with no water, and he's been sulking ever since the lake froze.",
  margit: "In the morning, Margit's out on the Frozen Reach, measuring the ice. She'll tell you how thick before you've asked.",
  orla: "In the morning, Orla at the bakery in Hollowpine Hamlet will have the oven hot and nothing to put in it. Go and see her.",
  pell: "In the morning, Pell at the post in Hollowpine Hamlet has a letter he can't place. He'd be glad of a second pair of eyes.",
  gus: "In the morning, Gus sells bells in Hollowpine Hamlet and he's never once rung the big one. Go and lend him a bit of nerve.",
  ivy: "In the morning, go down to Kettle Springs and find Ivy. She says the pools are cooling, and she won't say she's worried.",
  corm: "In the morning, Corm will be at Kettle Springs with the news. About half of it's true. Go and find out which half.",
  jory: "In the morning, there's a little mouse at Kettle Springs, Jory, who has never been out of the warm. Go and say hello.",
  tuck: "In the morning, look in on Tuck, who keeps the bridge on Windscar Ridge. He hasn't spoken to Bram in years, but say hello to him anyway.",
  sable: "In the morning, Sable's up on Windscar Ridge measuring the wind. Ask her what it's doing. She'll tell you, at length.",
};

/** Everyone met already: the morning is Pip's own. */
export const NANA_TOMORROW_ALL = "In the morning, the valley's all yours. Half of it owes you a cup of something, so go and collect.";

/** Nana at the homecoming, one line per finished errand (chosen by src/data/dialogueFills.ts). */
export const NANA_HEARD: Readonly<Record<string, string>> = {
  'hollis-mitten': "Hollis came past with both mittens on, waving them at me. He says he owes an owl an apology.",
  'wren-sounds': "Wren tells me her book's full, and the last page isn't even in her own words.",
  'tamsin-headband': "Hollis came by in a green headband, tight round the ears. Says the marten from the pines made it. He looked pleased, for Hollis.",
  'fen-ledger': "Fen asked Tamsin a question, I hear. Fen, asking somebody something! Twenty years I've known that owl.",
  'ilsa-kindling': "Ilsa sat down in my kitchen and didn't get up for ten minutes. I don't know what you said.",
  'skiff-sled': "Skiff says his sled's out at last. He sounded almost cheerful. Well, nearly.",
  'margit-ice': "Margit has a new line in her record, and won't tell me what it is.",
  'orla-flour': "One of those soups in your bag is mine, I expect. Orla fusses. I'll pretend I needed it.",
  'pell-letter': "That letter you brought me. I've read it six times now.",
  // On the radio, not at her door: Gus keeps his shop in the hamlet, the far side of the valley (critic round 30).
  'gus-ledger': "Gus was on the radio, telling the whole valley how far his bell carries. Twice.",
  'orla-night-bake': "Orla's sent a loaf up from the night bake. Still warm. She says you earned it.",
  'pell-address': "Pell's putting names on his letters now, not colours. He'll finally get some sleep.",
  'ivy-springs': "Ivy says the pools are warm again, and that's as near as she'll come to thanks.",
  'corm-news': "Corm came round with the news, and every word of it was true. I nearly dropped the kettle.",
  'jory-first-step': "Little Jory at the springs had a foot out of the water. Imagine.",
  'tuck-rope': "Bram's rope is up on Tuck's bridge. And those two haven't spoken in years!",
  'sable-kite': "Sable filed a report with something in it besides 'windy'. She'll be insufferable.",
  'chimney-line': "Tuck's talking about climbing the chimney on the ridge. Tuck, climbing! I'll believe it when I see it.",
};

/**
 * The errand lines for a run, in the card's order. `more` counts finished errands left off the card.
 */
export function valleyLines(done: (quest: string) => boolean): { lines: string[]; more: number } {
  const all = VALLEY_LINES.filter(([quest]) => done(quest)).map(([, line]) => line);
  return { lines: all.slice(0, VALLEY_LINES_SHOWN), more: Math.max(0, all.length - VALLEY_LINES_SHOWN) };
}
