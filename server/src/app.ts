import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { auth } from './routes/auth.js';
import { me } from './routes/me.js';
import { topicRoutes } from './routes/topics.js';
import { errorHandler, HttpError } from './lib/errors.js';
import { PERSONAS, INDUSTRIES, GOALS, DAILY_MINUTES, COACHES } from '../../shared/options.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '20kb' }));
  app.use(cookieParser());

  // CSRF defence in depth (cookies are also SameSite=Lax): state-changing API calls must be JSON.
  app.use('/api', (req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.is('application/json')) {
      return next(new HttpError(415, 'Requests must be JSON'));
    }
    next();
  });

  app.get('/api/health', (_req, res) => { res.json({ ok: true }); });
  app.get('/api/options', (_req, res) => { res.json({ personas: PERSONAS, industries: INDUSTRIES, goals: GOALS, dailyMinutes: DAILY_MINUTES, coaches: COACHES }); });
  app.use('/api/auth', auth);
  app.use('/api/me', me);
  app.use('/api/topics', topicRoutes);
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
