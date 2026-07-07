import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDb } from './db';
import { createApp } from './app';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = createDb(path.join(dataDir, 'app.db'));
const app = createApp(db);
const port = Number(process.env.PORT) || 3001;

app.listen(port, () => {
  console.log(`RouteWay API listening on port ${port}`);
});
