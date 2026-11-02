/**
 * The main story, played through the same conversation path the game uses (mechanics.talk), with the
 * shipped quests and NPCs. Each line is what one press of E opens.
 *
 * This is the test the old build lacked: every piece passed on its own while the conversation the
 * player heard was a chapter behind or ahead of what they had done.
 */

import { describe, expect, it } from 'vitest';
import type { PlayerState, TerrainSampler } from '../src/core/contracts';
import { createGameState } from '../src/core/contracts';
import { createEventBus } from '../src/core/progress/events';
import { ENDING_QUEST, FINALE_QUEST } from '../src/data/quests';
import { applyWorldRules } from '../src/game/session/worldRules';
import { DIALOGUE } from '../src/data/dialogue';
import { createDialogueFlow } from '../src/game/session/dialogueFlow';
import { NPCS } from '../src/data/npcs';
import { DIALOGUE_FILLS } from '../src/data/dialogueFills';
import { PICKUPS } from '../src/data/pickups';
import type { AudioKit } from '../src/game/audio/audio';
import { play } from './storyFixtures';

describe('the main story', () => {
  it('plays from the cabin to the call and home again, every line in order', () => {
    const g = play();

    // Before anything: Edda is waiting on power, Bram has nothing to ask.
    expect(g.talk('edda')).toBe('edda-early');
    expect(g.talk('bram')).toBe('bram-idle');

    expect(g.talk('nana')).toBe('nana-root');
    expect(g.quests.status('the-line')).toBe('active');
    expect(g.state.items.camera).toBe(1); // handed over with the errand, long before Edda asks for a photograph
    expect(g.talk('nana')).toBe('nana-wait');

    expect(g.talk('bram')).toBe('bram-batteries');
    expect(g.talk('bram')).toBe('bram-stack'); // pile not stacked yet: a reminder, not small talk
    g.emit('activity:completed', 'hearth-kindling');
    expect(g.talk('bram')).toBe('bram-paid');
    expect(g.state.items.batteries).toBe(1);
    expect([g.quests.status('tuck-rope'), g.state.items.rope]).toEqual(['active', 1]); // the rope goes up with the climb

    expect(g.talk('nana')).toBe('nana-done');
    expect(g.state.abilities.lantern).toBe(true);
    expect(g.quests.status('the-climb')).toBe('active');
    expect(g.talk('nana')).toBe('nana-climb-wait');

    // However Pip got up there, arriving with the batteries is the meeting.
    expect(g.talk('edda')).toBe('edda-meet');
    expect(g.quests.status('the-mast')).toBe('active');
    expect(g.talk('edda')).toBe('edda-wait');

    g.emit('activity:completed', 'peak-aurora-photo');
    expect(g.talk('edda')).toBe('edda-line-up');
    expect(g.quests.status(FINALE_QUEST)).toBe('complete');
    expect(g.state.achievements.summit).toBeDefined();

    expect(g.talk('nana')).toBe('nana-home-done');
    expect(g.quests.status('nana-home')).toBe('complete');
    expect(g.state.achievements['home-again']).toBeDefined();

    expect(g.talk('nana')).toBe('nana-idle');
    expect(g.talk('edda')).toBe('edda-idle');
  });

  it('opens a real node, spoken by the right person, at every step', () => {
    const g = play();
    const said: [string, string | null][] = [];
    const talk = (id: string): void => void said.push([id, g.talk(id)]);
    talk('nana'); talk('bram'); talk('bram');
    g.emit('activity:completed', 'hearth-kindling');
    talk('bram'); talk('nana');
    talk('edda');
    g.emit('activity:completed', 'peak-aurora-photo');
    talk('edda'); talk('nana');
    for (const [npc, node] of said) {
      expect(node, npc).not.toBeNull();
      expect(DIALOGUE[node as string]?.speaker, `${npc} -> ${node}`).toBe(npc);
    }
  });
});

describe('a conversation that hands between speakers', () => {
  it('lets Pip answer: a node spoken by Pip opens, under the name Pip', () => {
    const heard: string[] = [];
    let node: { id: string; speaker: string; lines: string[]; next?: string } | null = null;
    const view = {
      open(n: typeof node, name: string): void { node = n; heard.push(`${n?.id}:${name}`); },
      advance(): { id: string; speaker: string } | 'close' {
        const done = node;
        node = null;
        return done?.next ? { id: done.next, speaker: done.speaker } : 'close';
      },
      close(): void { node = null; },
      isOpen: (): boolean => node !== null,
    };
    const flow = createDialogueFlow({
      dialogue: view as never, audio: { chirp: () => undefined } as unknown as AudioKit, npcs: NPCS, nodes: DIALOGUE,
    });
    flow.open('wren', 'wren-done');
    flow.advance();
    expect(heard).toEqual(['wren-done:Wren', 'wren-pip:Pip']);
    expect(flow.speaker()).toBe('wren'); // the camera keeps Wren in the shot while Pip speaks
  });

  it('names whoever is speaking on every node of the radio finale', () => {
    // The view reports the next node with the speaker of the node it just finished, as the real one
    // does. The flow must name the node it opens.
    let node: { id: string; speaker: string; lines: string[]; next?: string } | null = null;
    let line = 0;
    const heard: string[] = [];
    const view = {
      open(n: typeof node, name: string): void { node = n; line = 0; heard.push(`${n?.id}:${name}`); },
      advance(): { id: string; speaker: string } | 'close' {
        if (!node) return 'close';
        if (line < node.lines.length - 1) { line++; return node; }
        const done = node;
        node = null;
        return done.next ? { id: done.next, speaker: done.speaker } : 'close';
      },
      close(): void { node = null; },
      isOpen: (): boolean => node !== null,
    };
    const flow = createDialogueFlow({
      dialogue: view as never, audio: { chirp: () => undefined } as unknown as AudioKit, npcs: NPCS, nodes: DIALOGUE,
    });
    flow.open('edda', 'edda-line-up');
    for (let i = 0; i < 40 && flow.isOpen(); i++) flow.advance();
    const name = (id: string): string => NPCS.find((n) => n.id === DIALOGUE[id]?.speaker)?.name ?? '?';
    expect(heard.length).toBeGreaterThan(3);
    for (const h of heard) {
      const [id, said] = h.split(':');
      expect(said, id).toBe(name(id as string));
    }
  });
});

describe('the homecoming hears about errands', () => {
  it('lets Nana mention up to two finished errands before her last lines, and none on a bare run', () => {
    const s = createGameState({ x: 0, y: 0, z: 0 }, 6);
    expect(DIALOGUE_FILLS['nana-heard']?.(s)).toEqual([]);
    for (const q of ['hollis-mitten', 'tuck-rope', 'skiff-sled']) s.quests[q] = { status: 'complete', step: 0 };
    const heard = DIALOGUE_FILLS['nana-heard']?.(s) ?? [];
    expect(heard).toHaveLength(2);
    let opened: string[] = [];
    const flow = createDialogueFlow({
      dialogue: { open: (n) => { opened = n.lines; }, advance: () => 'close', close: () => undefined, isOpen: () => false },
      audio: { chirp: () => undefined } as unknown as AudioKit, npcs: NPCS, nodes: DIALOGUE,
      fill: (source) => DIALOGUE_FILLS[source]?.(s) ?? [],
    });
    flow.open('nana', 'nana-home-close');
    expect(opened).toEqual([...heard, ...(DIALOGUE['nana-home-close']?.lines ?? [])]);
  });

  it('has Nana say who lit the posts: Pip, the valley, or both', () => {
    // After the call the valley lights every post Pip did not (wayHome.ts); her line has to agree.
    const s = createGameState({ x: 0, y: 0, z: 0 }, 6);
    const line = (): string | undefined => DIALOGUE_FILLS['nana-posts']?.(s)[0];
    const none = line();
    s.lanterns['lantern-hearth-1'] = 1;
    const some = line();
    for (const p of PICKUPS) if (p.kind === 'lantern') s.lanterns[p.id] = 1;
    expect(new Set([none, some, line()]).size).toBe(3);
  });
});

describe('the ending', () => {
  it('comes with the homecoming, once, not with the radio call', () => {
    const state = createGameState({ x: 0, y: 0, z: 0 }, 6);
    const player = { pos: { x: 0, y: 0, z: 0 }, soaking: false } as unknown as PlayerState;
    const sampler = { sampleAt: () => ({ zone: state.zone }) } as unknown as TerrainSampler;
    let endings = 0;
    const frame = (): void => void applyWorldRules({
      state, player, bus: createEventBus(), sampler, worldSize: 1024, onZoneChange: () => undefined, onFinale: () => endings++,
    });
    state.quests[FINALE_QUEST] = { status: 'complete', step: 2 };
    frame();
    expect(endings).toBe(0);
    state.quests[ENDING_QUEST] = { status: 'complete', step: 1 };
    frame(); frame();
    expect(endings).toBe(1);
  });
});
