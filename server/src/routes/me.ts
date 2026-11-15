import { Router } from 'express';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users, profiles } from '../db/schema.js';
import { requireAuth, checkPassword, clearSession } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';
import { profileInput } from '../lib/validate.js';
import { accessFor, chooseFreeTopic } from '../lib/access.js';
import { topics } from '../db/schema.js';

/** The signed-in user's account + profile. Every query is scoped to req.userId. */
export async function loadMe(userId: string) {
  const [row] = await db.select({
    id: users.id, name: users.name, email: users.email, emailVerified: sql<boolean>`${users.emailVerifiedAt} is not null`,
    persona: profiles.persona, industry: profiles.industry, goal: profiles.goal, dailyMinutes: profiles.dailyMinutes,
    coach: profiles.coach, timezone: profiles.timezone, onboarded: sql<boolean>`${profiles.onboardedAt} is not null`,
  }).from(users).innerJoin(profiles, eq(profiles.userId, users.id)).where(eq(users.id, userId));
  if (!row) throw new HttpError(404, 'Account not found');
  const { plan, freeTopicId } = await accessFor(userId);
  return { ...row, plan, freeTopicId };
}

export const me = Router();
me.use(requireAuth);

me.get('/profile', async (req, res) => { res.json(await loadMe(req.userId!)); });

me.put('/profile', async (req, res) => {
  const input = profileInput.parse(req.body);
  const { name, ...profile } = input;
  await db.transaction(async (tx) => {
    if (name) await tx.update(users).set({ name }).where(eq(users.id, req.userId!));
    if (Object.keys(profile).length) {
      await tx.update(profiles).set({ ...profile, updatedAt: new Date() }).where(eq(profiles.userId, req.userId!));
    }
  });
  res.json(await loadMe(req.userId!));
});

/** Finishes onboarding: all four answers plus a coach are required. */
me.post('/onboarding', async (req, res) => {
  const input = profileInput.required({ persona: true, industry: true, goal: true, dailyMinutes: true, coach: true })
    .omit({ name: true }).parse(req.body);
  await db.update(profiles).set({ ...input, onboardedAt: sql`coalesce(${profiles.onboardedAt}, now())`, updatedAt: new Date() })
    .where(eq(profiles.userId, req.userId!));
  res.json(await loadMe(req.userId!));
});

/** Picks the one free topic every learner gets before paying. */
me.post('/free-topic', async (req, res) => {
  const { topicId } = z.object({ topicId: z.string().uuid() }).parse(req.body);
  const [t] = await db.select({ id: topics.id }).from(topics).where(eq(topics.id, topicId));
  if (!t) throw new HttpError(404, 'Topic not found');
  await chooseFreeTopic(req.userId!, topicId);
  res.json(await loadMe(req.userId!));
});

/** Permanently deletes the account; every user table cascades from users.id. */
me.delete('/account', async (req, res) => {
  const { password } = z.object({ password: z.string().max(128) }).parse(req.body);
  const [u] = await db.select().from(users).where(eq(users.id, req.userId!));
  if (!(await checkPassword(password, u.passwordHash))) throw new HttpError(401, 'Password is incorrect', 'bad_credentials');
  await db.delete(users).where(eq(users.id, req.userId!));
  clearSession(res);
  res.json({ ok: true });
});
