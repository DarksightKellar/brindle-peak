import { describe, expect, it } from 'vitest';
import { releaseWhenDone } from '../src/game/audio/teardown';

/**
 * `releaseWhenDone` is the only thing keeping the audio graph from growing for the length of a session,
 * and it runs inside WebAudio callbacks where a mistake is silent. These fakes let the ordering be
 * asserted directly: a source must cut itself off when it ends, and the shared tail only once the last
 * source has reported in.
 */
interface FakeSource {
  onended: (() => void) | null;
  disconnect: () => void;
  disconnects: number;
}

function fakeSource(): FakeSource {
  const node: FakeSource = {
    onended: null,
    disconnects: 0,
    disconnect(): void { node.disconnects += 1; },
  };
  return node;
}

const asSource = (f: FakeSource): AudioScheduledSourceNode =>
  f as unknown as AudioScheduledSourceNode;
const asNode = (f: FakeSource): AudioNode => f as unknown as AudioNode;

describe('releaseWhenDone', () => {
  it('disconnects a source when it ends, and the tail only after the last one', () => {
    const a = fakeSource();
    const b = fakeSource();
    const tail = fakeSource();
    releaseWhenDone([asSource(a), asSource(b)], [asNode(tail)]);

    a.onended?.();
    expect(a.disconnects).toBe(1);
    expect(tail.disconnects, 'tail must survive while another voice is still sounding').toBe(0);

    b.onended?.();
    expect(b.disconnects).toBe(1);
    expect(tail.disconnects).toBe(1);
  });

  it('releases the tail immediately when there are no sources to wait for', () => {
    // No source means no onended will ever fire, so a tail left waiting would never be released.
    const tail = fakeSource();
    releaseWhenDone([], [asNode(tail)]);
    expect(tail.disconnects).toBe(1);
  });

  it('handles a single source with no tail', () => {
    const only = fakeSource();
    releaseWhenDone([asSource(only)]);
    only.onended?.();
    expect(only.disconnects).toBe(1);
  });

  it('survives a node that is already disconnected', () => {
    const source = fakeSource();
    source.disconnect = () => { throw new Error('InvalidAccessError'); };
    releaseWhenDone([asSource(source)]);
    expect(() => source.onended?.()).not.toThrow();
  });
});
