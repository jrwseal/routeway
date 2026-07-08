import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Express } from 'express';
import { createDb } from '../server/db';
import { createApp } from '../server/app';

let appPromise: Promise<Express> | null = null;

function getApp(): Promise<Express> {
  if (!appPromise) {
    appPromise = createDb(process.env.TURSO_DATABASE_URL!, process.env.TURSO_AUTH_TOKEN)
      .then((db) => createApp(db));
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp();
  app(req as any, res as any);
}
