import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { activityEvents, categories, practiceReps, reviewItems, topicProgress, topics } from '../db/schema.js';
import { requireAuth } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';
import { addDays, currentStreak, localDay, progressOf, recordActivity, timezoneOf } from '../lib/activity.js';
import { uuid } from './bites.js';

/** Daily return: a 5-minute review (spaced quiz questions + one practice rep), streaks and a weekly summary. */
export const dailyRoutes = Router();
dailyRoutes.use(requireAuth);

export const INTERVALS = [1, 3, 7, 21];
export const REVIEWS_PER_DAY = 4;
export const nextInterval = (current: number, correct: boolean) =>
  !correct ? 1 : INTERVALS.find((d) => d > current) ?? INTERVALS[INTERVALS.length - 1];

type Question = { q: string; options: string[]; answer: number; why: string; topic?: string };

/** Adds a toolkit's quiz questions to the learner's spaced review (once each), first due tomorrow. */
export async function seedReview(userId: string, topicId: string, lessonId: string, quiz: Question[]) {
  if (!quiz.length) return;
  await db.insert(reviewItems).values(quiz.map((q, i) => ({
    userId, topicId, questionJson: q, sourceKey: `${lessonId}:${i}`, intervalDays: 1, dueAt: sql`now() + interval '1 day'` as unknown as Date,
  }))).onConflictDoNothing();
}

async function streakView(userId: string) {
  const today = localDay(await timezoneOf(userId));
  const p = await progressOf(userId);
  const s = { streak: p.streak, lastActiveDate: p.lastActiveDate, freezes: p.freezes };
  return { streak: currentStreak(s, today), freezes: p.freezes, activeToday: p.lastActiveDate === today, xp: p.xp, today };
}

/** Today's 5-minute session. */
dailyRoutes.get('/', async (req, res) => {
  const userId = req.userId!;
  const st = await streakView(userId);
  const dueRows = await db.select({ r: reviewItems, topic: topics.name, category: categories.name }).from(reviewItems)
    .innerJoin(topics, eq(topics.id, reviewItems.topicId)).innerJoin(categories, eq(categories.id, topics.categoryId))
    .where(and(eq(reviewItems.userId, userId), lte(reviewItems.dueAt, new Date()))).orderBy(asc(reviewItems.dueAt)).limit(REVIEWS_PER_DAY);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(reviewItems)
    .where(and(eq(reviewItems.userId, userId), lte(reviewItems.dueAt, new Date())));
  const [{ upcoming }] = await db.select({ upcoming: sql<number>`count(*)::int` }).from(reviewItems).where(eq(reviewItems.userId, userId));
  // One practice rep on the topic the learner worked on most recently (where practice is open).
  const [recent] = await db.select({ id: topics.id, name: topics.name, category: categories.name }).from(topicProgress)
    .innerJoin(topics, eq(topics.id, topicProgress.topicId)).innerJoin(categories, eq(categories.id, topics.categoryId))
    .where(and(eq(topicProgress.userId, userId), isNotNull(topicProgress.quizCompletedAt), isNotNull(topicProgress.cardsCompletedAt)))
    .orderBy(desc(topicProgress.quizCompletedAt)).limit(1);
  const done = await db.select({ kind: activityEvents.kind }).from(activityEvents)
    .where(and(eq(activityEvents.userId, userId), eq(activityEvents.localDay, st.today)));
  res.json({
    ...st,
    dailyDone: done.some((d) => d.kind === 'daily'),
    reviews: dueRows.map(({ r, topic, category }) => {
      const q = r.questionJson as Question;
      return { id: r.id, topicId: r.topicId, topic, category, q: q.q, options: q.options, answer: q.answer, why: q.why, intervalDays: r.intervalDays };
    }),
    dueTotal: total, reviewItems: upcoming,
    rep: recent ? { topicId: recent.id, topic: recent.name, category: recent.category } : null,
  });
});

/** Answers one review question: correct moves it up the 1 → 3 → 7 → 21 day ladder, wrong resets it to 1. */
dailyRoutes.post('/review/:id', async (req, res) => {
  const { correct } = z.object({ correct: z.boolean() }).parse(req.body);
  const userId = req.userId!;
  const [r] = await db.select().from(reviewItems).where(and(eq(reviewItems.id, uuid(req.params.id, 'Review')), eq(reviewItems.userId, userId)));
  if (!r) throw new HttpError(404, 'Review not found');
  const interval = nextInterval(r.intervalDays, correct);
  await db.update(reviewItems).set({
    intervalDays: interval, lastResult: correct, lastReviewedAt: new Date(), dueAt: sql`now() + make_interval(days => ${interval})` as unknown as Date,
  }).where(eq(reviewItems.id, r.id));
  await recordActivity(userId, 'review', { topicId: r.topicId, score: correct ? 100 : 0, xp: correct ? 5 : 2 });
  res.json({ intervalDays: interval, ...(await streakView(userId)) });
});

/** Marks today's 5 minutes as done (once per local day). */
dailyRoutes.post('/complete', async (req, res) => {
  const userId = req.userId!;
  const st = await streakView(userId);
  const [already] = await db.select({ id: activityEvents.id }).from(activityEvents)
    .where(and(eq(activityEvents.userId, userId), eq(activityEvents.localDay, st.today), eq(activityEvents.kind, 'daily'))).limit(1);
  const r = already ? null : await recordActivity(userId, 'daily', { xp: 20 });
  res.json({ ...(await streakView(userId)), usedFreeze: !!r?.usedFreeze, earnedFreeze: !!r?.earnedFreeze });
});

const KIND_LABEL: Record<string, string> = { tools: 'Toolkits', quiz: 'Quizzes', scenario: 'Scenarios', rep: 'Practice reps', roleplay: 'Role-plays', review: 'Reviews', situation: 'Real situations', daily: 'Daily sessions', win: 'Real-world wins', cpd: 'CPD modules completed' };

/** The last 7 local days: activity, scores and a focus for next week. */
dailyRoutes.get('/week', async (req, res) => {
  const userId = req.userId!;
  const st = await streakView(userId);
  const from = addDays(st.today, -6);
  const rows = await db.select({ kind: activityEvents.kind, topicId: activityEvents.topicId, score: activityEvents.score, day: activityEvents.localDay })
    .from(activityEvents).where(and(eq(activityEvents.userId, userId), gte(activityEvents.localDay, from), lte(activityEvents.localDay, st.today)));
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(from, i);
    return { day, weekday: new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }), active: rows.some((r) => r.day === day) };
  });
  const counts = Object.fromEntries(Object.keys(KIND_LABEL).map((k) => [k, rows.filter((r) => r.kind === k).length]));
  const avgOf = (kind: string) => {
    const s = rows.filter((r) => r.kind === kind && r.score != null).map((r) => r.score!);
    return s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : null;
  };
  const reviews = rows.filter((r) => r.kind === 'review');
  const topicIds = [...new Set(rows.map((r) => r.topicId).filter(Boolean))] as string[];
  const touched = topicIds.length ? await db.select({ id: topics.id, name: topics.name, category: categories.name }).from(topics)
    .innerJoin(categories, eq(categories.id, topics.categoryId)).where(inArray(topics.id, topicIds)) : [];
  // Weakest area this week: lowest average practice score by topic.
  const scored = touched.map((t) => {
    const s = rows.filter((r) => r.topicId === t.id && r.score != null && (r.kind === 'rep' || r.kind === 'roleplay' || r.kind === 'scenario')).map((r) => r.score!);
    return { ...t, avg: s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : null, n: s.length };
  });
  const weakest = scored.filter((t) => t.avg != null).sort((a, b) => a.avg! - b.avg!)[0];
  const daysActive = days.filter((d) => d.active).length;
  const reviewAccuracy = reviews.length ? Math.round((reviews.filter((r) => r.score === 100).length / reviews.length) * 100) : null;
  const [{ repsAll }] = await db.select({ repsAll: sql<number>`count(*)::int` }).from(practiceReps)
    .where(and(eq(practiceReps.userId, userId), isNotNull(practiceReps.answeredAt)));
  const focus = daysActive === 0 ? 'Start small: one 5-minute daily session tomorrow restarts your streak.'
    : daysActive < 4 ? `You were active ${daysActive} day${daysActive === 1 ? '' : 's'}. Aim for 5 days next week with the 5-minute daily session.`
    : reviewAccuracy != null && reviewAccuracy < 60 ? 'Your review answers slipped. Revisit the tools of the topics you got wrong before new practice.'
    : weakest && weakest.avg! < 70 ? `Your lowest scores were in ${weakest.name}. Do 3 more reps there, then try a role-play.`
    : counts.roleplay === 0 && repsAll >= 3 ? 'You are ready for a real conversation: try a role-play on a topic you have practised.'
    : 'Strong week. Try a Tough role-play or open Mastery on your best topic.';
  res.json({
    from, to: st.today, streak: st.streak, freezes: st.freezes, daysActive, days,
    counts: Object.entries(counts).filter(([, n]) => n > 0).map(([kind, n]) => ({ kind, label: KIND_LABEL[kind], n })),
    wins: rows.filter((r) => r.kind === 'win').length, total: rows.length, avgRep: avgOf('rep'), avgRoleplay: avgOf('roleplay'), reviewAccuracy, reviewsDone: reviews.length,
    topics: scored.map(({ id, name, category, avg }) => ({ id, name, category, avg })), focus,
  });
});
