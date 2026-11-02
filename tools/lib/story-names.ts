/**
 * story-check rule (a): grounded names, walked along every path of every conversation. A proper noun
 * must already be known where it is said; see `tools/story-check.ts` for the rule and its limits.
 */

import { NPCS } from '../../src/data/npcs';
import { QUESTS } from '../../src/data/quests';
import type { ParsedNode, Violation } from './story-parse';
import { CAST_TOKENS, INTRO_VERBS, KNOWN_BASE, OFFSTAGE_NAMES, tokensOf, type Token } from './story-words';

type Introduced = Set<string>;

/**
 * Candidates: a capitalised word after the sentence's first word, or a known cast name anywhere.
 * Indices are absolute offsets into `line`, because `introducesName` reads the rest of the line
 * from there.
 */
function properNounCandidates(line: string): Token[] {
  const out: Token[] = [];
  for (const sentence of line.matchAll(/[^.!?]+[.!?]*/g)) {
    const offset = sentence.index ?? 0;
    tokensOf(sentence[0]).forEach((token, i) => {
      const bare = token.text.replace(/'s$/, '').replace(/[’']$/, '');
      const lower = bare.toLowerCase();
      if (!/^[A-Z]/.test(bare)) return;
      if (/^I(['’]|$)/.test(bare)) return; // the pronoun, not a name
      if (i === 0 && !CAST_TOKENS.has(lower) && !OFFSTAGE_NAMES.includes(lower)) return;
      out.push({ text: bare, index: offset + token.index });
    });
  }
  return out;
}

/**
 * True when this mention is phrased as an introduction rather than an allusion: an appositive
 * ("Bram, who counts the wood") or a role verb in the same sentence ("Fen is the owl...").
 * The verb has to be in this sentence, so a following sentence cannot lend its grammar.
 */
function introducesName(line: string, token: Token): boolean {
  const raw = line.slice(token.index + token.text.length);
  if (/^\s*[,;:—–(]/.test(raw)) return true;
  const end = raw.search(/[.!?](\s|$)/);
  const clause = end >= 0 ? raw.slice(0, end) : raw;
  return tokensOf(clause).slice(0, 6).some((t) => INTRO_VERBS.has(t.text.toLowerCase()));
}

function checkLine(
  file: string,
  node: ParsedNode,
  index: number,
  line: string,
  introduced: Introduced,
  where: string,
): Violation[] {
  const out: Violation[] = [];
  for (const token of properNounCandidates(line)) {
    const lower = token.text.toLowerCase();
    if (KNOWN_BASE.has(lower)) continue;
    if (introduced.has(lower)) continue;
    if (introducesName(line, token)) continue; // the line that introduces them may use them
    out.push({
      file,
      line: node.line,
      where: `${where} '${node.id}' line ${index + 1}`,
      message: `"${token.text}" is not introduced before this line: "${line}"`,
    });
  }
  return out;
}

interface WalkResult {
  violations: Violation[];
  introduced: Introduced;
  reached: Set<string>;
}

/** Depth-first over one conversation, copying the known set at every branch. */
function walk(
  file: string,
  nodes: Map<string, ParsedNode>,
  startId: string,
  base: ReadonlySet<string>,
): WalkResult {
  const violations: Violation[] = [];
  const union: Introduced = new Set();
  const reached: Set<string> = new Set();

  const visit = (id: string, introduced: Introduced, seen: Set<string>, where: string): void => {
    const node = nodes.get(id);
    if (!node || seen.has(id)) return;
    seen.add(id);
    reached.add(id);
    const here = node.id === startId ? where : `${where} -> ${node.id}`;
    const local = new Set(introduced);
    // The speaker's own name is on screen beside their lines; saying it is not an allusion.
    const speaker = NPCS.find((npc) => npc.id === node.speaker);
    for (const token of speaker ? speaker.name.toLowerCase().split(/\s+/) : []) local.add(token);
    node.lines.forEach((line, i) => {
      violations.push(...checkLine(file, node, i, line, local, here));
      for (const token of properNounCandidates(line)) {
        const lower = token.text.toLowerCase();
        if (KNOWN_BASE.has(lower) || local.has(lower)) continue;
        if (introducesName(line, token)) local.add(lower);
      }
    });
    for (const name of local) union.add(name);
    if (node.next) visit(node.next, local, new Set(seen), here);
    for (const choice of node.choices) visit(choice, local, new Set(seen), here);
  };

  visit(startId, new Set(base), new Set(), startId);
  return { violations, introduced: union, reached };
}

export function checkConversations(file: string, nodes: ParsedNode[]): Violation[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const violations: Violation[] = [];
  const covered = new Set<string>();

  const check = (id: string, where: string, base: ReadonlySet<string>): Introduced => {
    if (!byId.has(id)) {
      violations.push({ file, line: 0, where, message: `no dialogue node '${id}'` });
      return new Set();
    }
    const result = walk(file, byId, id, base);
    violations.push(...result.violations);
    for (const n of result.reached) covered.add(n);
    return result.introduced;
  };

  // Idle lines can be the first thing a player hears from someone, so they stand on their own.
  for (const npc of NPCS) check(npc.idle, `${npc.id} idle`, KNOWN_BASE);

  /*
   * Everything inside a quest is heard after its offer, so it inherits what the offer introduced, and
   * a chained quest also inherits its predecessor's. Quests are declared in story order, so one pass
   * sees every predecessor first.
   */
  const learned = new Map<string, Introduced>();
  for (const q of QUESTS) {
    const before = QUESTS.find((p) => p.then === q.id);
    const inherited: Introduced = new Set([...KNOWN_BASE, ...(before ? learned.get(before.id) ?? [] : [])]);
    if (q.notYet) check(q.notYet, `${q.id} notYet`, KNOWN_BASE);
    const fromOffer = check(q.offer, `${q.id} offer`, inherited);
    const base: Introduced = new Set([...inherited, ...fromOffer]);
    check(q.waiting, `${q.id} waiting`, base);
    if (q.still) check(q.still, `${q.id} still`, base);
    for (const s of q.steps) {
      if (s.say) for (const n of check(s.say, `${q.id}:${s.id}`, base)) base.add(n);
      if (s.hold) check(s.hold, `${q.id}:${s.id} hold`, base);
    }
    learned.set(q.id, base);
  }

  // Any node the roots never reach would otherwise go unchecked.
  for (const node of nodes) {
    if (covered.has(node.id)) continue;
    violations.push(...walk(file, byId, node.id, KNOWN_BASE).violations);
  }
  return violations;
}
