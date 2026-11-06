/**
 * Run-time line sources for dialogue nodes that name one in `fill` (see DialogueNode.fill).
 *
 * The engine picks conversations by quest step, not by what else the player did, so a homecoming
 * that wants to mention the errands Pip ran draws the lines from here. The words are the writer's
 * (src/data/endingLines.ts); this file only decides which of them a run hears.
 */

import type { GameState } from '../core/contracts';
import { NANA_HEARD, NANA_POSTS, VALLEY_LINES } from './endingLines';
import { PICKUPS } from './pickups';
import { FISH } from './fish';

/** Nana says "just one, tonight": she adds at most this many things she has heard. */
const NANA_HEARD_MAX = 2;

/** Every trail post. `state.lanterns` holds only the ones Pip lit; the valley lights the rest. */
const POSTS = PICKUPS.filter((p) => p.kind === 'lantern').length;

/**
 * The roll-call's voices, by node, and who speaks each. A voice is heard only from someone Pip has met:
 * critic round 5 heard Orla, Skiff, Ivy, Wren and Gus answer as old friends on a run that had met none of
 * them. Bram is not here: the story runs through his woodstore, so every run has met him.
 */
export const RADIO_VOICES: Readonly<Record<string, string>> = {
  'edda-line-orla': 'orla',
  'edda-line-skiff': 'skiff',
  'edda-line-ivy': 'ivy',
  'edda-line-wren': 'wren',
  'edda-line-gus': 'gus',
};

/** How Edda names a voice that stayed off the air, and where to find them. */
const RADIO_WHERE: Readonly<Record<string, string>> = {
  orla: 'Orla at the hamlet bakery',
  skiff: 'Skiff out on the Frozen Reach',
  ivy: 'Ivy at the springs',
  wren: 'Wren in the pines',
  gus: 'Gus at the bell shop',
};

/** Nodes a run passes over, by id: a roll-call voice Pip has never met (see RADIO_VOICES). */
export const DIALOGUE_SKIPS: Readonly<Record<string, (s: GameState) => boolean>> = Object.fromEntries(
  Object.entries(RADIO_VOICES).map(([node, npc]) => [node, (s: GameState) => s.talked[npc] !== true]),
);

/** Gus's shop bell has been rung clean, whoever asked. */
const rung = (s: GameState): boolean => (s.counters['activity:hamlet-bell-throw:clean'] ?? 0) > 0;
/** The market lamp is on the camera. */
const lamps = (s: GameState): boolean => (s.counters['activity:hamlet-market-photo'] ?? 0) > 0;

export const DIALOGUE_FILLS: Readonly<Record<string, (s: GameState) => string[]>> = {
  // Edda signs off knowing who stayed quiet because Pip has not met them, and says where they are: the
  // roll-call ends by pointing at the valley still to see.
  'radio-unmet': (s) => {
    const unmet = Object.values(RADIO_VOICES).filter((npc) => s.talked[npc] !== true).map((npc) => RADIO_WHERE[npc]);
    if (unmet.length === 0) return [];
    const list = unmet.length === 1 ? unmet[0] : `${unmet.slice(0, -1).join(', ')} and ${unmet[unmet.length - 1]}`;
    return [`There's more of the valley than came on tonight. ${list[0].toUpperCase()}${list.slice(1)}, for a start.`, "Go and say hello. They'll want to meet the bird who fixed the line."];
  },
  // Orla asks for a snowman with the flour. Critic round 15 had built one 20 u from her bakery and was
  // still told not to forget it: she has seen it, or reminds Pip, whichever is true. Said first.
  'orla-snowman': (s) =>
    (s.counters['activity:hamlet-snowman'] ?? 0) > 0
      ? ["Was that your snowman on the green? It leans. I like it."]
      : ["Still no snowman on the green, I see. Somebody ought to enjoy the snow."],
  // Gus's first words. Critic round 28 bought a feather from him and was then told "you're not buying".
  // Not bought yet, he says where the feathers are and how: critic round 39 found them only by scanning.
  'gus-hello': (s) =>
    s.flags['picked:feather-shop-one'] === true || s.flags['picked:feather-shop-two'] === true
      ? ["Bells! Bells for sale! ...Oh, you've had a feather off me already. A customer! Hello."]
      : ["Bells! Bells for sale! ...Oh, it's you. Got bells? The two feathers at my feet are forty each. Stand by one and press E."],
  // Margit's record names the fish: critic round 30 caught a Burbot at her hole and heard "one fish".
  // The best of what the hole has given, by the activity's own tally of catches by kind.
  'margit-catch': (s) => {
    const caught = [...FISH].reverse().find((f) => (s.counters[`activity:reach-ice-fish:${f.id}`] ?? 0) > 0);
    return [
      "Off the old jetty? Skiff told you that? He's hoarded it for years.",
      `${caught ? `One ${caught.name}` : 'One fish'} from my hole, and where the pike sit. That's two lines in the record.`,
    ];
  },
  // Orla on the radio says what her oven has, by whether Pip brought the flour: critic round 31 heard
  // "the oven's on, and there's soup" while she still had no flour, and read it as a slip.
  // After the radio, villagers know who got it going: critic round 52 met Hollis and Wren after the ending,
  // and he greeted a stranger "come up the road" while she missed a hum that was back on.
  'hollis-hello': (s) => [
    s.quests['the-mast']?.status === 'complete' ? "You're Nana's. The one who got Edda's set talking." : "You're Nana's. The one come up the road.",
  ],
  'wren-hum': (s) => [
    s.quests['the-mast']?.status === 'complete'
      ? "It's humming again since you went up. I heard it come back. But nothing sounds new to me."
      : "It's been quiet since Tuesday. I didn't know you could miss a hum.",
  ],
  'orla-radio': (s) =>
    s.quests['orla-flour']?.status === 'complete'
      ? ["This is the bakery in Hollowpine Hamlet. The oven's on, and there's bread, four loaves of it."]
      : ["This is the bakery in Hollowpine Hamlet. The oven's on, but no flour yet, so it's soup."],
  // Skiff's hill. Critic round 30 rode it before he asked and was sent to ride it again: he saw it.
  'skiff-hill': (s) =>
    (s.counters['activity:reach-sled-hill'] ?? 0) > 0
      ? ["That was you on the boathouse hill, on the old hill sled? Good. So it still runs. Mind that birch, it doesn't move."]
      : ["First try the old hill sled. It's left at the top of the boathouse hill. Ride it down once. Mind the birch at the bottom. It doesn't move."],
  'skiff-wait-hill': (s) =>
    (s.counters['activity:reach-sled-hill'] ?? 0) > 0
      ? ['Back already? You rode the hill, I saw.']
      : ['Back already? Or did the hill throw you? Ride it down once first.'],
  'skiff-still-hill': (s) =>
    (s.counters['activity:reach-sled-hill'] ?? 0) > 0 ? ["You've had the hill."] : ['Down the boathouse hill first.'],
  // When she sends Pip to Skiff. Critic round 27 had built the snowman already and was still asked for
  // one, and said yes to it: she has seen it, or asks for it, whichever is true. Said first.
  'orla-green': (s) =>
    (s.counters['activity:hamlet-snowman'] ?? 0) > 0
      ? ['And the snowman on the green, that was you? Good. Somebody ought to enjoy the snow.']
      : ["And build a snowman on the green while you're out. Keeps your wings warm."],
  'orla-pip-green': (s) =>
    (s.counters['activity:hamlet-snowman'] ?? 0) > 0
      ? ['the snowman leans on purpose.']
      // Said before "take it on?" on the "why?" path, so it notices rather than promises (critic round 47).
      : ['and a snowman on the green.'],
  // In the card's order, so the threads between two people come first.
  'nana-heard': (s) =>
    VALLEY_LINES.map(([quest]) => quest)
      .filter((quest) => s.quests[quest]?.status === 'complete' && NANA_HEARD[quest] !== undefined)
      .slice(0, NANA_HEARD_MAX)
      .map((quest) => NANA_HEARD[quest] as string),
  // Her line about the posts says who lit them on this run: she used to say she watched Pip light
  // them all the way down, on a run where Pip had lit four of twelve and the rest lit themselves.
  // Ivy's roll-call line says how the pools are on this run: "steaming" sat oddly beside her errand
  // about them going cold when the dam was never mended.
  'ivy-radio': (s) => [
    s.quests['ivy-springs']?.status === 'complete'
      ? "Kettle Springs here. Dam's whole again, and the pools are steaming."
      : "Kettle Springs here. Pools are cooling, but there's warm enough yet.",
  ],
  // Done before it was asked for: the errand moves on, and the words now know it (critic round 26 rang the
  // bell, then heard Gus ask for it to be rung; photographed the lamps, then heard Orla ask for the photo).
  'gus-ring': (s) => [rung(s) ? "You've rung it already? I thought I heard something. Clean, was it?" : 'Ring the shop bell. One clean strike. No rattle.'],
  'gus-ring-wait': (s) => [rung(s) ? "You're back! You rang it, I know. Now, did it carry?" : "You're back! The shop bell's right there. One clean strike."],
  'gus-ring-still': (s) => [rung(s) ? 'You rang it! I heard!' : 'The shop bell! One clean strike!'],
  'orla-lamps': (s) => [lamps(s) ? "You've the lamps on the camera already? Then that's done." : 'Photograph the market lamps.'],
  'orla-lamps-wait': (s) => [lamps(s) ? "You're back. The queue's still out the door. The lamps are done, I saw." : "You're back. The queue's still out the door. The market lamps first, on the camera."],
  'orla-lamps-still': (s) => [lamps(s) ? 'The lamps are in the window now, love.' : 'The market lamps on the camera, love.'],
  // Critic round 19 rebuilt the dam before meeting Ivy, and she still asked for the stones back.
  'ivy-dam': (s) => [
    (s.counters['activity:kettles-dam-build'] ?? 0) > 0
      ? "Wait. The dam's whole again? Somebody's put the stones back. You? Well. That's half of it."
      : "Set the stones back in the dam, one at a time. The current tugs at them; hold each one over its gap.",
  ],
  'ivy-dam-wait': (s) => [
    (s.counters['activity:kettles-dam-build'] ?? 0) > 0
      ? "The dam's holding. I can hear it."
      : 'The dam first. Hold each stone over its gap against the current, then set it.',
  ],
  // Jory's errand as it stands: critic round 39 brought him the fish and was still asked for one.
  'jory-wait': (s) =>
    (s.quests['jory-first-step']?.step ?? 0) >= 1
      ? ['You caught the fish? Good. I will wrap it in a leaf, for the walk.', 'Now the pines, in Pinewind Wood. Go first.']
      : ['You are still going? Good. I am still here. I have not moved.', 'A fish from the warm pool first. Then the pines, in Pinewind Wood.'],
  'nana-posts': (s) => {
    const lit = Object.keys(s.lanterns).length;
    return [lit >= POSTS ? NANA_POSTS.all : lit > 0 ? NANA_POSTS.some : NANA_POSTS.none];
  },
};
