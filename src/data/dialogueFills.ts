/**
 * Run-time line sources for dialogue nodes that name one in `fill` (see DialogueNode.fill).
 *
 * The engine picks conversations by quest step, not by what else the player did, so a homecoming
 * that wants to mention the errands Pip ran draws the lines from here. The words are the writer's
 * (src/data/endingLines.ts); this file only decides which of them a run hears.
 */

import type { GameState } from '../core/contracts';
import { NANA_HEARD, NANA_POSTS, NANA_TOMORROW, NANA_TOMORROW_ALL, VALLEY_LINES } from './endingLines';
import { unmetAfterStory } from '../core/guide/goal';
import { NPCS } from './npcs';
import { QUESTS } from './quests';
import { ZONE_NAMES } from './zoneNames';
import { PICKUPS } from './pickups';
import { FISH } from './fish';
import { KEY } from '../core/keys';

/**
 * Nana's word for the morning: the villager the goal line will send Pip to next. Asked from her door with
 * the goal line's own rule, which also remembers the name, so the line under the compass agrees with her.
 */
function tomorrow(s: GameState): string {
  const nana = NPCS.find((n) => n.id === 'nana');
  const from = nana ? { x: nana.pos.x, z: nana.pos.z } : { x: 0, z: 0 };
  const met = unmetAfterStory(s, from, { quests: QUESTS, npcs: NPCS, activities: [], zones: [], places: [], zoneNames: ZONE_NAMES });
  return (met && NANA_TOMORROW[met.id]) ?? NANA_TOMORROW_ALL;
}

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
    return [`There's more of the valley than came on tonight. ${list[0].toUpperCase()}${list.slice(1)}, for a start.`, "Go and say hello to them. They'll want to meet the bird who got the line working again."];
  },
  // Orla asks for a snowman with the flour. Critic round 15 had built one 20 u from her bakery and was
  // still told not to forget it: she has seen it, or reminds Pip, whichever is true. Said first.
  'orla-snowman': (s) =>
    (s.counters['activity:hamlet-snowman'] ?? 0) > 0
      ? ["Was that your snowman out on the green? It leans a bit. I like it."]
      : ["Still no snowman on the green, I see. Somebody ought to be enjoying this snow."],
  // Critic round 55 rang Gus's bell ("Heads turned at the bakery") and Orla never said a word about it.
  'orla-bell': (s) => (rung(s) ? ["Was that Gus's shop bell? Half my queue turned round. I thought the bread had burnt!"] : []),
  // Gus's first words. Critic round 28 bought a feather from him and was then told "you're not buying".
  // Not bought yet, he says where the feathers are and how: critic round 39 found them only by scanning.
  'gus-hello': (s) =>
    s.flags['picked:feather-shop-one'] === true || s.flags['picked:feather-shop-two'] === true
      ? ["Bells! Bells for sale! ...Oh, you've already had a feather off me. A real customer! Hello."]
      : [`Bells! Bells for sale! ...Oh, it's you. Got any bells on you? Those two feathers at my feet are forty each. Just stand by one and press ${KEY.interact}.`],
  // Margit's record names the fish: critic round 30 caught a Burbot at her hole and heard "one fish".
  // The best of what the hole has given, by the activity's own tally of catches by kind.
  'margit-catch': (s) => {
    const caught = [...FISH].reverse().find((f) => (s.counters[`activity:reach-ice-fish:${f.id}`] ?? 0) > 0);
    return [
      "Off the old jetty? Skiff told you that? He's kept that to himself for years.",
      `${caught ? `One ${caught.name}` : 'One fish'} from my hole, and now I know where the pike sit. That's two new lines in the record.`,
    ];
  },
  // Orla on the radio says what her oven has, by whether Pip brought the flour: critic round 31 heard
  // "the oven's on, and there's soup" while she still had no flour, and read it as a slip.
  // After the radio, villagers know who got it going: critic round 52 met Hollis and Wren after the ending,
  // and he greeted a stranger "come up the road" while she missed a hum that was back on.
  'hollis-hello': (s) => [
    s.quests['the-mast']?.status === 'complete' ? "You're Nana's, aren't you? The one who got Edda's set talking again." : "You're Nana's, aren't you? The one who's come up the road.",
  ],
  'wren-hum': (s) => [
    s.quests['the-mast']?.status === 'complete'
      ? "The mast's been humming again since you went up there. I heard it come back. But nothing sounds new to me any more."
      : "The mast's been quiet since Tuesday. I never knew you could miss a hum.",
  ],
  'orla-radio': (s) =>
    s.quests['orla-flour']?.status === 'complete'
      ? ["This is the bakery in Hollowpine Hamlet. The oven's on, and there's bread, four loaves of it."]
      : ["This is the bakery in Hollowpine Hamlet. The oven's on, but there's no flour yet, so it's soup."],
  // Skiff's hill. Critic round 30 rode it before he asked and was sent to ride it again: he saw it.
  'skiff-hill': (s) =>
    (s.counters['activity:reach-sled-hill'] ?? 0) > 0
      ? ["Was that you on the boathouse hill, on the old hill sled? Good, so it still runs. Mind that birch, though. It doesn't move."]
      : ["But first, have a go on the old hill sled. It's left at the top of the boathouse hill. Ride it down once, and mind the birch at the bottom. It doesn't move."],
  'skiff-wait-hill': (s) =>
    (s.counters['activity:reach-sled-hill'] ?? 0) > 0
      ? ['Back already? I saw you ride the hill.']
      : ['Back already? Or did the hill throw you off? Ride it down once first.'],
  'skiff-still-hill': (s) =>
    (s.counters['activity:reach-sled-hill'] ?? 0) > 0 ? ["You've had your go on the hill."] : ['Ride down the boathouse hill first.'],
  // When she sends Pip to Skiff. Critic round 27 had built the snowman already and was still asked for
  // one, and said yes to it: she has seen it, or asks for it, whichever is true. Said first.
  'orla-green': (s) =>
    (s.counters['activity:hamlet-snowman'] ?? 0) > 0
      ? ['And was that snowman on the green you? Good. Somebody ought to be enjoying the snow.']
      : ["And build a snowman on the green while you're out, would you? It'll keep your wings warm."],
  'orla-pip-green': (s) =>
    (s.counters['activity:hamlet-snowman'] ?? 0) > 0
      ? ['that snowman leans on purpose, by the way.']
      // Said before "take it on?" on the "why?" path, so it notices rather than promises (critic round 47).
      : ['a snowman on the green, then.'],
  // In the card's order, so the threads between two people come first.
  'nana-heard': (s) => [
    ...VALLEY_LINES.map(([quest]) => quest)
      .filter((quest) => s.quests[quest]?.status === 'complete' && NANA_HEARD[quest] !== undefined)
      .slice(0, NANA_HEARD_MAX)
      .map((quest) => NANA_HEARD[quest] as string),
    tomorrow(s),
  ],
  // Her line about the posts says who lit them on this run: she used to say she watched Pip light
  // them all the way down, on a run where Pip had lit four of twelve and the rest lit themselves.
  // Ivy's roll-call line says how the pools are on this run: "steaming" sat oddly beside her errand
  // about them going cold when the dam was never mended.
  'ivy-radio': (s) => [
    s.quests['ivy-springs']?.status === 'complete'
      ? "Kettle Springs here. The dam's whole again, and the pools are steaming."
      : "Kettle Springs here. The pools are cooling, but they're still warm enough.",
  ],
  // Done before it was asked for: the errand moves on, and the words now know it (critic round 26 rang the
  // bell, then heard Gus ask for it to be rung; photographed the lamps, then heard Orla ask for the photo).
  'gus-ring': (s) => [rung(s) ? "You've rung it already? I thought I heard something! Was it clean?" : 'Ring the shop bell for me. One clean strike, no rattle.'],
  // Once rung, Gus has already had his surprise in the talk that heard it (critic round 69 got "You've
  // rung it already?" then "You rang it! I heard!", two beats for one ring): after that he just waits.
  'gus-ring-wait': (s) => [rung(s) ? "You're back! I can still hear that ring in my ears." : "You're back! The shop bell's right there. Just one clean strike."],
  'gus-ring-still': (s) => [rung(s) ? "I can still hear that one ringing in my ears." : 'The shop bell! One clean strike!'],
  'orla-lamps': (s) => [lamps(s) ? "You've already got the lamps on the camera? Then that's done." : 'Take a photograph of the market lamps for me.'],
  'orla-lamps-wait': (s) => [lamps(s) ? "You're back. The queue's still out the door. I saw you got the lamps." : "You're back. The queue's still out the door. Get the market lamps on the camera first."],
  'orla-lamps-still': (s) => [lamps(s) ? 'The lamps are up in the window now, love.' : 'Get the market lamps on the camera, love.'],
  // Critic round 19 rebuilt the dam before meeting Ivy, and she still asked for the stones back.
  'ivy-dam': (s) => [
    (s.counters['activity:kettles-dam-build'] ?? 0) > 0
      ? "Wait, the dam's whole again? Somebody's put the stones back. Was that you? Well, that's half of it done."
      : "Set the stones back in the dam, one at a time. The current tugs at them, so hold each one over its gap.",
  ],
  'ivy-dam-wait': (s) => [
    (s.counters['activity:kettles-dam-build'] ?? 0) > 0
      ? "The dam's holding. I can hear it."
      : 'The dam first. Hold each stone over its gap against the current, then set it down.',
  ],
  // Ivy between errands, as they stand: critic round 67 had delivered the bundle and the temperature and
  // still heard "forty-one and holding" and the message for her sister.
  'ivy-idle': (s) => {
    const warm = s.quests['ivy-springs']?.status === 'complete';
    const sister = s.quests['ilsa-kindling']?.status === 'complete';
    if (warm && sister) return ["Ilsa's coming down tomorrow. To check the water, she says. She's never once checked the water."];
    return [
      ...(warm ? ["It's forty-one and holding. The dam's doing its job."] : []),
      ...(sister ? ["Ilsa's coming down tomorrow. Don't tell her I've been tidying."] : ["If you see my sister in the pines, tell her the pools are warm. Don't say I said so."]),
    ];
  },
  // Hollis's sorry to Fen, once Pip has been back to Fen: critic round 68 heard it the moment the mitten
  // was home, one line after "I'll have to say something to him. Eventually."
  'hollis-idle': (s) => {
    const fen = s.quests['fen-ledger']?.status;
    return [
      "My mitten's back on its hook, where it belongs.",
      fen === 'active' || fen === 'complete'
        ? 'I said sorry to Fen, the owl. It took me three goes. He nodded.'
        : "I still owe Fen, the owl, an apology. I'm working up to it.",
    ];
  },
  // Tamsin sits where the deer trail bends, so she knows Fen's answer whether or not Pip took his errand:
  // critic round 68 left "Something on the Trail" on offer and never heard the deer named.
  'tamsin-idle': (s) => {
    const fen = s.quests['fen-ledger']?.status;
    if (fen === 'complete') return ['Fen came down off his branch this morning to watch the roe deer go by. He sat on my stump the whole time.'];
    if (fen === 'active') return [];
    return ["A roe deer comes down the trail past my stump every morning, regular as porridge. Fen, the owl, watches the top of the trail, and he's never once asked me about it."];
  },
  // Jory's errand as it stands: critic round 39 brought him the fish and was still asked for one.
  'jory-wait': (s) =>
    (s.quests['jory-first-step']?.step ?? 0) >= 1
      ? ['You caught the fish? Good. I will wrap it in a leaf for the walk.', 'Now the pines, in Pinewind Wood. Please go first.']
      : ['You are still going? Good. I am still here. I have not moved.', 'First a fish from the warm pool, and then the pines, in Pinewind Wood.'],
  'nana-posts': (s) => {
    const lit = Object.keys(s.lanterns).length;
    return [lit >= POSTS ? NANA_POSTS.all : lit > 0 ? NANA_POSTS.some : NANA_POSTS.none];
  },
};
