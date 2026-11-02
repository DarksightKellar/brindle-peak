/**
 * Independent frame comparison. Loads any image Chromium can decode, runs the shared instrument
 * from src/core/imagemetrics.ts, and prints a table. Used to hold our render against the real
 * A Short Hike screenshots with identical code — the only fair way to judge "does it look like it".
 *
 * Run: npx vite-node tools/compare-frames.ts <file> [file...]
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { analyseFrame } from '../src/core/imagemetrics';
import { judge } from '../src/core/artgate';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: compare-frames.ts <image> [image...]');
  process.exit(2);
}

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas>');

interface Row {
  name: string;
  w: number;
  h: number;
  m: ReturnType<typeof analyseFrame>;
  fails: string[];
}

const rows: Row[] = [];
for (const file of files) {
  const ext = file.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
  const b64 = readFileSync(file).toString('base64');
  const r = await page.evaluate(
    async (arg: { data: string; mime: string }) => {
      const img = new Image();
      img.src = `data:image/${arg.mime};base64,${arg.data}`;
      await img.decode();
      const c = document.getElementById('c') as HTMLCanvasElement;
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, img.width, img.height);
      return { w: img.width, h: img.height, data: Array.from(d.data) };
    },
    { data: b64, mime: ext },
  );
  const m = analyseFrame(new Uint8Array(r.data), r.w, r.h);
  rows.push({
    name: basename(file),
    w: r.w,
    h: r.h,
    m,
    fails: judge(m).filter((x) => !x.pass).map((x) => x.name),
  });
}
await browser.close();

const pad = (s: string, n: number): string => s.padEnd(n);
const f3 = (v: number): string => v.toFixed(3);
console.log(
  pad('frame', 30) + pad('p1', 7) + pad('p50', 7) + pad('p95', 7) + pad('min', 7) +
    pad('S50', 7) + pad('cool', 7) + pad('warm', 7) + pad('blown', 8) + pad('contr', 8) +
    pad('edge', 7) + 'blk',
);
for (const r of rows) {
  console.log(
    pad(r.name.slice(0, 29), 30) +
      pad(f3(r.m.p1), 7) + pad(f3(r.m.p50), 7) + pad(f3(r.m.p95), 7) + pad(f3(r.m.min), 7) +
      pad(f3(r.m.satP50), 7) + pad((r.m.coolShare * 100).toFixed(0) + '%', 7) +
      pad((r.m.warmShare * 100).toFixed(0) + '%', 7) +
      pad((r.m.blownShare * 100).toFixed(1) + '%', 8) +
      pad(f3(r.m.contrast), 8) + pad(f3(r.m.edgeDensity), 7) + String(r.m.blockPeriod),
  );
}
console.log('');
for (const r of rows) {
  console.log(`${r.name}: ${r.fails.length === 0 ? 'PASS' : 'FAIL -> ' + r.fails.join('; ')}`);
}
