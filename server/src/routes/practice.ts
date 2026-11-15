import { Router } from 'express';
import { and, asc, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { people, practiceReps, topics } from '../db/schema.js';
import { requireAuth } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';
import { requireTopicAccess } from '../lib/access.js';
import { generateReps, gradeScenario, type Bite, type Rep } from '../lib/ai.js';
import { runJob } from '../lib/jobs.js';
import { RELATIONSHIPS, PERSONAS } from '../../../shared/options.js';
import { checkLimit, learnerKey, readyToolkit, responseInput, trackFor, uuid } from './bites.js';

/** Level 2: practice reps. Short coached drills, generated 5 at a time, answered one at a time. */
export const practiceRoutes = Router();
practiceRoutes.use(requireAuth);

const view = (r: typeof practiceReps.$inferSelect) => ({ id: r.id, ...(r.repJson as Rep) });

/** The next unanswered rep for this topic, generating a new batch of 5 when they run out. */
practiceRoutes.post('/next', async (req, res) => {
  const topicId = uuid(req.body?.topicId, 'Topic');
  const userId = req.userId!;
  await requireTopicAccess(userId, topicId);
  const toolkit = await readyToolkit(userId, topicId);
  if (!toolkit) throw new HttpError(409, 'Open the toolkit for this topic first; practice reps use its tools.', 'toolkit_first');

  const nextRep = async () => (await db.select().from(practiceReps)
    .where(and(eq(practiceReps.userId, userId), eq(practiceReps.topicId, topicId), isNull(practiceReps.answeredAt)))
    .orderBy(asc(practiceReps.createdAt)).limit(1))[0];
  let rep = await nextRep();
  if (!rep) {
    const r = await runJob(`reps:${userId}:${topicId}`, async () => {
      const bite = toolkit.contentJson as Bite;
      const { goals, profile } = await learnerKey(userId, topicId);
      const [t] = await db.select({ name: topics.name, description: topics.description }).from(topics).where(eq(topics.id, topicId));
      const myPeople = await db.select().from(people).where(eq(people.userId, userId)).limit(8);
      const earlier = await db.select({ j: practiceReps.repJson }).from(practiceReps)
        .where(and(eq(practiceReps.userId, userId), eq(practiceReps.topicId, topicId))).orderBy(desc(practiceReps.createdAt)).limit(10);
      const reps = await generateReps(userId, {
        topic: t.name, scope: t.description, tools: bite.tools.map((x) => ({ name: x.name, idea: x.idea })),
        persona: PERSONAS.find((x) => x.value === profile.persona)!.label, industry: profile.industry!, goals,
        people: myPeople.map((p) => ({ name: p.name, relationship: RELATIONSHIPS.find((x) => x.value === p.relationship)?.label ?? p.relationship,
          traits: p.traitsJson as string[], notes: p.notes })),
        avoid: earlier.map((e) => (e.j as Rep).situation),
      });
      const byName = new Map(myPeople.map((p) => [p.name.toLowerCase(), p.id]));
      await db.insert(practiceReps).values(reps.map((x) => ({
        userId, topicId, lessonId: toolkit.id, repJson: x, personId: x.with ? byName.get(x.with.toLowerCase()) ?? null : null,
      })));
    }, () => checkLimit(userId, 'reps'));
    if (!r.done) return void res.status(202).json({ status: 'generating' });
    rep = await nextRep();
    if (!rep) throw new HttpError(502, "We couldn't create practice reps just now. Please try again.", 'ai_invalid');
  }
  res.json({ rep: view(rep), track: await trackFor(userId, topicId) });
});

/** Coach feedback on one rep. */
practiceRoutes.post('/:repId/answer', async (req, res) => {
  const { response } = responseInput.parse(req.body);
  const userId = req.userId!;
  const [rep] = await db.select().from(practiceReps).where(and(eq(practiceReps.id, uuid(req.params.repId, 'Rep')), eq(practiceReps.userId, userId)));
  if (!rep) throw new HttpError(404, 'Rep not found');
  await requireTopicAccess(userId, rep.topicId);
  const toolkit = await readyToolkit(userId, rep.topicId);
  const bite = toolkit?.contentJson as Bite | undefined;
  const tools = bite?.tools.map((t) => ({ name: t.name, idea: t.idea })) ?? (rep.repJson as Rep).tools.map((n) => ({ name: n, idea: n }));
  await checkLimit(userId, 'grade');
  const r = rep.repJson as Rep;
  const grade = await gradeScenario(userId, { framework: bite?.framework ?? '', tools, scenario: `${r.situation} ${r.ask}`, response });
  const names = new Set(tools.map((t) => t.name));
  grade.toolsUsed = grade.toolsUsed.filter((n) => names.has(n));
  await db.update(practiceReps).set({ responseText: response, gradeJson: grade, score: grade.score, answeredAt: new Date() }).where(eq(practiceReps.id, rep.id));
  res.json({ grade, track: await trackFor(userId, rep.topicId) });
});

/** Answered reps for a topic, newest first (for reviewing past practice). */
practiceRoutes.get('/history/:topicId', async (req, res) => {
  const topicId = uuid(req.params.topicId, 'Topic');
  const rows = await db.select().from(practiceReps)
    .where(and(eq(practiceReps.userId, req.userId!), eq(practiceReps.topicId, topicId), isNotNull(practiceReps.answeredAt)))
    .orderBy(desc(practiceReps.answeredAt)).limit(30);
  res.json(rows.map((r) => ({ ...view(r), response: r.responseText, score: r.score, answeredAt: r.answeredAt })));
});
