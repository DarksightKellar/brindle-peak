/**
 * The HUD compass: a strip under the goal with N, E, S and W sliding past as the view turns, the goal's
 * diamond on it at the goal's bearing, and the distance at its end. One row: far targets sit just under
 * the horizon, which is just under the HUD, so every pixel of height here hides the world marker.
 *
 * It used to be a bare rule with a dot on it, read by a critic as "a tiny dot on a short bar", while the
 * line under it said "southeast, 22 u" with nothing on screen saying where south-east was. The strip is
 * the thing a player already knows how to read. The tracked errand (errandLine.ts) gets its own
 * smaller, dimmer diamond hanging under the strip, the same mark the next-step line starts with, so the
 * line needs no compass word: the critic read "northwest, 9 u" as meaning little once the view had
 * turned, and a hollow pip on the strip as nothing at all. Before the first feather is found, a nearby
 * one shows as a feather glyph on the strip (hudFeather.ts decides when).
 *
 * The strip shows half the horizon, 90 degrees either side of the view. A goal behind that pins to the
 * edge of the shorter turn, and a pair of chevrons outside that edge says which way to turn: "behind
 * you" on its own had a critic circling the mast for minutes. Near dead astern the side holds, so the
 * chevrons do not flicker from one end to the other as the bird wobbles.
 */

import { icon } from './icons';

type Point = { x: number; z: number };

export interface CompassView {
  from: Point;
  /** Camera yaw in radians. Everything here is relative to the VIEW, not to Pip's body. */
  viewYaw: number;
  /** The goal: the filled diamond and the distance. Null hides both. */
  goal: Point | null;
  /** Distance to show for the goal when it is not the straight line to `goal` (a route's walk). */
  goalDistance?: number;
  /** The tracked errand's step, when it is not the goal: a smaller, dimmer diamond under the strip. */
  side: Point | null;
  /** A feather worth noticing: a feather glyph on the strip. */
  feather: Point | null;
  /**
   * Things to do nearby and not yet done (hudNearby.ts): a small green diamond each, the world gem's
   * colour. Shown only while in front of the view; they do not pin to the edges like the goal.
   */
  todo?: readonly Point[];
  /**
   * The other live errands' next places, nearest first (errandLine.ts `others`): a small hollow amber
   * diamond each under the strip, beside the followed errand's filled one. In front of the view only.
   */
  errands?: readonly Point[];
}

export interface HudCompass {
  update(v: CompassView): void;
  setVisible(visible: boolean): void;
}

/** Bearing of a target relative to the view, in radians: 0 straight ahead, positive to the right. */
export function bearing(dx: number, dz: number, viewYaw: number): number {
  /*
   * A dot product against the camera's own basis, not a subtraction of angles. The angle form shipped
   * inverted: a target 40 u due "right" of the view measured genuinely left. With view yaw y, forward
   * is (sin y, cos y) and screen-right is (-cos y, sin y).
   */
  const fx = Math.sin(viewYaw), fz = Math.cos(viewYaw);
  const rx = -Math.cos(viewYaw), rz = Math.sin(viewYaw);
  return Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
}

/** The compass heading the view faces, radians clockwise from north (+x east, -z north). */
export function viewHeading(viewYaw: number): number {
  return Math.atan2(Math.sin(viewYaw), -Math.cos(viewYaw));
}

const HALF = Math.PI / 2;
/** Share of the strip's half-width a mark may travel, so an edge mark is not cut by the border. */
const REACH = 46;
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const leftOf = (rel: number): string => `${(50 + (Math.max(-HALF, Math.min(HALF, rel)) / HALF) * REACH).toFixed(1)}%`;
/** Within this of dead astern the turn cue keeps the side it already shows. */
const ASTERN = (Math.PI * 5) / 6;

/** Most things-to-do marks the strip draws at once. */
const TODO_MAX = 4;
/** Most other-errand marks the strip draws at once. */
const ERRAND_MAX = 3;

/** Eight named points and a tick every 15 degrees between them. */
const NAMES: Readonly<Record<number, string>> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };

export function createHudCompass(layer: HTMLElement): HudCompass {
  const el = document.createElement('div');
  el.className = 'ui-hud__compass';
  const band = document.createElement('div');
  band.className = 'ui-hud__compass-band';
  const ticks: { el: HTMLElement; at: number }[] = [];
  for (let deg = 0; deg < 360; deg += 15) {
    const t = document.createElement('span');
    const name = NAMES[deg];
    t.className = name ? `ui-hud__compass-pt${name.length === 1 ? ' is-cardinal' : ''}${deg === 0 ? ' is-north' : ''}` : 'ui-hud__compass-tick';
    if (name) t.textContent = name;
    band.appendChild(t);
    ticks.push({ el: t, at: (deg * Math.PI) / 180 });
  }
  el.appendChild(band);
  el.insertAdjacentHTML(
    'beforeend',
    '<i class="ui-hud__compass-ahead"></i>' +
      '<i class="ui-hud__compass-side" hidden></i>' +
      `<span class="ui-hud__compass-feather" hidden>${icon('feather', 12)}</span>` +
      '<i class="ui-hud__compass-mark" hidden></i>' +
      '<span class="ui-hud__compass-turn" hidden><i></i><i></i></span>' +
      '<span class="ui-hud__compass-dist" hidden></span>',
  );
  layer.appendChild(el);
  const mark = el.querySelector('.ui-hud__compass-mark') as HTMLElement;
  const dist = el.querySelector('.ui-hud__compass-dist') as HTMLElement;
  const side = el.querySelector('.ui-hud__compass-side') as HTMLElement;
  const feather = el.querySelector('.ui-hud__compass-feather') as HTMLElement;
  const turn = el.querySelector('.ui-hud__compass-turn') as HTMLElement;
  const todo: HTMLElement[] = [];
  for (let i = 0; i < TODO_MAX; i++) {
    const t = document.createElement('i');
    t.className = 'ui-hud__compass-todo';
    t.hidden = true;
    el.insertBefore(t, mark);
    todo.push(t);
  }
  const others: HTMLElement[] = [];
  for (let i = 0; i < ERRAND_MAX; i++) {
    const t = document.createElement('i');
    t.className = 'ui-hud__compass-errand';
    t.hidden = true;
    el.insertBefore(t, side);
    others.push(t);
  }
  /** Marks that ride in front of the view only, never pinned to an edge. */
  const ahead = (nodes: readonly HTMLElement[], points: readonly Point[] | undefined, v: CompassView): void => {
    for (const [i, node] of nodes.entries()) {
      const at = points?.[i];
      const rel = at ? bearing(at.x - v.from.x, at.z - v.from.z, v.viewYaw) : 0;
      const shown = at !== undefined && Math.abs(rel) <= HALF;
      if (shown) node.style.left = leftOf(rel);
      if (node.hidden === shown) node.hidden = !shown;
    }
  };
  /** -1 turn left, 1 turn right, 0 the goal is in front. */
  let turnSide = 0;

  /** Place `node` at `target`'s bearing, or hide it. Returns the relative bearing, or null. */
  const place = (node: HTMLElement, target: Point | null, v: CompassView): number | null => {
    if (!target) {
      if (!node.hidden) node.hidden = true;
      return null;
    }
    let rel = bearing(target.x - v.from.x, target.z - v.from.z, v.viewYaw);
    // The goal's diamond pins to the side the turn cue shows, so the two never point opposite ways.
    if (node === mark && turnSide !== 0 && Math.abs(rel) > ASTERN) rel = turnSide * Math.abs(rel);
    node.style.left = leftOf(rel);
    node.classList.toggle('is-behind', Math.abs(rel) > HALF);
    if (node.hidden) node.hidden = false;
    return rel;
  };

  const showTurn = (side: number): void => {
    if (side === turnSide) return;
    turnSide = side;
    turn.hidden = side === 0;
    el.classList.toggle('is-turn-left', side < 0);
    el.classList.toggle('is-turn-right', side > 0);
  };

  let lastDist = '';
  return {
    update(v: CompassView): void {
      const heading = viewHeading(v.viewYaw);
      for (const t of ticks) {
        const rel = wrap(t.at - heading);
        const shown = Math.abs(rel) <= HALF;
        if (shown) t.el.style.left = leftOf(rel);
        t.el.style.visibility = shown ? '' : 'hidden';
      }
      place(side, v.side, v);
      place(feather, v.feather, v);
      ahead(todo, v.todo, v);
      ahead(others, v.errands, v);
      const rel = place(mark, v.goal, v);
      if (rel === null || v.goal === null) {
        dist.hidden = true;
        showTurn(0);
        return;
      }
      // Behind, the pinned diamond alone reads as "over there, a bit": the chevrons say which way round.
      const behind = Math.abs(rel) > HALF;
      showTurn(!behind ? 0 : turnSide !== 0 && Math.abs(rel) > ASTERN ? turnSide : Math.sign(rel) || 1);
      const text = `${Math.round(v.goalDistance ?? Math.hypot(v.goal.x - v.from.x, v.goal.z - v.from.z))} u${behind ? ' · behind you' : ''}`;
      if (text !== lastDist) {
        lastDist = text;
        dist.textContent = text;
      }
      dist.hidden = false;
    },
    setVisible(visible: boolean): void {
      el.hidden = !visible;
    },
  };
}
