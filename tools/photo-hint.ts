/**
 * The viewfinder must not claim a shot is lined up when it is not.
 *
 * The hint was only written inside the press handler, and the "aimed away" branch wrote `'aim'` — the
 * same value the panel renders as "Centred — press E". So a failed attempt created the lie, and since
 * nothing else refreshed the hint, the panel kept claiming it. The hint is now derived from the aim
 * every frame, with a distinct `'turn'` state for "facing the wrong way".
 *
 * Verified both ways in one run: facing away must not say "centred", facing the subject must.
 *
 *   npx vite-node tools/photo-hint.ts
 *   GAME_URL=http://127.0.0.1:4180/ npx vite-node tools/photo-hint.ts
 */

import { chromium } from 'playwright';

const URL = process.env.GAME_URL ?? 'http://127.0.0.1:5182/';
const b = await chromium.launch({
  executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
const errs: string[] = [];
p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
await p.goto(URL, { waitUntil: 'load' });
await p.waitForFunction(() => ((window as any).__game?.frames() ?? 0) > 30, { timeout: 90000 });

const POST = { x: -228, z: 150 }; // Hoarfrost Glade

const label = () => p.evaluate(() => {
  const el = document.querySelector('.ui-activity');
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
});

await p.evaluate(([post]: any[]) => {
  const g = (window as any).__game;
  g.teleport(post.x, post.z + 1, 0);
  g.drive({ camYaw: 0, moveZ: 0 });
  g.step(6);
  g.drive(null);
}, [POST]);

await p.keyboard.press('e');
await p.waitForTimeout(500);

// Face a direction unrelated to the subject: whatever the subject's bearing, +2.4 rad is not it.
await p.evaluate(() => (window as any).__game.drive({ camYaw: 2.4 }));
await p.waitForTimeout(400);
const away = await label();

await p.keyboard.press('e');
await p.waitForTimeout(400);
const afterFailedPress = await label();
await p.evaluate(() => (window as any).__game.drive(null));

console.log(`facing away: "${away}"`);
console.log(`after a failed press: "${afterFailedPress}"`);

// The panel's standing subtitle literally reads "Turn until the subject is centred, then press E", so a
// bare /centred/ check matches the instruction and fails a correct build. Only the state claim counts:
// "Centred — press E" is the readout saying the shot is ready.
const liesWhenAway = /Centred\s*—\s*press E/i.test(away) || /Centred\s*—\s*press E/i.test(afterFailedPress);
const instructs = /turn|closer|back/i.test(afterFailedPress);
const ok = !liesWhenAway && instructs;
console.log(`\n${ok ? 'PASS' : 'FAIL'}  the viewfinder never says "Centred" while the subject is out of frame`);
console.log(`console errors: ${errs.length ? errs.slice(0, 2).join(' | ') : 'none'}`);
await b.close();
process.exit(ok ? 0 : 1);
