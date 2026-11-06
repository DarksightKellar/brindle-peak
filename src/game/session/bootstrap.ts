/**
 * Boot: build the world, the systems and the state, in dependency order.
 *
 * This block is pure construction — nothing here runs per frame — and pulling it out is what brings
 * `session.ts` back under the 260-line rule. The session keeps the frame: input, routing, stepping,
 * presentation order. If a change to this file affects anything per-frame, it belongs in session.ts.
 */

import type { GameState, PlayerState } from '../../core/contracts';
import { createGameState, createPlayerState } from '../../core/contracts';
import { createSampler, generateHeightfield } from '../../core/terrain/heightfield';
import { TUNING } from '../../core/player/tuning';
import { createEventBus } from '../../core/progress/events';
import { createQuestEngine } from '../../core/progress/quests';
import { createAchievementEngine } from '../../core/progress/achievements';
import { ACHIEVEMENTS } from '../../data/achievements';
import { ACTIVITIES } from '../../data/activities';
import { finishedBuildMarkers } from '../activities/buildSites';
import { activityOffered, questWants } from '../activities/offered';
import { NPCS } from '../../data/npcs';
import { PICKUPS } from '../../data/pickups';
import { QUESTS } from '../../data/quests';
import { PEAK, SPAWN, SPAWN_FACING, WORLD_RES, WORLD_SEED, WORLD_SIZE, ZONES } from '../../data/zones';
import type { AudioKit } from '../audio/audio';
import { createAudio } from '../audio/audio';
import type { CameraRig } from '../camera/rig';
import { createCameraRig } from '../camera/rig';
import { createPlayerMesh, type PlayerMesh } from '../actors/playerMesh';
import { createInteractionSystem, type InteractionSystem } from '../interactions';
import type { PixelPipeline } from '../render/pixelPipeline';
import { createPixelPipeline } from '../render/pixelPipeline';
import { createSceneKit, type SceneKit } from '../render/scene';
import { createSnowfall } from '../render/weather';
import type { WorldBuild } from '../world/assemble';
import { buildWorld } from '../world/assemble';
import { createActivityMarkers, type ActivityMarkerLayer } from '../world/activityMarkers';
import { createFootprintTracker, createFootprints } from '../world/footprints';
import { buildInteractables } from './interact';
import type { Mechanics } from './mechanics';
import { createMechanics } from './mechanics';
import type { Onboarding } from './onboarding';
import { createOnboardingScript } from './onboarding';
import type { Persistence } from './persistence';
import { createPersistence } from './persistence';
import type { Presentation } from './presentation';
import { createPresentation } from './presentation';
import { savesAllowed } from './saveGuard';
import { createWayHome, type WayHome } from './wayHome';

export interface BootOptions {
  canvas: HTMLCanvasElement;
  uiRoot: HTMLElement;
  /** Load a previous run if present. Off for the acceptance harness, which wants a clean start. */
  resume?: boolean;
}

export interface Booted {
  state: GameState;
  player: PlayerState;
  spawn: { x: number; y: number; z: number };
  /** No previous run on disk: the player has never seen this world, so it is worth introducing. */
  fresh: boolean;
  store: Persistence;
  sampler: ReturnType<typeof createSampler>;
  kit: SceneKit;
  pipeline: PixelPipeline;
  snowfall: ReturnType<typeof createSnowfall>;
  world: WorldBuild;
  markers: ActivityMarkerLayer;
  pip: PlayerMesh;
  prints: ReturnType<typeof createFootprints>;
  footprintTracker: ReturnType<typeof createFootprintTracker>;
  rig: CameraRig;
  audio: AudioKit;
  ui: Presentation;
  mech: Mechanics;
  onboarding: Onboarding;
  /** The posts that light themselves after the radio call (wayHome.ts). */
  wayHome: WayHome;
  interactions: InteractionSystem;
  bus: ReturnType<typeof createEventBus>;
  quests: ReturnType<typeof createQuestEngine>;
  achievements: ReturnType<typeof createAchievementEngine>;
}

export function bootstrap(opts: BootOptions): Booted {
  const sampler = createSampler(
    generateHeightfield(WORLD_SEED, WORLD_SIZE, WORLD_RES, ZONES, PEAK), ZONES,
  );

  // Persistence is built before the state exists because it is what reads the previous run; the
  // getter is only used by persist(), which cannot run until the state is assigned below.
  let stateRef: GameState | null = null;
  const store = createPersistence(() => stateRef as GameState);
  const loaded = opts.resume === false ? null : store.load();
  const fresh = loaded === null;
  // SPAWN.y is nominal; the start is resampled onto the real ground so Pip never begins inside it. A
  // save is resampled too: one written mid-jump or mid-glide (the autosave and the page closing both
  // can) put Pip back in the air, to drop to the snow on load. Pip only ever stands on the terrain.
  const at = loaded?.player.pos ?? SPAWN;
  const spawn = { x: at.x, y: sampler.heightAt(at.x, at.z) + 0.05, z: at.z };

  const state: GameState = loaded ?? createGameState(spawn, TUNING.staminaMaxBase);
  stateRef = state;
  const player = createPlayerState({ ...spawn }, TUNING.staminaMaxBase + state.feathers);
  if (loaded) {
    // A resumed run picks up where it was left: same heading, same breath.
    player.facing = loaded.player.facing;
    player.stamina = Math.min(player.maxStamina, Math.max(0, loaded.player.stamina));
  } else {
    // The chase camera inherits the heading, so this is the opening frame: Pip, Nana at the cabin
    // door (data/zones.ts). Spawning facing +Z pointed at the empty south-west edge.
    player.facing = SPAWN_FACING;
  }

  const bus = createEventBus();
  const quests = createQuestEngine(QUESTS);
  const achievements = createAchievementEngine(ACHIEVEMENTS);
  quests.advance(state);
  // `zone:entered` only fires on a CHANGE, so without this the journal opened showing the starting
  // zone unvisited while the player was standing in it.
  state.visited[state.zone] = true;

  const kit = createSceneKit();
  const pipeline = createPixelPipeline(opts.canvas, kit);
  const snowfall = createSnowfall();
  const world: WorldBuild = buildWorld(sampler, NPCS, PICKUPS);
  kit.scene.add(world.group);

  const markers = createActivityMarkers();
  kit.scene.add(markers.object);
  // Finished woodpiles, snowmen and dams are still standing after a reload.
  markers.restore(finishedBuildMarkers(ACTIVITIES, state.counters, sampler));

  const pip: PlayerMesh = createPlayerMesh((x, z) => sampler.heightAt(x, z));
  kit.scene.add(pip.root);

  // The snow remembers you. This is what replaces a map.
  const prints = createFootprints();
  kit.scene.add(prints.object);
  const footprintTracker = createFootprintTracker(prints, sampler, spawn);
  const rig = createCameraRig(kit);
  // Trees and boulders are static, so the occluder set is built once at boot.
  rig.setOccluders(world.occluders);

  const audio: AudioKit = createAudio();
  const ui: Presentation = createPresentation(opts.uiRoot, audio, (x, z) => sampler.heightAt(x, z));
  ui.hud.setBuildings(world.colliders.flatMap((c) => (c.kind === 'box' ? [c] : [])));
  const mech: Mechanics = createMechanics({
    state, player, bus, quests, achievements, world, sampler,
    cameraYaw: () => rig.yaw(),
  });

  // A finished woodpile stays finished: its prompt goes once nothing asks for it again.
  const activityById = new Map(ACTIVITIES.map((a) => [a.id, a]));
  const interactions = createInteractionSystem((i) => {
    if (i.kind === 'lantern') return state.abilities.lantern && !state.lanterns[i.id] && !wayHome.lit(i.id);
    if (i.kind === 'pickup') return state.flags[`picked:${i.id}`] !== true;
    const def = i.kind === 'activity' ? activityById.get(i.id) : undefined;
    return def === undefined || activityOffered(def, state);
  }, (i) => i.kind === 'activity' && questWants(i.id, state));
  for (const i of buildInteractables(sampler, NPCS, ACTIVITIES, PICKUPS)) interactions.register(i);

  // Restore what the save says was already taken or lit.
  for (const p of PICKUPS) if (state.flags[`picked:${p.id}`]) world.setCollected(p.id);
  for (const p of PICKUPS) if (state.lanterns[p.id] !== undefined) world.setLanternLit(p.id);
  // And the posts the trail lit for Pip on the way home, if the radio has already spoken.
  const wayHome = createWayHome({
    state, pip: () => player.pos, mast: PEAK, talking: () => ui.dialogue.isOpen(), light: (id, flare) => world.setLanternLit(id, flare),
  });

  // The opening script (docs/ONBOARDING.md). Constructed with everything else; stepped from the
  // session's frame, which is the only place that knows dt and the input.
  const onboarding = createOnboardingScript({
    state, player, spawn, bus, ui, persist: () => { if (savesAllowed()) store.persist(); },
  });

  return {
    state, player, spawn, fresh, store, sampler, kit, pipeline, snowfall, world, markers, pip, prints,
    footprintTracker, rig, audio, ui, mech, onboarding, wayHome, interactions, bus, quests, achievements,
  };
}
