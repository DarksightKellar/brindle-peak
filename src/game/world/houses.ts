/**
 * The gable-roofed house every building in the valley is made from: walls, two roof planes and their
 * snow, gables, a door, lit windows.
 *
 * Split from landmarks.ts. Two things changed here, both from a critic's frames:
 *
 *  - A wall was one flat box of colour, and seen close (the cabin's side, beside the porch) it was a
 *    blank brown sheet. Walls are now boarded: a slightly darker strip proud of the wall every 0.42 u,
 *    trim boards on the corners, and on the bigger houses a lit window in each side wall.
 *  - Pell's letter is for "Nana, the blue house", and four doors in the valley were blue once. A house
 *    can now wear paint: the walls in one colour, the corners and window frames in another, and its
 *    own door colour (landmarks.ts says which house wears what).
 */

import type { PaletteKey } from '../../core/palette';
import { GEO, GeoBuilder, propMatrix } from './geoBuilder';

export interface HouseLook {
  /** Door colour. Bare timber unless painted. */
  door?: PaletteKey;
  /** Corner boards and window frames. A shade of the wall unless painted. */
  trim?: PaletteKey;
  /** A lit window in each side wall, for houses big enough to have rooms there. */
  sideWindows?: boolean;
  /** A doorstep, and what lies on it. */
  step?: PaletteKey;
}

/** The board line a wall colour wears: a step darker in the same family. */
const BOARD: Partial<Record<PaletteKey, PaletteKey>> = {
  WOOD_LT: 'WOOD_MID', WOOD_MID: 'WOOD_DK', WOOD_DK: 'BARK', WATER_DEEP: 'WATER_DK', ICE_DEEP: 'WATER_DEEP',
};

/** Boards across one wall: `along` is the wall's run (x or z), `at` its face position on the other axis. */
function boards(b: GeoBuilder, run: number, face: number, alongX: boolean, h: number, wall: PaletteKey): void {
  const line = BOARD[wall] ?? 'ROCK_DK';
  for (let y = 0.42; y < h - 0.1; y += 0.42) {
    if (alongX) b.box(0, y, face, run, 0.06, 0.05, line);
    else b.box(face, y, 0, 0.05, 0.06, run, line);
  }
}

/** A lit window with a frame, on the wall whose outward normal is (nx, nz), centred at (cx, cz). */
function pane(b: GeoBuilder, cx: number, cz: number, nx: number, nz: number, frame: PaletteKey): void {
  const w = 0.84, y0 = 1.05, y1 = 1.95;
  // Frame: a slightly bigger board behind the glass.
  if (nz !== 0) b.box(cx, y0 - 0.1, cz + nz * 0.03, w + 0.24, y1 - y0 + 0.2, 0.06, frame);
  else b.box(cx + nx * 0.03, y0 - 0.1, cz, 0.06, y1 - y0 + 0.2, w + 0.24, frame);
  b.glow();
  const ox = nx * 0.07, oz = nz * 0.07;
  const sx = nz !== 0 ? w / 2 : 0, sz = nx !== 0 ? w / 2 : 0;
  b.quad(
    [cx - sx + ox, y0, cz - sz + oz], [cx + sx + ox, y0, cz + sz + oz],
    [cx + sx + ox, y1, cz + sz + oz], [cx - sx + ox, y1, cz - sz + oz],
    'LANTERN', [cx + nx * 2, 1.5, cz + nz * 2],
  );
  b.glow(false);
}

/** Gable-roofed box: walls, two roof planes, two snow slabs, two gables, door, lit windows. */
export function house(b: GeoBuilder, w: number, d: number, h: number, wall: PaletteKey, windows: number, look: HouseLook = {}): void {
  b.box(0, -0.8, 0, w, h + 0.8, d, wall);
  const x0 = -w / 2 - 0.32;
  const x1 = w / 2 + 0.32;
  const z0 = -d / 2 - 0.32;
  const z1 = d / 2 + 0.32;
  const yr = h + Math.min(w * 0.42, 2.6);
  b.quad([x0, h, z1], [x0, h, z0], [0, yr, z0], [0, yr, z1], 'WOOD_DK', [x0 - 1, h + 0.5, 0]);
  b.quad([x1, h, z0], [x1, h, z1], [0, yr, z1], [0, yr, z0], 'WOOD_DK', [x1 + 1, h + 0.5, 0]);
  b.quad([x0, h + 0.15, z1], [x0, h + 0.15, z0], [0, yr + 0.15, z0], [0, yr + 0.15, z1], 'SNOW_LT', [x0 - 1, h + 0.8, 0]);
  b.quad([x1, h + 0.15, z0], [x1, h + 0.15, z1], [0, yr + 0.15, z1], [0, yr + 0.15, z0], 'SNOW_LT', [x1 + 1, h + 0.8, 0]);
  b.tri([x0, h, z1], [x1, h, z1], [0, yr, z1], wall, [0, h + 0.4, z1 + 1]);
  b.tri([x1, h, z0], [x0, h, z0], [0, yr, z0], wall, [0, h + 0.4, z0 - 1]);

  boards(b, w, d / 2 + 0.02, true, h, wall);
  boards(b, w, -d / 2 - 0.02, true, h, wall);
  boards(b, d, w / 2 + 0.02, false, h, wall);
  boards(b, d, -w / 2 - 0.02, false, h, wall);
  const trim = look.trim ?? BOARD[wall] ?? 'WOOD_DK';
  for (const [cx, cz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) {
    b.box(cx * (w / 2 + 0.02), -0.2, cz * (d / 2 + 0.02), 0.2, h + 0.2, 0.2, trim);
  }

  b.box(w * 0.16, 0, d / 2, 0.9, 1.9, 0.1, look.door ?? 'WOOD_DK');
  if (look.step) {
    b.box(w * 0.16, -0.1, d / 2 + 0.4, 1.2, 0.2, 0.6, 'WOOD_LT');
    b.box(w * 0.16 + 0.1, 0.1, d / 2 + 0.45, 0.7, 0.02, 0.4, look.step);
  }
  for (let i = 0; i < windows; i++) {
    const wx = windows === 1 ? w * 0.28 : -w * 0.28 + (w * 0.56 * i) / (windows - 1);
    pane(b, wx, d / 2 + 0.02, 0, 1, trim);
  }
  if (look.sideWindows) for (const sx of [-1, 1]) pane(b, sx * (w / 2 + 0.02), -d * 0.12, sx, 0, trim);
  b.add(GEO.box, propMatrix(0, yr + 0.2, 0, 0.24, 0.16, d + 0.7), 'WOOD_DK', 'SNOW_HI', 0.5);
}
