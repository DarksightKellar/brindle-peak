/**
 * story-check — the mechanical reader `docs/STORY.md` asks for.
 *
 * The previous dialogue passed every test this project had, because no test read the writing. This
 * one does, without a browser and without a game loop: it parses `src/data/dialogue.ts` and
 * `src/data/quests.ts` as source text (so it can also be pointed at an old revision) and enforces
 * three rules.
 *
 *   (a) GROUNDED NAMES. A proper noun in a line must already be known at that point in the
 *       conversation. Known means: a narrator term (the intro card and the map say "the radio",
 *       "the mast on Brindle Peak", "Nana", and the seven zone names); or a name introduced earlier
 *       in this conversation, where "introduced" means the line that first mentions it also says
 *       who that person is — an appositive ("Bram, who counts the wood") or a describing verb
 *       within six words ("Fen is the owl in the pines"). A first mention with no description is
 *       the exact bug this file exists to catch: "Edda talked to the district".
 *
 *       Limits, stated plainly: sentence-initial capitalised words are only treated as names when
 *       they are a known cast name, so a brand-new name opening a sentence would slip through; and
 *       names introduced in one branch of a conversation are assumed known in the other branches
 *       when the `-wait` / `-done` nodes are checked, because the player reaches those only after
 *       the root.
 *
 *   (b) QUEST STEPS NAME THEIR TARGET. A step's `text` must contain the thing its condition tests:
 *       the NPC for `talked`, the zone (or a name the valley uses for it) for `visited`, and a word
 *       from the activity's name for `activity`.
 *
 *   (c) A NODE OPENS WITH A SENTENCE. The first line of every node must start with a capital and
 *       contain a verb-shaped word. It is a heuristic, so the offending lines are printed for a
 *       human to judge rather than silently trusted. Nodes spoken by `pip` are exempt: pip speaks
 *       lowercase on purpose.
 *
 * The vocabulary lives in `tools/lib/story-words.ts`, the source parser in `tools/lib/story-parse.ts`
 * and rule (a) in `tools/lib/story-names.ts`; rules (b) and (c) and the run are here.
 *
 * Usage:
 *   npx vite-node tools/story-check.ts
 *   npx vite-node tools/story-check.ts --dialogue src/data/dialogue.old.ts --quests src/data/quests.old.ts
 *
 * Exit code 0 when clean, 1 when anything fails. No browser, no new dependency.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { QuestStep } from '../src/core/contracts';
import { ACTIVITIES } from '../src/data/activities';
import { DIALOGUE } from '../src/data/dialogue';
import { NPCS } from '../src/data/npcs';
import { PLACES } from '../src/data/places';
import { QUESTS } from '../src/data/quests';
import { ZONE_NAMES } from '../src/data/zoneNames';
import { checkConversations } from './lib/story-names';
import { parseDialogue, parseQuests, type ParsedNode, type ParsedStep, type Violation } from './lib/story-parse';
import { SENTENCE_VERBS, hasWord, keywords, tokensOf } from './lib/story-words';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// Check (b): a quest step names the target its condition tests
// ---------------------------------------------------------------------------

const ZONE_ALIASES: Record<string, string[]> = {
  hearth: ['Hearth Hollow', 'Hearth', 'Hollow', 'station'],
  pinewind: ['Pinewind Wood', 'Pinewind', 'pines', 'wood'],
  reach: ['Frozen Reach', 'Reach', 'ice'],
  kettles: ['Kettle Springs', 'Kettle', 'springs', 'spring'],
  hamlet: ['Hollowpine Hamlet', 'Hollowpine', 'hamlet', 'bakery'],
  ridge: ['Windscar Ridge', 'Windscar', 'ridge'],
  peak: ['Brindle Peak', 'Brindle', 'Peak'],
};

/** What a step's text has to mention, given the condition it waits on. */
function requiredWords(kind: string, target: string): string[] | null {
  if (kind === 'talked') {
    const npc = NPCS.find((n) => n.id === target);
    if (!npc) return null;
    const first = npc.name.split(' ')[0] as string;
    return [npc.name, first];
  }
  if (kind === 'visited') {
    return ZONE_ALIASES[target] ?? [ZONE_NAMES[target as keyof typeof ZONE_NAMES] ?? target];
  }
  if (kind === 'activity') {
    const activity = ACTIVITIES.find((a) => a.id === target);
    if (!activity) return null;
    return keywords(activity.name);
  }
  if (kind === 'reached') {
    // A place is a spot inside a zone; the step has to say which zone, as a zone visit does.
    const place = PLACES.find((p) => p.id === target);
    return place ? ZONE_ALIASES[place.zone] ?? [ZONE_NAMES[place.zone]] : null;
  }
  return null;
}

function checkQuests(file: string, steps: ParsedStep[]): Violation[] {
  const out: Violation[] = [];
  for (const step of steps) {
    const words = requiredWords(step.kind, step.target);
    if (words === null) {
      out.push({
        file,
        line: step.line,
        where: `${step.quest}/${step.id}`,
        message: `step waits on ${step.kind} '${step.target}', which nothing in the data defines`,
      });
      continue;
    }
    if (!words.some((word) => hasWord(step.text, word))) {
      out.push({
        file,
        line: step.line,
        where: `${step.quest}/${step.id}`,
        message: `${step.kind} '${step.target}' but the text names none of [${words.join(', ')}]: "${step.text}"`,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Check (c): a node opens with a sentence, not a fragment
// ---------------------------------------------------------------------------

function opensWithSentence(node: ParsedNode): string | null {
  if (node.speaker === 'pip') return null;
  const first = node.lines[0] ?? '';
  if (!/^[A-Z]/.test(first)) return 'does not start with a capital';
  const verbShaped = tokensOf(first).some((t) => {
    const w = t.text.toLowerCase();
    return SENTENCE_VERBS.has(w) || (w.length > 3 && /(s|ed|ing)$/.test(w)) || /'(s|ll|m|re|ve|t)$/.test(w);
  });
  if (!verbShaped) return 'has no verb-shaped word, so it reads as a fragment';
  return null;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const dialoguePath = resolve(ROOT, arg('dialogue', 'src/data/dialogue.ts'));
const questsPath = resolve(ROOT, arg('quests', 'src/data/quests.ts'));
const rel = (p: string): string => p.startsWith(ROOT) ? p.slice(ROOT.length + 1) : p;

const dialogueText = readFileSync(dialoguePath, 'utf8');
const questText = readFileSync(questsPath, 'utf8');
const nodes = parseDialogue(dialogueText);
const steps = parseQuests(questText);

// The parser is only worth trusting if it agrees with the modules the game actually imports.
if (dialoguePath === resolve(ROOT, 'src/data/dialogue.ts')) {
  const parsed = new Map(nodes.map((n) => [n.id, n.lines]));
  const moduleIds = Object.keys(DIALOGUE);
  const drift = moduleIds.filter((id) => !parsed.has(id)).concat([...parsed.keys()].filter((id) => !(id in DIALOGUE)));
  const mismatch = moduleIds.filter((id) => parsed.has(id) && parsed.get(id)?.join('|') !== DIALOGUE[id]?.lines.join('|'));
  if (drift.length > 0 || mismatch.length > 0) {
    console.error('story-check: the source parser disagrees with src/data/dialogue.ts');
    console.error(`  missing from source: ${drift.join(', ') || 'none'}`);
    console.error(`  differing lines:     ${mismatch.join(', ') || 'none'}`);
    process.exit(2);
  }
}
if (questsPath === resolve(ROOT, 'src/data/quests.ts')) {
  const moduleSteps: QuestStep[] = QUESTS.flatMap((q) => q.steps);
  if (moduleSteps.length !== steps.length || steps.some((s, i) => s.text !== moduleSteps[i]?.text)) {
    console.error('story-check: the source parser disagrees with src/data/quests.ts');
    process.exit(2);
  }
}

const violations: Violation[] = [
  ...checkConversations(rel(dialoguePath), nodes),
  ...checkQuests(rel(questsPath), steps),
  ...nodes
    .map((node) => ({ node, why: opensWithSentence(node) }))
    .filter((r): r is { node: ParsedNode; why: string } => r.why !== null)
    .map(({ node, why }) => ({
      file: rel(dialoguePath),
      line: node.line,
      where: `'${node.id}' line 1`,
      message: `${why}: "${node.lines[0]}"`,
    })),
];

// The same line can be reached by more than one path, and the state nodes re-walk nodes the root
// already reached; report each offending line once.
const unique = [...new Map(violations.map((v) => [`${v.file}:${v.line}:${v.message}`, v])).values()];
violations.length = 0;
violations.push(...unique);

const conversations = NPCS.length;
console.log(`story-check: ${conversations} conversations, ${nodes.length} nodes, ${steps.length} quest steps`);

if (violations.length === 0) {
  console.log('story-check: clean');
  process.exit(0);
}

violations
  .sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)))
  .forEach((v) => console.log(`${v.file}:${v.line}  ${v.where}\n    ${v.message}`));

console.log(`story-check: ${violations.length} violation${violations.length === 1 ? '' : 's'}`);
process.exit(1);
