/**
 * Everything lying on the ground: 15 feathers, 60 bells, 12 lantern posts.
 *
 * `cluster` is `<zone>:<name>`. The zone prefix is authoritative — the content test asserts it
 * matches what the terrain sampler reports at `pos`, so a pickup cannot drift out of its zone
 * when the heightfield is retuned.
 *
 * Feather distribution: 1 in Hearth Hollow, 2 in Pinewind, 2 sold by Gus in the hamlet, set out a few
 * steps from where he stands, on the square's side, clear of the pines behind him (`price` bells each: critic round 25 had 202 bells after the story and never
 * learned what they were for; they lay 30 u off in the snow then, nowhere near him),
 * 9 elsewhere — above 30 units of elevation, behind a quest, or (one) at the erratic in the Kettles.
 * The Hearth one lies on the walk from Nana to Bram's woodstore, so the first feather is met in the
 * first minute, where the HUD can say what feathers are for; none in the Frozen Reach. Five more lie
 * beside the way up (trail.ts), each at something worth stopping for, so they are found on the
 * main road rather than by accident: the woodcutters' sledge in the ride, the erratic, the top of the
 * spur, the gully under Tuck's bridge, and the scramble. One more sits up on the ledge of the big rime rock
 * on the summit slope (`lift`), a hop off the trail: critic round 72 found that slope empty.
 *
 * Bells are low and grouped: 18 clusters of 2-5, all under 25 units of elevation. They are
 * pickup tier — chirp and a counter, no toast. Lanterns are the wayfinding chain and light in
 * order from the station to the summit.
 */

import type { Vec2 } from '../core/contracts';

export interface PickupDef {
  id: string;
  kind: 'feather' | 'bell' | 'lantern';
  pos: Vec2;
  cluster?: string;
  /** Bells it costs: picked up only with this many in the purse, which pays it. */
  price?: number;
  /** Up on a ledge this high above the snow: drawn there, and taken only by a hop up to it. */
  lift?: number;
}

/** What one of Gus's feathers costs, in bells. */
export const SHOP_FEATHER = 40;

export const PICKUPS: readonly PickupDef[] = [
  // ---- Feathers (15) -------------------------------------------------------
  { id: 'feather-hearth-woodstore', kind: 'feather', pos: { x: -347, z: 318 }, cluster: 'hearth:woodstore' },
  { id: 'feather-pw-glade', kind: 'feather', pos: { x: -232, z: 178 }, cluster: 'pinewind:glade' },
  { id: 'feather-pw-trail', kind: 'feather', pos: { x: -217.2, z: 202.1 }, cluster: 'pinewind:trail' },
  { id: 'feather-kettle-terrace', kind: 'feather', pos: { x: -64, z: 96 }, cluster: 'kettles:terrace' },
  { id: 'feather-kettle-pool', kind: 'feather', pos: { x: 22.5, z: -14 }, cluster: 'kettles:erratic' },
  { id: 'feather-hamlet-chest', kind: 'feather', pos: { x: 236, z: 102 }, cluster: 'hamlet:chest' },
  { id: 'feather-shop-one', kind: 'feather', pos: { x: 268.5, z: 131.6 }, cluster: 'hamlet:shop', price: SHOP_FEATHER },
  { id: 'feather-shop-two', kind: 'feather', pos: { x: 268.5, z: 134.6 }, cluster: 'hamlet:shop', price: SHOP_FEATHER },
  { id: 'feather-ridge-ledge', kind: 'feather', pos: { x: 214, z: -186 }, cluster: 'ridge:ledge' },
  { id: 'feather-ridge-scramble', kind: 'feather', pos: { x: 196, z: -230 }, cluster: 'ridge:scramble' },
  { id: 'feather-ridge-shelf', kind: 'feather', pos: { x: 71, z: -225 }, cluster: 'ridge:spur-top' },
  // On the frozen stream in the gully under Tuck's bridge, seen from the planks; the floor walks out south.
  { id: 'feather-ridge-traverse', kind: 'feather', pos: { x: 163.5, z: -241 }, cluster: 'ridge:icefall' },
  // On the trail side of the biggest rime rock (wayScenes.ts RIME, at 287, -300), on its shoulder.
  { id: 'feather-ridge-rime', kind: 'feather', pos: { x: 286.3, z: -300.7 }, cluster: 'ridge:rime', lift: 1.6 },
  { id: 'feather-peak-switch', kind: 'feather', pos: { x: 340, z: -390 }, cluster: 'peak:switchback' },
  { id: 'feather-peak-aurora', kind: 'feather', pos: { x: 302, z: -412 }, cluster: 'peak:aurora' },

  // ---- Bells (60, 18 clusters) --------------------------------------------
  { id: 'bell-hearth-a1', kind: 'bell', pos: { x: -344, z: 338 }, cluster: 'hearth:station-rut' },
  { id: 'bell-hearth-a2', kind: 'bell', pos: { x: -340, z: 342 }, cluster: 'hearth:station-rut' },
  { id: 'bell-hearth-a3', kind: 'bell', pos: { x: -336, z: 338 }, cluster: 'hearth:station-rut' },
  { id: 'bell-hearth-a4', kind: 'bell', pos: { x: -340, z: 334 }, cluster: 'hearth:station-rut' },
  { id: 'bell-hearth-b1', kind: 'bell', pos: { x: -296, z: 290 }, cluster: 'hearth:truck' },
  { id: 'bell-hearth-b2', kind: 'bell', pos: { x: -292, z: 286 }, cluster: 'hearth:truck' },
  { id: 'bell-hearth-b3', kind: 'bell', pos: { x: -288, z: 290 }, cluster: 'hearth:truck' },
  { id: 'bell-hearth-b4', kind: 'bell', pos: { x: -292, z: 294 }, cluster: 'hearth:truck' },
  { id: 'bell-hearth-c1', kind: 'bell', pos: { x: -300, z: 262 }, cluster: 'hearth:fork' },
  { id: 'bell-hearth-c2', kind: 'bell', pos: { x: -296, z: 258 }, cluster: 'hearth:fork' },
  { id: 'bell-hearth-c3', kind: 'bell', pos: { x: -292, z: 262 }, cluster: 'hearth:fork' },

  { id: 'bell-pw-a1', kind: 'bell', pos: { x: -286, z: 252 }, cluster: 'pinewind:lantern-line' },
  { id: 'bell-pw-a2', kind: 'bell', pos: { x: -282, z: 256 }, cluster: 'pinewind:lantern-line' },
  { id: 'bell-pw-a3', kind: 'bell', pos: { x: -278, z: 252 }, cluster: 'pinewind:lantern-line' },
  { id: 'bell-pw-a4', kind: 'bell', pos: { x: -282, z: 248 }, cluster: 'pinewind:lantern-line' },
  { id: 'bell-pw-b1', kind: 'bell', pos: { x: -244, z: 208 }, cluster: 'pinewind:muffled' },
  { id: 'bell-pw-b2', kind: 'bell', pos: { x: -240, z: 212 }, cluster: 'pinewind:muffled' },
  { id: 'bell-pw-b3', kind: 'bell', pos: { x: -236, z: 208 }, cluster: 'pinewind:muffled' },
  { id: 'bell-pw-c1', kind: 'bell', pos: { x: -226, z: 168 }, cluster: 'pinewind:glade-edge' },
  { id: 'bell-pw-c2', kind: 'bell', pos: { x: -222, z: 172 }, cluster: 'pinewind:glade-edge' },
  { id: 'bell-pw-c3', kind: 'bell', pos: { x: -218, z: 168 }, cluster: 'pinewind:glade-edge' },
  { id: 'bell-pw-c4', kind: 'bell', pos: { x: -222, z: 164 }, cluster: 'pinewind:glade-edge' },
  { id: 'bell-pw-d1', kind: 'bell', pos: { x: -206, z: 124 }, cluster: 'pinewind:deer' },
  { id: 'bell-pw-d2', kind: 'bell', pos: { x: -202, z: 128 }, cluster: 'pinewind:deer' },
  { id: 'bell-pw-d3', kind: 'bell', pos: { x: -198, z: 124 }, cluster: 'pinewind:deer' },

  { id: 'bell-reach-a1', kind: 'bell', pos: { x: 56, z: 330 }, cluster: 'reach:boathouse' },
  { id: 'bell-reach-a2', kind: 'bell', pos: { x: 60, z: 334 }, cluster: 'reach:boathouse' },
  { id: 'bell-reach-a3', kind: 'bell', pos: { x: 64, z: 330 }, cluster: 'reach:boathouse' },
  { id: 'bell-reach-a4', kind: 'bell', pos: { x: 60, z: 326 }, cluster: 'reach:boathouse' },
  { id: 'bell-reach-b1', kind: 'bell', pos: { x: 96, z: 366 }, cluster: 'reach:hole' },
  { id: 'bell-reach-b2', kind: 'bell', pos: { x: 100, z: 370 }, cluster: 'reach:hole' },
  { id: 'bell-reach-b3', kind: 'bell', pos: { x: 104, z: 366 }, cluster: 'reach:hole' },
  { id: 'bell-reach-c1', kind: 'bell', pos: { x: 140, z: 352 }, cluster: 'reach:skate-line' },
  { id: 'bell-reach-c2', kind: 'bell', pos: { x: 144, z: 356 }, cluster: 'reach:skate-line' },
  { id: 'bell-reach-c3', kind: 'bell', pos: { x: 148, z: 352 }, cluster: 'reach:skate-line' },
  { id: 'bell-reach-c4', kind: 'bell', pos: { x: 144, z: 348 }, cluster: 'reach:skate-line' },
  { id: 'bell-reach-d1', kind: 'bell', pos: { x: 180, z: 320 }, cluster: 'reach:shoal' },
  { id: 'bell-reach-d2', kind: 'bell', pos: { x: 184, z: 324 }, cluster: 'reach:shoal' },
  { id: 'bell-reach-d3', kind: 'bell', pos: { x: 188, z: 320 }, cluster: 'reach:shoal' },

  { id: 'bell-hamlet-a1', kind: 'bell', pos: { x: 232, z: 120 }, cluster: 'hamlet:bakery' },
  { id: 'bell-hamlet-a2', kind: 'bell', pos: { x: 236, z: 124 }, cluster: 'hamlet:bakery' },
  { id: 'bell-hamlet-a3', kind: 'bell', pos: { x: 240, z: 120 }, cluster: 'hamlet:bakery' },
  { id: 'bell-hamlet-a4', kind: 'bell', pos: { x: 236, z: 116 }, cluster: 'hamlet:bakery' },
  { id: 'bell-hamlet-b1', kind: 'bell', pos: { x: 266, z: 142 }, cluster: 'hamlet:post' },
  { id: 'bell-hamlet-b2', kind: 'bell', pos: { x: 270, z: 146 }, cluster: 'hamlet:post' },
  { id: 'bell-hamlet-b3', kind: 'bell', pos: { x: 274, z: 142 }, cluster: 'hamlet:post' },
  { id: 'bell-hamlet-b4', kind: 'bell', pos: { x: 270, z: 138 }, cluster: 'hamlet:post' },
  { id: 'bell-hamlet-c1', kind: 'bell', pos: { x: 288, z: 124 }, cluster: 'hamlet:shop-steps' },
  { id: 'bell-hamlet-c2', kind: 'bell', pos: { x: 292, z: 128 }, cluster: 'hamlet:shop-steps' },
  { id: 'bell-hamlet-c3', kind: 'bell', pos: { x: 296, z: 124 }, cluster: 'hamlet:shop-steps' },

  { id: 'bell-kettle-a1', kind: 'bell', pos: { x: -46, z: 68 }, cluster: 'kettles:pool-edge' },
  { id: 'bell-kettle-a2', kind: 'bell', pos: { x: -42, z: 72 }, cluster: 'kettles:pool-edge' },
  { id: 'bell-kettle-a3', kind: 'bell', pos: { x: -38, z: 68 }, cluster: 'kettles:pool-edge' },
  { id: 'bell-kettle-b1', kind: 'bell', pos: { x: -56, z: 56 }, cluster: 'kettles:dam' },
  { id: 'bell-kettle-b2', kind: 'bell', pos: { x: -52, z: 60 }, cluster: 'kettles:dam' },
  { id: 'bell-kettle-b3', kind: 'bell', pos: { x: -48, z: 56 }, cluster: 'kettles:dam' },
  { id: 'bell-kettle-c1', kind: 'bell', pos: { x: -28, z: 52 }, cluster: 'kettles:cool-pool' },
  { id: 'bell-kettle-c2', kind: 'bell', pos: { x: -24, z: 56 }, cluster: 'kettles:cool-pool' },
  { id: 'bell-kettle-d1', kind: 'bell', pos: { x: -70, z: 80 }, cluster: 'kettles:steam' },
  { id: 'bell-kettle-d2', kind: 'bell', pos: { x: -66, z: 84 }, cluster: 'kettles:steam' },

  // ---- Lanterns (12) — Nana's trail posts, in order from the station to the summit --------------
  // On the way up the goal actually leads you (game/world/trail.ts WAY_UP), a couple of steps to the
  // right of the line: straight from the cabin through the ride in the pines, past the springs, to the
  // foot of Windscar Ridge; then west along the foot, up the spur, east along the shelf behind the
  // crest to the saddle, and up the summit slope. Marker stakes stand between them.
  { id: 'lantern-hearth-1', kind: 'lantern', pos: { x: -350.4, z: 337.5 }, cluster: 'hearth:trail' },
  { id: 'lantern-pw-1', kind: 'lantern', pos: { x: -260.8, z: 246.1 }, cluster: 'pinewind:trail' },
  { id: 'lantern-pw-2', kind: 'lantern', pos: { x: -171.9, z: 155.4 }, cluster: 'pinewind:trail' },
  { id: 'lantern-kettle-1', kind: 'lantern', pos: { x: -22.4, z: 31.5 }, cluster: 'kettles:trail' },
  { id: 'lantern-ridge-1', kind: 'lantern', pos: { x: 61.6, z: -55.5 }, cluster: 'kettles:trail' },
  { id: 'lantern-ridge-2', kind: 'lantern', pos: { x: 151.6, z: -148.5 }, cluster: 'ridge:foot' },
  { id: 'lantern-ridge-3', kind: 'lantern', pos: { x: 92, z: -170 }, cluster: 'ridge:spur' },
  { id: 'lantern-ridge-4', kind: 'lantern', pos: { x: 68.2, z: -210 }, cluster: 'ridge:spur' },
  { id: 'lantern-ridge-5', kind: 'lantern', pos: { x: 130, z: -228.8 }, cluster: 'ridge:shelf' },
  { id: 'lantern-ridge-6', kind: 'lantern', pos: { x: 214.8, z: -236 }, cluster: 'ridge:saddle' },
  { id: 'lantern-ridge-7', kind: 'lantern', pos: { x: 259.5, z: -278.4 }, cluster: 'ridge:summit-slope' },
  { id: 'lantern-peak-1', kind: 'lantern', pos: { x: 301.2, z: -318.2 }, cluster: 'peak:trail' },
];
