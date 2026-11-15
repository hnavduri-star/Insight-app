/** Make someone an admin (sees /admin metrics): npm run admin -w server -- user@example.com [--revoke] */
import { eq } from 'drizzle-orm';
import { db, pool } from './db/client.js';
import { users } from './db/schema.js';

const [email, flag] = process.argv.slice(2);
const [u] = await db.update(users).set({ isAdmin: flag !== '--revoke' }).where(eq(users.email, (email ?? '').toLowerCase())).returning({ email: users.email });
console.log(u ? `${u.email} is ${flag === '--revoke' ? 'no longer' : 'now'} an admin` : 'No user with that email');
await pool.end();
