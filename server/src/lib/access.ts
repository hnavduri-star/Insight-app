import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { db } from '../db/client.js';
import { entitlements, topicProgress } from '../db/schema.js';
import { HttpError } from './errors.js';

const active = () => and(or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, new Date())));

/** What the user can open: everything (premium), or a set of topic ids. */
export async function accessFor(userId: string) {
  const rows = await db.select().from(entitlements).where(and(eq(entitlements.userId, userId), active()));
  const allAccess = rows.some((r) => r.kind === 'all_access');
  const freeTopicId = rows.find((r) => r.source === 'free_trial')?.topicId ?? null;
  const topicIds = new Set(rows.filter((r) => r.kind === 'topic' && r.topicId).map((r) => r.topicId!));
  return { plan: allAccess ? ('premium' as const) : ('free' as const), allAccess, freeTopicId, topicIds };
}

export async function canAccessTopic(userId: string, topicId: string) {
  const a = await accessFor(userId);
  return a.allAccess || a.topicIds.has(topicId);
}

/** Server-side gate for every paid endpoint (bites, quizzes, role-play from milestone 2). */
export async function requireTopicAccess(userId: string, topicId: string) {
  if (!(await canAccessTopic(userId, topicId))) throw new HttpError(402, 'This topic is part of Insight Premium.', 'premium_required');
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
