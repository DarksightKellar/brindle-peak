/**
 * Draws the things an activity needs you to see.
 *
 * The photo subject, throw targets, fishing float and build parts all existed as numbers inside
 * their activity modules and were never rendered — QA found the player could only brute-force those
 * minigames by guessing. The HUD states the timing in text; this puts the object in the world so
 * the text has a referent.
 *
 * Two layers, because two kinds of thing are drawn:
 *
 * Transient markers (gates, targets, the aim line, a snowball in flight) are pooled: a fixed set of
 * meshes is created once and repositioned, so an activity costs no allocation per frame. They are
 * unlit (MeshBasicMaterial): the pipeline re-grades everything and a gate that disappears into shade
 * at dusk is worse than no gate. Strength scales size and brightness rather than opacity, because
 * the composite has no transparency to speak of; a look with a `dim` colour fades toward it instead,
 * which is how an unlit lantern reads as dark iron rather than as a faint lantern.
 *
 * Kept pieces (see activities/markerLooks.ts) are lit, flat-shaded and survive `clear()`: a finished
 * woodpile is still standing after the activity closes. `restore()` puts one back after a reload.
 */

import * as THREE from 'three';
import type { MarkerShape, MarkerSpec } from '../../core/contracts';
import { PALETTE } from '../../core/palette';
import { PIECE_LOOKS, type PieceLook, type PlacedMarker, type TransientLook } from '../activities/markerLooks';
import { disposePieces, makePiece } from '../activities/pieceMeshes';

/** Most transient markers any activity needs at once: a slide's edge stakes, or the kite's line and lift. */
const POOL = 64;

/**
 * A flat arrow, nose up (+Y), face toward +Z, centred on its middle. Turned to face the camera and
 * rolled toward where it points, it reads like a road sign: up is "ahead", sideways is "turn". The old
 * pointer was a flat wedge lying level, seen almost edge-on by a camera behind and above it, and it
 * looked the same pointing forward or back. `back` pushes it behind its face, for the dark rim.
 */
function arrowGeometry(scale: number, back: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0.9);
  s.lineTo(0.74, 0.08);
  s.lineTo(0.27, 0.08);
  s.lineTo(0.27, -0.9);
  s.lineTo(-0.27, -0.9);
  s.lineTo(-0.27, 0.08);
  s.lineTo(-0.74, 0.08);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: false }).translate(0, 0, -0.05 - back).scale(scale, scale, 1);
}

/** Hollis's mitten, flat, thumb out to one side, cuff at the top where the hook has it. Faces +Z. */
function mittenGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.24, 0.32);
  s.lineTo(0.24, 0.32);
  s.lineTo(0.24, 0.06);
  s.lineTo(0.42, -0.02);
  s.lineTo(0.44, -0.2);
  s.lineTo(0.27, -0.2);
  s.lineTo(0.27, -0.44);
  s.lineTo(0.16, -0.6);
  s.lineTo(-0.16, -0.6);
  s.lineTo(-0.27, -0.44);
  s.lineTo(-0.27, 0.06);
  s.lineTo(-0.24, 0.06);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: false }).translate(0, 0, -0.08);
}

interface Prototype {
  geometry: THREE.BufferGeometry;
  color: string;
  /** Colour at strength 0, when fading toward it reads better than darkening. */
  dim?: string;
  /** Metres added to the ground offset so the marker is not half-buried. */
  lift: number;
}

const PROTOTYPES: Readonly<Record<MarkerShape | TransientLook, Prototype>> = {
  ring: { geometry: new THREE.TorusGeometry(1.1, 0.16, 6, 12), color: PALETTE.LANTERN, lift: 1.6 },
  post: { geometry: new THREE.CylinderGeometry(0.16, 0.22, 2.2, 5), color: PALETTE.BARK, lift: 1.1 },
  float: { geometry: new THREE.SphereGeometry(0.26, 6, 5), color: PALETTE.SNOW_HI, lift: 0.3 },
  lump: { geometry: new THREE.IcosahedronGeometry(0.62, 0), color: PALETTE.SNOW_MID, lift: 0.34 },
  // A race gate: an upright hoop you run through, faced along the course by `yaw`. Big and thick
  // enough to read between trunks at 384 x 216.
  arch: { geometry: new THREE.TorusGeometry(2, 0.26, 5, 16), color: PALETTE.LANTERN, dim: PALETTE.SNOW_SH, lift: 2.1 },
  // A shaft of light from the next gate up past the tops of the pines, so it can be found over a
  // ridge line or through a wood.
  beam: { geometry: new THREE.CylinderGeometry(0.24, 0.24, 40, 5), color: PALETTE.LANTERN, lift: 20 },
  // The race and photo pointer, and a dark rim drawn just behind it so it reads on snow and on sky.
  arrow: { geometry: arrowGeometry(1, 0), color: PALETTE.LANTERN, lift: 0 },
  'arrow-rim': { geometry: arrowGeometry(1.24, 0.08), color: PALETTE.SHADOW_FLOOR, lift: 0 },
  // A crest light for the kite: big enough to read at twenty metres, a cold blue until it is cleared.
  beacon: { geometry: new THREE.OctahedronGeometry(0.42, 0), color: PALETTE.LANTERN, dim: PALETTE.SNOW_NIGHT, lift: 0 },
  // A caught fish, nose along +Z; its colours come from the journal's own table (spec.color).
  fish: { geometry: new THREE.OctahedronGeometry(1, 0).scale(0.12, 0.26, 0.5), color: PALETTE.ROCK_LT, lift: 0 },
  fin: { geometry: new THREE.ConeGeometry(0.24, 0.32, 3).rotateX(-Math.PI / 2).scale(0.3, 1, 1), color: PALETTE.ROCK_MID, lift: 0 },
  // A wind line rising in the kite's lift: thin and upright, a blue that reads on snow and on sky.
  streak: { geometry: new THREE.BoxGeometry(0.1, 1.3, 0.1), color: PALETTE.SNOW_NIGHT, dim: PALETTE.SNOW_SH, lift: 0 },
  // A ring laid flat on the snow round a photo's subject, so "it" is the thing standing in it.
  halo: { geometry: new THREE.TorusGeometry(1, 0.045, 4, 24).rotateX(Math.PI / 2), color: PALETTE.LANTERN, dim: PALETTE.SNOW_SH, lift: 0.06 },
  hoop: { geometry: new THREE.TorusGeometry(2, 0.18, 5, 16), color: PALETTE.AURORA_G, dim: PALETTE.SNOW_SH, lift: 3 },
  'lamp-post': { geometry: new THREE.CylinderGeometry(0.09, 0.13, 2.3, 5), color: PALETTE.WOOD_DK, lift: 1.15 },
  lamp: { geometry: new THREE.OctahedronGeometry(0.34, 0), color: PALETTE.LANTERN, dim: PALETTE.ROCK_DK, lift: 2.55 },
  shot: { geometry: new THREE.IcosahedronGeometry(0.3, 0), color: PALETTE.SNOW_HI, lift: 0 },
  pinecone: { geometry: new THREE.OctahedronGeometry(0.3, 0), color: PALETTE.WOOD_LT, lift: 0 },
  // Aim line and build cue. Lantern-coloured: a white dot vanishes against snow.
  dot: { geometry: new THREE.OctahedronGeometry(0.14, 0), color: PALETTE.LANTERN, dim: PALETTE.SNOW_DEEP, lift: 0 },
  puff: { geometry: new THREE.IcosahedronGeometry(0.45, 0), color: PALETTE.SNOW_HI, lift: 0 },
  // A painted target post, red so it reads against snow; it fades to rock grey once knocked flat.
  target: { geometry: new THREE.CylinderGeometry(0.26, 0.3, 2, 6), color: PALETTE.PIP_SCARF, dim: PALETTE.ROCK_MID, lift: 1 },
  // A flat ring that grows out from something struck: the bell "rang".
  pulse: { geometry: new THREE.TorusGeometry(1, 0.08, 4, 16), color: PALETTE.LANTERN, lift: 0 },
  mitten: { geometry: mittenGeometry(), color: PALETTE.PIP_SCARF, lift: 0 },
  // A slide's edge stake: knee-high, red fading to snow-blue down the line ahead.
  stake: { geometry: new THREE.CylinderGeometry(0.08, 0.1, 1.1, 4), color: PALETTE.PIP_SCARF, dim: PALETTE.SNOW_SH, lift: 0.55 },
  // The board Pip rides down a slide: a plank under the feet, long along the direction of travel.
  sled: { geometry: new THREE.BoxGeometry(0.85, 0.16, 1.6), color: PALETTE.WOOD_MID, lift: 0.06 },
  // Sable's kite: a diamond, flat to the wind, red so it reads against sky and snow alike.
  kite: { geometry: new THREE.OctahedronGeometry(0.9, 0).scale(1, 1.3, 0.12), color: PALETTE.PIP_SCARF, lift: 0 },
};

export interface ActivityMarkerLayer {
  readonly object: THREE.Object3D;
  /** Show exactly these markers and hide the rest. Kept pieces update their own group only. */
  sync(specs: readonly MarkerSpec[]): void;
  /** Hide the transient markers. Kept pieces stay standing. */
  clear(): void;
  /** Put kept pieces back without an activity running, e.g. a finished build after a reload. */
  restore(specs: readonly MarkerSpec[]): void;
  dispose(): void;
}

function place(obj: THREE.Object3D, spec: PlacedMarker, lift: number): void {
  obj.position.set(spec.x, spec.y + lift, spec.z);
  obj.rotation.order = 'YXZ';
  obj.rotation.set(spec.pitch ?? 0, spec.yaw ?? 0, spec.tilt ?? 0);
}

export function createActivityMarkers(): ActivityMarkerLayer {
  const group = new THREE.Group();
  group.name = 'activity-markers';
  const keptRoot = new THREE.Group();
  keptRoot.name = 'activity-pieces';
  group.add(keptRoot);
  const kept = new Map<string, THREE.Group>();

  const meshes: THREE.Mesh[] = [];
  const base = new THREE.Color();
  const dim = new THREE.Color();
  for (let i = 0; i < POOL; i++) {
    const material = new THREE.MeshBasicMaterial({ color: PALETTE.SNOW_HI, fog: true });
    const mesh = new THREE.Mesh(PROTOTYPES.lump.geometry, material);
    mesh.visible = false;
    group.add(mesh);
    meshes.push(mesh);
  }

  const clear = (): void => {
    for (const m of meshes) m.visible = false;
  };

  /** Replace each group named in `specs` with exactly its pieces; reuse meshes where the look matches. */
  const syncKept = (specs: readonly PlacedMarker[]): void => {
    const byKey = new Map<string, PlacedMarker[]>();
    for (const s of specs) {
      if (s.keep === undefined) continue;
      const list = byKey.get(s.keep) ?? [];
      if (s.look !== 'empty') list.push(s);
      byKey.set(s.keep, list);
    }
    for (const [key, list] of byKey) {
      let g = kept.get(key);
      if (!g) {
        g = new THREE.Group();
        g.name = `pieces:${key}`;
        kept.set(key, g);
        keptRoot.add(g);
      }
      while (g.children.length > list.length) g.remove(g.children[g.children.length - 1]);
      list.forEach((spec, i) => {
        const look = spec.look && PIECE_LOOKS.has(spec.look) ? (spec.look as PieceLook) : 'snowball';
        if (g.children[i]?.name !== `piece:${look}`) {
          // The looks changed from this slot on: drop the tail and rebuild it, in order.
          while (g.children.length > i) g.remove(g.children[g.children.length - 1]);
          const fresh = makePiece(look);
          if (fresh) g.add(fresh);
        }
        const child = g.children[i];
        if (!child) return;
        place(child, spec, 0);
        child.scale.setScalar(spec.size ?? 1);
      });
    }
  };

  return {
    object: group,
    sync(specs): void {
      clear();
      const all = specs as readonly PlacedMarker[];
      syncKept(all);
      let slot = 0;
      for (const spec of all) {
        if (spec.keep !== undefined || (spec.look && PIECE_LOOKS.has(spec.look))) continue;
        if (slot >= POOL) break;
        const proto = PROTOTYPES[(spec.look as TransientLook | undefined) ?? spec.shape];
        const mesh = meshes[slot++];
        const strength = spec.strength ?? 1;
        mesh.geometry = proto.geometry;
        place(mesh, spec, proto.lift);
        if (spec.yaw === undefined && !spec.look) mesh.rotation.y = slot * 0.7;
        mesh.scale.setScalar(spec.size ?? 0.72 + 0.28 * strength);
        const color = (mesh.material as THREE.MeshBasicMaterial).color;
        base.set(spec.color ?? proto.color);
        if (proto.dim) color.copy(dim.set(proto.dim)).lerp(base, strength);
        else color.copy(base).multiplyScalar(0.5 + 0.5 * strength);
        mesh.visible = true;
      }
    },
    clear,
    restore(specs): void {
      syncKept(specs as readonly PlacedMarker[]);
    },
    dispose(): void {
      for (const proto of Object.values(PROTOTYPES)) proto.geometry.dispose();
      for (const m of meshes) (m.material as THREE.Material).dispose();
      disposePieces();
      kept.clear();
      group.clear();
    },
  };
}
