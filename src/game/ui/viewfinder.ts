/**
 * The viewfinder frame: thin corner brackets and a centre mark, drawn over the pixel layer while a
 * photo activity has the camera at Pip's eye.
 *
 * Without it the first-person view read as "the camera glitched into the bird": nothing said this was
 * a camera now, or which keys move it. The mark is the live answer to "is it centred?" — it lights up
 * (and grows a ring, so the change does not rely on colour alone, A5) when E would take the shot.
 * The activity panel underneath keeps its own hint; this only adds the frame and the keys.
 *
 * It fades with the camera's ease in and out, so the frame arrives with the view, not before it.
 */
import '../../styles/photo.css';

export interface Viewfinder {
  /** blend: 0 = chase camera .. 1 = fully in the viewfinder. */
  update(blend: number, centred: boolean): void;
  destroy(): void;
}

export function createViewfinder(root: HTMLElement): Viewfinder {
  const frame = document.createElement('div');
  frame.className = 'ui-finder';
  frame.hidden = true;
  frame.setAttribute('aria-hidden', 'true');
  frame.innerHTML =
    '<i class="ui-finder__corner is-tl"></i><i class="ui-finder__corner is-tr"></i>' +
    '<i class="ui-finder__corner is-bl"></i><i class="ui-finder__corner is-br"></i>' +
    '<i class="ui-finder__mark"></i>' +
    '<p class="ui-finder__keys">A / D turn · W / S tilt · E shoot</p>';
  root.appendChild(frame);
  let wasCentred = false;

  return {
    update(blend, centred): void {
      const show = blend > 0.02;
      if (frame.hidden === show) frame.hidden = !show;
      if (!show) return;
      frame.style.opacity = String(Math.min(1, blend * 1.25));
      if (centred !== wasCentred) {
        frame.classList.toggle('is-centred', centred);
        wasCentred = centred;
      }
    },
    destroy(): void {
      frame.remove();
    },
  };
}
