/**
 * Scripted playthrough of the actual game loop: talk to an NPC, collect a feather, start an activity.
 *
 * These are the interactions no unit test can prove, because they depend on the session wiring, the
 * interaction registry and the data all agreeing at runtime.
 */
import { chromium } from 'playwright';
import { NPCS } from '../src/data/npcs';

const URL = process.env.GAME_URL ?? 'http://127.0.0.1:4180/';

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => {
  const g = (window as unknown as { __game?: { frames(): number } }).__game;
  return !!g && g.frames() > 30;
}, { timeout: 60000 });

interface Probe {
  feathers: number;
  bells: number;
  blocking: boolean;
  dialogueText: string;
  quests: Record<string, string>;
  toasts: number;
  collectedMeshes: number;
}

const probe = (): Promise<Probe> =>
  page.evaluate(() => {
    const g = (window as unknown as {
      __game: {
        session: {
          state: { feathers: number; bells: number; quests: Record<string, { status: string }> };
          isBlocking(): boolean;
        };
      };
    }).__game;
    const s = g.session;
    const toasts = document.querySelectorAll('.ui-toast, [class*="toast"]').length;
    const dlg = document.querySelector('[class*="dialogue"]');
    return {
      feathers: s.state.feathers,
      bells: s.state.bells,
      blocking: s.isBlocking(),
      dialogueText: dlg ? (dlg.textContent ?? '').trim().slice(0, 90) : '',
      quests: Object.fromEntries(Object.entries(s.state.quests).map(([k, v]) => [k, v.status])),
      toasts,
      collectedMeshes: document.querySelectorAll('[data-collected]').length,
    };
  });

const results: Array<[string, boolean, string]> = [];

// --- 0. Walking leaves a trail (GDD R8) ------------------------------------
await page.evaluate(() => {
  const g = (window as unknown as { __game: { teleport(x: number, z: number, f?: number): void } }).__game;
  g.teleport(-360, 360, 2.38);
});
const trail = await page.evaluate(() => {
  const g = (window as unknown as {
    __game: {
      drive(f: Record<string, number> | null): void;
      step(n: number): void;
      session: { footprintCount(): number };
    };
  }).__game;
  const before = g.session.footprintCount();
  g.drive({ moveZ: 1 });
  for (let i = 0; i < 150; i++) g.step(1);
  g.drive(null);
  return { before, after: g.session.footprintCount() };
});
results.push(['walking lays a footprint trail', trail.after > trail.before + 8, `${trail.before} -> ${trail.after}`]);

// --- 1. Talk to Nana --------------------------------------------------------
const nana = NPCS.find((n) => n.id === 'nana')!.pos; // read it, never copy it: she has moved before
await page.evaluate(([x, z]) => {
  const g = (window as unknown as {
    __game: { teleport(x: number, z: number, f?: number): void; step(n: number, dt?: number): void; session: { interact(): void } };
  }).__game;
  g.teleport(x, z - 1.8, 0); // inside her 2.6 talk radius
  g.step(6);
  g.session.interact();
  g.step(4);
}, [nana.x, nana.z]);
const afterTalk = await probe();
results.push(['talking to an NPC opens dialogue', afterTalk.blocking, afterTalk.dialogueText.slice(0, 60) || '(empty)']);

// Advance the conversation. Choices stall advance() by design, so cap the attempts.
await page.evaluate(() => {
  const g = (window as unknown as {
    __game: { session: { advanceDialogue(): void; isBlocking(): boolean }; step(n: number): void };
  }).__game;
  for (let i = 0; i < 14 && g.session.isBlocking(); i++) {
    g.session.advanceDialogue();
    g.step(2);
  }
});
const afterDialogue = await probe();
results.push([
  'quest accepted after talking',
  Object.keys(afterDialogue.quests).length > 0,
  JSON.stringify(afterDialogue.quests),
]);

// --- 2. Collect a feather ---------------------------------------------------
// Close the conversation first: dialogue owns input, and pickups are correctly suppressed while
// a conversation is open.
await page.evaluate(() => {
  const g = (window as unknown as {
    __game: {
      drive(f: Record<string, boolean> | null): void;
      step(n: number): void;
      session: { isBlocking(): boolean };
    };
  }).__game;
  for (let i = 0; i < 6 && g.session.isBlocking(); i++) {
    g.drive({ cancelPressed: true });
    g.step(1);
    g.drive(null);
    g.step(2);
  }
});
const before = await probe();
await page.evaluate(() => {
  const g = (window as unknown as {
    __game: { teleport(x: number, z: number, f?: number): void; step(n: number): void };
  }).__game;
  g.teleport(-347, 318, 0); // feather-hearth-woodstore
  g.step(8);
});
const after = await probe();
results.push(['feather collected by walking over it', after.feathers > before.feathers, `${before.feathers} -> ${after.feathers}`]);

// --- 3. Start an activity ---------------------------------------------------
const activity = await page.evaluate(() => {
  const g = (window as unknown as {
    __game: {
      teleport(x: number, z: number, f?: number): void;
      step(n: number): void;
      session: { interact(): void; isBlocking(): boolean };
    };
  }).__game;
  // hearth-kindling sits at (-338, 312); the player must stand inside its 3.2 radius.
  g.teleport(-338, 313.5, 0);
  g.step(10);
  g.session.interact();
  g.step(4);
  return { blocking: g.session.isBlocking() };
});
results.push(['an activity starts and takes over input', activity.blocking, `blocking=${activity.blocking}`]);

await browser.close();

let ok = true;
for (const [name, pass, detail] of results) {
  if (!pass) ok = false;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
}
if (errors.length) {
  ok = false;
  console.log(`\npage errors: ${errors.slice(0, 4).join(' | ')}`);
}
process.exit(ok ? 0 : 1);
