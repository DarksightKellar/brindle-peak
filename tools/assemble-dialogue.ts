/**
 * Assemble writer output into src/data/dialogue.ts.
 *
 * The writers produce JSON, not TypeScript, so that 4 people can write 18 NPCs in parallel without
 * merge conflicts and without any of them touching boilerplate. This script owns the boilerplate and
 * refuses to emit anything that breaks the contract.
 *
 *   npx vite-node tools/assemble-dialogue.ts            # validate + write
 *   npx vite-node tools/assemble-dialogue.ts --check    # validate only
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { NPCS } from '../src/data/npcs';
import { QUESTS } from '../src/data/quests';

const ROOT = process.cwd();
const PARTS = join(ROOT, 'src/data/dialogue.parts');
const OUT = join(ROOT, 'src/data/dialogue.ts');

type Choice = { text: string; next: string };
type Node = { id: string; speaker: string; lines: string[]; choices?: Choice[]; next?: string; fill?: string };

/*
 * Where conversations begin. The engine enters a node because data names it (src/core/progress/
 * conversation.ts), never by a node-id suffix, so the entries are read from the same data.
 */
const ENTRY: { id: string; from: string }[] = [
  ...NPCS.map((n) => ({ id: n.idle, from: `${n.id} idle` })),
  ...QUESTS.flatMap((q) => [
    { id: q.offer, from: `${q.id} offer` },
    { id: q.waiting, from: `${q.id} waiting` },
    ...(q.still ? [{ id: q.still, from: `${q.id} still` }] : []),
    ...(q.notYet ? [{ id: q.notYet, from: `${q.id} notYet` }] : []),
    ...q.steps.flatMap((s) => [s.say, s.hold].filter((v): v is string => v !== undefined).map((id) => ({ id, from: `${q.id}:${s.id}` }))),
  ]),
];

const errors: string[] = [];
const nodes = new Map<string, Node>();

const files = readdirSync(PARTS).filter((f) => f.endsWith('.json')).sort();
if (files.length === 0) {
  console.error(`no part files in ${PARTS}`);
  process.exit(1);
}

for (const file of files) {
  const raw = JSON.parse(readFileSync(join(PARTS, file), 'utf8')) as Node[];
  for (const node of raw) {
    if (nodes.has(node.id)) errors.push(`${file}: duplicate node id "${node.id}"`);
    nodes.set(node.id, node);
  }
}

// --- contract checks -------------------------------------------------------
for (const [id, node] of nodes) {
  if (node.id !== id) errors.push(`"${id}": id field disagrees with its key`);
  if (!node.speaker) errors.push(`"${id}": no speaker`);
  if (!Array.isArray(node.lines) || node.lines.length === 0) errors.push(`"${id}": no lines`);
  if (node.lines && node.lines.length > 5) errors.push(`"${id}": ${node.lines.length} lines (max 5, the panel is fixed-height)`);
  if (node.lines && node.lines.some((l) => typeof l !== 'string' || !l.trim())) errors.push(`"${id}": empty or non-string line`);
  if (node.choices && node.choices.length > 2) errors.push(`"${id}": ${node.choices.length} choices (max 2)`);
  if (node.choices && node.choices.length === 1) errors.push(`"${id}": single choice is a false branch, use next`);
  if (node.choices && node.next) errors.push(`"${id}": has both choices and next`);
  if (node.choices) for (const c of node.choices) {
    if (!c.text || !c.next) errors.push(`"${id}": choice missing text or next`);
    if (!nodes.has(c.next)) errors.push(`"${id}": choice points at missing node "${c.next}"`);
  }
  if (node.next && !nodes.has(node.next)) errors.push(`"${id}": next points at missing node "${node.next}"`);
}

// Every entry point must exist.
for (const { id, from } of ENTRY) {
  if (!nodes.has(id)) errors.push(`missing entry point for ${from}: "${id}"`);
}

// Reachability from all entry points.
const seen = new Set<string>();
const queue = ENTRY.map((e) => e.id).filter((id) => nodes.has(id));
while (queue.length) {
  const id = queue.pop()!;
  if (seen.has(id)) continue;
  seen.add(id);
  const n = nodes.get(id)!;
  if (n.next) queue.push(n.next);
  for (const c of n.choices ?? []) queue.push(c.next);
}
for (const id of nodes.keys()) if (!seen.has(id)) errors.push(`unreachable node "${id}"`);

// Every conversation must be able to end.
const terminals = new Set([...nodes.values()].filter((n) => !n.next && !n.choices).map((n) => n.id));
for (const { id, from } of ENTRY) {
  if (!nodes.has(id)) continue;
  const reach = new Set<string>();
  const q = [id];
  while (q.length) {
    const cur = q.pop()!;
    if (reach.has(cur)) continue;
    reach.add(cur);
    const n = nodes.get(cur)!;
    if (n.next) q.push(n.next);
    for (const c of n.choices ?? []) q.push(c.next);
  }
  if (![...reach].some((r) => terminals.has(r))) errors.push(`${from}: no terminal node reachable from "${id}"`);
}

if (errors.length) {
  console.error(`assemble-dialogue: ${errors.length} contract violations`);
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}

if (process.argv.includes('--check')) {
  console.log(`assemble-dialogue: ${nodes.size} nodes across ${files.length} parts, contract clean`);
  process.exit(0);
}

/*
 * Ids, speakers and node keys are emitted single-quoted: `tools/story-check.ts` parses this file as
 * source text with a single-quote grammar (`tools/lib/story-parse.ts`), and a JSON.stringify'd key
 * made the checker believe every node was missing.
 */
const sq = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const body = [...nodes.values()]
  .map((n) => {
    const lines = JSON.stringify(n.lines);
    const fill = n.fill ? `, fill: ${sq(n.fill)}` : '';
    if (n.choices) {
      const ch = n.choices.map((c) => `c(${JSON.stringify(c.text)}, ${sq(c.next)})`).join(', ');
      return `  ${sq(n.id)}: n(${sq(n.id)}, ${sq(n.speaker)}, ${lines}, { choices: [${ch}]${fill} }),`;
    }
    if (n.next) return `  ${sq(n.id)}: n(${sq(n.id)}, ${sq(n.speaker)}, ${lines}, { next: ${sq(n.next)}${fill} }),`;
    if (fill) return `  ${sq(n.id)}: n(${sq(n.id)}, ${sq(n.speaker)}, ${lines}, { ${fill.slice(2)} }),`;
    return `  ${sq(n.id)}: n(${sq(n.id)}, ${sq(n.speaker)}, ${lines}),`;
  })
  .join('\n');

writeFileSync(
  OUT,
  `/**
 * Every line anyone says.
 *
 * Generated by tools/assemble-dialogue.ts from src/data/dialogue.parts/*.json. Edit the JSON, not this
 * file. The brief the writers worked to is docs/BEATS.md.
 *
 * Conventions: node ids are \`<npc>-<slot>\`. \`next\` chains without input; \`choices\` are the only branch
 * points, never more than two. Pip speaks as 'pip' — lowercase, terse, a little deadpan.
 */

import type { DialogueChoice, DialogueNode } from '../core/contracts';

const c = (text: string, next: string): DialogueChoice => ({ text, next });
type Opt = { next?: string; choices?: DialogueChoice[]; fill?: string };
const n = (id: string, speaker: string, lines: string[], o: Opt = {}): DialogueNode => ({
  id,
  speaker,
  lines,
  ...o,
});

export const DIALOGUE: Readonly<Record<string, DialogueNode>> = {
${body}
};
`,
);
console.log(`assemble-dialogue: wrote ${nodes.size} nodes to src/data/dialogue.ts`);
