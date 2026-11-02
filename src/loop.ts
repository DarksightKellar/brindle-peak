/**
 * Frame driver. Deliberately dumb: it measures elapsed time and calls one function.
 *
 * Time is clamped rather than accumulated. A long frame (tab backgrounded, breakpoint hit) must
 * not produce a giant dt that tunnels the player through terrain; the session clamps again, but
 * clamping here too keeps the failure local and visible.
 */

export interface Loop {
  start(): void;
  stop(): void;
  /** Frames rendered since start. Used by the acceptance harness to know when it can measure. */
  frames(): number;
}

const MAX_DT = 0.05;

export function createLoop(step: (dt: number) => void): Loop {
  let handle = 0;
  let last = 0;
  let running = false;
  let count = 0;

  const frame = (now: number): void => {
    if (!running) return;
    const dt = last === 0 ? 1 / 60 : Math.min((now - last) / 1000, MAX_DT);
    last = now;
    step(dt);
    count++;
    handle = requestAnimationFrame(frame);
  };

  return {
    start(): void {
      if (running) return;
      running = true;
      last = 0;
      handle = requestAnimationFrame(frame);
    },
    stop(): void {
      running = false;
      if (handle) cancelAnimationFrame(handle);
      handle = 0;
    },
    frames: () => count,
  };
}
