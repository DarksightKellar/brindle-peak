/**
 * The visual half of `tools/controls-regressions.ts`: checks that read the canvas rather than the
 * player state. An occluding tree must fade, a sprint must change the bird's silhouette, and the mouse
 * must not be an input. Run through that script; this module has no entry point of its own.
 */

import type { Page } from 'playwright';

type Check = (name: string, pass: boolean, detail: string) => void;

export async function checkVisuals(page: Page, check: Check, painted: () => Promise<void>): Promise<void> {
  // --- 5. the occluding prop fades instead of the camera diving -------------------------------
  const fade = await page.evaluate(() => {
    const g = (window as any).__game;
    const pines = (g.colliders() as any[]).filter((c) => c.kind === 'circle' && Math.abs(c.r - 0.5) < 0.25);
    const warm = () => {
      const canvas = document.getElementById('stage') as HTMLCanvasElement;
      const tmp = document.createElement('canvas');
      tmp.width = canvas.width;
      tmp.height = canvas.height;
      const ctx = tmp.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
      ctx.drawImage(canvas, 0, 0);
      const d = ctx.getImageData(0, 0, tmp.width, tmp.height).data;
      let n = 0;
      const x0 = Math.floor(tmp.width / 3), x1 = Math.floor((tmp.width * 2) / 3);
      const y0 = Math.floor(tmp.height / 4), y1 = Math.floor((tmp.height * 3) / 4);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * tmp.width + x) * 4;
          const r = d[i], gg = d[i + 1], bb = d[i + 2];
          if (r > 110 && r - bb > 45 && r >= gg && gg > bb) n++;
        }
      }
      return n;
    };
    for (const pine of pines.filter((c) => Math.hypot(c.x + 230, c.z - 130) < 90).slice(0, 12)) {
      for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        g.teleport(pine.x + Math.sin(yaw) * 1.9, pine.z + Math.cos(yaw) * 1.9, yaw + Math.PI);
        g.drive({ camYaw: yaw, moveZ: 0 });
        g.step(40);
        g.drive(null);
        g.setViewFade(false); g.step(2); const off = warm();
        g.setViewFade(true); g.step(2); const on = warm();
        if (on - off > 40) return { off, on, gain: on - off };
      }
    }
    return { off: 0, on: 0, gain: 0 };
  });
  check('an occluding tree fades so the player stays visible', fade.gain > 40,
    `bird pixels in the corridor ${fade.off} -> ${fade.on} with the fade on`);

  // --- 6. sprint looks different, and the mouse can turn the camera ---------------------------
  const stage = async (sprint: boolean, at: [number, number]) => page.evaluate(([sp, spot]: any[]) => {
    const g = (window as any).__game;
    g.teleport(spot[0], spot[1], 0);
    g.drive({ camYaw: 0, moveZ: 1, sprintHeld: !!sp });
    g.step(90);
    const canvas = document.getElementById('stage') as HTMLCanvasElement;
    const tmp = document.createElement('canvas');
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    const ctx = tmp.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    ctx.drawImage(canvas, 0, 0);
    const d = ctx.getImageData(0, 0, tmp.width, tmp.height).data;
    const x0 = Math.floor(tmp.width / 2 - 110), x1 = Math.floor(tmp.width / 2 + 110);
    const y0 = Math.floor(tmp.height / 2 - 80), y1 = Math.floor(tmp.height / 2 + 80);
    let n = 0;
    const rows = new Map<number, number>();
    const cols = new Map<number, number>();
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * tmp.width + x) * 4;
        const r = d[i], gg = d[i + 1], bb = d[i + 2];
        if (r > 110 && r - bb > 45 && r >= gg && gg > bb) {
          n++;
          rows.set(y, (rows.get(y) ?? 0) + 1);
          cols.set(x, (cols.get(x) ?? 0) + 1);
        }
      }
    }
    /*
     * Extent from rows and columns carrying at least three warm pixels. A single stray pixel of amber
     * brush 80 px from the bird was stretching the bounding box to 100x90 while the bird itself is a
     * third of that; a thresholded histogram measures the animal rather than the outliers.
     */
    const ken = (m: Map<number, number>): number[] => [...m.entries()].filter(([, c]) => c >= 3).map(([k]) => k);
    const ry = ken(rows), cx2 = ken(cols);
    const h = ry.length ? Math.max(...ry) - Math.min(...ry) + 1 : 0;
    const w = cx2.length ? Math.max(...cx2) - Math.min(...cx2) + 1 : 0;
    return { n, w, h };
  }, [sprint, at]);

  /*
   * Pose is only comparable where the bird is fully visible. The first version of this check compared a
   * walk and a sprint from the same start and got 34x10 against 110x76 — but the two runs end at
   * different places (13 u/s covers twice the ground), and at the walk's resting spot a fence stood in
   * front of the bird. That is occlusion, not posture. So: find a spot where BOTH poses read at full
   * size, and only then compare silhouette shape.
   */
  let walkPose = { n: 0, w: 0, h: 0 };
  let runPose = { n: 0, w: 0, h: 0 };
  let spot: [number, number] = [-330, 300];
  for (const candidate of [[-330, 300], [-300, 340], [-345, 315], [120, 380], [250, 150]] as Array<[number, number]>) {
    await painted();
    const w = await stage(false, candidate);
    await painted();
    const r = await stage(true, candidate);
    if (w.n > 120 && r.n > 120) { walkPose = w; runPose = r; spot = candidate; break; }
    walkPose = w; runPose = r; // keep the last pair so a failure reports something real
  }
  await page.evaluate(() => (window as any).__game.drive(null));
  const shapeChanged = Math.abs(runPose.h - walkPose.h) >= 3 || Math.abs(runPose.w - walkPose.w) >= 3;
  const bothVisible = walkPose.n > 120 && runPose.n > 120;
  check('sprint changes the bird\'s silhouette (both poses fully visible)',
    bothVisible && shapeChanged,
    `at (${spot[0]}, ${spot[1]}): walk ${walkPose.w}x${walkPose.h} (${walkPose.n} px), ` +
    `sprint ${runPose.w}x${runPose.h} (${runPose.n} px)`);

  /*
   * Inverted on request: the mouse is not an input any more. This used to assert that a 200 px drag
   * turned the camera ~2 rad, which is the behaviour that was reported as breaking the camera.
   *
   * The camera cannot be the instrument here. The rig eases toward the player's facing every frame, so
   * yaw drifts on its own after a sprint (measured 0.02 rad in a control window against 0.11 across the
   * drag window) and a before/after comparison cannot tell follow from the mouse. The channel the mouse
   * used to travel on is `input.lookX`; that is what gets asserted, and it is now a constant zero.
   */
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.drive({ moveX: 0, moveZ: 0 });
    g.step(90); // let the sprint's residual velocity and any follow easing die out
    g.drive(null);
  });

  const box = await page.locator('#stage').boundingBox();
  const cx = (box?.x ?? 0) + 400, cy = (box?.y ?? 0) + 260;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(cx + i * 20, cy);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
  const look = await page.evaluate(() => (window as any).__game.input.sample().lookX);
  check('a 200 px drag produces no look input at all', Math.abs(look) < 1e-9, `lookX = ${look}`);

  /*
   * A "no lasting yaw offset" check stood here and was removed rather than weakened: after 120 frames it
   * still read 0.2 rad, and that number is the follow rig converging on a body that is still sliding, not
   * the mouse. It measured the wrong thing. The camera-level claim (a drag from a clean spawn moves yaw by
   * 0.000 rad) is asserted in tools/no-mouse-and-map.ts, where nothing else is moving.
   */
}
