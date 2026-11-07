/**
 * Time of day, in one place: when the valley turns to blue hour, and what that does to the stage.
 *
 * The story ends with a photo of the aurora, and the aurora only shows after dark. So once the mast
 * quest is under way (active or done) the whole valley eases from day to dusk over about a minute of
 * play, and the aurora rises with it from about twenty seconds in. Loading a save past that point
 * starts at dusk outright: the first update snaps rather than easing, so nobody watches the sun set
 * again every time they come back.
 *
 * The rule (`duskWanted`) and the clock are plain numbers; the stage below is the only code that writes
 * the result into the lights, the sky dome, the aurora and the composite's fog. Shaders only render it.
 */
import * as THREE from 'three';
import type { GameState } from '../../core/contracts';
import { DAY_LIGHT, DUSK, FOG, GRADE, SKY, SKY_HIGH } from './pixelConfig';
import type { SceneKit } from './scene';
import { sunDirection } from './sky';
import { createSnowSurface } from './snowSurface';

/** Seconds of play from day to full dusk. */
export const DUSK_SECONDS = 60;
/** Seconds into the change before the aurora starts to show. */
export const AURORA_DELAY = 20;

export interface DuskLook {
  /** 0 = day, 1 = blue hour, eased. */
  dusk: number;
  /** 0..1 aurora strength, eased; trails the dusk by AURORA_DELAY. */
  aurora: number;
}

/** The content rule: dusk once the last quest has been given. */
export function duskWanted(state: Readonly<GameState>): boolean {
  const s = state.quests['the-mast']?.status;
  return s === 'active' || s === 'complete';
}

const smooth = (t: number): number => {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
};
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export interface DuskClock {
  update(dt: number, wanted: boolean): DuskLook;
}

export function createDuskClock(): DuskClock {
  let progress = -1; // linear 0..1; -1 until the first frame says where the save stands
  return {
    update(dt, wanted): DuskLook {
      const goal = wanted ? 1 : 0;
      if (progress < 0) progress = goal;
      const by = Math.max(0, dt) / DUSK_SECONDS;
      progress = goal > progress ? Math.min(goal, progress + by) : Math.max(goal, progress - by);
      const after = (progress * DUSK_SECONDS - AURORA_DELAY) / (DUSK_SECONDS - AURORA_DELAY);
      return { dusk: smooth(progress), aurora: smooth(after) };
    },
  };
}

/** Day and dusk endpoints, parsed once. */
const C = (hex: string): THREE.Color => new THREE.Color(hex);
const KEY = [C(DAY_LIGHT.key), C(DUSK.key)] as const;
const RIM = [C(DAY_LIGHT.rim), C(DUSK.rim)] as const;
const SKY_TERM = [C(DAY_LIGHT.ambientSky), C(DUSK.ambientSky)] as const;
const GROUND_TERM = [C(DAY_LIGHT.ambientGround), C(DUSK.ambientGround)] as const;
const BACKGROUND = [C(SKY.zenith), C(DUSK.zenith)] as const;
const FOG_TINT = [C(FOG.color), C(DUSK.fog)] as const;
// The far fade lands on the sky's own horizon, so distant hills meet the sky at every hour.
const FAR_TINT = [C(SKY.horizon), C(DUSK.horizon)] as const;
const HIGH_ZENITH = C(SKY_HIGH.zenith);

export interface FogSink {
  setFogColor(haze: THREE.Color, far: THREE.Color): void;
  setLook?(look: { saturation?: number; sun?: number }): void;
}

/**
 * The grade's saturation at blue hour. Dusk light is low in chroma, so at the day's 2.6 the snow in the
 * shade of a street went lavender-grey and critic round 70 read the hamlet as pale mist. A little more
 * at dusk keeps the snow blue and the wood warm. (A lower shadow lift was tried first: no visible change.)
 */
const DUSK_SATURATION = 3.1;

export interface DuskStage {
  /** Advance the clock from game state and write the result into the stage. Once per frame, after the camera. */
  update(dt: number, state: Readonly<GameState>, time: number): DuskLook;
}

export function createDuskStage(kit: SceneKit, pipeline: FogSink): DuskStage {
  const clock = createDuskClock();
  const fog = new THREE.Color();
  const distant = new THREE.Color();
  let applied = -1, height = -1;
  const surface = createSnowSurface();

  // h: how high the camera is, 0 valley .. 1 summit (SKY_HIGH). The day sky deepens with it; blue
  // hour is already deep, so dusk takes over from it.
  const apply = (t: number, h: number): void => {
    const [key, rim] = kit.lights;
    if (key) {
      key.color.copy(KEY[0]).lerp(KEY[1], t);
      key.intensity = mix(DAY_LIGHT.keyIntensity, DUSK.keyIntensity, t);
    }
    if (rim) {
      rim.color.copy(RIM[0]).lerp(RIM[1], t);
      rim.intensity = mix(DAY_LIGHT.rimIntensity, DUSK.rimIntensity, t);
    }
    kit.ambient.color.copy(SKY_TERM[0]).lerp(SKY_TERM[1], t);
    kit.ambient.groundColor.copy(GROUND_TERM[0]).lerp(GROUND_TERM[1], t);
    kit.ambient.intensity = mix(DAY_LIGHT.ambientIntensity, DUSK.ambientIntensity, t);
    sunDirection(mix(SKY.sunElevation, DUSK.sunElevation, t), kit.keyDir);
    if (kit.scene.background instanceof THREE.Color) {
      kit.scene.background.copy(BACKGROUND[0]).lerp(HIGH_ZENITH, h).lerp(BACKGROUND[1], t);
    }
    kit.sky.setDusk(t, h);
    // The far peak lives in the world (it needs the terrain); it recolours itself if it is there.
    const far = kit.scene.getObjectByName('far-peak')?.userData.setDusk as ((k: number) => void) | undefined;
    far?.(t);
    pipeline.setFogColor(fog.copy(FOG_TINT[0]).lerp(FOG_TINT[1], t), distant.copy(FAR_TINT[0]).lerp(FAR_TINT[1], t));
    // No sun at blue hour for the falling flakes to catch; the lanterns still give them a little.
    pipeline.setLook?.({ saturation: mix(GRADE.saturation, DUSK_SATURATION, t), sun: mix(1, 0.25, t) });
  };

  return {
    update(dt, state, time): DuskLook {
      const look = clock.update(dt, duskWanted(state));
      kit.sky.follow(kit.camera.position);
      kit.aurora.set(look.aurora, time);
      const h = smooth((kit.camera.position.y - SKY_HIGH.from) / (SKY_HIGH.to - SKY_HIGH.from));
      // Lights and the dome only change while the dusk or the height is moving; a settled valley
      // costs nothing. Height is stepped in hundredths so walking on the flat never re-bakes the dome.
      const step = Math.round(h * 100) / 100;
      if (look.dusk !== applied || step !== height) {
        applied = look.dusk;
        height = step;
        apply(look.dusk, step);
      }
      surface.update(kit.scene, kit.keyDir, look.dusk);
      return look;
    },
  };
}
