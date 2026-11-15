/** Dev/support tool until payments are wired: npm run grant -w server -- user@example.com [--revoke] */
import { and, eq } from 'drizzle-orm';
import { db, pool } from './db/client.js';
import { users, entitlements } from './db/schema.js';

const [email, flag] = process.argv.slice(2);
const [u] = await db.select().from(users).where(eq(users.email, (email ?? '').toLowerCase()));
if (!u) console.error('No user with that email');
else if (flag === '--revoke') {
  await db.delete(entitlements).where(and(eq(entitlements.userId, u.id), eq(entitlements.source, 'grant')));
  console.log(`Premium removed for ${u.email}`);
} else {
  await db.insert(entitlements).values({ userId: u.id, kind: 'all_access', source: 'grant' });
  console.log(`Premium granted to ${u.email}`);
}
await pool.end();
