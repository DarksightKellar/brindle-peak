/**
 * 12x12 inline SVG icon set (ART_BIBLE §9). Strings only — no DOM — so the unit tests can
 * assert every glyph without a browser.
 *
 * Every path is drawn on a 12 px grid with 1 px strokes so it survives the nearest-neighbour
 * upsample. Colour comes from `currentColor`; the icons never carry a hue of their own.
 */

const wrap = (body: string, size: number): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 12 12" ` +
  'fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="square" ' +
  `stroke-linejoin="miter" aria-hidden="true" focusable="false">${body}</svg>`;

const GLYPHS: Readonly<Record<string, string>> = {
  feather: '<path d="M2 10 9 3"/><path d="M9 3H5M9 3v4"/><path d="M3.5 7 5 5.5M6 10l2.5-2.5"/>',
  bell: '<path d="M4 8V5a2 2 0 0 1 4 0v3"/><path d="M2.5 8h7"/><path d="M5.5 10h1"/>',
  lantern:
    '<path d="M4.5 2h3"/><path d="M5 2v1h2V2"/><path d="M3.5 3.5h5V9h-5z"/><path d="M5 5.5v2M7 5.5v2"/><path d="M4.5 9.5h3"/>',
  quest: '<path d="M3 3h6v7H3z"/><path d="M4.5 5h3M4.5 7h3"/>',
  fish: '<path d="M2 6c2-2.5 5-2.5 7 0-2 2.5-5 2.5-7 0z"/><path d="M9 6l1.5-1.5v3z"/><path d="M4 5.5h1"/>',
  achievement: '<path d="M6 2l1.4 2.6 2.6.4-1.9 1.9.5 2.6L6 8.3 3.4 9.5 3.9 6.9 2 5l2.6-.4z"/>',
  star: '<path d="M6 2v8M2 6h8M3.2 3.2l5.6 5.6M8.8 3.2 3.2 8.8"/>',
  lock: '<path d="M4 6V4.5a2 2 0 0 1 4 0V6"/><path d="M3 6h6v4H3z"/>',
  snowflake: '<path d="M6 1v10M1.5 3.5l9 5M10.5 3.5l-9 5"/>',
  camera: '<path d="M2 4.5h8v5H2z"/><path d="M4.5 4.5V3h3v1.5"/><path d="M6 8.2a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8z"/>',
  mountain: '<path d="M1 9.5 4.5 4l2 3L8 5.5l3 4z"/><path d="M3.3 6 4.5 7.2 5.6 6"/>',
  menu: '<path d="M2 4h8M2 6h8M2 8h8"/>',
  close: '<path d="M3 3l6 6M9 3l-6 6"/>',
  arrow: '<path d="M2 6h8M7 3l3 3-3 3"/>',
  key: '<path d="M4 8.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path d="M6 6h4M8 6v2M10 6v1.5"/>',
  settings: '<path d="M2 4h8M2 8h8"/><path d="M5 2.5v3M8 6.5v3"/>',
  volume: '<path d="M2 5h2l2-2v6L4 7H2z"/><path d="M8 4.5a2.5 2.5 0 0 1 0 3"/><path d="M9.5 3.5a4.5 4.5 0 0 1 0 5"/>',
  pixel: '<path d="M2 2h4v4H2zM6 6h4v4H6z"/>',
  motion: '<path d="M2 6h6"/><path d="M7 3l3 3-3 3"/><path d="M3 3.5h3M3 8.5h3"/>',
  book: '<path d="M2 2.5h4v7H2zM6 2.5h4v7H6z"/><path d="M3.2 4.5h1.6M3.2 6h1.6M7.2 4.5h1.6"/>',
  check: '<path d="M2.5 6.5 5 9l4.5-5.5"/>',
  dot: '<path d="M6 5.5h1v1H6z" fill="currentColor" stroke="none"/>',
};

/** Names worth knowing about when wiring content. Unknown names fall back to a dot. */
export const ICON_NAMES: readonly string[] = Object.keys(GLYPHS);

/**
 * Inline SVG for `name` at `size` px (default 12, clamped to 8..96 integers).
 * Always returns a non-empty `<svg>` string — never `undefined` — even for a bad name.
 */
export function icon(name: string, size = 12): string {
  const px = Math.max(8, Math.min(96, Math.round(size) || 12));
  const body = GLYPHS[name] ?? GLYPHS['dot'];
  return wrap(body, px);
}
