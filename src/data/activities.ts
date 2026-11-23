/**
 * Twenty-two places where the player stops walking and does one small thing.
 *
 * The six authored set-pieces (GDD v1.1 R3) are marked ⭐ below. They are the 6-10 minute
 * beats: the skating race, the otter slide, the lantern ascent, the snowman, the kite and the
 * thermal descent. Everything else is 30-90 seconds of texture.
 *
 * Positions are sampled against the real heightfield in tests/content.test.ts: each must land
 * in its declared zone on ground below 0.5 slope.
 */

import type { ActivityDef } from '../core/contracts';

export const ACTIVITIES: readonly ActivityDef[] = [
  // Hearth Hollow — one, because Nana is standing right there.
  // At the east end of Bram's woodstore, where the end of the pile came down (buildSites.ts).
  { id: 'hearth-kindling', name: 'Woodpile', kind: 'build', zone: 'hearth', pos: { x: -335.5, z: 296.4 }, radius: 4.6, prompt: 'Stack', what: "stack logs on Bram's woodpile" },

  // Pinewind Wood — four.
  { id: 'pinewind-pinecone-throw', name: 'Pinecone Toss', kind: 'throw', zone: 'pinewind', pos: { x: -206, z: 160 }, radius: 3, prompt: 'Throw', what: 'toss pinecones at the snowmen' },
  // Out of the tree clump the old post stood in, with the first gate in plain view (raceCourses.ts).
  { id: 'pinewind-deer-run', name: 'Deer Trail Run', kind: 'race', zone: 'pinewind', pos: { x: -232, z: 190 }, radius: 3, prompt: 'Run', what: "race through the deer trail's gates" },
  { id: 'pinewind-creek-fish', name: 'Creek Pool', kind: 'fish', zone: 'pinewind', pos: { x: -246, z: 121 }, radius: 4.6, prompt: 'Fish', what: 'fish the creek pool' },
  // East of the deer, so it stands against open snow rather than a pine trunk (photoSubjects.ts).
  { id: 'pinewind-glade-photo', name: 'Hoarfrost Glade', kind: 'photo', zone: 'pinewind', pos: { x: -219, z: 141 }, radius: 3, prompt: 'Look', what: 'photograph the frosted glade' },

  // The Frozen Reach — four.
  // On the north shore, the one real slope in the Reach; the run ends on the ice by the boathouse (slidePath.ts).
  { id: 'reach-sled-hill', name: 'Boathouse Hill', kind: 'sled', zone: 'reach', pos: { x: 104, z: 180 }, radius: 3.4, prompt: 'Sled', what: 'sled down the hill by the boathouse' },
  { id: 'reach-ice-fish', name: 'Ice Hole', kind: 'fish', zone: 'reach', pos: { x: 110, z: 352 }, radius: 3.2, prompt: 'Fish', what: 'fish through a hole in the ice' },
  // ⭐ set-piece: the skating race
  { id: 'reach-skate-race', name: 'Reach Skating', kind: 'skate', zone: 'reach', pos: { x: 150, z: 398 }, radius: 4, prompt: 'Skate', what: 'skate a lap of the frozen lake' },
  { id: 'reach-ice-photo', name: 'Pressure Ridges', kind: 'photo', zone: 'reach', pos: { x: 74, z: 362 }, radius: 3, prompt: 'Look', what: 'photograph the pressure ridges in the ice' },

  // Kettle Springs — four.
  { id: 'kettles-spring-fish', name: 'Warm Pool', kind: 'fish', zone: 'kettles', pos: { x: -40, z: 60 }, radius: 5.6, prompt: 'Fish', what: 'fish the warm pool' },
  // ⭐ set-piece: the otter slide run
  { id: 'kettles-otter-slide', name: 'Otter Slide', kind: 'sled', zone: 'kettles', pos: { x: -45, z: 84 }, radius: 3.4, prompt: 'Slide', what: 'slide the otter run through its rings' },
  { id: 'kettles-steam-photo', name: 'Steam Columns', kind: 'photo', zone: 'kettles', pos: { x: -24, z: 86 }, radius: 3, prompt: 'Look', what: 'photograph the steam columns' },
  { id: 'kettles-dam-build', name: 'Stone Dam', kind: 'build', zone: 'kettles', pos: { x: -52, z: 42 }, radius: 3.2, prompt: 'Build', what: 'build a stone dam' },

  // Hollowpine Hamlet — three.
  // ⭐ set-piece: the snowman build
  { id: 'hamlet-snowman', name: 'Snowman', kind: 'build', zone: 'hamlet', pos: { x: 214, z: 138 }, radius: 3.6, prompt: 'Build', what: 'roll and build a snowman on the green' },
  // In the open square, 9 u east of the bell with nothing between, and the throw camera in front of the
  // pine clump at the square's edge: at (274, 128) the post stood inside that clump and the bell was
  // hidden behind its trunks (critic round 3).
  { id: 'hamlet-bell-throw', name: 'Bell Ring', kind: 'throw', zone: 'hamlet', pos: { x: 258.5, z: 121.8 }, radius: 3, prompt: 'Ring', what: "ring Gus's shop bell" },
  // 16 u south of the bell-post lantern, between the two southern houses: at 8 u the lamp sat above the top of the viewfinder.
  { id: 'hamlet-market-photo', name: 'Market Lamps', kind: 'photo', zone: 'hamlet', pos: { x: 250, z: 136 }, radius: 3, prompt: 'Look', what: 'photograph the market lamp' },

  // Windscar Ridge — four.
  // ⭐ set-piece: the kite on the ridge
  { id: 'ridge-kite', name: 'Kite Line', kind: 'throw', zone: 'ridge', pos: { x: 205, z: -195 }, radius: 3.2, prompt: 'Launch', what: 'fly a kite over the crest' },
  // ⭐ set-piece: the lantern-lighting ascent
  // "Run", not "Light": on the walk home Nana asks for the posts to be lit, and critic round 33 pressed E
  // on this one's "Light" and was put in a timed race.
  { id: 'ridge-lantern-ascent', name: 'Lantern Ascent', kind: 'race', zone: 'ridge', pos: { x: 168, z: -140 }, radius: 3.6, prompt: 'Run', what: 'run the lantern posts uphill' },
  // On the flat at the chimney's foot, by its first gate: it stood up the face, and critic round 82 clung there
  // out of breath before the race had begun.
  { id: 'ridge-chimney-race', name: 'Chimney Scramble', kind: 'race', zone: 'ridge', pos: { x: 209, z: -230 }, radius: 3.4, prompt: 'Climb', what: 'race up the chimney' },
  // On the open saddle just past its lantern post, where the last climb to the mast begins and critic
  // round 72 found "mostly empty snow": every climber leaves a stone (activities/buildSites.ts).
  { id: 'ridge-cairn', name: "Climbers' Cairn", kind: 'build', zone: 'ridge', pos: { x: 226, z: -245.5 }, radius: 3.2, prompt: 'Add', what: "add your stones to the climbers' cairn" },
  { id: 'ridge-tarn-fish', name: 'High Tarn', kind: 'fish', zone: 'ridge', pos: { x: 304, z: -222 }, radius: 4.6, prompt: 'Fish', what: 'fish the high tarn' },

  // Brindle Peak — two.
  { id: 'peak-aurora-photo', name: 'Aurora', kind: 'photo', zone: 'peak', pos: { x: 322, z: -392 }, radius: 3.4, prompt: 'Look', what: 'photograph the aurora' },
  // ⭐ set-piece: the thermal descent home
  { id: 'peak-thermal-flight', name: 'Thermal Descent', kind: 'race', zone: 'peak', pos: { x: 352, z: -364 }, radius: 4, prompt: 'Fly', what: 'glide down through the hoops' },
];
