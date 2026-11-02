/**
 * FIRST SNOW — the player step. Pure: no three, no DOM, no clock, no randomness.
 *
 * INPUT-YAW CONVENTION (asserted in tests/movement.test.ts): camYaw = 0 looks toward
 * +Z, and `PlayerState.facing` shares that convention.
 *     forward = ( sin(camYaw),  cos(camYaw))     right = ( cos(camYaw), -sin(camYaw))
 *     world   = forward * moveZ + right * moveX  // moveZ = +1 is away from the camera
 * At camYaw = PI/2, moveZ = +1 therefore moves the player toward +X.
 *
 * SUBSTEPPING: a frame longer than MAX_STEP_DT is split into equal slices, so a call cannot
 * tunnel a wall or skip a landing. `jumpPressed` is an edge: only the first slice sees it,
 * so one press cannot buy two jumps or three flaps. Time per call is capped at MAX_FRAME.
 * MODE ORDER PER SLICE: mantle → climb → sled → jump/flap → ground | air → land.
 */

import { MAX_STEP_DT, angleDelta, clamp } from '../contracts';
import type { InputFrame, PlayerEnvironment, PlayerState, PlayerTuning, StepPlayer } from '../contracts';
import { toWorld } from './move';
import { applyAirControl, applyGlide } from './airControl';

const GROUND_OFFSET = 0.02; // feet rest this far above the sampled surface
const PROBE = 0.7; // how far ahead the wall and ledge probe looks
const CLIMB_MIN_SLOPE = 0.35; // above this a face needs the climb verb, not walking
const SLED_MIN_SLOPE = 0.25; // below this a sled is just a tray
const MANTLE_FORWARD = 1.0; // how far past the lip a mantle carries the body
const MAX_FRAME = 1.0; // hard cap on simulated seconds per call

/** Jump-hold seconds per state. `PlayerState` is frozen and has no field for it, so a
 *  WeakMap keeps the timer per player without touching the contract. Glide gate only. */
const holdFor = new WeakMap<PlayerState, number>();

interface Tally { landed: boolean; exhausted: boolean; zoneChanged: boolean; zone: string }

const approach = (v: number, target: number, maxDelta: number): number =>
  Math.abs(target - v) <= maxDelta ? target : v + Math.sign(target - v) * maxDelta;

const setVel = (s: PlayerState, x: number, y: number, z: number): void => {
  s.vel.x = x; s.vel.y = y; s.vel.z = z;
};

/** Ledge grab: store a flat velocity that carries the body up and forward over 0.25 s. */
const startMantle = (s: PlayerState, nx: number, nz: number, T: PlayerTuning, env: PlayerEnvironment): void => {
  const tx = s.pos.x + nx * MANTLE_FORWARD;
  const tz = s.pos.z + nz * MANTLE_FORWARD;
  const ty = env.terrain.heightAt(tx, tz) + GROUND_OFFSET;
  s.mode = 'mantle'; s.grounded = false; s.mantleTimer = T.mantleDuration;
  setVel(s, (tx - s.pos.x) / T.mantleDuration, Math.max(0, ty - s.pos.y) / T.mantleDuration,
    (tz - s.pos.z) / T.mantleDuration);
};

function slice(
  state: PlayerState, input: InputFrame, dt: number, T: PlayerTuning,
  env: PlayerEnvironment, tally: Tally,
): void {
  const terrain = env.terrain;
  const here = terrain.sampleAt(state.pos.x, state.pos.z);
  const inp = toWorld(input, state);
  const nx = inp.mag > 1e-4 ? inp.x / inp.mag : 0, nz = inp.mag > 1e-4 ? inp.z / inp.mag : 0;
  const pressing = inp.mag > 0.25;
  const hSpeed = Math.hypot(state.vel.x, state.vel.z);

  state.jumpBuffer = input.jumpPressed ? T.jumpBufferTime : Math.max(0, state.jumpBuffer - dt);
  state.coyote = state.grounded ? T.coyoteTime : Math.max(0, state.coyote - dt);
  holdFor.set(state, input.jumpHeld ? (holdFor.get(state) ?? 0) + dt : 0);
  const held = holdFor.get(state) ?? 0;

  if (state.sinceSpend >= T.regenDelay) {
    const rate = state.soaking ? T.regenSoak : state.grounded && hSpeed < 0.4 ? T.regenIdle : T.regenMoving;
    const cap = env.gusting ? Math.max(state.maxStamina * T.staminaFloorRatio, state.stamina) : state.maxStamina;
    state.stamina = Math.min(state.stamina + rate * dt, cap); // a gust can only cap, never drain
  }
  state.sinceSpend += dt;

  // `partial` drains take whatever is left so stamina lands on exactly zero (and on the
  // exhausted flag); discrete costs like a flap still need the full price in the bar.
  const spend = (amount: number, partial = false): boolean => {
    if (partial ? state.stamina <= 0 : state.stamina < amount) return false;
    const was = state.stamina;
    state.stamina = Math.max(0, state.stamina - Math.min(amount, state.stamina));
    state.sinceSpend = 0;
    if (state.stamina === 0 && was > 0) tally.exhausted = true;
    return true;
  };

  if (inp.mag > 0.1) state.facing = Math.atan2(nx, nz);

  // ---- mantle: steering locked, the body rides the velocity stored at the grab ----
  if (state.mode === 'mantle') {
    state.mantleTimer -= dt;
    state.pos.x += state.vel.x * dt;
    state.pos.y += state.vel.y * dt;
    state.pos.z += state.vel.z * dt;
    if (state.mantleTimer <= 0) {
      state.mantleTimer = 0; state.mode = 'ground'; state.grounded = true;
      setVel(state, 0, 0, 0);
      state.pos.y = terrain.heightAt(state.pos.x, state.pos.z) + GROUND_OFFSET;
    }
    return;
  }

  // ---- climb -------------------------------------------------------------------------
  const ahead = terrain.sampleAt(state.pos.x + nx * PROBE, state.pos.z + nz * PROBE);
  const face = pressing && ahead.slope > CLIMB_MIN_SLOPE && ahead.slope <= T.climbMaxSlope
    && ahead.height - here.height > T.stepHeight;

  if (state.mode === 'climb' || (face && state.stamina > 0 && state.mode !== 'sled')) {
    if (ahead.slope <= CLIMB_MIN_SLOPE) {
      startMantle(state, nx, nz, T, env); // the face ran out: pull up, no stamina cost
      return;
    }
    if (!pressing || !spend(T.drainClimb * dt, true)) {
      state.mode = 'air'; state.grounded = false; setVel(state, 0, 0, 0);
      return;
    }
    // The gradient of the *face* sets how much of the upward step also pushes into it.
    const n = terrain.normalAt(state.pos.x + nx * PROBE, state.pos.z + nz * PROBE);
    const tan = Math.sqrt(Math.max(0, 1 / Math.max(1e-3, n.y * n.y) - 1));
    const up = T.climbSpeed * dt;
    state.pos.x += nx * (up / Math.max(0.5, tan));
    state.pos.z += nz * (up / Math.max(0.5, tan));
    state.pos.y = Math.max(state.pos.y + up, terrain.heightAt(state.pos.x, state.pos.z) + GROUND_OFFSET);
    state.grounded = false; state.mode = 'climb'; setVel(state, 0, T.climbSpeed, 0);
    return;
  }

  // ---- sled --------------------------------------------------------------------------
  const nrm = terrain.normalAt(state.pos.x, state.pos.z);
  const dl = Math.hypot(nrm.x, nrm.z);
  const dhx = dl > 1e-4 ? nrm.x / dl : 0; // downhill is the normal's horizontal part
  const dhz = dl > 1e-4 ? nrm.z / dl : 0;
  const downhill = state.vel.x * dhx + state.vel.z * dhz > 0.3 || nx * dhx + nz * dhz > 0.3;
  const canSled = env.abilities.sled && state.grounded && here.slope > SLED_MIN_SLOPE && downhill;

  if (state.mode === 'sled' && !canSled) state.mode = 'ground';
  if (state.mode === 'sled' || canSled) {
    const build = T.sledSpeed * 0.7 + T.downhillBias * here.slope; // steepness feeds speed
    const spd = Math.min(T.sledSpeed, Math.max(hSpeed, 1.5) + build * dt);
    const steer = Math.abs(input.moveX) > 0.1
      ? input.moveX * T.sledSteer * 0.5
      : angleDelta(state.facing, Math.atan2(dhx, dhz)) * 0.9; // otherwise coast into the fall line
    state.mode = 'sled'; state.grounded = true; state.vel.y = 0;
    state.facing += steer * dt;
    state.vel.x = Math.sin(state.facing) * spd;
    state.vel.z = Math.cos(state.facing) * spd;
    state.pos.x += state.vel.x * dt; state.pos.z += state.vel.z * dt;
    state.pos.y = terrain.heightAt(state.pos.x, state.pos.z) + GROUND_OFFSET;
    return;
  }

  // ---- jump (coyote + buffer), then flap ----------------------------------------------
  if (state.jumpBuffer > 0 && state.coyote > 0 && spend(T.drainJump)) {
    state.vel.y = T.jumpSpeed; state.grounded = false; state.mode = 'air';
    state.jumpBuffer = 0; state.coyote = 0; state.flapsUsed = 0;
  } else if (input.jumpPressed && !state.grounded && spend(T.drainFlap)) {
    /*
     * No count cap. Stamina is the only limit, so a bird that still has breath can still beat its
     * wings — the old three-flap ceiling was a second, invisible rule on top of the bar, which made
     * "keep flapping until you are tired" impossible to feel.
     *
     * The beat is also a push: wings drive the body forward as well as up. Adding it here rather than
     * only lifting means a flap bought distance, not just height.
     */
    state.vel.y = Math.max(state.vel.y, 0) + T.flapSpeed;
    state.vel.x += Math.sin(state.facing) * T.flapForward;
    state.vel.z += Math.cos(state.facing) * T.flapForward;
    state.flapsUsed += 1; state.jumpBuffer = 0; state.mode = 'air';
  }

  // ---- ground ------------------------------------------------------------------------
  const sprinting = state.grounded && env.abilities.sprint && input.sprintHeld && inp.mag > 0.2
    && spend(T.drainSprint * dt, true);
  const top = sprinting ? T.sprintSpeed : T.walkSpeed;
  const wantX = nx * top * inp.mag;
  const wantZ = nz * top * inp.mag;

  if (state.grounded) {
    const grip = here.surface === 'ice' ? T.frictionIce : 1; // ice takes 6.7x longer to bite
    const rate = (Math.hypot(wantX, wantZ) > 0.05 ? top / T.groundAccelTime : top / T.groundDecelTime) * grip;
    state.vel.x = approach(state.vel.x, wantX, rate * dt);
    state.vel.z = approach(state.vel.z, wantZ, rate * dt);
    const px = state.pos.x, pz = state.pos.z;
    state.pos.x += state.vel.x * dt; state.pos.z += state.vel.z * dt;
    const dest = terrain.sampleAt(state.pos.x, state.pos.z);
    if (dest.height - state.pos.y > T.stepHeight || (dest.slope > CLIMB_MIN_SLOPE && dest.height > state.pos.y)) {
      state.pos.x = px; // a face, not a step: refuse the move, let the climb verb answer
      state.pos.z = pz;
      setVel(state, 0, 0, 0);
    } else if (state.pos.y - dest.height > T.stepHeight) {
      state.grounded = false; // a ledge, not a slope: start falling inside the coyote window
      state.mode = 'air';
      state.coyote = T.coyoteTime;
      state.vel.y = 0;
      return;
    } else {
      state.pos.y = dest.height + GROUND_OFFSET;
    }
    state.vel.y = 0; state.mode = 'ground'; state.flapsUsed = 0;
    return;
  }

  // ---- air: asymmetric gravity, glide, landing ---------------------------------------
  state.mode = 'air';
  state.vel.y -= (state.vel.y > 0 ? T.gravityRise : T.gravityFall) * dt;
  const motion = { wantX, wantZ, mag: inp.mag, held, dt, tuning: T };
  applyAirControl(state, motion);
  applyGlide(state, motion);

  state.pos.x += state.vel.x * dt;
  state.pos.y += state.vel.y * dt;
  state.pos.z += state.vel.z * dt;

  const gy = terrain.heightAt(state.pos.x, state.pos.z) + GROUND_OFFSET;
  if (state.pos.y <= gy) {
    state.pos.y = gy; state.grounded = true; state.mode = 'ground';
    state.flapsUsed = 0; state.coyote = T.coyoteTime; tally.landed = true;
    state.vel.y = state.jumpBuffer > 0 ? T.jumpSpeed : 0; // a buffered press lands as a jump
    if (state.jumpBuffer > 0) {
      state.grounded = false; state.mode = 'air'; state.jumpBuffer = 0; state.coyote = 0;
    }
  }
}

export const stepPlayer: StepPlayer = (state, input, dt, tuning, env) => {
  const zone0 = env.terrain.sampleAt(state.pos.x, state.pos.z).zone;
  const tally: Tally = { landed: false, exhausted: false, zoneChanged: false, zone: zone0 };
  const frame = clamp(dt, 0, MAX_FRAME);
  const slices = Math.max(1, Math.ceil(frame / MAX_STEP_DT - 1e-9));
  const h = frame / slices;
  const later: InputFrame = { ...input, jumpPressed: false };

  for (let i = 0; i < slices; i++) {
    slice(state, i === 0 ? input : later, h, tuning, env, tally);
    const s = env.terrain.sampleAt(state.pos.x, state.pos.z);
    if (s.zone !== tally.zone) { tally.zone = s.zone; tally.zoneChanged = true; }
    state.soaking = state.grounded && s.surface === 'spring';
    state.stamina = clamp(state.stamina, 0, state.maxStamina);
    const gy = env.terrain.heightAt(state.pos.x, state.pos.z) + GROUND_OFFSET;
    if (state.pos.y < gy) state.pos.y = gy; // the only respawn there is: never below snow
  }

  return { events: [], zoneChanged: tally.zoneChanged, landed: tally.landed, exhausted: tally.exhausted };
};
