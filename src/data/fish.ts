/**
 * Six fish for the journal. Values are bells, and they are deliberately small: fishing is a
 * way to stand still somewhere warm, not an economy.
 */

import type { FishDef } from '../core/contracts';

export const FISH: readonly FishDef[] = [
  { id: 'smelt', name: 'Silver Smelt', rarity: 'common', value: 3, body: '#9fb4c2', accent: '#e6eef2' },
  { id: 'char', name: 'Arctic Char', rarity: 'common', value: 4, body: '#8f6a5a', accent: '#e8a06a' },
  { id: 'grayling', name: 'Grayling', rarity: 'common', value: 5, body: '#7d8a94', accent: '#b9c9d2' },
  { id: 'burbot', name: 'Burbot', rarity: 'uncommon', value: 8, body: '#6b6350', accent: '#c9b98a' },
  { id: 'pike', name: 'Lake Pike', rarity: 'rare', value: 14, body: '#4f6b52', accent: '#a8c08a' },
  { id: 'ghost-trout', name: 'Ghost Trout', rarity: 'rare', value: 16, body: '#c9d6dd', accent: '#f2f8fa' },
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
