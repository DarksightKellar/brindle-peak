/**
 * A one-file build of the game for sharing by hand: release/First Snow.html, which plays when
 * double-clicked, with no server and no unzipping.
 *
 * The normal build cannot be opened from disk: Chrome and Edge refuse to load a module script from a
 * file:// page, so the page stays blank. Here the music goes into the script as data URLs, and the
 * script and styles go into the page itself, so the browser never has to fetch anything.
 *
 *   npm run single
 */
import { build } from 'vite';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist-single');

await build({
  root: ROOT,
  logLevel: 'warn',
  build: {
    outDir: OUT,
    emptyOutDir: true,
    // Everything, music included, goes into the script as a data URL.
    assetsInlineLimit: () => true,
    chunkSizeWarningLimit: 20000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});

const assets = join(OUT, 'assets');
const files = readdirSync(assets);
const js = files.filter((f) => f.endsWith('.js'));
const css = files.filter((f) => f.endsWith('.css'));
const left = files.filter((f) => !f.endsWith('.js') && !f.endsWith('.css'));
if (js.length !== 1 || left.length > 0) throw new Error(`expected one script and nothing else, got ${files.join(', ')}`);

let html = readFileSync(join(OUT, 'index.html'), 'utf8');
// "</script" inside the script would end the tag early.
const script = readFileSync(join(assets, js[0]), 'utf8').replace(/<\/script/gi, '<\\/script');
html = html.replace(/<script type="module"[^>]*src="[^"]*"><\/script>/, () => `<script type="module">${script}</script>`);
for (const c of css) {
  const style = readFileSync(join(assets, c), 'utf8');
  html = html.replace(new RegExp(`<link rel="stylesheet"[^>]*href="[^"]*${c.replace(/[.]/g, '\\.')}">`), () => `<style>${style}</style>`);
}
if (/src="\.\/assets|href="\.\/assets/.test(html)) throw new Error('a file reference was left in the page');

mkdirSync(join(ROOT, 'release'), { recursive: true });
const out = join(ROOT, 'release', 'First Snow.html');
writeFileSync(out, html);
rmSync(OUT, { recursive: true });
console.log(`release/First Snow.html: ${(Buffer.byteLength(html) / 1e6).toFixed(1)} MB`);
