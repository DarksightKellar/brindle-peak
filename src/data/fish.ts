/**
 * Six fish for the journal. Values are bells, and they are deliberately small: fishing is a
 * way to stand still somewhere warm, not an economy.
 */

import type { FishDef } from '../core/contracts';

export const FISH: readonly FishDef[] = [
  // Bodies dark enough to stand off snow and ice, each with one fin colour of its own: pale grey bodies
  // with near-white fins vanished against the pool (critic round 7). The ghost trout stays pale on purpose.
  { id: 'smelt', name: 'Silver Smelt', rarity: 'common', value: 3, body: '#7f98a8', accent: '#d2e2ec' },
  { id: 'char', name: 'Arctic Char', rarity: 'common', value: 4, body: '#5e4a3e', accent: '#e8763a' },
  { id: 'grayling', name: 'Grayling', rarity: 'common', value: 5, body: '#5a646e', accent: '#b0566e' },
  { id: 'burbot', name: 'Burbot', rarity: 'uncommon', value: 8, body: '#5b5240', accent: '#c9b98a' },
  { id: 'pike', name: 'Lake Pike', rarity: 'rare', value: 14, body: '#41603f', accent: '#b4c98a' },
  { id: 'ghost-trout', name: 'Ghost Trout', rarity: 'rare', value: 16, body: '#b9c9d2', accent: '#6fc8c0' },
];

/**
 * Which fish live in which water, first the one the pool is known for. A first catch at a pool is
 * always its own fish, so the journal grows by one at each new pool: the critic landed the same Arctic
 * Char at two pools and called the second a repeat.
 */
export const POOL_FISH: Readonly<Record<string, readonly string[]>> = {
  'pinewind-creek-fish': ['grayling', 'char', 'ghost-trout'],
  'kettles-spring-fish': ['char', 'smelt', 'burbot'],
  'reach-ice-fish': ['burbot', 'smelt', 'pike'],
  'ridge-tarn-fish': ['ghost-trout', 'char', 'grayling'],
};
