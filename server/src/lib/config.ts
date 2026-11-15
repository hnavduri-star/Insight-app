import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';
const jwtSecret = process.env.JWT_SECRET ?? '';
if (isProd && jwtSecret.length < 32) throw new Error('JWT_SECRET must be set to at least 32 characters in production');

export const config = {
  isProd,
  isTest: process.env.NODE_ENV === 'test',
  port: Number(process.env.PORT ?? 4000),
  // Render sets RENDER_EXTERNAL_URL to the service's public address.
  appUrl: process.env.APP_URL ?? process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:5173',
  jwtSecret: jwtSecret || 'dev-only-secret-do-not-use-in-production',
  mailFrom: process.env.MAIL_FROM ?? 'Insight <no-reply@example.com>',
  sessionDays: 30,
};
