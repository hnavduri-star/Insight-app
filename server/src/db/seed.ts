/**
 * npm run db:seed                         -> loads data/insight-topics-and-books.xlsx
 * npm run db:seed -- path/to/file.csv     -> loads another file (.csv or .xlsx)
 * npm run db:seed -- --prune              -> also deletes topics not in the file (and learners' progress on them)
 */
import { db, pool } from './client.js';
import { seed } from './seedData.js';
import { loadCatalog } from './catalog.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
try {
  const r = await seed(db, { catalog: await loadCatalog(file), prune: args.includes('--prune') });
  console.log(`Loaded ${r.categories} headings, ${r.topics} topics, ${r.books} topic-book links`);
  if (r.stale.length) console.log(`${r.pruned ? 'Deleted' : 'Not in file (kept; re-run with --prune to delete)'}: ${r.stale.join(', ')}`);
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
