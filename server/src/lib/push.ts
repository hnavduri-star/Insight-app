import webpush from 'web-push';
import { and, eq, gt, isNotNull, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { appSettings, reminderLog, reminderSettings, userProgress } from '../db/schema.js';
import { currentStreak, localDay } from './activity.js';

/**
 * Daily reminders by web push (works on Android and on iPhone once Insight is added to the
 * home screen). Keys come from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY, or are generated once and saved.
 */
let keys: { publicKey: string; privateKey: string } | null = null;
export async function vapidKeys() {
  if (keys) return keys;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  else {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, 'vapid'));
    if (row) keys = row.value as typeof keys;
    else {
      const k = webpush.generateVAPIDKeys();
      await db.insert(appSettings).values({ key: 'vapid', value: k }).onConflictDoNothing();
      const [saved] = await db.select().from(appSettings).where(eq(appSettings.key, 'vapid'));
      keys = saved.value as typeof keys;
    }
  }
  webpush.setVapidDetails(`mailto:${process.env.VAPID_CONTACT ?? 'support@insight.app'}`, keys!.publicKey, keys!.privateKey);
  return keys!;
}

export async function sendPush(userId: string, subscription: webpush.PushSubscription, payload: { title: string; body: string; url: string }, type: string) {
  await vapidKeys();
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 6 * 3600 });
    await db.insert(reminderLog).values({ userId, type, channel: 'push' });
    return true;
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    // The browser unsubscribed or the subscription expired: stop sending to it.
    if (status === 404 || status === 410) await db.update(reminderSettings).set({ pushSubscriptionJson: null }).where(eq(reminderSettings.userId, userId));
    else console.warn('[push] send failed', status ?? (e as Error).message);
    return false;
  }
}

/** "HH:MM" in a time zone right now. */
const localHM = (tz: string, now: Date) => {
  try { return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now); }
  catch { return now.toISOString().slice(11, 16); }
};
const minutes = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/** Sends today's reminder to everyone whose reminder time has just passed and who hasn't learned yet today. */
export async function sendDueReminders(now = new Date(), windowMin = 30) {
  const rows = await db.select({ s: reminderSettings, p: userProgress }).from(reminderSettings)
    .leftJoin(userProgress, eq(userProgress.userId, reminderSettings.userId))
    .where(and(isNotNull(reminderSettings.consentAt), eq(reminderSettings.paused, false), isNotNull(reminderSettings.reminderTime), isNotNull(reminderSettings.pushSubscriptionJson)));
  let sent = 0;
  for (const { s, p } of rows) {
    const nowM = minutes(localHM(s.timezone, now)), at = minutes(String(s.reminderTime));
    const diff = (nowM - at + 1440) % 1440;
    if (diff >= windowMin) continue;
    const today = localDay(s.timezone, now);
    if (p?.lastActiveDate === today) continue; // already learned today
    const [recent] = await db.select({ id: reminderLog.id }).from(reminderLog)
      .where(and(eq(reminderLog.userId, s.userId), eq(reminderLog.type, 'daily'), gt(reminderLog.sentAt, sql`now() - interval '20 hours'`))).limit(1);
    if (recent) continue;
    const streak = p ? currentStreak({ streak: p.streak, lastActiveDate: p.lastActiveDate, freezes: p.freezes }, today) : 0;
    const body = streak > 0 ? `Keep your ${streak}-day streak going: review, then one rep.` : 'Five minutes: a quick review and one practice rep.';
    if (await sendPush(s.userId, s.pushSubscriptionJson as webpush.PushSubscription, { title: 'Your 5 minutes are ready 🔥', body, url: '/daily' }, 'daily')) sent++;
  }
  return sent;
}

export function startReminderLoop() {
  const tick = () => sendDueReminders().catch((e) => console.warn('[reminders]', e instanceof Error ? e.message : e));
  setTimeout(tick, 20_000);
  setInterval(tick, 10 * 60_000).unref();
}
