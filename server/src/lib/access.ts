import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { db } from '../db/client.js';
import { entitlements, topicProgress } from '../db/schema.js';
import { HttpError } from './errors.js';

const active = () => and(or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, new Date())));

/** Free beta: OPEN_ACCESS=true unlocks every topic and practice for everyone. Turn it off to restore the paywall. */
export const openAccess = () => process.env.OPEN_ACCESS === 'true';

/** What the user can open: everything (premium or free beta), or a set of topic ids. */
export async function accessFor(userId: string) {
  if (openAccess()) {
    return { plan: 'premium' as const, allAccess: true, freeTopicId: null, topicIds: new Set<string>(), planSource: 'beta' as const, premiumUntil: null };
  }
  const rows = await db.select().from(entitlements).where(and(eq(entitlements.userId, userId), active()));
  const allAccess = rows.some((r) => r.kind === 'all_access');
  const freeTopicId = rows.find((r) => r.source === 'free_trial')?.topicId ?? null;
  const topicIds = new Set(rows.filter((r) => r.kind === 'topic' && r.topicId).map((r) => r.topicId!));
  const premium = rows.filter((r) => r.kind === 'all_access');
  const planSource = premium.find((r) => r.source === 'subscription')?.source
    ?? (premium.find((r) => r.providerRef?.startsWith('test_')) ? ('test' as const) : premium[0]?.source ?? null);
  const ends = premium.map((r) => r.expiresAt);
  const premiumUntil = !premium.length || ends.some((e) => e === null) ? null : new Date(Math.max(...ends.map((e) => e!.getTime())));
  return { plan: allAccess ? ('premium' as const) : ('free' as const), allAccess, freeTopicId, topicIds, planSource, premiumUntil };
}

export async function canAccessTopic(userId: string, topicId: string) {
  const a = await accessFor(userId);
  return a.allAccess || a.topicIds.has(topicId);
}

/** Server-side gate for every paid endpoint (bites, quizzes, role-play from milestone 2). */
export async function requireTopicAccess(userId: string, topicId: string) {
  if (!(await canAccessTopic(userId, topicId))) throw new HttpError(402, 'This topic is part of Insight Premium.', 'premium_required');
}

/** Practice (role-play with your people and stock characters) is Premium only; learning is not. */
export async function requirePremium(userId: string) {
  if (!(await accessFor(userId)).allAccess) throw new HttpError(402, 'Practising conversations is part of Insight Premium.', 'premium_required');
}

/**
 * Picks (or changes) the free topic. It can be changed until the learner has
 * started it; after that it's fixed.
 */
export async function chooseFreeTopic(userId: string, topicId: string) {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(entitlements)
      .where(and(eq(entitlements.userId, userId), eq(entitlements.source, 'free_trial')));
    if (existing) {
      if (existing.topicId === topicId) return;
      const [started] = await tx.select().from(topicProgress)
        .where(and(eq(topicProgress.userId, userId), eq(topicProgress.topicId, existing.topicId!)));
      if (started) throw new HttpError(409, "You've already started your free topic. Upgrade to unlock more.", 'free_topic_locked');
      await tx.update(entitlements).set({ topicId }).where(eq(entitlements.id, existing.id));
      return;
    }
    await tx.insert(entitlements).values({ userId, kind: 'topic', topicId, source: 'free_trial' });
  });
}
