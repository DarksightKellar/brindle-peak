/**
 * The photograph itself. Taking a photo used to end on a line of text ("Photograph kept"), and at the
 * aurora, the emotional peak of the climb, the critic saw no picture at all. Now the frame the shutter
 * caught is printed as a polaroid for a few seconds, and kept: the journal's Field Notes pins every
 * photograph Pip has taken.
 *
 * The capture is the game canvas as it was last drawn (the renderer keeps its drawing buffer), so the
 * picture is the view through the viewfinder without the HTML brackets laid over it. It is scaled to the
 * scene's own 384 px width with smoothing off, so the print keeps the game's pixels and stays small
 * enough to keep in localStorage beside the save.
 */

const KEY = 'first-snow.photo.';
const WIDTH = 384;
/** Seconds the print stays up before it slides away. */
const SHOW_S = 4.5;

export interface KeptPhoto {
  id: string;
  src: string;
}

/** Every photograph kept so far, in no particular order. */
export function keptPhotos(ids: readonly string[]): KeptPhoto[] {
  const out: KeptPhoto[] = [];
  for (const id of ids) {
    try {
      const src = localStorage.getItem(KEY + id);
      if (src) out.push({ id, src });
    } catch {
      /* storage blocked: the journal just shows no prints */
    }
  }
  return out;
}

/** Forget every kept photograph (a progress reset). */
export function forgetPhotos(ids: readonly string[]): void {
  for (const id of ids) {
    try {
      localStorage.removeItem(KEY + id);
    } catch {
      /* nothing to forget */
    }
  }
}

function capture(canvas: HTMLCanvasElement): string | null {
  if (canvas.width === 0 || canvas.height === 0) return null;
  const small = document.createElement('canvas');
  small.width = WIDTH;
  small.height = Math.round((WIDTH * canvas.height) / canvas.width);
  const ctx = small.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 0, 0, small.width, small.height);
  try {
    return small.toDataURL('image/png');
  } catch {
    return null;
  }
}

export interface Polaroid {
  /** Print what the canvas shows now, captioned, and keep it under `id`. */
  take(id: string, caption: string): void;
  destroy(): void;
}

export function createPolaroid(root: HTMLElement, canvas: HTMLCanvasElement): Polaroid {
  const card = document.createElement('figure');
  card.className = 'ui-polaroid';
  card.hidden = true;
  card.innerHTML = '<img class="ui-polaroid__img" alt=""><figcaption class="ui-polaroid__cap"></figcaption>';
  root.appendChild(card);
  const img = card.querySelector('img') as HTMLImageElement;
  const cap = card.querySelector('figcaption') as HTMLElement;
  let timer: number | undefined;

  return {
    take(id, caption): void {
      const src = capture(canvas);
      if (!src) return;
      try {
        localStorage.setItem(KEY + id, src);
      } catch {
        /* full or blocked: the print still shows, it just is not kept */
      }
      img.src = src;
      img.alt = caption;
      cap.textContent = caption;
      card.hidden = false;
      card.classList.remove('is-out');
      // Restart the arrival animation for a second photo taken while the first is still up.
      void card.offsetWidth;
      card.classList.add('is-in');
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        card.classList.remove('is-in');
        card.classList.add('is-out');
        timer = window.setTimeout(() => { card.hidden = true; }, 400);
      }, SHOW_S * 1000);
    },
    destroy(): void {
      window.clearTimeout(timer);
      card.remove();
    },
  };
}
