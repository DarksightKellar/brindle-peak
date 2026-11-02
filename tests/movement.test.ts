import { describe, expect, it } from 'vitest';
import { MAX_STEP_DT, makeRng } from '../src/core/contracts';
import { stepPlayer } from '../src/core/player/step';
import { TUNING } from '../src/core/player/tuning';
import { createInteractionSystem } from '../src/game/interactions';
import { FRAME, heightOf, input, makeEnv, spawn, wild } from './playerFixtures';

describe('time and space', () => {
  it('a 1.0 s frame equals 30 slices of MAX_STEP_DT and never teleports', () => {
    const env = makeEnv(), long = spawn(0), sliced = spawn(0);

    stepPlayer(long, input({ moveZ: 1 }), 1.0, TUNING, env);
    for (let i = 0; i < 30; i++) stepPlayer(sliced, input({ moveZ: 1 }), MAX_STEP_DT, TUNING, env);

    expect(long.pos.z).toBeCloseTo(sliced.pos.z, 6);
    expect(long.pos.y).toBeCloseTo(sliced.pos.y, 6);
    expect(Math.hypot(long.pos.x, long.pos.z)).toBeLessThan(40);
  });

  it('camera-relative input: camYaw PI/2 and moveZ +1 is +X', () => {
    const s = spawn(0), env = makeEnv();
    for (let i = 0; i < 20; i++) stepPlayer(s, input({ camYaw: Math.PI / 2, moveZ: 1 }), FRAME, TUNING, env);
    expect(s.pos.x).toBeGreaterThan(0.5);
    expect(Math.abs(s.pos.z)).toBeLessThan(0.01);
  });

  /*
   * Strafe direction. The test above only ever asserted FORWARD, so the strafe vector was free to be
   * mirrored — and it was: holding D walked left and holding A walked right. A player reported it
   * within seconds; the suite had never asked.
   *
   * The camera sits behind the player looking along `forward`. In a right-handed frame the screen-right
   * vector is `forward x up`, so for forward = (sin y, cos y) it is (-cos y, sin y). At camYaw = 0 the
   * camera looks toward +Z, which puts world -X on the screen's right.
   */
  it('camera-relative input: at camYaw 0, moveX +1 (D) is screen-right, i.e. -X', () => {
    const s = spawn(0), env = makeEnv();
    for (let i = 0; i < 20; i++) stepPlayer(s, input({ camYaw: 0, moveX: 1 }), FRAME, TUNING, env);
    expect(s.pos.x).toBeLessThan(-0.5);
    expect(Math.abs(s.pos.z)).toBeLessThan(0.01);
  });

  it('camera-relative input: at camYaw 0, moveX -1 (A) is screen-left, i.e. +X', () => {
    const s = spawn(0), env = makeEnv();
    for (let i = 0; i < 20; i++) stepPlayer(s, input({ camYaw: 0, moveX: -1 }), FRAME, TUNING, env);
    expect(s.pos.x).toBeGreaterThan(0.5);
    expect(Math.abs(s.pos.z)).toBeLessThan(0.01);
  });

  it('strafe is perpendicular to forward at every camera yaw', () => {
    // The general form of the bug: mirrored strafe still looks plausible at one yaw, so check the
    // basis stays orthonormal all the way round the circle.
    for (const yaw of [0, 0.7, Math.PI / 2, 2.2, Math.PI, 4.1, 5.6]) {
      const f = spawn(0), r = spawn(0), env = makeEnv();
      const fx0 = f.pos.x, fz0 = f.pos.z, rx0 = r.pos.x, rz0 = r.pos.z;
      for (let i = 0; i < 12; i++) {
        stepPlayer(f, input({ camYaw: yaw, moveZ: 1 }), FRAME, TUNING, env);
        stepPlayer(r, input({ camYaw: yaw, moveX: 1 }), FRAME, TUNING, env);
      }
      const fx = f.pos.x - fx0, fz = f.pos.z - fz0;
      const rx = r.pos.x - rx0, rz = r.pos.z - rz0;
      const dot = (fx * rx + fz * rz) / (Math.hypot(fx, fz) * Math.hypot(rx, rz));
      expect(Math.abs(dot)).toBeLessThan(0.05);
    }
  });

  it('is never below the terrain after any step', () => {
    const rng = makeRng(11), env = makeEnv({ sled: true }), s = spawn(2);
    for (let i = 0; i < 1500; i++) {
      stepPlayer(s, wild(rng), FRAME, TUNING, env);
      expect(s.pos.y).toBeGreaterThanOrEqual(heightOf(s.pos.x) - 1e-6);
    }
  });

  it('climbs a steep face and mantles onto the ledge', () => {
    const s = spawn(11.9, { max: 12 }); // stamina for a ~3 s climb
    const env = makeEnv();
    let mantled = false;
    for (let i = 0; i < 400; i++) {
      stepPlayer(s, input({ camYaw: Math.PI / 2, moveZ: 1 }), FRAME, TUNING, env); // climb toward +X
      if (s.mode === 'mantle') mantled = true;
      if (mantled && s.mode === 'ground') break;
    }
    expect(mantled).toBe(true);
    expect(s.mode).toBe('ground');
    expect(s.pos.x).toBeGreaterThan(16);
    expect(s.pos.y).toBeCloseTo(heightOf(s.pos.x) + 0.02, 5);
  });
});

describe('interactions', () => {
  it('returns the nearest in radius and prefers NPCs over pickups', () => {
    const sys = createInteractionSystem();
    sys.register({ kind: 'pickup', id: 'bell', pos: { x: 0, y: 0, z: 0 }, radius: 3, prompt: 'Take' });
    sys.register({ kind: 'npc', id: 'hollis', pos: { x: 0, y: 0, z: 0 }, radius: 3, prompt: 'Talk' });
    sys.register({ kind: 'npc', id: 'nana', pos: { x: 40, y: 0, z: 0 }, radius: 3, prompt: 'Talk' });
    expect(sys.update({ x: 0, y: 0, z: 0 })?.id).toBe('hollis');
    expect(sys.update({ x: 100, y: 0, z: 0 })).toBeNull();
    expect(sys.update({ x: 41, y: 0, z: 0 })?.id).toBe('nana');
  });
});
