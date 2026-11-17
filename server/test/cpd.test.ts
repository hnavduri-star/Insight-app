import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';

const ai = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error { status = 500; }
  class RateLimitError extends APIError { status = 429; }
  class AuthenticationError extends APIError { status = 401; }
  async function* events(msg: any) {
    yield { type: 'message_start', message: { model: 'claude-sonnet-5-5', usage: { input_tokens: 50, output_tokens: 1 } } };
    yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
    yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: JSON.stringify(msg) } };
    yield { type: 'content_block_stop', index: 0 };
    yield { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 40 } };
    yield { type: 'message_stop' };
  }
  class Anthropic {
    beta = { messages: { create: async (params: any) => events(await ai(params)) } };
    static APIError = APIError; static RateLimitError = RateLimitError; static AuthenticationError = AuthenticationError;
  }
  return { default: Anthropic };
});

const { toolkit, completeTools, toolFeedback } = await import('./fixtures.js');
const { createApp } = await import('../src/app.js');
const { pool } = await import('../src/db/client.js');
const app = createApp();

beforeEach(async () => {
  await pool.query('delete from users; delete from cached_lessons; delete from ai_calls');
  ai.mockReset();
  ai.mockImplementation(async (p: any) => {
    if (p.system.includes('short written practice of ONE tool')) return toolFeedback(80);
    if (p.system.includes('score a learner')) return { score: 74, feedback: 'f', strength: 's', improve: 'i', toolsUsed: ['Tool 1'], modelAnswer: 'm' };
    return toolkit('Negotiation module');
  });
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  process.env.OPEN_ACCESS = 'true';
});
afterAll(async () => { delete process.env.ANTHROPIC_API_KEY; process.env.OPEN_ACCESS = ''; await pool.end(); });

async function learner(name = 'Asha Menon', email = `c${Math.random()}@example.com`) {
  const a = request.agent(app);
  const r = await a.post('/api/auth/signup').send({ name, email, password: 'secret1' });
  await a.post('/api/me/onboarding').send({ persona: 'manager', industry: 'Consulting', goals: ['Get promoted'], dailyMinutes: 15, coach: 'maya' });
  const topic = (await a.get('/api/topics')).body.flatMap((c: any) => c.topics).find((t: any) => t.name === 'Negotiation Fundamentals');
  const { lessonId } = (await a.post('/api/bites').send({ topicId: topic.id })).body;
  return { a, id: r.body.id as string, topic, lessonId: lessonId as string };
}
const scenarioAnswer = { response: 'I would acknowledge the concern, explain the trade-off, and propose two options with a decision date.' };

describe('CPD module: tool by tool', () => {
  it('opens tools in order: both questions, then the written practice, then the next tool', async () => {
    const { a, lessonId } = await learner();
    const b = (await a.post(`/api/bites/${lessonId}/tool/1/check`).send({ q: 0, picked: 0 })).body;
    expect(b.code).toBe('earlier_tools_first');
    expect((await a.post(`/api/bites/${lessonId}/tool/0/practice`).send({ response: 'Short answer: yes, if we move reporting.' })).body.code).toBe('questions_first');
    await a.post(`/api/bites/${lessonId}/tool/0/check`).send({ q: 0, picked: 3 }); // wrong
    const second = (await a.post(`/api/bites/${lessonId}/tool/0/check`).send({ q: 0, picked: 0 })).body; // can't change it
    expect(second.tools[0].checks).toEqual({ 0: 3 });
    await a.post(`/api/bites/${lessonId}/tool/0/check`).send({ q: 1, picked: 2 });
    expect((await a.post(`/api/bites/${lessonId}/tool/0/practice`).send({ response: 'too short' })).status).toBe(400);
    const done = (await a.post(`/api/bites/${lessonId}/tool/0/practice`).send({ response: 'Short answer: yes, if we move reporting a sprint.' })).body;
    expect(done.tools[0]).toMatchObject({ completed: true, score: 80, feedback: { tryInstead: 'Lead with the answer.' } });
    const call = ai.mock.calls.find((c) => c[0].system.includes('short written practice'))![0];
    expect(call.messages[0].content).toContain('<response>');
    // The quiz stays locked until every tool is complete; state lets the learner resume.
    expect((await a.post(`/api/bites/${lessonId}/progress`).send({ stage: 'cards' })).body.code).toBe('tools_incomplete');
    const state = (await a.get(`/api/bites/${lessonId}/state`)).body;
    expect(state.tools.map((t: any) => t.completed)).toEqual([true, false, false, false, false, false]);
  });

  it('still completes a tool when coaching is unavailable', async () => {
    const { a, lessonId } = await learner();
    ai.mockImplementation(async (p: any) => { if (p.system.includes('short written practice')) throw new Error('down'); return toolkit(); });
    await a.post(`/api/bites/${lessonId}/tool/0/check`).send({ q: 0, picked: 0 });
    await a.post(`/api/bites/${lessonId}/tool/0/check`).send({ q: 1, picked: 2 });
    const r = (await a.post(`/api/bites/${lessonId}/tool/0/practice`).send({ response: 'Short answer: yes, if we move reporting a sprint.' })).body;
    expect(r.feedbackUnavailable).toBe(true);
    expect(r.tools[0].completed).toBe(true);
  });

  it('records active time at most as fast as the clock runs', async () => {
    const { a, lessonId } = await learner();
    expect((await a.post(`/api/bites/${lessonId}/time`).send({ seconds: 30 })).body.seconds).toBe(30);
    expect((await a.post(`/api/bites/${lessonId}/time`).send({ seconds: 30 })).body.seconds).toBeLessThan(40); // sent straight away: capped
    expect((await a.post(`/api/bites/${lessonId}/time`).send({ seconds: 500 })).status).toBe(400);
  });
});

describe('CPD records and certificates', () => {
  it('needs every step and a reflection, then issues a verifiable certificate and a CSV log', async () => {
    const { a, lessonId, topic } = await learner();
    const reflection = 'I learned to separate interests from positions and to prepare my walk-away point before any negotiation.';
    expect((await a.post('/api/cpd/complete').send({ lessonId, reflection })).body.code).toBe('tools_incomplete');
    await completeTools(a, lessonId);
    await a.post(`/api/bites/${lessonId}/progress`).send({ stage: 'cards' });
    expect((await a.post('/api/cpd/complete').send({ lessonId, reflection })).body.code).toBe('quiz_first');
    await a.post(`/api/bites/${lessonId}/progress`).send({ stage: 'quiz', correct: 2 });
    expect((await a.post('/api/cpd/complete').send({ lessonId, reflection })).body.code).toBe('scenario_first');
    await a.post(`/api/bites/${lessonId}/scenario`).send(scenarioAnswer);
    expect((await a.post('/api/cpd/complete').send({ lessonId, reflection: 'Too short' })).status).toBe(400);
    // Under 30 active minutes: no certificate yet.
    await pool.query('insert into lesson_time (user_id, lesson_id, seconds) select user_id, $1, 1700 from tool_progress limit 1 on conflict do nothing', [lessonId]);
    expect((await a.post('/api/cpd/complete').send({ lessonId, reflection })).body.code).toBe('time_short');
    await pool.query('update lesson_time set seconds = 3240 where lesson_id = $1', [lessonId]);
    // Below the 70% pass mark on the questions: retake every question until it passes (the best score counts).
    await pool.query('update module_assessments set correct = 9 where lesson_id = $1', [lessonId]);
    const st = (await a.get(`/api/bites/${lessonId}/state`)).body;
    expect(st).toMatchObject({ questions: { correct: 9, total: 15 }, passMark: 70, minMinutes: 30 });
    expect((await a.post('/api/cpd/complete').send({ lessonId, reflection })).body.code).toBe('below_pass_mark');
    expect((await a.post(`/api/bites/${lessonId}/progress`).send({ stage: 'retake', correct: 16 })).status).toBe(400);
    expect((await a.post(`/api/bites/${lessonId}/progress`).send({ stage: 'retake', correct: 10 })).body.questions).toEqual({ correct: 10, total: 15 });
    expect((await a.post('/api/cpd/complete').send({ lessonId, reflection })).body.code).toBe('below_pass_mark');
    await a.post(`/api/bites/${lessonId}/progress`).send({ stage: 'retake', correct: 14 });
    await a.post(`/api/bites/${lessonId}/progress`).send({ stage: 'retake', correct: 12 }); // a worse retake doesn't lower it
    // The scenario needs 70 too: answer again to improve.
    await pool.query('update scenarios set score = 60 where lesson_id = $1', [lessonId]);
    expect((await a.post('/api/cpd/complete').send({ lessonId, reflection })).body.code).toBe('scenario_below_pass');
    await a.post(`/api/bites/${lessonId}/scenario`).send(scenarioAnswer);

    const cert = (await a.post('/api/cpd/complete').send({ lessonId, reflection, applyPlan: 'Use it in Thursday\'s supplier call' })).body;
    expect(cert).toMatchObject({ learnerName: 'Asha Menon', topicName: topic.name, level: 'foundations', title: 'Negotiation module', plannedMinutes: 60,
      activeMinutes: 54, questionsCorrect: 14, questionsTotal: 15, practiceAvg: 80, scenarioScore: 74 });
    expect(cert.code).toMatch(/^[A-Z2-9]{8}$/);
    expect(cert.outcomes).toHaveLength(3);
    // Idempotent: completing again returns the same certificate.
    expect((await a.post('/api/cpd/complete').send({ lessonId, reflection })).body.id).toBe(cert.id);

    const log = (await a.get('/api/cpd')).body;
    expect(log.totals).toMatchObject({ modules: 1, plannedHours: 1, activeMinutes: 54 });
    const csv = await a.get('/api/cpd/export.csv');
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toContain('Negotiation module');
    expect(csv.text).toContain("Use it in Thursday's supplier call");

    // Anyone can verify the code, without seeing answers or the reflection.
    const v = await request(app).get(`/api/verify/${cert.code.toLowerCase()}`);
    expect(v.body).toMatchObject({ learnerName: 'Asha Menon', plannedMinutes: 60, activeMinutes: 54 });
    expect(JSON.stringify(v.body)).not.toContain('walk-away');
    expect((await request(app).get('/api/verify/NOPE1234')).status).toBe(404);
    // Someone else can't open the certificate record.
    const other = await learner('Ben Ode');
    expect((await other.a.get(`/api/cpd/${cert.id}`)).status).toBe(404);
  });

  it('gives team owners CPD totals and an HR export without reflections', async () => {
    const owner = await learner('Olu Owner');
    const team = (await owner.a.post('/api/teams').send({ name: 'Acme Advisory' })).body;
    const m = await learner('Mira Member');
    await m.a.post('/api/teams/join').send({ code: team.inviteCode });
    await completeTools(m.a, m.lessonId);
    await m.a.post(`/api/bites/${m.lessonId}/progress`).send({ stage: 'cards' });
    await m.a.post(`/api/bites/${m.lessonId}/progress`).send({ stage: 'quiz', correct: 3 });
    await m.a.post(`/api/bites/${m.lessonId}/scenario`).send(scenarioAnswer);
    await pool.query('insert into lesson_time (user_id, lesson_id, seconds) select user_id, $1, 2400 from tool_progress where lesson_id = $1 limit 1', [m.lessonId]);
    await m.a.post('/api/cpd/complete').send({ lessonId: m.lessonId, reflection: 'A private reflection about my own negotiation habits and what to change.' });
    const d = (await owner.a.get('/api/teams/dashboard')).body;
    expect(d.totals).toMatchObject({ cpdModules: 1, cpdHours: 1 });
    expect(d.members.find((x: any) => x.name === 'Mira Member')).toMatchObject({ cpdModules: 1, cpdHours: 1 });
    const csv = await owner.a.get('/api/teams/cpd.csv');
    expect(csv.text).toContain('Mira Member');
    expect(csv.text).not.toContain('private reflection');
    expect((await m.a.get('/api/teams/cpd.csv')).status).toBe(403);
  });
});
