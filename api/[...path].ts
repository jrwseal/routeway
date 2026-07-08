import type { IncomingMessage, ServerResponse } from 'node:http';
import { createDb } from '../server/db';
import { createApp } from '../server/app';

let appPromise: ReturnType<typeof createApp> | null = null;

async function getApp() {
  if (!appPromise) {
    const db = await createDb(process.env.TURSO_DATABASE_URL!, process.env.TURSO_AUTH_TOKEN);
    appPromise = createApp(db);
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp();
  app(req as any, res as any);
}
