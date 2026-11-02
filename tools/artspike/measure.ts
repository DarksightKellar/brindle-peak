/**
 * Speckle + metric readout for captured frames. Same instrument as tools/compare-frames.ts, plus
 * the isolated-highlight and contrast-speck counts that answer "is that snow or a dead pixel?".
 *
 * Run: npx vite-node tools/artspike/measure.ts <image> [image...]
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { analyseFrame } from '../../src/core/imagemetrics';
import { countContrastSpecks, countIsolatedHighlights } from '../../src/game/render/pixelConfig';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: measure.ts <image> [image...]');
  process.exit(2);
}

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas>');

console.log(
  'frame'.padEnd(30) + 'p1'.padStart(7) + 'p50'.padStart(7) + 'min'.padStart(7) +
    'S50'.padStart(7) + 'cool'.padStart(6) + 'warm'.padStart(6) + 'blown'.padStart(7) +
    'edge'.padStart(8) + 'iso'.padStart(5) + 'specks'.padStart(7),
);

for (const file of files) {
  const b64 = readFileSync(file).toString('base64');
  // Raw bytes as base64: serialising 8.3M numbers per frame through evaluate takes ~20 s.
  const out = await page.evaluate(async (arg: { data: string }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${arg.data}`;
    await img.decode();
    const c = document.getElementById('c') as HTMLCanvasElement;
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, img.width, img.height).data;
    let s = '';
    for (let i = 0; i < d.length; i += 0x8000) {
      s += String.fromCharCode(...Array.from(d.subarray(i, i + 0x8000)));
    }
    return { w: img.width, h: img.height, b64: btoa(s) };
  }, { data: b64 });
  const rgba = new Uint8Array(Buffer.from(out.b64, 'base64'));
  const m = analyseFrame(rgba, out.w, out.h);
  // step = block size: one internal pixel is a 5x5 block at 1920 wide.
  const iso = countIsolatedHighlights(rgba, out.w, out.h, { step: 5 });
  const specks = countContrastSpecks(rgba, out.w, out.h, { step: 5 });
  console.log(
    basename(file).slice(0, 29).padEnd(30) +
      m.p1.toFixed(3).padStart(7) + m.p50.toFixed(3).padStart(7) + m.min.toFixed(3).padStart(7) +
      m.satP50.toFixed(3).padStart(7) +
      `${Math.round(m.coolShare * 100)}%`.padStart(6) + `${Math.round(m.warmShare * 100)}%`.padStart(6) +
      `${(m.blownShare * 100).toFixed(1)}%`.padStart(7) +
      m.edgeDensity.toFixed(4).padStart(8) + String(iso).padStart(5) + String(specks).padStart(7),
  );
}
await browser.close();
