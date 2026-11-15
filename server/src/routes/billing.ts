import express, { Router } from 'express';
import { z } from 'zod';
import type Stripe from 'stripe';
import { db } from '../db/client.js';
import { stripeEvents } from '../db/schema.js';
import { requireAuth } from '../lib/auth.js';
import { config } from '../lib/config.js';
import { HttpError } from '../lib/errors.js';
import {
  applySubscription, confirmCheckout, testUpgrade, testCancel, createCheckout, createPortal, linkCustomer, listPlans, webhookVerifier,
} from '../lib/billing.js';
import { loadMe } from './me.js';
import { openAccess } from '../lib/access.js';

export const billing = Router();

billing.get('/plans', requireAuth, async (_req, res) => { res.json(await listPlans()); });

billing.post('/checkout', requireAuth, async (req, res) => {
  const { interval } = z.object({ interval: z.enum(['month', 'year']) }).parse(req.body);
  if (openAccess()) throw new HttpError(409, 'Insight is free during the beta.', 'free_beta');
  const me = await loadMe(req.userId!);
  if (me.planSource === 'subscription') throw new HttpError(409, 'You already have Premium. Manage it from your Profile.', 'already_premium');
  res.json({ url: await createCheckout(req.userId!, interval, config.appUrl) });
});

billing.post('/confirm', requireAuth, async (req, res) => {
  const { sessionId } = z.object({ sessionId: z.string().startsWith('cs_').max(255) }).parse(req.body);
  await confirmCheckout(req.userId!, sessionId);
  res.json(await loadMe(req.userId!));
});

/** Test mode only (Stripe not configured): Premium without payment, for trying the app. */
billing.post('/test-upgrade', requireAuth, async (req, res) => {
  const { interval } = z.object({ interval: z.enum(['month', 'year']) }).parse(req.body);
  await testUpgrade(req.userId!, interval);
  res.json(await loadMe(req.userId!));
});
billing.post('/test-cancel', requireAuth, async (req, res) => {
  await testCancel(req.userId!);
  res.json(await loadMe(req.userId!));
});

billing.post('/portal', requireAuth, async (req, res) => {
  res.json({ url: await createPortal(req.userId!, config.appUrl) });
});

/** Stripe webhook. Mounted with a raw body parser (signature is over the exact bytes). */
export const stripeWebhook = Router();
stripeWebhook.post('/', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new HttpError(503, 'Webhook not configured');
  let event: Stripe.Event;
  try {
    event = webhookVerifier().webhooks.constructEvent(req.body, req.headers['stripe-signature'] as string, secret);
  } catch {
    throw new HttpError(400, 'Invalid signature');
  }
  await db.transaction(async (tx) => {
    const [fresh] = await tx.insert(stripeEvents).values({ id: event.id, type: event.type }).onConflictDoNothing().returning();
    if (!fresh) return; // already processed
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object;
        if (s.client_reference_id && typeof s.customer === 'string') await linkCustomer(tx, s.client_reference_id, s.customer);
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed':
        await applySubscription(tx, event.data.object);
        break;
    }
  });
  res.json({ received: true });
});
