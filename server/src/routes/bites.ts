import { Router } from 'express';
import { z } from 'zod';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  aiCalls, assessments, books, cachedLessons, cardFeedback, categories, profiles, scenarios, topicBooks, topicProgress, topics,
} from '../db/schema.js';
import { requireAuth } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';
import { requireTopicAccess } from '../lib/access.js';
import { checkBite, generateBite, gradeScenario, type Bite } from '../lib/ai.js';
import { PERSONAS } from '../../../shared/options.js';

export const biteRoutes = Router();
biteRoutes.use(requireAuth);

export const LIMITS = { bite: 20, grade: 30 }; // AI calls per user per rolling 24 hours

async function checkLimit(userId: string, endpoint: 'bite' | 'grade') {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(aiCalls)
    .where(and(eq(aiCalls.userId, userId), eq(aiCalls.endpoint, endpoint), gt(aiCalls.createdAt, sql`now() - interval '1 day'`)));
  if (n >= LIMITS[endpoint]) throw new HttpError(429, "You've reached today's limit. Come back tomorrow for more.", 'daily_limit');
}

export const ratingBand = (score?: number | null) =>
  score == null ? 'core' : score <= 4 ? 'foundation' : score >= 8 ? 'advanced' : 'core';

const uuid = (v: unknown, what = 'Bite') => {
  const r = z.string().uuid().safeParse(v);
  if (!r.success) throw new HttpError(404, `${what} not found`);
  return r.data;
};

/**
 * Toolkits are built in the background so no single request has to stay open for minutes.
 * Learners asking for the same new toolkit share one job (and one AI call). A failed job
 * keeps its error for a few minutes so the next poll can report it.
 */
type Job = { promise: Promise<void>; error?: unknown };
const jobs = new Map<string, Job>();
export const WAIT_MS = { value: 8_000 }; // how long one request waits before answering "still building" (kept short for hosting proxies)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Start a bite: returns the shared cached version for this learner's profile, generating it once if needed. */
biteRoutes.post('/', async (req, res) => {
  const topicId = uuid(req.body?.topicId, 'Topic');
  const userId = req.userId!;
  await requireTopicAccess(userId, topicId);

  const [p] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  const goals = (p?.goals as string[]) ?? [];
  if (!p?.persona || !p.industry || !goals.length || !p.dailyMinutes) throw new HttpError(409, 'Finish setting up your profile first.', 'profile_incomplete');
  const [a] = await db.select().from(assessments)
    .where(and(eq(assessments.userId, userId), eq(assessments.topicId, topicId), eq(assessments.phase, 'baseline')));
  const key = { topicId, persona: p.persona, industry: p.industry, goal: goals[0], ratingBand: ratingBand(a?.score) } as const;
  const where = and(eq(cachedLessons.topicId, key.topicId), eq(cachedLessons.persona, key.persona), eq(cachedLessons.industry, key.industry),
    eq(cachedLessons.goal, key.goal), eq(cachedLessons.ratingBand, key.ratingBand));

  let [lesson] = await db.select().from(cachedLessons).where(where);
  // A bite saved in an older format is rebuilt once and replaced.
  const ready = (l?: typeof lesson) => !!l && checkBite(l.contentJson as Bite) === null;
  const cached = ready(lesson);
  if (!cached) {
    const k = JSON.stringify(key);
    let job = jobs.get(k);
    if (job?.error) { jobs.delete(k); throw job.error; }
    if (!job) {
      await checkLimit(userId, 'bite');
      const j: Job = {
        promise: (async () => {
          const [t] = await db.select({ name: topics.name, description: topics.description }).from(topics).where(eq(topics.id, topicId));
          const bookRows = await db.select({ title: books.title, author: books.author }).from(topicBooks)
            .innerJoin(books, eq(books.id, topicBooks.bookId)).where(eq(topicBooks.topicId, topicId)).orderBy(asc(topicBooks.sortOrder));
          const { bite, model } = await generateBite(userId, {
            topic: t.name, scope: t.description, books: bookRows,
            persona: PERSONAS.find((x) => x.value === key.persona)!.label, industry: key.industry, goals, minutes: p.dailyMinutes!, band: key.ratingBand,
          });
          await db.insert(cachedLessons).values({ ...key, contentJson: bite, model })
            .onConflictDoUpdate({ target: [cachedLessons.topicId, cachedLessons.persona, cachedLessons.industry, cachedLessons.goal, cachedLessons.ratingBand],
              set: { contentJson: bite, model, createdAt: new Date() } });
        })(),
      };
      j.promise.then(() => { if (jobs.get(k) === j) jobs.delete(k); }, (err) => {
        console.error('[bites] toolkit job failed:', err instanceof Error ? err.message : err);
        j.error = err;
        setTimeout(() => { if (jobs.get(k) === j) jobs.delete(k); }, 5 * 60_000).unref?.();
      });
      jobs.set(k, j);
      job = j;
    }
    await Promise.race([job.promise.catch(() => {}), sleep(WAIT_MS.value)]);
    [lesson] = await db.select().from(cachedLessons).where(where);
    if (!ready(lesson)) {
      if (job.error) { jobs.delete(k); throw job.error; }
      return void res.status(202).json({ status: 'generating' });
    }
  }
  const [meta] = await db.select({ name: topics.name, category: categories.name }).from(topics)
    .innerJoin(categories, eq(categories.id, topics.categoryId)).where(eq(topics.id, topicId));
  res.json({ lessonId: lesson.id, topic: { id: topicId, ...meta }, bite: lesson.contentJson as Bite, cached });
});

async function lessonFor(userId: string, lessonId: string) {
  const [l] = await db.select().from(cachedLessons).where(eq(cachedLessons.id, uuid(lessonId)));
  if (!l) throw new HttpError(404, 'Bite not found');
  await requireTopicAccess(userId, l.topicId);
  return l;
}

/** Records progress through a bite. (XP and streaks arrive in milestone 3.) */
biteRoutes.post('/:id/progress', async (req, res) => {
  const body = z.discriminatedUnion('stage', [
    z.object({ stage: z.literal('cards') }),
    z.object({ stage: z.literal('quiz'), correct: z.number().int().min(0).max(5) }),
  ]).parse(req.body);
  const l = await lessonFor(req.userId!, req.params.id);
  const set = body.stage === 'cards' ? { cardsCompletedAt: new Date() } : { quizCorrect: body.correct };
  await db.insert(topicProgress).values({ userId: req.userId!, topicId: l.topicId, ...set })
    .onConflictDoUpdate({ target: [topicProgress.userId, topicProgress.topicId],
      set: body.stage === 'cards' ? { cardsCompletedAt: sql`coalesce(${topicProgress.cardsCompletedAt}, now())` }
        : { quizCorrect: sql`greatest(${topicProgress.quizCorrect}, ${body.correct})` } });
  res.json({ ok: true });
});

/** Helpful / not helpful on a card: used to improve bites. */
biteRoutes.post('/:id/feedback', async (req, res) => {
  const body = z.object({ cardIndex: z.number().int().min(0).max(7), helpful: z.boolean() }).parse(req.body);
  const l = await lessonFor(req.userId!, req.params.id);
  await db.insert(cardFeedback).values({ userId: req.userId!, lessonId: l.id, ...body })
    .onConflictDoUpdate({ target: [cardFeedback.userId, cardFeedback.lessonId, cardFeedback.cardIndex], set: { helpful: body.helpful } });
  res.json({ ok: true });
});

/** Grades a written scenario answer with AI. */
biteRoutes.post('/:id/scenario', async (req, res) => {
  const { response } = z.object({ response: z.string().trim().min(20, 'Write at least a couple of sentences').max(1500, 'Keep it under 1,500 characters') }).parse(req.body);
  const userId = req.userId!;
  const l = await lessonFor(userId, req.params.id);
  await checkLimit(userId, 'grade');
  const bite = l.contentJson as Bite;
  const grade = await gradeScenario(userId, { framework: bite.framework, tools: bite.tools.map((t) => ({ name: t.name, idea: t.idea })), scenario: bite.scenario, response });
  const names = new Set(bite.tools.map((t) => t.name));
  grade.toolsUsed = grade.toolsUsed.filter((n) => names.has(n)); // only tools that exist in this bite
  await db.insert(scenarios).values({ userId, topicId: l.topicId, lessonId: l.id, responseText: response, score: grade.score, feedbackJson: grade });
  await db.insert(topicProgress).values({ userId, topicId: l.topicId, bestScenarioScore: grade.score })
    .onConflictDoUpdate({ target: [topicProgress.userId, topicProgress.topicId],
      set: { bestScenarioScore: sql`greatest(coalesce(${topicProgress.bestScenarioScore}, 0), ${grade.score})` } });
  res.json(grade);
});
