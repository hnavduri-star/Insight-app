import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/client.js';
import { canAccessTopic, requireTopicAccess } from '../src/lib/access.js';
import { readCatalog, loadCatalog } from '../src/db/catalog.js';

const app = createApp();
beforeEach(async () => { await pool.query('delete from users'); });
afterAll(async () => { await pool.end(); });

async function user(email = 'sam@example.com') {
  const a = request.agent(app);
  const r = await a.post('/api/auth/signup').send({ name: 'Sam', email, password: 'secret1' });
  return { a, id: r.body.id as string };
}
const topicIds = async (a: any) => (await a.get('/api/topics')).body.flatMap((c: any) => c.topics);

describe('free taste, then pay', () => {
  it('locks every topic until the learner picks a free one', async () => {
    const { a, id } = await user();
    const ts = await topicIds(a);
    expect(ts.every((t: any) => !t.unlocked)).toBe(true);
    expect((await a.get('/api/auth/me')).body).toMatchObject({ plan: 'free', freeTopicId: null });

    const me = await a.post('/api/me/free-topic').send({ topicId: ts[5].id });
    expect(me.body.freeTopicId).toBe(ts[5].id);
    const after = await topicIds(a);
    expect(after.filter((t: any) => t.unlocked).map((t: any) => t.id)).toEqual([ts[5].id]);
    expect(after[5].free).toBe(true);
    expect(await canAccessTopic(id, ts[5].id)).toBe(true);
    await expect(requireTopicAccess(id, ts[6].id)).rejects.toMatchObject({ status: 402, code: 'premium_required' });
  });

  it('lets the learner change the free topic until they start it', async () => {
    const { a, id } = await user();
    const ts = await topicIds(a);
    await a.post('/api/me/free-topic').send({ topicId: ts[0].id });
    expect((await a.post('/api/me/free-topic').send({ topicId: ts[1].id })).body.freeTopicId).toBe(ts[1].id);
    await pool.query('insert into topic_progress (user_id, topic_id, xp) values ($1, $2, 10)', [id, ts[1].id]);
    const r = await a.post('/api/me/free-topic').send({ topicId: ts[2].id });
    expect(r.status).toBe(409);
    const { rows } = await pool.query("select count(*)::int n from entitlements where source = 'free_trial'");
    expect(rows[0].n).toBe(1);
  });

  it('premium (all_access) opens every topic; an expired one does not', async () => {
    const { a, id } = await user();
    await pool.query("insert into entitlements (user_id, kind, source, expires_at) values ($1, 'all_access', 'subscription', now() - interval '1 day')", [id]);
    expect((await topicIds(a)).some((t: any) => t.unlocked)).toBe(false);
    await pool.query("insert into entitlements (user_id, kind, source) values ($1, 'all_access', 'grant')", [id]);
    expect((await topicIds(a)).every((t: any) => t.unlocked)).toBe(true);
    expect((await a.get('/api/auth/me')).body.plan).toBe('premium');
  });
});

describe('your people', () => {
  const boss = { name: 'Raj', relationship: 'boss', traits: ['Direct', 'Busy'], notes: 'Wants numbers first.', practiceGoal: 'Ask for a raise' };

  it('adds, edits, lists and deletes people', async () => {
    const { a } = await user();
    const created = await a.post('/api/people').send(boss);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Raj', relationship: 'boss', traits: ['Direct', 'Busy'] });
    const upd = await a.put(`/api/people/${created.body.id}`).send({ ...boss, traits: ['Skeptical'] });
    expect(upd.body.traits).toEqual(['Skeptical']);
    expect((await a.get('/api/people')).body).toHaveLength(1);
    expect((await a.delete(`/api/people/${created.body.id}`)).status).toBe(200);
    expect((await a.get('/api/people')).body).toHaveLength(0);
  });

  it('validates input', async () => {
    const { a } = await user();
    expect((await a.post('/api/people').send({ ...boss, relationship: 'enemy' })).status).toBe(400);
    expect((await a.post('/api/people').send({ ...boss, name: '' })).status).toBe(400);
    expect((await a.post('/api/people').send({ ...boss, traits: ['Mean'] })).status).toBe(400);
    expect((await a.post('/api/people').send({ ...boss, notes: 'x'.repeat(501) })).status).toBe(400);
  });

  it("can't see or change another user's people", async () => {
    const { a } = await user('a@example.com');
    const { a: b } = await user('b@example.com');
    const p = (await a.post('/api/people').send(boss)).body;
    expect((await b.get('/api/people')).body).toHaveLength(0);
    expect((await b.put(`/api/people/${p.id}`).send(boss)).status).toBe(404);
    expect((await b.delete(`/api/people/${p.id}`)).status).toBe(404);
  });

  it('caps the number of people', async () => {
    const { a, id } = await user();
    await pool.query("insert into people (user_id, name, relationship) select $1, 'P' || g, 'friend' from generate_series(1, 20) g", [id]);
    expect((await a.post('/api/people').send(boss)).status).toBe(409);
  });
});

describe('catalogue CSV import', () => {
  const write = (s: string) => { const f = path.join(os.tmpdir(), `cat-${Math.random()}.csv`); fs.writeFileSync(f, s); return f; };

  it('reads fiction and non-fiction, any number of books per topic', () => {
    const cats = readCatalog(write('Heading,Heading Icon,Topic,Book Title,Author,Book Type\nLeading,🧭,Trust,The Speed of Trust,Covey,Non-fiction\nLeading,,Trust,The Lord of the Rings,Tolkien,Fiction\n'));
    expect(cats[0]).toMatchObject({ name: 'Leading', icon: '🧭' });
    expect(cats[0].topics[0].books.map((b) => b.kind)).toEqual(['nonfiction', 'fiction']);
  });

  it('reads the Excel workbook: 8 headings, 99 topics, 3 books each', async () => {
    const x = await loadCatalog();
    expect(x).toHaveLength(8);
    const topics = x.flatMap((h) => h.topics);
    expect(topics).toHaveLength(99);
    expect(topics.every((t) => t.books.length === 3)).toBe(true);
    expect(topics[0].books[0]).toEqual({ title: 'Thinking, Fast and Slow', author: 'Daniel Kahneman', kind: 'nonfiction', buyUrl: null });
  });

  it('reports bad rows with line numbers', () => {
    expect(() => readCatalog(write('heading,topic,book_title,book_type\nA,T1,B1,\nA,,B2,\nB,T1,B3,\nA,T2,B4,poetry\n')))
      .toThrow(/Line 3: heading, topic and book_title are required\n.*Line 4: topic "T1" is under both.*\n.*Line 5: book_type/);
  });
});
