import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { coachingCommitments, coachingPlans, coachingSessions, profiles } from '../db/schema.js';
import { requireAuth } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';
import { requirePremium } from '../lib/access.js';
import { coachSummary, coachTurn, type CoachLine, type CoachSummary } from '../lib/ai.js';
import { runJob } from '../lib/jobs.js';
import { recordActivity } from '../lib/activity.js';
import { COACHES, COACHING_ATTRIBUTES, MAX_COACHING_ATTRIBUTES, PERSONAS } from '../../../shared/options.js';
import { checkLimit, uuid } from './bites.js';

/**
 * Coaching: the coachee chooses up to 3 attributes to develop, then works through coachee-led sessions.
 * The coach asks open questions, holds them to their own commitments and gives ideas only when asked.
 */
export const coachingRoutes = Router();
coachingRoutes.use(requireAuth);

export const MAX_COACHEE_TURNS = 30;
type Attr = { name: string; why: string | null };
type Row = typeof coachingSessions.$inferSelect;

async function coachOf(userId: string) {
  const [p] = await db.select({ coach: profiles.coach, persona: profiles.persona }).from(profiles).where(eq(profiles.userId, userId));
  return { coachName: COACHES.find((c) => c.value === p?.coach)?.name ?? 'Maya', persona: PERSONAS.find((x) => x.value === p?.persona)?.label ?? 'Professional' };
}
async function planOf(userId: string) {
  const [p] = await db.select().from(coachingPlans).where(eq(coachingPlans.userId, userId));
  return (p?.attributesJson as Attr[]) ?? [];
}
const openCommitments = (userId: string, attribute?: string) => db.select().from(coachingCommitments)
  .where(and(eq(coachingCommitments.userId, userId), eq(coachingCommitments.status, 'open'), ...(attribute ? [eq(coachingCommitments.attribute, attribute)] : [])))
  .orderBy(desc(coachingCommitments.createdAt));

const view = (r: Row) => {
  const t = r.transcriptJson as CoachLine[];
  return { id: r.id, attribute: r.attribute, status: r.status, stage: r.stage, transcript: t, turnsUsed: t.filter((x) => x.who === 'coachee').length,
    maxTurns: MAX_COACHEE_TURNS, summary: r.summaryJson as CoachSummary | null, createdAt: r.createdAt, closedAt: r.closedAt };
};
const commitmentView = (c: typeof coachingCommitments.$inferSelect) => ({ id: c.id, attribute: c.attribute, action: c.action, when: c.when, status: c.status, note: c.note, createdAt: c.createdAt });

/** The coaching hub: chosen attributes, open commitments and recent sessions. */
coachingRoutes.get('/', async (req, res) => {
  const userId = req.userId!;
  const sessions = await db.select().from(coachingSessions).where(eq(coachingSessions.userId, userId)).orderBy(desc(coachingSessions.createdAt)).limit(20);
  res.json({
    attributes: await planOf(userId), choices: COACHING_ATTRIBUTES, max: MAX_COACHING_ATTRIBUTES,
    commitments: (await openCommitments(userId)).map(commitmentView),
    sessions: sessions.map((s) => ({ id: s.id, attribute: s.attribute, status: s.status, createdAt: s.createdAt, explored: (s.summaryJson as CoachSummary | null)?.explored ?? null })),
  });
});

const planInput = z.object({
  attributes: z.array(z.object({ name: z.string().trim().min(2).max(40), why: z.string().trim().max(200).optional() }))
    .min(1, 'Choose at least one attribute').max(MAX_COACHING_ATTRIBUTES, `Choose up to ${MAX_COACHING_ATTRIBUTES}`),
});
coachingRoutes.put('/plan', async (req, res) => {
  const { attributes } = planInput.parse(req.body);
  const unique = attributes.filter((a, i) => attributes.findIndex((b) => b.name.toLowerCase() === a.name.toLowerCase()) === i)
    .map((a) => ({ name: a.name, why: a.why || null }));
  await db.insert(coachingPlans).values({ userId: req.userId!, attributesJson: unique })
    .onConflictDoUpdate({ target: coachingPlans.userId, set: { attributesJson: unique, updatedAt: new Date() } });
  res.json({ attributes: unique });
});

/** Starts a session on one of the coachee's attributes; the coach opens (following up on commitments if any). */
coachingRoutes.post('/sessions', async (req, res) => {
  const { attribute } = z.object({ attribute: z.string().trim().min(2).max(40) }).parse(req.body);
  const userId = req.userId!;
  await requirePremium(userId);
  const plan = await planOf(userId);
  const attr = plan.find((a) => a.name.toLowerCase() === attribute.toLowerCase());
  if (!attr) throw new HttpError(400, 'Choose this attribute in your coaching plan first.', 'not_in_plan');
  // One open session per attribute: carry on where you left off.
  const [open] = await db.select().from(coachingSessions).where(and(eq(coachingSessions.userId, userId), eq(coachingSessions.attribute, attr.name), eq(coachingSessions.status, 'active')));
  if (open) return void res.json(view(open));
  const r = await runJob(`coach:start:${userId}:${attr.name}`, async () => {
    const { coachName, persona } = await coachOf(userId);
    const [prev] = await db.select().from(coachingSessions).where(and(eq(coachingSessions.userId, userId), eq(coachingSessions.attribute, attr.name), eq(coachingSessions.status, 'closed')))
      .orderBy(desc(coachingSessions.closedAt)).limit(1);
    const ps = prev?.summaryJson as CoachSummary | null;
    const commitments = await openCommitments(userId, attr.name);
    const t = await coachTurn(userId, { coachName, attribute: attr.name, why: attr.why, persona, transcript: [],
      previous: ps ? { explored: ps.explored, nextFocus: ps.nextFocus } : null, openCommitments: commitments.map((c) => ({ action: c.action, when: c.when })) });
    const [row] = await db.insert(coachingSessions).values({ userId, attribute: attr.name, stage: 'connect', transcriptJson: [{ who: 'coach', text: t.reply }] }).returning();
    return row;
  }, () => checkLimit(userId, 'coach_session'));
  if (!r.done) return void res.status(202).json({ status: 'generating' });
  res.json(view(r.result));
});

async function own(userId: string, id: string) {
  const [r] = await db.select().from(coachingSessions).where(and(eq(coachingSessions.id, uuid(id, 'Session')), eq(coachingSessions.userId, userId)));
  if (!r) throw new HttpError(404, 'Session not found');
  return r;
}

coachingRoutes.get('/sessions/:id', async (req, res) => { res.json(view(await own(req.userId!, req.params.id))); });

/** The coachee speaks; the coach replies (one question, no advice unless asked). Retries of the same turn are safe. */
coachingRoutes.post('/sessions/:id/message', async (req, res) => {
  const { text, turn } = z.object({ text: z.string().trim().min(1).max(1200), turn: z.number().int().min(0).max(100) }).parse(req.body);
  const userId = req.userId!;
  const row = await own(userId, req.params.id);
  const transcript = row.transcriptJson as CoachLine[];
  const done = transcript.filter((x) => x.who === 'coachee').length;
  if (turn < done) return void res.json(view(row));
  if (row.status !== 'active') throw new HttpError(409, 'This session has ended.', 'session_closed');
  if (turn > done) throw new HttpError(409, 'The conversation moved on. Refresh to continue.', 'out_of_sync');
  if (done >= MAX_COACHEE_TURNS) throw new HttpError(409, "We've covered a lot. Let's close this session and capture your commitments.", 'session_full');
  const r = await runJob(`coach:turn:${row.id}:${turn}`, async () => {
    const { coachName, persona } = await coachOf(userId);
    const plan = await planOf(userId);
    const next: CoachLine[] = [...transcript, { who: 'coachee', text }];
    const t = await coachTurn(userId, { coachName, attribute: row.attribute, why: plan.find((a) => a.name === row.attribute)?.why ?? null, persona,
      transcript: next, previous: null, openCommitments: (await openCommitments(userId, row.attribute)).map((c) => ({ action: c.action, when: c.when })) });
    next.push({ who: 'coach', text: t.careNote || t.reply });
    const [u] = await db.update(coachingSessions).set({ transcriptJson: next, stage: t.stage }).where(eq(coachingSessions.id, row.id)).returning();
    return { row: u, paused: !!t.careNote, adviceRequested: t.adviceRequested };
  }, () => checkLimit(userId, 'coach_turn'));
  if (!r.done) return void res.status(202).json({ status: 'generating' });
  res.json({ ...view(r.result.row), paused: r.result.paused, adviceRequested: r.result.adviceRequested });
});

/** Ends a session: notes in the coachee's words, and their commitments saved for follow-up. */
coachingRoutes.post('/sessions/:id/close', async (req, res) => {
  const userId = req.userId!;
  const row = await own(userId, req.params.id);
  if (row.status === 'closed') return void res.json(view(row));
  const transcript = row.transcriptJson as CoachLine[];
  if (transcript.filter((x) => x.who === 'coachee').length < 2) throw new HttpError(409, 'Talk it through a little more before closing.', 'too_short');
  const r = await runJob(`coach:close:${row.id}`, async () => {
    const { coachName } = await coachOf(userId);
    const summary = await coachSummary(userId, { coachName, attribute: row.attribute, transcript });
    const [u] = await db.update(coachingSessions).set({ status: 'closed', stage: 'close', summaryJson: summary, closedAt: new Date() }).where(eq(coachingSessions.id, row.id)).returning();
    if (summary.commitments.length) {
      await db.insert(coachingCommitments).values(summary.commitments.map((c) => ({ userId, sessionId: row.id, attribute: row.attribute, action: c.action, when: c.when })));
    }
    await recordActivity(userId, 'coaching', { xp: 30 });
    return u;
  }, () => checkLimit(userId, 'coach_summary'));
  if (!r.done) return void res.status(202).json({ status: 'generating' });
  res.json({ ...view(r.result), commitments: (await openCommitments(userId, row.attribute)).filter((c) => c.sessionId === row.id).map(commitmentView) });
});

/** The coachee reviews their own commitment: done, or dropped (with an optional note). */
coachingRoutes.post('/commitments/:id', async (req, res) => {
  const { status, note } = z.object({ status: z.enum(['done', 'dropped', 'open']), note: z.string().trim().max(400).optional() }).parse(req.body);
  const userId = req.userId!;
  const [c] = await db.update(coachingCommitments).set({ status, note: note || null, reviewedAt: status === 'open' ? null : new Date() })
    .where(and(eq(coachingCommitments.id, uuid(req.params.id, 'Commitment')), eq(coachingCommitments.userId, userId))).returning();
  if (!c) throw new HttpError(404, 'Commitment not found');
  if (status === 'done') await recordActivity(userId, 'win', { xp: 25 });
  res.json(commitmentView(c));
});

/** For Home: open commitments and whether a coaching plan exists. */
export async function coachingSummaryFor(userId: string) {
  const plan = await planOf(userId);
  const open = await openCommitments(userId);
  const [active] = await db.select({ id: coachingSessions.id, attribute: coachingSessions.attribute }).from(coachingSessions)
    .where(and(eq(coachingSessions.userId, userId), eq(coachingSessions.status, 'active'))).limit(1);
  return { attributes: plan.map((a) => a.name), openCommitments: open.slice(0, 3).map(commitmentView), active: active ?? null };
}
