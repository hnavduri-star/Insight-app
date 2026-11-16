import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { appSettings, categories, finderResults, profiles, topicProgress, topics } from '../db/schema.js';
import { requireAuth } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';
import { aiEnabled, refineFinderPicks } from '../lib/ai.js';
import type { Finder, FinderQuestion } from '../db/finderSheet.js';
import { checkLimit } from './bites.js';
import { GOAL_TOPICS } from './home.js';

/**
 * "Find my skills": 7 indirect "how would you react?" questions find the weakest skill areas,
 * 3 follow-ups pick topics within them, then 3 recommended topics with a reason each.
 * Rule-based and instant; an optional free-text note lets the AI fine-tune the picks.
 */
export const finderRoutes = Router();
finderRoutes.use(requireAuth);

/** Which skill headings each goal leans on (adds weight to the ranking). */
export const GOAL_HEADINGS: Record<string, string[]> = {
  'Perform better in my role': ['Personal Effectiveness & Habits', 'Thinking & Decision-Making'],
  'Get promoted': ['Influence, Negotiation & Sales', 'Communication & Presenting'],
  'Change jobs or careers': ['Career, Purpose & Learning'],
  'Lead and develop my team': ['Leading Teams & Execution', 'Relationships, EQ & Conflict'],
  'Communicate and influence with impact': ['Communication & Presenting', 'Influence, Negotiation & Sales'],
  'Grow my business': ['Business Strategy & Entrepreneurship', 'Money & Finance'],
  'Manage stress and balance': ['Wellbeing & Life Balance'],
  'Grow personally': ['Relationships, EQ & Conflict', 'Career, Purpose & Learning'],
};

type Persona = 'early_career' | 'manager' | 'senior_executive';
type Answers = Record<string, string>;

async function finderData(): Promise<Finder> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, 'finder'));
  if (!row) throw new HttpError(503, 'Find my skills is not set up yet.', 'finder_missing');
  return row.value as Finder;
}

async function profileOf(userId: string) {
  const [p] = await db.select({ persona: profiles.persona, goals: profiles.goals }).from(profiles).where(eq(profiles.userId, userId));
  return { persona: (p?.persona ?? 'manager') as Persona, goals: (p?.goals as string[]) ?? [] };
}

const viewQ = (q: FinderQuestion, persona: Persona) => ({ id: q.id, heading: q.heading, text: q.text[persona], answers: q.answers.map((a) => ({ key: a.key, text: a.text })) });

/** Gap score per heading from round 1, nudged towards the learner's goals (main goal counts most). */
export function headingScores(f: Finder, answers: Answers, goals: string[]) {
  const s = new Map<string, number>();
  const insights = new Map<string, { text: string; weight: number }>();
  for (const q of f.round1) {
    const a = q.answers.find((x) => x.key === answers[q.id]);
    for (const p of a?.points ?? []) {
      s.set(p.name, (s.get(p.name) ?? 0) + p.weight);
      const prev = insights.get(p.name);
      if (a!.insight && (!prev || p.weight > prev.weight)) insights.set(p.name, { text: a!.insight, weight: p.weight });
    }
  }
  goals.forEach((g, i) => (GOAL_HEADINGS[g] ?? []).forEach((h) => s.set(h, (s.get(h) ?? 0) + (i === 0 ? 1 : 0.5))));
  const ranked = [...s.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { ranked, insights };
}

/** The follow-up questions: two for the weakest area, one for the next. */
export function round2For(f: Finder, answers: Answers, goals: string[]) {
  const { ranked } = headingScores(f, answers, goals);
  const focus = ranked.slice(0, 2).map(([h]) => h);
  if (focus.length < 2) for (const h of ['Communication & Presenting', 'Influence, Negotiation & Sales']) if (!focus.includes(h) && focus.length < 2) focus.push(h);
  const qs = [...f.round2.filter((q) => q.heading === focus[0]).slice(0, 2), ...f.round2.filter((q) => q.heading === focus[1]).slice(0, 1)];
  return { focus, questions: qs };
}

/** Three topics in order, each with a one-line reason drawn from the learner's own answers. */
export function recommend(f: Finder, answers: Answers, goals: string[], catalog: { name: string; category: string; featured: boolean }[], exclude: Set<string>) {
  const { ranked, insights } = headingScores(f, answers, goals);
  const { focus, questions } = round2For(f, answers, goals);
  const score = new Map<string, number>();
  const why = new Map<string, string>();
  questions.forEach((q) => {
    const a = q.answers.find((x) => x.key === answers[q.id]);
    const w = q.heading === focus[0] ? 3 : 2;
    for (const p of a?.points ?? []) {
      score.set(p.name, (score.get(p.name) ?? 0) + w);
      if (a!.insight && !why.has(p.name)) why.set(p.name, a!.insight);
    }
  });
  const picks: { name: string; reason: string }[] = [];
  const push = (name: string, reason: string) => {
    if (picks.length < 3 && !exclude.has(name) && !picks.some((p) => p.name === name) && catalog.some((c) => c.name === name)) picks.push({ name, reason });
  };
  [...score.entries()].sort((a, b) => b[1] - a[1]).forEach(([name]) => push(name, why.get(name)!));
  // Not enough clear signals: fill from the weakest areas (goal topics, then Editor's picks, then the first topic).
  const headingOf = (name: string) => catalog.find((c) => c.name === name)?.category;
  for (const [h] of ranked.length ? ranked : focus.map((x) => [x, 0] as [string, number])) {
    const reason = insights.get(h)?.text ?? `Supports your goal: ${goals[0] ?? 'growth'}`;
    goals.flatMap((g) => GOAL_TOPICS[g] ?? []).filter((n) => headingOf(n) === h).forEach((n) => push(n, reason));
    catalog.filter((c) => c.category === h && c.featured).forEach((c) => push(c.name, reason));
    catalog.filter((c) => c.category === h).slice(0, 1).forEach((c) => push(c.name, reason));
    if (picks.length >= 3) break;
  }
  // Still short (e.g. every answer was strong): the goal's flagship topics, then any Editor's pick.
  const goalReason = `Supports your goal: ${goals[0] ?? 'growth'}`;
  goals.flatMap((g) => GOAL_TOPICS[g] ?? []).forEach((n) => push(n, goalReason));
  catalog.filter((c) => c.featured).forEach((c) => push(c.name, "An Editor's pick to build on your strengths"));
  return { picks, focus, headings: ranked.map(([name, s]) => ({ name, score: s })) };
}

finderRoutes.get('/', async (req, res) => {
  const userId = req.userId!;
  const f = await finderData();
  const { persona } = await profileOf(userId);
  const results = await db.select().from(finderResults).where(eq(finderResults.userId, userId)).orderBy(desc(finderResults.createdAt)).limit(2);
  res.json({ round1: f.round1.map((q) => viewQ(q, persona)), latest: results[0] ? await resultView(results[0]) : null, previous: results[1] ? await resultView(results[1]) : null });
});

const answersInput = z.record(z.string().max(40), z.string().max(4));

finderRoutes.post('/round2', async (req, res) => {
  const { answers } = z.object({ answers: answersInput }).parse(req.body);
  const f = await finderData();
  const missing = f.round1.filter((q) => !answers[q.id]);
  if (missing.length) throw new HttpError(400, 'Answer every question first.', 'incomplete');
  const { persona, goals } = await profileOf(req.userId!);
  const { focus, questions } = round2For(f, answers, goals);
  res.json({ focus, round2: questions.map((q) => viewQ(q, persona)) });
});

async function resultView(r: typeof finderResults.$inferSelect) {
  const picks = r.topicsJson as { name: string; reason: string }[];
  const rows = picks.length ? await db.select({ id: topics.id, name: topics.name, category: categories.name }).from(topics)
    .innerJoin(categories, eq(categories.id, topics.categoryId)).where(inArray(topics.name, picks.map((p) => p.name))) : [];
  return {
    id: r.id, createdAt: r.createdAt, note: r.note,
    topics: picks.map((p) => ({ ...p, ...rows.find((x) => x.name === p.name) })).filter((p) => p.id),
    headings: Object.entries(r.headingScoresJson as Record<string, number>).map(([name, score]) => ({ name, score })).sort((a, b) => b.score - a.score),
  };
}

finderRoutes.post('/result', async (req, res) => {
  const body = z.object({ answers: answersInput, note: z.string().trim().max(400).optional() }).parse(req.body);
  const userId = req.userId!;
  const f = await finderData();
  if (f.round1.some((q) => !body.answers[q.id])) throw new HttpError(400, 'Answer every question first.', 'incomplete');
  const { goals } = await profileOf(userId);
  const catalog = await db.select({ name: topics.name, category: categories.name, featured: topics.featured }).from(topics)
    .innerJoin(categories, eq(categories.id, topics.categoryId));
  // Topics already through Foundations aren't recommended again.
  const done = await db.select({ name: topics.name }).from(topicProgress).innerJoin(topics, eq(topics.id, topicProgress.topicId))
    .where(and(eq(topicProgress.userId, userId), isNotNull(topicProgress.quizCompletedAt)));
  let { picks, headings } = recommend(f, body.answers, goals, catalog, new Set(done.map((d) => d.name)));
  if (body.note && aiEnabled()) {
    // The learner described something specific: let the AI fine-tune the picks (falls back to the rule-based ones).
    try {
      await checkLimit(userId, 'finder');
      const refined = await refineFinderPicks(userId, { note: body.note, candidates: picks, weakAreas: headings.slice(0, 3).map((h) => h.name), goals,
        topics: catalog.map((c) => c.name) });
      if (refined.length) picks = refined.slice(0, 3);
    } catch (e) { console.warn('[finder] refine skipped:', e instanceof Error ? e.message : e); }
  }
  const [row] = await db.insert(finderResults).values({
    userId, answersJson: body.answers, headingScoresJson: Object.fromEntries(headings.map((h) => [h.name, h.score])), topicsJson: picks, note: body.note || null,
  }).returning();
  res.json(await resultView(row));
});

/** The learner's latest recommended topics (for Home). */
export async function latestPicks(userId: string) {
  const [r] = await db.select().from(finderResults).where(eq(finderResults.userId, userId)).orderBy(desc(finderResults.createdAt)).limit(1);
  return r ? resultView(r) : null;
}
