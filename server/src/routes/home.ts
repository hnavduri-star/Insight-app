import { Router } from 'express';
import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { activityEvents, books, categories, profiles, topicBooks, topicProgress, topics, userProgress } from '../db/schema.js';
import { levelFor } from './progress.js';
import { requireAuth } from '../lib/auth.js';
import { accessFor } from '../lib/access.js';
import { trackFor } from './bites.js';

/** Home: the one next step, Editor's picks and Lessons from fiction. */
export const homeRoutes = Router();
homeRoutes.use(requireAuth);

/** A flagship topic for each goal, used to suggest a first topic. */
export const GOAL_TOPICS: Record<string, string[]> = {
  'Perform better in my role': ['Prioritization', 'Structured Problem Solving'],
  'Get promoted': ['Executive Presence', 'Managing Up'],
  'Change jobs or careers': ['Job Search and Interviewing', 'Career Strategy'],
  'Lead and develop my team': ['Giving Feedback', 'Delegation'],
  'Communicate and influence with impact': ['Influencing Without Authority', 'Delivering with Impact'],
  'Grow my business': ['Negotiation Fundamentals', 'Business Strategy'],
  'Manage stress and balance': ['Stress Management', 'Prioritization'],
  'Grow personally': ['High-Stakes Conversations', 'Self-Awareness'],
};

type TopicRow = { id: string; name: string; category: string };
const topicMeta = async (ids: string[]): Promise<TopicRow[]> => ids.length ? db.select({ id: topics.id, name: topics.name, category: categories.name })
  .from(topics).innerJoin(categories, eq(categories.id, topics.categoryId)).where(inArray(topics.id, ids)) : [];

/** The topic to suggest first: the free topic, else the flagship topic for the learner's main goal. */
export async function suggestedTopic(userId: string): Promise<TopicRow | null> {
  const access = await accessFor(userId);
  if (!access.allAccess && access.freeTopicId) return (await topicMeta([access.freeTopicId]))[0] ?? null;
  const [p] = await db.select({ goals: profiles.goals }).from(profiles).where(eq(profiles.userId, userId));
  const names = GOAL_TOPICS[((p?.goals as string[]) ?? [])[0]] ?? ['Executive Presence'];
  const rows = await db.select({ id: topics.id, name: topics.name, category: categories.name }).from(topics)
    .innerJoin(categories, eq(categories.id, topics.categoryId)).where(inArray(topics.name, names));
  return names.map((n) => rows.find((r) => r.name === n)).find(Boolean) ?? null;
}

/** The single best next step on a topic, as a label and a path. */
export function stepFor(t: Awaited<ReturnType<typeof trackFor>>, id: string) {
  if (!t.toolkit.toolsDone) return { label: 'Continue your toolkit', sub: 'Tools, case studies and what to say', minutes: 10, path: `/bite/${id}` };
  if (!t.toolkit.quizDone) return { label: 'Take the quiz', sub: '5 questions to finish Foundations', minutes: 3, path: `/bite/${id}?start=quiz` };
  if (t.reps.done < 3) return { label: `Practise · rep ${t.reps.done + 1}`, sub: 'A short coached drill', minutes: 2, path: `/practice/${id}` };
  if (t.roleplay.unlocked && t.roleplay.done === 0) return { label: 'Try a real conversation', sub: 'Role-play, then a debrief', minutes: 5, path: `/roleplay/${id}` };
  if (t.mastery.unlocked && !t.mastery.done && t.reps.done >= t.reps.goal) return { label: 'Open Mastery', sub: 'Advanced tools and edge cases', minutes: 10, path: `/bite/${id}?level=mastery` };
  if (t.reps.done < t.reps.goal) return { label: `Practise · rep ${t.reps.done + 1}`, sub: `${t.reps.done}/${t.reps.goal} reps done`, minutes: 2, path: `/practice/${id}` };
  return { label: 'Another real conversation', sub: 'Try a harder character or difficulty', minutes: 5, path: `/roleplay/${id}` };
}

homeRoutes.get('/', async (req, res) => {
  const userId = req.userId!;
  const access = await accessFor(userId);
  // The topic the learner touched most recently.
  const [last] = await db.select({ topicId: activityEvents.topicId }).from(activityEvents)
    .where(and(eq(activityEvents.userId, userId), isNotNull(activityEvents.topicId))).orderBy(desc(activityEvents.createdAt)).limit(1);
  const [started] = last?.topicId ? [] : await db.select({ topicId: topicProgress.topicId }).from(topicProgress).where(eq(topicProgress.userId, userId)).limit(1);
  const currentId = last?.topicId ?? started?.topicId ?? null;
  let next = null;
  if (currentId && (access.allAccess || access.topicIds.has(currentId))) {
    const [meta] = await topicMeta([currentId]);
    if (meta) next = { topic: meta, ...stepFor(await trackFor(userId, currentId), currentId), started: true };
  }
  if (!next) {
    const s = await suggestedTopic(userId);
    if (s) next = { topic: s, label: `Start ${s.name}`, sub: 'Your first toolkit: practical tools from the best books', minutes: 10, path: `/bite/${s.id}`, started: false };
  }
  const unlocked = (id: string) => access.allAccess || access.topicIds.has(id);
  const picks = await db.select({ id: topics.id, name: topics.name, description: topics.description, category: categories.name }).from(topics)
    .innerJoin(categories, eq(categories.id, topics.categoryId)).where(eq(topics.featured, true)).orderBy(asc(categories.sortOrder), asc(topics.sortOrder));
  const fiction = await db.selectDistinctOn([topics.id], { id: topics.id, name: topics.name, category: categories.name, book: books.title, author: books.author })
    .from(topics).innerJoin(categories, eq(categories.id, topics.categoryId)).innerJoin(topicBooks, eq(topicBooks.topicId, topics.id))
    .innerJoin(books, eq(books.id, topicBooks.bookId)).where(eq(books.kind, 'fiction')).orderBy(topics.id, asc(topicBooks.sortOrder));
  const [up] = await db.select({ xp: userProgress.xp }).from(userProgress).where(eq(userProgress.userId, userId));
  res.json({
    level: levelFor(up?.xp ?? 0),
    next,
    picks: picks.map((p) => ({ ...p, unlocked: unlocked(p.id) })),
    fiction: fiction.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 12).map((f) => ({ ...f, unlocked: unlocked(f.id) })),
  });
});

