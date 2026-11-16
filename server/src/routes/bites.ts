import { Router } from 'express';
import { z } from 'zod';
import { and, asc, avg, count, eq, gt, isNotNull, max, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  aiCalls, assessments, books, cachedLessons, cardFeedback, categories, practiceReps, profiles, reviewItems, roleplaySessions, scenarios, topicBooks, topicProgress, topics,
} from '../db/schema.js';
import { requireAuth } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';
import { requireTopicAccess } from '../lib/access.js';
import { checkBite, generateBite, gradeScenario, type Bite } from '../lib/ai.js';
import { runJob, WAIT_MS } from '../lib/jobs.js';
import { PERSONAS } from '../../../shared/options.js';
import { recordActivity } from '../lib/activity.js';
import { seedReview } from './daily.js';

export { WAIT_MS };
export const biteRoutes = Router();
biteRoutes.use(requireAuth);

/** AI calls per user per rolling 24 hours. */
export const LIMITS: Record<string, number> = { bite: 20, grade: 40, reps: 15, situation: 10, roleplay: 8, roleplay_turn: 80, roleplay_hint: 30, roleplay_debrief: 12, finder: 10 };
export const REPS_GOAL = 10;          // practice reps that complete level 2
export const MASTERY_AFTER_REPS = 5;  // reps needed (with the toolkit done) to unlock mastery
export const ROLEPLAY_AFTER_REPS = 3; // reps needed (with the toolkit done) to unlock level 3 role-play

export async function checkLimit(userId: string, endpoint: keyof typeof LIMITS) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(aiCalls)
    .where(and(eq(aiCalls.userId, userId), eq(aiCalls.endpoint, endpoint), gt(aiCalls.createdAt, sql`now() - interval '1 day'`)));
  if (n >= LIMITS[endpoint]) throw new HttpError(429, "You've reached today's limit. Come back tomorrow for more.", 'daily_limit');
}

export const ratingBand = (score?: number | null) =>
  score == null ? 'core' : score <= 4 ? 'foundation' : score >= 8 ? 'advanced' : 'core';

export const uuid = (v: unknown, what = 'Bite') => {
  const r = z.string().uuid().safeParse(v);
  if (!r.success) throw new HttpError(404, `${what} not found`);
  return r.data;
};

export type Level = 'toolkit' | 'mastery';

/** The learner's profile and the shared cache key for their toolkit on a topic. */
export async function learnerKey(userId: string, topicId: string, level: Level = 'toolkit') {
  const [p] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  const goals = (p?.goals as string[]) ?? [];
  if (!p?.persona || !p.industry || !goals.length || !p.dailyMinutes) throw new HttpError(409, 'Finish setting up your profile first.', 'profile_incomplete');
  let band: 'foundation' | 'core' | 'advanced' | 'mastery' = 'mastery';
  if (level === 'toolkit') {
    const [a] = await db.select().from(assessments)
      .where(and(eq(assessments.userId, userId), eq(assessments.topicId, topicId), eq(assessments.phase, 'baseline')));
    band = ratingBand(a?.score);
  }
  const key = { topicId, persona: p.persona, industry: p.industry, goal: goals[0], ratingBand: band } as const;
  const where = and(eq(cachedLessons.topicId, key.topicId), eq(cachedLessons.persona, key.persona), eq(cachedLessons.industry, key.industry),
    eq(cachedLessons.goal, key.goal), eq(cachedLessons.ratingBand, key.ratingBand));
  return { profile: p, goals, key, where };
}

/** Practice needs Foundations done: every tool and its question, the quiz, then the scenario. Enforced on the server. */
export async function requireFoundations(userId: string, topicId: string) {
  const t = await trackFor(userId, topicId);
  if (t.toolkit.done) return;
  throw new HttpError(409, !t.toolkit.toolsDone
    ? 'Practice opens after you finish Foundations. Go through each tool and its question first.'
    : !t.toolkit.quizDone ? 'Practice opens after you finish Foundations. Take the quiz first.'
    : 'Practice opens after you finish Foundations. Answer the scenario first.', 'foundations_first');
}

/** The learner's ready toolkit (level 1) for a topic, or null if it hasn't been built yet. */

export async function readyToolkit(userId: string, topicId: string) {
  const { where } = await learnerKey(userId, topicId, 'toolkit');
  const [l] = await db.select().from(cachedLessons).where(where);
  return l && checkBite(l.contentJson as Bite) === null ? l : null;
}

/** Where the learner is on a topic's 4-level track. */
export async function trackFor(userId: string, topicId: string) {
  const [tp] = await db.select().from(topicProgress).where(and(eq(topicProgress.userId, userId), eq(topicProgress.topicId, topicId)));
  const [r] = await db.select({ done: count(), avg: avg(practiceReps.score) }).from(practiceReps)
    .where(and(eq(practiceReps.userId, userId), eq(practiceReps.topicId, topicId), isNotNull(practiceReps.answeredAt)));
  // Foundations are progressive: every tool (each with its question), then the quiz, then the coached scenario.
  const toolsDone = !!tp?.cardsCompletedAt;
  const quizDone = !!tp?.quizCompletedAt;
  const scenarioDone = tp?.bestScenarioScore != null;
  const repsDone = Number(r?.done ?? 0);
  // Learners who started reps before the scenario became required keep their access.
  const toolkitDone = toolsDone && quizDone && (scenarioDone || repsDone > 0);
  const [rp] = await db.select({ n: count(), best: max(roleplaySessions.score) }).from(roleplaySessions)
    .where(and(eq(roleplaySessions.userId, userId), eq(roleplaySessions.topicId, topicId), eq(roleplaySessions.status, 'debriefed')));
  return {
    toolkit: { done: toolkitDone, toolsDone, quizDone, scenarioDone: scenarioDone || toolkitDone, quizCorrect: tp?.quizCorrect ?? 0, quizTotal: tp?.quizTotal ?? 5, bestScenario: tp?.bestScenarioScore ?? null },
    reps: { done: repsDone, goal: REPS_GOAL, avgScore: r?.avg == null ? null : Math.round(Number(r.avg)) },
    roleplay: {
      available: true, unlocked: toolkitDone && repsDone >= ROLEPLAY_AFTER_REPS, done: Number(rp?.n ?? 0), best: rp?.best ?? null,
      needsToolkit: !toolkitDone, needsReps: Math.max(0, ROLEPLAY_AFTER_REPS - repsDone),
    },
    mastery: {
      unlocked: toolkitDone && repsDone >= MASTERY_AFTER_REPS, done: !!tp?.masteryCompletedAt,
      needsToolkit: !toolkitDone, needsReps: Math.max(0, MASTERY_AFTER_REPS - repsDone),
    },
  };
}

/** Quick reference: the learner's tools on a topic (Foundations, plus Mastery when done), for the moment before a meeting. */
biteRoutes.get('/library/:topicId', async (req, res) => {
  const topicId = uuid(req.params.topicId, 'Topic');
  const userId = req.userId!;
  await requireTopicAccess(userId, topicId);
  const sets: { level: Level; framework: string; tools: Bite['tools'] }[] = [];
  for (const level of ['toolkit', 'mastery'] as const) {
    const { where } = await learnerKey(userId, topicId, level);
    const [l] = await db.select().from(cachedLessons).where(where);
    if (l && checkBite(l.contentJson as Bite) === null && (level === 'toolkit' || (await trackFor(userId, topicId)).mastery.unlocked)) {
      const b = l.contentJson as Bite;
      sets.push({ level, framework: b.framework, tools: b.tools });
    }
  }
  const [meta] = await db.select({ name: topics.name, category: categories.name }).from(topics)
    .innerJoin(categories, eq(categories.id, topics.categoryId)).where(eq(topics.id, topicId));
  res.json({ topic: { id: topicId, ...meta }, sets });
});

biteRoutes.get('/track/:topicId', async (req, res) => {
  const topicId = uuid(req.params.topicId, 'Topic');
  await requireTopicAccess(req.userId!, topicId);
  res.json(await trackFor(req.userId!, topicId));
});

/** Start a toolkit (level 1) or mastery toolkit (level 4): shared cached version, generated once in the background. */
biteRoutes.post('/', async (req, res) => {
  const topicId = uuid(req.body?.topicId, 'Topic');
  const level: Level = req.body?.level === 'mastery' ? 'mastery' : 'toolkit';
  const userId = req.userId!;
  await requireTopicAccess(userId, topicId);
  if (level === 'mastery') {
    const t = await trackFor(userId, topicId);
    if (!t.mastery.unlocked) {
      throw new HttpError(403, t.mastery.needsToolkit ? 'Finish the tools and the quiz first to unlock Mastery.'
        : `Complete ${t.mastery.needsReps} more practice rep${t.mastery.needsReps === 1 ? '' : 's'} to unlock Mastery.`, 'locked');
    }
  }
  const { where } = await learnerKey(userId, topicId, level);
  let [lesson] = await db.select().from(cachedLessons).where(where);
  const cached = readyLesson(lesson);
  if (!cached) {
    const r = await startToolkit(userId, topicId, level);
    [lesson] = await db.select().from(cachedLessons).where(where);
    if (!r.done || !readyLesson(lesson)) return void res.status(202).json({ status: 'generating' });
  }
  const [meta] = await db.select({ name: topics.name, category: categories.name }).from(topics)
    .innerJoin(categories, eq(categories.id, topics.categoryId)).where(eq(topics.id, topicId));
  res.json({ lessonId: lesson.id, level, topic: { id: topicId, ...meta }, bite: lesson.contentJson as Bite, cached });
});

const readyLesson = (l?: typeof cachedLessons.$inferSelect) => !!l && checkBite(l.contentJson as Bite) === null;

/**
 * Starts (or joins) building a learner's toolkit in the background and waits briefly.
 * Also used to get a toolkit ready ahead of time (after onboarding, or while a topic is being read).
 */
export async function startToolkit(userId: string, topicId: string, level: Level = 'toolkit') {
  const { profile: p, goals, key, where } = await learnerKey(userId, topicId, level);
  let [lesson] = await db.select().from(cachedLessons).where(where);
  if (readyLesson(lesson)) return { done: true as const, result: undefined };
  {
    const build = () => runJob(`bite:${JSON.stringify(key)}`, async () => {
      const [t] = await db.select({ name: topics.name, description: topics.description }).from(topics).where(eq(topics.id, topicId));
      const bookRows = await db.select({ title: books.title, author: books.author, kind: books.kind }).from(topicBooks)
        .innerJoin(books, eq(books.id, topicBooks.bookId)).where(eq(topicBooks.topicId, topicId)).orderBy(asc(topicBooks.sortOrder));
      const { bite, model } = await generateBite(userId, {
        topic: t.name, scope: t.description, books: bookRows,
        persona: PERSONAS.find((x) => x.value === key.persona)!.label, industry: key.industry, goals, minutes: p.dailyMinutes!, band: key.ratingBand,
      });
      await db.insert(cachedLessons).values({ ...key, contentJson: bite, model })
        .onConflictDoUpdate({ target: [cachedLessons.topicId, cachedLessons.persona, cachedLessons.industry, cachedLessons.goal, cachedLessons.ratingBand],
          set: { contentJson: bite, model, createdAt: new Date() } });
    }, () => checkLimit(userId, 'bite'));
    let r = await build();
    [lesson] = await db.select().from(cachedLessons).where(where);
    // A job that finished earlier but whose result no longer applies (e.g. the saved toolkit was
    // since removed or needs rebuilding): it has now been collected, so start a fresh one.
    if (r.done && !readyLesson(lesson)) r = await build();
    return r;
  }
}

/** Gets a toolkit ready in the background without waiting (errors are only logged). */
export function prewarmToolkit(userId: string, topicId: string) {
  startToolkit(userId, topicId).catch((e) => console.warn('[prewarm]', e instanceof Error ? e.message : e));
}

/** Self-rated confidence on a topic (1-10), before starting and later on, for a before/after view. Doesn't change the toolkit. */
biteRoutes.post('/confidence', async (req, res) => {
  const body = z.object({ topicId: z.string().uuid(), score: z.number().int().min(1).max(10), when: z.enum(['before', 'now']) }).parse(req.body);
  await requireTopicAccess(req.userId!, body.topicId);
  const phase = body.when === 'before' ? 'self_before' : 'self_now';
  await db.insert(assessments).values({ userId: req.userId!, topicId: body.topicId, score: body.score, phase })
    .onConflictDoUpdate({ target: [assessments.userId, assessments.topicId, assessments.phase], set: { score: body.score, updatedAt: new Date() } });
  res.json({ ok: true });
});

biteRoutes.post('/prewarm', async (req, res) => {
  const topicId = uuid(req.body?.topicId, 'Topic');
  await requireTopicAccess(req.userId!, topicId);
  prewarmToolkit(req.userId!, topicId);
  res.status(202).json({ status: 'started' });
});

async function lessonFor(userId: string, lessonId: string) {
  const [l] = await db.select().from(cachedLessons).where(eq(cachedLessons.id, uuid(lessonId)));
  if (!l) throw new HttpError(404, 'Bite not found');
  await requireTopicAccess(userId, l.topicId);
  return l;
}

/** Records progress through a toolkit (or mastery toolkit). */
biteRoutes.post('/:id/progress', async (req, res) => {
  const body = z.discriminatedUnion('stage', [
    z.object({ stage: z.literal('cards') }),
    // correct: right answers across the per-tool questions and the mixed quiz.
    z.object({ stage: z.literal('quiz'), correct: z.number().int().min(0).max(20) }),
  ]).parse(req.body);
  const l = await lessonFor(req.userId!, req.params.id);
  const mastery = l.ratingBand === 'mastery';
  const bite = l.contentJson as Bite;
  const total = bite.tools.length + bite.quiz.length;
  if (body.stage === 'quiz') {
    if (body.correct > total) throw new HttpError(400, `correct: at most ${total}`, 'invalid_input');
    if (!mastery) {
      const [tp] = await db.select({ cards: topicProgress.cardsCompletedAt }).from(topicProgress)
        .where(and(eq(topicProgress.userId, req.userId!), eq(topicProgress.topicId, l.topicId)));
      if (!tp?.cards) throw new HttpError(409, 'Go through each tool and its question before the quiz.', 'tools_first');
    }
  }
  if (body.stage === 'cards') {
    const col = mastery ? { masteryCompletedAt: new Date() } : { cardsCompletedAt: new Date() };
    await db.insert(topicProgress).values({ userId: req.userId!, topicId: l.topicId, ...col })
      .onConflictDoUpdate({ target: [topicProgress.userId, topicProgress.topicId],
        set: mastery ? { masteryCompletedAt: sql`coalesce(${topicProgress.masteryCompletedAt}, now())` }
          : { cardsCompletedAt: sql`coalesce(${topicProgress.cardsCompletedAt}, now())` } });
  } else if (!mastery) {
    await db.insert(topicProgress).values({ userId: req.userId!, topicId: l.topicId, quizCorrect: body.correct, quizTotal: total, quizCompletedAt: new Date() })
      .onConflictDoUpdate({ target: [topicProgress.userId, topicProgress.topicId], set: {
        quizCorrect: sql`greatest(${topicProgress.quizCorrect}, ${body.correct})`, quizTotal: total,
        quizCompletedAt: sql`coalesce(${topicProgress.quizCompletedAt}, now())`,
      } });
  }
  // Every question (each tool's check and the mixed quiz) joins spaced review.
  if (body.stage === 'quiz') await seedReview(req.userId!, l.topicId, l.id, [...bite.tools.map((t) => t.check), ...bite.quiz].filter(Boolean));
  await recordActivity(req.userId!, body.stage === 'cards' ? 'tools' : 'quiz', {
    topicId: l.topicId, score: body.stage === 'quiz' ? Math.round((body.correct / total) * 100) : null, xp: body.stage === 'cards' ? 20 : 10 + body.correct * 2,
  });
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

export const responseInput = z.object({ response: z.string().trim().min(20, 'Write at least a couple of sentences').max(1500, 'Keep it under 1,500 characters') });

/** Grades a written scenario answer with AI. */
biteRoutes.post('/:id/scenario', async (req, res) => {
  const { response } = responseInput.parse(req.body);
  const userId = req.userId!;
  const l = await lessonFor(userId, req.params.id);
  if (l.ratingBand !== 'mastery') {
    // Progressive: the scenario unlocks after the tools and the quiz.
    const [tp] = await db.select({ quiz: topicProgress.quizCompletedAt }).from(topicProgress)
      .where(and(eq(topicProgress.userId, userId), eq(topicProgress.topicId, l.topicId)));
    if (!tp?.quiz) throw new HttpError(409, 'The scenario opens after you finish the tools and the quiz.', 'quiz_first');
  }
  await checkLimit(userId, 'grade');
  const bite = l.contentJson as Bite;
  const grade = await gradeScenario(userId, { framework: bite.framework, tools: bite.tools.map((t) => ({ name: t.name, idea: t.idea })), scenario: bite.scenario, response });
  const names = new Set(bite.tools.map((t) => t.name));
  grade.toolsUsed = grade.toolsUsed.filter((n) => names.has(n)); // only tools that exist in this bite
  await db.insert(scenarios).values({ userId, topicId: l.topicId, lessonId: l.id, responseText: response, score: grade.score, feedbackJson: grade });
  await db.insert(topicProgress).values({ userId, topicId: l.topicId, bestScenarioScore: grade.score })
    .onConflictDoUpdate({ target: [topicProgress.userId, topicProgress.topicId],
      set: { bestScenarioScore: sql`greatest(coalesce(${topicProgress.bestScenarioScore}, 0), ${grade.score})` } });
  await recordActivity(userId, 'scenario', { topicId: l.topicId, score: grade.score, xp: 20 });
  res.json(grade);
});
