import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import type { DatabaseSync } from 'node:sqlite';
import { authRouter } from './routes/auth';
import { driversRouter } from './routes/drivers';
import { fleetRouter } from './routes/fleet';

export function createApp(db: DatabaseSync): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRouter(db));
  app.use('/api/drivers', driversRouter(db));
  app.use('/api/fleet', fleetRouter(db));
  return app;
}
