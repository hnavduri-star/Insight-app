import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { betaFeedback, users } from '../db/schema.js';
import { requireAuth } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';

/** Admins: users.is_admin, or an email listed in ADMIN_EMAILS (comma-separated). */
export async function isAdmin(userId: string) {
  const [u] = await db.select({ email: users.email, isAdmin: users.isAdmin }).from(users).where(eq(users.id, userId));
  if (!u) return false;
  const list = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return u.isAdmin || list.includes(u.email.toLowerCase());
}
const requireAdmin: RequestHandler = async (req, _res, next) => {
  try { if (!(await isAdmin(req.userId!))) throw new HttpError(403, 'Admins only', 'forbidden'); next(); } catch (e) { next(e); }
};

// ---------- Beta feedback (any learner) ----------
export const feedbackRoutes = Router();
feedbackRoutes.use(requireAuth);
const feedbackInput = z.object({
  usedAtWork: z.string().trim().max(800).optional(), feltGeneric: z.string().trim().max(800).optional(),
  wouldPay: z.enum(['yes', 'maybe', 'no']).optional(), priceUsd: z.number().int().min(0).max(1000).nullable().optional(),
}).refine((b) => b.usedAtWork || b.feltGeneric || b.wouldPay, 'Answer at least one question');
feedbackRoutes.post('/', async (req, res) => {
  const b = feedbackInput.parse(req.body);
  await db.insert(betaFeedback).values({ userId: req.userId!, usedAtWork: b.usedAtWork || null, feltGeneric: b.feltGeneric || null, wouldPay: b.wouldPay ?? null, priceUsd: b.priceUsd ?? null });
  res.json({ ok: true });
});

// ---------- Metrics (admins) ----------
export const adminRoutes = Router();
adminRoutes.use(requireAuth, requireAdmin);

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);

adminRoutes.get('/metrics', async (_req, res) => {
  const one = async <T>(q: ReturnType<typeof sql>) => (await db.execute(q)).rows[0] as T;
  const f = await one<Record<string, number>>(sql`
    select
      (select count(*)::int from users) as signups,
      (select count(*)::int from users where created_at > now() - interval '7 days') as signups7,
      (select count(*)::int from profiles where onboarded_at is not null) as onboarded,
      (select count(distinct user_id)::int from topic_progress) as started,
      (select count(distinct user_id)::int from topic_progress where cards_completed_at is not null and quiz_completed_at is not null) as foundations,
      (select count(distinct user_id)::int from practice_reps where answered_at is not null) as reps,
      (select count(distinct user_id)::int from roleplay_sessions where status = 'debriefed') as roleplay,
      (select count(distinct user_id)::int from checkins where outcome in ('well','mixed')) as wins,
      (select count(distinct user_id)::int from activity_events where kind = 'daily') as daily`);
  // Retention: active on day 1 (or day 7+) after their signup day, among users old enough to tell.
  const r = await one<Record<string, number>>(sql`
    with u as (select id, created_at::date as d0 from users)
    select
      (select count(*)::int from u where d0 <= current_date - 1) as d1_base,
      (select count(*)::int from u where d0 <= current_date - 1 and exists (select 1 from activity_events a where a.user_id = u.id and a.local_day = u.d0 + 1)) as d1,
      (select count(*)::int from u where d0 <= current_date - 7) as d7_base,
      (select count(*)::int from u where d0 <= current_date - 7 and exists (select 1 from activity_events a where a.user_id = u.id and a.local_day >= u.d0 + 7)) as d7`);
  const weeks = (await db.execute(sql`
    select to_char(date_trunc('week', ended_at), 'YYYY-MM-DD') as week, round(avg(score))::int as avg, count(*)::int as n
    from roleplay_sessions where status = 'debriefed' and ended_at > now() - interval '8 weeks' group by 1 order by 1`)).rows;
  const topicsRated = (await db.execute(sql`
    select t.name, count(*) filter (where f.helpful)::int as up, count(*) filter (where not f.helpful)::int as down
    from feedback f join cached_lessons l on l.id = f.lesson_id join topics t on t.id = l.topic_id
    group by t.name order by (count(*) filter (where not f.helpful))::float / count(*) desc, count(*) desc limit 12`)).rows;
  const ai = await one<Record<string, number>>(sql`
    select count(*)::int as calls, coalesce(sum(input_tokens),0)::int as input, coalesce(sum(output_tokens),0)::int as output,
      count(*) filter (where not ok)::int as failed from ai_calls where created_at > now() - interval '7 days'`);
  const feedback = await db.select({ name: users.name, at: betaFeedback.createdAt, usedAtWork: betaFeedback.usedAtWork, feltGeneric: betaFeedback.feltGeneric,
    wouldPay: betaFeedback.wouldPay, priceUsd: betaFeedback.priceUsd }).from(betaFeedback).innerJoin(users, eq(users.id, betaFeedback.userId))
    .orderBy(desc(betaFeedback.createdAt)).limit(50);
  const s = f.signups;
  res.json({
    signups: s, signups7: f.signups7,
    funnel: [
      { step: 'Signed up', n: s, pct: 100 }, { step: 'Finished onboarding', n: f.onboarded, pct: pct(f.onboarded, s) },
      { step: 'Started a toolkit', n: f.started, pct: pct(f.started, s) }, { step: 'Finished Foundations', n: f.foundations, pct: pct(f.foundations, s) },
      { step: 'Did a practice rep', n: f.reps, pct: pct(f.reps, s) }, { step: 'Tried a role-play', n: f.roleplay, pct: pct(f.roleplay, s) },
      { step: 'Did a daily session', n: f.daily, pct: pct(f.daily, s) }, { step: 'Logged a real-world win', n: f.wins, pct: pct(f.wins, s) },
    ],
    retention: { d1: pct(r.d1, r.d1_base), d1Base: r.d1_base, d7: pct(r.d7, r.d7_base), d7Base: r.d7_base },
    roleplayByWeek: weeks, topicsRated, ai, feedback,
    wouldPay: { yes: feedback.filter((x) => x.wouldPay === 'yes').length, maybe: feedback.filter((x) => x.wouldPay === 'maybe').length, no: feedback.filter((x) => x.wouldPay === 'no').length,
      medianPrice: (() => { const p = feedback.map((x) => x.priceUsd).filter((x): x is number => x != null).sort((a, b) => a - b); return p.length ? p[Math.floor(p.length / 2)] : null; })() },
  });
});

/** Has this learner already given beta feedback? (Home asks once they've been active a few days.) */
export async function shouldAskFeedback(userId: string) {
  const [given] = await db.select({ id: betaFeedback.id }).from(betaFeedback).where(eq(betaFeedback.userId, userId)).limit(1);
  if (given) return false;
  const { rows } = await db.execute<{ n: number }>(sql`select count(distinct local_day)::int as n from activity_events where user_id = ${userId}`);
  return (rows[0]?.n ?? 0) >= 3;
}
