import { sql } from 'drizzle-orm';
import type { DB } from './client.js';
import { categories, topics, books, topicBooks, badges } from './schema.js';
import { CATS, BADGES } from './taxonomy.js';

/** Idempotent: upserts by unique name/title/key, so it can be re-run after editing taxonomy.ts. */
export async function seed(db: DB) {
  const topicNames = new Set<string>();
  for (const c of CATS) for (const t of Object.keys(c.topics)) {
    if (topicNames.has(t)) throw new Error(`Topic "${t}" appears under more than one heading`);
    topicNames.add(t);
  }

  await db.transaction(async (tx) => {
    for (const [ci, c] of CATS.entries()) {
      const [cat] = await tx.insert(categories)
        .values({ name: c.name, icon: c.icon, sortOrder: ci + 1 })
        .onConflictDoUpdate({ target: categories.name, set: { icon: c.icon, sortOrder: ci + 1 } })
        .returning();
      for (const [ti, [name, bookList]] of Object.entries(c.topics).entries()) {
        const [topic] = await tx.insert(topics)
          .values({ categoryId: cat.id, name, sortOrder: ti + 1 })
          .onConflictDoUpdate({ target: topics.name, set: { categoryId: cat.id, sortOrder: ti + 1 } })
          .returning();
        await tx.delete(topicBooks).where(sql`${topicBooks.topicId} = ${topic.id}`);
        for (const [bi, [title, author]] of bookList.entries()) {
          const [book] = await tx.insert(books).values({ title, author })
            .onConflictDoUpdate({ target: books.title, set: { author } })
            .returning();
          await tx.insert(topicBooks).values({ topicId: topic.id, bookId: book.id, sortOrder: bi + 1 });
        }
      }
    }
    for (const b of BADGES) {
      await tx.insert(badges).values(b).onConflictDoUpdate({ target: badges.key, set: { name: b.name, description: b.description } });
    }
  });
  return { categories: CATS.length, topics: topicNames.size };
}
