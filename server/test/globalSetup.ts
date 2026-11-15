import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as schema from '../src/db/schema.js';
import { seed } from '../src/db/seedData.js';

export default async function () {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://insight:insight@localhost:5432/insight_test';
  const pool = new pg.Pool({ connectionString: url });
  await pool.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;');
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: new URL('../drizzle', import.meta.url).pathname });
  await seed(db);
  await pool.end();
}
