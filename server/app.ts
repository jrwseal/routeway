import express, { Express } from 'express';
import type { Client } from '@libsql/client';
import { fleetRouter } from './routes/fleet';
import { planRouter } from './routes/plan';

export function createApp(db: Client): Express {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/fleet', fleetRouter(db));
  app.use('/api/plan', planRouter(db));
  return app;
}
