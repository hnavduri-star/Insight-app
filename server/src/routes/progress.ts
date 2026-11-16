import { Router } from 'express';
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  activityEvents, assessments, categories, checkins, friendships, practiceReps, reviewItems, roleplaySessions, situations, topicProgress, topics, userProgress,
} from '../db/schema.js';
import { requireAuth } from '../lib/auth.js';
import { daysBetween } from '../lib/activity.js';

/** Progress on real skills: level, skill chart, confidence before/after, badges. */
export const progressRoutes = Router();
progressRoutes.use(requireAuth);

export const LEVELS = [
  { min: 0, name: 'Explorer' }, { min: 200, name: 'Learner' }, { min: 600, name: 'Practitioner' },
  { min: 1500, name: 'Advanced' }, { min: 3500, name: 'Expert' }, { min: 7000, name: 'Master' },
];
export function levelFor(xp: number) {
  const i = LEVELS.reduce((acc, l, k) => (xp >= l.min ? k : acc), 0);
  const next = LEVELS[i + 1];
  return { n: i + 1, name: LEVELS[i].name, xp, floor: LEVELS[i].min, next: next ? { name: next.name, at: next.min } : null };
}

/** Longest run of consecutive active local days. */
export function longestRun(days: string[]) {
  const sorted = [...new Set(days)].sort();
  let best = 0, run = 0;
  sorted.forEach((d, i) => { run = i && daysBetween(sorted[i - 1], d) === 1 ? run + 1 : 1; best = Math.max(best, run); });
  return best;
}

type Rubric = { clarity: number; empathy: number; structure: number; tools: number };
const avgRubric = (rs: Rubric[]): Rubric | null => !rs.length ? null : {
  clarity: Math.round(rs.reduce((a, r) => a + r.clarity, 0) / rs.length), empathy: Math.round(rs.reduce((a, r) => a + r.empathy, 0) / rs.length),
  structure: Math.round(rs.reduce((a, r) => a + r.structure, 0) / rs.length), tools: Math.round(rs.reduce((a, r) => a + r.tools, 0) / rs.length),
};

export async function progressFor(userId: string) {
  await db.insert(userProgress).values({ userId }).onConflictDoNothing();
  const [up] = await db.select().from(userProgress).where(eq(userProgress.userId, userId));
  const tps = await db.select({ tp: topicProgress, name: topics.name, category: categories.name }).from(topicProgress)
    .innerJoin(topics, eq(topics.id, topicProgress.topicId)).innerJoin(categories, eq(categories.id, topics.categoryId)).where(eq(topicProgress.userId, userId));
  const reps = await db.select({ topicId: practiceReps.topicId, n: sql<number>`count(*)::int` }).from(practiceReps)
    .where(and(eq(practiceReps.userId, userId), isNotNull(practiceReps.answeredAt))).groupBy(practiceReps.topicId);
  const rps = await db.select().from(roleplaySessions).where(and(eq(roleplaySessions.userId, userId), eq(roleplaySessions.status, 'debriefed')))
    .orderBy(asc(roleplaySessions.endedAt));
  const conf = await db.select().from(assessments).where(and(eq(assessments.userId, userId), sql`${assessments.phase} in ('self_before','self_now')`));
  const wins = await db.select({ n: sql<number>`count(*)::int` }).from(checkins).where(and(eq(checkins.userId, userId), sql`${checkins.outcome} in ('well','mixed')`));
  const [{ sits }] = await db.select({ sits: sql<number>`count(*)::int` }).from(situations).where(eq(situations.userId, userId));
  const [{ r21 }] = await db.select({ r21: sql<number>`count(*)::int` }).from(reviewItems).where(and(eq(reviewItems.userId, userId), sql`${reviewItems.intervalDays} >= 21`));
  const [{ friendCount }] = await db.select({ friendCount: sql<number>`count(*)::int` }).from(friendships).where(eq(friendships.userId, userId));
  const days = (await db.selectDistinct({ d: activityEvents.localDay }).from(activityEvents).where(eq(activityEvents.userId, userId))).map((r) => r.d);

  const repsBy = new Map(reps.map((r) => [r.topicId, r.n]));
  const rpBy = (id: string) => rps.filter((r) => r.topicId === id);
  const topicLevels = tps.map(({ tp, name, category }) => {
    const n = repsBy.get(tp.topicId) ?? 0;
    const bestRp = Math.max(0, ...rpBy(tp.topicId).map((r) => r.score ?? 0));
    const level = tp.masteryCompletedAt ? 'Expert' : bestRp >= 70 ? 'Advanced' : n >= 10 ? 'Practitioner' : tp.cardsCompletedAt && tp.quizCompletedAt ? 'Foundations' : 'Started';
    const before = conf.find((c) => c.topicId === tp.topicId && c.phase === 'self_before')?.score ?? null;
    const now = conf.find((c) => c.topicId === tp.topicId && c.phase === 'self_now')?.score ?? null;
    return { id: tp.topicId, name, category, level, step: ['Started', 'Foundations', 'Practitioner', 'Advanced', 'Expert'].indexOf(level), reps: n, bestRoleplay: rps.length ? bestRp || null : null, confidence: { before, now } };
  }).sort((a, b) => b.step - a.step || a.name.localeCompare(b.name));

  const rubrics = rps.map((r) => r.rubricScoresJson as Rubric | null).filter(Boolean) as Rubric[];
  const skills = {
    sessions: rubrics.length,
    current: avgRubric(rubrics.slice(-3)),
    first: rubrics.length >= 4 ? avgRubric(rubrics.slice(0, 3)) : null,
    history: rps.filter((r) => r.rubricScoresJson).map((r) => ({ at: r.endedAt, score: r.score, ...(r.rubricScoresJson as Rubric) })).slice(-12),
  };

  const foundations = tps.filter(({ tp }) => tp.cardsCompletedAt && tp.quizCompletedAt).length;
  const totalReps = reps.reduce((a, r) => a + r.n, 0);
  const winCount = wins[0]?.n ?? 0;
  const run = longestRun(days);
  const B = (key: string, name: string, emoji: string, description: string, earned: boolean) => ({ key, name, emoji, description, earned });
  const badges = [
    B('first_toolkit', 'First toolkit', '🧰', 'Finish the tools and quiz on a topic', foundations >= 1),
    B('perfect_quiz', 'Perfect quiz', '🎯', 'Get 5 out of 5 on a quiz', tps.some(({ tp }) => tp.quizCorrect >= 5)),
    B('ten_reps', '10 reps', '💪', 'Complete 10 practice reps', totalReps >= 10),
    B('first_roleplay', 'First conversation', '🗣️', 'Finish your first role-play', rps.length >= 1),
    B('with_your_people', 'Real people', '🤝', 'Role-play with one of your own people', rps.some((r) => r.personId)),
    B('tough', 'Tough room', '🔥', 'Finish a Tough role-play', rps.some((r) => r.difficulty === 'tough')),
    B('roleplay_80', 'Strong conversation', '⭐', 'Score 80+ in a role-play', rps.some((r) => (r.score ?? 0) >= 80)),
    B('first_win', 'First real-world win', '🏆', 'Use a tool at work and log it', winCount >= 1),
    B('five_wins', 'Used it 5 times', '🚀', 'Log 5 real-world wins', winCount >= 5),
    B('situation', 'Prepared', '⚡', 'Prepare for a real situation', sits >= 1),
    B('streak_7', '7-day streak', '📅', 'Learn 7 days in a row', run >= 7),
    B('streak_30', '30-day streak', '🌟', 'Learn 30 days in a row', run >= 30),
    B('review_21', 'It stuck', '🧠', 'Keep a review question for 21 days', r21 >= 1),
    B('polymath', 'Polymath', '📚', 'Finish Foundations on 3 topics', foundations >= 3),
    B('mastery', 'Mastery', '🎓', 'Complete Mastery on a topic', tps.some(({ tp }) => tp.masteryCompletedAt)),
    B('friends', 'Better together', '👋', 'Add a friend to your weekly league', friendCount >= 1),
  ];
  return { level: levelFor(up.xp), streak: up.streak, longestStreak: run, wins: winCount, topics: topicLevels, skills, badges };
}

progressRoutes.get('/', async (req, res) => { res.json(await progressFor(req.userId!)); });
