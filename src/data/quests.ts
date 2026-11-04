/**
 * The story spine and the errands around it.
 *
 * The spine is four chained quests (`main: true`, linked by `then`): get Bram's spare batteries for
 * Nana, climb to Edda at the mast, raise the valley on the radio, and come home. The goal line and the
 * compass always follow the spine; errands are what the valley offers along the way.
 *
 * Every quest names its own conversation nodes — `offer` (the giver's pitch; talking accepts it),
 * `waiting` (the giver while it runs) and a step's `say` (what the person you were sent to says when
 * you arrive). Nothing is inferred from node-id suffixes any more; see core/progress/conversation.ts.
 *
 * Step conditions only use kinds something else actually writes: `talked` (npc interaction),
 * `visited` (zone entry), `reached` (arriving at a spot in data/places.ts), `activity`
 * (activity:completed) and `quest` (completion). A talk or a visit passes only on something done while
 * the step is current; an activity or a place done once, at any time, is done, unless the step is
 * `fresh` (core/progress/quests.ts). Use `reached`, not `visited`, when the step means "be there": a
 * zone is entered at its rim, hundreds of units from what the step is about.
 *
 * Errands keep to one zone or two neighbouring ones, or put their long leg on a walk the story already
 * makes: Tuck's rope goes up with the climb and the news of it comes down with the walk home, and
 * Pell's letter ends at the cabin, where every run ends. A cross-map errand with a walk back was
 * 1,400 units of empty snow for one conversation.
 *
 * `still` names the node a giver speaks when talked to again before Pip has walked away; give one to
 * any quest whose `waiting` node greets a return ("You're back."). The offer's own instructions node
 * serves: the ask, said again, with no greeting.
 *
 * Each step's `text` names its own target, because the journal is often the only place the player
 * has been told what to do. `tools/story-check.ts` fails on a step that does not.
 */

import type { Condition, QuestDef, QuestReward, QuestStep, ZoneId } from '../core/contracts';

type StepExtra = Pick<QuestStep, 'say' | 'gives' | 'hold' | 'fresh' | 'offers'>;
const s = (id: string, text: string, when: Condition, extra: StepExtra = {}): QuestStep => ({ id, text, when, ...extra });
const talk = (id: string, text: string, npc: string, say: string, extra: Omit<StepExtra, 'say'> = {}): QuestStep =>
  s(id, text, { kind: 'talked', id: npc }, { say, ...extra });

interface Extra {
  requires?: Condition[];
  gives?: QuestDef['gives'];
  then?: string;
  main?: boolean;
}
const q = (
  id: string,
  title: string,
  giver: string,
  zone: ZoneId,
  blurb: string,
  nodes: { offer: string; waiting: string; still?: string; notYet?: string },
  steps: QuestStep[],
  reward: QuestReward,
  extra: Extra = {},
): QuestDef => ({ id, title, giver, zone, blurb, ...nodes, steps, reward, ...extra });

const done = (quest: string): Condition => ({ kind: 'quest', id: quest });

/** The quest whose completion is the radio finale, the story's climax on the peak. */
export const FINALE_QUEST = 'the-mast';

/** The quest whose completion ends the story: the ending card follows its conversation with Nana. */
export const ENDING_QUEST = 'nana-home';

export const QUESTS: readonly QuestDef[] = [
  // ---- The story -------------------------------------------------------------
  q('the-line', "The Line's Down", 'nana', 'hearth', "The radio's dead, and Nana can't make the climb.",
    { offer: 'nana-root', waiting: 'nana-wait' }, [
      talk('bram', 'Ask Bram by the big pine for the spare batteries.', 'bram', 'bram-batteries', { hold: 'bram-stack' }),
      s('stack', "Stack the end of Bram's woodpile, by the big pine.", { kind: 'activity', id: 'hearth-kindling' }),
      talk('paid', 'Tell Bram the end of the pile is built.', 'bram', 'bram-paid', { gives: { item: 'batteries' }, offers: 'tuck-rope' }),
      talk('nana', 'Bring the batteries to Nana at the cabin.', 'nana', 'nana-done'),
      // Nana hands Pip the camera with the errand, so it is Pip's before Edda asks for a photograph.
    ], { ability: 'lantern', bells: 8 }, { main: true, then: 'the-climb', gives: { item: 'camera' } }),

  q('the-climb', 'Up to the Mast', 'nana', 'peak', 'Edda is waiting at the mast for the batteries.',
    { offer: 'nana-climb-wait', waiting: 'nana-climb-wait' }, [
      talk('edda', 'Take the batteries to Edda at the mast on Brindle Peak.', 'edda', 'edda-meet'),
    ], { bells: 10 }, { main: true, then: 'the-mast', requires: [done('the-line')] }),

  q('the-mast', 'The Only Radio', 'edda', 'peak', 'The set is warm. It needs a clear sky to reach the valley.',
    { offer: 'edda-wait', waiting: 'edda-wait', notYet: 'edda-early' }, [
      s('aurora', 'Photograph the aurora north of the mast on Brindle Peak.', { kind: 'activity', id: 'peak-aurora-photo' }),
      talk('call', 'Tell Edda the aurora is up.', 'edda', 'edda-line-up'),
    ], { bells: 20, achievement: 'summit' }, { main: true, then: 'nana-home', requires: [done('the-climb')] }),

  q('nana-home', 'Home Again', 'nana', 'hearth', "She'll ask what you got up to. She'll already know.",
    { offer: 'nana-home-done', waiting: 'nana-home-done' }, [
      talk('kettle', 'Follow the lit posts home to Nana at the cabin.', 'nana', 'nana-home-done'),
    ], { bells: 20 }, { main: true, requires: [done('the-mast')] }),

  // ---- Hearth Hollow -------------------------------------------------------
  q('hollis-mitten', 'One Mitten', 'hollis', 'hearth', 'A mitten is missing, and Hollis has a theory.',
    { offer: 'hollis-root', waiting: 'hollis-wait' }, [
      talk('owl', 'Ask Fen in the pines if he saw the mitten.', 'fen', 'fen-mitten'),
      s('creek', 'Fish the Creek Pool below the split pine in Pinewind Wood.', { kind: 'activity', id: 'pinewind-creek-fish' }),
      talk('tell', 'Take the mitten back to Hollis.', 'hollis', 'hollis-done'),
    ], { item: 'mitten', bells: 12 }),

  // ---- Pinewind Wood -------------------------------------------------------
  q('wren-sounds', "Wren's Sounds", 'wren', 'pinewind', 'She writes down every sound. The book is nearly full.',
    { offer: 'wren-root', waiting: 'wren-wait', still: 'wren-still' }, [
      s('glade', 'Take a photograph in the hoarfrost glade in Pinewind Wood.', { kind: 'activity', id: 'pinewind-glade-photo' }),
      s('steam', 'Listen to the hot pools at Kettle Springs.', { kind: 'reached', id: 'kettle-pools' }),
      talk('show', 'Tell Wren what you heard.', 'wren', 'wren-done'),
    ], { item: 'sketchbook', bells: 12 }),

  q('tamsin-headband', 'Something for a Head', 'tamsin', 'pinewind', 'She knits for strangers and worries about the fit.',
    { offer: 'tamsin-root', waiting: 'tamsin-wait' }, [
      s('toss', 'Have a go at the pinecone toss in Pinewind Wood.', { kind: 'activity', id: 'pinewind-pinecone-throw' }),
      // The headband is for Hollis, so it is tried on Hollis, one zone down the trail, not judged by
      // Orla across the valley: that leg was 450 units each way.
      talk('fit', 'Ask Hollis by the road head to try on the headband.', 'hollis', 'hollis-fit'),
      talk('give', 'Tell Tamsin the headband fits.', 'tamsin', 'tamsin-done'),
    ], { item: 'headband', bells: 10 }),

  q('fen-ledger', 'Something on the Trail', 'fen', 'pinewind', 'He keeps a tally of everything that moves in the pines. One thing he has never seen.',
    { offer: 'fen-root', waiting: 'fen-wait', still: 'fen-still' }, [
      s('run', 'Run the deer trail in Pinewind Wood, fast.', { kind: 'activity', id: 'pinewind-deer-run' }),
      talk('marten', 'Ask Tamsin by the split pine what comes down the deer trail.', 'tamsin', 'tamsin-trail'),
      talk('entry', 'Tell Fen what Tamsin sees on the deer trail.', 'fen', 'fen-done'),
    ], { bells: 14 }),

  q('ilsa-kindling', 'The Bundle', 'ilsa', 'pinewind', 'She carries things for everyone except herself.',
    { offer: 'ilsa-root', waiting: 'ilsa-wait' }, [
      s('springs', "Carry Ilsa's bundle to Kettle Springs.", { kind: 'visited', id: 'kettles' }),
      talk('ivy', 'Hand the bundle to Ivy, her sister.', 'ivy', 'ivy-bundle'),
      talk('back', 'Tell Ilsa it landed.', 'ilsa', 'ilsa-done'),
    ], { bells: 15 }),

  // ---- The Frozen Reach ----------------------------------------------------
  q('skiff-sled', 'The Long Hill', 'skiff', 'reach', 'A boat captain with no water and a sled in the rafters.',
    { offer: 'skiff-root', waiting: 'skiff-wait', still: 'skiff-still' }, [
      s('hill', 'Ride the sled down the boathouse hill in the Frozen Reach.', { kind: 'activity', id: 'reach-sled-hill' }),
      talk('margit', 'Ask Margit if the ice holds a sled.', 'margit', 'margit-sled'),
      talk('sled', 'Take the sled from Skiff.', 'skiff', 'skiff-done'),
    ], { ability: 'sled', bells: 12 }),

  q('margit-ice', 'Where the Pike Sit', 'margit', 'reach', "She doesn't believe in luck. She believes in records.",
    { offer: 'margit-root', waiting: 'margit-wait', still: 'margit-still' }, [
      // Fresh: Margit records what she watched being caught, so a fish from before she was counting is not hers.
      s('hole', 'Fish the ice hole in the Frozen Reach while Margit counts.', { kind: 'activity', id: 'reach-ice-fish' }, { fresh: true }),
      talk('skiff', 'Ask Skiff where the pike sit.', 'skiff', 'skiff-pike'),
      talk('report', 'Tell Margit what you caught, and where the pike sit.', 'margit', 'margit-done'),
    ], { item: 'bait', bells: 10 }),

  // ---- Hollowpine Hamlet ---------------------------------------------------
  q('orla-flour', 'Four Loaves', 'orla', 'hamlet', 'The oven is on. The flour is on a frozen boat.',
    { offer: 'orla-root', waiting: 'orla-wait' }, [
      talk('flour', 'Ask Skiff about the flour on his boat.', 'skiff', 'skiff-flour'),
      s('snow', 'Build a snowman in Hollowpine Hamlet while you wait.', { kind: 'activity', id: 'hamlet-snowman' }),
      talk('loaves', 'Tell Orla in the hamlet the flour is coming.', 'orla', 'orla-done'),
    ], { item: 'soup', itemCount: 2, bells: 12 }),

  q('pell-letter', 'The Blue House', 'pell', 'hamlet', 'One letter, four blue houses, and a postmaster losing sleep.',
    { offer: 'pell-root', waiting: 'pell-wait' }, [
      // Delivered is done: the walk back to say so was 700 units, and Pell hears it when Pip next comes
      // by, as the opening of his second errand (pell-address's offer).
      talk('nana', "Give Pell's letter to Nana at the cabin in Hearth Hollow.", 'nana', 'nana-letter'),
    ], { item: 'letter', bells: 10 }),

  q('gus-ledger', 'The Bell Ring', 'gus', 'hamlet', 'He sells bells but has never heard the big one.',
    { offer: 'gus-root', waiting: 'gus-wait', still: 'gus-still' }, [
      s('ring', "Ring Gus's shop bell cleanly in Hollowpine Hamlet.", { kind: 'activity', id: 'hamlet-bell-throw' }),
      talk('pell', 'Ask Pell how far the shop bell carries.', 'pell', 'pell-bell'),
      talk('gus', 'Tell Gus the bell carries to the hamlet.', 'gus', 'gus-done'),
    ], { bells: 18 }),

  q('orla-night-bake', 'The Night Bake', 'orla', 'hamlet', 'Four loaves becomes nine if nobody sleeps.',
    { offer: 'orla-b', waiting: 'orla-bwait', still: 'orla-bstill' }, [
      s('lamps', 'Photograph the market lamps in Hollowpine Hamlet.', { kind: 'activity', id: 'hamlet-market-photo' }),
      talk('gus', 'Borrow Gus from his shop for an hour.', 'gus', 'gus-bake'),
      talk('orla', 'Tell Orla the queue is fed.', 'orla', 'orla-bdone'),
    ], { bells: 14 }, { requires: [done('orla-flour')] }),

  q('pell-address', 'Four Blue Houses', 'pell', 'hamlet', "He numbered them. It didn't help.",
    { offer: 'pell-done', waiting: 'pell-bwait', still: 'pell-bstill' }, [
      talk('orla', 'Ask Orla at the bakery which house is blue.', 'orla', 'orla-blue'),
      talk('ivy', 'Ask Ivy at Kettle Springs which house is blue.', 'ivy', 'ivy-blue'),
      talk('pell', 'Tell Pell what Orla and Ivy said.', 'pell', 'pell-bdone'),
    ], { bells: 12 }, { requires: [done('pell-letter')] }),

  // ---- Kettle Springs ------------------------------------------------------
  q('ivy-springs', 'Forty-One Degrees', 'ivy', 'kettles', 'The pools are cooling, and Ivy has a theory about the dam.',
    { offer: 'ivy-root', waiting: 'ivy-wait' }, [
      s('dam', 'Rebuild the stone dam at Kettle Springs.', { kind: 'activity', id: 'kettles-dam-build' }),
      talk('corm', 'Get Corm by the steam to read the pool temperature.', 'corm', 'corm-temp'),
      talk('ivy', 'Bring Ivy the temperature.', 'ivy', 'ivy-done'),
    ], { item: 'charm', bells: 14 }),

  q('corm-news', 'Verbatim-ish', 'corm', 'kettles', 'He reports what he hears, but never checks it.',
    { offer: 'corm-root', waiting: 'corm-wait', still: 'corm-still' }, [
      talk('bakery', 'Ask Orla if the bakery is open.', 'orla', 'orla-news'),
      talk('post', 'Ask Pell if the post is running.', 'pell', 'pell-news'),
      talk('corm', 'Give Corm the corrected version.', 'corm', 'corm-done'),
    ], { bells: 12 }),

  q('jory-first-step', 'As Far As the Pines', 'jory', 'kettles', "He has been warm his whole life. That's the problem.",
    { offer: 'jory-root', waiting: 'jory-wait' }, [
      s('fish', 'Catch something in the warm pool at Kettle Springs.', { kind: 'activity', id: 'kettles-spring-fish' }),
      s('walk', 'Walk as far as Pinewind Wood for Jory.', { kind: 'visited', id: 'pinewind' }),
      talk('back', 'Tell Jory what the pines are like.', 'jory', 'jory-done'),
    ], { bells: 9 }),

  // ---- Windscar Ridge ------------------------------------------------------
  // Bram hands the rope over with the batteries (the-line's `offers`), so it goes up the ridge with the
  // climb, and the word that it is tied comes down with the walk home. Tuck asking first sent Pip from
  // the ridge to Hearth Hollow and back up: 1,500 units for one coil of rope.
  q('tuck-rope', 'The Good Rope', 'bram', 'hearth', "Bram's best rope, for a bridge keeper he hasn't spoken to in years.",
    { offer: 'bram-rope', waiting: 'bram-rope-wait' }, [
      talk('bridge', "Take Bram's good rope up to Tuck at the bridge on Windscar Ridge.", 'tuck', 'tuck-root', { gives: { item: 'key' } }),
      talk('bram', 'Tell Bram by the big pine that Tuck has tied the rope.', 'bram', 'bram-rope-done'),
    ], { bells: 16 }, { requires: [{ kind: 'hasItem', id: 'batteries' }], gives: { item: 'rope' } }),

  q('sable-kite', 'Forty, Gusting', 'sable', 'ridge', 'She measures the wind and files a report either way.',
    { offer: 'sable-root', waiting: 'sable-wait' }, [
      s('kite', "Get Sable's kite above the crest on Windscar Ridge.", { kind: 'activity', id: 'ridge-kite' }),
      s('ascent', 'Run the lantern ascent on Windscar Ridge.', { kind: 'activity', id: 'ridge-lantern-ascent' }),
      talk('report', 'Give Sable your reading.', 'sable', 'sable-done'),
    ], { bells: 15 }),

  q('chimney-line', 'Nettle Chimney', 'sable', 'ridge', "A tall face nobody has tried. It's been there all along.",
    { offer: 'sable-b', waiting: 'sable-bwait' }, [
      s('scramble', 'Take the chimney scramble to the top on Windscar Ridge.', { kind: 'activity', id: 'ridge-chimney-race' }),
      talk('tuck', 'Tell Tuck the face is climbable.', 'tuck', 'tuck-chimney'),
      talk('sable', 'Tell Sable the face is climbable.', 'sable', 'sable-bdone'),
    ], { bells: 18 }, { requires: [done('sable-kite')] }),
];
