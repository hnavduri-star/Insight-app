import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { people, roleplaySessions, topics } from '../db/schema.js';
import { requireAuth } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';
import { requirePremium, requireTopicAccess } from '../lib/access.js';
import {
  generateRoleplaySetup, roleplayDebrief, roleplayHint, roleplayTurn, type Bite, type Debrief, type Difficulty, type RoleplaySetup, type Turn,
} from '../lib/ai.js';
import { runJob } from '../lib/jobs.js';
import { recordActivity } from '../lib/activity.js';
import { scheduleCheckin } from './checkins.js';
import { PERSONAS, RELATIONSHIPS } from '../../../shared/options.js';
import { checkLimit, learnerKey, readyToolkit, trackFor, uuid } from './bites.js';

/** Level 3: multi-turn role-play with a stock character or one of the learner's people, then a debrief. */
export const roleplayRoutes = Router();
roleplayRoutes.use(requireAuth);

export const CHARACTERS = [
  { id: 'boss', label: 'Your boss', relationship: 'Boss / line manager', notes: 'Busy, focused on results and their own targets.' },
  { id: 'client', label: 'Difficult client', relationship: 'Client', notes: 'Unhappy about something, worried about value for money.' },
  { id: 'investor', label: 'Skeptical investor', relationship: 'Investor or board member', notes: 'Probing, wants evidence and a clear answer.' },
  { id: 'report', label: 'Team member who missed a deadline', relationship: 'Direct report', notes: 'Defensive at first, has reasons they have not shared.' },
  { id: 'interviewer', label: 'Interviewer', relationship: 'Interviewer for a role the learner wants', notes: 'Tests for specifics and self-awareness.' },
  { id: 'negotiator', label: 'Negotiation counterpart', relationship: 'Counterpart in a negotiation', notes: 'Wants the best deal for their side.' },
  { id: 'colleague', label: 'Colleague in conflict', relationship: 'Peer colleague', notes: 'Frustrated about a shared project, feels unheard.' },
] as const;
export const DIFFICULTIES: { value: Difficulty; label: string; hint: string }[] = [
  { value: 'friendly', label: 'Friendly', hint: 'Open and cooperative' },
  { value: 'realistic', label: 'Realistic', hint: 'Busy, pushes back a little' },
  { value: 'tough', label: 'Tough', hint: 'Firm and sceptical, but respectful' },
];
const MAX_TURNS = 6;   // learner turns per conversation
const MIN_TO_DEBRIEF = 2;

type Row = typeof roleplaySessions.$inferSelect;
const learnerTurns = (t: Turn[]) => t.filter((x) => x.who === 'learner').length;

/** What the client sees. The character's hidden objective stays on the server until the debrief reveals it. */
function view(r: Row, personName: string | null = null) {
  const { hiddenObjective: _hidden, ...setup } = r.setupJson as RoleplaySetup;
  const transcript = r.transcriptJson as Turn[];
  return {
    id: r.id, topicId: r.topicId, status: r.status, difficulty: r.difficulty, character: r.character, personId: r.personId, personName,
    maxTurns: r.maxTurns, turnsUsed: learnerTurns(transcript), canDebrief: learnerTurns(transcript) >= MIN_TO_DEBRIEF,
    setup, transcript, debrief: r.debriefJson as Debrief | null, score: r.score, createdAt: r.createdAt,
  };
}

async function own(userId: string, id: string) {
  const [r] = await db.select().from(roleplaySessions).where(and(eq(roleplaySessions.id, uuid(id, 'Role-play')), eq(roleplaySessions.userId, userId)));
  if (!r) throw new HttpError(404, 'Role-play not found');
  return r;
}

async function toolsFor(userId: string, topicId: string) {
  const toolkit = await readyToolkit(userId, topicId);
  if (!toolkit) throw new HttpError(409, 'Role-play opens after you finish Foundations. Open the toolkit first.', 'foundations_first');
  return (toolkit.contentJson as Bite).tools.map((t) => ({ name: t.name, idea: t.idea }));
}

async function requireLevel3(userId: string, topicId: string) {
  await requireTopicAccess(userId, topicId);
  await requirePremium(userId);
  const t = await trackFor(userId, topicId);
  if (!t.roleplay.unlocked) {
    throw new HttpError(409, t.roleplay.needsToolkit ? 'Role-play opens after you finish Foundations: the tools and the quiz.'
      : `Role-play opens after ${t.roleplay.needsReps} more practice rep${t.roleplay.needsReps === 1 ? '' : 's'}.`, t.roleplay.needsToolkit ? 'foundations_first' : 'locked');
  }
}

/** Who you can practise with on this topic, and the difficulty levels. */
roleplayRoutes.get('/options/:topicId', async (req, res) => {
  const topicId = uuid(req.params.topicId, 'Topic');
  const userId = req.userId!;
  await requireTopicAccess(userId, topicId);
  const mine = await db.select().from(people).where(eq(people.userId, userId)).orderBy(asc(people.createdAt));
  const recent = await db.select().from(roleplaySessions).where(and(eq(roleplaySessions.userId, userId), eq(roleplaySessions.topicId, topicId)))
    .orderBy(desc(roleplaySessions.createdAt)).limit(10);
  res.json({
    characters: CHARACTERS.map(({ id, label, notes }) => ({ id, label, notes })),
    people: mine.map((p) => ({ id: p.id, name: p.name, relationship: RELATIONSHIPS.find((x) => x.value === p.relationship)?.label ?? p.relationship })),
    difficulties: DIFFICULTIES, maxTurns: MAX_TURNS,
    recent: recent.map((r) => ({ id: r.id, title: (r.setupJson as RoleplaySetup).title, status: r.status, score: r.score, createdAt: r.createdAt })),
    track: await trackFor(userId, topicId),
  });
});

const startInput = z.union([
  z.object({ replayOf: z.string() }),
  z.object({
    topicId: z.string(), difficulty: z.enum(['friendly', 'realistic', 'tough']),
    personId: z.string().optional(), character: z.enum(CHARACTERS.map((c) => c.id) as [string, ...string[]]).optional(),
  }).refine((b) => !!b.personId !== !!b.character, 'Choose a character or one of your people'),
]);

/** Starts a role-play: writes the setup card (in the background). Or replays an earlier one with the same setup. */
roleplayRoutes.post('/start', async (req, res) => {
  const body = startInput.parse(req.body);
  const userId = req.userId!;
  if ('replayOf' in body) {
    const prev = await own(userId, body.replayOf);
    await requireLevel3(userId, prev.topicId);
    await checkLimit(userId, 'roleplay_debrief'); // replays reuse the setup; the debrief limit caps them
    const setup = prev.setupJson as RoleplaySetup;
    const [row] = await db.insert(roleplaySessions).values({
      userId, topicId: prev.topicId, character: prev.character, personId: prev.personId, difficulty: prev.difficulty,
      setupJson: setup, maxTurns: MAX_TURNS, transcriptJson: [{ who: 'character', text: setup.opening }],
    }).returning();
    return void res.json(view(row, await personName(row.personId)));
  }
  const topicId = uuid(body.topicId, 'Topic');
  await requireLevel3(userId, topicId);
  const tools = await toolsFor(userId, topicId);
  let person: typeof people.$inferSelect | undefined;
  if (body.personId) {
    [person] = await db.select().from(people).where(and(eq(people.id, uuid(body.personId, 'Person')), eq(people.userId, userId)));
    if (!person) throw new HttpError(404, 'Person not found');
  }
  const who = person?.id ?? body.character!;
  const r = await runJob(`rpstart:${userId}:${topicId}:${who}:${body.difficulty}`, async () => {
    const { profile, goals } = await learnerKey(userId, topicId);
    const [t] = await db.select({ name: topics.name }).from(topics).where(eq(topics.id, topicId));
    const stock = CHARACTERS.find((c) => c.id === body.character);
    const counterpart = person
      ? { name: person.name, relationship: RELATIONSHIPS.find((x) => x.value === person!.relationship)?.label ?? person.relationship,
          traits: person.traitsJson as string[], notes: [person.notes, person.practiceGoal && `The learner wants to practise: ${person.practiceGoal}`].filter(Boolean).join('. ') || null }
      : { relationship: stock!.relationship, traits: [], notes: stock!.notes };
    const setup = await generateRoleplaySetup(userId, {
      topic: t.name, tools, persona: PERSONAS.find((x) => x.value === profile.persona)!.label, industry: profile.industry!, goals, counterpart, difficulty: body.difficulty,
    });
    const [row] = await db.insert(roleplaySessions).values({
      userId, topicId, character: person ? 'person' : body.character!, personId: person?.id ?? null, difficulty: body.difficulty,
      setupJson: setup, maxTurns: MAX_TURNS, transcriptJson: [{ who: 'character', text: setup.opening }],
    }).returning();
    return row;
  }, () => checkLimit(userId, 'roleplay'));
  if (!r.done) return void res.status(202).json({ status: 'generating' });
  res.json(view(r.result, person?.name ?? null));
});

async function personName(id: string | null) {
  if (!id) return null;
  const [p] = await db.select({ name: people.name }).from(people).where(eq(people.id, id));
  return p?.name ?? null;
}

roleplayRoutes.get('/:id', async (req, res) => {
  const r = await own(req.userId!, req.params.id);
  res.json(view(r, await personName(r.personId)));
});

const turnInput = z.object({
  message: z.string().trim().min(2, 'Say something to continue').max(600, 'Keep each line under 600 characters'),
  turn: z.number().int().min(0).max(20), // how many lines the learner had already sent: makes retries safe
});

/** The learner says one line; the character replies in character. */
roleplayRoutes.post('/:id/turn', async (req, res) => {
  const { message, turn } = turnInput.parse(req.body);
  const userId = req.userId!;
  const row = await own(userId, req.params.id);
  const done = learnerTurns(row.transcriptJson as Turn[]);
  if (turn < done) return void res.json(view(row, await personName(row.personId))); // already answered (a retry)
  if (row.status !== 'active') throw new HttpError(409, 'This conversation has ended. Get your debrief.', 'roleplay_over');
  if (turn > done) throw new HttpError(409, 'The conversation moved on. Refresh to continue.', 'out_of_sync');
  await requireLevel3(userId, row.topicId);
  const r = await runJob(`rpturn:${row.id}:${turn}`, async () => {
    const transcript: Turn[] = [...(row.transcriptJson as Turn[]), { who: 'learner', text: message }];
    const turnsLeft = row.maxTurns - learnerTurns(transcript);
    const reply = await roleplayTurn(userId, { setup: row.setupJson as RoleplaySetup, difficulty: row.difficulty, transcript, turnsLeft });
    if (reply.stepOut) {
      // The learner seems genuinely distressed: pause the role-play with care rather than carry on.
      transcript.push({ who: 'coach', text: reply.careNote || "Let's pause here. If this is weighing on you, it may help to talk to someone you trust." });
    } else transcript.push({ who: 'character', text: reply.reply });
    const status = reply.stepOut || turnsLeft <= 0 ? 'finished' : 'active';
    const [u] = await db.update(roleplaySessions).set({ transcriptJson: transcript, status, endedAt: status === 'finished' ? new Date() : null })
      .where(eq(roleplaySessions.id, row.id)).returning();
    return { row: u, paused: reply.stepOut };
  }, () => checkLimit(userId, 'roleplay_turn'));
  if (!r.done) return void res.status(202).json({ status: 'generating' });
  res.json({ ...view(r.result.row, await personName(row.personId)), paused: r.result.paused });
});

/** The coach steps out of character with one hint for the next line. */
roleplayRoutes.post('/:id/hint', async (req, res) => {
  const userId = req.userId!;
  const row = await own(userId, req.params.id);
  if (row.status !== 'active') throw new HttpError(409, 'This conversation has ended.', 'roleplay_over');
  await requireLevel3(userId, row.topicId);
  await checkLimit(userId, 'roleplay_hint');
  const transcript = row.transcriptJson as Turn[];
  const hint = await roleplayHint(userId, { setup: row.setupJson as RoleplaySetup, transcript, tools: await toolsFor(userId, row.topicId) });
  await db.update(roleplaySessions).set({ transcriptJson: [...transcript, { who: 'coach', text: hint }] }).where(eq(roleplaySessions.id, row.id));
  res.json({ hint });
});

/** Ends the conversation (if still going) and scores it against the topic's tools. */
roleplayRoutes.post('/:id/debrief', async (req, res) => {
  const userId = req.userId!;
  const row = await own(userId, req.params.id);
  if (row.status === 'debriefed') return void res.json(view(row, await personName(row.personId)));
  const transcript = row.transcriptJson as Turn[];
  if (learnerTurns(transcript) < MIN_TO_DEBRIEF) throw new HttpError(409, `Say at least ${MIN_TO_DEBRIEF} lines before the debrief.`, 'too_short');
  await requireTopicAccess(userId, row.topicId);
  const r = await runJob(`rpdebrief:${row.id}`, async () => {
    const debrief = await roleplayDebrief(userId, { setup: row.setupJson as RoleplaySetup, transcript, tools: await toolsFor(userId, row.topicId) });
    const [u] = await db.update(roleplaySessions).set({ status: 'debriefed', debriefJson: debrief, score: debrief.score, rubricScoresJson: debrief.rubric, endedAt: row.endedAt ?? new Date() })
      .where(eq(roleplaySessions.id, row.id)).returning();
    await recordActivity(userId, 'roleplay', { topicId: row.topicId, score: debrief.score, xp: 30 });
    await scheduleCheckin({ userId, kind: 'roleplay', sourceId: row.id, topicId: row.topicId, title: (row.setupJson as RoleplaySetup).title,
      withName: row.personId ? await personName(row.personId) : null, afterHours: 20 });
    return u;
  }, () => checkLimit(userId, 'roleplay_debrief'));
  if (!r.done) return void res.status(202).json({ status: 'generating' });
  res.json(view(r.result, await personName(row.personId)));
});
