import express, { Express } from 'express';
import type { Client } from '@libsql/client';
import { authRouter } from './routes/auth.js';
import { fleetRouter } from './routes/fleet.js';
import { planRouter } from './routes/plan.js';

export function createApp(db: Client): Express {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/auth', authRouter(db));
  app.use('/api/fleet', fleetRouter(db));
  app.use('/api/plan', planRouter(db));
  return app;
}
