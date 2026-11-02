/**
 * Captures the spike at 1920x1080, DPR 1, from the running dev server. Every look/weather variant
 * is applied through `window.__artspike`, so the frames come from the real shader path — no
 * re-implementation of the grade anywhere in the capture step.
 *
 * Run: npx vite-node tools/artspike/capture.ts --tag sat2.6 --look saturation=2.6 --snow 0
 *   --tag    filename stem; writes <out>/<tag>-pose<N>-px5.png
 *   --look   comma list of saturation|lift|split|fog numbers
 *   --snow   1 (default) or 0 — the A/B for the speckle check
 *   --out    directory (default tools/shots)
 *   --poses  comma list of pose indices (default 0,1,2,3)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? (argv[i + 1] as string) : fallback;
};

const tag = arg('tag', 'artspike');
const out = resolve(arg('out', 'tools/shots'));
const snow = arg('snow', '1') !== '0';
const poses = arg('poses', '0,1,2,3').split(',').map((n) => Number(n));

const look: Record<string, number> = {};
for (const pair of arg('look', '').split(',').filter(Boolean)) {
  const [k, v] = pair.split('=');
  const key = k === 'split' ? 'splitTonality' : k === 'fog' ? 'fogDensity' : k;
  if (key && v !== undefined) look[key] = Number(v);
}

mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await page.goto('http://127.0.0.1:5180/tools/artspike.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__artspike !== undefined);

await page.evaluate(
  (a: { look: Record<string, number>; snow: boolean }) => {
    const api = window.__artspike;
    if (!api) throw new Error('artspike: no QA seam');
    if (Object.keys(a.look).length > 0) api.setLook(a.look);
    api.setSnow(a.snow);
  },
  { look, snow },
);

for (const pose of poses) {
  // setPose rebuilds scene state, so the weather flag is re-applied per pose.
  await page.evaluate((a: { pose: number; snow: boolean }) => {
    const api = window.__artspike;
    if (!api) throw new Error('artspike: no QA seam');
    api.setPose(a.pose);
    api.setSnow(a.snow);
    if (typeof api.setWeatherTime === 'function') api.setWeatherTime(3);
  }, { pose, snow });
  // Two frames: the pose change re-seeds the weather, then the composite renders it.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const canvas = await page.$('#stage');
  if (!canvas) throw new Error('artspike: #stage missing');
  const file = `${out}/${tag}-pose${pose}-px5.png`;
  await canvas.screenshot({ path: file });
  console.log(file);
}

if (errors.length > 0) {
  console.error(`console errors:\n${errors.join('\n')}`);
  process.exitCode = 1;
}
await browser.close();
