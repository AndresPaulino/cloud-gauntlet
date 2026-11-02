// Turns a lesson into a sequence of short pieces shown one at a time, with each quiz question
// placed right after the section it is about. Pure (type-only imports) so check-logic can test it.
import type { Lesson, Question } from '../content/types';

export type Piece =
  | { kind: 'chapter'; title: string; words: number }
  | { kind: 'analogy'; title: string; words: number }
  | { kind: 'diagram'; title: string; words: number }
  | { kind: 'section'; title: string; words: number; section: number; body: string; withTable: boolean }
  | { kind: 'question'; title: string; words: number; question: Question }
  | { kind: 'tradeoffs'; title: string; words: number }
  | { kind: 'recap'; title: string; words: number }
  | { kind: 'lab'; title: string; words: number }
  | { kind: 'finish'; title: string; words: number };

const MAX_WORDS = 180; // longer sections are split at paragraph breaks
const count = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Split a section body into parts of roughly <= MAX_WORDS, only at blank lines. */
export function splitBody(body: string): string[] {
  if (count(body) <= MAX_WORDS) return [body];
  const paras = body.split(/\n{2,}/);
  const target = Math.ceil(count(body) / Math.ceil(count(body) / 120)); // even-ish parts
  const parts: string[] = [];
  let cur: string[] = [];
  for (const p of paras) {
    if (cur.length && count(cur.join(' ')) + count(p) > target) { parts.push(cur.join('\n\n')); cur = []; }
    cur.push(p);
  }
  if (cur.length) parts.push(cur.join('\n\n'));
  // Don't leave a tiny last part on its own.
  if (parts.length > 1 && count(parts.at(-1)!) < 40) parts.splice(-2, 2, parts.at(-2)! + '\n\n' + parts.at(-1)!);
  return parts;
}

const STOP = new Set('about above after again against because before being below between which while where there their these those would could should other using within without through under every first second third answer option options choose company needs requirement solution least most which'.split(' '));
const terms = (s: string) => new Set((s.toLowerCase().match(/[a-z0-9][a-z0-9-]{3,}/g) ?? []).filter((w) => !STOP.has(w)));

function scores(q: Question, sections: { heading: string; body: string }[]) {
  const qt = terms(`${q.stem} ${q.options.join(' ')} ${q.explanation} ${q.tags.join(' ')}`);
  return sections.map((s) => { const st = terms(`${s.heading} ${s.heading} ${s.body}`); let n = 0; for (const w of qt) if (st.has(w)) n++; return n; });
}

/** Index of the section a question is most about (ties go to the later section, so you've read more). -1 if no overlap. */
export function bestSection(q: Question, sections: { heading: string; body: string }[]): number {
  const sc = scores(q, sections);
  const top = Math.max(0, ...sc);
  return top ? sc.lastIndexOf(top) : -1;
}

/** Assign questions to sections, preferring a section that has no check yet when it is nearly as good a match (>= 60% of the best). */
export function placeQuestions(quiz: Question[], sections: { heading: string; body: string }[]) {
  const placed = new Map<number, Question[]>();
  const leftover: Question[] = [];
  for (const q of quiz) {
    const sc = scores(q, sections);
    const top = Math.max(0, ...sc);
    if (!top) { leftover.push(q); continue; }
    const free = sc.map((v, i) => [v, i]).filter(([v, i]) => v >= top * 0.6 && !placed.has(i)).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    const i = free.length ? free[0][1] : sc.lastIndexOf(top);
    placed.set(i, [...(placed.get(i) ?? []), q]);
  }
  return { placed, leftover };
}

export function buildPieces(lesson: Lesson, quiz: Question[], opts: { chapterTitle?: string; hasLab: boolean }): Piece[] {
  const out: Piece[] = [];
  if (opts.chapterTitle) out.push({ kind: 'chapter', title: opts.chapterTitle, words: 90 });
  out.push({ kind: 'analogy', title: `Think of it like this: ${lesson.analogy.title}`, words: count(lesson.analogy.body) });
  if (lesson.diagram) out.push({ kind: 'diagram', title: lesson.diagram.title, words: lesson.diagram.steps.reduce((a, s) => a + count(s.caption), 0) });

  const { placed, leftover } = placeQuestions(quiz, lesson.sections);
  const ask = (q: Question) => out.push({ kind: 'question', title: 'Quick check', words: count(q.stem) + 60, question: q });

  lesson.sections.forEach((s, i) => {
    const parts = splitBody(s.body);
    parts.forEach((body, j) => out.push({
      kind: 'section', section: i, body, withTable: j === parts.length - 1 && !!s.table,
      title: parts.length > 1 ? `${s.heading} (${j + 1}/${parts.length})` : s.heading,
      words: count(body) + (j === parts.length - 1 && s.table ? s.table.rows.length * 15 : 0),
    }));
    (placed.get(i) ?? []).forEach(ask);
  });
  if (lesson.prosCons?.length) out.push({ kind: 'tradeoffs', title: 'Trade-offs', words: lesson.prosCons.length * 60 });
  out.push({ kind: 'recap', title: 'Key facts, exam tips & traps', words: count([...lesson.keyFacts, ...lesson.examTips, ...lesson.pitfalls].join(' ')) });
  leftover.forEach(ask);
  if (opts.hasLab) out.push({ kind: 'lab', title: 'Do it in the console', words: 30 });
  out.push({ kind: 'finish', title: 'Finish', words: 0 });
  return out;
}
