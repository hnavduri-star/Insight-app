import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { and, avg, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cachedLessons, cpdRecords, lessonTime, scenarios, toolProgress, topicProgress, topics, users } from '../db/schema.js';
import { requireAuth } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';
import { requireTopicAccess } from '../lib/access.js';
import { type Bite } from '../lib/ai.js';
import { recordActivity } from '../lib/activity.js';
import { bestQuestionScore, CPD_MIN_MINUTES, PASS_MARK, percent, uuid } from './bites.js';

/**
 * CPD: each completed module (every tool with its questions and practice, the mixed questions, the scenario
 * and a reflection) becomes a CPD record with a certificate and a public verification code.
 */
export const cpdRoutes = Router();
cpdRoutes.use(requireAuth);

export const PLANNED_MINUTES = 60;
const newCode = () => Array.from(crypto.randomBytes(8), (b) => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[b % 31]).join('');

const completeInput = z.object({
  lessonId: z.string(),
  reflection: z.string().trim().min(40, 'Write at least a couple of sentences about what you learned').max(1500),
  applyPlan: z.string().trim().max(400).optional(),
});

/** Finishes a module: checks every step is done, then records the CPD evidence. Idempotent per module. */
cpdRoutes.post('/complete', async (req, res) => {
  const body = completeInput.parse(req.body);
  const userId = req.userId!;
  const [l] = await db.select().from(cachedLessons).where(eq(cachedLessons.id, uuid(body.lessonId, 'Module')));
  if (!l) throw new HttpError(404, 'Module not found');
  await requireTopicAccess(userId, l.topicId);
  const [existing] = await db.select().from(cpdRecords).where(and(eq(cpdRecords.userId, userId), eq(cpdRecords.lessonId, l.id)));
  if (existing) return void res.json(view(existing));

  const bite = l.contentJson as Bite;
  const mastery = l.ratingBand === 'mastery';
  const tools = await db.select().from(toolProgress).where(and(eq(toolProgress.userId, userId), eq(toolProgress.lessonId, l.id)));
  if (bite.tools.some((_, i) => !tools.find((t) => t.toolIndex === i)?.completedAt)) throw new HttpError(409, 'Work through every tool first.', 'tools_incomplete');
  const [tp] = await db.select().from(topicProgress).where(and(eq(topicProgress.userId, userId), eq(topicProgress.topicId, l.topicId)));
  if (mastery ? !tp?.masteryCompletedAt : !tp?.quizCompletedAt) throw new HttpError(409, 'Answer the mixed questions first.', 'quiz_first');
  const [sc] = await db.select({ best: sql<number | null>`max(${scenarios.score})` }).from(scenarios).where(and(eq(scenarios.userId, userId), eq(scenarios.lessonId, l.id)));
  if (sc?.best == null) throw new HttpError(409, 'Answer the scenario first.', 'scenario_first');

  const [time] = await db.select({ s: lessonTime.seconds }).from(lessonTime).where(and(eq(lessonTime.userId, userId), eq(lessonTime.lessonId, l.id)));
  const activeMinutes = Math.floor((time?.s ?? 0) / 60);
  if (activeMinutes < CPD_MIN_MINUTES) {
    throw new HttpError(409, `A CPD certificate needs at least ${CPD_MIN_MINUTES} minutes of active learning in this module. You have ${activeMinutes} so far: revisit the tools and their case studies.`, 'time_short');
  }
  const score = await bestQuestionScore(userId, l);
  if (!score || percent(score) < PASS_MARK) {
    throw new HttpError(409, `The pass mark is ${PASS_MARK}%. Your best on the questions is ${score ? percent(score) : 0}%: retake them to pass.`, 'below_pass_mark');
  }
  if (sc.best < PASS_MARK) throw new HttpError(409, `The scenario needs ${PASS_MARK} or more. Your best is ${sc.best}: try it again using the feedback.`, 'scenario_below_pass');
  const questionsCorrect = score.correct, questionsTotal = score.total;
  const [pa] = await db.select({ a: avg(toolProgress.score) }).from(toolProgress).where(and(eq(toolProgress.userId, userId), eq(toolProgress.lessonId, l.id), isNotNull(toolProgress.score)));
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
  const [t] = await db.select({ name: topics.name }).from(topics).where(eq(topics.id, l.topicId));

  let row: typeof cpdRecords.$inferSelect | undefined;
  for (let i = 0; i < 4 && !row; i++) {
    try {
      [row] = await db.insert(cpdRecords).values({
        userId, topicId: l.topicId, lessonId: l.id, code: newCode(), learnerName: u.name, topicName: t.name, level: mastery ? 'mastery' : 'foundations',
        title: bite.title, outcomesJson: bite.outcomes, toolsJson: bite.tools.map((x) => x.name), plannedMinutes: PLANNED_MINUTES,
        activeMinutes, questionsCorrect, questionsTotal,
        practiceAvg: pa?.a == null ? null : Math.round(Number(pa.a)), scenarioScore: sc.best, reflection: body.reflection, applyPlan: body.applyPlan || null,
      }).onConflictDoNothing({ target: [cpdRecords.userId, cpdRecords.lessonId] }).returning();
      if (!row) [row] = await db.select().from(cpdRecords).where(and(eq(cpdRecords.userId, userId), eq(cpdRecords.lessonId, l.id)));
    } catch (e) { if (i === 3) throw e; } // a code collision: try another code
  }
  await recordActivity(userId, 'cpd', { topicId: l.topicId, xp: 50 });
  res.json(view(row!));
});

const view = (r: typeof cpdRecords.$inferSelect) => ({
  id: r.id, code: r.code, learnerName: r.learnerName, topicId: r.topicId, topicName: r.topicName, level: r.level, title: r.title,
  outcomes: r.outcomesJson as string[], tools: r.toolsJson as string[], plannedMinutes: r.plannedMinutes, activeMinutes: r.activeMinutes,
  questionsCorrect: r.questionsCorrect, questionsTotal: r.questionsTotal, practiceAvg: r.practiceAvg, scenarioScore: r.scenarioScore,
  reflection: r.reflection, applyPlan: r.applyPlan, completedAt: r.completedAt,
});

/** The learner's CPD log with totals. */
cpdRoutes.get('/', async (req, res) => {
  const rows = await db.select().from(cpdRecords).where(eq(cpdRecords.userId, req.userId!)).orderBy(desc(cpdRecords.completedAt));
  const year = new Date().getFullYear();
  const thisYear = rows.filter((r) => new Date(r.completedAt).getFullYear() === year);
  res.json({
    records: rows.map(view),
    totals: {
      modules: rows.length, plannedHours: rows.reduce((a, r) => a + r.plannedMinutes, 0) / 60, activeMinutes: rows.reduce((a, r) => a + r.activeMinutes, 0),
      thisYear: { year, modules: thisYear.length, plannedHours: thisYear.reduce((a, r) => a + r.plannedMinutes, 0) / 60 },
    },
  });
});

const csvCell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

/** CPD log as a CSV file (for a CPD portfolio or an employer). */
cpdRoutes.get('/export.csv', async (req, res) => {
  const rows = await db.select().from(cpdRecords).where(eq(cpdRecords.userId, req.userId!)).orderBy(desc(cpdRecords.completedAt));
  const csv = toCsv([
    ['Date completed', 'Learner', 'Topic', 'Level', 'Module', 'CPD hours (planned)', 'Active minutes recorded', 'Questions correct', 'Practice average', 'Scenario score', 'Learning outcomes', 'Reflection', 'How I will apply it', 'Verification code'],
    ...rows.map((r) => [new Date(r.completedAt).toISOString().slice(0, 10), r.learnerName, r.topicName, r.level, r.title, (r.plannedMinutes / 60).toFixed(1), r.activeMinutes,
      `${r.questionsCorrect}/${r.questionsTotal}`, r.practiceAvg ?? '', r.scenarioScore ?? '', (r.outcomesJson as string[]).join(' | '), r.reflection, r.applyPlan ?? '', r.code]),
  ]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="insight-cpd-log.csv"');
  res.send('﻿' + csv);
});

cpdRoutes.get('/:id', async (req, res) => {
  const [r] = await db.select().from(cpdRecords).where(and(eq(cpdRecords.id, uuid(req.params.id, 'Certificate')), eq(cpdRecords.userId, req.userId!)));
  if (!r) throw new HttpError(404, 'Certificate not found');
  res.json(view(r));
});

/** Public: anyone with a certificate's code can check it's genuine. Shows no answers or reflections. */
export const verifyRoutes = Router();
verifyRoutes.get('/:code', async (req, res) => {
  const code = String(req.params.code).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  const [r] = await db.select().from(cpdRecords).where(eq(cpdRecords.code, code));
  if (!r) throw new HttpError(404, 'No certificate matches this code.', 'not_found');
  res.json({ code: r.code, learnerName: r.learnerName, topicName: r.topicName, level: r.level, title: r.title, outcomes: r.outcomesJson,
    plannedMinutes: r.plannedMinutes, activeMinutes: r.activeMinutes, completedAt: r.completedAt });
});
