/**
 * Every note builds a few WebAudio nodes. Left connected after they finish, they pile up for the
 * length of a session; this cuts each source loose when it ends, and the shared tail (filter, gain)
 * once the last source has reported in.
 */
export function releaseWhenDone(sources: readonly AudioScheduledSourceNode[], tail: readonly AudioNode[] = []): void {
  if (sources.length === 0) {
    // Nothing will ever fire onended, so a tail left waiting would never be released.
    for (const node of tail) {
      try {
        node.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    return;
  }
  let remaining = sources.length;
  const done = (source: AudioScheduledSourceNode): void => {
    try {
      source.disconnect();
    } catch {
      /* already disconnected */
    }
    remaining -= 1;
    if (remaining > 0) return;
    for (const node of tail) {
      try {
        node.disconnect();
      } catch {
        /* already disconnected */
      }
    }
  };
  for (const source of sources) source.onended = () => done(source);
}
