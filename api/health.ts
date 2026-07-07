import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient } from '@libsql/client';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const db = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    const result = await db.execute('SELECT 1 as ok');
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: result.rows[0].ok === 1 }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: String(err) }));
  }
}
