import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { DB } from './client.js';
import { categories, topics, books, topicBooks, badges } from './schema.js';
import { loadCatalog, type CatalogHeading } from './catalog.js';
import { BADGES } from './badges.js';

/**
 * Idempotent upsert of the catalogue (by heading name, topic name, book title).
 * Topics missing from the file are deleted unless a learner has history on them
 * (progress, scenarios, Playbook, reviews, commitments, role-plays, ratings);
 * those are kept and reported. `prune` deletes them anyway, history included.
 * Free-topic picks on a deleted topic are cleared, so the learner picks again.
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
        const [topic] = await tx.insert(topics).values({ categoryId: cat.id, name: t.name, description: t.description, featured: t.featured ?? false, sortOrder: ti + 1 })
          .onConflictDoUpdate({ target: topics.name, set: { categoryId: cat.id, description: t.description, featured: t.featured ?? false, sortOrder: ti + 1 } }).returning();
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

    const staleTopics = await tx.select({ id: topics.id, name: topics.name }).from(topics).where(notInArray(topics.name, topicNames));
    const withHistory = new Set<string>();
    if (!opts.prune && staleTopics.length) {
      const ids = staleTopics.map((s) => s.id);
      const { rows } = await tx.execute<{ topic_id: string }>(sql`
        select topic_id from topic_progress where topic_id in ${ids}
        union select topic_id from scenarios where topic_id in ${ids}
        union select topic_id from playbook_entries where topic_id in ${ids}
        union select topic_id from review_items where topic_id in ${ids}
        union select topic_id from commitments where topic_id in ${ids}
        union select topic_id from roleplay_sessions where topic_id in ${ids}
        union select topic_id from assessments where topic_id in ${ids}`);
      rows.forEach((r) => withHistory.add(r.topic_id));
    }
    const removable = staleTopics.filter((s) => !withHistory.has(s.id));
    if (removable.length) await tx.delete(topics).where(inArray(topics.id, removable.map((s) => s.id)));
    await tx.delete(categories).where(and(notInArray(categories.name, cats.map((c) => c.name)),
      sql`not exists (select 1 from ${topics} where ${topics.categoryId} = ${categories.id})`));
    return { removed: removable.map((s) => s.name), kept: staleTopics.filter((s) => withHistory.has(s.id)).map((s) => s.name) };
  });
  return { categories: cats.length, topics: topicNames.length, books: bookCount, ...stale };
}
