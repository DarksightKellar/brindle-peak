/**
 * The game session: owns the state, the systems, and the frame order.
 *
 * Frame order is fixed and documented because it is the thing that breaks when this project is
 * extended carelessly:
 *
 *   input -> dialogue/activity routing -> player step -> zone + proximity -> camera -> world
 *         -> UI -> events (apply to state, then route to feedback) -> audio -> render
 *
 * Events are applied to GameState *before* they are routed to feedback, so a toast can never
 * announce something the state did not record.
 *
 * This file owns the order and nothing else. Each stage lives in its own module:
 *
 *   input routing      game/session/frameInput.ts      which press goes where while an overlay is up
 *   body + footsteps   game/session/playerAdvance.ts   step, clamp, collide, sfx
 *   state/UI/audio     game/session/frameFeedback.ts   mirror, events, HUD, audio, autosave
 *   teardown           game/session/dispose.ts         save first, then release
 *
 * The split is not cosmetic: the order above is the part that breaks when edited inside one long
 * function, and each module can now be read without the other systems in scope.
 */

import { Vector3 } from 'three';
import type { ActivityInstance, GameState, InputFrame, PlayerState, ZoneId } from './core/contracts';
import { emptyInput, MAX_STEP_DT } from './core/contracts';
import { PEAK, WORLD_SIZE } from './data/zones';
import { NPCS } from './data/npcs';
import { PICKUPS } from './data/pickups';
import { FISH } from './data/fish';
import { mountGoalMarker } from './game/world/goalMarker';
import { prepareViewFade, updateViewFade } from './game/render/viewFade';
import type { Collider } from './core/player/collide';
import { focusShadow } from './game/render/scene';
import { createFinale } from './game/session/finale';
import { createActivity } from './game/activities/index';
import { SkateActivity } from './game/activities/skate';
import { DIALOGUE as DIALOGUE_NODES } from './data/dialogue';
import { bootstrap } from './game/session/bootstrap';
import { createActivityRunner } from './game/session/activityRunner';
import { createFrameInput } from './game/session/frameInput';
import { createPolaroid, LENS } from './game/ui/polaroid';
import { setTuckRopeTied } from './game/world/tuckBridge';
import { setSteamLens } from './game/world/steam';
import { PHOTO_SUBJECTS } from './game/activities/photoSubjects';
import { WORDS } from './game/activities/activityWords';
import { advancePlayer } from './game/session/playerAdvance';
import { createSteepNudge, OFF_TRAIL_FAR, OFF_TRAIL_NEAR } from './game/session/steepNudge';
import { wayDistance } from './game/world/trail';
import { TUNING } from './core/player/tuning';
import { CLIMB_MIN_SLOPE } from './core/player/step';
import { pushFrame } from './game/session/frameFeedback';
import { disposeSession } from './game/session/dispose';
import { createDialogueFlow } from './game/session/dialogueFlow';
import { DIALOGUE_FILLS, DIALOGUE_SKIPS } from './data/dialogueFills';
import { createOverlayRouter } from './game/session/overlays';
import { interact as interactVerb, noteWalkOff } from './game/session/interactVerb';
import { SEATS, type SeatDef } from './data/seats';
import { inPickupRange, LANTERN_PASS } from './game/session/interact';
import { applyWorldRules } from './game/session/worldRules';
import type { CameraRig } from './game/camera/rig';
import { createCameraDirector } from './game/camera/director';
import { measureStructures } from './game/camera/structures';
import type { PixelPipeline } from './game/render/pixelPipeline';
import { savesAllowed } from './game/session/saveGuard';
import { createDuskStage } from './game/render/dusk';
import { createViewfinder } from './game/ui/viewfinder';
import { createPromptAnchor } from './game/ui/promptAnchor';
import { hopBlocked, hopPlaces, hopTo } from './game/session/travel';
import { ZONE_NAMES } from './data/zoneNames';
import { ACTIVITIES } from './data/activities';
import { createActivityGems } from './game/world/activityGems';
import { createPipGlow } from './game/render/pipGlow';

export interface Session {
  state: GameState;
  player: PlayerState;
  rig: CameraRig;
  /** The bird's own mesh and the camera that sees it. Exposed for measurement: colour matching cannot
   *  tell a brown bird from a brown fence, which is how a jump test reported a 112 px tall bird at 540p. */
  pip: { root: unknown };
  camera: unknown;
  pipeline: PixelPipeline;
  update(dt: number, input: InputFrame): void;
  interact(): void;
  advanceDialogue(): void;
  toggleJournal(): void;
  /** `M` — the field guide's map page. */
  toggleMap(): void;
  toggleMenu(): void;
  /** Escape routing: close whichever overlay is on top, else open the pause menu. */
  escape(): void;
  /** Write progress now. Called on pagehide so picks since the last autosave are not lost. */
  save(): void;
  setPixelSize(n: number): void;
  setVolume(master: number, music: number): void;
  isBlocking(): boolean;
  /** What has the screen: an overlay, an activity, or nothing (play). The touch controls show by it. */
  mode(): 'dialogue' | 'journal' | 'menu' | 'ending' | 'activity' | 'play';
  /** A tap at canvas pixel (x, y) is on whatever interact would reach now. */
  tapHits(x: number, y: number): boolean;
  /** What the player collides with. Exposed for the verification harness. */
  readonly colliders: readonly Collider[];
  /** Live footprint count, for the verification harness. */
  footprintCount(): number;
  /** The snow's height at a point, for the verification harness. */
  heightAt(x: number, z: number): number;
  destroy(): void;
}

export interface SessionOptions {
  canvas: HTMLCanvasElement;
  uiRoot: HTMLElement;
  /** Load a previous run if present. Off for the acceptance harness, which wants a clean start. */
  resume?: boolean;
}

export function createSession(opts: SessionOptions): Session {
  const b = bootstrap(opts);
  const {
    state, player, store, sampler, kit, pipeline, snowfall, world, markers, pip, prints,
    footprintTracker, rig, audio, ui, mech, onboarding, wayHome, interactions, bus,
  } = b;

  // Place sounds come from where things are in the world, and are heard from Pip, facing the camera's way.
  audio.setSoundWorld(world.sounds);
  const facing = new Vector3();

  let elapsed = 0;
  let ropeTied = false;
  // Day to blue hour once the mast quest is given; the one place time of day is decided (render/dusk.ts).
  const dusk = createDuskStage(kit, pipeline);
  const finder = createViewfinder(opts.uiRoot);
  // The shutter's picture, printed and kept for the journal (ui/polaroid.ts).
  const polaroid = createPolaroid(opts.uiRoot, opts.canvas);
  bus.on('photo:taken', (e) => {
    const id = String((e.data as { id: string }).id);
    // The print is of the valley, not of the aiming arrow over the deer: draw the frame once more
    // without the activity's guides before it is copied.
    markers.clear();
    pipeline.render();
    const subject = PHOTO_SUBJECTS[id];
    polaroid.take(id, WORDS.photoResult(subject?.what ?? 'view'), subject?.kind === 'ground' ? LENS : 1);
  });
  const promptAt = createPromptAnchor(kit.camera, opts.canvas, world.npcs);
  /** What interact would reach this frame; the touch tap test asks about it. */
  let reach: ReturnType<typeof interactions.update> = null;
  // The live instance, kept so its optional first-person view() can steer the camera rig.
  let live: ActivityInstance | null = null;

  // Non-modal opening card, fresh save only: it leaves on the first key or click.
  if (b.fresh) ui.intro.show();

  const flow = createDialogueFlow({
    dialogue: ui.dialogue, audio, npcs: NPCS, nodes: DIALOGUE_NODES,
    fill: (source) => DIALOGUE_FILLS[source]?.(state) ?? [],
    skip: (id) => DIALOGUE_SKIPS[id]?.(state) === true,
  });
  // Two-shots, the radio finale's staged shot, and when the ending card may show (camera/director.ts).
  const director = createCameraDirector({ rig, flow, ending: ui.ending, player, npcs: NPCS, terrain: sampler, mast: PEAK,
    goal: () => ui.hud.target(), bodies: world.npcs });
  const onFinale = createFinale(state, ui.ending, director);
  // Buildings the camera rises over; the mast is a lattice it looks through, Edda's hut 13 u off is not.
  rig.setStructures(measureStructures(world.group, world.colliders, (x, z) => Math.hypot(x - PEAK.x, z - PEAK.z) < 6));
  prepareViewFade(world.group); // see-through corners bound from the first draw (render/viewFade.ts)
  const steep = createSteepNudge();
  const runner = createActivityRunner({
    create: (def) => (live = createActivity(def, FISH)),
    // The dam's "to your left" is said against the side shot on screen, not the chase heading under it.
    hostFor: (instance, input) => ({ ...mech.hostFor(instance, input), viewYaw: rig.shotYaw() ?? rig.yaw() }),
    ui,
    markers,
    solids: world.colliders,
    cameraYaw: () => rig.yaw(),
    // A throw turns Pip to its aim; the camera swings round behind so the target is in view.
    faceTo: (yaw) => {
      player.facing = yaw;
      rig.turnToward(yaw);
    },
  });
  const overlays = createOverlayRouter({
    ui, state, isActivityRunning: () => runner.isRunning(),
    // A photo's print is a result card too: the first Esc sends it away with the panel, not to the menu.
    dismissActivityResult: () => {
      const card = runner.dismissResult();
      return polaroid.dismiss() || card;
    },
  });
  // The map's hop back to walked ground (session/travel.ts). The journal closes and Pip stands there.
  ui.journal.setTravel({
    places: (s) => hopPlaces(s).map((zone) => ({ zone, name: ZONE_NAMES[zone] })),
    blocked: (s) => hopBlocked(s, runner.isRunning() || flow.isOpen()),
    go: (zone) => {
      ui.journal.toggle(state);
      hopTo(zone as ZoneId, player, (x, z) => sampler.heightAt(x, z));
      // Arrived, not walked: recorded here so the frame's zone check sees no change (core/progress).
      if (state.zone !== zone) {
        state.zone = zone as ZoneId;
        bus.emit('zone:entered', { id: zone as ZoneId, byMap: true });
      }
      rig.settle(player.facing);
      audio.sfx('ui');
    },
  });
  // Guarded: reset suppresses writes before it clears the key, or the pagehide save rewrites the run.
  const persist = (): void => {
    if (savesAllowed()) store.persist();
  };

  /**
   * The bench Pip is sitting on, if any (data/seats.ts). Pip sits on the bench's own spot, facing its
   * view, with breath full, and stays perched until a move or a jump.
   */
  let seated: SeatDef | null = null;
  const sit = (id: string): void => {
    const seat = SEATS.find((x) => x.id === id);
    if (!seat) return;
    seated = seat;
    player.pos.x = seat.pos.x;
    player.pos.z = seat.pos.z;
    player.pos.y = sampler.heightAt(seat.pos.x, seat.pos.z);
    player.vel.x = player.vel.y = player.vel.z = 0;
    player.facing = seat.yaw;
    player.stamina = player.maxStamina;
    rig.settle(seat.yaw);
    flow.think(seat.thought(state));
  };
  const interact = (): void => interactVerb({ state, player, bus, mech, world, interactions, flow, runner, sit });
  const routeInput = createFrameInput({ ui, flow, runner, interact, state });
  mountGoalMarker({ scene: kit.scene, sampler, camera: kit.camera, hud: ui.hud, busy: () => runner.isRunning() });
  // Things to do nearby, not yet done: a small green gem over each (world/activityGems.ts).
  const gems = createActivityGems(sampler, ACTIVITIES);
  kit.scene.add(gems.object);
  // Nana's lantern lights Pip and the snow round it after dark (render/pipGlow.ts).
  const glow = createPipGlow(kit.scene);

  // An activity or a conversation under way last frame, to see one begin.
  let wasBusy = false;
  const update = (raw: number, input: InputFrame): void => {
    const dt = Math.min(raw, MAX_STEP_DT * 4);
    elapsed += dt;
    state.playtime += dt;

    // Press routing lives in frameInput.ts: the order (ending, menu/journal, dialogue, world) is the
    // part that breaks when it is edited in the middle of a 115-line function.
    const blocked = routeInput(input, dt);
    // A print still up goes when the journal or the menu opens: critic round 87 read the Quests page under it.
    // So does one still up when the next activity starts or someone starts talking: critic round 89 had the
    // steam print over the Otter Slide's start and over Ivy's first lines.
    const busyNow = runner.isRunning() || flow.isOpen();
    if (ui.journal.isOpen() || ui.menu.isOpen() || (busyNow && !wasBusy)) polaroid.dismiss();
    wasBusy = busyNow;

    // Any move or jump gets Pip up off the bench; until then Pip stays put on it.
    if (seated && !blocked && (Math.hypot(input.moveX, input.moveZ) > 0.2 || input.jumpPressed)) seated = null;
    const gusting = state.zone === 'ridge' && elapsed % 9 < 3;
    const before = { x: player.pos.x, z: player.pos.z };
    // Movement is emptied behind an overlay, but look is not: see the camera note further down.
    advancePlayer({
      player,
      input: blocked ? emptyInput(rig.yaw()) : input,
      dt,
      elapsed,
      sampler,
      abilities: state.abilities,
      gusting,
      worldSize: WORLD_SIZE,
      colliders: world.colliders,
      sfx: (name) => audio.sfx(name),
    });

    // The first climb says what is happening: critic round 24 never learned it, and got up the ridge
    // foot by holding W and jumping until something worked.
    if (player.mode === 'climb' && state.flags['taught:climb'] !== true) {
      state.flags['taught:climb'] = true;
      bus.emit('toast', { text: 'Climbing: keep pushing into the face. It spends breath, and letting go drops you.', icon: 'mountain', tier: 'discovery' });
    }
    if (!blocked && dt > 0) {
      const pushing = Math.hypot(input.moveX, input.moveZ) > 0.5 && player.mode !== 'sled';
      const ahead = sampler.sampleAt(player.pos.x + Math.sin(player.facing) * 0.7, player.pos.z + Math.cos(player.facing) * 0.7);
      const speed = Math.hypot(player.pos.x - before.x, player.pos.z - before.z) / dt;
      // Out of breath the climb only twitches (a frame up, then off), so it counts whether grounded or not.
      const into = !pushing ? null
        : player.grounded && ahead.slope > TUNING.climbMaxSlope ? 'wall'
        : ahead.slope > CLIMB_MIN_SLOPE && player.stamina < 1 ? 'breath'
        : null;
      const fromTrail = into === 'breath' ? wayDistance(player.pos.x, player.pos.z) : 0;
      const said = steep.update(dt, into, speed, fromTrail >= OFF_TRAIL_NEAR && fromTrail <= OFF_TRAIL_FAR);
      if (said) bus.emit('toast', { text: said, icon: 'mountain', tier: 'discovery' });
    }

    runner.update(dt, input);
    if (runner.breathFree()) player.stamina = player.maxStamina;
    onboarding.update(dt, input); // before the flush: a beat's payout lands on its own frame

    const sample = sampler.sampleAt(player.pos.x, player.pos.z);

    // Springs, zone changes, the summit and the ending are content rules; they live in worldRules.ts so they can
    // be read without the renderer, the audio kit or the UI in scope.
    applyWorldRules({
      state, player, bus, sampler, worldSize: WORLD_SIZE,
      onZoneChange: () => {
        rig.forcePullBack();
        persist();
      },
      // Counted as the homecoming talk with Nana opens; the card waits until it has closed.
      onFinale,
    });

    if (!blocked) {
      for (const p of PICKUPS) {
        if (p.kind === 'lantern') {
          // "Light them as you pass": carrying the lantern, walking by a post lights it. The critic was
          // never asked to light one, because the Light prompt only showed standing right at the post.
          if (state.abilities.lantern && state.lanterns[p.id] === undefined && !wayHome.lit(p.id)
            && Math.hypot(player.pos.x - p.pos.x, player.pos.z - p.pos.z) < LANTERN_PASS) {
            state.lanterns[p.id] = 1;
            world.setLanternLit(p.id, true);
            bus.emit('lantern:lit', { id: p.id, lit: Object.keys(state.lanterns).length });
          }
          continue;
        }
        if (state.flags[`picked:${p.id}`]) continue;
        // Something with a price is bought with E (interactVerb.ts), never by walking onto it.
        if (p.price === undefined && inPickupRange(player.pos, p, sampler.heightAt(p.pos.x, p.pos.z))) mech.collect(p.id, p.kind);
      }
    }

    noteWalkOff(state, player.pos);
    const nearest = blocked ? null : interactions.update(player.pos);
    reach = nearest;
    focusShadow(kit, player.pos.x, player.pos.z);
    footprintTracker.follow(player, dt);
    // A hop by the map (or anything else that carries Pip off) leaves the bench behind.
    if (seated && Math.hypot(player.pos.x - seated.pos.x, player.pos.z - seated.pos.z) > 1) seated = null;
    if (seated) {
      // Held on the seat: the wind on the ridge foot or a slope's creep must not slide Pip off it.
      player.pos.x = seated.pos.x;
      player.pos.z = seated.pos.z;
      player.facing = seated.yaw;
    }
    // On the ice Pip's body tips the way the balance does (activities/skate.ts).
    const tip = runner.isRunning() && live instanceof SkateActivity ? live.balance : 0;
    pip.sync(player, dt, state.abilities.lantern, seated ? seated.height : 0, tip);
    // Look (Q/R) works during an activity, not under menus or dialogue. A conversation (or an activity's
    // subject) is framed with Pip; a photo's viewfinder takes the camera to Pip's eye. Reduce-motion snaps eases.
    const overlayOpen = ui.dialogue.isOpen() || ui.journal.isOpen() || ui.menu.isOpen();
    const view = runner.isRunning() ? live?.view?.() ?? null : null;
    rig.setAim(view);
    const reduced = document.documentElement.dataset.reduceMotion === 'on';
    director.update(dt, reduced);
    wayHome.update(dt, reduced); // after Edda signs off, the posts light the way home
    // Tuck reties the bridge with Bram's rope at the talk that takes it from Pip.
    const rope = state.quests['tuck-rope'];
    const tied = rope !== undefined && (rope.status === 'complete' || rope.step >= 1);
    if (tied !== ropeTied) {
      ropeTied = tied;
      setTuckRopeTied(world.group, tied);
    }
    if (runner.focus()) rig.setFocus(runner.focus());
    rig.update(dt, player, sampler, overlayOpen ? 0 : input.lookX, reduced);
    pip.root.visible = rig.viewBlend() < 0.8; // the camera is inside the bird by then
    finder.update(rig.viewBlend(), view?.centred === true);
    setSteamLens(rig.viewBlend());
    kit.aurora.setLens(rig.viewBlend());
    // After the rig has placed the camera: fade whatever now stands between it and the bird.
    updateViewFade(kit.camera, player.pos);
    gems.update(dt, state, player.pos, kit.camera, !overlayOpen && !runner.isRunning());
    // After the rig, pinned over its target's head (ui/promptAnchor.ts); hidden while an activity runs,
    // and while F still waits after a talk (frameInput.ts `resting`): a prompt up is one a press acts on.
    const shown = runner.isRunning() || routeInput.resting() ? null : nearest;
    ui.hud.setPrompt(shown ? shown.prompt : null, shown ? promptAt(shown) : null);
    world.update(dt, elapsed);

    const weather =
      sample.zone === 'ridge' ? (gusting ? 'gust' : 'snow') : sample.zone === 'pinewind' ? 'snow' : 'calm';
    // Snow by place: heavy in the wood and on the ridge, where gusts blow it sideways; steady elsewhere.
    const heavySnow = sample.zone === 'ridge' || sample.zone === 'pinewind';
    pipeline.setSnow(snowfall.update(dt, gusting ? 2.4 : 0.6, heavySnow ? 2 : 1));

    // State first, then feedback, then the save decision — the ordering rule lives in frameFeedback.ts.
    ui.hud.setViewYaw(view ? view.yaw : rig.yaw());
    ui.hud.setCourse(runner.isRunning() ? live?.compassTarget?.() ?? null : null);
    pushFrame({ state, player, ui, mech, audio, store, persist, blocked, weather }, dt);
    const look = dusk.update(dt, state, elapsed);
    audio.setPlace(sample.zone, look.dusk);
    kit.camera.getWorldDirection(facing);
    audio.setListener(player.pos.x, player.pos.y, player.pos.z, facing.x, facing.z);
    glow.update(player.pos, look.dusk, state.abilities.lantern);
    pipeline.render();
  };

  const unlock = (): void => audio.unlock();
  opts.canvas.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  ui.menu.onSetPixelSize((n) => pipeline.setPixelSize(n));
  ui.menu.onSetVolume((master, music) => audio.setVolume(master, music));

  return {
    state,
    player,
    rig,
    pip,
    camera: kit.camera,
    pipeline,
    update,
    interact,
    advanceDialogue: flow.advance,
    toggleJournal: overlays.toggleJournal,
    toggleMap: overlays.toggleMap,
    toggleMenu: overlays.toggleMenu,
    // Escape belongs to the pause menu; the script never blocks movement, so it has nothing to escape.
    escape: overlays.escape,
    save: persist,
    setPixelSize: (n) => pipeline.setPixelSize(n),
    setVolume: (m, mu) => audio.setVolume(m, mu),
    isBlocking: () => ui.dialogue.isOpen() || ui.journal.isOpen() || ui.menu.isOpen()
      || ui.ending.isOpen() || runner.isRunning(),
    mode: () => (ui.ending.isOpen() ? 'ending' : ui.menu.isOpen() ? 'menu' : ui.journal.isOpen() ? 'journal'
      : ui.dialogue.isOpen() ? 'dialogue' : runner.isRunning() ? 'activity' : 'play'),
    tapHits: (x, y) => reach !== null && !runner.isRunning() && promptAt.hit(reach, x, y),
    colliders: b.world.colliders,
    footprintCount: () => prints.count(),
    heightAt: (x, z) => sampler.heightAt(x, z),
    destroy: (): void => {
      polaroid.destroy();
      disposeSession({ persist, world, prints, snowfall, pipeline, audio, ui });
    },
  };
}
