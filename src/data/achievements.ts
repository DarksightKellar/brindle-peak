/**
 * Twenty, not thirty-eight. Each one is a real thing the player did, not a label on something
 * already counted elsewhere. Eighteen read the same condition interpreter every quest uses;
 * two ('summit', 'home-again') arrive from the story beats.
 *
 * `icon` is 12x12 stroke path data, single colour.
 */

import type { AchievementDef } from '../core/contracts';

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'nanas-porch', name: 'The Blue Cabin', desc: "The blue cabin at the road head, and Nana outside it, as if she'd been watching the road.", icon: 'M2 9V4l4-2 4 2v5M5 9V6h2v3', trigger: { kind: 'talked', id: 'nana' } },
  { id: 'woodsmoke', name: 'The Pines Close In', desc: 'The valley got small behind you. Ahead, only pines, creaking in the cold.', icon: 'M6 2l2 4h-1l2 4H3l2-4H4z', trigger: { kind: 'visited', id: 'pinewind' } },
  { id: 'thin-ice', name: 'It Held', desc: 'You stepped out onto the lake. It complained once, then held.', icon: 'M2 8h8M4 5h4M3 11h6', trigger: { kind: 'visited', id: 'reach' } },
  { id: 'steam-and-snow', name: 'Forty-One Degrees, Somewhere', desc: 'Snow behind you, warm wet air ahead. You kept walking into it.', icon: 'M3 9c0-2 2-2 2-4M6 9c0-2 2-2 2-4M9 9c0-2 2-2 2-4', trigger: { kind: 'visited', id: 'kettles' } },
  { id: 'six-chimneys', name: 'The Whole Town', desc: 'A bakery, a bell shop, a post round and some blue doors. That is the whole town. It is enough.', icon: 'M2 10V5h3v5M7 10V4h3v6', trigger: { kind: 'visited', id: 'hamlet' } },
  { id: 'the-wall', name: 'Above the Trees', desc: 'Nothing up here but rock and wind. The wind did most of the talking.', icon: 'M2 10V3h4v3h4v4', trigger: { kind: 'visited', id: 'ridge' } },
  { id: 'first-cast', name: 'One on the Line', desc: 'The line went tight and something below pulled back. Then it was yours.', icon: 'M3 3v7M3 5c4 0 4 4 6 4', trigger: { kind: 'count', id: 'fish', n: 1 } },
  { id: 'six-species', name: 'The Whole Page', desc: 'Six kinds of fish, all in your own handwriting. The page is full.', icon: 'M2 6c2-3 6-3 8 0-2 3-6 3-8 0zM6 5v2', trigger: { kind: 'count', id: 'fish:species', n: 6 } },
  { id: 'five-frames', name: 'Five Times, On Purpose', desc: 'You stopped five times and made the valley hold still.', icon: 'M2 4h3l1-1h2l1 1h1v6H2zM6 5a2 2 0 1 0 0 4 2 2 0 1 0 0-4', trigger: { kind: 'count', id: 'photo', n: 5 } },
  { id: 'hot-water', name: 'Feathers in the Steam', desc: 'You sat down in the hot water and your shivering quit before you did.', icon: 'M2 9h8M4 6c1-1 0-2 1-3M7 6c1-1 0-2 1-3', trigger: { kind: 'count', id: 'spring', n: 1 } },
  { id: 'every-spring', name: 'Every Pool in the Valley', desc: 'Five pools, five soaks. You had the last one entirely to yourself.', icon: 'M2 7c1-1 2-1 3 0s2 1 3 0 2-1 2 0M2 10c1-1 2-1 3 0s2 1 3 0 2-1 2 0', trigger: { kind: 'count', id: 'spring', n: 5 } },
  { id: 'lantern-chain', name: 'Twelve Lights Up the Hill', desc: 'Twelve posts, each one handing the dark to the next. The path stays lit.', icon: 'M6 2v2M4 6h4v3H4zM4 4h4', trigger: { kind: 'count', id: 'lantern', n: 12 } },
  { id: 'long-slide', name: 'Wet Feathers, No Regrets', desc: 'Down the otter slide and through the rings, snow in every feather.', icon: 'M2 4l8 4M2 8l6 3', trigger: { kind: 'count', id: 'activity:kettles-otter-slide', n: 1 } },
  { id: 'clean-ice', name: 'Stayed Up', desc: 'Out on the ice with nothing to hold, and you kept your balance anyway. Mostly.', icon: 'M4 2l4 4-4 4M8 2L4 6l4 4', trigger: { kind: 'count', id: 'activity:reach-skate-race', n: 1 } },
  { id: 'snow-sculptor', name: 'Three Balls and a Face', desc: 'It leans left and the eyes are wrong. You would fight anyone who says so.', icon: 'M6 2a2 2 0 1 0 0 4M6 9a3 3 0 1 0 0 2', trigger: { kind: 'count', id: 'activity:hamlet-snowman', n: 1 } },
  { id: 'kite-string', name: 'Forty Knots, Held On', desc: 'The wind took the kite and both your wings and nearly the rest of you.', icon: 'M3 2l5 5-3 3M8 7L4 11', trigger: { kind: 'count', id: 'activity:ridge-kite', n: 1 } },
  { id: 'chimney-top', name: 'The Tall Face', desc: 'Rock, then more rock, then sky. The valley got very small below.', icon: 'M3 10V4l3-2 3 3v5', trigger: { kind: 'count', id: 'activity:ridge-chimney-race', n: 1 } },
  { id: 'night-colour', name: 'Green Over the Peak', desc: 'It began as a smudge low in the north, and then the whole sky was moving.', icon: 'M2 9c2 0 3-4 5-4s2 4 3 4M2 3h1M9 3h1', trigger: { kind: 'count', id: 'activity:peak-aurora-photo', n: 1 } },
  { id: 'summit', name: 'The Mast at Last', desc: 'The mast, and Edda beside it, and a set waiting on power.', icon: 'M6 10V4M4 4h4M3 2h6', trigger: { kind: 'flag', id: 'summit' } }, // the mast, not the peak zone: zone radius 105 fired this ~26 u short
  { id: 'home-again', name: 'Home Again', desc: 'You crossed the whole valley and came back to the blue cabin, with a line of lights coming down the mountain ahead of you.', icon: 'M2 7l4-4 4 4M4 7v3h4V7', trigger: { kind: 'quest', id: 'nana-home' } },
];
