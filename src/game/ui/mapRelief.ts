/**
 * The map's relief: contour lines traced from the real heightfield, once, as SVG path data.
 *
 * Seven dashed circles told the player nothing about the valley — not where the mountain was, not
 * which way was up. A trail map you could buy at a hut does that with contours, so this does too:
 * marching squares over a coarse grid of `heightAt` samples, one path for the ordinary lines and one
 * for every fourth ("index") line, so the peak reads as a peak at a glance.
 *
 * Pure: it is handed a height function and the world-to-map transform, and returns strings.
 */

export interface Relief {
  /** Thin contour lines. */
  lines: string;
  /** Every fourth level, drawn a little heavier. */
  index: string;
  /** Ground under the lake's surface, as blobs; empty when no water level is given. */
  water: string;
}

export interface ReliefSpec {
  heightAt(x: number, z: number): number;
  /** Map pixels. */
  width: number;
  height: number;
  /** Map pixel -> world coordinate. */
  toWorldX(px: number): number;
  toWorldZ(py: number): number;
  /** Grid step in map pixels. Coarse on purpose: the map is drawn, not surveyed. */
  cell: number;
  /** World units between contour levels. */
  interval: number;
  /** World points worth drawing. The world's edge walls are not land anyone walks, only noise. */
  keep(x: number, z: number): boolean;
  /** Is this world point under water? Drawn as the lake. */
  wet?(x: number, z: number, height: number): boolean;
}

const r1 = (n: number): number => Math.round(n * 10) / 10;

export function traceRelief(spec: ReliefSpec): Relief {
  const cols = Math.ceil(spec.width / spec.cell) + 1;
  const rows = Math.ceil(spec.height / spec.cell) + 1;
  const h: number[] = new Array(cols * rows);
  const kept: boolean[] = new Array(cols * rows);
  let lo = Infinity;
  let hi = -Infinity;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = spec.toWorldX(i * spec.cell), z = spec.toWorldZ(j * spec.cell);
      const v = spec.heightAt(x, z);
      h[j * cols + i] = v;
      kept[j * cols + i] = spec.keep(x, z);
      if (!kept[j * cols + i]) continue;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }

  const lines: string[] = [];
  const index: string[] = [];
  const water: string[] = [];
  if (spec.wet) {
    const r = r1(spec.cell * 0.75);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = i * spec.cell, y = j * spec.cell;
        if (!kept[j * cols + i] || !spec.wet(spec.toWorldX(x), spec.toWorldZ(y), h[j * cols + i])) continue;
        water.push(`M${r1(x - r)} ${y}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`);
      }
    }
  }
  const first = Math.ceil(lo / spec.interval);
  const last = Math.floor(hi / spec.interval);
  for (let k = first; k <= last; k++) {
    const level = k * spec.interval;
    const out = k % 4 === 0 ? index : lines;
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        if (!kept[j * cols + i]) continue;
        const a = h[j * cols + i], b = h[j * cols + i + 1];
        const c = h[(j + 1) * cols + i + 1], d = h[(j + 1) * cols + i];
        // Edge crossings, in order top, right, bottom, left.
        const pts: [number, number][] = [];
        const x0 = i * spec.cell, y0 = j * spec.cell, s = spec.cell;
        const cross = (p: number, q: number): number | null =>
          (p < level) !== (q < level) ? (level - p) / (q - p) : null;
        const t = cross(a, b); if (t !== null) pts.push([x0 + t * s, y0]);
        const rr = cross(b, c); if (rr !== null) pts.push([x0 + s, y0 + rr * s]);
        const bb = cross(d, c); if (bb !== null) pts.push([x0 + bb * s, y0 + s]);
        const l = cross(a, d); if (l !== null) pts.push([x0, y0 + l * s]);
        // Two or four crossings; a saddle's four are paired as two segments, which is fine at this scale.
        for (let p = 0; p + 1 < pts.length; p += 2) {
          out.push(`M${r1(pts[p][0])} ${r1(pts[p][1])}L${r1(pts[p + 1][0])} ${r1(pts[p + 1][1])}`);
        }
      }
    }
  }
  return { lines: lines.join(''), index: index.join(''), water: water.join('') };
}
