/**
 * Bootstrap. Owns the DOM, the input source, key routing between overlays, and the debug hook
 * the acceptance harness drives. No game logic lives here.
 */

import { Box3, Vector3, type Camera, type Object3D } from 'three';
import { analyseFrame, type FrameMetrics } from './core/imagemetrics';
import { judge } from './core/artgate';
import { createInput, type InputSource } from './game/input';
import { createLoop, type Loop } from './loop';
import { createSession, type Session } from './session';

export interface GameDebug {
  session: Session;
  input: InputSource;
  /** Advance N frames with a fixed dt, without waiting for rAF. Harness only. */
  step(frames: number, dt?: number): void;
  /** Replace the sampled input for scripted playtests. Pass null to return to live input. */
  drive(frame: Partial<ReturnType<InputSource['sample']>> | null): void;
  /** Place the player at a world position and face a heading. Harness only. */
  teleport(x: number, z: number, facing?: number): void;
  /** Measure the current frame in-page. Avoids shipping 8 MB of pixels over the wire per frame. */
  analyse(): FrameMetrics & { failures: string[]; notes: string[] };
  frames(): number;
  /** The character's own screen-space box in pixels — the bird, not whatever else is warm-toned. */
  playerBox(): { x: number; y: number; w: number; h: number } | null;
  /** The solid-world collider list, so a harness can aim at a real obstacle. */
  colliders(): readonly unknown[];
  /** Toggle the camera-corridor fade, so a harness can measure it on vs off. */
  setViewFade(on: boolean): void;
}

const canvas = document.getElementById('stage');
const uiRoot = document.getElementById('ui');
if (!(canvas instanceof HTMLCanvasElement) || !(uiRoot instanceof HTMLElement)) {
  throw new Error('First Snow: #stage canvas or #ui root missing from index.html');
}

const session = createSession({ canvas, uiRoot, resume: true });
const input = createInput(canvas);

let scripted: ReturnType<InputSource['sample']> | null = null;
let frames = 0;

const step = (dt: number): void => {
  const frame = scripted ?? input.sample(session.rig.yaw());
  session.update(dt, frame);
  frames++;
};

const loop: Loop = createLoop(step);

// --- resize -------------------------------------------------------------------------------
const resize = (): void => {
  session.pipeline.resize(window.innerWidth, window.innerHeight);
};
window.addEventListener('resize', resize);
resize();

// --- overlay keys -------------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'tab' || k === 'j') {
    e.preventDefault();
    session.toggleJournal();
  } else if (k === 'm') {
    // The map's own key (docs/GUIDE.md §2). It is a page of the journal, not a second overlay.
    e.preventDefault();
    session.toggleMap();
  } else if (k === 'escape') {
    // Routing lives in the session: it knows which overlay is on top, and dialogue/activities consume
    // Escape through the input frame instead.
    session.escape();
  }
});

// --- debug hook ---------------------------------------------------------------------------
import { setViewFadeEnabled } from './game/render/viewFade';

const debug: GameDebug = {
  session,
  input,
  step(n: number, dt = 1 / 60): void {
    for (let i = 0; i < n; i++) step(dt);
  },
  drive(frame): void {
    scripted = frame === null ? null : { ...input.sample(session.rig.yaw()), ...frame };
  },
  teleport(x, z, facing): void {
    const p = session.player;
    p.pos.x = x;
    p.pos.z = z;
    p.vel.x = 0;
    p.vel.y = 0;
    p.vel.z = 0;
    if (facing !== undefined) p.facing = facing;
    step(1 / 60);
  },
  analyse(): FrameMetrics & { failures: string[]; notes: string[] } {
    const tmp = document.createElement('canvas');
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    const ctx = tmp.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    ctx.drawImage(canvas, 0, 0);
    const d = ctx.getImageData(0, 0, tmp.width, tmp.height);
    const m = analyseFrame(d.data, tmp.width, tmp.height);
    const rules = judge(m);
    return {
      ...m,
      // Only decisive rules. Informational ones are reported but cannot fail a frame: gating on
      // detail density and block period is what made every live frame look broken.
      failures: rules.filter((r) => !r.pass && r.informational !== true).map((r) => r.name),
      notes: rules.filter((r) => r.informational === true && !r.pass).map((r) => r.name),
    };
  },
  frames: () => frames,
  /**
   * The bird's own screen-space box in pixels.
   *
   * `analyse()` answers "what does the frame look like"; this answers "where is the character and how
   * big is it". A colour-based silhouette cannot tell Pip from a wooden fence, and an animation test
   * that cannot see the character ends up measuring the scenery — which is exactly what happened.
   */
  playerBox(): { x: number; y: number; w: number; h: number } | null {
    const root = session.pip.root as unknown as Object3D;
    const cam = session.camera as unknown as Camera;
    cam.updateMatrixWorld();
    // Everything except the contact shadow: it is wider than the bird and would dominate the box.
    const box = new Box3();
    (root as unknown as { traverse: (f: (o: never) => void) => void }).traverse((o: never) => {
      const mesh = o as unknown as { name: string; isMesh?: boolean };
      if (!mesh.isMesh || mesh.name === 'contact-shadow') return;
      box.expandByObject(o as never);
    });
    if (box.isEmpty()) return null;
    const v = new Vector3();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < 8; i++) {
      v.set(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z,
      ).project(cam);
      const px = (v.x * 0.5 + 0.5) * canvas.clientWidth;
      const py = (-v.y * 0.5 + 0.5) * canvas.clientHeight;
      minX = Math.min(minX, px); maxX = Math.max(maxX, px);
      minY = Math.min(minY, py); maxY = Math.max(maxY, py);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  },
  // Solid-world inspection: a harness can pick a real obstacle out of this rather than guessing
  // coordinates and concluding "collision is broken" when it aimed at empty snow.
  colliders: () => session.colliders as unknown as readonly unknown[],
  setViewFade: (on: boolean) => setViewFadeEnabled(on),
};
// The harness hook is for development and local verification only: a player's build on a real host
// does not get a teleport button. Local preview builds (the tools run against 127.0.0.1) keep it.
const local = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
if (import.meta.env.DEV || local) (window as unknown as { __game: GameDebug }).__game = debug;

// QA D6: progress was only written on a zone change or every 30 s, so a pick-up followed by a
// reload was lost. `pagehide` is the reliable unload hook (beforeunload does not fire on mobile
// bfcache); `visibilitychange` covers tab-switching on phones.
window.addEventListener('pagehide', () => session.save());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') session.save();
});

loop.start();

// Autoplay policies require a gesture; the first click or key already unlocks audio, and the
// loading veil comes down on the first rendered frame.
canvas.addEventListener('pointerdown', () => canvas.classList.add('playing'), { once: true });
