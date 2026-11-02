/** Small helpers for UI code that builds HTML and SVG as strings. */

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/** Escape text for an element body or a double-quoted attribute. */
export const esc = (s: string): string => s.replace(/[&<>"]/g, (ch) => ENTITIES[ch] ?? ch);
