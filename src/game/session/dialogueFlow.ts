/**
 * Opening, stepping and closing conversations.
 *
 * Speech is one line at a time: the node's text is played as a chirp whose pitch is derived from the
 * speaker's species, so a ptarmigan and a fox sound like different animals without any recorded
 * audio. `speechNode` tracks which line is currently being spoken so re-opening the same node does
 * not restart the chirp.
 */

import type { NpcDef } from '../../core/contracts';
import type { DialogueNode } from '../../core/contracts';
import type { AudioKit } from '../audio/audio';

export interface DialogueFlowDeps {
  dialogue: {
    open(node: DialogueNode, speaker: string, onSyllable: (syllables: number) => void): void;
    advance(): { id: string; speaker: string } | 'close';
    close(): void;
    isOpen(): boolean;
  };
  audio: AudioKit;
  npcs: readonly NpcDef[];
  nodes: Readonly<Record<string, DialogueNode>>;
  /** Lines for a node's `fill` source, from what the player has done; none when absent. */
  fill?(source: string): string[];
}

export interface DialogueFlow {
  open(npcId: string, nodeId: string): void;
  advance(): void;
  close(): void;
  isOpen(): boolean;
  /** The node currently being spoken, or null. */
  currentNode(): string | null;
  /** Who Pip is talking with, by NPC id, or null: the speaker, or the listener while Pip answers. */
  speaker(): string | null;
}

/** Deterministic per-species voice: nine pitch steps, stable across sessions. */
export function pitchFor(species: string): number {
  return 180 + ([...species].reduce((a, c) => a + c.charCodeAt(0), 0) % 9) * 22;
}

/**
 * Pip's own lines (a node whose speaker is 'pip'). Pip is not in the villager table, so a hand-off to
 * Pip found no speaker and silently did not open: Wren asked "What did you hear?" and the box sat on
 * her question for good.
 */
const PIP = { id: 'pip', name: 'Pip', species: 'snow bunting' };

export function createDialogueFlow(d: DialogueFlowDeps): DialogueFlow {
  let speechNode: string | null = null;
  let speakerId: string | null = null;

  const open = (npcId: string, nodeId: string): void => {
    const node = d.nodes[nodeId];
    const npc = npcId === PIP.id ? PIP : d.npcs.find((n) => n.id === npcId);
    if (!node || !npc) return;
    const before = node.fill ? d.fill?.(node.fill) ?? [] : [];
    const said = before.length > 0 ? { ...node, lines: [...before, ...node.lines] } : node;
    speechNode = nodeId;
    // While Pip answers, the villager listening stays the one the camera frames with Pip.
    if (npc !== PIP || speakerId === null) speakerId = npcId;
    d.dialogue.open(said, npc.name, (syllables) => d.audio.chirp(syllables, pitchFor(npc.species)));
  };

  return {
    open,
    advance(): void {
      if (!d.dialogue.isOpen()) return;
      const next = d.dialogue.advance();
      if (next === 'close') {
        d.dialogue.close();
        speechNode = null;
        speakerId = null;
        return;
      }
      // The view only knows the node it just finished, so the speaker comes from the node being
      // opened. Taking it from `next` labelled every hand-off with the previous voice: the radio
      // finale put Bram's name on the baker and Ivy's on Nana.
      if (next.id !== speechNode) open(d.nodes[next.id]?.speaker ?? next.speaker, next.id);
    },
    close(): void {
      d.dialogue.close();
      speechNode = null;
      speakerId = null;
    },
    isOpen: () => d.dialogue.isOpen(),
    currentNode: () => speechNode,
    speaker: () => (d.dialogue.isOpen() ? speakerId : null),
  };
}
