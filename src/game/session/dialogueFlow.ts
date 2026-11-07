/**
 * Opening, stepping and closing conversations.
 *
 * Speech is one line at a time: the node's text is played as a chirp whose pitch is derived from the
 * speaker's species, so a ptarmigan and a fox sound like different animals without any recorded
 * audio. `speechNode` tracks which line is currently being spoken so re-opening the same node does
 * not restart the chirp.
 *
 * An errand offer ends on Pip's answer. When the offer's last line closes, Pip is asked "take it on?"
 * with "i'll do it." and "not now."; only the first takes the errand. An answer that already says yes
 * ("i'll ask skiff.", a choice marked `takes`) takes it when the talk closes, without the question:
 * critic round 13 said yes to Orla and was then asked again. Escape is "not now", unless Pip already
 * said yes. Declined,
 * the errand stays on offer, and talking to the villager again goes straight to Pip's answer: critic
 * round 5 had to sit through a whole pitch again to say yes to something it had already heard.
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
  /** This run passes over the node and goes on to its `next` (a roll-call voice not yet met). */
  skip?(nodeId: string): boolean;
}

/** An errand on offer in this conversation: its title, and what taking it on, or not, does. */
export interface PendingOffer {
  title: string;
  accept(): void;
  /** Pip said "not now": the journal keeps the offer, so it can be found again. */
  decline?(): void;
}

export interface DialogueFlow {
  open(npcId: string, nodeId: string, offer?: PendingOffer): void;
  /** One line from a villager Pip has just said "not now" to, with no offer in it. */
  remind(npcId: string): void;
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

/** Route ids for Pip's answer to an offer; never real node ids. */
const TAKE = '§take';
const LEAVE = '§leave';
const ASK = '§ask';
const LATER = '§later';

/**
 * The villager's word after "not now.": critic round 23 said it to Orla and the talk just shut, which
 * read as a door closed rather than an offer kept open.
 */
function laterNode(speaker: string): DialogueNode {
  return { id: LATER, speaker, lines: ["No hurry. Ask me again when you're passing."] };
}

/**
 * Talking to the same villager again before walking off. Critic round 69 said "not now" to Orla, pressed
 * E again and had the errand put to it again on the spot: an offer just turned down is not asked twice.
 */
function remindNode(speaker: string): DialogueNode {
  return { id: LATER, speaker, lines: ["It'll keep. Go and see what else is about, and come back by."] };
}

function askNode(title: string): DialogueNode {
  return {
    id: ASK,
    speaker: PIP.id,
    lines: [`(take on "${title}"?)`],
    choices: [{ text: "i'll do it.", next: TAKE }, { text: 'not now.', next: LEAVE }],
  };
}

export function createDialogueFlow(d: DialogueFlowDeps): DialogueFlow {
  let speechNode: string | null = null;
  let speakerId: string | null = null;
  let offer: PendingOffer | null = null;
  /** Pip has already said yes to the offer in this talk. */
  let agreed = false;
  /** Offers heard through to the question this run, by title: the next time, only the question is asked. */
  const heard = new Set<string>();

  const ask = (title: string): void => {
    heard.add(title);
    speechNode = ASK;
    d.dialogue.open(askNode(title), PIP.name, (syllables) => d.audio.chirp(syllables, pitchFor(PIP.species)));
  };

  const shut = (): void => {
    d.dialogue.close();
    speechNode = null;
    speakerId = null;
    offer = null;
    agreed = false;
  };

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
    open(npcId, nodeId, pending): void {
      offer = pending ?? null;
      agreed = false;
      if (offer && heard.has(offer.title)) {
        speakerId = npcId;
        ask(offer.title);
        return;
      }
      open(npcId, nodeId);
    },
    remind(npcId): void {
      const npc = d.npcs.find((n) => n.id === npcId);
      if (!npc) return;
      offer = null;
      agreed = false;
      speechNode = LATER;
      speakerId = npc.id;
      d.dialogue.open(remindNode(npc.id), npc.name, (syllables) => d.audio.chirp(syllables, pitchFor(npc.species)));
    },
    advance(): void {
      if (!d.dialogue.isOpen()) return;
      const next = d.dialogue.advance();
      if (next === 'close') {
        if (offer && agreed) {
          const took = offer;
          shut();
          took.accept();
          return;
        }
        if (offer && speechNode !== ASK) {
          ask(offer.title);
          return;
        }
        shut();
        return;
      }
      if (next.id === TAKE || next.id === LEAVE) {
        const took = next.id === TAKE ? offer : null;
        const left = next.id === LEAVE ? offer : null;
        const who = speakerId;
        shut();
        took?.accept();
        left?.decline?.();
        const npc = next.id === LEAVE ? d.npcs.find((n) => n.id === who) : undefined;
        if (npc) {
          speechNode = LATER;
          speakerId = npc.id;
          d.dialogue.open(laterNode(npc.id), npc.name, (syllables) => d.audio.chirp(syllables, pitchFor(npc.species)));
        }
        return;
      }
      if (d.nodes[speechNode ?? '']?.choices?.some((c) => c.takes === true && c.next === next.id)) agreed = true;
      // The view only knows the node it just finished, so the speaker comes from the node being
      // opened. Taking it from `next` labelled every hand-off with the previous voice: the radio
      // finale put Bram's name on the baker and Ivy's on Nana.
      let id = next.id;
      for (let hops = 0; d.skip?.(id) === true && hops < 16; hops++) {
        const on = d.nodes[id]?.next;
        if (on === undefined) {
          shut();
          return;
        }
        id = on;
      }
      if (id !== speechNode) open(d.nodes[id]?.speaker ?? next.speaker, id);
    },
    close(): void {
      // Escape after Pip has already said yes ("i'll ring it.") keeps the yes. It used to drop the offer:
      // critic round 20 said yes to Gus and Skiff, skipped the rest with Escape, and had neither errand.
      const took = offer && agreed ? offer : null;
      // Escape at Pip's answer is "not now", and is kept as one.
      const left = offer && !agreed && speechNode === ASK ? offer : null;
      shut();
      took?.accept();
      left?.decline?.();
    },
    isOpen: () => d.dialogue.isOpen(),
    currentNode: () => speechNode,
    speaker: () => (d.dialogue.isOpen() ? speakerId : null),
  };
}
