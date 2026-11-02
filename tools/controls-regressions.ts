/**
 * Regression checks for the controls, after the first real play test.
 *
 * Every check here corresponds to something a player hit and reported: A and D mirrored, holding a
 * strafe drawing a circle, walking through fences/rocks/trees/buildings, the camera diving into the
 * character under a tree, and a sprint that looked identical to a walk. Unit tests could not catch any
 * of them — they are browser-and-input phenomena, not function contracts — so they live here, driven
 * against the running game with the real controller.
 *
 *   npx vite-node tools/controls-regressions.ts          # dev server on :5182
 *   GAME_URL=http://127.0.0.1:4180/ npx vite-node tools/controls-regressions.ts
 *
 * The dev server is the default because `__game.setViewFade` and the collider list are debug seams.
 *
 * Two habits are baked in, both learned the hard way in this project:
 *  - A collision check must prove the player WALKED TOWARD the obstacle and stopped. "Ended up 19 u
 *    away" passes a naive assertion while proving only that they never arrived.
 *  - A visual check must measure the thing the feature changes. A whole-frame warm-pixel count caught
 *    amber brush across the scene and reported a 624 px-wide "bird"; the bird window is ~220x160 at
 *    frame centre.
 */

import { chromium } from 'playwright';
import { checkVisuals } from './lib/controls-visual';

const URL = process.env.GAME_URL ?? 'http://127.0.0.1:5182/';
const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;

interface Result { name: string; pass: boolean; detail: string }

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => ((window as any).__game?.frames() ?? 0) > 30, { timeout: 90_000 });

/**
 * Wait for the canvas to actually be redrawn.
 *
 * `__game.step()` advances the simulation without rendering — the canvas is painted by the rAF loop.
 * Reading pixels straight after a step can sample the previous frame, which made a silhouette measure
 * report 34x12 for a bird that is 142x98 on screen.
 */
const painted = (): Promise<void> => page.evaluate(() =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));

const results: Result[] = [];
const check = (name: string, pass: boolean, detail: string): void => { results.push({ name, pass, detail }); };

const walk = async (
  x: number, z: number, camYaw: number, frame: Record<string, unknown>, frames: number,
): Promise<{ x: number; z: number; speed: number }> => page.evaluate(([px, pz, yaw, f, n]: any[]) => {
  const g = (window as any).__game;
  g.teleport(px, pz, yaw);
  g.drive({ camYaw: yaw, ...f });
  g.step(n);
  g.drive(null);
  const s = g.session.player;
  return { x: s.pos.x, z: s.pos.z, speed: Math.hypot(s.vel.x, s.vel.z) };
}, [x, z, camYaw, frame, frames]);

// --- 1. strafe is not mirrored -------------------------------------------------------------
const right = await walk(0, 0, 0, { moveX: 1 }, 30);
check('D walks screen-right (-X at camYaw 0)', right.x < -1.5 && Math.abs(right.z) < 0.5,
  `dx=${right.x.toFixed(2)} dz=${right.z.toFixed(2)}`);
const left = await walk(0, 0, 0, { moveX: -1 }, 30);
check('A walks screen-left (+X at camYaw 0)', left.x > 1.5 && Math.abs(left.z) < 0.5,
  `dx=${left.x.toFixed(2)} dz=${left.z.toFixed(2)}`);

// --- 2. a held strafe is a straight line ---------------------------------------------------
const path = await page.evaluate(() => {
  const g = (window as any).__game;
  g.teleport(-260, 300, 0);
  g.drive({ camYaw: 0, moveX: -1 });
  const pts: Array<{ x: number; z: number }> = [];
  for (let i = 0; i < 6; i++) {
    g.step(30);
    const s = g.session.player;
    pts.push({ x: s.pos.x, z: s.pos.z });
  }
  g.drive(null);
  return pts;
});
const bearings = path.slice(1).map((pt, i) =>
  (Math.atan2(pt.x - path[i].x, pt.z - path[i].z) * 180) / Math.PI);
const spread = Math.max(...bearings) - Math.min(...bearings);
const travelled = Math.hypot(path[5].x - path[0].x, path[5].z - path[0].z);
check('held A travels straight, not in a circle', spread < 10 && travelled > 15,
  `bearing spread ${spread.toFixed(1)} deg over ${travelled.toFixed(1)} u`);

// --- 3. sprint is twice the walk and has colliders ------------------------------------------
const walkPace = await walk(-300, 320, 0, { moveZ: 1 }, 60);
const sprintPace = await walk(-300, 320, 0, { moveZ: 1, sprintHeld: true }, 60);
check('sprint is at least double walk', sprintPace.speed > walkPace.speed * 1.9,
  `walk ${walkPace.speed.toFixed(2)} u/s, sprint ${sprintPace.speed.toFixed(2)} u/s`);

const picked = await page.evaluate(() => {
  const list = (window as any).__game.colliders() as any[];
  return {
    circle: list.find((c) => c.kind === 'circle' && c.r > 0.6),
    box: list.find((c) => c.kind === 'box' && c.hw > 1.5 && c.hd > 1.5),
    seg: list.find((c) => c.kind === 'segment'),
    total: list.length,
  };
});
check('the world has colliders at all', picked.total > 500, `${picked.total} built`);

// --- 4. you cannot walk through a tree, a building or a fence -------------------------------
const intoCircle = await page.evaluate(([c]: any[]) => {
  const g = (window as any).__game;
  g.teleport(c.x + c.r + 4, c.z, -Math.PI / 2);
  g.drive({ camYaw: -Math.PI / 2, moveZ: 1 });
  g.step(240);
  g.drive(null);
  const s = g.session.player;
  return { dist: Math.hypot(s.pos.x - c.x, s.pos.z - c.z), need: c.r + 0.42 };
}, [picked.circle]);
check('cannot walk through a tree or rock',
  intoCircle.dist >= intoCircle.need - 0.05 && intoCircle.dist < intoCircle.need + 0.6,
  `stopped ${intoCircle.dist.toFixed(2)} u out, collider needs ${intoCircle.need.toFixed(2)}`);

const intoBox = await page.evaluate(([box]: any[]) => {
  const g = (window as any).__game;
  g.teleport(box.x + box.hw + 5, box.z, -Math.PI / 2);
  g.drive({ camYaw: -Math.PI / 2, moveZ: 1 });
  g.step(300);
  g.drive(null);
  const s = g.session.player;
  return {
    inside: Math.abs(s.pos.x - box.x) < box.hw + 0.37 && Math.abs(s.pos.z - box.z) < box.hd + 0.37,
    dx: s.pos.x - box.x, hw: box.hw,
  };
}, [picked.box]);
check('cannot walk through a building', intoBox.inside === false,
  `ended ${intoBox.dx.toFixed(2)} u from centre, half-width ${intoBox.hw.toFixed(2)}`);

const intoFence = await page.evaluate(([seg]: any[]) => {
  const g = (window as any).__game;
  const mx = (seg.ax + seg.bx) / 2;
  const mz = (seg.az + seg.bz) / 2;
  const len = Math.hypot(seg.bx - seg.ax, seg.bz - seg.az);
  const nx = -(seg.bz - seg.az) / len;
  const nz = (seg.bx - seg.ax) / len;
  const sx = mx + nx * 4;
  const sz = mz + nz * 4;
  const yaw = Math.atan2(-nx, -nz);
  g.teleport(sx, sz, yaw);
  g.drive({ camYaw: yaw, moveZ: 1 });
  g.step(240);
  g.drive(null);
  const s = g.session.player;
  const vx = seg.bx - seg.ax, vz = seg.bz - seg.az;
  let t = ((s.pos.x - seg.ax) * vx + (s.pos.z - seg.az) * vz) / (vx * vx + vz * vz);
  t = Math.max(0, Math.min(1, t));
  const qx = seg.ax + vx * t, qz = seg.az + vz * t;
  return {
    dist: Math.hypot(s.pos.x - qx, s.pos.z - qz), need: seg.r + 0.42,
    moved: Math.hypot(s.pos.x - sx, s.pos.z - sz),
  };
}, [picked.seg]);
check('cannot walk through a fence',
  intoFence.dist >= intoFence.need - 0.05 && intoFence.dist < intoFence.need + 0.6 && intoFence.moved > 2,
  `walked ${intoFence.moved.toFixed(2)} u and stopped ${intoFence.dist.toFixed(2)} u from the rail`);

// --- 5 and 6. what the screen shows: tree fade, sprint pose, no mouse look ----------------
await checkVisuals(page, check, painted);

await browser.close();

for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}\n        ${r.detail}`);
if (errors.length) console.log(`\nconsole errors: ${errors.slice(0, 3).join(' | ')}`);
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed === 0 ? 0 : 1);
