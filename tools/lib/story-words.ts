/**
 * story-check's vocabulary: what the player has already been shown, and the word helpers the
 * checks share. See `tools/story-check.ts` for the rules these feed.
 */

import { NPCS } from '../../src/data/npcs';
import { ZONE_NAMES } from '../../src/data/zoneNames';

/**
 * The narrator's vocabulary: the intro card ("The radio has been dead since Tuesday, and Nana
 * cannot make the climb. Take the path up to the mast on Brindle Peak."), the map and journal zone
 * names, and the plain landscape words every line may lean on.
 */
const NARRATOR_TERMS = new Set([
  'pip',
  'nana',
  'mast',
  'radio',
  'valley',
  'cabin',
  'road',
  'station',
  'pines',
  'pine',
  'springs',
  'creek',
  'hut',
  'lane',
  'pass',
  'glade',
  'kettles',
  'snow',
  'ice',
]);

/** Calendar words are not lore. Anyone can say Tuesday. */
const CALENDAR = new Set([
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
]);

/** Every word of every zone name, as the map and journal print it. */
const ZONE_TOKENS = new Set(
  Object.values(ZONE_NAMES).flatMap((name) => name.toLowerCase().split(/\s+/)),
);

/**
 * People in the story who have no `NpcDef`: they live further out and are only spoken of. Kept
 * explicit so a name cannot arrive in a line without this file knowing it is a name.
 */
export const OFFSTAGE_NAMES = ['juniper'];

/** Cast names, lowercased word by word: "Nana Quill" contributes `nana` and `quill`. */
export const CAST_TOKENS = new Set(
  [...NPCS.flatMap((n) => n.name.toLowerCase().split(/\s+/)), ...OFFSTAGE_NAMES].filter(Boolean),
);

/** Words any line may use without introducing them. */
export const KNOWN_BASE: ReadonlySet<string> = new Set<string>([...NARRATOR_TERMS, ...ZONE_TOKENS, ...CALENDAR]);

/**
 * Verbs that describe a person's place in the valley. A first mention followed by one of these
 * within six words is treated as an introduction ("Fen is the owl...", "Bram counts the wood...").
 */
const DESCRIBING_VERBS = new Set([
  'is', 'are', 'was', 'were', 'keeps', 'kept', 'counts', 'counted', 'runs', 'ran', 'bakes',
  'fishes', 'knits', 'sells', 'sold', 'posts', 'lives', 'lived', 'works', 'sits', 'stands',
  'watches', 'carries', 'minds', 'maintains', 'drills', 'climbs', 'flies', 'writes', 'wrote',
  'reports', 'has', 'had', 'owns', 'came', 'comes', 'goes', 'went', 'said', 'says', 'hears',
  'heard', 'saw', 'sees', 'knows', 'knew', 'fixes', 'fixed', 'walks', 'holds', 'held', 'feeds',
  'fed', 'calls', 'called', 'answers', 'answered', 'tells', 'told', 'gives', 'gave', 'takes',
  'took', 'made', 'makes', 'found', 'finds', 'loses', 'gets', 'got', 'thinks', 'thought',
  'wants', 'wanted', 'needs', 'needed', 'waits', 'waited', 'eats', 'ate', 'sleeps', 'slept',
  'built', 'builds', 'broke', 'breaks', 'hunts', 'hunted', 'sends', 'sent', 'brought', 'brings',
]);

/**
 * Verbs that introduce a person: "Fen is the owl...", "Bram counts the wood...". Deliberately
 * present tense and role-shaped — "Edda talked to the district" is a report about someone, not an
 * introduction of them, and must still fail.
 */
export const INTRO_VERBS = new Set([
  'is', 'are', 'was', 'were', 'keeps', 'counts', 'runs', 'bakes', 'fishes', 'knits', 'sells',
  'posts', 'lives', 'works', 'sits', 'stands', 'watches', 'carries', 'minds', 'maintains',
  'drills', 'climbs', 'flies', 'writes', 'reports', 'has', 'owns', 'feeds', 'answers', 'builds',
  'hunts',
]);

/** Verbs that make a first line a sentence rather than a fragment, for check (c). */
export const SENTENCE_VERBS = new Set([
  ...DESCRIBING_VERBS,
  'am', 'be', 'been', 'have', 'do', 'does', 'did', 'can', 'will', 'would', 'could', 'should',
  'may', 'might', 'must', 'need', 'want', 'know', 'think', 'look', 'looks', 'ring', 'rings',
  'fish', 'build', 'climb', 'carry', 'ask', 'tell', 'say', 'find', 'write', 'read', 'eat',
  'bake', 'knit', 'sell', 'post', 'run', 'live', 'leave', 'left', 'stay', 'fly', 'watch',
  'see', 'put', 'hold', 'hang', 'pour', 'boil', 'melt', 'fall', 'fell', 'drop', 'lift', 'haul',
  'tie', 'keep', 'stack', 'mind', 'stand', 'sit', 'walk', 'come', 'go', 'take', 'give', 'make',
  'help', 'wait', 'start', 'stop', 'open', 'shut', 'close', 'grease', 'knead', 'learn', 'teach',
]);

const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'your', 'that', 'this', 'from', 'into']);

/** Meaningful words of a phrase: long enough to be a target, not a joining word. */
export const keywords = (phrase: string): string[] =>
  phrase
    .toLowerCase()
    .split(/[^a-z']+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));

export const hasWord = (haystack: string, needle: string): boolean =>
  new RegExp(`(^|[^a-z])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i').test(haystack);

export interface Token {
  text: string;
  index: number;
}

export function tokensOf(sentence: string): Token[] {
  const out: Token[] = [];
  for (const m of sentence.matchAll(/[A-Za-z][A-Za-z'’-]*/g)) out.push({ text: m[0], index: m.index ?? 0 });
  return out;
}
