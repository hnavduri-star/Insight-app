import { Router } from 'express';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { categories, topics, books, topicBooks } from '../db/schema.js';
import { requireAuth } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';

export const topicRoutes = Router();
topicRoutes.use(requireAuth);

/** All headings with their topics, in display order. Content is read from the DB, so admins can add rows without code changes. */
topicRoutes.get('/', async (_req, res) => {
  const cats = await db.select().from(categories).orderBy(asc(categories.sortOrder));
  const tops = await db.select({ id: topics.id, name: topics.name, categoryId: topics.categoryId })
    .from(topics).orderBy(asc(topics.sortOrder));
  res.json(cats.map((c) => ({ ...c, topics: tops.filter((t) => t.categoryId === c.id).map(({ categoryId, ...t }) => t) })));
});

topicRoutes.get('/:id', async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) throw new HttpError(404, 'Topic not found');
  const [t] = await db.select({ id: topics.id, name: topics.name, category: categories.name, icon: categories.icon })
    .from(topics).innerJoin(categories, eq(categories.id, topics.categoryId)).where(eq(topics.id, id.data));
  if (!t) throw new HttpError(404, 'Topic not found');
  const bookRows = await db.select({ title: books.title, author: books.author, buyUrl: books.buyUrl })
    .from(topicBooks).innerJoin(books, eq(books.id, topicBooks.bookId))
    .where(eq(topicBooks.topicId, t.id)).orderBy(asc(topicBooks.sortOrder));
  res.json({ ...t, books: bookRows });
});
