/**
 * Event bus with a drainable queue.
 *
 * Two delivery paths, on purpose:
 *  - `on(...)` subscribers are notified synchronously at `emit` time.
 *  - every event is also appended to a queue that `drain()` returns and clears.
 *
 * The queue is what makes the bus safe for a UI that subscribes late: a toast emitted during
 * boot (lantern granted, first zone entered) is still there when the toast layer finally wires
 * itself up. Nothing is dropped because nobody was listening yet.
 *
 * A listener that throws is isolated — the remaining listeners still run and the event stays
 * queued, so one broken consumer cannot silence the rest of the game.
 */

import type {
  EventBus,
  EventListener,
  GameEvent,
  GameEventName,
  GameEventPayloads,
} from '../contracts';

export function createEventBus(): EventBus {
  const queue: GameEvent[] = [];
  const listeners = new Map<GameEventName | '*', Set<EventListener>>();

  const notify = (name: GameEventName, event: GameEvent): void => {
    const specific = listeners.get(name);
    const global = listeners.get('*');
    // Snapshot both sets: a listener may unsubscribe (or subscribe) while we are dispatching.
    const targets: EventListener[] = [
      ...(specific ? [...specific] : []),
      ...(global ? [...global] : []),
    ];
    for (const fn of targets) {
      try {
        fn(event);
      } catch {
        // A consumer's bug is the consumer's problem. Delivery continues.
      }
    }
  };

  return {
    emit<K extends GameEventName>(name: K, data: GameEventPayloads[K]): void {
      const event = { name, data } as unknown as GameEvent;
      queue.push(event);
      notify(name, event);
    },

    on(name: GameEventName | '*', fn: EventListener): () => void {
      let set = listeners.get(name);
      if (!set) {
        set = new Set<EventListener>();
        listeners.set(name, set);
      }
      set.add(fn);
      return () => {
        const current = listeners.get(name);
        if (!current) return;
        current.delete(fn);
        if (current.size === 0) listeners.delete(name);
      };
    },

    drain(): GameEvent[] {
      const out = queue.slice();
      queue.length = 0;
      return out;
    },
  };
}
