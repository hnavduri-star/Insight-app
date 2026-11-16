import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';

const ai = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error { status = 500; }
  class RateLimitError extends APIError { status = 429; }
  class AuthenticationError extends APIError { status = 401; }
  async function* events(msg: any) {
    yield { type: 'message_start', message: { model: 'claude-sonnet-5-5', usage: { input_tokens: 500, output_tokens: 1 } } };
    yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
    yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: JSON.stringify(msg) } };
    yield { type: 'content_block_stop', index: 0 };
    yield { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 400 } };
    yield { type: 'message_stop' };
  }
  class Anthropic {
    beta = { messages: { create: async (params: any) => events(await ai(params)) } };
    static APIError = APIError; static RateLimitError = RateLimitError; static AuthenticationError = AuthenticationError;
  }
  return { default: Anthropic };
});

const { createApp } = await import('../src/app.js');
const { pool } = await import('../src/db/client.js');
const { advanceStreak, currentStreak } = await import('../src/lib/activity.js');
const { nextInterval } = await import('../src/routes/daily.js');
const app = createApp();

const toolkit = () => ({
  title: 'Toolkit', framework: 'F',
  tools: Array.from({ length: 6 }, (_, i) => ({ name: `Tool ${i}`, source: 'Getting to Yes', idea: `Idea ${i}`, steps: ['a', 'b'], say: ['x'], caseStudy: { situation: 's', action: 'a', result: 'r' }, tryThis: 't', check: { q: `Check ${i}`, options: ['a', 'b', 'c', 'd'], answer: 2, why: 'w' } })),
  quiz: Array.from({ length: 3 }, (_, i) => ({ q: `Q${i}`, options: ['a', 'b', 'c', 'd'], answer: 0, why: 'w' })), scenario: 'S',
});
const reps = () => ({ reps: Array.from({ length: 5 }, (_, i) => ({ situation: `Situation ${i}`, ask: 'Say?', tools: ['Tool 1'], with: null })) });
const setup = () => ({ title: 'Pay rise talk', characterName: 'Raj', characterRole: 'Your boss', situation: 'Review time.', yourGoal: 'Agree a raise.',
  hiddenObjective: 'SECRET budget freeze until Q3', skills: ['Tool 1', 'Tool 2', 'Invented'], opening: 'You wanted to talk?' });
let turnReply: any = { reply: 'Go on.', stepOut: false, careNote: null };

beforeEach(async () => {
  await pool.query('delete from users; delete from cached_lessons; delete from ai_calls');
  ai.mockReset();
  turnReply = { reply: 'Go on.', stepOut: false, careNote: null };
  ai.mockImplementation(async (p: any) => {
    if (p.system.includes('design realistic workplace')) return setup();
    if (p.system.includes('You are playing')) return turnReply;
    if (p.system.includes('Step out of the role-play for a moment')) return { hint: 'Ask what is behind the hesitation.' };
    if (p.system.includes('debrief the learner')) return { score: 140, rubric: { clarity: 80, empathy: 60, structure: 70, tools: 65 }, wentWell: 'w', improve: 'i',
      betterMove: { yourLine: 'I want more', tryInstead: 'Could we look at the scope?' }, toolsUsed: ['Tool 1', 'Fake'], revealed: 'Budget freeze.' };
    if (p.system.includes('practice designer')) return reps();
    if (p.system.includes('score a learner')) return { score: 72, feedback: 'f', strength: 's', improve: 'i', toolsUsed: [], modelAnswer: 'm' };
    return toolkit();
  });
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  process.env.OPEN_ACCESS = 'true';
});
afterEach(() => { process.env.OPEN_ACCESS = ''; });
afterAll(async () => { delete process.env.ANTHROPIC_API_KEY; await pool.end(); });

async function learner(email = 'rp@example.com', tz = 'Asia/Dubai') {
  const a = request.agent(app);
  const r = await a.post('/api/auth/signup').send({ name: 'L', email, password: 'secret1', timezone: tz });
  await a.post('/api/me/onboarding').send({ persona: 'manager', industry: 'Technology', goals: ['Get promoted'], dailyMinutes: 10, coach: 'maya', timezone: tz });
  const person = (await a.post('/api/people').send({ name: 'Raj', relationship: 'boss', traits: ['Direct'] })).body;
  const topic = (await a.get('/api/topics')).body.flatMap((c: any) => c.topics).find((t: any) => t.name === 'Negotiation Fundamentals');
  await a.post('/api/me/free-topic').send({ topicId: topic.id });
  return { a, id: r.body.id as string, topic, person };
}
async function foundations(a: any, topicId: string) {
  const { lessonId } = (await a.post('/api/bites').send({ topicId })).body;
  await a.post(`/api/bites/${lessonId}/progress`).send({ stage: 'cards' });
  await a.post(`/api/bites/${lessonId}/progress`).send({ stage: 'quiz', correct: 4 });
  await a.post(`/api/bites/${lessonId}/scenario`).send({ response: 'I would acknowledge their concern first, then propose two options and agree a next step.' });
  return lessonId as string;
}
async function doReps(a: any, topicId: string, n: number) {
  for (let i = 0; i < n; i++) {
    const { rep } = (await a.post('/api/practice/next').send({ topicId })).body;
    await a.post(`/api/practice/${rep.id}/answer`).send({ response: 'I would listen first and then propose a clear next step together.' });
  }
}

describe('streak rules', () => {
  const s = (streak: number, last: string | null, freezes = 1) => ({ streak, lastActiveDate: last, freezes });
  it('counts only the first activity of a day', () => {
    expect(advanceStreak(s(3, '2026-11-15'), '2026-11-15')).toMatchObject({ streak: 3, counted: false });
  });
  it('adds one when last active yesterday, including across a month end', () => {
    expect(advanceStreak(s(3, '2026-11-14'), '2026-11-15')).toMatchObject({ streak: 4, freezes: 1, usedFreeze: false });
    expect(advanceStreak(s(3, '2026-10-31'), '2026-11-01')).toMatchObject({ streak: 4 });
  });
  it('spends a freeze on a single missed day, otherwise resets to 1', () => {
    expect(advanceStreak(s(5, '2026-11-13', 1), '2026-11-15')).toMatchObject({ streak: 6, freezes: 0, usedFreeze: true });
    expect(advanceStreak(s(5, '2026-11-13', 0), '2026-11-15')).toMatchObject({ streak: 1, freezes: 0 });
    expect(advanceStreak(s(5, '2026-11-10', 2), '2026-11-15')).toMatchObject({ streak: 1, freezes: 2 });
    expect(advanceStreak(s(0, null, 1), '2026-11-15')).toMatchObject({ streak: 1, freezes: 1 });
  });
  it('earns a freeze at every 7-day milestone', () => {
    expect(advanceStreak(s(6, '2026-11-14', 0), '2026-11-15')).toMatchObject({ streak: 7, freezes: 1, earnedFreeze: true });
    expect(advanceStreak(s(13, '2026-11-14', 1), '2026-11-15')).toMatchObject({ streak: 14, freezes: 2 });
  });
  it('shows a broken streak as 0 until the next activity', () => {
    expect(currentStreak(s(5, '2026-11-14'), '2026-11-15')).toBe(5);
    expect(currentStreak(s(5, '2026-11-13', 1), '2026-11-15')).toBe(5);
    expect(currentStreak(s(5, '2026-11-13', 0), '2026-11-15')).toBe(0);
  });
  it('moves reviews up 1 → 3 → 7 → 21 and resets when wrong', () => {
    expect([nextInterval(1, true), nextInterval(3, true), nextInterval(7, true), nextInterval(21, true), nextInterval(7, false)]).toEqual([3, 7, 21, 21, 1]);
  });
});

describe('role-play (level 3)', () => {
  it('opens after Foundations plus 3 reps, and needs Premium', async () => {
    const { a, topic, person } = await learner();
    const early = await a.post('/api/roleplay/start').send({ topicId: topic.id, personId: person.id, difficulty: 'realistic' });
    expect(early.status).toBe(409);
    await foundations(a, topic.id);
    await doReps(a, topic.id, 2);
    const stillLocked = await a.post('/api/roleplay/start').send({ topicId: topic.id, character: 'boss', difficulty: 'tough' });
    expect(stillLocked.body.error).toMatch(/1 more practice rep/);
    await doReps(a, topic.id, 1);
    expect((await a.get(`/api/bites/track/${topic.id}`)).body.roleplay).toMatchObject({ unlocked: true, done: 0 });
    process.env.OPEN_ACCESS = '';
    const free = await a.post('/api/roleplay/start').send({ topicId: topic.id, character: 'boss', difficulty: 'tough' });
    expect(free.status).toBe(402);
  });

  it('runs a conversation with one of your people, keeps the hidden objective secret, and debriefs', async () => {
    const { a, topic, person } = await learner();
    await foundations(a, topic.id); await doReps(a, topic.id, 3);
    const s = await a.post('/api/roleplay/start').send({ topicId: topic.id, personId: person.id, difficulty: 'realistic' });
    expect(s.status).toBe(200);
    expect(JSON.stringify(s.body)).not.toContain('SECRET');
    expect(s.body.setup.skills).toEqual(['Tool 1', 'Tool 2']);
    expect(s.body.personName).toBe('Raj');
    expect(s.body.transcript).toEqual([{ who: 'character', text: 'You wanted to talk?' }]);
    const setupCall = ai.mock.calls.find((c) => c[0].system.includes('design realistic'))![0];
    expect(setupCall.messages[0].content).toContain('Raj');

    expect((await a.post(`/api/roleplay/${s.body.id}/debrief`).send({})).body.code).toBe('too_short');
    const t1 = await a.post(`/api/roleplay/${s.body.id}/turn`).send({ message: 'I want more', turn: 0 });
    expect(t1.body.turnsUsed).toBe(1);
    expect(t1.body.transcript.at(-1)).toEqual({ who: 'character', text: 'Go on.' });
    // A retry of the same turn is not sent twice.
    const retry = await a.post(`/api/roleplay/${s.body.id}/turn`).send({ message: 'I want more', turn: 0 });
    expect(retry.body.turnsUsed).toBe(1);
    const turnCall = ai.mock.calls.filter((c) => c[0].system.includes('You are playing')).at(-1)![0];
    expect(turnCall.messages[0].content).toContain('<learner>I want more</learner>');
    const hint = await a.post(`/api/roleplay/${s.body.id}/hint`).send({});
    expect(hint.body.hint).toMatch(/hesitation/);
    await a.post(`/api/roleplay/${s.body.id}/turn`).send({ message: 'What would make it work for you?', turn: 1 });

    const d = await a.post(`/api/roleplay/${s.body.id}/debrief`).send({});
    expect(d.body.status).toBe('debriefed');
    expect(d.body.score).toBe(100); // clamped
    expect(d.body.debrief.toolsUsed).toEqual(['Tool 1']);
    expect(d.body.debrief.revealed).toBe('Budget freeze.');
    expect((await a.get(`/api/bites/track/${topic.id}`)).body.roleplay).toMatchObject({ done: 1, best: 100 });
    // Replay keeps the setup and starts a fresh conversation without a new setup call.
    const before = ai.mock.calls.length;
    const replay = await a.post('/api/roleplay/start').send({ replayOf: s.body.id });
    expect(replay.body.setup.title).toBe('Pay rise talk');
    expect(replay.body.turnsUsed).toBe(0);
    expect(ai.mock.calls.length).toBe(before);
    // Someone else can't read it.
    const other = await learner('other@example.com');
    expect((await other.a.get(`/api/roleplay/${s.body.id}`)).status).toBe(404);
  });

  it('ends after 6 turns, and pauses with care when the learner seems distressed', async () => {
    const { a, topic } = await learner();
    await foundations(a, topic.id); await doReps(a, topic.id, 3);
    const s = (await a.post('/api/roleplay/start').send({ topicId: topic.id, character: 'client', difficulty: 'friendly' })).body;
    let last: any;
    for (let i = 0; i < 6; i++) last = (await a.post(`/api/roleplay/${s.id}/turn`).send({ message: `Line ${i}`, turn: i })).body;
    expect(last.status).toBe('finished');
    expect((await a.post(`/api/roleplay/${s.id}/turn`).send({ message: 'More', turn: 6 })).body.code).toBe('roleplay_over');

    const s2 = (await a.post('/api/roleplay/start').send({ topicId: topic.id, character: 'colleague', difficulty: 'tough' })).body;
    turnReply = { reply: '', stepOut: true, careNote: 'Let us pause. Please talk to someone you trust.' };
    const p = (await a.post(`/api/roleplay/${s2.id}/turn`).send({ message: 'Honestly I cannot cope with anything any more', turn: 0 })).body;
    expect(p.paused).toBe(true);
    expect(p.status).toBe('finished');
    expect(p.transcript.at(-1)).toEqual({ who: 'coach', text: 'Let us pause. Please talk to someone you trust.' });
  });
});

describe('daily return', () => {
  it('adds quiz questions to spaced review, counts the streak once a day, and summarises the week', async () => {
    const { a, topic } = await learner('daily@example.com', 'Pacific/Kiritimati');
    let d = (await a.get('/api/daily')).body;
    expect(d).toMatchObject({ streak: 0, freezes: 1, activeToday: false, reviews: [] });
    await foundations(a, topic.id);
    d = (await a.get('/api/daily')).body;
    expect(d).toMatchObject({ streak: 1, activeToday: true, reviewItems: 9, dueTotal: 0 }); // 6 tool questions + 3 quiz
    expect(d.rep).toMatchObject({ topicId: topic.id });
    // Re-taking the quiz does not add the questions twice.
    const { lessonId } = (await a.post('/api/bites').send({ topicId: topic.id })).body;
    await a.post(`/api/bites/${lessonId}/progress`).send({ stage: 'quiz', correct: 5 });
    expect((await a.get('/api/daily')).body.reviewItems).toBe(9);

    await pool.query("update review_items set due_at = now() - interval '1 hour'");
    d = (await a.get('/api/daily')).body;
    expect(d.reviews).toHaveLength(4);
    expect(d.dueTotal).toBe(9);
    const right = (await a.post(`/api/daily/review/${d.reviews[0].id}`).send({ correct: true })).body;
    expect(right.intervalDays).toBe(3);
    const wrong = (await a.post(`/api/daily/review/${d.reviews[1].id}`).send({ correct: false })).body;
    expect(wrong.intervalDays).toBe(1);
    expect((await a.get('/api/daily')).body.dueTotal).toBe(7);

    const c = (await a.post('/api/daily/complete').send({})).body;
    expect(c).toMatchObject({ streak: 1, activeToday: true });
    expect((await a.get('/api/daily')).body.dailyDone).toBe(true);

    // Yesterday active with a streak of 6 → today becomes 7 and earns a freeze.
    const other = await learner('streak@example.com', 'Europe/London');
    await pool.query(`update user_progress set streak = 6, freezes = 0,
      last_active_date = (now() at time zone 'Europe/London')::date - 1 where user_id = $1`, [other.id]);
    const st = (await other.a.post('/api/daily/complete').send({})).body;
    expect(st).toMatchObject({ streak: 7, freezes: 1, earnedFreeze: true });

    const w = (await a.get('/api/daily/week')).body;
    expect(w.days).toHaveLength(7);
    expect(w.days.at(-1).active).toBe(true);
    expect(w.daysActive).toBe(1);
    expect(w.reviewAccuracy).toBe(50);
    expect(w.counts.map((x: any) => x.kind)).toEqual(expect.arrayContaining(['tools', 'quiz', 'review', 'daily']));
    expect(w.topics[0].name).toBe('Negotiation Fundamentals');
    expect(w.focus).toMatch(/active 1 day/);
  });
});
