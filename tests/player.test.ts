import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/contracts';
import type { PlayerState } from '../src/core/contracts';
import { stepPlayer } from '../src/core/player/step';
import { TUNING } from '../src/core/player/tuning';
import { FRAME, input, makeEnv, spawn, wild } from './playerFixtures';

describe('flaps', () => {
  /*
   * The player's report: "make it so that the character can continue to flop until the stamina is
   * finished". The old rule was a count — three beats — with stamina as a second, invisible gate. There
   * is now one resource and no count: you flap until you are tired. This test asserts the count, because
   * a count is what would silently come back.
   */
  it('flaps until the stamina is gone, not to a count', () => {
    const s = spawn(0, { y: 30, grounded: false });
    const env = makeEnv();
    const limit = Math.floor(TUNING.staminaMaxBase / TUNING.drainFlap);
    let flaps = 0;
    for (let i = 0; i < limit + 6; i++) {
      stepPlayer(s, input({ jumpPressed: true, jumpHeld: true }), FRAME, TUNING, env);
      flaps = Math.max(flaps, s.flapsUsed);
    }
    expect(flaps).toBe(limit);
    expect(flaps).toBeGreaterThan(4);
    expect(s.stamina).toBeLessThan(TUNING.drainFlap);
  });

  it('resets the count on landing', () => {
    const s = spawn(0, { y: 8, grounded: false });
    const env = makeEnv();
    stepPlayer(s, input({ jumpPressed: true }), FRAME, TUNING, env);
    for (let i = 0; i < 120; i++) stepPlayer(s, input(), FRAME, TUNING, env);
    expect(s.grounded).toBe(true);
    expect(s.flapsUsed).toBe(0);
  });

  /*
   * "more forward momentum, more forwards movement from flapping should not cancel out the forward
   * momentum". Air used to approach the velocity toward the input vector every frame, so releasing the
   * stick mid-flight braked the bird to nothing and a flap bought height but no distance.
   */
  it('a flap does not cancel forward momentum', () => {
    const env = makeEnv();
    const s = spawn(0);
    for (let i = 0; i < 70; i++) stepPlayer(s, input({ moveZ: 1, sprintHeld: true }), FRAME, TUNING, env);
    const carried = Math.hypot(s.vel.x, s.vel.z);
    expect(carried).toBeGreaterThan(6);

    stepPlayer(s, input({ jumpPressed: true, moveZ: 1 }), FRAME, TUNING, env);
    // Flap with no directional input at all: the bird must keep going forward.
    stepPlayer(s, input({ jumpPressed: true }), FRAME, TUNING, env);
    const after = Math.hypot(s.vel.x, s.vel.z);
    expect(after).toBeGreaterThanOrEqual(carried * 0.9);
  });

  it('a flap carries the bird further forward than the glide alone', () => {
    const env = makeEnv();
    const run = (flap: boolean): number => {
      const s = spawn(0, { y: 30, grounded: false });
      s.vel.z = 7;
      const z0 = s.pos.z;
      for (let i = 0; i < 18; i++) stepPlayer(s, input({ jumpPressed: flap && i === 0 }), FRAME, TUNING, env);
      return Math.abs(s.pos.z - z0);
    };
    expect(run(true)).toBeGreaterThan(run(false));
  });

  it('a jump spends the same stamina the flap and the sprint spend', () => {
    const s = spawn(0);
    const env = makeEnv();
    stepPlayer(s, input({ jumpPressed: true, jumpHeld: true }), FRAME, TUNING, env);
    expect(s.grounded).toBe(false);
    expect(s.stamina).toBeCloseTo(TUNING.staminaMaxBase - TUNING.drainJump, 6);
  });
});

describe('stamina', () => {
  it('never leaves [0, maxStamina] across 5000 random frames', () => {
    const rng = makeRng(0x5eed), env = makeEnv({ sled: true }), s = spawn(0);
    for (let i = 0; i < 5000; i++) {
      stepPlayer(s, wild(rng), FRAME, TUNING, env);
      expect(s.stamina).toBeGreaterThanOrEqual(0);
      expect(s.stamina).toBeLessThanOrEqual(s.maxStamina);
    }
  });

  it('reports exhausted on the frame the bar empties', () => {
    const s = spawn(0, { stamina: 0.05 });
    s.sinceSpend = 0; // no regen for 0.35 s, so the drain empties the bar
    let fired = false;
    for (let i = 0; i < 6; i++) {
      fired = stepPlayer(s, input({ moveX: 1, sprintHeld: true }), FRAME, TUNING, makeEnv()).exhausted || fired;
    }
    expect([s.stamina, fired]).toEqual([0, true]);
  });

  it('regens to the gust floor, and the floor is worth a flap (GDD R6)', () => {
    const floor = TUNING.staminaMaxBase * TUNING.staminaFloorRatio;
    expect(floor).toBeGreaterThanOrEqual(TUNING.drainFlap);

    const s = spawn(2, { stamina: 0 });
    const env = makeEnv({}, true);
    for (let i = 0; i < 60; i++) stepPlayer(s, input(), 1 / 30, TUNING, env);
    expect(s.soaking).toBe(true);
    expect(s.stamina).toBeGreaterThanOrEqual(floor);
    expect(s.stamina).toBeGreaterThanOrEqual(TUNING.drainFlap);
    expect(s.stamina).toBeLessThanOrEqual(s.maxStamina);
  });
});

describe('jump forgiveness', () => {
  const walkOff = (): PlayerState => {
    // Exactly one jump's worth: the press can still be a jump but can never become a flap, which is
    // the condition this test needs. (It was stamina 0 until jump started costing stamina too.)
    const s = spawn(21.5, { stamina: TUNING.drainJump });
    const env = makeEnv();
    // Toward +X by heading, not by strafe sign: strafe direction is its own tested quantity now.
    for (let i = 0; i < 200 && s.grounded; i++) stepPlayer(s, input({ camYaw: Math.PI / 2, moveZ: 1 }), FRAME, TUNING, env);
    expect(s.grounded).toBe(false);
    return s;
  };

  it('coyote time: works inside 0.12 s, refused after', () => {
    const env = makeEnv();
    const inside = walkOff();
    for (let i = 0; i < 3; i++) stepPlayer(inside, input({ camYaw: Math.PI / 2, moveZ: 1 }), FRAME, TUNING, env); // toward +X, off the ledge
    stepPlayer(inside, input({ jumpPressed: true }), FRAME, TUNING, env);
    // 9.0 minus one slice of gravityRise: the impulse and the first slice of fall share a step
    expect(inside.vel.y).toBeGreaterThan(TUNING.jumpSpeed - 1);
    expect(inside.grounded).toBe(false);

    const late = walkOff();
    for (let i = 0; i < 12; i++) stepPlayer(late, input({ camYaw: Math.PI / 2, moveZ: 1 }), FRAME, TUNING, env);
    stepPlayer(late, input({ jumpPressed: true }), FRAME, TUNING, env);
    expect(late.vel.y).toBeLessThan(0);
  });

  it('jump buffer: a press before landing fires on landing', () => {
    // stamina 0: the press cannot become a flap, which is the case the buffer exists for
    const s = spawn(0, { y: 2, grounded: false, stamina: 0 });
    const env = makeEnv();
    let pressed = false;
    let jumped = false;
    for (let i = 0; i < 60; i++) {
      const press = !pressed && s.pos.y < 0.25;
      if (press) pressed = true;
      stepPlayer(s, input({ jumpPressed: press }), FRAME, TUNING, env);
      if (s.vel.y > TUNING.jumpSpeed - 1) jumped = true;
    }
    expect(pressed).toBe(true);
    expect(jumped).toBe(true);
  });
});

describe('air verbs', () => {
  it('glide caps fall speed at glideFallSpeed and costs no stamina', () => {
    const s = spawn(0, { y: 8, grounded: false, stamina: 2 });
    const env = makeEnv();
    for (let i = 0; i < 30; i++) stepPlayer(s, input({ jumpHeld: true }), FRAME, TUNING, env);
    expect(s.mode).toBe('glide');
    expect(s.vel.y).toBeCloseTo(-TUNING.glideFallSpeed, 6);
    expect(s.stamina).toBeGreaterThanOrEqual(2); // regen may raise it; a glide never lowers it
  });

  it('sled engages only with the ability, downhill, on a real slope', () => {
    const env = makeEnv({ sled: true });
    const ramp = spawn(10);
    for (let i = 0; i < 3; i++) stepPlayer(ramp, input({ camYaw: -Math.PI / 2, moveZ: 1 }), FRAME, TUNING, env); // toward -X, downhill
    expect(ramp.mode).toBe('sled');

    const noAbility = spawn(10);
    const plain = makeEnv();
    for (let i = 0; i < 3; i++) stepPlayer(noAbility, input({ camYaw: -Math.PI / 2, moveZ: 1 }), FRAME, TUNING, plain);
    expect(noAbility.mode).not.toBe('sled');

    const flat = spawn(0);
    for (let i = 0; i < 3; i++) stepPlayer(flat, input({ camYaw: -Math.PI / 2, moveZ: 1 }), FRAME, TUNING, env);
    expect(flat.mode).not.toBe('sled');
  });
});

describe('ground too steep to climb', () => {
  it('sheds Pip downhill instead of holding the bird wedged on it (critic round 21, Nettle Chimney)', () => {
    // A face of gradient 8 (slope about 0.88), past the climb limit, rising toward +x from x = 0.
    const face = (x: number): number => (x > 0 ? x * 8 : 0);
    const n = (x: number) => {
      const g = (face(x + 0.05) - face(x - 0.05)) / 0.1;
      const len = Math.hypot(g, 1);
      return { x: -g / len, y: 1 / len, z: 0 };
    };
    const env = {
      ...makeEnv(),
      terrain: {
        size: 400,
        heightAt: (x: number) => face(x),
        normalAt: (x: number) => n(x),
        sampleAt: (x: number) => ({ height: face(x), slope: 1 - n(x).y, surface: 'snow' as const, zone: 'peak' as const }),
      },
    };
    expect(1 - n(1).y).toBeGreaterThan(TUNING.climbMaxSlope);
    // Whichever way the stick pushes, up the face included, Pip comes off it.
    for (const push of [{ moveX: 1 }, { moveX: -1 }, { moveZ: 1 }, { moveZ: -1 }]) {
      const s = spawn(0, { y: face(1) + 0.02 });
      s.pos.x = 1;
      for (let i = 0; i < 180; i++) stepPlayer(s, input(push), FRAME, TUNING, env);
      expect(s.pos.x).toBeLessThan(0.2);
      expect(s.pos.y).toBeLessThan(1);
    }
  });
});
