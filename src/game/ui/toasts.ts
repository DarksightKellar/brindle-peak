/**
 * Toasts — four volumes, not one (GDD R5 / ART_BIBLE §9).
 *
 *   pickup    no toast at all; the caller owns the feedback. push() returns immediately.
 *   discovery one small line, no icon frame, no sound hook, 3 s.
 *   milestone icon + name + one line, 2.4 s.
 *   finale    same as milestone, larger, 3.5 s.
 *
 * Max three on screen; a new toast lifts the older ones up and the quietest tier is the one
 * evicted first, so a finale never loses its slot to a feather.
 *
 * `ToastQueue` is pure and DOM-free; `createToasts` renders it.
 *
 * Toasts earned in a conversation wait until it closes, then arrive one at a time. Saying hello to
 * Nana used to drop three at once behind the dialogue panel, gone before the panel was.
 */

import type { RewardTier } from '../../core/contracts';
import { icon as svgIcon } from './icons';

export const MAX_TOASTS = 3;
export const TOAST_LIFE: Readonly<Record<RewardTier, number>> = {
  pickup: 0,
  // 1.8 s was gone before it could be read: "Got: Nana's Camera" was fading out as the next toast arrived.
  discovery: 3,
  milestone: 2.4,
  finale: 3.5,
};
/** Louder tiers survive a full stack. */
export const TOAST_RANK: Readonly<Record<RewardTier, number>> = {
  pickup: 0,
  discovery: 1,
  milestone: 2,
  finale: 3,
};
export const TOAST_SLIDE_MS = 180;
/** Seconds between toasts released from the waiting line. */
export const TOAST_GAP = 0.5;
export const TOAST_FADE_MS = 240;

export interface ToastItem {
  readonly id: number;
  readonly text: string;
  readonly icon: string;
  readonly tier: RewardTier;
  age: number;
  readonly life: number;
}

export class ToastQueue {
  private readonly items: ToastItem[] = [];
  private nextId = 1;

  /** Adds a toast. Returns the item, or null when the tier is silent or nothing was evicted. */
  push(text: string, glyph: string, tier: RewardTier): ToastItem | null {
    if (tier === 'pickup' || TOAST_LIFE[tier] <= 0 || text.trim() === '') return null;

    if (this.items.length >= MAX_TOASTS) {
      /*
       * The newest reward wins. This used to refuse a newcomer whenever nothing on screen was
       * quieter, so finishing an activity while three milestone toasts were up produced no
       * confirmation at all — the exact moment the toast exists for.
       *
       * What is still protected is a finale: if everything on screen outranks the newcomer, the
       * newcomer is dropped. Otherwise the oldest toast of equal-or-lower rank gives way.
       */
      let weakest = 0;
      for (let i = 1; i < this.items.length; i++) {
        if (TOAST_RANK[this.items[i].tier] < TOAST_RANK[this.items[weakest].tier]) weakest = i;
      }
      // Drop the quietest thing on screen — ties go to the oldest — so the newcomer is seen without
      // losing something louder. Only a newcomer quieter than everything already up is refused, which
      // is what keeps a finale from being displaced by a passing discovery.
      if (TOAST_RANK[tier] < TOAST_RANK[this.items[weakest].tier]) return null;
      this.items.splice(weakest, 1);
    }

    const item: ToastItem = {
      id: this.nextId++,
      text: text.trim(),
      icon: glyph,
      tier,
      age: 0,
      life: TOAST_LIFE[tier],
    };
    this.items.push(item);
    return item;
  }

  /** Ages every toast and returns the ids that expired this tick (oldest first). */
  update(dt: number): number[] {
    const gone: number[] = [];
    for (const it of this.items) {
      it.age += dt;
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (this.items[i].age >= this.items[i].life) gone.unshift(this.items[i].id);
    }
    for (const id of gone) {
      const at = this.items.findIndex((i) => i.id === id);
      if (at >= 0) this.items.splice(at, 1);
    }
    return gone;
  }

  /** Oldest first, i.e. top to bottom on screen. */
  list(): readonly ToastItem[] {
    return this.items;
  }

  get size(): number {
    return this.items.length;
  }

  clear(): void {
    this.items.length = 0;
  }
}

/** Milestone toasts carry "Name — one line" in a single string; split it for the two slots. */
export function splitToast(text: string): { name: string; line: string } {
  const at = text.indexOf(' — ');
  if (at < 0) return { name: text, line: '' };
  return { name: text.slice(0, at), line: text.slice(at + 3) };
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

export interface Toasts {
  push(text: string, icon: string, tier: RewardTier): void;
  /** `held`: something is being read (a conversation), so new toasts wait for it to close. */
  update(dt: number, held?: boolean): void;
  destroy(): void;
}

export function createToasts(root: HTMLElement): Toasts {
  const queue = new ToastQueue();
  const reduced = prefersReducedMotion();
  const layer = document.createElement('div');
  layer.className = 'ui-toasts';
  layer.setAttribute('role', 'status');
  layer.setAttribute('aria-live', 'polite');
  if (reduced) layer.classList.add('is-reduced');
  root.appendChild(layer);

  const nodes = new Map<number, HTMLElement>();
  const waiting: { text: string; glyph: string; tier: RewardTier }[] = [];
  let gap = 0;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const retire = (id: number): void => {
    const node = nodes.get(id);
    if (!node) return;
    nodes.delete(id);
    node.classList.add('is-out');
    const t = setTimeout(() => {
      timers.delete(t);
      node.remove();
    }, reduced ? 0 : TOAST_FADE_MS);
    timers.add(t);
  };

  const build = (item: ToastItem): HTMLElement => {
    const el = document.createElement('div');
    const quiet = item.tier === 'discovery';
    el.className = `ui-toast ui-toast--${item.tier}${quiet ? ' is-quiet' : ''}`;
    if (!quiet) {
      const frame = document.createElement('span');
      frame.className = 'ui-toast__icon';
      frame.innerHTML = svgIcon(item.icon, 12);
      el.appendChild(frame);
    }
    const { name, line } = quiet ? { name: item.text, line: '' } : splitToast(item.text);
    const label = document.createElement('span');
    label.className = 'ui-toast__name';
    label.textContent = name;
    el.appendChild(label);
    if (line !== '') {
      const sub = document.createElement('span');
      sub.className = 'ui-toast__line';
      sub.textContent = line;
      el.appendChild(sub);
    }
    return el;
  };

  const sync = (): void => {
    const live = new Set(queue.list().map((i) => i.id));
    for (const id of [...nodes.keys()]) if (!live.has(id)) retire(id);
  };

  const show = (text: string, glyph: string, tier: RewardTier): void => {
    const item = queue.push(text, glyph, tier);
    if (!item) return;
    const node = build(item);
    nodes.set(item.id, node);
    layer.appendChild(node);
    sync();
  };

  return {
    push(text: string, glyph: string, tier: RewardTier): void {
      if (tier === 'pickup') return;
      waiting.push({ text, glyph, tier });
    },

    update(dt: number, held = false): void {
      gap = Math.max(0, gap - dt);
      if (!held && gap === 0 && waiting.length > 0) {
        const next = waiting.shift() as { text: string; glyph: string; tier: RewardTier };
        show(next.text, next.glyph, next.tier);
        gap = TOAST_GAP;
      }
      for (const id of queue.update(dt)) retire(id);
      sync();
    },

    destroy(): void {
      for (const t of timers) clearTimeout(t);
      timers.clear();
      nodes.clear();
      waiting.length = 0;
      queue.clear();
      layer.remove();
    },
  };
}
