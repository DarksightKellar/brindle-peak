/**
 * Headless smoke test: boot the real game, verify it runs, drive scripted input, capture frames.
 *
 * This is the gate that no unit test can replace — it proves the whole stack wires together and
 * renders. Run with the preview server already up:
 *   node node_modules/vite/bin/vite.js build
 *   node node_modules/vite/bin/vite.js preview --port 4180 &
 *   npx vite-node tools/smoke.ts
 */
import { chromium, type ConsoleMessage } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.GAME_URL ?? 'http://127.0.0.1:4180/';
const OUT = 'tools/shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

const errors: string[] = [];
page.on('console', (m: ConsoleMessage) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(URL, { waitUntil: 'load' });

const booted = await page
  .waitForFunction(() => {
    const g = (window as unknown as { __game?: { frames(): number } }).__game;
    return !!g && g.frames() > 45;
  }, { timeout: 45000 })
  .then(() => true)
  .catch(() => false);

const probe = await page.evaluate(() => {
  const g = (window as unknown as {
    __game: {
      frames(): number;
      session: {
        player: { pos: { x: number; y: number; z: number }; stamina: number; maxStamina: number; grounded: boolean };
        state: { zone: string; feathers: number; bells: number; playtime: number };
      };
    };
  }).__game;
  const p = g.session.player;
  return {
    frames: g.frames(),
    pos: { ...p.pos },
    stamina: p.stamina,
    maxStamina: p.maxStamina,
    grounded: p.grounded,
    zone: g.session.state.zone,
    playtime: g.session.state.playtime,
  };
});

await page.locator('#stage').screenshot({ path: `${OUT}/game-00-spawn.png` });

// Drive forward for 3 seconds of game time, then jump.
const moved = await page.evaluate(async () => {
  const g = (window as unknown as {
    __game: {
      drive(f: Record<string, number | boolean> | null): void;
      step(n: number, dt?: number): void;
      session: { player: { pos: { x: number; z: number }; stamina: number; flapsUsed: number } };
    };
  }).__game;
  const before = { ...g.session.player.pos };
  g.drive({ moveZ: 1 });
  for (let i = 0; i < 180; i++) g.step(1);
  const afterWalk = { ...g.session.player.pos };
  g.drive({ moveZ: 1, jumpPressed: true, jumpHeld: true });
  for (let i = 0; i < 20; i++) g.step(1);
  const staminaAfter = g.session.player.stamina;
  const flaps = g.session.player.flapsUsed;
  g.drive(null);
  return {
    dx: Math.hypot(afterWalk.x - before.x, afterWalk.z - before.z),
    staminaAfter,
    flaps,
  };
});

await page.locator('#stage').screenshot({ path: `${OUT}/game-01-walked.png` });

// Let it settle with live input for a moment, then look at a second vantage.
await page.evaluate(() => {
  const g = (window as unknown as { __game: { step(n: number): void } }).__game;
  g.step(30);
});
await page.locator('#stage').screenshot({ path: `${OUT}/game-02-settled.png` });

await browser.close();

const checks: Array<[string, boolean, string]> = [
  ['boots and renders frames', booted, `${probe.frames} frames`],
  ['no console errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none'],
  ['player is on the ground at spawn', probe.grounded, String(probe.grounded)],
  ['player is inside the world', Math.abs(probe.pos.x) < 512 && Math.abs(probe.pos.z) < 512, `${probe.pos.x.toFixed(1)}, ${probe.pos.z.toFixed(1)}`],
  ['walking moves the player', moved.dx > 5, `${moved.dx.toFixed(1)} units`],
  ['flap consumed stamina', moved.staminaAfter < probe.stamina, `${probe.stamina.toFixed(2)} -> ${moved.staminaAfter.toFixed(2)}`],
  ['flap registered', moved.flaps > 0, `${moved.flaps} flaps`],
  ['playtime advances', probe.playtime > 0, `${probe.playtime.toFixed(2)}s`],
];

let ok = true;
for (const [name, pass, detail] of checks) {
  if (!pass) ok = false;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
}
console.log(`\nzone=${probe.zone} stamina=${probe.stamina.toFixed(2)}/${probe.maxStamina} shots in ${OUT}/`);
process.exit(ok ? 0 : 1);
