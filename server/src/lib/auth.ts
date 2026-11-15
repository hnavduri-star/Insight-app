import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { and, eq, isNull, gt } from 'drizzle-orm';
import type { RequestHandler, Response } from 'express';
import { db } from '../db/client.js';
import { users, authTokens } from '../db/schema.js';
import { config } from './config.js';
import { HttpError } from './errors.js';

export const COOKIE = 'insight_session';

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const checkPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export function setSession(res: Response, user: { id: string; tokenVersion: number }) {
  const token = jwt.sign({ sub: user.id, v: user.tokenVersion }, config.jwtSecret, { expiresIn: `${config.sessionDays}d` });
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: config.isProd, path: '/',
    maxAge: config.sessionDays * 24 * 3600 * 1000,
  });
}

export const clearSession = (res: Response) => res.clearCookie(COOKIE, { path: '/' });

declare global {
  namespace Express { interface Request { userId?: string } }
}

/** Rejects unauthenticated requests; sets req.userId. Revoked tokens fail via token_version. */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const token = req.cookies?.[COOKIE];
    if (!token) throw new HttpError(401, 'Please log in', 'unauthenticated');
    let payload: { sub: string; v: number };
    try { payload = jwt.verify(token, config.jwtSecret) as typeof payload; }
    catch { throw new HttpError(401, 'Your session has expired. Please log in again.', 'unauthenticated'); }
    const [u] = await db.select({ id: users.id, v: users.tokenVersion }).from(users).where(eq(users.id, payload.sub));
    if (!u || u.v !== payload.v) throw new HttpError(401, 'Your session has expired. Please log in again.', 'unauthenticated');
    req.userId = u.id;
    next();
  } catch (e) { next(e); }
};

// ---------- One-time tokens (email verification, password reset) ----------
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export async function issueToken(userId: string, purpose: 'verify_email' | 'reset_password', ttlMinutes: number) {
  const raw = crypto.randomBytes(32).toString('base64url');
  await db.insert(authTokens).values({
    userId, purpose, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
  });
  return raw; // only the hash is stored
}

export async function consumeToken(raw: string, purpose: 'verify_email' | 'reset_password') {
  const [row] = await db.update(authTokens).set({ usedAt: new Date() })
    .where(and(eq(authTokens.tokenHash, sha256(raw)), eq(authTokens.purpose, purpose),
      isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())))
    .returning({ userId: authTokens.userId });
  if (!row) throw new HttpError(400, 'This link is invalid or has expired. Please request a new one.', 'bad_token');
  return row.userId;
}
