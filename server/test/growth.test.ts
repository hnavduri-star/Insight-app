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
const pushed: any[] = [];
vi.mock('web-push', () => ({ default: {
  generateVAPIDKeys: () => ({ publicKey: 'BPUBLICKEY', privateKey: 'PRIVATE' }), setVapidDetails: () => {},
  sendNotification: async (sub: any, payload: string) => { if (sub.endpoint.includes('gone')) throw Object.assign(new Error('gone'), { statusCode: 410 }); pushed.push(JSON.parse(payload)); },
} }));

const { createApp } = await import('../src/app.js');
const { pool } = await import('../src/db/client.js');
const { sendDueReminders } = await import('../src/lib/push.js');
const { levelFor, longestRun } = await import('../src/routes/progress.js');
const { personaFocus } = await import('../src/lib/ai.js');
const app = createApp();

const toolkit = () => ({
  title: 'Toolkit', framework: 'F',
  tools: Array.from({ length: 6 }, (_, i) => ({ name: `Tool ${i}`, source: 'Book', idea: `Idea ${i}`, steps: ['a', 'b'], say: ['x'], caseStudy: { situation: 's', action: 'a', result: 'r' }, tryThis: 't' })),
  quiz: Array.from({ length: 5 }, (_, i) => ({ q: `Q${i}`, options: ['a', 'b', 'c', 'd'], answer: 0, why: 'w' })), scenario: 'S',
});
const setup = () => ({ title: 'Pay talk', characterName: 'Raj', characterRole: 'Boss', situation: 's', yourGoal: 'g', hiddenObjective: 'h', skills: ['Tool 1'], opening: 'Hi' });

beforeEach(async () => {
  await pool.query('delete from users; delete from cached_lessons; delete from ai_calls; delete from app_settings');
  pushed.length = 0;
  ai.mockReset();
  ai.mockImplementation(async (p: any) => {
    if (p.system.includes('design realistic workplace')) return setup();
    if (p.system.includes('You are playing')) return { reply: 'Go on.', stepOut: false, careNote: null };
    if (p.system.includes('debrief the learner')) return { score: 82, rubric: { clarity: 80, empathy: 70, structure: 75, tools: 85 }, wentWell: 'w', improve: 'i',
      betterMove: { yourLine: 'a', tryInstead: 'b' }, toolsUsed: ['Tool 1'], revealed: 'r' };
    if (p.system.includes('practice designer')) return { reps: Array.from({ length: 5 }, (_, i) => ({ situation: `S${i}`, ask: 'Say?', tools: ['Tool 1'], with: null })) };
    if (p.system.includes('score a learner')) return { score: 72, feedback: 'f', strength: 's', improve: 'i', toolsUsed: [], modelAnswer: 'm' };
    if (p.system.includes('preparation plan') || p.system.includes('real situation')) return { title: 'Budget talk', summary: 's', goal: 'g', topics: [], steps: [{ tool: 'A', how: 'h' }, { tool: 'B', how: 'h' }],
      openingLine: 'o', phrases: ['p'], anticipate: [], avoid: [], rehearsal: 'r' };
    return toolkit();
  });
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  process.env.OPEN_ACCESS = 'true';
});
afterEach(() => { process.env.OPEN_ACCESS = ''; process.env.ADMIN_EMAILS = ''; });
afterAll(async () => { delete process.env.ANTHROPIC_API_KEY; await pool.end(); });

async function learner(email = 'g@example.com', goals = ['Get promoted']) {
  const a = request.agent(app);
  const r = await a.post('/api/auth/signup').send({ name: 'Grace Hopper', email, password: 'secret1', timezone: 'Europe/London' });
  await a.post('/api/me/onboarding').send({ persona: 'manager', industry: 'Technology', goals, dailyMinutes: 10, coach: 'maya' });
  const person = (await a.post('/api/people').send({ name: 'Raj', relationship: 'boss', traits: ['Direct'] })).body;
  const topic = (await a.get('/api/topics')).body.flatMap((c: any) => c.topics).find((t: any) => t.name === 'Executive Presence');
  return { a, id: r.body.id as string, topic, person };
}
async function throughRoleplay(a: any, topicId: string, personId?: string) {
  const { lessonId } = (await a.post('/api/bites').send({ topicId })).body;
  await a.post(`/api/bites/${lessonId}/progress`).send({ stage: 'cards' });
  await a.post(`/api/bites/${lessonId}/progress`).send({ stage: 'quiz', correct: 5 });
  for (let i = 0; i < 3; i++) {
    const { rep } = (await a.post('/api/practice/next').send({ topicId })).body;
    await a.post(`/api/practice/${rep.id}/answer`).send({ response: 'I would listen first and then propose a clear next step together.' });
  }
  const s = (await a.post('/api/roleplay/start').send({ topicId, difficulty: 'tough', ...(personId ? { personId } : { character: 'boss' }) })).body;
  await a.post(`/api/roleplay/${s.id}/turn`).send({ message: 'Line one', turn: 0 });
  await a.post(`/api/roleplay/${s.id}/turn`).send({ message: 'Line two', turn: 1 });
  return (await a.post(`/api/roleplay/${s.id}/debrief`).send({})).body;
}

describe('content', () => {
  it("flags Editor's picks and fiction topics from the catalogue, and tailors toolkits by career stage", async () => {
    const { a, topic } = await learner();
    const all = (await a.get('/api/topics')).body.flatMap((c: any) => c.topics);
    expect(all.filter((t: any) => t.featured).length).toBe(12);
    expect(topic.featured).toBe(true);
    expect(all.some((t: any) => t.fiction)).toBe(true);
    expect(personaFocus('Senior executive')).toMatch(/board/);
    expect(personaFocus('Early-stage employee')).toMatch(/scripts/);
    await a.post('/api/bites').send({ topicId: topic.id });
    const prompt = ai.mock.calls.at(-1)![0].messages[0].content;
    expect(prompt).toContain('Career-stage focus: Manager');
  });

  it('asks for a tool from fiction when a topic has a novel', async () => {
    const { a } = await learner();
    const all = (await a.get('/api/topics')).body.flatMap((c: any) => c.topics);
    const fic = all.find((t: any) => t.fiction);
    await a.post('/api/bites').send({ topicId: fic.id });
    expect(ai.mock.calls.at(-1)![0].messages[0].content).toMatch(/\(fiction\)[\s\S]*Lessons from fiction/);
  });

  it('serves the quick-reference tool library once the toolkit exists', async () => {
    const { a, topic } = await learner();
    expect((await a.get(`/api/bites/library/${topic.id}`)).body.sets).toEqual([]);
    await a.post('/api/bites').send({ topicId: topic.id });
    const lib = (await a.get(`/api/bites/library/${topic.id}`)).body;
    expect(lib.sets).toHaveLength(1);
    expect(lib.sets[0].tools[0]).toMatchObject({ name: 'Tool 0', say: ['x'] });
  });
});

describe('home and first value', () => {
  it('suggests a flagship topic for the main goal, then shows the next step on the topic in progress', async () => {
    const { a, topic } = await learner();
    let h = (await a.get('/api/home')).body;
    expect(h.next).toMatchObject({ started: false, topic: { name: 'Executive Presence' } });
    expect(h.picks.length).toBe(12);
    expect(h.fiction.length).toBeGreaterThan(0);
    expect(h.level).toMatchObject({ n: 1, name: 'Explorer' });
    const { lessonId } = (await a.post('/api/bites').send({ topicId: topic.id })).body;
    await a.post(`/api/bites/${lessonId}/progress`).send({ stage: 'cards' });
    h = (await a.get('/api/home')).body;
    expect(h.next).toMatchObject({ started: true, label: 'Take the quiz', path: `/bite/${topic.id}?start=quiz` });
    await a.post(`/api/bites/${lessonId}/progress`).send({ stage: 'quiz', correct: 4 });
    expect((await a.get('/api/home')).body.next.label).toBe('Practise · rep 1');
  });

  it('starts building a toolkit ahead of time, and records confidence without changing the toolkit', async () => {
    const { a, topic } = await learner();
    expect((await a.post('/api/bites/prewarm').send({ topicId: topic.id })).status).toBe(202);
    await new Promise((r) => setTimeout(r, 300));
    const before = ai.mock.calls.length;
    const r = await a.post('/api/bites').send({ topicId: topic.id });
    expect(r.body.cached).toBe(true); // already built by the prewarm
    expect(ai.mock.calls.length).toBe(before);
    expect((await a.post('/api/bites/confidence').send({ topicId: topic.id, score: 4, when: 'before' })).status).toBe(200);
    expect((await a.post('/api/bites/confidence').send({ topicId: topic.id, score: 11, when: 'before' })).status).toBe(400);
  });
});

describe('real-world check-ins', () => {
  it('asks a day after a role-play with your person, logs a win with XP, and reschedules "not yet" once', async () => {
    const { a, topic, person } = await learner();
    await throughRoleplay(a, topic.id, person.id);
    expect((await a.get('/api/checkins/due')).body).toEqual([]);
    await pool.query("update checkins set due_at = now() - interval '1 minute'");
    const [c] = (await a.get('/api/checkins/due')).body;
    expect(c.question).toBe('Did you have the real conversation with Raj? How did it go?');
    const xpBefore = (await a.get('/api/progress')).body.level.xp;
    await a.post(`/api/checkins/${c.id}`).send({ outcome: 'well', note: 'He agreed to the trade.' });
    const p = (await a.get('/api/progress')).body;
    expect(p.level.xp).toBe(xpBefore + 25);
    expect(p.wins).toBe(1);
    expect((await a.get('/api/daily/week')).body.wins).toBe(1);

    const sit = await a.post('/api/situations').send({ text: 'My boss wants to cut my team budget on Thursday.' });
    expect(sit.body.error).toBeUndefined();
    await pool.query("update checkins set due_at = now() - interval '1 minute' where answered_at is null");
    const [s] = (await a.get('/api/checkins/due')).body;
    expect(s.question).toMatch(/Did “Budget talk” happen yet/);
    await a.post(`/api/checkins/${s.id}`).send({ outcome: 'not_yet' });
    expect((await a.get('/api/checkins/due')).body).toEqual([]);
    await pool.query("update checkins set due_at = now() - interval '1 minute' where answered_at is null");
    await a.post(`/api/checkins/${s.id}`).send({ outcome: 'not_yet' });
    await pool.query("update checkins set due_at = now() - interval '1 minute'");
    expect((await a.get('/api/checkins/due')).body).toEqual([]); // closed after the second "not yet"
  });
});

describe('progress and badges', () => {
  it('levels by XP, finds the longest streak, and awards badges from real activity', async () => {
    expect(levelFor(0)).toMatchObject({ n: 1, name: 'Explorer', next: { at: 200 } });
    expect(levelFor(650)).toMatchObject({ n: 3, name: 'Practitioner' });
    expect(levelFor(99999).next).toBeNull();
    expect(longestRun(['2026-11-01', '2026-11-02', '2026-11-04', '2026-11-05', '2026-11-06'])).toBe(3);
    const { a, topic, person } = await learner();
    await throughRoleplay(a, topic.id, person.id);
    const p = (await a.get('/api/progress')).body;
    const earned = p.badges.filter((b: any) => b.earned).map((b: any) => b.key);
    expect(earned).toEqual(expect.arrayContaining(['first_toolkit', 'perfect_quiz', 'first_roleplay', 'with_your_people', 'tough', 'roleplay_80']));
    expect(earned).not.toContain('ten_reps');
    expect(p.skills.current).toEqual({ clarity: 80, empathy: 70, structure: 75, tools: 85 });
    expect(p.topics[0]).toMatchObject({ name: 'Executive Presence', level: 'Advanced', reps: 3 });
  });
});

describe('beta feedback and admin metrics', () => {
  it('collects feedback, asks on Home after 3 active days, and shows metrics only to admins', async () => {
    const { a, id } = await learner();
    await pool.query(`insert into activity_events (user_id, kind, local_day) values ($1,'daily',current_date-2),($1,'daily',current_date-1),($1,'daily',current_date)`, [id]);
    expect((await a.get('/api/home')).body.askFeedback).toBe(true);
    expect((await a.post('/api/feedback').send({})).status).toBe(400);
    await a.post('/api/feedback').send({ usedAtWork: 'Answer first', wouldPay: 'yes', priceUsd: 12 });
    expect((await a.get('/api/home')).body.askFeedback).toBe(false);
    expect((await a.get('/api/admin/metrics')).status).toBe(403);
    expect((await a.get('/api/me/profile')).body.isAdmin).toBe(false);
    process.env.ADMIN_EMAILS = 'someone@x.com, G@example.com';
    const m = (await a.get('/api/admin/metrics')).body;
    expect((await a.get('/api/me/profile')).body.isAdmin).toBe(true);
    expect(m.signups).toBe(1);
    expect(m.funnel[1]).toMatchObject({ step: 'Finished onboarding', n: 1, pct: 100 });
    expect(m.feedback[0]).toMatchObject({ usedAtWork: 'Answer first', wouldPay: 'yes', priceUsd: 12 });
    expect(m.wouldPay).toMatchObject({ yes: 1, medianPrice: 12 });
  });
});

describe('teams', () => {
  it('lets an owner invite members and see totals only, never content', async () => {
    const owner = await learner('owner@example.com');
    const team = (await owner.a.post('/api/teams').send({ name: 'Acme Strategy' })).body;
    expect(team.inviteCode).toMatch(/^[A-Z2-9]{6}$/);
    const member = await learner('member@example.com');
    expect((await member.a.post('/api/teams/join').send({ code: 'NOPE99' })).status).toBe(404);
    await member.a.post('/api/teams/join').send({ code: team.inviteCode.toLowerCase() });
    expect((await member.a.get('/api/teams/mine')).body).toMatchObject({ name: 'Acme Strategy', role: 'member', members: 2, inviteCode: null });
    expect((await member.a.get('/api/teams/dashboard')).status).toBe(403);
    await throughRoleplay(member.a, member.topic.id, member.person.id);
    const d = (await owner.a.get('/api/teams/dashboard')).body;
    const row = d.members.find((x: any) => x.name === 'Grace Hopper' && x.role === 'member');
    expect(row).toMatchObject({ reps: 3, roleplays: 1, roleplayAvg: 82, foundations: 1, days7: 1 });
    expect(JSON.stringify(d)).not.toMatch(/Raj|Line one|Answer|listen first/);
    expect((await owner.a.post('/api/teams/leave').send({})).body.code).toBe('owner_has_members');
    await member.a.post('/api/teams/leave').send({});
    expect((await member.a.get('/api/teams/mine')).body).toBeNull();
  });
});

describe('reminders', () => {
  it('saves a time with a push subscription and sends one reminder in the window, only if not active today', async () => {
    const { a, id } = await learner();
    const r0 = (await a.get('/api/reminders')).body;
    expect(r0).toMatchObject({ enabled: false, time: '08:30', publicKey: 'BPUBLICKEY' });
    expect((await a.put('/api/reminders').send({ enabled: true, time: '07:15' })).body.code).toBe('no_subscription');
    const sub = { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'k', auth: 'a' } };
    expect((await a.put('/api/reminders').send({ enabled: true, time: '07:15', subscription: sub })).body).toMatchObject({ enabled: true, time: '07:15' });
    await a.post('/api/reminders/test').send({});
    expect(pushed.at(-1).title).toMatch(/reminders are on/);

    const london = (h: number, m: number) => new Date(Date.UTC(2026, 10, 16, h, m)); // November: London = UTC
    expect(await sendDueReminders(london(7, 0))).toBe(0);  // too early
    expect(await sendDueReminders(london(7, 20))).toBe(1);
    expect(pushed.at(-1)).toMatchObject({ title: 'Your 5 minutes are ready 🔥', url: '/daily' });
    expect(await sendDueReminders(london(7, 25))).toBe(0); // once a day
    await pool.query('delete from reminder_log');
    await pool.query("update user_progress set last_active_date = '2026-11-16' where user_id = $1", [id]);
    expect(await sendDueReminders(london(7, 20))).toBe(0); // already learned today
    await a.put('/api/reminders').send({ enabled: false, time: '07:15' });
    await pool.query('update user_progress set last_active_date = null');
    expect(await sendDueReminders(london(7, 20))).toBe(0);
  });

  it('stops sending to a subscription the browser has removed', async () => {
    const { a } = await learner();
    await a.put('/api/reminders').send({ enabled: true, time: '07:15', subscription: { endpoint: 'https://push.example.com/gone', keys: { p256dh: 'k', auth: 'a' } } });
    await sendDueReminders(new Date(Date.UTC(2026, 10, 16, 7, 20)));
    expect((await a.get('/api/reminders')).body.subscribed).toBe(false);
  });
});
