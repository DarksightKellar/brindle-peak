/**
 * Errands, played through the same conversation path the game uses, with the shipped quests and NPCs.
 * Each `talk` is what one press of E opens.
 */

import { describe, expect, it } from 'vitest';
import { play } from './storyFixtures';

/** Nana's errand up to the batteries in hand, the pile stacked when Bram asks. */
const batteries = (g: ReturnType<typeof play>): void => {
  g.talk('nana');
  g.talk('bram');
  g.emit('activity:completed', 'hearth-kindling');
  g.talk('bram');
};

describe('errands', () => {
  it('a giver asked again before Pip has left repeats the ask; the welcome back waits for a return', () => {
    const g = play();
    g.beside('wren');
    expect(g.talk('wren')).toBe('wren-root');
    g.mech.flush();
    expect(g.talk('wren')).toBe('wren-still');
    g.beside('fen'); // a walk through the wood and back
    g.beside('wren');
    expect(g.talk('wren')).toBe('wren-wait');
  });

  it('a letter carried home is given in its own conversation, after the story one', () => {
    const g = play();
    g.talk('nana');
    g.talk('pell');
    expect(g.quests.status('pell-letter')).toBe('active');
    g.talk('bram');
    g.emit('activity:completed', 'hearth-kindling');
    g.talk('bram');
    expect(g.talk('nana')).toBe('nana-done');
    g.emit('zone:entered', 'pinewind'); // any event at all: it used to hand the letter over unheard
    expect(g.quests.status('pell-letter')).toBe('active');
    expect(g.talk('nana')).toBe('nana-letter');
    expect(g.quests.status('pell-letter')).toBe('complete'); // delivered is done: no walk back to Pell
    expect(g.talk('pell')).toBe('pell-done'); // he hears how it went as his next favour opens
    expect(g.quests.status('pell-address')).toBe('active');
  });

  it('sends the rope up with the batteries, and the word that it is tied down to Bram', () => {
    const g = play();
    batteries(g);
    expect(g.state.items.rope).toBe(1);
    expect(g.talk('bram')).toBe('bram-rope-wait');
    expect(g.talk('tuck')).toBe('tuck-root');
    expect(g.state.items.key).toBe(1);
    expect(g.talk('bram')).toBe('bram-rope-done');
    expect(g.quests.status('tuck-rope')).toBe('complete');
  });

  it('a woodpile stacked before Bram asked is paid for in the first talk', () => {
    const g = play();
    g.emit('activity:completed', 'hearth-kindling');
    g.talk('nana');
    expect(g.talk('bram')).toBe('bram-paid');
    expect(g.state.items.batteries).toBe(1);
    expect(g.quests.status('tuck-rope')).toBe('active');
  });

  it('a snowman already built counts for Orla, before or after she asked', () => {
    for (const early of [true, false]) {
      const g = play();
      if (early) g.emit('activity:completed', 'hamlet-snowman');
      g.talk('orla');
      if (!early) g.emit('activity:completed', 'hamlet-snowman');
      expect(g.talk('skiff')).toBe('skiff-flour');
      expect(g.state.quests['orla-flour']?.step, `built early: ${early}`).toBe(2);
      expect(g.talk('orla')).toBe('orla-done');
    }
  });

  it('Margit counts only the fish she watched being caught', () => {
    const g = play();
    g.emit('activity:completed', 'reach-ice-fish');
    g.talk('margit');
    g.emit('zone:entered', 'reach');
    expect(g.state.quests['margit-ice']?.step).toBe(0);
    g.emit('activity:completed', 'reach-ice-fish');
    expect(g.state.quests['margit-ice']?.step).toBe(1);
  });

  // Critic round 29 fished the Creek Pool before Fen's tip, and the mitten step was already done: the
  // mitten never came up, and Hollis thanked them for it.
  it('a catch at the Creek Pool before Fen sends you there does not count for the mitten', () => {
    const g = play();
    g.emit('activity:completed', 'pinewind-creek-fish');
    g.talk('hollis');
    g.talk('fen');
    expect(g.state.quests['hollis-mitten']?.step).toBe(1);
    g.emit('activity:completed', 'pinewind-creek-fish');
    expect(g.state.quests['hollis-mitten']?.step).toBe(2);
  });

  // Critic round 30 rode the boathouse hill before Skiff asked, and was sent back to ride it again.
  it('a ride down the boathouse hill before Skiff asks counts, and he says so', () => {
    const g = play();
    g.emit('activity:completed', 'reach-sled-hill');
    g.talk('skiff');
    g.emit('zone:entered', 'reach'); // the next thing that happens checks the steps
    expect(g.state.quests['skiff-sled']?.step).toBe(1);
    expect(g.talk('margit')).toBe('margit-sled');
  });

  // Critic round 33 hopped to Pinewind Wood from the map, and Jory's walk was done for it.
  it('a hop from the map is not the walk Jory asked for; walking in is', () => {
    const g = play();
    g.talk('jory');
    g.emit('activity:completed', 'kettles-spring-fish');
    expect(g.state.quests['jory-first-step']?.step).toBe(1);
    g.emit('zone:entered', 'pinewind', true);
    expect(g.state.quests['jory-first-step']?.step).toBe(1);
    expect(g.state.visited.pinewind).toBe(true);
    g.emit('zone:entered', 'kettles');
    g.emit('zone:entered', 'pinewind');
    expect(g.state.quests['jory-first-step']?.step).toBe(2);
  });

  it('two errands waiting on Hollis each get their own talk', () => {
    const g = play();
    g.talk('hollis');
    g.talk('fen');
    g.emit('activity:completed', 'pinewind-creek-fish');
    g.talk('tamsin');
    g.emit('activity:completed', 'pinewind-pinecone-throw');
    expect(g.talk('hollis')).toBe('hollis-done');
    expect(g.talk('hollis')).toBe('hollis-fit');
    expect(g.talk('tamsin')).toBe('tamsin-done');
  });
});
