/**
 * Where the interact prompt stands on screen: over the thing E will reach, not under Pip.
 *
 * The prompt used to sit at a fixed spot under the bird's feet, so with Bram and his woodpile both in
 * reach, or two villagers side by side, nothing said which one the press would go to. Now it is pinned
 * above the target's head (a villager's real body top, measured once) or above the prop's spot, and
 * follows it as the camera moves. Returns null when the point is behind the camera; the HUD then
 * falls back to the old place under Pip.
 */

import * as THREE from 'three';
import type { Interactable } from '../../core/contracts';

/** Clearance over a villager's head, in world units. */
const OVER_HEAD = 0.45;
/** Height of the prompt over a prop or post that has no measured body. */
const PROP_TOP: Readonly<Record<string, number>> = { activity: 1.5, lantern: 2.4, pickup: 0.8 };
/** Keep the pill this far inside the window, in CSS pixels. */
const EDGE = 48;

export type PromptAnchor = ((target: Interactable) => { x: number; y: number } | null) & {
  /**
   * Did a tap at canvas pixel (x, y) land on the target: anywhere from its feet up to its prompt, with
   * a finger's width either side. Touch players interact by tapping the thing itself.
   */
  hit(target: Interactable, x: number, y: number): boolean;
};

/** Half the width of the tap zone round a target, CSS pixels: a fingertip, at least. */
const TAP_HALF = 44;

export function createPromptAnchor(
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
  bodies: ReadonlyMap<string, THREE.Object3D>,
): PromptAnchor {
  const tops = new Map<string, number>();
  const box = new THREE.Box3();
  const v = new THREE.Vector3();

  const topOf = (t: Interactable): number => {
    const body = t.kind === 'npc' ? bodies.get(t.id) : undefined;
    if (!body) return t.pos.y + (PROP_TOP[t.kind] ?? 1.5);
    let top = tops.get(t.id);
    if (top === undefined) {
      top = box.setFromObject(body).max.y;
      tops.set(t.id, top);
    }
    return top + OVER_HEAD;
  };

  const screen = (x: number, y: number, z: number): { x: number; y: number } | null => {
    v.set(x, y, z).project(camera);
    if (v.z > 1) return null;
    return { x: (v.x * 0.5 + 0.5) * canvas.clientWidth, y: (-v.y * 0.5 + 0.5) * canvas.clientHeight };
  };

  const hit = (t: Interactable, x: number, y: number): boolean => {
    camera.updateMatrixWorld();
    const at = t.anchor ?? t.pos;
    const foot = screen(at.x, at.y, at.z);
    const head = screen(at.x, topOf(t) - t.pos.y + at.y, at.z);
    if (!foot || !head) return false;
    // Distance from the tap to the upright segment foot..head, against a half-width that grows a little
    // with how tall the target stands on screen.
    const dx = head.x - foot.x, dy = head.y - foot.y;
    const len2 = dx * dx + dy * dy || 1;
    const k = Math.max(0, Math.min(1, ((x - foot.x) * dx + (y - foot.y) * dy) / len2));
    const half = Math.max(TAP_HALF, Math.sqrt(len2) * 0.3);
    return Math.hypot(x - (foot.x + k * dx), y - (foot.y + k * dy)) <= half;
  };

  const anchor = (t: Interactable): { x: number; y: number } | null => {
    // The rig has just moved the camera this frame; the renderer would only refresh this on draw.
    camera.updateMatrixWorld();
    const at = t.anchor ?? t.pos;
    v.set(at.x, topOf(t) - t.pos.y + at.y, at.z).project(camera);
    if (v.z > 1) return null;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    return {
      x: Math.round(Math.min(w - EDGE, Math.max(EDGE, (v.x * 0.5 + 0.5) * w))),
      y: Math.round(Math.min(h - EDGE, Math.max(EDGE, (-v.y * 0.5 + 0.5) * h))),
    };
  };
  return Object.assign(anchor, { hit });
}
