import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { activityEvents, profiles, userProgress } from '../db/schema.js';

export type ActivityKind = 'tools' | 'quiz' | 'scenario' | 'rep' | 'roleplay' | 'review' | 'situation' | 'daily' | 'win';

/** The learner's local calendar day (YYYY-MM-DD) in their time zone. */
export function localDay(timeZone: string, now = new Date()) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
  catch { return now.toISOString().slice(0, 10); }
}

/** Whole days from a to b (YYYY-MM-DD strings). */
export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export type StreakState = { streak: number; lastActiveDate: string | null; freezes: number };

/**
 * The streak rules: the first activity of a local day counts. Active yesterday → +1.
 * Missed exactly one day with a freeze left → spend the freeze, +1. Otherwise start again at 1.
 * Every 7-day milestone earns one more freeze.
 */
export function advanceStreak(s: StreakState, today: string): StreakState & { counted: boolean; usedFreeze: boolean; earnedFreeze: boolean } {
  if (s.lastActiveDate === today) return { ...s, counted: false, usedFreeze: false, earnedFreeze: false };
  const gap = s.lastActiveDate ? daysBetween(s.lastActiveDate, today) : Infinity;
  let { streak, freezes } = s;
  let usedFreeze = false;
  if (gap === 1) streak += 1;
  else if (gap === 2 && freezes > 0) { freezes -= 1; usedFreeze = true; streak += 1; }
  else streak = 1;
  const earnedFreeze = streak % 7 === 0;
  if (earnedFreeze) freezes += 1;
  return { streak, lastActiveDate: today, freezes, counted: true, usedFreeze, earnedFreeze };
}

/** What the streak shows today, without recording anything (a broken streak reads as 0). */
export function currentStreak(s: StreakState, today: string) {
  if (!s.lastActiveDate) return 0;
  const gap = daysBetween(s.lastActiveDate, today);
  if (gap <= 1) return s.streak;
  if (gap === 2 && s.freezes > 0) return s.streak; // still savable today with a freeze
  return 0;
}

export async function timezoneOf(userId: string) {
  const [p] = await db.select({ tz: profiles.timezone }).from(profiles).where(eq(profiles.userId, userId));
  return p?.tz ?? 'UTC';
}

export async function progressOf(userId: string) {
  await db.insert(userProgress).values({ userId }).onConflictDoNothing();
  const [p] = await db.select().from(userProgress).where(eq(userProgress.userId, userId));
  return p;
}

/** Logs one learning action and advances the streak on the first action of the learner's day. */
export async function recordActivity(userId: string, kind: ActivityKind, opts: { topicId?: string | null; score?: number | null; xp?: number } = {}) {
  const today = localDay(await timezoneOf(userId));
  await db.insert(activityEvents).values({ userId, kind, topicId: opts.topicId ?? null, score: opts.score ?? null, xp: opts.xp ?? 10, localDay: today });
  return db.transaction(async (tx) => {
    await tx.insert(userProgress).values({ userId }).onConflictDoNothing();
    const [p] = await tx.select().from(userProgress).where(eq(userProgress.userId, userId)).for('update');
    const next = advanceStreak({ streak: p.streak, lastActiveDate: p.lastActiveDate, freezes: p.freezes }, today);
    await tx.update(userProgress).set({ streak: next.streak, lastActiveDate: next.lastActiveDate, freezes: next.freezes, xp: sql`${userProgress.xp} + ${opts.xp ?? 10}` })
      .where(eq(userProgress.userId, userId));
    return next;
  });
}

export async function activityOn(userId: string, day: string) {
  return db.select().from(activityEvents).where(and(eq(activityEvents.userId, userId), eq(activityEvents.localDay, day)));
}
