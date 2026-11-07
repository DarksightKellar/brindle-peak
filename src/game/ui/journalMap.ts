/**
 * The map page (docs/GUIDE.md §2): a hand-drawn trail map, not a satellite view.
 *
 * It used to be seven dashed circles, and then contours under a dark wash with a ? over every zone not
 * yet walked — which a new player ten minutes in still read as "anonymous circles with ?". A trail map
 * you buy at a hut names every place and draws the whole path from the first look. Back to front:
 *
 *   the land           contour lines from the real heightfield (mapRelief.ts) and the frozen lake
 *   the trail          the whole valley path, faint; brighter where it runs through ground you walked
 *   the two anchors    the cabin (home) and the mast (the goal), always
 *   the places         every zone named at its heart: bright once walked, quiet until then
 *   what you found     a dot per person met; a glyph per thing to do in walked ground (mapMarks.ts)
 *   where next         the story's pin, the same target the compass points at, and the tracked
 *                      errand's smaller one, the same step the line under the compass names
 *   where am I         a bird-shaped arrow at the player's position, turned by `facing`
 *
 * The frame is fitted to the walkable valley, which is taller than it is wide, so the page spends its
 * pixels on land rather than on empty margin; the key sits beside it.
 *
 * Cost rule: this builds a string once per paint. `journal.ts` paints on open and when the state
 * signature changes, never from `update()`. The relief is traced once and cached by the caller.
 * `data-builds` carries the paint count so a harness can prove it.
 */

import type { GameState } from '../../core/contracts';
import type { GuideContent, GuideStep } from '../../core/guide/nextStep';
import { nextStepFor } from '../../core/guide/nextStep';
import { errandLineFor } from './errandLine';
import { esc } from './html';
import { KIND_GLYPH, SIDE_PIN, activityMarks, sidePin } from './mapMarks';
import type { Relief } from './mapRelief';
import '../../styles/map.css';
import { KEY, TOUCH } from '../../core/keys';

export const VIEW_W = 480;
export const VIEW_H = 520;
/**
 * Pixels per world unit, and the world point at the map's centre. Fitted to everything the map draws:
 * the land the relief keeps (every zone out to 1.1 of its radius: x -456..444, z -472..512) and the
 * lake, which runs right to the valley's south edge. At 0.54 the lake ran off the bottom of the frame
 * and the hearth's rings off the left; at 0.5 the whole of it sits inside with ~14 px to spare.
 */
export const SCALE = 0.5;
const CX = -6;
const CZ = 20;

export const px = (x: number): number => Math.round((VIEW_W / 2 + (x - CX) * SCALE) * 10) / 10;
export const py = (z: number): number => Math.round((VIEW_H / 2 + (z - CZ) * SCALE) * 10) / 10;
/** Map pixel back to the world, for tracing the relief. */
export const worldX = (mx: number): number => (mx - VIEW_W / 2) / SCALE + CX;
export const worldZ = (my: number): number => (my - VIEW_H / 2) / SCALE + CZ;
const one = (n: number): number => Math.round(n * 10) / 10;

/** What the map draws besides state: the land, the path and the two fixed places. */
export interface MapDecor {
  relief: Relief;
  trail: readonly (readonly [number, number])[];
  home: { x: number; z: number };
  goal: { x: number; z: number };
}

/** The hop line over the map (session/travel.ts): the places on offer, the one picked, and any reason not to. */
export interface MapHop {
  places: readonly { zone: string; name: string }[];
  at: string | null;
  blocked: string | null;
}

/** The line above the map that says a walked place can be gone back to, and how. */
function hopLine(hop: MapHop | undefined): string {
  if (!hop || hop.places.length === 0) return '';
  const picked = hop.places.find((p) => p.zone === hop.at);
  if (hop.blocked !== null) return `<p class="ui-map__hop is-blocked">${esc(hop.blocked)}</p>`;
  // On touch a place is picked by tapping its name, and gone to with a second tap (journal.ts).
  if (!picked) {
    return TOUCH
      ? '<p class="ui-map__hop">Tap a place you have walked to go back to it</p>'
      : '<p class="ui-map__hop"><kbd>↑↓</kbd> pick a place you have walked to go back to it</p>';
  }
  return TOUCH
    ? `<p class="ui-map__hop is-picked">Tap <b>${esc(picked.name)}</b> again to go there</p>`
    : `<p class="ui-map__hop is-picked">Go to <b>${esc(picked.name)}</b> <kbd>${KEY.interact}</kbd> · <kbd>↑↓</kbd> another place</p>`;
}

/** Monotonic build count. Diagnostic only: it makes "not per frame" measurable from outside. */
let builds = 0;

/** Place-name type size in map pixels, and the rough advance of one character of it. */
const NAME_SIZE = 13;
const CHAR_W = NAME_SIZE * 0.68;

const PIN = '<circle class="ui-map__pin-ring" r="12"/><path class="ui-map__pin-mark" d="M0 -7 L6 0 L0 7 L-6 0 Z"/>';
const PIP = 'M0 10 L-6 -5 L0 -1 L6 -5 Z';
const HOUSE = 'M-6 1 L0 -5 L6 1 M-4 0 V5 H4 V0';
const MAST = 'M0 -11 V6 M-3.5 6 L0 -11 L3.5 6 M-2.4 -1 H2.4 M-1.4 -6 H1.4';

function pin(step: { target: { x: number; z: number } | null; zone?: string | null; questId?: string | null; stepIndex?: number | null } | null): string {
  if (!step || !step.target) return '';
  const attrs =
    `class="ui-map__pin" data-zone="${esc(step.zone ?? '')}" data-quest="${esc(step.questId ?? '')}" ` +
    `data-step="${step.stepIndex ?? ''}" data-x="${one(step.target.x)}" data-z="${one(step.target.z)}"`;
  return `<g ${attrs} transform="translate(${px(step.target.x)} ${py(step.target.z)})">${PIN}</g>`;
}

/** The story's pin; before the story has begun, the person who starts it. */
function nextPin(s: GameState, content: GuideContent): GuideStep | { target: { x: number; z: number } } | null {
  const main = nextStepFor(s, s.player.pos, content, 'main');
  if (main) return main;
  const opener = content.quests.find((q) => q.main);
  if (opener && !s.quests[opener.id]) {
    const npc = content.npcs.find((n) => n.id === opener.giver);
    if (npc) return { target: npc.pos };
  }
  return nextStepFor(s, s.player.pos, content, 'side');
}

/** Which zone a point belongs to: the nearest centre, measured against its radius. */
function zoneAt(content: GuideContent, x: number, z: number): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const zn of content.zones) {
    const d = Math.hypot(x - zn.centre.x, z - zn.centre.z) / zn.radius;
    if (d < bestD) { bestD = d; best = zn.id; }
  }
  return best;
}

/** The whole trail, faint, and over it the stretches through walked ground, brighter. */
function trailPaths(s: GameState, content: GuideContent, decor: MapDecor): string {
  const walked = (p: readonly [number, number]): boolean => {
    const z = zoneAt(content, p[0], p[1]);
    return z !== null && s.visited[z as keyof typeof s.visited] === true;
  };
  let all = '';
  let mine = '';
  for (let i = 0; i < decor.trail.length - 1; i++) {
    const a = decor.trail[i], b = decor.trail[i + 1];
    const d = `M${px(a[0])} ${py(a[1])}L${px(b[0])} ${py(b[1])}`;
    all += d;
    if (walked(a) && walked(b)) mine += d;
  }
  return `<path class="ui-map__trail is-far" d="${all}"/>` + (mine === '' ? '' : `<path class="ui-map__trail" d="${mine}"/>`);
}

/**
 * Every place named at its heart, kept on the page, and nudged above a home or goal glyph that sits
 * on the same spot. The zone shape itself is not drawn: the zones overlap, and their circles were the
 * "anonymous circles" the page was read as.
 */
function placeNames(s: GameState, content: GuideContent, decor: MapDecor | undefined, hopAt: string | null): string {
  // A name also steps up off the glyphs of things to do (mapMarks.ts), which sit near a zone's heart.
  const acts = content.activities.filter((a) => s.visited[a.zone] === true).map((a) => a.pos);
  const anchors = [...(decor ? [decor.home, decor.goal] : []), ...acts];
  return content.zones
    .map((z) => {
      const seen = s.visited[z.id] === true;
      const name = content.zoneNames[z.id] ?? z.id;
      const half = (name.length * CHAR_W) / 2;
      let x = px(z.centre.x);
      let y = py(z.centre.z) + NAME_SIZE / 3;
      if (anchors.some((a) => Math.abs(px(a.x) - x) < half + 8 && Math.abs(py(a.z) - y) < 16)) y -= 20;
      x = Math.max(half + 6, Math.min(VIEW_W - half - 6, x));
      y = Math.max(NAME_SIZE + 4, Math.min(VIEW_H - 6, y));
      const r = Math.round(z.radius * SCALE);
      // The zone itself stays in the DOM, unpainted, so a harness can still read which ground is walked.
      const hop = z.id === hopAt;
      return `<circle class="ui-map__zone ${seen ? 'is-visited' : 'is-ghost'}${hop ? ' is-hop' : ''}" data-zone="${esc(z.id)}" data-r="${one(r)}" ` +
        `cx="${px(z.centre.x)}" cy="${py(z.centre.z)}" r="${r}"/>` +
        `<text class="ui-map__name${seen ? '' : ' is-unwalked'}${hop ? ' is-hop' : ''}" data-zone="${esc(z.id)}" x="${one(x)}" y="${one(y)}">${esc(name)}</text>`;
    })
    .join('');
}

/** The two lines of the key for the errand pin and the things-to-do glyphs. */
export const MAP_KEY_WORDS = {
  errand: "The small pin is the errand you're on.",
  activity: "Marks like this are things to do. They stay warm until you've done them.",
} as const;

/** The key beside the map: each sentence of the authored caption next to the mark it describes. */
function legend(lead = ''): string {
  const mark = (body: string): string => `<svg class="ui-map__key-mark" viewBox="-12 -12 24 24" aria-hidden="true">${body}</svg>`;
  return (
    `<figcaption class="ui-map__caption">${lead}<ul class="ui-map__key">` +
    // Own classes, not `.ui-map__pip` / `.ui-map__pin`: harnesses find the real marks by those.
    `<li>${mark(`<path class="ui-map__key-pip" d="${PIP}"/>`)}<span>The arrow is you.</span></li>` +
    `<li>${mark(`<g class="ui-map__key-pin">${PIN}</g>`)}<span>The pin is your next step.</span></li>` +
    `<li>${mark(`<g transform="translate(0 10)">${SIDE_PIN}</g>`)}<span>${esc(MAP_KEY_WORDS.errand)}</span></li>` +
    `<li>${mark(`<path class="ui-map__act is-todo" d="${KIND_GLYPH.fish}"/>`)}<span>${esc(MAP_KEY_WORDS.activity)}</span></li>` +
    `<li>${mark(`<path class="ui-map__home" d="${HOUSE}" transform="translate(-5 0)"/><path class="ui-map__goal" d="${MAST}" transform="translate(6 0)"/>`)}` +
    '<span>The house is home; the mast is on Brindle Peak.</span></li>' +
    '</ul></figcaption>'
  );
}

export function mapHTML(s: GameState, content: GuideContent, decor?: MapDecor, hop?: MapHop): string {
  builds += 1;
  const visited = content.zones.filter((z) => s.visited[z.id] === true).length;

  const land = decor
    ? `<path class="ui-map__water" d="${decor.relief.water}"/><path class="ui-map__contour" d="${decor.relief.lines}"/><path class="ui-map__contour is-index" d="${decor.relief.index}"/>`
    : '';

  const anchors = decor
    ? `<path class="ui-map__home" transform="translate(${px(decor.home.x)} ${py(decor.home.z)})" d="${HOUSE}"/>` +
      `<path class="ui-map__goal" transform="translate(${px(decor.goal.x)} ${py(decor.goal.z)})" d="${MAST}"/>`
    : '';

  // People met, and a glyph for each thing to do in walked ground (mapMarks.ts).
  const found =
    content.npcs
      .filter((n) => s.talked[n.id] === true)
      .map((n) => `<circle class="ui-map__found" cx="${px(n.pos.x)}" cy="${py(n.pos.z)}" r="2.6"/>`)
      .join('') + activityMarks(s, content, px, py);
  const main = nextPin(s, content);

  const facing = Math.round((-s.player.facing * 180) / Math.PI);
  const pip =
    `<g class="ui-map__pip" data-x="${one(s.player.pos.x)}" data-z="${one(s.player.pos.z)}" ` +
    `data-facing="${one(s.player.facing)}" transform="translate(${px(s.player.pos.x)} ${py(s.player.pos.z)}) rotate(${facing})">` +
    `<path d="${PIP}"/></g>`;

  return (
    `<figure class="ui-map" role="img" data-builds="${builds}" ` +
    `aria-label="Trail map of the valley. ${visited} of ${content.zones.length} zones walked; ` +
    `the arrow is you, the pin is your next step.">` +
    `<svg class="ui-map__svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" xmlns="http://www.w3.org/2000/svg">` +
    `<g class="ui-map__land">${land}</g>` +
    `${decor ? trailPaths(s, content, decor) : ''}${anchors}` +
    `<g class="ui-map__zones">${placeNames(s, content, decor, hop?.at ?? null)}</g>` +
    `<g class="ui-map__found-layer">${found}</g>` +
    `${sidePin(errandLineFor(content).current(), main?.target ?? null, px, py)}${pin(main)}${pip}` +
    `</svg>${legend(hopLine(hop))}</figure>`
  );
}
