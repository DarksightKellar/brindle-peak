/**
 * story-check reads `src/data/dialogue.ts` and `src/data/quests.ts` as source text, so it can also
 * be pointed at an old revision. This is that parser, across formats old and new, with line numbers.
 */

export interface ParsedNode {
  id: string;
  speaker: string;
  lines: string[];
  next?: string;
  choices: string[];
  line: number;
}

export interface ParsedStep {
  quest: string;
  questLine: number;
  id: string;
  text: string;
  kind: string;
  target: string;
  line: number;
}

/** One rule broken at one place in a data file. */
export interface Violation {
  file: string;
  line: number;
  where: string;
  message: string;
}

const LITERAL = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g;

function unescape(value: string): string {
  return value.replace(/\\(["'\\])/g, '$1');
}

function literalsIn(source: string): string[] {
  const out: string[] = [];
  LITERAL.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LITERAL.exec(source)) !== null) out.push(unescape(m[1] ?? m[2] ?? ''));
  return out;
}

export function parseDialogue(text: string): ParsedNode[] {
  const nodes: ParsedNode[] = [];
  const lines = text.split('\n');
  lines.forEach((raw, i) => {
    const head = /^\s*'([\w-]+)':\s*n\('([\w-]+)',\s*'([\w-]+)',\s*\[/.exec(raw);
    if (!head) return;
    const from = raw.indexOf('[', head.index + head[0].length - 1);
    const to = raw.indexOf(']', from);
    if (from < 0 || to < 0) throw new Error(`dialogue.ts:${i + 1}: cannot read the lines array`);
    const body = raw.slice(from, to + 1);
    const lines_ = literalsIn(body);
    const next = /next:\s*'([\w-]+)'/.exec(raw);
    const choices = [...raw.matchAll(/c\(\s*[^,]+,\s*'([\w-]+)'\s*\)/g)].map((m) => m[1] as string);
    nodes.push({ id: head[1] as string, speaker: head[3] as string, lines: lines_, next: next?.[1], choices, line: i + 1 });
  });
  return nodes;
}

export function parseQuests(text: string): ParsedStep[] {
  const steps: ParsedStep[] = [];
  let quest = '';
  let questLine = 0;
  text.split('\n').forEach((raw, i) => {
    const q = /^\s*q\('([\w-]+)'/.exec(raw);
    if (q) {
      quest = q[1] as string;
      questLine = i + 1;
      return;
    }
    const s = /^\s*s\('([\w-]+)',\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')\s*,\s*\{\s*kind:\s*'(\w+)',\s*id:\s*'([\w-]+)'/.exec(raw);
    // The talk shorthand: `talk(id, text, npc, say, ...)` is a `talked` step aimed at `npc`.
    const k = /^\s*talk\('([\w-]+)',\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')\s*,\s*'([\w-]+)'/.exec(raw);
    if (!s && !k) return;
    const m = (s ?? k) as RegExpExecArray;
    steps.push({
      quest,
      questLine,
      id: m[1] as string,
      text: unescape(m[2] ?? m[3] ?? ''),
      kind: s ? (s[4] as string) : 'talked',
      target: (s ? s[5] : m[4]) as string,
      line: i + 1,
    });
  });
  return steps;
}
