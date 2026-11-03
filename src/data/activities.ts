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
  { id: 'hearth-kindling', name: 'Woodpile', kind: 'build', zone: 'hearth', pos: { x: -335.5, z: 296.4 }, radius: 4.6, prompt: 'Stack' },

  // Pinewind Wood — four.
  { id: 'pinewind-pinecone-throw', name: 'Pinecone Toss', kind: 'throw', zone: 'pinewind', pos: { x: -206, z: 160 }, radius: 3, prompt: 'Throw' },
  // Out of the tree clump the old post stood in, with the first gate in plain view (raceCourses.ts).
  { id: 'pinewind-deer-run', name: 'Deer Trail Run', kind: 'race', zone: 'pinewind', pos: { x: -232, z: 190 }, radius: 3, prompt: 'Run' },
  { id: 'pinewind-creek-fish', name: 'Creek Pool', kind: 'fish', zone: 'pinewind', pos: { x: -246, z: 121 }, radius: 4.6, prompt: 'Fish' },
  // East of the deer, so it stands against open snow rather than a pine trunk (photoSubjects.ts).
  { id: 'pinewind-glade-photo', name: 'Hoarfrost Glade', kind: 'photo', zone: 'pinewind', pos: { x: -219, z: 141 }, radius: 3, prompt: 'Look' },

  // The Frozen Reach — four.
  // On the north shore, the one real slope in the Reach; the run ends on the ice by the boathouse (slidePath.ts).
  { id: 'reach-sled-hill', name: 'Boathouse Hill', kind: 'sled', zone: 'reach', pos: { x: 104, z: 180 }, radius: 3.4, prompt: 'Sled' },
  { id: 'reach-ice-fish', name: 'Ice Hole', kind: 'fish', zone: 'reach', pos: { x: 110, z: 352 }, radius: 3.2, prompt: 'Fish' },
  // ⭐ set-piece: the skating race
  { id: 'reach-skate-race', name: 'Reach Skate Race', kind: 'skate', zone: 'reach', pos: { x: 150, z: 398 }, radius: 4, prompt: 'Skate' },
  { id: 'reach-ice-photo', name: 'Pressure Ridges', kind: 'photo', zone: 'reach', pos: { x: 74, z: 362 }, radius: 3, prompt: 'Look' },

  // Kettle Springs — four.
  { id: 'kettles-spring-fish', name: 'Warm Pool', kind: 'fish', zone: 'kettles', pos: { x: -40, z: 60 }, radius: 5.6, prompt: 'Fish' },
  // ⭐ set-piece: the otter slide run
  { id: 'kettles-otter-slide', name: 'Otter Slide', kind: 'sled', zone: 'kettles', pos: { x: -45, z: 84 }, radius: 3.4, prompt: 'Slide' },
  { id: 'kettles-steam-photo', name: 'Steam Columns', kind: 'photo', zone: 'kettles', pos: { x: -24, z: 86 }, radius: 3, prompt: 'Look' },
  { id: 'kettles-dam-build', name: 'Stone Dam', kind: 'build', zone: 'kettles', pos: { x: -52, z: 42 }, radius: 3.2, prompt: 'Build' },

  // Hollowpine Hamlet — three.
  // ⭐ set-piece: the snowman build
  { id: 'hamlet-snowman', name: 'Snowman', kind: 'build', zone: 'hamlet', pos: { x: 214, z: 138 }, radius: 3.6, prompt: 'Build' },
  // In the open square, 9 u east of the bell with nothing between, and the throw camera in front of the
  // pine clump at the square's edge: at (274, 128) the post stood inside that clump and the bell was
  // hidden behind its trunks (critic round 3).
  { id: 'hamlet-bell-throw', name: 'Bell Ring', kind: 'throw', zone: 'hamlet', pos: { x: 258.5, z: 121.8 }, radius: 3, prompt: 'Ring' },
  // 16 u south of the bell-post lantern, between the two southern houses: at 8 u the lamp sat above the top of the viewfinder.
  { id: 'hamlet-market-photo', name: 'Market Lamps', kind: 'photo', zone: 'hamlet', pos: { x: 250, z: 136 }, radius: 3, prompt: 'Look' },

  // Windscar Ridge — four.
  // ⭐ set-piece: the kite on the ridge
  { id: 'ridge-kite', name: 'Kite Line', kind: 'throw', zone: 'ridge', pos: { x: 205, z: -195 }, radius: 3.2, prompt: 'Launch' },
  // ⭐ set-piece: the lantern-lighting ascent
  { id: 'ridge-lantern-ascent', name: 'Lantern Ascent', kind: 'race', zone: 'ridge', pos: { x: 168, z: -140 }, radius: 3.6, prompt: 'Light' },
  { id: 'ridge-chimney-race', name: 'Chimney Scramble', kind: 'race', zone: 'ridge', pos: { x: 232, z: -206 }, radius: 3.4, prompt: 'Climb' },
  { id: 'ridge-tarn-fish', name: 'High Tarn', kind: 'fish', zone: 'ridge', pos: { x: 304, z: -222 }, radius: 4.6, prompt: 'Fish' },

  // Brindle Peak — two.
  { id: 'peak-aurora-photo', name: 'Aurora', kind: 'photo', zone: 'peak', pos: { x: 322, z: -392 }, radius: 3.4, prompt: 'Look' },
  // ⭐ set-piece: the thermal descent home
  { id: 'peak-thermal-flight', name: 'Thermal Descent', kind: 'race', zone: 'peak', pos: { x: 352, z: -364 }, radius: 4, prompt: 'Fly' },
];
