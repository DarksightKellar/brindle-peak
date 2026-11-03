/**
 * Builds every on-screen surface and the mapping tables the reward router needs.
 *
 * Separated from the session so that "what the player sees" and "what the game does" can be read
 * independently. Nothing here mutates game state.
 */

import { ACHIEVEMENTS } from '../../data/achievements';
import { FISH } from '../../data/fish';
import { PICKUPS } from '../../data/pickups';
import { ACTIVITIES } from '../../data/activities';
import { NPCS } from '../../data/npcs';
import { QUESTS } from '../../data/quests';
import { PLACES } from '../../data/places';
import { WORLD_SIZE, ZONES } from '../../data/zones';
import { ZONE_NAMES } from '../../data/zoneNames';
import type { GuideContent } from '../../core/guide/nextStep';
import { createHud, type Hud } from '../ui/hud';
import { createToasts, type Toasts } from '../ui/toasts';
import { createDialogue, type DialogueView } from '../ui/dialogue';
import { createJournal, type Journal } from '../ui/journal';
import { createActivityHud, type ActivityHud } from '../ui/activityHud';
import { createEnding, type Ending } from '../ui/ending';
import { createIntro, type Intro } from '../ui/intro';
import { createTutorial, type Tutorial } from '../ui/tutorial';
import { createMenu, type Menu } from '../ui/menu';
import { SAVE_KEY } from './persistence';
import type { AudioKit } from '../audio/audio';
import type { Naming, RouterDeps } from './router';
import { suppressSaves } from './saveGuard';
import { LANDMARKS, TRAIL } from '../world/landmarks';
import { VIEW_H, VIEW_W, worldX, worldZ, type MapDecor } from '../ui/journalMap';
import { ICE_SURFACE_Y } from '../world/water';
import { traceRelief } from '../ui/mapRelief';
import { forgetPhotos, keptPhotos } from '../ui/polaroid';
import { ITEMS } from '../../data/items';

/** Every photo viewpoint: the journal's prints and the reset's clean-up both read this. */
const PHOTO_IDS = ACTIVITIES.filter((a) => a.kind === 'photo').map((a) => a.id);

export interface Presentation {
  hud: Hud;
  toasts: Toasts;
  dialogue: DialogueView;
  journal: Journal;
  menu: Menu;
  activity: ActivityHud;
  ending: Ending;
  intro: Intro;
  tutorial: Tutorial;
  router: RouterDeps;
}

const inZone = (id: string, x: number, z: number): boolean =>
  ZONES.some((zn) => zn.id === id && Math.hypot(x - zn.centre.x, z - zn.centre.z) < zn.radius);

/** The map's land and fixed places, traced from the terrain on first use and kept. */
function mapDecorFrom(heightAt: (x: number, z: number) => number): () => MapDecor {
  let decor: MapDecor | null = null;
  const at = (id: string): { x: number; z: number } => {
    const l = LANDMARKS.find((m) => m.id === id);
    return l ? { x: l.x, z: l.z } : { x: 0, z: 0 };
  };
  return () => {
    decor ??= {
      relief: traceRelief({
        heightAt, width: VIEW_W, height: VIEW_H, cell: 5, interval: 3,
        // Inside the valley only: past its edge the heightfield just repeats its last row, which drew the
        // lake on past the south shore and off the bottom of the frame.
        keep: (x, z) => Math.max(Math.abs(x), Math.abs(z)) <= WORLD_SIZE / 2
          && ZONES.some((zn) => Math.hypot(x - zn.centre.x, z - zn.centre.z) < zn.radius * 1.1),
        toWorldX: worldX,
        toWorldZ: worldZ,
        // The lake is the Reach's low ground; low ground elsewhere is just a hollow.
        wet: (x, z, height) => height < ICE_SURFACE_Y && inZone('reach', x, z),
      }),
      trail: TRAIL,
      home: at('station'),
      goal: at('mast'),
    };
    return decor;
  };
}

export function createPresentation(uiRoot: HTMLElement, audio: AudioKit, heightAt: (x: number, z: number) => number): Presentation {
  /*
   * One table for the field guide, shared by the HUD's next-step line and the map's objective pin, so
   * the two can never point at different things (docs/GUIDE.md §2). Positions come from the same
   * authored data the world is built from — no parallel coordinate list.
   */
  const guide: GuideContent = {
    quests: QUESTS, npcs: NPCS, activities: ACTIVITIES, zones: ZONES, places: PLACES, zoneNames: ZONE_NAMES,
  };

  const hud = createHud(uiRoot, guide);
  const toasts = createToasts(uiRoot);
  const dialogue = createDialogue(uiRoot);
  const menu = createMenu(uiRoot, () => {
    // Order is the whole fix. The reload fires `pagehide`, which saves; without the gate first, the
    // unload hook writes the run back over the key we just deleted and reset looks like it did nothing.
    suppressSaves();
    localStorage.removeItem(SAVE_KEY);
    forgetPhotos(PHOTO_IDS);
    location.reload();
  });
  const journal = createJournal(uiRoot, {
    quests: QUESTS,
    achievements: ACHIEVEMENTS,
    fish: FISH,
    lanternsTotal: PICKUPS.filter((p) => p.kind === 'lantern').length,
    pickups: PICKUPS,
    photosTotal: PHOTO_IDS.length,
    items: ITEMS,
    prints: () => keptPhotos(PHOTO_IDS).map((p) => ({ ...p, caption: ACTIVITIES.find((a) => a.id === p.id)?.name ?? '' })),
    // Live read-out: the Settings tab reports the menu's actual controls, not a captured default.
    settings: () => menu.readSettings(),
    map: guide,
    mapDecor: mapDecorFrom(heightAt),
  });
  const activity = createActivityHud(uiRoot);
  const ending = createEnding(uiRoot);
  const intro = createIntro(uiRoot);
  const tutorial = createTutorial(uiRoot);

  const naming: Naming = {
    zone: (id) => ZONE_NAMES[id as keyof typeof ZONE_NAMES] ?? id,
    quest: (id) => QUESTS.find((q) => q.id === id)?.title ?? id,
    // An errand says it is one: a bare title read like a place name, and errands started unnoticed.
    questStarted: (id) => {
      const def = QUESTS.find((q) => q.id === id);
      return def?.main === true ? def.title : `New errand: ${def?.title ?? id}`;
    },
    achievement: (id) => ACHIEVEMENTS.find((a) => a.id === id)?.name ?? id,
  };

  return {
    hud,
    toasts,
    dialogue,
    journal,
    menu,
    activity,
    ending,
    intro,
    tutorial,
    router: {
      toasts,
      audio,
      naming,
      featherTotal: PICKUPS.filter((p) => p.kind === 'feather').length,
      lanternTotal: PICKUPS.filter((p) => p.kind === 'lantern').length,
    },
  };
}
