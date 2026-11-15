import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import Stripe from 'stripe';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/client.js';
import { requirePremium } from '../src/lib/access.js';

const SECRET = 'whsec_test_secret';
const app = createApp();
const stripe = new Stripe('sk_test_placeholder');

beforeAll(() => { process.env.STRIPE_WEBHOOK_SECRET = SECRET; });
beforeEach(async () => { await pool.query('delete from users; delete from stripe_events'); });
afterAll(async () => { await pool.end(); });

async function user() {
  const a = request.agent(app);
  const r = await a.post('/api/auth/signup').send({ name: 'Sam', email: 'sam@example.com', password: 'secret1' });
  return { a, id: r.body.id as string };
}

let n = 0;
function send(type: string, object: object, id = `evt_${++n}`) {
  const payload = JSON.stringify({ id, object: 'event', type, data: { object } });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return request(app).post('/api/billing/webhook').set('stripe-signature', header).set('content-type', 'application/json').send(payload);
}
const sub = (userId: string, status: string, periodEnd = Math.floor(Date.now() / 1000) + 30 * 86400) => ({
  id: 'sub_123', object: 'subscription', customer: 'cus_123', status, metadata: { userId },
  items: { data: [{ current_period_end: periodEnd }] },
});

describe('Stripe subscriptions', () => {
  it('rejects webhooks with a bad signature', async () => {
    const r = await request(app).post('/api/billing/webhook').set('stripe-signature', 't=1,v1=bad').set('content-type', 'application/json').send('{}');
    expect(r.status).toBe(400);
  });

  it('turns Premium on when a subscription starts and off when it ends', async () => {
    const { a, id } = await user();
    expect((await send('customer.subscription.created', sub(id, 'active'))).status).toBe(200);
    let me = (await a.get('/api/auth/me')).body;
    expect(me).toMatchObject({ plan: 'premium', planSource: 'subscription' });
    expect(new Date(me.premiumUntil).getTime()).toBeGreaterThan(Date.now() + 29 * 86400_000);
    expect((await a.get('/api/topics')).body.flatMap((c: any) => c.topics).every((t: any) => t.unlocked)).toBe(true);
    await expect(requirePremium(id)).resolves.toBeUndefined();

    await send('customer.subscription.deleted', sub(id, 'canceled'));
    me = (await a.get('/api/auth/me')).body;
    expect(me.plan).toBe('free');
    await expect(requirePremium(id)).rejects.toMatchObject({ status: 402 });
  });

  it('does not grant Premium before the first payment', async () => {
    const { a, id } = await user();
    await send('customer.subscription.created', sub(id, 'incomplete'));
    expect((await a.get('/api/auth/me')).body.plan).toBe('free');
  });

  it('finds the user by Stripe customer when metadata is missing, and applies each event once', async () => {
    const { a, id } = await user();
    await send('checkout.session.completed', { id: 'cs_1', object: 'checkout.session', client_reference_id: id, customer: 'cus_123' });
    const s = { ...sub(id, 'active'), metadata: {} };
    await send('customer.subscription.updated', s, 'evt_dup');
    expect((await a.get('/api/auth/me')).body.plan).toBe('premium');
    await send('customer.subscription.deleted', { ...s, status: 'canceled' }, 'evt_dup'); // same id: ignored
    expect((await a.get('/api/auth/me')).body.plan).toBe('premium');
    const { rows } = await pool.query("select count(*)::int c from entitlements where source = 'subscription'");
    expect(rows[0].c).toBe(1);
  });

  it('keeps checkout switched off until Stripe keys and prices are set', async () => {
    const { a } = await user();
    expect((await a.get('/api/billing/plans')).body).toEqual({ enabled: false, plans: [] });
    const r = await a.post('/api/billing/checkout').send({ interval: 'year' });
    expect(r.status).toBe(503);
    expect((await a.post('/api/billing/checkout').send({ interval: 'week' })).status).toBe(400);
  });
});

describe('practice is Premium only', () => {
  it('free users (even with a free topic) cannot practise', async () => {
    const { a, id } = await user();
    const t = (await a.get('/api/topics')).body[0].topics[0];
    await a.post('/api/me/free-topic').send({ topicId: t.id });
    await expect(requirePremium(id)).rejects.toMatchObject({ status: 402, code: 'premium_required' });
  });
});

describe('test mode (Premium without payment, for trying the app)', () => {
  it('upgrades and cancels with no payment, showing USD plans', async () => {
    process.env.BILLING_TEST_MODE = 'true';
    process.env.TEST_PRICE_MONTHLY_USD = '9.99';
    try {
      const { a, id } = await user();
      const plans = (await a.get('/api/billing/plans')).body;
      expect(plans).toMatchObject({ enabled: false, testMode: true });
      expect(plans.plans[0]).toEqual({ interval: 'month', amount: 999, currency: 'usd' });
      const me = (await a.post('/api/billing/test-upgrade').send({ interval: 'year' })).body;
      expect(me).toMatchObject({ plan: 'premium', planSource: 'test' });
      expect(new Date(me.premiumUntil).getTime()).toBeGreaterThan(Date.now() + 360 * 86400_000);
      await expect(requirePremium(id)).resolves.toBeUndefined();
      expect((await a.post('/api/billing/test-cancel').send({})).body.plan).toBe('free');
    } finally { delete process.env.BILLING_TEST_MODE; delete process.env.TEST_PRICE_MONTHLY_USD; }
  });

  it('is off unless enabled, and always off once Stripe is configured', async () => {
    const { a } = await user();
    expect((await a.post('/api/billing/test-upgrade').send({ interval: 'month' })).status).toBe(404);
    Object.assign(process.env, { BILLING_TEST_MODE: 'true', STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_PRICE_MONTHLY: 'price_m', STRIPE_PRICE_ANNUAL: 'price_y' });
    try {
      expect((await a.post('/api/billing/test-upgrade').send({ interval: 'month' })).status).toBe(404);
      expect((await a.get('/api/auth/me')).body.plan).toBe('free');
    } finally {
      for (const k of ['BILLING_TEST_MODE', 'STRIPE_SECRET_KEY', 'STRIPE_PRICE_MONTHLY', 'STRIPE_PRICE_ANNUAL']) delete process.env[k];
    }
  });
});
