// A lesson as a sequence of short pieces, one at a time. Finished pieces collapse to a single line
// (click to reopen), so the thing you're reading is always the one at the bottom. Quick checks sit
// right after the section they test; the diagram must be stepped through to continue.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStore } from '../store/store';
import { getLesson, outline, modules, DOMAINS, flashcards, serviceMap, questions } from '../content';
import type { Lesson } from '../content/types';
import { labsForLesson } from '../labs';
import { buildPieces, type Piece } from '../lib/lessonFlow';
import { companyStats, usersPerLesson } from '../lib/company';
import { chapters, fill, DEFAULT_COMPANY } from '../content/story';
import { Diagram } from '../ui/Diagram';
import { Md } from '../ui/Md';
import { QuestionCard } from '../ui/QuestionCard';
import { ServiceIcon } from '../ui/ServiceIcon';
import { useTutor, useTutorContext } from '../ui/Tutor';
import { Btn, Empty } from '../ui/bits';
import { toast } from '../ui/Celebrate';

const Beyond = () => <span className="text-[11px] px-2 py-0.5 rounded-full border border-xp text-xp-ink align-middle whitespace-nowrap" title="Not in your cheat-sheet PDFs; added from the SAA-C03 exam guide">beyond your cheat sheets</span>;

/** Same 5 questions every visit, so a saved position still points at the same piece. */
function stableQuiz(lessonId: string, n = 5) {
  const own = questions.filter((q) => q.lessonIds[0] === lessonId).sort((a, b) => a.id.localeCompare(b.id));
  const related = questions.filter((q) => q.lessonIds.includes(lessonId) && q.lessonIds[0] !== lessonId).sort((a, b) => a.id.localeCompare(b.id));
  return [...own, ...related].slice(0, n);
}

const plain = (s: string) => s.replace(/\*\*|`|^#+ /gm, '').replace(/\*/g, '');
function speechText(piece: Piece, lesson: Lesson, company: string): string {
  switch (piece.kind) {
    case 'chapter': { const ch = chapters.find((c) => c.module === lesson.module)!; return `${ch.title}. ${fill(ch.intro, company)} Your mission: ${fill(ch.mission, company)}`; }
    case 'analogy': return `${piece.title}. ${plain(lesson.analogy.body)}`;
    case 'diagram': return lesson.diagram!.steps.map((s, i) => `Step ${i + 1}. ${plain(s.caption)}`).join(' ');
    case 'section': return `${piece.title}. ${plain(piece.body)}`;
    case 'question': return `${plain(piece.question.stem)} ${piece.question.options.map((o, i) => `Option ${'ABCDEF'[i]}: ${plain(o)}.`).join(' ')}`;
    case 'tradeoffs': return (lesson.prosCons ?? []).map((p) => `${p.option}. Use when: ${p.useWhen}`).join(' ');
    case 'recap': return `Key facts. ${lesson.keyFacts.map(plain).join(' ')} Exam tips. ${lesson.examTips.map(plain).join(' ')} Traps. ${lesson.pitfalls.map(plain).join(' ')}`;
    default: return '';
  }
}

function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const ok = typeof window !== 'undefined' && 'speechSynthesis' in window;
  useEffect(() => () => { if (ok) speechSynthesis.cancel(); }, [ok]);
  return {
    ok, speaking,
    toggle: (text: string) => {
      if (!ok) return;
      if (speaking) { speechSynthesis.cancel(); setSpeaking(false); return; }
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      u.onend = u.onerror = () => setSpeaking(false);
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
      setSpeaking(true);
    },
    stop: () => { if (ok) speechSynthesis.cancel(); setSpeaking(false); },
  };
}

export default function LessonPage() {
  const { id = '' } = useParams();
  const lesson = getLesson(id);
  const entry = outline.find((o) => o.id === id);
  const idx = outline.findIndex((o) => o.id === id);
  const prev = outline[idx - 1], next = outline[idx + 1];
  const visit = useStore((s) => s.visitLesson);
  const complete = useStore((s) => s.completeLesson);
  const setPiece = useStore((s) => s.setLessonPiece);
  const done = useStore((s) => !!s.lessons[id]?.completedAt);
  const savedPiece = useStore((s) => s.lessons[id]?.piece);
  const labState = useStore((s) => s.labs);
  const company = useStore((s) => s.profile.company?.trim() || DEFAULT_COMPANY);
  const tutor = useTutor();
  const speech = useSpeech();
  const labs = labsForLesson(id);
  const firstInModule = !!lesson && outline.find((o) => o.module === lesson.module)?.id === id;

  const pieces = useMemo(() => lesson ? buildPieces(lesson, stableQuiz(id), {
    chapterTitle: firstInModule ? chapters.find((c) => c.module === lesson.module)?.title : undefined,
    hasLab: labs.length > 0,
  }) : [], [lesson, id, firstInModule, labs.length]);

  const last = pieces.length - 1;
  const pos = Math.min(last, savedPiece ?? (done ? last : 0));
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [diagramSeen, setDiagramSeen] = useState(false);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const current = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  useEffect(() => { visit(id); setAnswers({}); setDiagramSeen(false); setOpen(new Set()); moved.current = false; }, [id, visit]);
  useEffect(() => { speech.stop(); if (moved.current) current.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [pos]); // eslint-disable-line react-hooks/exhaustive-deps
  useTutorContext(lesson ? `Lesson: ${lesson.title}` : '', lesson ? `Lesson "${lesson.title}". Summary: ${lesson.summary}\nKey facts:\n- ${lesson.keyFacts.join('\n- ')}\nExam tips:\n- ${lesson.examTips.join('\n- ')}` : '');

  if (!entry) return <Empty title="Lesson not found" />;
  if (!lesson) return <Empty title={entry.title}>This lesson's content is still being written. Try another waypoint.</Empty>;
  const mod = modules.find((m) => m.id === lesson.module)!;
  const dom = DOMAINS.find((d) => d.id === lesson.domain);
  const cards = flashcards.filter((c) => c.lessonId === id).length;

  const goto = (n: number) => { moved.current = true; setPiece(id, Math.max(0, Math.min(last, n))); };
  const piece = pieces[pos];
  const gate = piece.kind === 'question' ? (answers[piece.question.id] === undefined ? 'Answer to continue. A wrong answer won’t block you.' : '')
    : piece.kind === 'diagram' && !diagramSeen ? 'Step through the diagram to continue.' : '';

  const totalWords = pieces.reduce((a, p) => a + p.words, 0) || 1;
  const leftWords = pieces.slice(pos).reduce((a, p) => a + p.words, 0);
  const minsLeft = Math.ceil((lesson.minutes * leftWords) / totalWords);
  const asked = Object.values(answers);
  const score = asked.filter(Boolean).length;

  const finish = () => {
    const before = companyStats(useStore.getState());
    complete(id);
    toast({ icon: '🏁', title: 'Waypoint cleared · +50 XP', body: `${lesson.title}. ${before.name} gained ~${usersPerLesson(before.modulesDone).toLocaleString()} users.` });
  };

  const body = (p: Piece, i: number): ReactNode => {
    switch (p.kind) {
      case 'chapter': {
        const ch = chapters.find((c) => c.module === lesson.module)!;
        return (
          <div className="rounded-2xl bg-ink text-paper p-5">
            <div className="text-xs uppercase tracking-wider text-paper/60">The story · {company}</div>
            <div className="font-display text-2xl font-bold mt-1">{ch.title}</div>
            <p className="mt-2 text-paper/90 leading-relaxed">{fill(ch.intro, company)}</p>
            <p className="mt-3 rounded-lg bg-paper/10 px-3 py-2"><b>Your mission:</b> {fill(ch.mission, company)}</p>
          </div>
        );
      }
      case 'analogy':
        return (
          <aside className="rounded-2xl p-5 border-l-4" style={{ borderColor: 'var(--xp)', background: 'color-mix(in srgb, var(--xp) 8%, var(--surface))' }}>
            <div className="font-display font-bold text-lg mb-1">{p.title}</div>
            <Md text={lesson.analogy.body} />
          </aside>
        );
      case 'diagram':
        return <Diagram diagram={lesson.diagram!} onStep={i === pos ? (s, total) => { if (s >= total - 1) setDiagramSeen(true); } : undefined} />;
      case 'section': {
        const s = lesson.sections[p.section];
        return (
          <section>
            <h2 className="font-display text-2xl font-bold mb-3">{p.title} {s.beyond && <Beyond />}</h2>
            <div className="text-[16.5px]"><Md text={p.body} /></div>
            {p.withTable && s.table && (
              <div className="overflow-x-auto mt-3 rounded-xl border border-line">
                <table className="w-full text-sm">
                  <thead className="bg-sunk"><tr>{s.table.headers.map((h) => <th key={h} className="text-left px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
                  <tbody>{s.table.rows.map((r, j) => <tr key={j} className="border-t border-line">{r.map((c, k) => <td key={k} className={`px-3 py-2 align-top ${k === 0 ? 'font-medium' : ''}`}><Md text={c} /></td>)}</tr>)}</tbody>
                </table>
              </div>
            )}
          </section>
        );
      }
      case 'question':
        return <QuestionCard key={p.question.id} q={p.question} onAnswered={(ok) => setAnswers((a) => ({ ...a, [p.question.id]: ok }))} />;
      case 'tradeoffs':
        return (
          <section>
            <h2 className="font-display text-2xl font-bold mb-3">Trade-offs</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {lesson.prosCons!.map((pc) => (
                <div key={pc.option} className="rounded-2xl border border-line bg-surface p-4">
                  <div className="font-display font-bold text-lg">{pc.option}</div>
                  <ul className="mt-2 text-sm space-y-1">{pc.pros.map((x) => <li key={x} className="flex gap-2"><span className="text-ok">＋</span>{x}</li>)}</ul>
                  <ul className="mt-2 text-sm space-y-1">{pc.cons.map((x) => <li key={x} className="flex gap-2"><span className="text-bad">−</span>{x}</li>)}</ul>
                  <div className="mt-3 text-sm rounded-lg bg-sunk px-3 py-2"><b>Use when:</b> {pc.useWhen}</div>
                </div>
              ))}
            </div>
          </section>
        );
      case 'recap':
        return (
          <section className="grid md:grid-cols-3 gap-4">
            {([['Key facts', lesson.keyFacts, '📌'], ['Exam tips', lesson.examTips, '🎯'], ['Traps', lesson.pitfalls, '🪤']] as const).map(([t, list, ic]) => (
              <div key={t} className="rounded-2xl border border-line bg-surface p-4">
                <div className="font-display font-bold mb-2">{ic} {t}</div>
                <ul className="space-y-2 text-[14.5px]">{list.map((x, k) => <li key={k} className="leading-snug"><Md text={x} /></li>)}</ul>
              </div>
            ))}
          </section>
        );
      case 'lab':
        return (
          <section className="rounded-2xl bg-ink text-paper p-5">
            <div className="font-display text-xl font-bold">Do it in the console</div>
            <p className="text-paper/75 text-sm">Build it yourself in the simulated AWS console. Each step is checked live. Optional: you can finish the lesson first and come back.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {labs.map((l) => <Link key={l.id} to={`/console?lab=${l.id}`} className="px-4 py-2 rounded-xl bg-xp text-[#1b1200] font-semibold">{labState[l.id]?.completedAt ? '✓ ' : ''}{l.title} · {l.minutes} min</Link>)}
            </div>
          </section>
        );
      case 'finish':
        return (
          <section className="rounded-2xl border border-line bg-surface p-5">
            <div className="font-display text-2xl font-bold">{done ? 'Lesson cleared ✓' : 'You made it to the end.'}</div>
            {asked.length > 0 && <p className="mt-1">Quick checks: <b>{score}/{asked.length}</b>{score / asked.length >= 0.8 ? ', nailed it.' : score / asked.length >= 0.6 ? ', solid.' : '. Worth reopening the sections above. Missed questions come back in Practice.'}</p>}
            <div className="flex flex-wrap gap-2 mt-4">
              {!done && <Btn kind="xp" onClick={finish}>Finish lesson · +50 XP</Btn>}
              {next && <Btn to={`/lesson/${next.id}`} kind={done ? 'xp' : 'primary'}>Next: {next.title}</Btn>}
              {cards > 0 && <Btn kind="ghost" to={`/flashcards?lesson=${id}`}>Study {cards} flashcards</Btn>}
              <Btn kind="ghost" onClick={() => tutor.open(`Quiz me with 3 new questions about "${lesson.title}", one at a time.`)}>Ask the tutor to quiz me</Btn>
              <Btn kind="ghost" onClick={() => { setAnswers({}); setDiagramSeen(false); setOpen(new Set()); goto(0); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Restart lesson</Btn>
            </div>
          </section>
        );
    }
  };

  const doneIcon = (p: Piece) => p.kind === 'question' ? (answers[p.question.id] === undefined ? '○' : answers[p.question.id] ? '✅' : '❌') : '✓';
  const speak = speechText(piece, lesson, company);

  return (
    <article className="max-w-[820px] mx-auto">
      <div className="text-sm text-muted flex flex-wrap items-center gap-2">
        <Link to="/path" className="hover:underline">The Gauntlet</Link><span>/</span><span>Module {mod.id.slice(1).toUpperCase()}: {mod.title}</span>
      </div>
      <h1 className="font-display text-4xl lg:text-5xl font-extrabold tracking-tight mt-2 leading-[1.05]">{lesson.title}</h1>
      <div className="flex flex-wrap items-center gap-2 mt-3 text-sm">
        <span className="px-2.5 py-0.5 rounded-full text-white" style={{ background: dom?.color ?? 'var(--d-foundations)' }}>{dom?.short ?? 'Foundations'}</span>
        <span className="text-muted">{lesson.minutes} min</span>
        {lesson.beyond && <Beyond />}
        {done && <span className="text-ok font-medium">✓ Cleared</span>}
      </div>
      <p className="text-lg mt-4 text-muted max-w-[65ch]">{lesson.summary}</p>
      <div className="flex flex-wrap gap-1.5 mt-4">
        {lesson.services.map((s) => <Link key={s} to={`/services/${s}`} className="flex items-center gap-1.5 text-sm pl-1 pr-2.5 py-1 rounded-full border border-line hover:bg-sunk"><ServiceIcon id={s} size={20} />{serviceMap.get(s)?.name ?? s}</Link>)}
      </div>

      {/* Progress through the lesson */}
      <div className="sticky top-14 z-10 -mx-2 px-2 py-2 mt-6 bg-paper/95 backdrop-blur">
        <div className="flex items-center gap-3 text-xs text-muted tabular-nums">
          <span>{pos + 1} / {pieces.length}</span>
          <span className="flex-1 flex gap-[3px]" aria-hidden>
            {pieces.map((p, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i < pos ? (p.kind === 'question' ? (answers[p.question.id] === false ? 'bg-bad' : 'bg-ok') : 'bg-xp') : i === pos ? 'bg-ink' : 'bg-line'}`} />)}
          </span>
          <span>{pos === last ? 'done' : `~${minsLeft} min left`}</span>
        </div>
      </div>

      {/* Finished pieces: one line each, click to reopen */}
      <ol className="mt-2 space-y-1.5">
        {pieces.slice(0, pos).map((p, i) => (
          <li key={i}>
            <button onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
              className="w-full flex items-center gap-2 text-left text-sm px-3 py-1.5 rounded-lg hover:bg-sunk text-muted" aria-expanded={open.has(i)}>
              <span className="w-5 text-center">{doneIcon(p)}</span><span className="truncate">{p.title}</span><span className="ml-auto text-xs">{open.has(i) ? 'hide' : 'reread'}</span>
            </button>
            {open.has(i) && <div className="mt-2 mb-4">{p.kind === 'question' ? <QuestionCard q={p.question} review={null} /> : body(p, i)}</div>}
          </li>
        ))}
      </ol>

      {/* The current piece */}
      <div ref={current} className="mt-4 scroll-mt-28">
        {body(piece, pos)}
        {pos < last && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {speech.ok && speak && <button onClick={() => speech.toggle(speak)} className="text-sm px-3 py-1.5 rounded-lg border border-line hover:bg-sunk">{speech.speaking ? '⏹ Stop reading' : '🔊 Read aloud'}</button>}
            {gate && <span className="text-sm text-muted">{gate}</span>}
            {piece.kind === 'diagram' && !diagramSeen && <button onClick={() => setDiagramSeen(true)} className="text-xs text-muted underline">skip diagram</button>}
            <Btn kind="xp" className="ml-auto" disabled={!!gate} onClick={() => goto(pos + 1)}>Continue →</Btn>
          </div>
        )}
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-line pt-6">
        {prev && <Btn kind="ghost" to={`/lesson/${prev.id}`}>← {prev.title}</Btn>}
        {done && pos < last && <button onClick={() => goto(last)} className="ml-auto text-sm underline text-muted">Skip to the end (already cleared)</button>}
      </div>
    </article>
  );
}
