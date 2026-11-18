import { Router } from 'express';
import { z } from 'zod';
import { asc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { categories, topics, books, topicBooks } from '../db/schema.js';
import { requireAuth } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';
import { accessFor } from '../lib/access.js';
import { profiles } from '../db/schema.js';
import { GOAL_TOPICS, myTopics } from './home.js';

export const topicRoutes = Router();
topicRoutes.use(requireAuth);

/** All headings with their topics, in display order. Content is read from the DB, so admins can add rows without code changes. */
topicRoutes.get('/', async (req, res) => {
  const access = await accessFor(req.userId!);
  const unlocked = (id: string) => access.allAccess || access.topicIds.has(id);
  const cats = await db.select().from(categories).orderBy(asc(categories.sortOrder));
  const tops = await db.select({ id: topics.id, name: topics.name, description: topics.description, categoryId: topics.categoryId, featured: topics.featured,
    fiction: sql<boolean>`exists (select 1 from ${topicBooks} tb join ${books} b on b.id = tb.book_id where tb.topic_id = "topics"."id" and b.kind = 'fiction')` })
    .from(topics).orderBy(asc(topics.sortOrder));
  res.json(cats.map((c) => ({ ...c, topics: tops.filter((t) => t.categoryId === c.id).map(({ categoryId, ...t }) => ({ ...t, unlocked: unlocked(t.id), free: t.id === access.freeTopicId })) })));
});

/**
 * The learner's own topics with progress, plus a few suggestions from their goals (shown only when
 * they ask "what should I do?", alongside the full questionnaire).
 */
topicRoutes.get('/mine', async (req, res) => {
  const userId = req.userId!;
  const started = await myTopics(userId, 200);
  const [p] = await db.select({ goals: profiles.goals }).from(profiles).where(eq(profiles.userId, userId));
  const goals = (p?.goals as string[]) ?? [];
  const names = [...new Set(goals.flatMap((g) => GOAL_TOPICS[g] ?? []))];
  const rows = names.length ? await db.select({ id: topics.id, name: topics.name, category: categories.name }).from(topics)
    .innerJoin(categories, eq(categories.id, topics.categoryId)).where(sql`${topics.name} in ${names}`) : [];
  const suggestions = names.map((n) => rows.find((r) => r.name === n)).filter((r): r is NonNullable<typeof r> => !!r && !started.some((s) => s.id === r.id))
    .slice(0, 4).map((r) => ({ ...r, reason: `For your goal: ${goals.find((g) => (GOAL_TOPICS[g] ?? []).includes(r.name))}` }));
  res.json({ started, suggestions });
});

topicRoutes.get('/:id', async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) throw new HttpError(404, 'Topic not found');
  const [t] = await db.select({ id: topics.id, name: topics.name, description: topics.description, featured: topics.featured, category: categories.name, icon: categories.icon })
    .from(topics).innerJoin(categories, eq(categories.id, topics.categoryId)).where(eq(topics.id, id.data));
  if (!t) throw new HttpError(404, 'Topic not found');
  const access = await accessFor(req.userId!);
  const bookRows = await db.select({ title: books.title, author: books.author, kind: books.kind, buyUrl: books.buyUrl })
    .from(topicBooks).innerJoin(books, eq(books.id, topicBooks.bookId))
    .where(eq(topicBooks.topicId, t.id)).orderBy(asc(topicBooks.sortOrder));
  res.json({ ...t, books: bookRows, unlocked: access.allAccess || access.topicIds.has(t.id), free: t.id === access.freeTopicId });
});
