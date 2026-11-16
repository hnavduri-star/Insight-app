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

const { createApp } = await import('../src/app.js');
const { pool } = await import('../src/db/client.js');
const app = createApp();

let turnReply: any;
beforeEach(async () => {
  await pool.query('delete from users; delete from ai_calls');
  ai.mockReset();
  turnReply = { reply: 'What would make today useful for you?', stage: 'goal', adviceRequested: false, careNote: null };
  ai.mockImplementation(async (p: any) => {
    if (p.system.includes('writing the session notes')) return { explored: 'You explored speaking up in leadership meetings.', insights: ['I wait for permission to speak', 'I know more than I credit'],
      commitments: [{ action: 'Speak in the first ten minutes of Monday\'s meeting', when: 'Monday' }], nextFocus: 'What changed when you spoke early?' };
    return turnReply;
  });
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  process.env.OPEN_ACCESS = 'true';
});
afterAll(async () => { delete process.env.ANTHROPIC_API_KEY; process.env.OPEN_ACCESS = ''; await pool.end(); });

async function coachee() {
  const a = request.agent(app);
  await a.post('/api/auth/signup').send({ name: 'Kai', email: `k${Math.random()}@example.com`, password: 'secret1' });
  await a.post('/api/me/onboarding').send({ persona: 'manager', industry: 'Consulting', goals: ['Get promoted'], dailyMinutes: 15, coach: 'alex' });
  return a;
}

describe('coaching', () => {
  it('lets the coachee choose up to 3 attributes, including their own', async () => {
    const a = await coachee();
    const hub = (await a.get('/api/coaching')).body;
    expect(hub.attributes).toEqual([]);
    expect(hub.choices).toContain('Confidence');
    expect((await a.put('/api/coaching/plan').send({ attributes: [{ name: 'A1' }, { name: 'A2' }, { name: 'A3' }, { name: 'A4' }] })).status).toBe(400);
    const r = (await a.put('/api/coaching/plan').send({ attributes: [{ name: 'Confidence', why: 'I hold back in senior meetings' }, { name: 'Saying what I think' }] })).body;
    expect(r.attributes).toEqual([{ name: 'Confidence', why: 'I hold back in senior meetings' }, { name: 'Saying what I think', why: null }]);
    expect((await a.post('/api/coaching/sessions').send({ attribute: 'Delegation' })).body.code).toBe('not_in_plan');
  });

  it('runs a coachee-led session: questions not advice, then notes and commitments in their words', async () => {
    const a = await coachee();
    await a.put('/api/coaching/plan').send({ attributes: [{ name: 'Confidence', why: 'I hold back in senior meetings' }] });
    turnReply = { reply: 'Hi Kai. What would you like to focus on today around confidence?', stage: 'connect', adviceRequested: false, careNote: null };
    const s = (await a.post('/api/coaching/sessions').send({ attribute: 'confidence' })).body;
    expect(s.transcript).toEqual([{ who: 'coach', text: 'Hi Kai. What would you like to focus on today around confidence?' }]);
    const sys = ai.mock.calls[0][0].system as string;
    expect(sys).toContain('You are Alex');
    expect(sys).toMatch(/Do NOT give advice, recommendations, tips or frameworks unless the coachee explicitly asks/);
    expect(sys).toMatch(/ONE open, curious question/);
    expect(ai.mock.calls[0][0].messages[0].content).toContain('why it matters to them: I hold back in senior meetings');
    // Starting again returns the same open session.
    expect((await a.post('/api/coaching/sessions').send({ attribute: 'Confidence' })).body.id).toBe(s.id);

    turnReply = { reply: 'What do you notice just before you hold back?', stage: 'reality', adviceRequested: false, careNote: null };
    const t1 = (await a.post(`/api/coaching/sessions/${s.id}/message`).send({ text: 'Speaking up when the CFO is in the room', turn: 0 })).body;
    expect(t1.transcript.at(-1)).toEqual({ who: 'coach', text: 'What do you notice just before you hold back?' });
    expect(t1.stage).toBe('reality');
    expect(ai.mock.calls.at(-1)![0].messages[0].content).toContain('<coachee>Speaking up when the CFO is in the room</coachee>');
    expect((await a.post(`/api/coaching/sessions/${s.id}/message`).send({ text: 'again', turn: 0 })).body.turnsUsed).toBe(1); // retry-safe

    turnReply = { reply: 'What have you already tried? If you want, I can share a few options others use.', stage: 'options', adviceRequested: true, careNote: null };
    const t2 = (await a.post(`/api/coaching/sessions/${s.id}/message`).send({ text: 'What would you suggest?', turn: 1 })).body;
    expect(t2.adviceRequested).toBe(true);

    const closed = (await a.post(`/api/coaching/sessions/${s.id}/close`).send({})).body;
    expect(closed.status).toBe('closed');
    expect(closed.summary.insights).toHaveLength(2);
    expect(closed.commitments[0]).toMatchObject({ action: "Speak in the first ten minutes of Monday's meeting", when: 'Monday', status: 'open' });

    // Next session follows up on the commitment.
    turnReply = { reply: 'Last time you planned to speak early on Monday. How did it go?', stage: 'connect', adviceRequested: false, careNote: null };
    await a.post('/api/coaching/sessions').send({ attribute: 'Confidence' });
    const opening = ai.mock.calls.at(-1)![0].messages[0].content as string;
    expect(opening).toContain('"Speak in the first ten minutes of Monday\'s meeting" (Monday)');
    expect(opening).toContain('They wanted to focus next on: What changed when you spoke early?');

    const hub = (await a.get('/api/coaching')).body;
    const c = await a.post(`/api/coaching/commitments/${hub.commitments[0].id}`).send({ status: 'done', note: 'Spoke in minute five' });
    expect(c.body.status).toBe('done');
    expect((await a.get('/api/coaching')).body.commitments).toEqual([]);
    expect((await a.get('/api/home')).body.coaching).toMatchObject({ attributes: ['Confidence'], openCommitments: [] });
  });

  it('pauses with care when the coachee seems distressed, and keeps sessions private', async () => {
    const a = await coachee();
    await a.put('/api/coaching/plan').send({ attributes: [{ name: 'Resilience' }] });
    const s = (await a.post('/api/coaching/sessions').send({ attribute: 'Resilience' })).body;
    turnReply = { reply: '', stage: 'connect', adviceRequested: false, careNote: "Let's pause here. Please reach out to someone you trust or a professional." };
    const t = (await a.post(`/api/coaching/sessions/${s.id}/message`).send({ text: 'I really cannot cope any more', turn: 0 })).body;
    expect(t.paused).toBe(true);
    expect(t.transcript.at(-1).text).toMatch(/someone you trust/);
    const other = await coachee();
    expect((await other.get(`/api/coaching/sessions/${s.id}`)).status).toBe(404);
    expect((await a.post(`/api/coaching/sessions/${s.id}/close`).send({})).body.code).toBe('too_short');
  });
});
