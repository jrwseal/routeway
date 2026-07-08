import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDb } from './db.js';
import { createApp } from './app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  let dbUrl: string;
  let authToken: string | undefined;

  if (tursoUrl) {
    dbUrl = tursoUrl;
    authToken = process.env.TURSO_AUTH_TOKEN;
  } else {
    const dataDir = path.join(__dirname, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    dbUrl = `file:${path.join(dataDir, 'app.db')}`;
  }

  const db = await createDb(dbUrl, authToken);
  const app = createApp(db);
  const port = Number(process.env.PORT) || 3001;

  app.listen(port, () => {
    console.log(`RouteWay API listening on port ${port}`);
  });
}

main();
