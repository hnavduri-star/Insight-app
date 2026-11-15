import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { auth } from './routes/auth.js';
import { me } from './routes/me.js';
import { topicRoutes } from './routes/topics.js';
import { peopleRoutes } from './routes/people.js';
import { billing, stripeWebhook } from './routes/billing.js';
import { biteRoutes } from './routes/bites.js';
import { practiceRoutes } from './routes/practice.js';
import { situationRoutes } from './routes/situations.js';
import { roleplayRoutes } from './routes/roleplay.js';
import { dailyRoutes } from './routes/daily.js';
import { homeRoutes } from './routes/home.js';
import { checkinRoutes } from './routes/checkins.js';
import { aiEnabled, findApiKey } from './lib/ai.js';
import { errorHandler, HttpError } from './lib/errors.js';
import { PERSONAS, INDUSTRIES, GOALS, DAILY_MINUTES, COACHES, RELATIONSHIPS, TRAITS } from '../../shared/options.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  // Before express.json: Stripe signs the raw body.
  app.use('/api/billing/webhook', stripeWebhook);
  app.use(express.json({ limit: '20kb' }));
  app.use(cookieParser());

  // CSRF defence in depth (cookies are also SameSite=Lax): state-changing API calls must be JSON.
  app.use('/api', (req, _res, next) => {
    const bodyless = req.method === 'DELETE' && !req.headers['content-length'] && !req.headers['transfer-encoding'];
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !bodyless && !req.is('application/json')) {
      return next(new HttpError(415, 'Requests must be JSON'));
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    // Never includes the key itself: only whether one was found, and the deployed version.
    res.json({ ok: true, ai: aiEnabled(), aiHint: findApiKey().hint, version: (process.env.RENDER_GIT_COMMIT ?? 'local').slice(0, 7) });
  });
  app.get('/api/options', (_req, res) => { res.json({ personas: PERSONAS, industries: INDUSTRIES, goals: GOALS, dailyMinutes: DAILY_MINUTES, coaches: COACHES, relationships: RELATIONSHIPS, traits: TRAITS }); });
  app.use('/api/auth', auth);
  app.use('/api/me', me);
  app.use('/api/topics', topicRoutes);
  app.use('/api/people', peopleRoutes);
  app.use('/api/billing', billing);
  app.use('/api/bites', biteRoutes);
  app.use('/api/practice', practiceRoutes);
  app.use('/api/situations', situationRoutes);
  app.use('/api/roleplay', roleplayRoutes);
  app.use('/api/daily', dailyRoutes);
  app.use('/api/home', homeRoutes);
  app.use('/api/checkins', checkinRoutes);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

  // In production the API also serves the built client.
  const dist = path.resolve(import.meta.dirname, '../../client/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
