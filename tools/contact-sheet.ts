/**
 * Captures one frame per zone, looking up the mountain, and reports the set-level palette verdict.
 *
 * A single spawn frame is a bad judge of a whole game: the hearth is a flat snowfield, the ridge is
 * rock in spindrift, the lake is a mirror. Judging a set is the only fair comparison to the seven
 * reference screenshots, which also vary enormously frame to frame.
 *
 *   node node_modules/vite/bin/vite.js build
 *   node node_modules/vite/bin/vite.js preview --port 4180 &
 *   npx vite-node tools/contact-sheet.ts
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { formatMetrics, type FrameMetrics } from '../src/core/imagemetrics';
import { judgeSet } from '../src/core/artgate';

const URL = process.env.GAME_URL ?? 'http://127.0.0.1:4180/';
const OUT = 'tools/shots/zones';
mkdirSync(OUT, { recursive: true });

const PEAK = { x: 330, z: -360 };
const POSES: ReadonlyArray<readonly [string, number, number]> = [
  ['hearth', -330, 330],
  ['pinewind', -230, 130],
  ['reach', 120, 380],
  ['kettles', -40, 60],
  ['hamlet', 250, 120],
  ['ridge', 240, -190],
  ['peak', 300, -320],
];

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => {
  const g = (window as unknown as { __game?: { frames(): number } }).__game;
  return !!g && g.frames() > 30;
}, { timeout: 60000 });

const metrics: FrameMetrics[] = [];
for (const [name, x, z] of POSES) {
  await page.evaluate(
    (arg: { x: number; z: number; facing: number }) => {
      const g = (window as unknown as {
        __game: { teleport(x: number, z: number, f: number): void; step(n: number, dt?: number): void };
      }).__game;
      g.teleport(arg.x, arg.z, arg.facing);
      g.step(45, 1 / 30); // let the camera spring settle
    },
    { x, z, facing: Math.atan2(PEAK.x - x, PEAK.z - z) },
  );
  await page.locator('#stage').screenshot({ path: `${OUT}/${name}.png` });
  const m = await page.evaluate(() => {
    const g = (window as unknown as { __game: { analyse(): FrameMetrics & { failures: string[] } } }).__game;
    return g.analyse();
  });
  metrics.push(m);
  console.log(`${name.padEnd(10)} ${formatMetrics(m)}`);
  if (m.failures.length) console.log(`           fail: ${m.failures.join('; ')}`);
}
await browser.close();

const set = judgeSet(metrics);
console.log(`\nSET  meanCool=${set.meanCool.toFixed(2)} meanWarm=${set.meanWarm.toFixed(2)} meanEdge=${set.meanEdge.toFixed(4)}`);
console.log(`     coolFrame=${set.hasCoolFrame} warmFrame=${set.hasWarmFrame} pass=${set.pass}`);
for (const n of set.notes) console.log(`     - ${n}`);
if (errors.length) console.log(`\npage errors: ${errors.slice(0, 3).join(' | ')}`);
process.exit(set.pass ? 0 : 1);
