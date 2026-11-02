// Your startup's numbers, derived from study progress. Pure: no new state is stored.
// Lessons and labs grow users; accuracy drives how many become paying customers;
// study days push the stock up and skipped days let it slide.
import type { Progress } from '../store/store';
import { outline } from '../content/outline.ts';
import { chapters, DEFAULT_COMPANY } from '../content/story.ts';

const SHARES = 5_000_000;
const PRICE_PER_CUSTOMER = 29; // $/month
const DAY = 86_400_000;
const dayKey = (d: Date) => d.toLocaleDateString('en-CA');

/** Daily closing prices from the first study day to `now`. Study days rise (more XP, more rise, capped); idle days slip 3%. */
export function stockSeries(activeDays: Record<string, number>, startedAt: string, now = Date.now()) {
  const days = Object.keys(activeDays).filter((d) => activeDays[d] > 0).sort();
  const first = [startedAt, days[0]].filter(Boolean).sort()[0] ?? dayKey(new Date(now));
  const out: { day: string; price: number }[] = [];
  let price = 1;
  for (let t = new Date(first + 'T12:00:00').getTime(); t <= now + DAY / 2; t += DAY) {
    const day = dayKey(new Date(t));
    const xp = activeDays[day] ?? 0;
    const isToday = day === dayKey(new Date(now));
    // Today isn't over yet: no penalty until the day actually passes.
    if (xp > 0) price *= 1 + Math.min(0.04, 0.005 + xp / 8000);
    else if (!isToday) price *= 0.97;
    out.push({ day, price: Math.round(price * 100) / 100 });
  }
  return out;
}

export function companyStats(p: Progress, now = Date.now()) {
  const name = p.profile.company?.trim() || DEFAULT_COMPANY;
  const lessonsDone = outline.filter((o) => p.lessons[o.id]?.completedAt).length;
  const chapterDone = chapters.map((c) => outline.filter((o) => o.module === c.module).every((o) => p.lessons[o.id]?.completedAt));
  const modulesDone = chapterDone.filter(Boolean).length;
  const labsDone = Object.values(p.labs).filter((l) => l.completedAt).length;
  const qs = Object.values(p.questions);
  const correctUnique = qs.filter((q) => q.correct > 0).length;
  const seen = qs.reduce((a, q) => a + q.seen, 0);
  const accuracy = seen ? qs.reduce((a, q) => a + q.correct, 0) / seen : 0;
  const bosses = (['secure', 'resilient', 'performance', 'cost'] as const)
    .filter((d) => p.attempts.some((a) => a.kind === 'boss' && a.domain === d && a.finishedAt && a.correct / a.questionIds.length >= 0.72)).length;
  const ipo = p.attempts.some((a) => a.kind === 'final' && (a.scaled ?? 0) >= 750);

  const users = Math.round((25 + lessonsDone * 150 + labsDone * 500 + correctUnique * 20) * (1 + 0.5 * modulesDone));
  const conversion = 0.02 + 0.04 * accuracy;
  const customers = Math.round(users * conversion);
  const series = stockSeries(p.activeDays, p.profile.startedAt, now);
  const price = series.at(-1)?.price ?? 1;
  const weekAgo = series.at(-8)?.price ?? series[0]?.price ?? 1;
  // Chapter = first module not finished; HQ = where the last finished chapter left you.
  const firstOpen = chapterDone.indexOf(false);
  const chapterIndex = firstOpen < 0 ? chapters.length - 1 : firstOpen;
  const hq = ipo ? 'Listed on the stock exchange' : modulesDone ? chapters[modulesDone - 1].hq : 'Garage';

  return {
    name, lessonsDone, modulesDone, labsDone, bosses, ipo, hq,
    users, customers, conversion,
    mrr: customers * PRICE_PER_CUSTOMER,
    uptime: 99 + bosses * 0.24, // each boss beaten = more nines
    team: 2 + Math.floor(lessonsDone / 3) + labsDone,
    floors: 1 + Math.floor(lessonsDone / 3) + modulesDone,
    focusSessions: p.focusSessions ?? 0,
    price, change7d: weekAgo ? price / weekAgo - 1 : 0,
    valuation: price * SHARES,
    series: series.slice(-30),
    chapter: chapters[chapterIndex],
    chapterIndex, chapterDone,
  };
}

/** Rough users gained for one more finished lesson (used in the "lesson cleared" toast). */
export const usersPerLesson = (modulesDone: number) => Math.round(150 * (1 + 0.5 * modulesDone));

// News feed: turn recent XP events into company headlines.
const NEWS: Record<string, string[]> = {
  'Lesson complete': ['Engineering ships a new feature', 'The team runs a lunch-and-learn on your design', 'Your architecture doc gets 40 👍 on Slack', 'Product shipped on time for once'],
  'Lab complete': ['Infra team rolls a new stack into production', 'Ops dashboard goes green across the board', 'Deploy finished without a single page'],
  'Badge earned': ['Industry blog names {co} one to watch', '{co} wins an engineering award', 'Recruiters keep calling about your team'],
  'Architecture design': ['Board signs off on your architecture proposal', 'Your design review becomes the company template'],
  'Focus session': ['You blocked out deep work. It shows.', 'Heads-down hour: no meetings, real progress'],
  'Started the Gauntlet': ['{co} incorporates. Day one.'],
};
export function newsFeed(p: Progress, company: string, limit = 8) {
  const out: { t: number; text: string }[] = [];
  for (const e of p.xpLog) {
    const pool = NEWS[e.reason] ?? (/exam$/.test(e.reason) ? ['Investors review the quarterly numbers', 'Analysts update their forecast for {co}'] : null);
    if (!pool) continue;
    out.push({ t: e.t, text: pool[Math.floor(e.t / 1000) % pool.length].replaceAll('{co}', company) });
    if (out.length >= limit) break;
  }
  return out;
}
