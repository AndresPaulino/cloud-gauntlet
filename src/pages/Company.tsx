// Your startup: grows as you study. Users, customers, revenue, stock, HQ, and the story so far.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore, today } from '../store/store';
import { companyStats, newsFeed } from '../lib/company';
import { chapters, fill } from '../content/story';
import { outline } from '../content';
import { Panel, Btn } from '../ui/bits';

const n = (x: number) => x.toLocaleString();
const usd = (x: number) => x >= 1e9 ? `$${(x / 1e9).toFixed(2)}B` : x >= 1e6 ? `$${(x / 1e6).toFixed(1)}M` : x >= 1e3 ? `$${(x / 1e3).toFixed(1)}k` : `$${x.toFixed(0)}`;

/** The HQ: one floor per 3 lessons (plus one per finished module). Windows light up when you've studied today. */
export function Building({ floors, litToday, ipo, className = '' }: { floors: number; litToday: number; ipo: boolean; className?: string }) {
  const shown = Math.min(floors, 30);
  const H = 12 + shown * 6 + 8, W = 60;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={`HQ with ${floors} floor${floors > 1 ? 's' : ''}`}>
      <rect x={0} y={H - 4} width={W} height={4} fill="var(--line)" />
      {Array.from({ length: shown }).map((_, i) => {
        const y = H - 4 - (i + 1) * 6;
        return (
          <g key={i}>
            <rect x={14} y={y} width={32} height={6} fill="var(--ink)" opacity={0.9} />
            {Array.from({ length: 5 }).map((__, j) => {
              const lit = ((i * 5 + j) * 7919) % 100 < litToday * 100;
              return <rect key={j} x={16.5 + j * 6} y={y + 1.5} width={3.5} height={3} rx={0.4} fill={lit ? 'var(--xp)' : 'var(--muted)'} opacity={lit ? 1 : 0.35} />;
            })}
          </g>
        );
      })}
      <rect x={26} y={H - 4 - 3.5} width={8} height={3.5} fill="var(--xp)" opacity={0.8} />
      {ipo && <text x={W / 2} y={H - 4 - shown * 6 - 2} textAnchor="middle" fontSize={6}>🔔</text>}
    </svg>
  );
}

function Spark({ data }: { data: { price: number }[] }) {
  if (data.length < 2) return <div className="text-xs text-muted">The chart starts after your second study day.</div>;
  const ps = data.map((d) => d.price), lo = Math.min(...ps), hi = Math.max(...ps), span = hi - lo || 1;
  const pts = ps.map((p, i) => `${(i / (ps.length - 1)) * 100},${28 - ((p - lo) / span) * 26}`).join(' ');
  const up = ps.at(-1)! >= ps[0];
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-16" aria-label="Stock price, last 30 days">
      <polyline points={pts} fill="none" stroke={up ? 'var(--ok)' : 'var(--bad)'} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function Company() {
  const p = useStore();
  const setProfile = useStore((s) => s.setProfile);
  const c = companyStats(p);
  const [editing, setEditing] = useState(false);
  const xpToday = p.activeDays[today()] ?? 0;
  const news = newsFeed(p, c.name);
  const chLessons = outline.filter((o) => o.module === c.chapter.module);
  const chDone = chLessons.filter((o) => p.lessons[o.id]?.completedAt).length;
  const nextLesson = chLessons.find((o) => !p.lessons[o.id]?.completedAt);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0">
          <p className="text-muted">You are the founding architect of</p>
          {editing ? (
            <form onSubmit={(e) => { e.preventDefault(); setEditing(false); }} className="flex gap-2 mt-1">
              <input autoFocus defaultValue={c.name} maxLength={40} onChange={(e) => setProfile({ company: e.target.value })} className="font-display text-3xl font-extrabold bg-sunk rounded-lg px-2 w-[16ch]" aria-label="Company name" />
              <Btn>Save</Btn>
            </form>
          ) : (
            <h1 className="font-display text-3xl lg:text-4xl font-extrabold tracking-tight">{c.name} <button onClick={() => setEditing(true)} className="text-sm font-normal text-muted underline align-middle">rename</button></h1>
          )}
        </div>
        <span className="ml-auto text-sm px-3 py-1.5 rounded-full bg-surface border border-line">🏢 {c.hq}</span>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Panel className="lg:col-span-2" title={chapters[c.chapterIndex].title} action={<span className="text-muted tabular-nums">{chDone}/{chLessons.length} lessons</span>}>
          <p className="text-[16.5px] leading-relaxed">{fill(c.chapter.intro, c.name)}</p>
          <p className="mt-3 rounded-lg bg-sunk px-3 py-2"><b>Your mission:</b> {fill(c.chapter.mission, c.name)}</p>
          {nextLesson && <Btn kind="xp" to={`/lesson/${nextLesson.id}`} className="mt-4">Continue: {nextLesson.title}</Btn>}
          {!nextLesson && c.modulesDone === chapters.length && !c.ipo && <Btn kind="xp" to="/exam" className="mt-4">Ring the bell: beat the final boss</Btn>}
        </Panel>
        <Panel title="Headquarters">
          <Building floors={c.floors} litToday={Math.min(1, xpToday / 150)} ipo={c.ipo} className="w-full max-h-[260px]" />
          <p className="text-xs text-muted mt-2">{c.floors} floor{c.floors > 1 ? 's' : ''} · a new floor every 3 lessons. {xpToday ? 'Lights are on: you studied today.' : 'Lights are off. Study today to switch them on.'}</p>
        </Panel>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {([
          ['Users', n(c.users), 'Lessons, labs and correct answers bring users in.'],
          ['Paying customers', n(c.customers), `${(c.conversion * 100).toFixed(1)}% convert. Higher accuracy, more customers.`],
          ['Monthly revenue', usd(c.mrr), 'Customers × $29/month.'],
          ['Uptime', `${c.uptime.toFixed(2)}%`, 'Each domain boss you beat adds reliability.'],
        ] as const).map(([k, v, hint]) => (
          <div key={k} className="rounded-2xl border border-line bg-surface p-4" title={hint}>
            <div className="text-sm text-muted">{k}</div>
            <div className="font-display text-3xl font-extrabold tabular-nums mt-1">{v}</div>
            <div className="text-xs text-muted mt-1">{hint}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Panel title={`${c.name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'STGP'} stock`} className="lg:col-span-2">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-4xl font-extrabold tabular-nums">${c.price.toFixed(2)}</span>
            <span className={`tabular-nums font-semibold ${c.change7d >= 0 ? 'text-ok' : 'text-bad'}`}>{c.change7d >= 0 ? '▲' : '▼'} {(Math.abs(c.change7d) * 100).toFixed(1)}% this week</span>
            <span className="ml-auto text-sm text-muted">Valuation {usd(c.valuation)}</span>
          </div>
          <Spark data={c.series} />
          <p className="text-xs text-muted">Every day you study, the stock rises (more XP, bigger rise). Every day you skip, it slips 3%.</p>
        </Panel>
        <Panel title="Company news">
          {news.length ? (
            <ul className="space-y-2 text-sm">{news.map((x, i) => <li key={i} className="flex gap-2"><span className="text-muted tabular-nums shrink-0 w-12">{new Date(x.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>{x.text}</li>)}</ul>
          ) : <p className="text-muted text-sm">Nothing yet. Finish a lesson to make the news.</p>}
        </Panel>
      </div>

      <Panel title="The story so far">
        <ol className="space-y-3">
          {chapters.map((ch, i) => {
            const done = c.chapterDone[i];
            const current = i === c.chapterIndex && !done;
            return (
              <li key={ch.module} className={`flex gap-3 items-start ${!done && !current ? 'opacity-50' : ''}`}>
                <span className="text-xl leading-none mt-0.5">{done ? '📰' : current ? '▶️' : '🔒'}</span>
                <div>
                  <div className="font-semibold">{ch.title}</div>
                  <div className="text-sm text-muted">{done ? `“${fill(ch.headline, c.name)}”` : current ? fill(ch.mission, c.name) : 'Locked until the previous chapter is done.'}</div>
                </div>
              </li>
            );
          })}
          <li className={`flex gap-3 items-start ${c.ipo ? '' : 'opacity-50'}`}>
            <span className="text-xl leading-none mt-0.5">{c.ipo ? '🔔' : '🔒'}</span>
            <div><div className="font-semibold">Epilogue · The opening bell</div><div className="text-sm text-muted">{c.ipo ? `${c.name} is a public company. Go pass the real exam.` : 'Beat the final boss (750+) to take the company public.'}</div></div>
          </li>
        </ol>
        <p className="text-xs text-muted mt-4">Team of {n(c.team)} · {c.focusSessions} focus block{c.focusSessions === 1 ? '' : 's'} logged · <Link to="/path" className="underline">see the Gauntlet</Link></p>
      </Panel>
    </div>
  );
}
