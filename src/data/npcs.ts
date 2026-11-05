/**
 * Eighteen people, each minding their own small business.
 *
 * Nobody here explains the theme. Each one is carrying one specific worry and has decided not
 * to mention it directly, which is how the valley stays warm without anybody saying so.
 *
 * Species mix: ptarmigan, hare, red squirrel, snow bunting, marten, owl, otter, raven,
 * deer mouse, fox. Placement is verified against the real heightfield in the content test:
 * every NPC stands in its declared zone on ground under 0.5 slope.
 */

import type { NpcDef } from '../core/contracts';

export const NPCS: readonly NpcDef[] = [
  // ---- Hearth Hollow (3) ---------------------------------------------------
  { id: 'nana', name: 'Nana Quill', species: 'ptarmigan', zone: 'hearth', pos: { x: -358.3, z: 355.3 }, yaw: -1.28, idle: 'nana-idle', body: '#f6f3ec', accent: '#8a5a3a', radius: 4 },
  { id: 'hollis', name: 'Hollis', species: 'hare', zone: 'hearth', pos: { x: -308, z: 296 }, yaw: 0.9, idle: 'hollis-idle', body: '#9d8f80', accent: '#f1ece2', radius: 4 },
  { id: 'bram', name: 'Bram', species: 'red squirrel', zone: 'hearth', pos: { x: -340, z: 306 }, yaw: -1.2, idle: 'bram-idle', body: '#b85a28', accent: '#f0d8b4', radius: 4 },

  // ---- Pinewind Wood (4) ---------------------------------------------------
  { id: 'wren', name: 'Wren', species: 'snow bunting', zone: 'pinewind', pos: { x: -252, z: 148 }, yaw: 1.4, idle: 'wren-idle', body: '#efece4', accent: '#b98a55', radius: 4 },
  { id: 'tamsin', name: 'Tamsin', species: 'marten', zone: 'pinewind', pos: { x: -220, z: 124 }, yaw: -0.6, idle: 'tamsin-idle', body: '#6b4a33', accent: '#c99a63', radius: 4 },
  { id: 'fen', name: 'Fen', species: 'owl', zone: 'pinewind', pos: { x: -268, z: 84 }, yaw: 0.3, idle: 'fen-idle', body: '#8a8172', accent: '#d8c9a8', radius: 4 },
  { id: 'ilsa', name: 'Ilsa', species: 'fox', zone: 'pinewind', pos: { x: -190, z: 166 }, yaw: 2.1, idle: 'ilsa-idle', body: '#b4592f', accent: '#f0e2d0', radius: 4 },

  // ---- The Frozen Reach (2) ------------------------------------------------
  { id: 'skiff', name: 'Skiff', species: 'otter', zone: 'reach', pos: { x: 64, z: 296 }, yaw: -2.4, idle: 'skiff-idle', body: '#5c4a3c', accent: '#d9c3a8', radius: 4 },
  { id: 'margit', name: 'Margit', species: 'raven', zone: 'reach', pos: { x: 98, z: 342 }, yaw: 0.5, idle: 'margit-idle', body: '#2b2b33', accent: '#6c7a86', radius: 4 },

  // ---- Hollowpine Hamlet (3) ----------------------------------------------
  { id: 'orla', name: 'Orla', species: 'deer mouse', zone: 'hamlet', pos: { x: 238, z: 136.4 }, yaw: 3.1, idle: 'orla-idle', body: '#a08a72', accent: '#e6d8c2', radius: 4 },
  { id: 'pell', name: 'Pell', species: 'fox', zone: 'hamlet', pos: { x: 262, z: 110 }, yaw: -0.4, idle: 'pell-idle', body: '#b86a3a', accent: '#f2e6d6', radius: 4 },
  { id: 'gus', name: 'Gus', species: 'red squirrel', zone: 'hamlet', pos: { x: 272, z: 134 }, yaw: 2.8, idle: 'gus-idle', body: '#9c4f2a', accent: '#edd2ae', radius: 4 },

  // ---- Kettle Springs (3) --------------------------------------------------
  { id: 'ivy', name: 'Ivy', species: 'otter', zone: 'kettles', pos: { x: -52, z: 50 }, yaw: 0.8, idle: 'ivy-idle', body: '#57463a', accent: '#d6c0a6', radius: 4 },
  { id: 'corm', name: 'Corm', species: 'raven', zone: 'kettles', pos: { x: -14, z: 70 }, yaw: -1.8, idle: 'corm-idle', body: '#31313a', accent: '#7b8794', radius: 4 },
  { id: 'jory', name: 'Jory', species: 'deer mouse', zone: 'kettles', pos: { x: -60, z: 86 }, yaw: 1.1, idle: 'jory-idle', body: '#9c8770', accent: '#e2d4be', radius: 4 },

  // ---- Windscar Ridge (2) --------------------------------------------------
  // Tuck stands at the west head of his bridge over the gully (world/tuckBridge.ts), looking across it.
  { id: 'tuck', name: 'Tuck', species: 'marten', zone: 'ridge', pos: { x: 152.9, z: -228.4 }, yaw: 1.75, idle: 'tuck-idle', body: '#63452f', accent: '#c49a68', radius: 4 },
  { id: 'sable', name: 'Sable', species: 'fox', zone: 'ridge', pos: { x: 286, z: -152 }, yaw: -1.4, idle: 'sable-idle', body: '#a85831', accent: '#f0e0cc', radius: 4 },

  // ---- Brindle Peak approach (1) -------------------------------------------
  { id: 'edda', name: 'Edda', species: 'owl', zone: 'peak', pos: { x: 344.5, z: -351 }, yaw: -2.0, idle: 'edda-idle', body: '#857c6d', accent: '#dfd0b0', radius: 4 },
];
