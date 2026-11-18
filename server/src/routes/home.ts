import { Router } from 'express';
import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { activityEvents, books, cachedLessons, categories, checkins, profiles, toolProgress, topicBooks, topicProgress, topics, userProgress } from '../db/schema.js';
import { currentStreak, daysBetween, localDay, timezoneOf } from '../lib/activity.js';
import { COACHES } from '../../../shared/options.js';
import { levelFor } from './progress.js';
import { shouldAskFeedback } from './admin.js';
import { leagueFor } from './friends.js';
import { latestPicks } from './finder.js';
import { coachingSummaryFor } from './coaching.js';
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

/**
 * The topic to suggest first, only when the learner chose it: their free topic, or the top pick from their
 * "Find my skills" answers. Otherwise none: Home asks them to choose a topic or answer the questions.
 */
export async function suggestedTopic(userId: string): Promise<TopicRow | null> {
  const access = await accessFor(userId);
  if (!access.allAccess && access.freeTopicId) return (await topicMeta([access.freeTopicId]))[0] ?? null;
  // Their "Find my skills" result comes first.
  const found = await latestPicks(userId);
  const first = found?.topics.find((t) => access.allAccess || access.topicIds.has(t.id!));
  return first ? { id: first.id!, name: first.name, category: first.category! } : null;
}

/** Topics the learner has started, most recently active first, each with its next step. */
async function myTopics(userId: string) {
  const r = await db.execute<{ topic_id: string }>(sql`
    select topic_id from (
      select topic_id, max(created_at) as at from activity_events where user_id = ${userId} and topic_id is not null group by topic_id
      union all select topic_id, coalesce(cards_completed_at, quiz_completed_at, '2000-01-01') from topic_progress where user_id = ${userId}
      union all select l.topic_id, max(tp.updated_at) from tool_progress tp join cached_lessons l on l.id = tp.lesson_id where tp.user_id = ${userId} group by l.topic_id
    ) x group by topic_id order by max(at) desc limit 12`);
  const ids = r.rows.map((x) => x.topic_id);
  const meta = await topicMeta(ids);
  return Promise.all(ids.map((id) => meta.find((m) => m.id === id)).filter(Boolean).map(async (m) => {
    const t = await trackFor(userId, m!.id);
    const step = stepFor(t, m!.id);
    return { ...m!, label: step.label, path: step.path, done: t.toolkit.done };
  }));
}

/** The single best next step on a topic, as a label and a path. */
export function stepFor(t: Awaited<ReturnType<typeof trackFor>>, id: string) {
  if (!t.toolkit.toolsDone) return { label: 'Continue your toolkit', sub: 'Tools, case studies and what to say', minutes: 10, path: `/bite/${id}` };
  if (!t.toolkit.quizDone) return { label: 'Take the quiz', sub: '3 mixed questions, then the scenario', minutes: 2, path: `/bite/${id}?start=quiz` };
  if (!t.toolkit.scenarioDone) return { label: 'Answer the scenario', sub: 'The last step of Foundations', minutes: 3, path: `/bite/${id}?start=scenario` };
  if (t.reps.done < 3) return { label: `Practise · rep ${t.reps.done + 1}`, sub: 'A short coached drill', minutes: 2, path: `/practice/${id}` };
  if (t.roleplay.unlocked && t.roleplay.done === 0) return { label: 'Try a real conversation', sub: 'Role-play, then a debrief', minutes: 5, path: `/roleplay/${id}` };
  if (t.mastery.unlocked && !t.mastery.done && t.reps.done >= t.reps.goal) return { label: 'Open Mastery', sub: 'Advanced tools and edge cases', minutes: 10, path: `/bite/${id}?level=mastery` };
  if (t.reps.done < t.reps.goal) return { label: `Practise · rep ${t.reps.done + 1}`, sub: `${t.reps.done}/${t.reps.goal} reps done`, minutes: 2, path: `/practice/${id}` };
  return { label: 'Another real conversation', sub: 'Try a harder character or difficulty', minutes: 5, path: `/roleplay/${id}` };
}

type Next = { topic: { id: string; name: string; category: string }; label: string; started: boolean } | null;
type CoachMessage = { kind: 'checkin' | 'start' | 'welcome' | 'comeback' | 'progress' | 'streak' | 'commitment' | 'nudge'; text: string; checkin?: { id: string } };

/**
 * What the coach says on Home: one short, encouraging line about the learner's journey,
 * chosen from where they are (a real-world check-in, coming back, mid-topic, a streak, a commitment).
 */
export async function coachMessage(userId: string, next: Next, coaching: Awaited<ReturnType<typeof coachingSummaryFor>>): Promise<CoachMessage> {
  const [p] = await db.select({ name: sql<string>`(select name from users where id = ${userId})`, coach: profiles.coach }).from(profiles).where(eq(profiles.userId, userId));
  const first = (p?.name ?? '').split(/\s+/)[0] || 'there';
  const coachName = COACHES.find((c) => c.value === p?.coach)?.name ?? 'your coach';
  const [due] = await db.select().from(checkins).where(and(eq(checkins.userId, userId), sql`${checkins.answeredAt} is null`, sql`${checkins.dueAt} <= now()`)).orderBy(asc(checkins.dueAt)).limit(1);
  if (due) {
    const q = due.kind === 'situation' ? `Did “${due.title}” happen? How did it go?` : due.withName ? `Did you have the real conversation with ${due.withName}? How did it go?` : `Did you get to use what you practised in “${due.title}”?`;
    return { kind: 'checkin', text: q, checkin: { id: due.id } };
  }
  const today = localDay(await timezoneOf(userId));
  const [up] = await db.select().from(userProgress).where(eq(userProgress.userId, userId));
  // Nothing chosen yet: the learner decides. Pick a topic, or answer a few questions to find one.
  if (!next) return { kind: 'start', text: up?.lastActiveDate ? `${first}, what would you like to learn next?` : `Welcome, ${first}. I'm ${coachName}. How would you like to start?` };
  if (!up?.lastActiveDate) return { kind: 'welcome', text: `Welcome, ${first}. Your answers point to ${next.topic.name}. Start there, or choose any topic you like.` };
  const gap = daysBetween(up.lastActiveDate, today);
  if (gap >= 3) return { kind: 'comeback', text: `Good to see you again, ${first}. Let's pick up gently: one tool today is plenty.` };
  if (coaching.openCommitments.length && gap >= 1) return { kind: 'commitment', text: `You committed to: ${coaching.openCommitments[0].action}. How's it going?` };
  const streak = currentStreak({ streak: up.streak, lastActiveDate: up.lastActiveDate, freezes: up.freezes }, today);
  if (next?.started) {
    const [d] = await db.select({ n: sql<number>`count(*)::int` }).from(toolProgress).innerJoin(cachedLessons, eq(cachedLessons.id, toolProgress.lessonId))
      .where(and(eq(toolProgress.userId, userId), eq(cachedLessons.topicId, next.topic.id), isNotNull(toolProgress.completedAt)));
    const n = d?.n ?? 0;
    if (n > 0 && /tool|toolkit/i.test(next.label)) return { kind: 'progress', text: `You're ${n} tool${n === 1 ? '' : 's'} into ${next.topic.name}. Let's keep the momentum.` };
  }
  if (streak >= 3) return { kind: 'streak', text: `${streak} days in a row, ${first}. That's a habit forming.` };
  if (next?.started) {
    // Encourage, don't repeat the button.
    const l = next.label.toLowerCase();
    const text = l.includes('quiz') ? `You've learned the tools, ${first}. Let's see what's stuck.`
      : l.includes('scenario') ? `One scenario left and ${next.topic.name} Foundations is yours.`
      : l.includes('rep') ? 'Every rep makes the real conversation easier. Ready for the next one?'
      : l.includes('conversation') ? `You're ready to try ${next.topic.name} in a real conversation.`
      : l.includes('mastery') ? `You've earned Mastery in ${next.topic.name}. This is where it gets interesting.`
      : `Small steps, ${first}. Each one compounds.`;
    return { kind: 'progress', text };
  }
  return { kind: 'nudge', text: `${first}, what would make today a step forward?` };
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
  const coaching = await coachingSummaryFor(userId);
  res.json({
    level: levelFor(up?.xp ?? 0),
    askFeedback: await shouldAskFeedback(userId),
    coaching,
    coach: await coachMessage(userId, next, coaching),
    streak: await streakFor(userId),
    finder: await latestPicks(userId).then((r) => (r ? { at: r.createdAt, topics: r.topics } : null)),
    league: await leagueFor(userId).then((l) => {
      const me = l.league.find((r) => r.me)!;
      // The person just ahead (to chase), if any.
      const above = l.league.filter((r) => !r.me && r.weekMinutes > me.weekMinutes).sort((x, y) => x.weekMinutes - y.weekMinutes)[0];
      return { friends: l.friends, size: l.league.length, daysLeft: l.daysLeft, top: l.league.slice(0, 3), me,
        ahead: above ? { firstName: above.firstName, gap: above.weekMinutes - me.weekMinutes } : null };
    }),
    reviewsDue: await db.execute<{ n: number }>(sql`select count(*)::int as n from review_items where user_id = ${userId} and due_at <= now()`).then((r) => r.rows[0]?.n ?? 0),
    next,
    myTopics: await myTopics(userId),
    picks: picks.map((p) => ({ ...p, unlocked: unlocked(p.id) })),
    fiction: fiction.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 12).map((f) => ({ ...f, unlocked: unlocked(f.id) })),
  });
});


async function streakFor(userId: string) {
  const today = localDay(await timezoneOf(userId));
  const [up] = await db.select().from(userProgress).where(eq(userProgress.userId, userId));
  return up ? currentStreak({ streak: up.streak, lastActiveDate: up.lastActiveDate, freezes: up.freezes }, today) : 0;
}
