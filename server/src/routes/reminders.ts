import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { reminderSettings } from '../db/schema.js';
import { requireAuth } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';
import { timezoneOf } from '../lib/activity.js';
import { sendPush, vapidKeys } from '../lib/push.js';

/** Daily reminder settings: a time of day, opt-in, and this device's push subscription. */
export const reminderRoutes = Router();
reminderRoutes.use(requireAuth);

const view = (s?: typeof reminderSettings.$inferSelect) => ({
  enabled: !!s?.consentAt && !s.paused && !!s.pushSubscriptionJson, time: s?.reminderTime ? String(s.reminderTime).slice(0, 5) : '08:30', subscribed: !!s?.pushSubscriptionJson,
});
const get = async (userId: string) => (await db.select().from(reminderSettings).where(eq(reminderSettings.userId, userId)))[0];

reminderRoutes.get('/', async (req, res) => {
  res.json({ ...view(await get(req.userId!)), publicKey: (await vapidKeys()).publicKey });
});

const subscription = z.object({ endpoint: z.string().url().max(1000), expirationTime: z.number().nullable().optional(), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) });

reminderRoutes.put('/', async (req, res) => {
  const b = z.object({ enabled: z.boolean(), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), subscription: subscription.optional() }).parse(req.body);
  const userId = req.userId!;
  const tz = await timezoneOf(userId);
  if (b.enabled && !b.subscription && !(await get(userId))?.pushSubscriptionJson) throw new HttpError(400, 'Allow notifications on this device first.', 'no_subscription');
  const values = {
    reminderTime: b.time, timezone: tz, paused: !b.enabled, channelsJson: ['push'],
    ...(b.enabled ? { consentAt: new Date() } : {}), ...(b.subscription ? { pushSubscriptionJson: b.subscription } : {}),
  };
  await db.insert(reminderSettings).values({ userId, ...values }).onConflictDoUpdate({ target: reminderSettings.userId, set: values });
  res.json(view(await get(userId)));
});

reminderRoutes.post('/test', async (req, res) => {
  const s = await get(req.userId!);
  if (!s?.pushSubscriptionJson) throw new HttpError(400, 'Turn on reminders on this device first.', 'no_subscription');
  const ok = await sendPush(req.userId!, s.pushSubscriptionJson as never, { title: 'Insight reminders are on 🔔', body: "This is what your daily nudge looks like.", url: '/daily' }, 'test');
  if (!ok) throw new HttpError(502, "We couldn't reach this device. Try turning reminders off and on again.", 'push_failed');
  res.json({ ok: true });
});
