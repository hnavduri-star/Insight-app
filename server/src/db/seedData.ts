import { and, eq, notInArray, sql } from 'drizzle-orm';
import type { DB } from './client.js';
import { categories, topics, books, topicBooks, badges } from './schema.js';
import { loadCatalog, type CatalogHeading } from './catalog.js';
import { BADGES } from './badges.js';

/**
 * Idempotent upsert of the catalogue (by heading name, topic name, book title).
 * Topics missing from the file are only deleted with `prune` — deleting a topic
 * also deletes learners' progress on it.
 */
export async function seed(db: DB, opts: { catalog?: CatalogHeading[]; prune?: boolean } = {}) {
  const cats = opts.catalog ?? await loadCatalog();
  const topicNames: string[] = [];
  let bookCount = 0;

  const stale = await db.transaction(async (tx) => {
    for (const [ci, c] of cats.entries()) {
      const [cat] = await tx.insert(categories).values({ name: c.name, icon: c.icon, sortOrder: ci + 1 })
        .onConflictDoUpdate({ target: categories.name, set: { icon: c.icon, sortOrder: ci + 1 } }).returning();
      for (const [ti, t] of c.topics.entries()) {
        topicNames.push(t.name);
        const [topic] = await tx.insert(topics).values({ categoryId: cat.id, name: t.name, sortOrder: ti + 1 })
          .onConflictDoUpdate({ target: topics.name, set: { categoryId: cat.id, sortOrder: ti + 1 } }).returning();
        await tx.delete(topicBooks).where(eq(topicBooks.topicId, topic.id));
        for (const [bi, b] of t.books.entries()) {
          const [book] = await tx.insert(books).values(b)
            .onConflictDoUpdate({ target: books.title, set: { author: b.author, kind: b.kind, buyUrl: b.buyUrl } }).returning();
          await tx.insert(topicBooks).values({ topicId: topic.id, bookId: book.id, sortOrder: bi + 1 });
          bookCount++;
        }
      }
    }
    for (const b of BADGES) {
      await tx.insert(badges).values(b).onConflictDoUpdate({ target: badges.key, set: { name: b.name, description: b.description } });
    }

    const staleTopics = await tx.select({ name: topics.name }).from(topics).where(notInArray(topics.name, topicNames));
    if (opts.prune) {
      await tx.delete(topics).where(notInArray(topics.name, topicNames));
      await tx.delete(categories).where(and(notInArray(categories.name, cats.map((c) => c.name)),
        sql`not exists (select 1 from ${topics} where ${topics.categoryId} = ${categories.id})`));
    }
    return staleTopics.map((s) => s.name);
  });
  return { categories: cats.length, topics: topicNames.length, books: bookCount, stale, pruned: !!opts.prune };
}
