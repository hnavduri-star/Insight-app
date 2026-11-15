import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { people, situations, topics } from '../db/schema.js';
import { requireAuth } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';
import { generateSituation, gradeScenario, type Plan } from '../lib/ai.js';
import { runJob } from '../lib/jobs.js';
import { recordActivity } from '../lib/activity.js';
import { PERSONAS, RELATIONSHIPS } from '../../../shared/options.js';
import { checkLimit, learnerKey, responseInput, uuid } from './bites.js';

/** "I have a situation": a prep plan for a real upcoming moment, plus a coached rehearsal. */
export const situationRoutes = Router();
situationRoutes.use(requireAuth);

const situationInput = z.object({ text: z.string().trim().min(15, 'Describe the situation in a sentence or two').max(600, 'Keep it under 600 characters') });

situationRoutes.post('/', async (req, res) => {
  const { text } = situationInput.parse(req.body);
  const userId = req.userId!;
  const hash = crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
  const r = await runJob(`situation:${userId}:${hash}`, async () => {
    const [anyTopic] = await db.select({ id: topics.id }).from(topics).limit(1);
    const { profile, goals } = await learnerKey(userId, anyTopic.id);
    const topicNames = (await db.select({ name: topics.name }).from(topics).orderBy(asc(topics.name))).map((t) => t.name);
    const myPeople = await db.select().from(people).where(eq(people.userId, userId)).limit(8);
    const plan = await generateSituation(userId, {
      text, persona: PERSONAS.find((x) => x.value === profile.persona)!.label, industry: profile.industry!, goals, topics: topicNames,
      people: myPeople.map((p) => ({ name: p.name, relationship: RELATIONSHIPS.find((x) => x.value === p.relationship)?.label ?? p.relationship,
        traits: p.traitsJson as string[], notes: p.notes })),
    });
    const [row] = await db.insert(situations).values({ userId, inputText: text, planJson: plan }).returning({ id: situations.id });
    return row.id;
  }, () => checkLimit(userId, 'situation'));
  if (!r.done) return void res.status(202).json({ status: 'generating' });
  res.json(await load(userId, r.result));
});

async function load(userId: string, id: string) {
  const [s] = await db.select().from(situations).where(and(eq(situations.id, id), eq(situations.userId, userId)));
  if (!s) throw new HttpError(404, 'Situation not found');
  const plan = s.planJson as Plan;
  // Link suggested topics to their pages.
  const names = plan.topics.map((t) => t.name);
  const ids = names.length ? await db.select({ id: topics.id, name: topics.name }).from(topics).where(sql`${topics.name} in ${names}`) : [];
  return { id: s.id, text: s.inputText, createdAt: s.createdAt, bestScore: s.bestScore,
    plan: { ...plan, topics: plan.topics.map((t) => ({ ...t, id: ids.find((x) => x.name === t.name)?.id ?? null })) } };
}

situationRoutes.get('/', async (req, res) => {
  const rows = await db.select({ id: situations.id, text: situations.inputText, plan: situations.planJson, bestScore: situations.bestScore, createdAt: situations.createdAt })
    .from(situations).where(eq(situations.userId, req.userId!)).orderBy(desc(situations.createdAt)).limit(10);
  res.json(rows.map((r) => ({ id: r.id, text: r.text, title: (r.plan as Plan).title, bestScore: r.bestScore, createdAt: r.createdAt })));
});

situationRoutes.get('/:id', async (req, res) => { res.json(await load(req.userId!, uuid(req.params.id, 'Situation'))); });

situationRoutes.post('/:id/rehearse', async (req, res) => {
  const { response } = responseInput.parse(req.body);
  const userId = req.userId!;
  const s = await load(userId, uuid(req.params.id, 'Situation'));
  await checkLimit(userId, 'grade');
  const tools = s.plan.steps.map((x) => ({ name: x.tool, idea: x.how }));
  const grade = await gradeScenario(userId, { framework: s.plan.goal, tools, scenario: s.plan.rehearsal, response });
  const names = new Set(tools.map((t) => t.name));
  grade.toolsUsed = grade.toolsUsed.filter((n) => names.has(n));
  await recordActivity(userId, 'situation', { score: grade.score, xp: 20 });
  await db.update(situations).set({ bestScore: sql`greatest(coalesce(${situations.bestScore}, 0), ${grade.score})` }).where(eq(situations.id, s.id));
  res.json(grade);
});
