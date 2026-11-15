import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users, profiles, userProgress } from '../db/schema.js';
import {
  hashPassword, checkPassword, setSession, clearSession, requireAuth, issueToken, consumeToken,
} from '../lib/auth.js';
import { sendMail } from '../lib/mailer.js';
import { config } from '../lib/config.js';
import { HttpError } from '../lib/errors.js';
import { email, password, name } from '../lib/validate.js';
import { loadMe } from './me.js';

export const auth = Router();

const limiter = rateLimit({ windowMs: 15 * 60_000, limit: config.isTest ? 1000 : 30, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' } });
auth.use(['/signup', '/login', '/forgot-password', '/reset-password', '/resend-verification'], limiter);

async function sendVerification(userId: string, to: string) {
  const token = await issueToken(userId, 'verify_email', 24 * 60);
  await sendMail({ to, subject: 'Verify your Insight email',
    text: `Welcome to Insight! Confirm your email address:\n${config.appUrl}/verify-email?token=${token}\n\nThis link expires in 24 hours.` });
}

auth.post('/signup', async (req, res) => {
  const body = z.object({ name, email, password }).parse(req.body);
  const passwordHash = await hashPassword(body.password);
  const tz = typeof req.body.timezone === 'string' ? req.body.timezone : 'UTC';
  const user = await db.transaction(async (tx) => {
    const [u] = await tx.insert(users).values({ name: body.name, email: body.email, passwordHash })
      .onConflictDoNothing({ target: users.email }).returning();
    if (!u) throw new HttpError(409, 'An account with this email already exists. Try logging in.', 'email_taken');
    await tx.insert(profiles).values({ userId: u.id, timezone: safeTz(tz) });
    await tx.insert(userProgress).values({ userId: u.id });
    return u;
  });
  await sendVerification(user.id, user.email);
  setSession(res, user);
  res.status(201).json(await loadMe(user.id));
});

auth.post('/login', async (req, res) => {
  const body = z.object({ email, password: z.string().max(128) }).parse(req.body);
  const [u] = await db.select().from(users).where(eq(users.email, body.email));
  // Same message for unknown email and wrong password.
  if (!u || !(await checkPassword(body.password, u.passwordHash))) throw new HttpError(401, 'Email or password is incorrect', 'bad_credentials');
  setSession(res, u);
  res.json(await loadMe(u.id));
});

auth.post('/logout', (_req, res) => { clearSession(res); res.json({ ok: true }); });

auth.get('/me', requireAuth, async (req, res) => { res.json(await loadMe(req.userId!)); });

auth.post('/verify-email', async (req, res) => {
  const { token } = z.object({ token: z.string().min(10).max(200) }).parse(req.body);
  const userId = await consumeToken(token, 'verify_email');
  await db.update(users).set({ emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` }).where(eq(users.id, userId));
  res.json({ ok: true });
});

auth.post('/resend-verification', requireAuth, async (req, res) => {
  const [u] = await db.select().from(users).where(eq(users.id, req.userId!));
  if (!u.emailVerifiedAt) await sendVerification(u.id, u.email);
  res.json({ ok: true });
});

auth.post('/forgot-password', async (req, res) => {
  const body = z.object({ email }).parse(req.body);
  const [u] = await db.select().from(users).where(eq(users.email, body.email));
  if (u) {
    const token = await issueToken(u.id, 'reset_password', 60);
    await sendMail({ to: u.email, subject: 'Reset your Insight password',
      text: `Someone asked to reset your Insight password. If it was you, choose a new one here:\n${config.appUrl}/reset-password?token=${token}\n\nThis link expires in 1 hour. If you didn't ask, ignore this email.` });
  }
  // Always the same answer, so the endpoint can't be used to discover accounts.
  res.json({ ok: true });
});

auth.post('/reset-password', async (req, res) => {
  const body = z.object({ token: z.string().min(10).max(200), password }).parse(req.body);
  const userId = await consumeToken(body.token, 'reset_password');
  const [u] = await db.update(users).set({
    passwordHash: await hashPassword(body.password),
    tokenVersion: sql`${users.tokenVersion} + 1`, // signs out every other device
    emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`, // they proved they own the inbox
  }).where(eq(users.id, userId)).returning();
  setSession(res, u);
  res.json(await loadMe(u.id));
});

function safeTz(tz: string) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz.slice(0, 64); } catch { return 'UTC'; }
}
