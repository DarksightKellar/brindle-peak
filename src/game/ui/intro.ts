/**
 * The opening card.
 *
 * The game used to start on nothing but a stamina arc: no goal, no controls, no reason to walk
 * anywhere. A beginner had to press Escape and read a settings panel to learn that WASD moves, and had
 * to guess that the mast on the horizon was the point. The brief asked for "a clear goal", and the goal
 * existed only inside the quest data.
 *
 * Deliberately the opposite of the ending's ceremony: it does not take over the screen, it does not
 * pause the world, and it leaves on the first input. It used to time out after seven seconds too, which
 * took it away from anyone who looked at the scene first. A cosy game should not hold a player still to
 * read a manual, but it does owe them one sentence about where they are going.
 */

export interface Intro {
  /** Show once, on a fresh save. Returns false if it has already been shown. */
  show(): boolean;
  hide(): void;
  isOpen(): boolean;
}

export function createIntro(root: HTMLElement, onDismiss?: () => void): Intro {
  const card = document.createElement('div');
  card.className = 'ui-intro';
  card.setAttribute('role', 'note');
  card.hidden = true;
  card.innerHTML = `
    <div class="ui-intro__kicker">Nana Quill's Valley</div>
    <p class="ui-intro__goal">You've come up the road to spend the winter at Nana's, and the valley radio went quiet on Tuesday. Nana is waiting at the cabin door.</p>`;
  root.appendChild(card);

  let open = false;

  const hide = (): void => {
    if (!open) return;
    open = false;
    card.hidden = true;
    card.classList.remove('is-in');
    onDismiss?.();
  };

  // The first key or click is the player saying they have read it. Captured so it works even if the
  // canvas was not focused yet, and removed immediately so it never swallows a real interaction.
  const onInput = (): void => { hide(); };
  const listen = (): void => {
    window.addEventListener('keydown', onInput, { capture: true, once: true });
    window.addEventListener('pointerdown', onInput, { capture: true, once: true });
  };
  const unlisten = (): void => {
    window.removeEventListener('keydown', onInput, { capture: true });
    window.removeEventListener('pointerdown', onInput, { capture: true });
  };

  return {
    show(): boolean {
      if (open) return false;
      open = true;
      card.hidden = false;
      // Next frame, so the transition has a start state to move from.
      requestAnimationFrame(() => card.classList.add('is-in'));
      listen();
      return true;
    },
    hide(): void { unlisten(); hide(); },
    isOpen(): boolean { return open; },
  };
}
