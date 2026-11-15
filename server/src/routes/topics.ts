import { Router } from 'express';
import { z } from 'zod';
import { asc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { categories, topics, books, topicBooks } from '../db/schema.js';
import { requireAuth } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';
import { accessFor } from '../lib/access.js';

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
