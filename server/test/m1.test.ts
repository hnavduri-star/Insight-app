import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/client.js';
import { outbox } from '../src/lib/mailer.js';

const app = createApp();
const agent = () => request.agent(app);
const tokenFrom = (text: string) => text.match(/token=([\w-]+)/)![1];

beforeEach(async () => { await pool.query('delete from users'); outbox.length = 0; });
afterAll(async () => { await pool.end(); });

async function signup(a = agent(), email = 'ana@example.com') {
  const r = await a.post('/api/auth/signup').send({ name: 'Ana', email, password: 'secret1', timezone: 'Asia/Dubai' });
  expect(r.status).toBe(201);
  return a;
}

describe('Milestone 1 acceptance: sign up, set a persona, see all 8 headings', () => {
  it('works end to end', async () => {
    const a = await signup();
    const me = await a.get('/api/auth/me');
    expect(me.body).toMatchObject({ name: 'Ana', email: 'ana@example.com', onboarded: false, emailVerified: false, timezone: 'Asia/Dubai' });

    const ob = await a.post('/api/me/onboarding').send({ persona: 'manager', industry: 'Technology', goal: 'Get promoted', dailyMinutes: 10, coach: 'maya' });
    expect(ob.status).toBe(200);
    expect(ob.body).toMatchObject({ persona: 'manager', coach: 'maya', onboarded: true });

    const cats = await a.get('/api/topics');
    expect(cats.body).toHaveLength(8);
    expect(cats.body.map((c: any) => c.topics.length)).toEqual([9, 16, 12, 9, 8, 13, 16, 16]);
    const names = cats.body.flatMap((c: any) => c.topics.map((t: any) => t.name));
    expect(new Set(names).size).toBe(names.length); // no overlap across headings

    const topic = await a.get(`/api/topics/${cats.body[0].topics[0].id}`);
    expect(topic.body.name).toBe('Critical Thinking');
    expect(topic.body.books).toHaveLength(3);
  });
});

describe('auth', () => {
  it('rejects short passwords, bad emails and duplicate accounts', async () => {
    expect((await request(app).post('/api/auth/signup').send({ name: 'A', email: 'a@b.co', password: '12345' })).status).toBe(400);
    expect((await request(app).post('/api/auth/signup').send({ name: 'A', email: 'nope', password: '123456' })).status).toBe(400);
    await signup();
    const dup = await request(app).post('/api/auth/signup').send({ name: 'B', email: 'ANA@example.com', password: '123456' });
    expect(dup.status).toBe(409);
  });

  it('stores a hash, never the plain password', async () => {
    await signup();
    const { rows } = await pool.query('select password_hash from users');
    expect(rows[0].password_hash).not.toContain('secret1');
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$/);
  });

  it('logs in with the right password only, and logs out', async () => {
    await signup();
    const a = agent();
    expect((await a.post('/api/auth/login').send({ email: 'ana@example.com', password: 'wrong!' })).status).toBe(401);
    expect((await a.post('/api/auth/login').send({ email: 'ana@example.com', password: 'secret1' })).status).toBe(200);
    expect((await a.get('/api/auth/me')).status).toBe(200);
    await a.post('/api/auth/logout').send({});
    expect((await a.get('/api/auth/me')).status).toBe(401);
  });

  it('verifies email with a single-use link', async () => {
    const a = await signup();
    const token = tokenFrom(outbox.at(-1)!.text);
    expect((await request(app).post('/api/auth/verify-email').send({ token })).status).toBe(200);
    expect((await a.get('/api/auth/me')).body.emailVerified).toBe(true);
    expect((await request(app).post('/api/auth/verify-email').send({ token })).status).toBe(400);
  });

  it('resets the password and signs out other sessions', async () => {
    const old = await signup();
    outbox.length = 0;
    expect((await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@example.com' })).status).toBe(200);
    expect(outbox).toHaveLength(0); // no email for unknown accounts, same response
    await request(app).post('/api/auth/forgot-password').send({ email: 'ana@example.com' });
    const token = tokenFrom(outbox[0].text);
    const r = await request(app).post('/api/auth/reset-password').send({ token, password: 'newpass' });
    expect(r.status).toBe(200);
    expect((await old.get('/api/auth/me')).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: 'ana@example.com', password: 'newpass' })).status).toBe(200);
  });

  it('requires a session for user and topic data', async () => {
    expect((await request(app).get('/api/topics')).status).toBe(401);
    expect((await request(app).get('/api/me/profile')).status).toBe(401);
  });

  it('rejects non-JSON writes', async () => {
    const r = await request(app).post('/api/auth/login').type('form').send('email=a@b.co&password=x');
    expect(r.status).toBe(415);
  });
});

describe('profile', () => {
  it('only accepts values from the fixed lists', async () => {
    const a = await signup();
    expect((await a.put('/api/me/profile').send({ persona: 'wizard' })).status).toBe(400);
    expect((await a.put('/api/me/profile').send({ dailyMinutes: 7 })).status).toBe(400);
    expect((await a.put('/api/me/profile').send({ industry: 'Free text' })).status).toBe(400);
    expect((await a.put('/api/me/profile').send({ isAdmin: true })).status).toBe(400);
    expect((await a.post('/api/me/onboarding').send({ persona: 'student' })).status).toBe(400);
  });

  it('edits name and switches coach', async () => {
    const a = await signup();
    const r = await a.put('/api/me/profile').send({ name: 'Ana B', coach: 'alex' });
    expect(r.body).toMatchObject({ name: 'Ana B', coach: 'alex' });
  });

  it("each user only ever sees their own profile", async () => {
    const a = await signup(agent(), 'a@example.com');
    const b = await signup(agent(), 'b@example.com');
    await a.put('/api/me/profile').send({ persona: 'leader' });
    expect((await b.get('/api/me/profile')).body).toMatchObject({ email: 'b@example.com', persona: null });
  });

  it('deletes the account and all its data', async () => {
    const a = await signup();
    expect((await a.delete('/api/me/account').send({ password: 'wrong!' })).status).toBe(401);
    expect((await a.delete('/api/me/account').send({ password: 'secret1' })).status).toBe(200);
    for (const t of ['users', 'profiles', 'user_progress', 'auth_tokens']) {
      const { rows } = await pool.query(`select count(*)::int n from ${t}`);
      expect(rows[0].n, t).toBe(0);
    }
    expect((await a.get('/api/auth/me')).status).toBe(401);
  });
});
