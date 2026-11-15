/**
 * Stripe subscriptions (monthly and annual). Checkout is Stripe-hosted, so card,
 * Apple Pay and Google Pay all work without extra code: Apple Pay and Google Pay
 * appear automatically on supported devices once enabled under
 * Settings → Payment methods in the Stripe dashboard.
 *
 * Premium = an `all_access` entitlement with source `subscription`, keyed by the
 * Stripe subscription id and kept in step by webhooks (and by /billing/confirm on
 * return from Checkout, in case the webhook is slower than the redirect).
 */
import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { billingCustomers, entitlements, users } from '../db/schema.js';
import { HttpError } from './errors.js';

type Tx = Pick<typeof db, 'select' | 'insert' | 'update'>;
export type Interval = 'month' | 'year';

const env = () => ({
  key: process.env.STRIPE_SECRET_KEY ?? '',
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  prices: { month: process.env.STRIPE_PRICE_MONTHLY ?? '', year: process.env.STRIPE_PRICE_ANNUAL ?? '' } as Record<Interval, string>,
});

let client: Stripe | null = null;
let clientKey = '';
export function stripe(): Stripe {
  const { key } = env();
  if (!key) throw new HttpError(503, 'Subscriptions are not available yet.', 'billing_disabled');
  if (!client || clientKey !== key) { client = new Stripe(key); clientKey = key; }
  return client;
}
/** For tests and the webhook verifier, which works without network access. */
export const webhookVerifier = () => new Stripe(env().key || 'sk_test_placeholder');

export const billingEnabled = () => { const e = env(); return !!(e.key && e.prices.month && e.prices.year); };

/**
 * Test mode: lets people try Premium end to end with no payment. It is only
 * available while Stripe is NOT configured, so it can never bypass real billing.
 * Display prices (USD) come from TEST_PRICE_MONTHLY_USD / TEST_PRICE_ANNUAL_USD.
 */
export const testModeEnabled = () => !billingEnabled() && process.env.BILLING_TEST_MODE === 'true';
const usdCents = (v?: string) => (v && !isNaN(Number(v)) ? Math.round(Number(v) * 100) : null);
export const TEST_REF = (userId: string) => `test_${userId}`;

export async function testUpgrade(userId: string, interval: Interval) {
  if (!testModeEnabled()) throw new HttpError(404, 'Not found');
  const end = new Date();
  if (interval === 'month') end.setMonth(end.getMonth() + 1); else end.setFullYear(end.getFullYear() + 1);
  await db.insert(entitlements)
    .values({ userId, kind: 'all_access', source: 'grant', providerRef: TEST_REF(userId), expiresAt: end })
    .onConflictDoUpdate({ target: entitlements.providerRef, set: { expiresAt: end } });
}

export async function testCancel(userId: string) {
  if (!testModeEnabled()) throw new HttpError(404, 'Not found');
  await db.update(entitlements).set({ expiresAt: new Date() }).where(eq(entitlements.providerRef, TEST_REF(userId)));
}

// ---------- Plans shown on the paywall ----------
type Plan = { interval: Interval; amount: number | null; currency: string | null };
let planCache: { at: number; plans: Plan[] } | null = null;

export async function listPlans(): Promise<{ enabled: boolean; testMode?: boolean; plans: Plan[] }> {
  if (testModeEnabled()) {
    return { enabled: false, testMode: true, plans: [
      { interval: 'month', amount: usdCents(process.env.TEST_PRICE_MONTHLY_USD), currency: 'usd' },
      { interval: 'year', amount: usdCents(process.env.TEST_PRICE_ANNUAL_USD), currency: 'usd' },
    ] };
  }
  if (!billingEnabled()) return { enabled: false, plans: [] };
  if (planCache && Date.now() - planCache.at < 10 * 60_000) return { enabled: true, plans: planCache.plans };
  const s = stripe();
  const plans = await Promise.all((['month', 'year'] as Interval[]).map(async (interval) => {
    const p = await s.prices.retrieve(env().prices[interval]);
    return { interval, amount: p.unit_amount, currency: p.currency };
  }));
  planCache = { at: Date.now(), plans };
  return { enabled: true, plans };
}

// ---------- Customers ----------
async function customerFor(userId: string) {
  const [existing] = await db.select().from(billingCustomers).where(eq(billingCustomers.userId, userId));
  if (existing) return existing.stripeCustomerId;
  const [u] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, userId));
  const c = await stripe().customers.create({ email: u.email, name: u.name, metadata: { userId } });
  await db.insert(billingCustomers).values({ userId, stripeCustomerId: c.id }).onConflictDoNothing();
  const [row] = await db.select().from(billingCustomers).where(eq(billingCustomers.userId, userId));
  return row.stripeCustomerId;
}

export async function createCheckout(userId: string, interval: Interval, appUrl: string) {
  if (!billingEnabled()) throw new HttpError(503, 'Subscriptions are not available yet.', 'billing_disabled');
  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer: await customerFor(userId),
    client_reference_id: userId,
    line_items: [{ price: env().prices[interval], quantity: 1 }],
    subscription_data: { metadata: { userId } },
    allow_promotion_codes: true,
    success_url: `${appUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/?checkout=cancelled`,
  });
  return session.url!;
}

export async function createPortal(userId: string, appUrl: string) {
  const [row] = await db.select().from(billingCustomers).where(eq(billingCustomers.userId, userId));
  if (!row) throw new HttpError(404, 'No subscription found for this account.', 'no_customer');
  const s = await stripe().billingPortal.sessions.create({ customer: row.stripeCustomerId, return_url: `${appUrl}/profile` });
  return s.url;
}

/** On return from Checkout: apply the subscription now rather than wait for the webhook. */
export async function confirmCheckout(userId: string, sessionId: string) {
  const s = await stripe().checkout.sessions.retrieve(sessionId, { expand: ['subscription'] });
  if (s.client_reference_id !== userId) throw new HttpError(404, 'Checkout session not found');
  if (typeof s.customer === 'string') await linkCustomer(db, userId, s.customer);
  if (s.subscription && typeof s.subscription === 'object') await applySubscription(db, s.subscription);
}

// ---------- Keeping entitlements in step with Stripe ----------
const GRACE_MS = 2 * 24 * 3600 * 1000; // covers renewal webhooks that arrive a little late
const LIVE = new Set(['active', 'trialing', 'past_due']);

export async function linkCustomer(tx: Tx, userId: string, customerId: string) {
  await tx.insert(billingCustomers).values({ userId, stripeCustomerId: customerId }).onConflictDoNothing();
}

export async function applySubscription(tx: Tx, sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  let userId = sub.metadata?.userId;
  if (!userId) {
    const [c] = await tx.select().from(billingCustomers).where(eq(billingCustomers.stripeCustomerId, customerId));
    userId = c?.userId;
  }
  if (!userId) { console.warn(`[billing] no user for subscription ${sub.id}`); return; }
  const [exists] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId));
  if (!exists) return; // account deleted
  await linkCustomer(tx, userId, customerId);

  if (sub.status === 'incomplete') return; // first payment not done yet
  const periodEnd = sub.items?.data?.[0]?.current_period_end ?? (sub as any).current_period_end;
  const expiresAt = LIVE.has(sub.status) && periodEnd ? new Date(periodEnd * 1000 + GRACE_MS) : new Date();
  await tx.insert(entitlements)
    .values({ userId, kind: 'all_access', source: 'subscription', providerRef: sub.id, expiresAt })
    .onConflictDoUpdate({ target: entitlements.providerRef, set: { expiresAt } });
}

/** Called when an account is deleted: stop billing. */
export async function cancelSubscriptionsFor(userId: string) {
  if (!env().key) return;
  const rows = await db.select().from(entitlements).where(eq(entitlements.userId, userId));
  for (const r of rows) {
    if (r.source !== 'subscription' || !r.providerRef) continue;
    if (r.expiresAt && r.expiresAt < new Date()) continue;
    try { await stripe().subscriptions.cancel(r.providerRef); }
    catch (e) { console.error(`[billing] could not cancel ${r.providerRef} for deleted user`, e); }
  }
}
