/**
 * QA regressions — the defects the hired tester found, held down.
 *
 * These are not unit tests. Each one drives the real page in a real browser and asserts an
 * observable outcome, because every one of these bugs passed the unit suite:
 *
 *   D1  activities had no presentation at all, and build activities were impossible
 *   D2  Escape could not close the pause menu or the journal (keyboard lock-in)
 *   D3  sprint was unobtainable, so Shift did nothing for the whole game
 *   D4  every quest's final "report back" step completed itself at acceptance
 *   D5  there was no world boundary
 *   D7  the starting zone was never recorded as visited
 *
 *   npx vite-node tools/qa-regressions.ts        (GAME_URL to override the target)
 */

import { chromium } from 'playwright';
import { NPCS } from '../src/data/npcs';

const URL = process.env.GAME_URL ?? 'http://127.0.0.1:4180/';
type Row = [name: string, pass: boolean, evidence: string];

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(
  () => ((window as unknown as { __game?: { frames(): number } }).__game?.frames() ?? 0) > 40,
  { timeout: 60000 },
);

const rows: Row[] = [];

// ---- D1: activity HUD, progress, completability -------------------------------------------
interface GameHandle {
  teleport(x: number, z: number, f?: number): void;
  drive(f: Record<string, number | boolean> | null): void;
  step(n: number): void;
  session: {
    state: { counters: Record<string, number>; quests: Record<string, { status: string; step: number }>; bells: number; visited: Record<string, boolean>; zone: string };
    player: { pos: { x: number; z: number } };
    isBlocking(): boolean;
  };
}
const show = async (fn: string): Promise<unknown> => page.evaluate(fn);

const d1 = await page.evaluate((id: string) => {
  const g = (window as unknown as { __game: GameHandle }).__game;
  g.teleport(-338, 309.3, 0);
  g.step(20);
  g.drive({ interactPressed: true });
  g.step(1);
  g.drive(null);
  g.step(2);
  const panel = document.getElementById('ui')?.querySelector('.ui-activity') as HTMLElement | null;
  // Capture visibility NOW: once the third part lands the panel hides itself, so reading this after
  // the loop measures the finished state instead of the running one.
  const visible = !!panel && !panel.hidden;
  const title = panel?.querySelector('.ui-activity__name')?.textContent ?? '';
  const hint = panel?.querySelector('.ui-activity__hint')?.textContent ?? '';
  const labels: string[] = [panel?.querySelector('.ui-activity__label')?.textContent ?? ''];
  for (let i = 0; i < 3; i++) {
    g.drive({ interactPressed: true });
    g.step(1);
    g.drive(null);
    g.step(2);
    labels.push(panel?.querySelector('.ui-activity__label')?.textContent ?? '');
  }
  const out = {
    visible,
    title,
    hint,
    labels,
    counters: { ...g.session.state.counters } as Record<string, number>,
  };
  g.drive({ cancelPressed: true });
  g.step(2);
  g.drive(null);
  g.step(4);
  void id;
  return out;
}, 'hearth-kindling');

rows.push(['D1 activity panel appears', d1.visible && d1.title.length > 0, `title="${d1.title}"`]);
rows.push(['D1 panel shows an instruction', d1.hint.length > 10, `hint="${d1.hint}"`]);
rows.push([
  'D1 progress reaches 3 / 3',
  d1.labels.some((l) => /3 \/ 3/.test(l)),
  d1.labels.filter(Boolean).join(' | ') || '(no labels)',
]);
rows.push([
  'D1 build activity completes',
  Object.keys(d1.counters).length > 0,
  JSON.stringify(d1.counters),
]);

// ---- D3: sprint -----------------------------------------------------------------------------
const d3 = await page.evaluate(() => {
  const g = (window as unknown as { __game: GameHandle }).__game;
  const run = (sprint: boolean): number => {
    g.teleport(-360, 360, 0);
    g.step(10);
    const x0 = g.session.player.pos.x, z0 = g.session.player.pos.z;
    g.drive({ moveZ: 1, sprintHeld: sprint });
    for (let i = 0; i < 60; i++) g.step(1);
    g.drive(null);
    return Math.hypot(g.session.player.pos.x - x0, g.session.player.pos.z - z0);
  };
  return { walk: run(false), sprint: run(true) };
});
rows.push(['D3 Shift is faster than walking', d3.sprint > d3.walk * 1.2,
  `walk=${d3.walk.toFixed(2)} sprint=${d3.sprint.toFixed(2)}`]);

// ---- D5: world boundary ---------------------------------------------------------------------
const d5 = await page.evaluate(() => {
  const g = (window as unknown as { __game: GameHandle }).__game;
  g.teleport(480, 0, 1.57);
  g.drive({ moveZ: 1 });
  for (let i = 0; i < 240; i++) g.step(1);
  g.drive(null);
  return g.session.player.pos.x;
});
rows.push(['D5 player cannot walk out of the world', d5 <= 498.5, `x=${d5.toFixed(1)} (limit 498)`]);

// ---- D7: starting zone ----------------------------------------------------------------------
const d7 = await page.evaluate(() => {
  const g = (window as unknown as { __game: GameHandle }).__game;
  return { visited: { ...g.session.state.visited }, zone: g.session.state.zone };
});
rows.push(['D7 starting zone marked visited', d7.visited[d7.zone] === true, JSON.stringify(d7.visited)]);

// ---- D4: a quest must not complete itself ----------------------------------------------------
const at = (id: string): [number, number] => {
  const pos = NPCS.find((n) => n.id === id)!.pos; // read it, never copy it: Nana has moved before
  return [pos.x, pos.z - 1.8];
};
const d4 = await page.evaluate(([nana, bram]) => {
  const g = (window as unknown as { __game: GameHandle }).__game;
  const talk = (x: number, z: number): void => {
    g.teleport(x, z, 0);
    g.step(12);
    g.drive({ interactPressed: true });
    g.step(2);
    g.drive(null);
    g.step(4);
    // Close the conversation, however many presses it takes: one left open swallows the first
    // Escape of the D2 checks below and reads as a pause menu that will not open.
    for (let i = 0; i < 6 && g.session.isBlocking(); i++) {
      g.drive({ cancelPressed: true });
      g.step(2);
      g.drive(null);
      g.step(4);
    }
  };
  talk(nana[0], nana[1]);                           // Nana: accepts "The Line's Down"
  const afterGiver = { ...g.session.state.quests['the-line'] };
  const bellsAfterGiver = g.session.state.bells;
  talk(bram[0], bram[1]);                           // Bram: must not satisfy "tell Nana"
  return { afterGiver, afterOther: { ...g.session.state.quests['the-line'] }, bellsAfterGiver, bells: g.session.state.bells };
}, [at('nana'), at('bram')]);
rows.push([
  'D4 quest needs its final leg',
  d4.afterOther.status === 'active' && d4.afterOther.step <= 1 && d4.bells === d4.bellsAfterGiver,
  `after giver=${JSON.stringify(d4.afterGiver)} after other=${JSON.stringify(d4.afterOther)} bells=${d4.bells}`,
]);

// ---- D2: Escape routing ---------------------------------------------------------------------
const menuVisible = (): Promise<boolean> => page.evaluate(() => {
  const el = document.querySelector('#ui .ui-menu') as HTMLElement | null;
  return !!el && !el.hidden && el.offsetParent !== null;
});
const journalVisible = (): Promise<boolean> => page.evaluate(() => {
  const el = document.querySelector('#ui .ui-journal') as HTMLElement | null;
  return !!el && !el.hidden && el.offsetParent !== null;
});

await page.keyboard.press('Escape');
await page.waitForTimeout(150);
const opened = await menuVisible();
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
const closed = await menuVisible();
rows.push(['D2 Escape closes the pause menu', opened && !closed, `opened=${opened} closed=${!closed}`]);

await page.keyboard.press('Tab');
await page.waitForTimeout(150);
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
const journalStill = await journalVisible();
rows.push(['D2 Escape closes the journal', !journalStill, `journalOpen=${journalStill}`]);

await page.keyboard.press('Escape');
await page.waitForTimeout(150);
await page.keyboard.press('Tab');
await page.waitForTimeout(150);
const stacked = await page.evaluate(async () => {
  const m = document.querySelector('#ui .ui-menu') as HTMLElement | null;
  const j = document.querySelector('#ui .ui-journal') as HTMLElement | null;
  const vis = (el: HTMLElement | null): boolean => !!el && !el.hidden && el.offsetParent !== null;
  return vis(m) && vis(j);
});
rows.push(['D2 overlays never stack', !stacked, `bothOpen=${stacked}`]);

void show;

rows.push(['no page errors', errors.length === 0, errors.join('; ').slice(0, 160) || 'none']);

for (const [name, pass, evidence] of rows) console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  (${evidence})`);
const failed = rows.filter((r) => !r[1]).length;
console.log(`\n${rows.length - failed}/${rows.length} passed`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
