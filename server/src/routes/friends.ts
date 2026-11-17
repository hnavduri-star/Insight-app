import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { dailyTime, friendships, userProgress, users } from '../db/schema.js';
import { requireAuth } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';
import { addDays, currentStreak, localDay, timezoneOf } from '../lib/activity.js';

/**
 * Friends and the weekly league: connect with a friend code, then see who spent the most time learning this week
 * (Monday to Sunday). Indirect: everyone learns their own topics; the league counts time, not what was learned.
 * Friends see first name, weekly minutes and streak only, never what you studied or wrote.
 */
export const friendRoutes = Router();
friendRoutes.use(requireAuth);

export const MAX_FRIENDS = 50;
const newCode = () => Array.from(crypto.randomBytes(6), (b) => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[b % 31]).join('');

/** The learner's friend code, created on first use. */
export async function friendCodeFor(userId: string) {
  const [u] = await db.select({ code: users.friendCode }).from(users).where(eq(users.id, userId));
  if (u?.code) return u.code;
  for (let i = 0; i < 5; i++) {
    try {
      const [r] = await db.update(users).set({ friendCode: newCode() }).where(and(eq(users.id, userId), isNull(users.friendCode))).returning({ code: users.friendCode });
      if (r?.code) return r.code;
      const [again] = await db.select({ code: users.friendCode }).from(users).where(eq(users.id, userId));
      if (again?.code) return again.code;
    } catch { /* code collision: try another */ }
  }
  throw new HttpError(500, "Couldn't create a friend code. Please try again.");
}

/** Monday of the learner's current local week (YYYY-MM-DD). */
export function weekStart(today: string) {
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(today, -((dow + 6) % 7));
}

/** The weekly league among the learner and their friends: most active learning minutes first. */
export async function leagueFor(userId: string) {
  const today = localDay(await timezoneOf(userId));
  const from = weekStart(today);
  const friendIds = (await db.select({ id: friendships.friendId }).from(friendships).where(eq(friendships.userId, userId))).map((r) => r.id);
  const ids = [userId, ...friendIds];
  const rows = await db.select({ id: users.id, name: users.name, streak: userProgress.streak, last: userProgress.lastActiveDate, freezes: userProgress.freezes,
    weekSeconds: sql<number>`coalesce((select sum(${dailyTime.seconds}) from ${dailyTime} where ${dailyTime.userId} = ${users.id} and ${dailyTime.localDay} >= ${from}), 0)::int` })
    .from(users).leftJoin(userProgress, eq(userProgress.userId, users.id)).where(inArray(users.id, ids));
  const ranked = rows
    .map((r) => ({ id: r.id, firstName: r.name.split(/\s+/)[0], me: r.id === userId, weekMinutes: Math.floor(r.weekSeconds / 60),
      streak: r.streak != null ? currentStreak({ streak: r.streak, lastActiveDate: r.last, freezes: r.freezes ?? 0 }, today) : 0 }))
    .sort((a, b) => b.weekMinutes - a.weekMinutes || b.streak - a.streak || a.firstName.localeCompare(b.firstName));
  let rank = 0, prev = -1;
  const withRank = ranked.map((r, i) => { if (r.weekMinutes !== prev) { rank = i + 1; prev = r.weekMinutes; } return { ...r, rank }; });
  const daysLeft = 6 - ((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7);
  return { weekStart: from, daysLeft, friends: friendIds.length, league: withRank };
}

/** Max seconds one heartbeat can add. */
export const HEARTBEAT_MAX = 60;

/**
 * Active time: the app sends a heartbeat every 30 seconds while it is open, visible and the learner has
 * interacted recently. Capped by wall-clock time since the last heartbeat, so the clock can't be inflated.
 */
export async function addActiveTime(userId: string, seconds: number) {
  const day = localDay(await timezoneOf(userId));
  const [r] = await db.insert(dailyTime).values({ userId, localDay: day, seconds })
    .onConflictDoUpdate({ target: [dailyTime.userId, dailyTime.localDay], set: {
      seconds: sql`${dailyTime.seconds} + least(${seconds}, greatest(0, extract(epoch from now() - ${dailyTime.updatedAt})::int + 5))`, updatedAt: new Date() } })
    .returning({ seconds: dailyTime.seconds });
  return r.seconds;
}

friendRoutes.post('/time', async (req, res) => {
  const { seconds } = z.object({ seconds: z.number().int().min(1).max(HEARTBEAT_MAX) }).parse(req.body);
  res.json({ todaySeconds: await addActiveTime(req.userId!, seconds) });
});

friendRoutes.get('/', async (req, res) => {
  res.json({ code: await friendCodeFor(req.userId!), ...(await leagueFor(req.userId!)) });
});

friendRoutes.post('/add', async (req, res) => {
  const { code } = z.object({ code: z.string().trim().min(4).max(12) }).parse(req.body);
  const userId = req.userId!;
  const [other] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.friendCode, code.toUpperCase()));
  if (!other) throw new HttpError(404, "That code didn't match anyone. Check it with your friend.", 'bad_code');
  if (other.id === userId) throw new HttpError(400, "That's your own code. Share it with a friend instead.", 'own_code');
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(friendships).where(eq(friendships.userId, userId));
  if (n >= MAX_FRIENDS) throw new HttpError(409, `You can have up to ${MAX_FRIENDS} friends.`, 'friends_limit');
  await db.insert(friendships).values([{ userId, friendId: other.id }, { userId: other.id, friendId: userId }]).onConflictDoNothing();
  res.json({ added: other.name.split(/\s+/)[0], ...(await leagueFor(userId)) });
});

friendRoutes.delete('/:id', async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) throw new HttpError(404, 'Friend not found');
  const userId = req.userId!;
  await db.delete(friendships).where(or(and(eq(friendships.userId, userId), eq(friendships.friendId, id.data)), and(eq(friendships.userId, id.data), eq(friendships.friendId, userId))));
  res.json(await leagueFor(userId));
});
