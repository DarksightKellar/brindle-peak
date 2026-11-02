/**
 * Versioned save / load for `GameState`.
 *
 * `save` is JSON.stringify of the state as-is: no projection, no pruning, so a round trip is
 * lossless for every field the contracts define.
 *
 * `load` is paranoid by contract — it returns `null` for anything it cannot fully validate and
 * never throws. Validation is structural: `version` must equal `SAVE_VERSION`, every top-level
 * field below must be present and of the right shape, every numeric map value must be a finite
 * number, and `player.pos` / `checkpoint` must be finite (NaN and Infinity positions are how a
 * corrupt or half-written save shows up).
 *
 * Unknown/extra top-level keys are DISCARDED. The returned state is rebuilt from the known fields
 * only, so a save written by a newer build cannot smuggle unvalidated data into the runtime, and a
 * stale field name cannot linger. Adding a field to `GameState` means adding it here too — that is
 * the migration point.
 *
 * No `Date.now()`, no storage access: this module is pure, the caller owns localStorage.
 */

import type {
  GameState,
  PlayerAbilities,
  QuestProgress,
  QuestStatus,
  Vec3,
  ZoneId,
} from '../contracts';
import { SAVE_VERSION, ZONE_IDS } from '../contracts';

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

function numMap(v: unknown): Record<string, number> | null {
  if (!isRec(v)) return null;
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v)) {
    if (!isNum(val)) return null;
    out[k] = val;
  }
  return out;
}

function boolMap(v: unknown): Record<string, boolean> | null {
  if (!isRec(v)) return null;
  const out: Record<string, boolean> = {};
  for (const [k, val] of Object.entries(v)) {
    if (!isBool(val)) return null;
    out[k] = val;
  }
  return out;
}

const STATUSES: readonly QuestStatus[] = ['locked', 'available', 'active', 'complete'];

function questMap(v: unknown): Record<string, QuestProgress> | null {
  if (!isRec(v)) return null;
  const out: Record<string, QuestProgress> = {};
  for (const [k, val] of Object.entries(v)) {
    if (!isRec(val)) return null;
    const status = val.status;
    const step = val.step;
    if (typeof status !== 'string' || !(STATUSES as readonly string[]).includes(status)) return null;
    if (!isNum(step) || step < 0) return null;
    const base = val.base;
    if (base !== undefined && !isNum(base)) return null;
    out[k] = base === undefined
      ? { status: status as QuestStatus, step: Math.floor(step) }
      : { status: status as QuestStatus, step: Math.floor(step), base };
  }
  return out;
}

function vec(v: unknown): Vec3 | null {
  if (!isRec(v)) return null;
  const { x, y, z } = v;
  if (!isNum(x) || !isNum(y) || !isNum(z)) return null;
  return { x, y, z };
}

function abilities(v: unknown): PlayerAbilities | null {
  if (!isRec(v)) return null;
  const { sprint, sled, lantern } = v;
  if (!isBool(sprint) || !isBool(sled) || !isBool(lantern)) return null;
  return { sprint, sled, lantern };
}

function zone(v: unknown): ZoneId | null {
  return typeof v === 'string' && (ZONE_IDS as readonly string[]).includes(v)
    ? (v as ZoneId)
    : null;
}

export function save(s: GameState): string {
  return JSON.stringify(s);
}

export function load(json: string): GameState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  try {
    if (!isRec(parsed)) return null;
    if (parsed.version !== SAVE_VERSION) return null;

    const p = parsed.player;
    if (!isRec(p)) return null;
    const pos = vec(p.pos);
    const facing = p.facing;
    const stamina = p.stamina;
    if (!pos || !isNum(facing) || !isNum(stamina)) return null;

    const ab = abilities(parsed.abilities);
    const checkpoint = vec(parsed.checkpoint);
    const z = zone(parsed.zone);
    const items = numMap(parsed.items);
    const counters = numMap(parsed.counters);
    const flags = boolMap(parsed.flags);
    const talked = boolMap(parsed.talked);
    const talkedAt = numMap(parsed.talkedAt);
    const visited = boolMap(parsed.visited);
    const quests = questMap(parsed.quests);
    const achievements = numMap(parsed.achievements);
    const fish = numMap(parsed.fish);
    const photos = numMap(parsed.photos);
    const lanterns = numMap(parsed.lanterns);
    const sledBests = numMap(parsed.sledBests);
    const feathers = parsed.feathers;
    const bells = parsed.bells;
    const playtime = parsed.playtime;
    /*
     * The one field that tolerates absence. It arrived after SAVE_VERSION 2 shipped, so every save on
     * disk today lacks it; those belong to players who have already played, and the intent is that a
     * returning player never sees the opening script. Anything that is not a boolean is treated the
     * same way rather than rejecting an otherwise valid save.
     */
    const onboardingDone = isBool(parsed.onboardingDone) ? parsed.onboardingDone : true;
    // A missing or non-string beat id is "no mid-script progress": the machine restarts at beat 1
    // rather than throwing, and an id this build has never heard of is handled by the same path.
    const onboardingBeat = typeof parsed.onboardingBeat === 'string' ? parsed.onboardingBeat : null;

    if (
      !ab ||
      !checkpoint ||
      !z ||
      !items ||
      !counters ||
      !flags ||
      !talked ||
      !talkedAt ||
      !visited ||
      !quests ||
      !achievements ||
      !fish ||
      !photos ||
      !lanterns ||
      !sledBests ||
      !isNum(feathers) ||
      !isNum(bells) ||
      !isNum(playtime)
    ) {
      return null;
    }

    return {
      version: SAVE_VERSION,
      player: { pos, facing, stamina },
      abilities: ab,
      feathers,
      bells,
      items,
      counters,
      flags,
      talked,
      talkedAt,
      visited,
      quests,
      achievements,
      fish,
      photos,
      lanterns,
      sledBests,
      playtime,
      zone: z,
      checkpoint,
      onboardingDone,
      onboardingBeat,
    };
  } catch {
    // Validation above should not throw; if a getter or proxy does, it is still "unloadable".
    return null;
  }
}
