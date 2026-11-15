import { Router } from 'express';
import { z } from 'zod';
import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { checkins } from '../db/schema.js';
import { requireAuth } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';
import { recordActivity } from '../lib/activity.js';
import { uuid } from './bites.js';

/** "Did you use it?": a day or two after a role-play or situation plan, ask how the real conversation went. */
export const checkinRoutes = Router();
checkinRoutes.use(requireAuth);

type Row = typeof checkins.$inferSelect;
export const WIN_XP = 25;

const question = (c: Row) => c.kind === 'situation'
  ? `Did “${c.title}” happen yet? How did it go?`
  : c.withName ? `Did you have the real conversation with ${c.withName}? How did it go?`
  : `Did you get to use what you practised in “${c.title}” at work?`;
const view = (c: Row) => ({ id: c.id, kind: c.kind, title: c.title, withName: c.withName, question: question(c), outcome: c.outcome, note: c.note, answeredAt: c.answeredAt });

/** Schedules a check-in (once per role-play or situation). */
export async function scheduleCheckin(v: { userId: string; kind: 'roleplay' | 'situation'; sourceId: string; topicId?: string | null; title: string; withName?: string | null; afterHours: number }) {
  await db.insert(checkins).values({ userId: v.userId, kind: v.kind, sourceId: v.sourceId, topicId: v.topicId ?? null, title: v.title, withName: v.withName ?? null,
    dueAt: sql`now() + make_interval(hours => ${v.afterHours})` as unknown as Date }).onConflictDoNothing();
}

checkinRoutes.get('/due', async (req, res) => {
  const rows = await db.select().from(checkins).where(and(eq(checkins.userId, req.userId!), isNull(checkins.answeredAt), lte(checkins.dueAt, new Date())))
    .orderBy(asc(checkins.dueAt)).limit(3);
  res.json(rows.map(view));
});

checkinRoutes.get('/', async (req, res) => {
  const rows = await db.select().from(checkins).where(and(eq(checkins.userId, req.userId!), sql`${checkins.outcome} in ('well','mixed')`))
    .orderBy(sql`${checkins.answeredAt} desc`).limit(50);
  res.json(rows.map(view));
});

checkinRoutes.post('/:id', async (req, res) => {
  const body = z.object({ outcome: z.enum(['well', 'mixed', 'not_yet']), note: z.string().trim().max(400).optional() }).parse(req.body);
  const userId = req.userId!;
  const [c] = await db.select().from(checkins).where(and(eq(checkins.id, uuid(req.params.id, 'Check-in')), eq(checkins.userId, userId)));
  if (!c) throw new HttpError(404, 'Check-in not found');
  if (c.answeredAt) return void res.json(view(c));
  if (body.outcome === 'not_yet') {
    // Ask once more in two days; a second "not yet" closes it quietly.
    const [u] = c.outcome === 'not_yet'
      ? await db.update(checkins).set({ answeredAt: new Date() }).where(eq(checkins.id, c.id)).returning()
      : await db.update(checkins).set({ outcome: 'not_yet', dueAt: sql`now() + interval '2 days'` as unknown as Date }).where(eq(checkins.id, c.id)).returning();
    return void res.json(view(u));
  }
  const [u] = await db.update(checkins).set({ outcome: body.outcome, note: body.note || null, answeredAt: new Date() }).where(eq(checkins.id, c.id)).returning();
  await recordActivity(userId, 'win', { topicId: c.topicId, score: body.outcome === 'well' ? 100 : 50, xp: WIN_XP });
  res.json(view(u));
});
