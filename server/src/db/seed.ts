import { db, pool } from './client.js';
import { seed } from './seedData.js';

const r = await seed(db);
console.log(`Seeded ${r.categories} headings and ${r.topics} topics`);
await pool.end();
