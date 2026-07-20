# Auth, Roles & Driver Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One admin account can create and manage many driver accounts; each driver logs in and sees only their own assigned route (turn-by-turn nav + mark-delivered), enforced server-side.

**Architecture:** Express + `@libsql/client` (already deployed as a single Vercel serverless function). Add `users`/`sessions` tables to the existing DB; sessions are DB-backed (httpOnly cookie holding an opaque token) rather than JWT or in-memory, because the app runs stateless across serverless invocations. Passwords hashed with `bcryptjs` (pure JS, no native build step). No changes to VRP computation (`src/lib/algorithms.ts`, `geo.ts`).

**Tech Stack:** Express 4, `@libsql/client`, `bcryptjs`, React 19, Vitest + Supertest.

## Global Constraints

- Session strategy is DB-backed sessions via httpOnly cookie `sid`, not JWT — spec `docs/superpowers/specs/2026-07-20-auth-roles-driver-assignment-design.md`.
- Roles are exactly `'admin'` and `'driver'` (not `'planner'`).
- Default seed admin: username `admin`, password `admin123` (hashed at seed time). Document as a placeholder credential.
- Admin-only endpoints: `PUT /api/fleet`, `GET /api/fleet`, all of `/api/drivers/*`, `POST /api/plan`, `GET /api/plan/active`, `GET /api/plan/progress`.
- Driver-reachable endpoints: `GET /api/plan/my-route`, `POST /api/plan/progress` (server rejects a `routeIndex` that isn't theirs).
- Care's `DriverCheckIn` / geofence flow stays out of scope — not gated behind login.
- No password reset/email flows; no live-GPS admin view beyond the existing `LiveDeliveryStatus` polling (already built — only needs its underlying endpoint gated, which Task 6 does).
- Follow existing test conventions exactly: backend = Vitest + Supertest against `createDb(':memory:')` + `createApp(db)`; frontend components = `renderToStaticMarkup` string assertions (see `src/components/LoginMockup.test.tsx`), no React Testing Library in this repo.

---

### Task 1: DB schema — users, sessions, driver_user_id, seed admin

**Files:**
- Modify: `server/db.ts`
- Test: `server/db.test.ts`

**Interfaces:**
- Produces: `users` table (`id TEXT PK`, `username TEXT UNIQUE`, `password_hash TEXT`, `role TEXT CHECK IN ('admin','driver')`, `display_name TEXT`, `created_at TEXT`), `sessions` table (`token TEXT PK`, `user_id TEXT`, `created_at TEXT`, `expires_at TEXT`), `vehicles.driver_user_id TEXT` column. Seeded admin row: `username='admin'`, bcrypt hash of `'admin123'`, `role='admin'`, `display_name='Admin'`.

- [ ] **Step 1: Add `bcryptjs` dependency**

Edit `package.json` — add to `"dependencies"` (keep alphabetical order, after `"@vitejs/plugin-react"`):

```json
    "bcryptjs": "^2.4.3",
```

Add to `"devDependencies"` (after `"@google/genai"`):

```json
    "@types/bcryptjs": "^2.4.6",
```

Run: `npm install`
Expected: `bcryptjs` and `@types/bcryptjs` appear in `node_modules`, `package-lock.json` updated.

- [ ] **Step 2: Write the failing tests**

Append to `server/db.test.ts`, inside the existing `describe('createDb', ...)` block (add as new `it` blocks, e.g. after the `'seeds enable_cold_storage as 0 by default'` test):

```ts
  it('seeds a default admin user', async () => {
    const db = await createDb(':memory:');
    const row = (await db.execute("SELECT * FROM users WHERE username = 'admin'")).rows[0];
    expect(row).toBeDefined();
    expect(row.role).toBe('admin');
    expect(row.display_name).toBe('Admin');
    expect(row.password_hash).not.toBe('admin123');

    const bcrypt = await import('bcryptjs');
    expect(await bcrypt.compare('admin123', row.password_hash as string)).toBe(true);
  });

  it('does not reseed the admin user on a second call against the same file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'routeway-db-admin-seed-test-'));
    const dbPath = join(dir, 'test.db');
    try {
      const db1 = await createDb(`file:${dbPath}`);
      db1.close();
      const db2 = await createDb(`file:${dbPath}`);
      const count = (await db2.execute("SELECT COUNT(*) as count FROM users WHERE username = 'admin'")).rows[0].count as number;
      expect(count).toBe(1);
      db2.close();
    } finally {
      cleanupDir(dir);
    }
  });

  it('adds a driver_user_id column to vehicles', async () => {
    const db = await createDb(':memory:');
    const columns = (await db.execute('PRAGMA table_info(vehicles)')).rows as unknown as { name: string }[];
    expect(columns.some(c => c.name === 'driver_user_id')).toBe(true);
  });
```

- [ ] **Step 2b: Run tests to verify they fail**

Run: `npx vitest run server/db.test.ts`
Expected: FAIL — `no such table: users`.

- [ ] **Step 3: Implement the schema and seed logic**

In `server/db.ts`, add imports at the top (after the existing `@libsql/client` import):

```ts
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
```

Inside the `db.executeMultiple(...)` template literal, add two new tables right after the `plan_progress` table definition (before the closing backtick):

```sql

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'driver')),
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
```

After the existing `hasDepartureTimeColumn` migration block (the one that runs `ALTER TABLE vehicles ADD COLUMN departure_time ...`), add:

```ts
  const hasDriverUserIdColumn = vehicleColumns.some((c) => c.name === 'driver_user_id');
  if (!hasDriverUserIdColumn) {
    await db.execute('ALTER TABLE vehicles ADD COLUMN driver_user_id TEXT REFERENCES users(id)');
  }
```

Near the end of `createDb`, after the existing vehicle-seeding `if (vehicleCount === 0) { ... }` block and before `return db;`, add:

```ts
  const userCount = (await db.execute('SELECT COUNT(*) as count FROM users')).rows[0].count as number;
  if (userCount === 0) {
    const passwordHash = await bcrypt.hash('admin123', 10);
    await db.execute({
      sql: 'INSERT INTO users (id, username, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?)',
      args: [crypto.randomUUID(), 'admin', passwordHash, 'admin', 'Admin'],
    });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/db.test.ts`
Expected: PASS (all tests, including the 3 new ones and the pre-existing ones — the pre-existing `'backfills fuel_price...'` test manually creates its own `users` table with a different schema in its fixture SQL; since your new `CREATE TABLE IF NOT EXISTS users` won't override an existing table, that test is unaffected and keeps passing).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json server/db.ts server/db.test.ts
git commit -m "feat: add users/sessions schema and seed default admin"
```

---

### Task 2: Auth middleware

**Files:**
- Create: `server/middleware/auth.ts`

**Interfaces:**
- Consumes: `users`/`sessions` tables from Task 1.
- Produces: `SessionUser { id, username, role: 'admin'|'driver', displayName }`; `requireAuth(db: Client): RequestHandler`; `requireRole(db: Client, role: 'admin'|'driver'): RequestHandler`; `createSession(db: Client, userId: string): Promise<string>`; `destroySession(db: Client, token: string): Promise<void>`; `parseCookies(header: string | undefined): Record<string,string>`; `cookieOptions(): CookieOptions`; `SESSION_COOKIE_NAME: string`. `req.user?: SessionUser` augmented onto Express's `Request` type. Consumed by Tasks 3, 4, 5, 6.

No standalone test file — this is exercised indirectly through the route tests in Task 3 (which is the smallest surface that can observe its behavior via HTTP).

- [ ] **Step 1: Write the file**

Create `server/middleware/auth.ts`:

```ts
import crypto from 'node:crypto';
import type { Client } from '@libsql/client';
import type { CookieOptions, NextFunction, Request, RequestHandler, Response } from 'express';

export interface SessionUser {
  id: string;
  username: string;
  role: 'admin' | 'driver';
  displayName: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export const SESSION_COOKIE_NAME = 'sid';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_MS,
  };
}

export async function createSession(db: Client, userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await db.execute({
    sql: 'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)',
    args: [token, userId, expiresAt],
  });
  return token;
}

export async function destroySession(db: Client, token: string): Promise<void> {
  await db.execute({ sql: 'DELETE FROM sessions WHERE token = ?', args: [token] });
}

async function resolveUser(db: Client, req: Request): Promise<SessionUser | null> {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME];
  if (!token) return null;

  const result = await db.execute({
    sql: `
      SELECT u.id, u.username, u.role, u.display_name as displayName
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND s.expires_at > datetime('now')
    `,
    args: [token],
  });
  return (result.rows[0] as unknown as SessionUser | undefined) ?? null;
}

export function requireAuth(db: Client): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = await resolveUser(db, req);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    req.user = user;
    next();
  };
}

export function requireRole(db: Client, role: 'admin' | 'driver'): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = await resolveUser(db, req);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (user.role !== role) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    req.user = user;
    next();
  };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors attributable to `server/middleware/auth.ts` (Task 3 will start exercising it at runtime).

- [ ] **Step 3: Commit**

```bash
git add server/middleware/auth.ts
git commit -m "feat: add DB-backed session auth middleware"
```

---

### Task 3: Auth routes (login/logout/me)

**Files:**
- Create: `server/routes/auth.ts`
- Test: `server/routes/auth.test.ts`
- Modify: `server/app.ts`

**Interfaces:**
- Consumes: `requireAuth`, `createSession`, `destroySession`, `parseCookies`, `cookieOptions`, `SESSION_COOKIE_NAME` from `server/middleware/auth.ts` (Task 2).
- Produces: `authRouter(db: Client): Router` mounted at `/api/auth` — `POST /login`, `POST /logout`, `GET /me`. Consumed by Task 9 frontend (`src/lib/api.ts`).

- [ ] **Step 1: Write the failing tests**

Create `server/routes/auth.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb } from '../db';
import { createApp } from '../app';

describe('auth routes', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    app = createApp(await createDb(':memory:'));
  });

  it('logs in the seeded admin with correct credentials and sets a session cookie', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ username: 'admin', role: 'admin', displayName: 'Admin' });
    expect(res.headers['set-cookie']?.[0]).toMatch(/^sid=/);
  });

  it('rejects a wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('rejects an unknown username', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'nobody', password: 'admin123' });
    expect(res.status).toBe(401);
  });

  it('persists the session across requests via the cookie', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    const meRes = await agent.get('/api/auth/me');
    expect(meRes.status).toBe(200);
    expect(meRes.body.username).toBe('admin');
  });

  it('returns 401 from /me with no session', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('logout clears the session so /me is 401 afterward', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    const logoutRes = await agent.post('/api/auth/logout');
    expect(logoutRes.status).toBe(200);

    const meRes = await agent.get('/api/auth/me');
    expect(meRes.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/routes/auth.test.ts`
Expected: FAIL — `Cannot find module '../app'` resolving `/api/auth/*` as 404s (route doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `server/routes/auth.ts`:

```ts
import { Router } from 'express';
import type { Client } from '@libsql/client';
import bcrypt from 'bcryptjs';
import { createSession, destroySession, parseCookies, cookieOptions, requireAuth, SESSION_COOKIE_NAME } from '../middleware/auth.js';

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  role: 'admin' | 'driver';
  display_name: string;
}

export function authRouter(db: Client): Router {
  const router = Router();

  router.post('/login', async (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'username and password are required' });
      return;
    }

    const result = await db.execute({ sql: 'SELECT * FROM users WHERE username = ?', args: [username] });
    const row = result.rows[0] as unknown as UserRow | undefined;
    if (!row || !(await bcrypt.compare(password, row.password_hash))) {
      res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
      return;
    }

    const token = await createSession(db, row.id);
    res.cookie(SESSION_COOKIE_NAME, token, cookieOptions());
    res.json({ id: row.id, username: row.username, role: row.role, displayName: row.display_name });
  });

  router.post('/logout', async (req, res) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME];
    if (token) await destroySession(db, token);
    res.clearCookie(SESSION_COOKIE_NAME, cookieOptions());
    res.json({ ok: true });
  });

  router.get('/me', requireAuth(db), (req, res) => {
    res.json(req.user);
  });

  return router;
}
```

Modify `server/app.ts` — add the import and mount:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/routes/auth.test.ts`
Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add server/routes/auth.ts server/routes/auth.test.ts server/app.ts
git commit -m "feat: add login/logout/me auth routes"
```

---

### Task 4: Driver account CRUD (admin-only)

**Files:**
- Create: `server/routes/drivers.ts`
- Test: `server/routes/drivers.test.ts`
- Modify: `server/app.ts`

**Interfaces:**
- Consumes: `requireRole` from `server/middleware/auth.ts` (Task 2).
- Produces: `driversRouter(db: Client): Router` mounted at `/api/drivers` — `GET /`, `POST /`, `PATCH /:id`, `DELETE /:id`, response shape `{ id, username, displayName, vehicleId: string|null, vehicleName: string|null }`. Consumed by Task 9 frontend and Task 11 (`AdminDriversPanel`).

- [ ] **Step 1: Write the failing tests**

Create `server/routes/drivers.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb } from '../db';
import { createApp } from '../app';

describe('drivers routes', () => {
  let app: ReturnType<typeof createApp>;
  let adminAgent: ReturnType<typeof request.agent>;

  beforeEach(async () => {
    app = createApp(await createDb(':memory:'));
    adminAgent = request.agent(app);
    await adminAgent.post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
  });

  it('creates a driver account', async () => {
    const res = await adminAgent.post('/api/drivers').send({ username: 'somchai', password: 'pass1234', displayName: 'สมชาย' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ username: 'somchai', displayName: 'สมชาย', vehicleId: null });
  });

  it('lists driver accounts', async () => {
    await adminAgent.post('/api/drivers').send({ username: 'somchai', password: 'pass1234', displayName: 'สมชาย' });
    const res = await adminAgent.get('/api/drivers');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].username).toBe('somchai');
  });

  it('rejects a duplicate username', async () => {
    await adminAgent.post('/api/drivers').send({ username: 'somchai', password: 'pass1234', displayName: 'สมชาย' });
    const res = await adminAgent.post('/api/drivers').send({ username: 'somchai', password: 'other1234', displayName: 'อีกคน' });
    expect(res.status).toBe(409);
  });

  it('updates a driver password', async () => {
    const createRes = await adminAgent.post('/api/drivers').send({ username: 'somchai', password: 'pass1234', displayName: 'สมชาย' });
    const patchRes = await adminAgent.patch(`/api/drivers/${createRes.body.id}`).send({ password: 'newpass1' });
    expect(patchRes.status).toBe(200);

    const loginRes = await request(app).post('/api/auth/login').send({ username: 'somchai', password: 'newpass1' });
    expect(loginRes.status).toBe(200);
  });

  it('deletes a driver and clears their vehicle assignment', async () => {
    const createRes = await adminAgent.post('/api/drivers').send({ username: 'somchai', password: 'pass1234', displayName: 'สมชาย' });
    const driverId = createRes.body.id;

    const fleetRes = await adminAgent.get('/api/fleet');
    const vehicle = fleetRes.body.vehicles[0];
    await adminAgent.put('/api/fleet').send({
      vehicles: [{ ...vehicle, driverUserId: driverId }],
      driverWage: fleetRes.body.driverWage,
      enableColdStorage: fleetRes.body.enableColdStorage,
    });

    const delRes = await adminAgent.delete(`/api/drivers/${driverId}`);
    expect(delRes.status).toBe(200);

    const fleetAfter = await adminAgent.get('/api/fleet');
    expect(fleetAfter.body.vehicles[0].driverUserId).toBeNull();
  });

  it('rejects unauthenticated access', async () => {
    const res = await request(app).get('/api/drivers');
    expect(res.status).toBe(401);
  });

  it('rejects driver-role access', async () => {
    await adminAgent.post('/api/drivers').send({ username: 'somchai', password: 'pass1234', displayName: 'สมชาย' });
    const driverAgent = request.agent(app);
    await driverAgent.post('/api/auth/login').send({ username: 'somchai', password: 'pass1234' });
    const res = await driverAgent.get('/api/drivers');
    expect(res.status).toBe(403);
  });
});
```

Note: this test file drives `PUT /api/fleet` with a `driverUserId` field before Task 5 adds that field to `fleet.ts` — that's expected; the `deletes a driver...` test won't fully pass until Task 5 lands. Run only the tests that don't depend on Task 5 for now, or implement Tasks 4 and 5 back-to-back before running the full suite.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/routes/drivers.test.ts`
Expected: FAIL — `/api/drivers` routes don't exist yet (404s).

- [ ] **Step 3: Write the implementation**

Create `server/routes/drivers.ts`:

```ts
import { Router } from 'express';
import type { Client } from '@libsql/client';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { requireRole } from '../middleware/auth.js';

interface DriverRow {
  id: string;
  username: string;
  display_name: string;
  vehicle_id: string | null;
  vehicle_name: string | null;
}

export function driversRouter(db: Client): Router {
  const router = Router();
  router.use(requireRole(db, 'admin'));

  router.get('/', async (req, res) => {
    const result = await db.execute(`
      SELECT u.id, u.username, u.display_name as display_name, v.id as vehicle_id, v.name as vehicle_name
      FROM users u
      LEFT JOIN vehicles v ON v.driver_user_id = u.id
      WHERE u.role = 'driver'
      ORDER BY u.username
    `);
    const rows = result.rows as unknown as DriverRow[];
    res.json(rows.map(r => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      vehicleId: r.vehicle_id,
      vehicleName: r.vehicle_name,
    })));
  });

  router.post('/', async (req, res) => {
    const { username, password, displayName } = req.body ?? {};
    if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || password.length < 4 || typeof displayName !== 'string' || !displayName.trim()) {
      res.status(400).json({ error: 'username, password (min 4 chars), and displayName are required' });
      return;
    }

    const existing = await db.execute({ sql: 'SELECT id FROM users WHERE username = ?', args: [username] });
    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'Username already exists' });
      return;
    }

    const id = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);
    await db.execute({
      sql: 'INSERT INTO users (id, username, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?)',
      args: [id, username, passwordHash, 'driver', displayName],
    });
    res.status(201).json({ id, username, displayName, vehicleId: null, vehicleName: null });
  });

  router.patch('/:id', async (req, res) => {
    const { password, displayName } = req.body ?? {};
    const existing = await db.execute({ sql: "SELECT id FROM users WHERE id = ? AND role = 'driver'", args: [req.params.id] });
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Driver not found' });
      return;
    }

    if (typeof password === 'string' && password.length > 0) {
      if (password.length < 4) {
        res.status(400).json({ error: 'password must be at least 4 characters' });
        return;
      }
      const passwordHash = await bcrypt.hash(password, 10);
      await db.execute({ sql: 'UPDATE users SET password_hash = ? WHERE id = ?', args: [passwordHash, req.params.id] });
    }
    if (typeof displayName === 'string' && displayName.trim()) {
      await db.execute({ sql: 'UPDATE users SET display_name = ? WHERE id = ?', args: [displayName, req.params.id] });
    }
    res.json({ ok: true });
  });

  router.delete('/:id', async (req, res) => {
    await db.batch([
      { sql: 'UPDATE vehicles SET driver_user_id = NULL WHERE driver_user_id = ?', args: [req.params.id] },
      { sql: 'DELETE FROM sessions WHERE user_id = ?', args: [req.params.id] },
      { sql: "DELETE FROM users WHERE id = ? AND role = 'driver'", args: [req.params.id] },
    ], 'write');
    res.json({ ok: true });
  });

  return router;
}
```

Modify `server/app.ts` — add the import and mount (add after the `authRouter` import/mount):

```ts
import { driversRouter } from './routes/drivers.js';
```

```ts
  app.use('/api/drivers', driversRouter(db));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/routes/drivers.test.ts`
Expected: 6/7 pass; `'deletes a driver and clears their vehicle assignment'` fails until Task 5 adds `driverUserId` support to `fleet.ts`. This is expected — proceed to Task 5.

- [ ] **Step 5: Commit**

```bash
git add server/routes/drivers.ts server/routes/drivers.test.ts server/app.ts
git commit -m "feat: add admin-only driver account CRUD routes"
```

---

### Task 5: Fleet route auth-gating + driver assignment field

**Files:**
- Modify: `server/routes/fleet.ts`
- Modify: `server/routes/fleet.test.ts`

**Interfaces:**
- Consumes: `requireRole` from `server/middleware/auth.ts` (Task 2).
- Produces: `GET/PUT /api/fleet` now admin-only; vehicle JSON shape gains `driverUserId: string | null`. Consumed by Task 4's delete test (now passes), Task 12 (`FleetConfigModal`).

- [ ] **Step 1: Update the tests**

Replace the full contents of `server/routes/fleet.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb } from '../db';
import { createApp } from '../app';

describe('fleet routes', () => {
  let app: ReturnType<typeof createApp>;
  let agent: ReturnType<typeof request.agent>;

  beforeEach(async () => {
    app = createApp(await createDb(':memory:'));
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
  });

  it('returns the seeded default fleet', async () => {
    const res = await agent.get('/api/fleet');
    expect(res.status).toBe(200);
    expect(res.body.vehicles).toHaveLength(9);
    expect(res.body.driverWage).toBe(60);
  });

  it('saves an edited fleet', async () => {
    const putRes = await agent.put('/api/fleet').send({
      vehicles: [
        { id: '4w-1', type: '4-wheel', name: 'Truck 1', capacityCBM: 12, fuelConsumption: 0.12, fixedCost: 300, color: '#10B981', fuelPrice: 36, departureTime: '09:30' },
      ],
      driverWage: 70,
    });
    expect(putRes.status).toBe(200);

    const getRes = await agent.get('/api/fleet');
    expect(getRes.body.vehicles).toHaveLength(1);
    expect(getRes.body.vehicles[0].fuelPrice).toBe(36);
    expect(getRes.body.vehicles[0].departureTime).toBe('09:30');
    expect(getRes.body.driverWage).toBe(70);
  });

  it('returns enableColdStorage: false by default', async () => {
    const res = await agent.get('/api/fleet');
    expect(res.body.enableColdStorage).toBe(false);
  });

  it('saves enableColdStorage: true with a cold-storage vehicle', async () => {
    const putRes = await agent.put('/api/fleet').send({
      vehicles: [
        { id: 'cold-1', type: 'cold-storage', name: 'Cold Truck 1', capacityCBM: 10, fuelConsumption: 0.18, fixedCost: 500, color: '#06B6D4', fuelPrice: 35, departureTime: '08:00' },
      ],
      driverWage: 60,
      enableColdStorage: true,
    });
    expect(putRes.status).toBe(200);

    const getRes = await agent.get('/api/fleet');
    expect(getRes.body.enableColdStorage).toBe(true);
    expect(getRes.body.vehicles[0].type).toBe('cold-storage');
  });

  it('rejects disabling cold storage while a cold-storage vehicle is present', async () => {
    await agent.put('/api/fleet').send({
      vehicles: [
        { id: 'cold-1', type: 'cold-storage', name: 'Cold Truck 1', capacityCBM: 10, fuelConsumption: 0.18, fixedCost: 500, color: '#06B6D4', fuelPrice: 35, departureTime: '08:00' },
      ],
      driverWage: 60,
      enableColdStorage: true,
    });

    const putRes = await agent.put('/api/fleet').send({
      vehicles: [
        { id: 'cold-1', type: 'cold-storage', name: 'Cold Truck 1', capacityCBM: 10, fuelConsumption: 0.18, fixedCost: 500, color: '#06B6D4', fuelPrice: 35, departureTime: '08:00' },
      ],
      driverWage: 60,
      enableColdStorage: false,
    });
    expect(putRes.status).toBe(400);
    expect(putRes.body.error).toBe('Cannot disable cold storage while cold-storage vehicles exist');

    const getRes = await agent.get('/api/fleet');
    expect(getRes.body.enableColdStorage).toBe(true);
  });

  it('round-trips a driver assignment', async () => {
    const createDriverRes = await agent.post('/api/drivers').send({ username: 'somchai', password: 'pass1234', displayName: 'สมชาย' });
    const putRes = await agent.put('/api/fleet').send({
      vehicles: [
        { id: '4w-1', type: '4-wheel', name: 'Truck 1', capacityCBM: 12, fuelConsumption: 0.12, fixedCost: 300, color: '#10B981', fuelPrice: 35, departureTime: '08:00', driverUserId: createDriverRes.body.id },
      ],
      driverWage: 60,
    });
    expect(putRes.status).toBe(200);

    const getRes = await agent.get('/api/fleet');
    expect(getRes.body.vehicles[0].driverUserId).toBe(createDriverRes.body.id);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/fleet');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/routes/fleet.test.ts`
Expected: FAIL — all requests currently return 200 without auth (route isn't gated yet), and `driverUserId` round-trip test fails (field not read/written yet).

- [ ] **Step 3: Update the implementation**

Replace the full contents of `server/routes/fleet.ts`:

```ts
import { Router } from 'express';
import type { Client } from '@libsql/client';
import { requireRole } from '../middleware/auth.js';

interface VehicleRow {
  id: string;
  type: string;
  name: string;
  capacity_cbm: number;
  fuel_consumption: number;
  fixed_cost: number;
  color: string;
  fuel_price: number;
  departure_time: string;
  driver_user_id: string | null;
}

interface SettingsRow {
  driver_wage: number;
  enable_cold_storage: number;
}

export function fleetRouter(db: Client): Router {
  const router = Router();
  router.use(requireRole(db, 'admin'));

  router.get('/', async (req, res) => {
    const rowsResult = await db.execute('SELECT * FROM vehicles ORDER BY type, id');
    const settingsResult = await db.execute('SELECT * FROM settings WHERE id = 1');
    const rows = rowsResult.rows as unknown as VehicleRow[];
    const settings = settingsResult.rows[0] as unknown as SettingsRow;
    res.json({
      vehicles: rows.map(r => ({
        id: r.id,
        type: r.type,
        name: r.name,
        capacityCBM: r.capacity_cbm,
        fuelConsumption: r.fuel_consumption,
        fixedCost: r.fixed_cost,
        color: r.color,
        fuelPrice: r.fuel_price,
        departureTime: r.departure_time,
        driverUserId: r.driver_user_id,
      })),
      driverWage: settings.driver_wage,
      enableColdStorage: Boolean(settings.enable_cold_storage),
    });
  });

  router.put('/', async (req, res) => {
    const { vehicles, driverWage, enableColdStorage } = req.body ?? {};
    if (!Array.isArray(vehicles)) {
      res.status(400).json({ error: 'vehicles must be an array' });
      return;
    }
    for (const v of vehicles) {
      if (!v.id || !v.type || !v.name || typeof v.capacityCBM !== 'number' || typeof v.fuelConsumption !== 'number' || typeof v.fixedCost !== 'number' || !v.color || typeof v.fuelPrice !== 'number' || typeof v.departureTime !== 'string') {
        res.status(400).json({ error: 'Invalid vehicle entry' });
        return;
      }
    }
    if (!enableColdStorage && vehicles.some((v: any) => v.type === 'cold-storage')) {
      res.status(400).json({ error: 'Cannot disable cold storage while cold-storage vehicles exist' });
      return;
    }

    await db.batch([
      { sql: 'DELETE FROM vehicles', args: [] },
      ...vehicles.map((v: any) => ({
        sql: 'INSERT INTO vehicles (id, type, name, capacity_cbm, fuel_consumption, fixed_cost, color, fuel_price, departure_time, driver_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: [v.id, v.type, v.name, v.capacityCBM, v.fuelConsumption, v.fixedCost, v.color, v.fuelPrice, v.departureTime, v.driverUserId ?? null],
      })),
      { sql: 'UPDATE settings SET driver_wage = ?, enable_cold_storage = ? WHERE id = 1', args: [driverWage ?? 60, enableColdStorage ? 1 : 0] },
    ], 'write');

    res.json({ ok: true });
  });

  return router;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/routes/fleet.test.ts server/routes/drivers.test.ts`
Expected: PASS (both files, including the previously-blocked `'deletes a driver...'` test from Task 4).

- [ ] **Step 5: Commit**

```bash
git add server/routes/fleet.ts server/routes/fleet.test.ts
git commit -m "feat: gate fleet routes to admin and add driver assignment field"
```

---

### Task 6: Plan route auth-gating + /my-route + progress ownership

**Files:**
- Modify: `server/routes/plan.ts`
- Modify: `server/routes/plan.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `requireRole` from `server/middleware/auth.ts` (Task 2).
- Produces: `GET /api/plan/active`, `GET /api/plan/progress`, `POST /api/plan` now admin-only. New `GET /api/plan/my-route` (any authenticated user) returns `{ route: { routeSummary: RouteSummary, legs: RouteLeg[] } | null }`. `POST /api/plan/progress` now requires auth; a `driver`-role caller is rejected with 403 if `routeIndex` isn't their assigned route. Consumed by Task 9 frontend (`getMyRoute`), Task 10 (`DriverShell`).

- [ ] **Step 1: Update the tests**

Replace the full contents of `server/routes/plan.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb } from '../db';
import { createApp } from '../app';

const samplePlan = () => ({
  optimizationCriterion: 'cost',
  data: {
    nodes: [{ id: 0, location: 'Depot', lat: 13.7, lon: 100.5, demandVolume: 0, weight: 0, readyTime: null, dueTime: null }],
    legs: [{
      fromNode: { id: 0, location: 'Depot', lat: 13.7, lon: 100.5, demandVolume: 0, weight: 0, readyTime: null, dueTime: null },
      toNode: { id: 1, location: 'Stop 1', lat: 13.8, lon: 100.5, demandVolume: 5, weight: 5, readyTime: null, dueTime: null },
      distanceKm: 10, durationSec: 600, arrivalDate: '2026-07-06T01:00:00.000Z', waitingMinutes: 0, status: 'On-Time', geometry: null, routeIndex: 1,
    }],
    traditionalDistance: 20, milkRunDistance: 10, traditionalCost: 200, milkRunCost: 100, savingsPercentage: 50,
    totalVolume: 5, totalWeight: 5, palletCount: 1, spaceUtilization: 50,
    traditionalCO2: 5, milkRunCO2: 2, fuelSavedLiters: 1, co2ReductionPercent: 60, totalWaitingHours: 0, totalTrucksUsed: 1,
    routeSummaries: [{
      routeIndex: 1, totalVolume: 5, volumeUtilization: 50, distanceKm: 10,
      vehicle: { id: '4w-1', type: '4-wheel', name: 'Truck 1', capacityCBM: 12, fuelConsumption: 0.12, fixedCost: 300, color: '#10B981', fuelPrice: 35 },
    }],
  },
});

describe('plan routes', () => {
  let app: ReturnType<typeof createApp>;
  let agent: ReturnType<typeof request.agent>;

  beforeEach(async () => {
    app = createApp(await createDb(':memory:'));
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
  });

  it('returns null when no plan exists yet', async () => {
    const res = await agent.get('/api/plan/active');
    expect(res.status).toBe(200);
    expect(res.body.plan).toBeNull();
  });

  it('can save a plan and read it back in full', async () => {
    const saveRes = await agent.post('/api/plan').send(samplePlan());
    expect(saveRes.status).toBe(200);

    const res = await agent.get('/api/plan/active');
    expect(res.body.plan.legs).toHaveLength(1);
    expect(res.body.plan.routeSummaries[0].routeIndex).toBe(1);
  });

  it('resets progress to step 0 when a new plan is saved', async () => {
    await agent.post('/api/plan').send(samplePlan());
    const progressRes = await agent.get('/api/plan/progress');
    expect(progressRes.body).toEqual([{ routeIndex: 1, currentStep: 0, stepState: 'pending' }]);
  });

  it('can push progress and read it back', async () => {
    await agent.post('/api/plan').send(samplePlan());
    const postRes = await agent.post('/api/plan/progress').send({ routeIndex: 1, currentStep: 1, stepState: 'in_transit' });
    expect(postRes.status).toBe(200);

    const progressRes = await agent.get('/api/plan/progress');
    expect(progressRes.body).toEqual([{ routeIndex: 1, currentStep: 1, stepState: 'in_transit' }]);
  });

  it('rejects unauthenticated access to /active', async () => {
    const res = await request(app).get('/api/plan/active');
    expect(res.status).toBe(401);
  });

  describe('driver scoping', () => {
    async function setUpDriverWithRoute() {
      await agent.post('/api/plan').send(samplePlan());
      const driverRes = await agent.post('/api/drivers').send({ username: 'somchai', password: 'pass1234', displayName: 'สมชาย' });
      await agent.put('/api/fleet').send({
        vehicles: [
          { id: '4w-1', type: '4-wheel', name: 'Truck 1', capacityCBM: 12, fuelConsumption: 0.12, fixedCost: 300, color: '#10B981', fuelPrice: 35, departureTime: '08:00', driverUserId: driverRes.body.id },
        ],
        driverWage: 60,
      });
      const driverAgent = request.agent(app);
      await driverAgent.post('/api/auth/login').send({ username: 'somchai', password: 'pass1234' });
      return driverAgent;
    }

    it('returns only the assigned route on /my-route', async () => {
      const driverAgent = await setUpDriverWithRoute();
      const res = await driverAgent.get('/api/plan/my-route');
      expect(res.status).toBe(200);
      expect(res.body.route.routeSummary.routeIndex).toBe(1);
      expect(res.body.route.legs).toHaveLength(1);
    });

    it('returns route: null when no vehicle is assigned', async () => {
      await agent.post('/api/drivers').send({ username: 'nobody', password: 'pass1234', displayName: 'ไม่มีรถ' });
      const driverAgent = request.agent(app);
      await driverAgent.post('/api/auth/login').send({ username: 'nobody', password: 'pass1234' });

      const res = await driverAgent.get('/api/plan/my-route');
      expect(res.status).toBe(200);
      expect(res.body.route).toBeNull();
    });

    it('allows a driver to push progress for their own route', async () => {
      const driverAgent = await setUpDriverWithRoute();
      const res = await driverAgent.post('/api/plan/progress').send({ routeIndex: 1, currentStep: 1, stepState: 'in_transit' });
      expect(res.status).toBe(200);
    });

    it('rejects a driver pushing progress for a route that is not theirs', async () => {
      const driverAgent = await setUpDriverWithRoute();
      const res = await driverAgent.post('/api/plan/progress').send({ routeIndex: 99, currentStep: 1, stepState: 'in_transit' });
      expect(res.status).toBe(403);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/routes/plan.test.ts`
Expected: FAIL — routes aren't gated, `/my-route` doesn't exist, driver scoping tests fail.

- [ ] **Step 3: Update the implementation**

Replace the full contents of `server/routes/plan.ts`:

```ts
import { Router } from 'express';
import type { Client } from '@libsql/client';
import { requireAuth, requireRole } from '../middleware/auth.js';

interface ActivePlanRow {
  optimization_criterion: string;
  nodes_json: string;
  legs_json: string;
  route_summaries_json: string;
  aggregates_json: string;
}

async function loadPlan(db: Client) {
  const result = await db.execute('SELECT * FROM active_plan WHERE id = 1');
  const row = result.rows[0] as unknown as ActivePlanRow | undefined;
  if (!row) return null;
  return {
    optimizationCriterion: row.optimization_criterion,
    nodes: JSON.parse(row.nodes_json),
    legs: JSON.parse(row.legs_json),
    routeSummaries: JSON.parse(row.route_summaries_json),
    ...JSON.parse(row.aggregates_json),
  };
}

async function findOwnRouteIndex(db: Client, driverId: string): Promise<number | null> {
  const vehicleResult = await db.execute({ sql: 'SELECT id FROM vehicles WHERE driver_user_id = ?', args: [driverId] });
  const vehicleRow = vehicleResult.rows[0] as unknown as { id: string } | undefined;
  if (!vehicleRow) return null;

  const plan = await loadPlan(db);
  if (!plan) return null;

  const routeSummary = plan.routeSummaries.find((s: any) => s.vehicle.id === vehicleRow.id);
  return routeSummary ? routeSummary.routeIndex : null;
}

export function planRouter(db: Client): Router {
  const router = Router();

  router.post('/', requireRole(db, 'admin'), async (req, res) => {
    const { optimizationCriterion, data } = req.body ?? {};
    if (!data || !Array.isArray(data.routeSummaries)) {
      res.status(400).json({ error: 'Invalid plan payload' });
      return;
    }
    const { nodes, legs, routeSummaries, ...aggregates } = data;

    await db.batch([
      {
        sql: `
          INSERT INTO active_plan (id, created_at, optimization_criterion, nodes_json, legs_json, route_summaries_json, aggregates_json)
          VALUES (1, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            created_at = excluded.created_at,
            optimization_criterion = excluded.optimization_criterion,
            nodes_json = excluded.nodes_json,
            legs_json = excluded.legs_json,
            route_summaries_json = excluded.route_summaries_json,
            aggregates_json = excluded.aggregates_json
        `,
        args: [new Date().toISOString(), optimizationCriterion, JSON.stringify(nodes), JSON.stringify(legs), JSON.stringify(routeSummaries), JSON.stringify(aggregates)],
      },
      { sql: 'DELETE FROM plan_progress', args: [] },
      ...routeSummaries.map((summary: any) => ({
        sql: 'INSERT INTO plan_progress (route_index, current_step, step_state) VALUES (?, 0, ?)',
        args: [summary.routeIndex, 'pending'],
      })),
    ], 'write');

    res.json({ ok: true });
  });

  router.get('/active', requireRole(db, 'admin'), async (req, res) => {
    const plan = await loadPlan(db);
    res.json({ plan });
  });

  router.get('/my-route', requireAuth(db), async (req, res) => {
    const plan = await loadPlan(db);
    const vehicleResult = await db.execute({ sql: 'SELECT id FROM vehicles WHERE driver_user_id = ?', args: [req.user!.id] });
    const vehicleRow = vehicleResult.rows[0] as unknown as { id: string } | undefined;
    if (!vehicleRow || !plan) {
      res.json({ route: null });
      return;
    }

    const routeSummary = plan.routeSummaries.find((s: any) => s.vehicle.id === vehicleRow.id);
    if (!routeSummary) {
      res.json({ route: null });
      return;
    }

    const legs = plan.legs.filter((l: any) => l.routeIndex === routeSummary.routeIndex);
    res.json({ route: { routeSummary, legs } });
  });

  router.post('/progress', requireAuth(db), async (req, res) => {
    const { routeIndex, currentStep, stepState } = req.body ?? {};

    if (req.user!.role === 'driver') {
      const ownRouteIndex = await findOwnRouteIndex(db, req.user!.id);
      if (ownRouteIndex === null || ownRouteIndex !== routeIndex) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    }

    await db.execute({
      sql: `
        INSERT INTO plan_progress (route_index, current_step, step_state, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(route_index) DO UPDATE SET
          current_step = excluded.current_step,
          step_state = excluded.step_state,
          updated_at = excluded.updated_at
      `,
      args: [routeIndex, currentStep, stepState],
    });
    res.json({ ok: true });
  });

  router.get('/progress', requireRole(db, 'admin'), async (req, res) => {
    const result = await db.execute('SELECT route_index, current_step, step_state FROM plan_progress ORDER BY route_index');
    res.json(result.rows.map((r: any) => ({ routeIndex: r.route_index, currentStep: r.current_step, stepState: r.step_state })));
  });

  return router;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/routes/plan.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Run the full backend suite**

Run: `npx vitest run server`
Expected: PASS — all of `server/db.test.ts`, `server/routes/auth.test.ts`, `server/routes/drivers.test.ts`, `server/routes/fleet.test.ts`, `server/routes/plan.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add server/routes/plan.ts server/routes/plan.test.ts
git commit -m "feat: gate plan routes to admin, add driver-scoped my-route endpoint"
```

---

### Task 7: Frontend types — Vehicle.driverUserId

**Files:**
- Modify: `src/types.ts:24-36`

**Interfaces:**
- Produces: `Vehicle.driverUserId?: string | null`. Consumed by Task 12 (`FleetConfigModal`).

- [ ] **Step 1: Add the field**

In `src/types.ts`, modify the `Vehicle` interface:

```ts
export interface Vehicle {
  id: string;
  type: string;
  name: string;
  capacityCBM: number;
  fuelConsumption: number;
  fixedCost: number;
  color: string;
  fuelPrice: number;
  departureTime: string;
  hasColdStorage?: boolean;
  coldStorageCapacity?: number;
  driverUserId?: string | null;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (the field is optional, so no existing `Vehicle` literal breaks).

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add driverUserId to Vehicle type"
```

---

### Task 8: Frontend api.ts — auth and driver client functions

**Files:**
- Modify: `src/lib/api.ts`

**Interfaces:**
- Consumes: `RouteSummary`, `RouteLeg` from `src/types.ts`; `/api/auth/*`, `/api/drivers/*`, `/api/plan/my-route` from Tasks 3, 4, 6.
- Produces: `CurrentUser`, `DriverAccount` types; `login`, `logout`, `getMe`, `getDrivers`, `createDriver`, `updateDriver`, `deleteDriver`, `getMyRoute` functions. Consumed by Task 9 (`LoginMockup`), Task 10 (`DriverShell`), Task 11 (`AdminDriversPanel`), Task 13 (`App.tsx`).

- [ ] **Step 1: Add the types and functions**

Append to `src/lib/api.ts` (after the existing `postProgress` function, at the end of the file):

```ts

export interface CurrentUser {
  id: string;
  username: string;
  role: 'admin' | 'driver';
  displayName: string;
}

export interface DriverAccount {
  id: string;
  username: string;
  displayName: string;
  vehicleId: string | null;
  vehicleName: string | null;
}

export async function login(username: string, password: string): Promise<CurrentUser> {
  return request<CurrentUser>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
}

export async function logout(): Promise<void> {
  await request('/auth/logout', { method: 'POST' });
}

export async function getMe(): Promise<CurrentUser> {
  return request<CurrentUser>('/auth/me');
}

export async function getDrivers(): Promise<DriverAccount[]> {
  return request<DriverAccount[]>('/drivers');
}

export async function createDriver(username: string, password: string, displayName: string): Promise<DriverAccount> {
  return request<DriverAccount>('/drivers', { method: 'POST', body: JSON.stringify({ username, password, displayName }) });
}

export async function updateDriver(id: string, updates: { password?: string; displayName?: string }): Promise<void> {
  await request(`/drivers/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
}

export async function deleteDriver(id: string): Promise<void> {
  await request(`/drivers/${id}`, { method: 'DELETE' });
}

export async function getMyRoute(): Promise<{ routeSummary: RouteSummary; legs: RouteLeg[] } | null> {
  const { route } = await request<{ route: { routeSummary: RouteSummary; legs: RouteLeg[] } | null }>('/plan/my-route');
  if (!route) return null;
  return { routeSummary: route.routeSummary, legs: route.legs.map(reviveLeg) };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors — `reviveLeg` is already defined earlier in this file and is being reused, not redefined.

- [ ] **Step 3: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat: add auth and driver client functions to api.ts"
```

---

### Task 9: LoginMockup — real login form

**Files:**
- Modify: `src/components/LoginMockup.tsx`
- Modify: `src/components/LoginMockup.test.tsx`

**Interfaces:**
- Consumes: `login`, `CurrentUser` from `src/lib/api.ts` (Task 8).
- Produces: `LoginMockup({ onSignIn: (user: CurrentUser) => void })`. Consumed by Task 13 (`App.tsx`).

- [ ] **Step 1: Update the test**

Replace the full contents of `src/components/LoginMockup.test.tsx`:

```tsx
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import LoginMockup from './LoginMockup';

describe('LoginMockup', () => {
  it('renders the RouteWay login controls', () => {
    const html = renderToStaticMarkup(<LoginMockup onSignIn={() => {}} />);

    expect(html).toContain('RouteWay Intelligence');
    expect(html).toContain('Username');
    expect(html).toContain('Password');
    expect(html).toContain('Sign in');
    expect(html).toContain('Try RouteWay Care');
    expect(html).toContain('?care=1');
    expect(html).not.toContain('Use demo mode');
    expect(html).not.toContain('Fleet operations portal');
    expect(html).not.toContain("Today's control status");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/LoginMockup.test.tsx`
Expected: FAIL — current markup has "Email address" and "Use demo mode", not "Username" without "Use demo mode".

- [ ] **Step 3: Rewrite the component**

Replace the full contents of `src/components/LoginMockup.tsx`:

```tsx
import React, { useState } from 'react';
import { ArrowRight, LockKeyhole, User as UserIcon } from 'lucide-react';
import AppLogo from './AppLogo';
import { login, CurrentUser } from '../lib/api';

interface LoginMockupProps {
  onSignIn: (user: CurrentUser) => void;
}

export default function LoginMockup({ onSignIn }: LoginMockupProps) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const user = await login(username, password);
      onSignIn(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-canvas px-4 py-6 text-[#333333] sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-md flex-col justify-center">
        <header className="mb-6">
          <AppLogo className="mx-auto w-56" />
        </header>

        <section>
          <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-fleet-navy">Sign in</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                RouteWay Intelligence — เข้าสู่ระบบด้วยบัญชีที่ผู้ดูแลระบบสร้างให้
              </p>
            </div>

            {error && (
              <div className="mb-4 rounded-md border border-alert-red/30 bg-red-50 px-3 py-2 text-sm font-semibold text-alert-red">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">Username</span>
                <span className="flex items-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-2.5 focus-within:border-fleet-navy focus-within:ring-2 focus-within:ring-fleet-navy">
                  <UserIcon className="h-5 w-5 text-slate-500" aria-hidden="true" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-500"
                    placeholder="username"
                    autoComplete="username"
                  />
                </span>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">Password</span>
                <span className="flex items-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-2.5 focus-within:border-fleet-navy focus-within:ring-2 focus-within:ring-fleet-navy">
                  <LockKeyhole className="h-5 w-5 text-slate-500" aria-hidden="true" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-500"
                    placeholder="Enter password"
                    autoComplete="current-password"
                  />
                </span>
              </label>
            </div>

            <div className="mt-6">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-fleet-navy px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-fleet-navy-hover focus:outline-none focus:ring-2 focus:ring-fleet-navy focus:ring-offset-2 disabled:opacity-50"
              >
                {isSubmitting ? 'กำลังเข้าสู่ระบบ...' : 'Sign in'}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </form>

          <a
            href="?care=1"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-bold text-white transition-colors"
            style={{ backgroundColor: 'var(--color-care-navy)' }}
          >
            Try RouteWay Care
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/LoginMockup.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/LoginMockup.tsx src/components/LoginMockup.test.tsx
git commit -m "feat: wire LoginMockup to real username/password login"
```

---

### Task 10: DriverShell component

**Files:**
- Create: `src/components/DriverShell.tsx`

**Interfaces:**
- Consumes: `getMyRoute`, `postProgress`, `logout`, `CurrentUser` from `src/lib/api.ts` (Task 8); `DriverPortal` from `src/components/DriverPortal.tsx` (existing, unmodified — its `lockedRouteIndex`/`onStepChange` props already exist); `AppLogo` from `src/components/AppLogo.tsx` (existing).
- Produces: `DriverShell({ user: CurrentUser, onLoggedOut: () => void })`. Consumed by Task 13 (`App.tsx`).

- [ ] **Step 1: Write the component**

Create `src/components/DriverShell.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { ProcessedData } from '../types';
import { getMyRoute, postProgress, logout, CurrentUser } from '../lib/api';
import DriverPortal from './DriverPortal';
import AppLogo from './AppLogo';
import { LogOut } from 'lucide-react';

interface DriverShellProps {
  user: CurrentUser;
  onLoggedOut: () => void;
}

export default function DriverShell({ user, onLoggedOut }: DriverShellProps) {
  const [data, setData] = useState<ProcessedData | null>(null);
  const [hasNoRoute, setHasNoRoute] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [stepState, setStepState] = useState<'pending' | 'in_transit'>('pending');

  useEffect(() => {
    let cancelled = false;
    getMyRoute()
      .then(route => {
        if (cancelled) return;
        if (!route) {
          setHasNoRoute(true);
          return;
        }
        setData({
          nodes: [],
          legs: route.legs,
          traditionalDistance: 0, milkRunDistance: 0, traditionalCost: 0, milkRunCost: 0, savingsPercentage: 0,
          totalVolume: 0, totalWeight: 0, palletCount: 0, spaceUtilization: 0,
          traditionalCO2: 0, milkRunCO2: 0, fuelSavedLiters: 0, co2ReductionPercent: 0,
          totalWaitingHours: 0, totalTrucksUsed: 1,
          routeSummaries: [route.routeSummary],
          departureTime: new Date(),
        });
      })
      .catch(() => setHasNoRoute(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    await logout().catch(() => {});
    onLoggedOut();
  };

  const topBar = (
    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
      <div className="flex items-center gap-3">
        <AppLogo className="w-24" />
        <span className="text-sm font-semibold text-slate-600">{user.displayName}</span>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        className="flex items-center gap-1 text-sm font-bold text-slate-600 hover:text-alert-red"
      >
        <LogOut className="w-4 h-4" /> ออกจากระบบ
      </button>
    </div>
  );

  if (hasNoRoute) {
    return (
      <div className="min-h-screen bg-neutral-canvas">
        {topBar}
        <div className="flex flex-col items-center justify-center p-12 text-center text-slate-500">
          ยังไม่ได้รับมอบหมายเส้นทาง กรุณาติดต่อผู้ดูแลระบบ
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-neutral-canvas">
        {topBar}
        <div className="flex flex-col items-center justify-center p-12 text-center text-slate-500">
          กำลังโหลดเส้นทาง...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-canvas">
      {topBar}
      <DriverPortal
        data={data}
        currentStep={currentStep}
        setCurrentStep={setCurrentStep}
        stepState={stepState}
        setStepState={setStepState}
        lockedRouteIndex={data.routeSummaries[0].routeIndex}
        onStepChange={(routeIndex, step, state) => {
          postProgress(routeIndex, step, state).catch(() => {});
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors — `data` satisfies `ProcessedData`, `DriverPortal`'s existing prop types accept `lockedRouteIndex`/`onStepChange` as already defined in `src/components/DriverPortal.tsx:75-83`.

- [ ] **Step 3: Commit**

```bash
git add src/components/DriverShell.tsx
git commit -m "feat: add DriverShell wrapping DriverPortal for driver-role sessions"
```

---

### Task 11: AdminDriversPanel component

**Files:**
- Create: `src/components/AdminDriversPanel.tsx`
- Modify: `src/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `getDrivers`, `createDriver`, `updateDriver`, `deleteDriver`, `DriverAccount` from `src/lib/api.ts` (Task 8).
- Produces: `AdminDriversPanel({ isOpen: boolean, onClose: () => void })`; `Sidebar` gains `setIsDriversManagerOpen: (isOpen: boolean) => void` and `onLogout: () => void` props. Consumed by Task 13 (`App.tsx`).

- [ ] **Step 1: Write the panel component**

Create `src/components/AdminDriversPanel.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { DriverAccount, getDrivers, createDriver, updateDriver, deleteDriver } from '../lib/api';
import { Users, Plus, Trash2, X, KeyRound } from 'lucide-react';

interface AdminDriversPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AdminDriversPanel({ isOpen, onClose }: AdminDriversPanelProps) {
  const [drivers, setDrivers] = useState<DriverAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    setIsLoading(true);
    getDrivers().then(setDrivers).finally(() => setIsLoading(false));
  };

  useEffect(() => {
    if (!isOpen) return;
    reload();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createDriver(username, password, displayName);
      setUsername('');
      setPassword('');
      setDisplayName('');
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'สร้างบัญชีคนขับไม่สำเร็จ');
    }
  };

  const handleResetPassword = async (id: string) => {
    const newPassword = window.prompt('รหัสผ่านใหม่ (อย่างน้อย 4 ตัวอักษร)');
    if (!newPassword) return;
    await updateDriver(id, { password: newPassword });
    reload();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('ลบบัญชีคนขับนี้?')) return;
    await deleteDriver(id);
    reload();
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-50 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in">
        <div className="bg-white px-4 sm:px-6 py-4 border-b border-slate-200 flex justify-between items-center gap-2">
          <h2 className="text-lg sm:text-2xl font-bold text-fleet-navy flex items-center">
            <Users className="w-6 h-6 mr-2" /> จัดการคนขับ
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500 flex-shrink-0">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
          <form onSubmit={handleCreate} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <h3 className="font-bold text-slate-800">เพิ่มคนขับใหม่</h3>
            {error && <div className="text-sm font-semibold text-alert-red">{error}</div>}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input required value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" className="border border-slate-300 rounded px-3 py-2" />
              <input required value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type="password" className="border border-slate-300 rounded px-3 py-2" />
              <input required value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="ชื่อที่แสดง" className="border border-slate-300 rounded px-3 py-2" />
            </div>
            <button type="submit" className="flex items-center gap-1 bg-fleet-navy text-white font-bold px-4 py-2 rounded-md text-sm">
              <Plus className="w-4 h-4" /> เพิ่มคนขับ
            </button>
          </form>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-3">รายชื่อคนขับ</h3>
            {isLoading ? (
              <div className="text-center text-slate-400 py-6">กำลังโหลด...</div>
            ) : drivers.length === 0 ? (
              <div className="text-center text-slate-400 py-6">ยังไม่มีบัญชีคนขับ</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 uppercase">
                    <th className="pb-2">Username</th>
                    <th className="pb-2">ชื่อที่แสดง</th>
                    <th className="pb-2">รถที่มอบหมาย</th>
                    <th className="pb-2 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map(d => (
                    <tr key={d.id} className="border-t border-slate-100">
                      <td className="py-2">{d.username}</td>
                      <td className="py-2">{d.displayName}</td>
                      <td className="py-2">{d.vehicleName ?? <span className="text-slate-400">ยังไม่ระบุ</span>}</td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <button onClick={() => handleResetPassword(d.id)} className="text-slate-400 hover:text-fleet-navy mr-2" title="ตั้งรหัสผ่านใหม่">
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(d.id)} className="text-slate-400 hover:text-alert-red" title="ลบ">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire a trigger button and logout into Sidebar**

In `src/components/Sidebar.tsx`, add `LogOut` to the `lucide-react` import (line 3):

```ts
import { Truck, Navigation, Leaf, UploadCloud, Info, BarChart, X, Snowflake, LogOut } from 'lucide-react';
```

Modify the `SidebarProps` interface (lines 7-19) — add two props after `setIsFleetConfigOpen`:

```ts
interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  onDataLoaded: (nodes: RouteNode[]) => void;
  isProcessing: boolean;
  hasData: boolean;
  hasComparison: boolean;
  avgSpeed: number;
  setAvgSpeed: (val: number) => void;
  setIsFleetConfigOpen: (isOpen: boolean) => void;
  setIsDriversManagerOpen: (isOpen: boolean) => void;
  onLogout: () => void;
  isMobileNavOpen: boolean;
  onCloseMobileNav: () => void;
}
```

Modify the function signature (lines 21-24):

```tsx
export default function Sidebar({
  currentTab, setCurrentTab, onDataLoaded, isProcessing, hasData, hasComparison,
  avgSpeed, setAvgSpeed, setIsFleetConfigOpen, setIsDriversManagerOpen, onLogout, isMobileNavOpen, onCloseMobileNav
}: SidebarProps) {
```

Add a new button right after the existing Fleet Config `<button>...</button>` block and its `<p>` hint (i.e. right after line 84's closing `</p>`, before the `<label>` for Vehicle Manifest):

```tsx
        <button
          onClick={() => setIsDriversManagerOpen(true)}
          className="w-full flex items-center justify-center bg-white border border-slate-300 text-slate-700 py-2 px-4 rounded-md text-sm font-bold shadow-sm hover:bg-slate-50 transition-colors"
        >
          👤 จัดการคนขับ (Drivers)
        </button>
```

Add a logout button right after the `<nav>`'s `{menuItems.map(...)}` closing `))}` and before the closing `</nav>` tag (currently line 119-120):

```tsx
        <button
          onClick={onLogout}
          className="mt-4 flex items-center px-4 py-3 rounded-md text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-alert-red transition-colors"
        >
          <LogOut className="w-4 h-4 mr-2" /> ออกจากระบบ
        </button>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: errors at `App.tsx`'s existing `<Sidebar .../>` call site (missing the two new required props) — expected, resolved in Task 13.

- [ ] **Step 4: Commit**

```bash
git add src/components/AdminDriversPanel.tsx src/components/Sidebar.tsx
git commit -m "feat: add AdminDriversPanel and wire Drivers/Logout buttons into Sidebar"
```

---

### Task 12: FleetConfigModal — driver assignment column

**Files:**
- Modify: `src/components/FleetConfigModal.tsx`

**Interfaces:**
- Consumes: `getDrivers`, `DriverAccount` from `src/lib/api.ts` (Task 8); `Vehicle.driverUserId` from `src/types.ts` (Task 7).
- Produces: vehicle table gains a "คนขับ" column bound to `driverUserId`, included in the `saveFleet` payload.

- [ ] **Step 1: Add the drivers fetch**

In `src/components/FleetConfigModal.tsx`, modify the import (line 3):

```ts
import { getFleet, saveFleet, getDrivers, DriverAccount } from '../lib/api';
```

Add state after `const [isLoading, setIsLoading] = useState(true);` (line 17):

```tsx
  const [drivers, setDrivers] = useState<DriverAccount[]>([]);
```

Modify the `useEffect` (lines 19-28) to also fetch drivers:

```tsx
  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    Promise.all([getFleet(), getDrivers()]).then(([fleet, driverList]) => {
      setVehicles(fleet.vehicles);
      setDriverWage(fleet.driverWage);
      setEnableColdStorage(fleet.enableColdStorage);
      setDrivers(driverList);
      setIsLoading(false);
    });
  }, [isOpen]);
```

- [ ] **Step 2: Include driverUserId when adding a vehicle**

Modify `addVehicle` (lines 36-50) to seed `driverUserId: null`:

```tsx
  const addVehicle = (type: string) => {
    const def = VEHICLE_TYPE_DEFS.find(d => d.type === type)!;
    const count = vehicles.filter(v => v.type === type).length;
    setVehicles(prev => [...prev, {
      id: `${type}-${Date.now()}`,
      type,
      name: `${def.label} - คันที่ ${count + 1}`,
      capacityCBM: def.defaultCapacityCBM,
      fuelConsumption: def.defaultFuelConsumption,
      fixedCost: def.defaultFixedCost,
      color: def.color,
      fuelPrice: 35,
      departureTime: '08:00',
      driverUserId: null,
    }]);
  };
```

- [ ] **Step 3: Add the table column**

In the table `<thead>` (lines 138-148), add a new `<th>` right before the last empty `<th className="pb-2 w-8"></th>`:

```tsx
                        <th className="pb-2 pr-2">คนขับ</th>
```

In the table `<tbody>` row (lines 151-187), add a new `<td>` right before the delete button `<td className="py-2 text-right">`:

```tsx
                          <td className="py-2 pr-2">
                            <select
                              value={v.driverUserId ?? ''}
                              onChange={(e) => updateVehicle(v.id, 'driverUserId', e.target.value || null)}
                              className="border border-slate-300 rounded px-2 py-1 bg-white"
                            >
                              <option value="">ยังไม่ระบุ</option>
                              {drivers.map(d => (
                                <option key={d.id} value={d.id}>{d.displayName}</option>
                              ))}
                            </select>
                          </td>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors — `updateVehicle`'s existing signature `(id: string, field: keyof Vehicle, value: number | string | null)` already accepts `'driverUserId'` and a `string | null` value.

- [ ] **Step 5: Commit**

```bash
git add src/components/FleetConfigModal.tsx
git commit -m "feat: add driver-assignment column to FleetConfigModal"
```

---

### Task 13: App.tsx — session restore, role branching, remove demo entry point

**Files:**
- Modify: `src/App.tsx`
- Delete: `src/care/CareDriverDemo.tsx`, `src/data/careSampleFleet.ts`, `src/data/careSampleData.ts`

**Interfaces:**
- Consumes: `getMe`, `logout as apiLogout`, `CurrentUser` from `src/lib/api.ts` (Task 8); `LoginMockup` from Task 9; `DriverShell` from Task 10; `AdminDriversPanel`, updated `Sidebar` from Task 11.
- Produces: fully wired admin/driver role branching in the app's root component.

- [ ] **Step 1: Confirm the three Care-demo files have no other consumers**

Run: `grep -rl "CareDriverDemo\|careSampleFleet\|careSampleNodes" src --include=*.tsx --include=*.ts`
Expected output: only `src/App.tsx`, `src/care/CareDriverDemo.tsx`, `src/data/careSampleFleet.ts`, `src/data/careSampleData.ts` — confirming these three files become dead code once `App.tsx` stops importing them.

- [ ] **Step 2: Update imports**

In `src/App.tsx`, remove these three import lines (currently lines 18-20):

```ts
import CareDriverDemo from './care/CareDriverDemo';
import { careSampleNodes } from './data/careSampleData';
import { careSampleFleet } from './data/careSampleFleet';
```

Add these imports in their place:

```ts
import DriverShell from './components/DriverShell';
import AdminDriversPanel from './components/AdminDriversPanel';
import { getMe, logout as apiLogout, CurrentUser } from './lib/api';
```

- [ ] **Step 3: Replace the isSignedIn state**

Replace the line `const [isSignedIn, setIsSignedIn] = useState(false);` (currently line 23) with:

```tsx
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isDriversManagerOpen, setIsDriversManagerOpen] = useState(false);
```

- [ ] **Step 4: Add session restore, gate fleet loading to admin**

Replace the existing effect (currently lines 54-56):

```tsx
  useEffect(() => {
    loadFleetFromServer();
  }, []);
```

with:

```tsx
  useEffect(() => {
    getMe().then(setCurrentUser).catch(() => setCurrentUser(null)).finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    if (currentUser?.role === 'admin') loadFleetFromServer();
  }, [currentUser]);
```

- [ ] **Step 5: Replace the demo entry point and sign-in gate**

Replace this block (currently lines 179-188):

```tsx
  const careQuery = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  if (careQuery?.get('care') === '1' && careQuery?.get('driver') === '1') {
    // Standalone mobile driver check-in screen — deliberately outside the desktop Sidebar shell.
    const careBaseParams = { fleetPool: careSampleFleet, avgSpeed: 40, driverWage: 60, algorithm: 'or-opt-sa' as const, applyTwoOpt: false };
    return <CareDriverDemo nodes={careSampleNodes} baseParams={careBaseParams} />;
  }

  if (!isSignedIn) {
    return <LoginMockup onSignIn={() => setIsSignedIn(true)} />;
  }
```

with:

```tsx
  if (!authChecked) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-neutral-canvas">
        <Loader2 className="w-10 h-10 text-fleet-navy animate-spin" />
      </div>
    );
  }

  if (!currentUser) {
    return <LoginMockup onSignIn={setCurrentUser} />;
  }

  if (currentUser.role === 'driver') {
    return <DriverShell user={currentUser} onLoggedOut={() => setCurrentUser(null)} />;
  }
```

- [ ] **Step 6: Wire the new Sidebar props and mount AdminDriversPanel**

Replace the existing `<Sidebar .../>` call (currently lines 206-218):

```tsx
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        onDataLoaded={handleDataLoaded}
        isProcessing={isComparing}
        hasData={processedData !== null}
        hasComparison={comparisonData !== null}
        avgSpeed={avgSpeed}
        setAvgSpeed={setAvgSpeed}
        setIsFleetConfigOpen={setIsFleetConfigOpen}
        isMobileNavOpen={isMobileNavOpen}
        onCloseMobileNav={() => setIsMobileNavOpen(false)}
      />
```

with:

```tsx
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        onDataLoaded={handleDataLoaded}
        isProcessing={isComparing}
        hasData={processedData !== null}
        hasComparison={comparisonData !== null}
        avgSpeed={avgSpeed}
        setAvgSpeed={setAvgSpeed}
        setIsFleetConfigOpen={setIsFleetConfigOpen}
        setIsDriversManagerOpen={setIsDriversManagerOpen}
        onLogout={() => { apiLogout().catch(() => {}); setCurrentUser(null); }}
        isMobileNavOpen={isMobileNavOpen}
        onCloseMobileNav={() => setIsMobileNavOpen(false)}
      />
```

Add `<AdminDriversPanel .../>` right after the existing `<FleetConfigModal .../>` block:

```tsx
      <AdminDriversPanel
        isOpen={isDriversManagerOpen}
        onClose={() => setIsDriversManagerOpen(false)}
      />
```

- [ ] **Step 7: Delete the orphaned Care-demo files**

```bash
git rm src/care/CareDriverDemo.tsx src/data/careSampleFleet.ts src/data/careSampleData.ts
```

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Run the full frontend test suite**

Run: `npx vitest run src`
Expected: PASS — all existing suites, including the updated `LoginMockup.test.tsx`.

- [ ] **Step 10: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire admin/driver role branching into App.tsx, remove demo entry point"
```

---

### Task 14: Full-suite verification, manual smoke test, README note

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — every test file in `server/` and `src/`.

- [ ] **Step 2: Type-check the whole project**

Run: `npm run lint`
Expected: PASS (this project's `lint` script is `tsc --noEmit`).

- [ ] **Step 3: Add a README note about the default admin credential**

Append to `README.md`:

```markdown

## Default login

On first run, an admin account is seeded automatically: username `admin`, password `admin123`. Change this password (or create a new admin and delete this one) before using the app with real data — see the "จัดการคนขับ" panel is for driver accounts only; there's currently no in-app way to change the admin's own password, so do it directly against the `users` table if needed.
```

- [ ] **Step 4: Manual browser smoke test**

Run: `npm run dev` (starts both the Vite client and the Express API per `package.json`'s `dev` script)

Walk through in a browser at the printed local URL:
1. Log in with `admin` / `admin123` → lands on the full admin Sidebar shell.
2. Open "👤 จัดการคนขับ (Drivers)" → create a driver (e.g. username `somchai`, password `pass1234`, display name `สมชาย`).
3. Upload a manifest CSV via the sidebar, run "คำนวณเส้นทาง" to compute and save an active plan.
4. Open "⚙️ ตั้งค่ากองรถ (Fleet Config)" → assign `สมชาย` to one of the vehicle rows via the new "คนขับ" dropdown → save.
5. Click "ออกจากระบบ" (logout) in the Sidebar → redirected to login.
6. Log in as `somchai` / `pass1234` → confirm the driver shell shows only that one assigned route (no vehicle-selector dropdown), with the top bar showing "สมชาย" and a logout button.
7. Click through "กำลังไปส่ง" / "ส่งเสร็จแล้ว" on the first stop.
8. Log out, log back in as `admin`, open the Dashboard tab → confirm the existing "สถานะการจัดส่งสด (Live Delivery Status)" card now shows the updated step for that vehicle (this closes the loop on `postProgress`, which was previously unwired to any UI).

Expected: every step behaves as described; no console errors related to 401s on pages the current role should be able to see.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: note default admin credential in README"
```

---

## Self-Review Notes

**Spec coverage:** DB-backed sessions (Tasks 1-2), bcrypt hashing (Tasks 1, 3, 4), admin seed (Task 1), auth endpoints (Task 3), driver CRUD (Task 4), fleet admin-gating + driver assignment (Tasks 5, 12), plan admin-gating + `/my-route` + progress ownership (Task 6), frontend login (Task 9), driver-locked portal (Task 10), admin drivers UI (Task 11), demo entry-point removal (Task 13), error-handling cases from the spec (wrong credentials, no vehicle assigned, expired session, cross-driver progress writes, non-admin on admin routes) are each covered by a specific test in Tasks 3, 4, 5, 6, or the empty-state branch in Task 10. Testing section of the spec is covered 1:1 by Tasks 1, 3, 4, 5, 6, 9.

**Type consistency check:** `DriverAccount` shape (`id, username, displayName, vehicleId, vehicleName`) is identical across Task 4's route response, Task 8's client type, Task 11's panel usage. `CurrentUser` shape (`id, username, role, displayName`) is identical across Task 3's `/me` response, Task 8's client type, Task 9's `onSignIn`, Task 10's props, Task 13's state. `postProgress(routeIndex, currentStep, stepState)` signature (defined pre-existing in `src/lib/api.ts`) matches the call in Task 10's `onStepChange`. `getMyRoute()`'s return shape (`{ routeSummary, legs } | null`) matches its construction in Task 6's route handler and its consumption in Task 10.

**No placeholders:** every step above contains complete, runnable code — no TBDs.
