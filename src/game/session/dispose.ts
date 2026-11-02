/** Tearing a session down: save once more, then free GPU resources, audio and the DOM the UI owns. */

interface Disposable { dispose(): void }
interface Destroyable { destroy(): void }

export interface SessionParts {
  persist: () => void;
  world: Disposable;
  prints: Disposable;
  snowfall: Disposable;
  pipeline: Disposable;
  audio: Destroyable;
  ui: { hud: Destroyable; tutorial: Destroyable; toasts: Destroyable; journal: Destroyable; menu: Destroyable };
}

export function disposeSession(p: SessionParts): void {
  p.persist();
  p.world.dispose();
  p.prints.dispose();
  p.snowfall.dispose();
  p.pipeline.dispose();
  p.audio.destroy();
  p.ui.hud.destroy();
  p.ui.tutorial.destroy();
  p.ui.toasts.destroy();
  p.ui.journal.destroy();
  p.ui.menu.destroy();
}
