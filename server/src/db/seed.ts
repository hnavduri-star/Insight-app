/**
 * npm run db:seed                         -> loads data/insight-topics-and-books.xlsx
 * npm run db:seed -- path/to/file.csv     -> loads another file (.csv or .xlsx)
 * Topics no longer in the file are removed unless learners have history on them.
 * npm run db:seed -- --prune              -> removes them even then (history included)
 */
import { db, pool } from './client.js';
import { seed } from './seedData.js';
import { loadCatalog } from './catalog.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
try {
  const r = await seed(db, { catalog: await loadCatalog(file), prune: args.includes('--prune') });
  console.log(`Loaded ${r.categories} headings, ${r.topics} topics, ${r.books} topic-book links`);
  if (r.removed.length) console.log(`Removed (no longer in file): ${r.removed.join(', ')}`);
  if (r.kept.length) console.log(`Kept because learners have history on them (use --prune to remove): ${r.kept.join(', ')}`);
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
