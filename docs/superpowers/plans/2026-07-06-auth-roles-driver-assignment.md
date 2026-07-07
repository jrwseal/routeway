# Auth, Roles & Driver Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real login system with two roles (planner, driver) backed by a new Express+SQLite backend; planners manage driver accounts and a per-vehicle fleet table with driver assignment; drivers see only their own assigned route and can push live progress back to the planner.

**Architecture:** New `server/` Express app using Node's built-in `node:sqlite` (`DatabaseSync`) for persistence, run as a separate process from the Vite dev server (proxied via `/api`). Frontend keeps all VRP computation client-side; only auth, fleet config, and the "active plan" the planner finalizes move server-side. JWT in an httpOnly cookie for sessions.

**Tech Stack:** Express, `node:sqlite` (built into Node 22.5+, no native compile step — this project runs Node 24), `bcryptjs`, `jsonwebtoken`, `cookie-parser`, `tsx` (already a devDependency, used to run the server directly), `concurrently` (dev-only, runs client+server together), `supertest` for route tests, existing `vitest`.

## Global Constraints

- No native-compiled dependencies (avoid `better-sqlite3`/`bcrypt` — use `node:sqlite` + `bcryptjs` instead) since this must run on Windows without build tools installed.
- Single company / single tenant — no multi-tenant isolation (per spec).
- No email/password-reset flows, no WebSocket push, no historical plan archive (all out of scope per spec).
- All new UI text follows existing convention: Thai for user-facing labels/buttons, matching the rest of the app (e.g. `ตั้งค่ากองรถ`, `เลือกยานพาหนะ`).
- `JWT_SECRET` read from `process.env.JWT_SECRET`; fall back to a dev default with a `console.warn` (no production secret-management system in scope).

---

## Task 1: Backend auth utilities

**Files:**
- Create: `server/auth.ts`
- Test: `server/auth.test.ts`

**Interfaces:**
- Produces: `hashPassword(password: string): string`, `verifyPassword(password: string, hash: string): boolean`, `JwtPayload { sub: number; username: string; role: 'planner' | 'driver' }`, `signToken(payload: JwtPayload): string`, `verifyToken(token: string): JwtPayload | null`, `COOKIE_NAME: string`

- [ ] **Step 1: Install backend dependencies**

Run: `npm install express cookie-parser bcryptjs jsonwebtoken && npm install -D @types/express @types/cookie-parser @types/bcryptjs @types/jsonwebtoken supertest @types/supertest concurrently`

Note: `express` and `@types/express` already exist as devDependencies from an old template — `npm install express` (without `-D`) will move it to `dependencies`, which is correct since it now runs in production.

- [ ] **Step 2: Write the failing test**

```typescript
// server/auth.test.ts
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, signToken, verifyToken } from './auth';

describe('password hashing', () => {
  it('verifies a correct password', () => {
    const hash = hashPassword('secret123');
    expect(verifyPassword('secret123', hash)).toBe(true);
  });

  it('rejects a wrong password', () => {
    const hash = hashPassword('secret123');
    expect(verifyPassword('wrong', hash)).toBe(false);
  });
});

describe('jwt tokens', () => {
  it('round-trips a valid payload', () => {
    const token = signToken({ sub: 1, username: 'admin', role: 'planner' });
    const payload = verifyToken(token);
    expect(payload).toEqual({ sub: 1, username: 'admin', role: 'planner' });
  });

  it('returns null for a garbage token', () => {
    expect(verifyToken('not-a-real-token')).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run server/auth.test.ts`
Expected: FAIL with "Cannot find module './auth'"

- [ ] **Step 4: Write minimal implementation**

```typescript
// server/auth.ts
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.warn('JWT_SECRET not set — using an insecure dev default. Set JWT_SECRET in production.');
  return 'dev-secret-change-me';
})();

export const COOKIE_NAME = 'rw_token';

export interface JwtPayload {
  sub: number;
  username: string;
  role: 'planner' | 'driver';
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run server/auth.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json server/auth.ts server/auth.test.ts
git commit -m "feat: add password hashing and JWT helpers for backend auth"
```

---

## Task 2: Database schema and seeding

**Files:**
- Create: `server/db.ts`
- Test: `server/db.test.ts`

**Interfaces:**
- Consumes: `hashPassword` from `server/auth.ts` (Task 1)
- Produces: `createDb(path: string): DatabaseSync` — creates all tables if missing, seeds one default planner user (`admin`/`admin1234`) and a default `settings` row and 9 default vehicles when the DB is empty.

- [ ] **Step 1: Write the failing test**

```typescript
// server/db.test.ts
import { describe, it, expect } from 'vitest';
import { createDb } from './db';
import { verifyPassword } from './auth';

describe('createDb', () => {
  it('seeds a default planner account on first run', () => {
    const db = createDb(':memory:');
    const row = db.prepare('SELECT * FROM users WHERE username = ?').get('admin') as any;
    expect(row.role).toBe('planner');
    expect(verifyPassword('admin1234', row.password_hash)).toBe(true);
  });

  it('seeds default settings', () => {
    const db = createDb(':memory:');
    const row = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any;
    expect(row.driver_wage).toBe(60);
    expect(row.fuel_price_4w).toBe(35);
  });

  it('seeds 9 default vehicles', () => {
    const db = createDb(':memory:');
    const row = db.prepare('SELECT COUNT(*) as count FROM vehicles').get() as any;
    expect(row.count).toBe(9);
  });

  it('does not reseed on a second call with an existing file', () => {
    const db1 = createDb(':memory:');
    db1.prepare('INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)')
      .run('extra', 'hash', 'driver', 'Extra');
    const count1 = (db1.prepare('SELECT COUNT(*) as count FROM users').get() as any).count;
    expect(count1).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/db.test.ts`
Expected: FAIL with "Cannot find module './db'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// server/db.ts
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './auth';

const DEFAULT_VEHICLES = [
  { id: '4w-1', type: '4-wheel', name: 'รถบรรทุก 4 ล้อใหญ่ - คันที่ 1', capacityCBM: 12, fuelConsumption: 0.12, fixedCost: 300, color: '#10B981' },
  { id: '4w-2', type: '4-wheel', name: 'รถบรรทุก 4 ล้อใหญ่ - คันที่ 2', capacityCBM: 12, fuelConsumption: 0.12, fixedCost: 300, color: '#10B981' },
  { id: '4w-3', type: '4-wheel', name: 'รถบรรทุก 4 ล้อใหญ่ - คันที่ 3', capacityCBM: 12, fuelConsumption: 0.12, fixedCost: 300, color: '#10B981' },
  { id: '6w-1', type: '6-wheel', name: 'รถบรรทุก 6 ล้อ - คันที่ 1', capacityCBM: 32, fuelConsumption: 0.2, fixedCost: 450, color: '#3B82F6' },
  { id: '6w-2', type: '6-wheel', name: 'รถบรรทุก 6 ล้อ - คันที่ 2', capacityCBM: 32, fuelConsumption: 0.2, fixedCost: 450, color: '#3B82F6' },
  { id: '6w-3', type: '6-wheel', name: 'รถบรรทุก 6 ล้อ - คันที่ 3', capacityCBM: 32, fuelConsumption: 0.2, fixedCost: 450, color: '#3B82F6' },
  { id: '10w-1', type: '10-wheel', name: 'รถบรรทุก 10 ล้อ - คันที่ 1', capacityCBM: 48, fuelConsumption: 0.28, fixedCost: 600, color: '#F97316' },
  { id: '10w-2', type: '10-wheel', name: 'รถบรรทุก 10 ล้อ - คันที่ 2', capacityCBM: 48, fuelConsumption: 0.28, fixedCost: 600, color: '#F97316' },
  { id: '10w-3', type: '10-wheel', name: 'รถบรรทุก 10 ล้อ - คันที่ 3', capacityCBM: 48, fuelConsumption: 0.28, fixedCost: 600, color: '#F97316' },
];

export function createDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('planner','driver')),
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      capacity_cbm REAL NOT NULL,
      fuel_consumption REAL NOT NULL,
      fixed_cost REAL NOT NULL,
      color TEXT NOT NULL,
      driver_user_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      driver_wage REAL NOT NULL DEFAULT 60,
      fuel_price_4w REAL NOT NULL DEFAULT 35,
      fuel_price_6w REAL NOT NULL DEFAULT 35,
      fuel_price_10w REAL NOT NULL DEFAULT 35
    );

    CREATE TABLE IF NOT EXISTS active_plan (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      created_at TEXT NOT NULL,
      optimization_criterion TEXT NOT NULL,
      nodes_json TEXT NOT NULL,
      legs_json TEXT NOT NULL,
      route_summaries_json TEXT NOT NULL,
      aggregates_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plan_progress (
      route_index INTEGER PRIMARY KEY,
      current_step INTEGER NOT NULL DEFAULT 0,
      step_state TEXT NOT NULL DEFAULT 'pending',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
  if (userCount === 0) {
    db.prepare(
      'INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)'
    ).run('admin', hashPassword('admin1234'), 'planner', 'Planner');
  }

  const settingsCount = (db.prepare('SELECT COUNT(*) as count FROM settings').get() as { count: number }).count;
  if (settingsCount === 0) {
    db.prepare('INSERT INTO settings (id) VALUES (1)').run();
  }

  const vehicleCount = (db.prepare('SELECT COUNT(*) as count FROM vehicles').get() as { count: number }).count;
  if (vehicleCount === 0) {
    const insert = db.prepare(
      'INSERT INTO vehicles (id, type, name, capacity_cbm, fuel_consumption, fixed_cost, color) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    for (const v of DEFAULT_VEHICLES) {
      insert.run(v.id, v.type, v.name, v.capacityCBM, v.fuelConsumption, v.fixedCost, v.color);
    }
  }

  return db;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/db.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add server/db.ts server/db.test.ts
git commit -m "feat: add SQLite schema and default seed data"
```

---

## Task 3: Auth middleware

**Files:**
- Create: `server/middleware.ts`
- Test: `server/middleware.test.ts`

**Interfaces:**
- Consumes: `verifyToken`, `JwtPayload`, `COOKIE_NAME` from `server/auth.ts` (Task 1)
- Produces: `requireAuth(req, res, next)` (sets `req.user: JwtPayload`, else 401 `{ error }`), `requireRole(role: 'planner' | 'driver')` (returns a middleware, 403 `{ error }` if role mismatches), both operate on Express `Request` extended with an optional `user` field

- [ ] **Step 1: Write the failing test**

```typescript
// server/middleware.test.ts
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { requireAuth, requireRole } from './middleware';
import { signToken, COOKIE_NAME } from './auth';

function buildTestApp() {
  const app = express();
  app.use(cookieParser());
  app.get('/protected', requireAuth, (req, res) => res.json({ ok: true }));
  app.get('/planner-only', requireAuth, requireRole('planner'), (req, res) => res.json({ ok: true }));
  return app;
}

describe('requireAuth', () => {
  it('rejects requests with no cookie', async () => {
    const res = await request(buildTestApp()).get('/protected');
    expect(res.status).toBe(401);
  });

  it('allows requests with a valid cookie', async () => {
    const token = signToken({ sub: 1, username: 'admin', role: 'planner' });
    const res = await request(buildTestApp()).get('/protected').set('Cookie', `${COOKIE_NAME}=${token}`);
    expect(res.status).toBe(200);
  });
});

describe('requireRole', () => {
  it('rejects a driver hitting a planner-only route', async () => {
    const token = signToken({ sub: 2, username: 'driver1', role: 'driver' });
    const res = await request(buildTestApp()).get('/planner-only').set('Cookie', `${COOKIE_NAME}=${token}`);
    expect(res.status).toBe(403);
  });

  it('allows a planner hitting a planner-only route', async () => {
    const token = signToken({ sub: 1, username: 'admin', role: 'planner' });
    const res = await request(buildTestApp()).get('/planner-only').set('Cookie', `${COOKIE_NAME}=${token}`);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/middleware.test.ts`
Expected: FAIL with "Cannot find module './middleware'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// server/middleware.ts
import type { Request, Response, NextFunction } from 'express';
import { verifyToken, COOKIE_NAME, JwtPayload } from './auth';

declare module 'express-serve-static-core' {
  interface Request {
    user?: JwtPayload;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE_NAME];
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  req.user = payload;
  next();
}

export function requireRole(role: 'planner' | 'driver') {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== role) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/middleware.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add server/middleware.ts server/middleware.test.ts
git commit -m "feat: add auth/role guard middleware"
```

---

## Task 4: App scaffold and auth routes

**Files:**
- Create: `server/app.ts`, `server/routes/auth.ts`
- Test: `server/routes/auth.test.ts`

**Interfaces:**
- Consumes: `createDb` (Task 2), `requireAuth` (Task 3), `hashPassword`/`verifyPassword`/`signToken`/`COOKIE_NAME` (Task 1)
- Produces: `createApp(db: DatabaseSync): Express` (used by every later route test and by `server/index.ts`), `authRouter(db: DatabaseSync): Router` mounted at `/api/auth` with `POST /login`, `POST /logout`, `GET /me`

- [ ] **Step 1: Write the failing test**

```typescript
// server/routes/auth.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb } from '../db';
import { createApp } from '../app';

describe('auth routes', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp(createDb(':memory:'));
  });

  it('logs in with the seeded planner account', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin1234' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('planner');
    expect(res.headers['set-cookie'][0]).toMatch(/rw_token=/);
  });

  it('rejects a wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  });

  it('returns the current user from /me after login', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin1234' });
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('admin');
  });

  it('returns 401 from /me with no session', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('clears the session on logout', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin1234' });
    await agent.post('/api/auth/logout');
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/routes/auth.test.ts`
Expected: FAIL with "Cannot find module '../app'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// server/routes/auth.ts
import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { hashPassword, verifyPassword, signToken, COOKIE_NAME } from '../auth';
import { requireAuth } from '../middleware';

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: 'planner' | 'driver';
  display_name: string;
}

export function authRouter(db: DatabaseSync): Router {
  const router = Router();

  router.post('/login', (req, res) => {
    const { username, password } = req.body ?? {};
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
    if (!user || !verifyPassword(password ?? '', user.password_hash)) {
      res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
      return;
    }
    const token = signToken({ sub: user.id, username: user.username, role: user.role });
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ id: user.id, username: user.username, role: user.role, displayName: user.display_name });
  });

  router.post('/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME);
    res.json({ ok: true });
  });

  router.get('/me', requireAuth, (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.sub) as UserRow | undefined;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    res.json({ id: user.id, username: user.username, role: user.role, displayName: user.display_name });
  });

  return router;
}
```

```typescript
// server/app.ts
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import type { DatabaseSync } from 'node:sqlite';
import { authRouter } from './routes/auth';

export function createApp(db: DatabaseSync): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRouter(db));
  return app;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/routes/auth.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add server/app.ts server/routes/auth.ts server/routes/auth.test.ts
git commit -m "feat: add express app scaffold and login/logout/me routes"
```

---

## Task 5: Driver account management routes

**Files:**
- Create: `server/routes/drivers.ts`
- Modify: `server/app.ts` (mount the new router)
- Test: `server/routes/drivers.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `requireRole` (Task 3), `hashPassword` (Task 1)
- Produces: `driversRouter(db: DatabaseSync): Router` mounted at `/api/drivers` — `GET /` (list), `POST /` (create), `DELETE /:id` (delete + unassign from any vehicle), all planner-only

- [ ] **Step 1: Write the failing test**

```typescript
// server/routes/drivers.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb } from '../db';
import { createApp } from '../app';

async function loginAsPlanner(app: any) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin1234' });
  return agent;
}

describe('drivers routes', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp(createDb(':memory:'));
  });

  it('rejects unauthenticated access', async () => {
    const res = await request(app).get('/api/drivers');
    expect(res.status).toBe(401);
  });

  it('creates and lists a driver account', async () => {
    const agent = await loginAsPlanner(app);
    const createRes = await agent.post('/api/drivers').send({ username: 'somchai', password: 'pass1234', displayName: 'สมชาย' });
    expect(createRes.status).toBe(201);
    expect(createRes.body.username).toBe('somchai');

    const listRes = await agent.get('/api/drivers');
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].displayName).toBe('สมชาย');
  });

  it('rejects a duplicate username', async () => {
    const agent = await loginAsPlanner(app);
    await agent.post('/api/drivers').send({ username: 'somchai', password: 'pass1234', displayName: 'สมชาย' });
    const res = await agent.post('/api/drivers').send({ username: 'somchai', password: 'other123', displayName: 'Someone Else' });
    expect(res.status).toBe(409);
  });

  it('deletes a driver and clears any vehicle assignment', async () => {
    const agent = await loginAsPlanner(app);
    const createRes = await agent.post('/api/drivers').send({ username: 'somchai', password: 'pass1234', displayName: 'สมชาย' });
    const driverId = createRes.body.id;

    const db = (app as any).locals?.db;
    await agent.put('/api/fleet').send({
      vehicles: [{ id: '4w-1', type: '4-wheel', name: 'Truck 1', capacityCBM: 12, fuelConsumption: 0.12, fixedCost: 300, color: '#10B981', driverUserId: driverId }],
      driverWage: 60, fuelPrice4W: 35, fuelPrice6W: 35, fuelPrice10W: 35,
    });

    const deleteRes = await agent.delete(`/api/drivers/${driverId}`);
    expect(deleteRes.status).toBe(200);

    const fleetRes = await agent.get('/api/fleet');
    expect(fleetRes.body.vehicles[0].driverUserId).toBeNull();
  });
});
```

Note: this test calls `PUT /api/fleet` and `GET /api/fleet`, which don't exist yet — Task 6 implements them. Write this test file now, but skip running the `deletes a driver` test until Task 6 is done (the other three tests in this file are self-contained and should pass now).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/routes/drivers.test.ts`
Expected: FAIL with "Cannot find module '../drivers'" (or route 404s) for all tests

- [ ] **Step 3: Write minimal implementation**

```typescript
// server/routes/drivers.ts
import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { hashPassword } from '../auth';
import { requireAuth, requireRole } from '../middleware';

export function driversRouter(db: DatabaseSync): Router {
  const router = Router();
  router.use(requireAuth, requireRole('planner'));

  router.get('/', (req, res) => {
    const rows = db.prepare("SELECT id, username, display_name FROM users WHERE role = 'driver' ORDER BY id").all() as any[];
    res.json(rows.map(r => ({ id: r.id, username: r.username, displayName: r.display_name })));
  });

  router.post('/', (req, res) => {
    const { username, password, displayName } = req.body ?? {};
    if (!username || !password || !displayName) {
      res.status(400).json({ error: 'username, password, displayName are required' });
      return;
    }
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      res.status(409).json({ error: 'Username already exists' });
      return;
    }
    const info = db.prepare(
      'INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)'
    ).run(username, hashPassword(password), 'driver', displayName);
    res.status(201).json({ id: Number(info.lastInsertRowid), username, displayName });
  });

  router.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    const result = db.prepare("DELETE FROM users WHERE id = ? AND role = 'driver'").run(id);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Driver not found' });
      return;
    }
    db.prepare('UPDATE vehicles SET driver_user_id = NULL WHERE driver_user_id = ?').run(id);
    res.json({ ok: true });
  });

  return router;
}
```

```typescript
// server/app.ts (modify — add import and mount line)
import { driversRouter } from './routes/drivers';
// ...
app.use('/api/drivers', driversRouter(db));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/routes/drivers.test.ts`
Expected: 3 of 4 tests PASS now; the "deletes a driver" test still fails until Task 6 adds `/api/fleet` — that's expected, move on

- [ ] **Step 5: Commit**

```bash
git add server/app.ts server/routes/drivers.ts server/routes/drivers.test.ts
git commit -m "feat: add planner-only driver account management routes"
```

---

## Task 6: Vehicle type field + fleet routes

**Files:**
- Modify: `src/types.ts:14-22` (add `driverUserId` to `Vehicle`)
- Create: `server/routes/fleet.ts`
- Modify: `server/app.ts` (mount the new router)
- Test: `server/routes/fleet.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `requireRole` (Task 3)
- Produces: `fleetRouter(db: DatabaseSync): Router` mounted at `/api/fleet` — `GET /` and `PUT /`, both planner-only. `Vehicle.driverUserId?: number | null` used by all later frontend tasks.

- [ ] **Step 1: Add `driverUserId` to the `Vehicle` type**

```typescript
// src/types.ts:14-22 (modify)
export interface Vehicle {
  id: string;
  type: string;
  name: string;
  capacityCBM: number;
  fuelConsumption: number;
  fixedCost: number;
  color: string;
  driverUserId?: number | null;
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// server/routes/fleet.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb } from '../db';
import { createApp } from '../app';

async function loginAsPlanner(app: any) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin1234' });
  return agent;
}

describe('fleet routes', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp(createDb(':memory:'));
  });

  it('rejects unauthenticated access', async () => {
    const res = await request(app).get('/api/fleet');
    expect(res.status).toBe(401);
  });

  it('returns the seeded default fleet', async () => {
    const agent = await loginAsPlanner(app);
    const res = await agent.get('/api/fleet');
    expect(res.status).toBe(200);
    expect(res.body.vehicles).toHaveLength(9);
    expect(res.body.driverWage).toBe(60);
    expect(res.body.vehicles[0].driverUserId).toBeNull();
  });

  it('saves an edited fleet with a driver assignment', async () => {
    const agent = await loginAsPlanner(app);
    const driverRes = await agent.post('/api/drivers').send({ username: 'somchai', password: 'pass1234', displayName: 'สมชาย' });
    const driverId = driverRes.body.id;

    const putRes = await agent.put('/api/fleet').send({
      vehicles: [
        { id: '4w-1', type: '4-wheel', name: 'Truck 1', capacityCBM: 12, fuelConsumption: 0.12, fixedCost: 300, color: '#10B981', driverUserId: driverId },
      ],
      driverWage: 70,
      fuelPrice4W: 36,
      fuelPrice6W: 36,
      fuelPrice10W: 36,
    });
    expect(putRes.status).toBe(200);

    const getRes = await agent.get('/api/fleet');
    expect(getRes.body.vehicles).toHaveLength(1);
    expect(getRes.body.vehicles[0].driverUserId).toBe(driverId);
    expect(getRes.body.driverWage).toBe(70);
  });

  it('rejects driver-role access', async () => {
    const agent = await loginAsPlanner(app);
    await agent.post('/api/drivers').send({ username: 'somchai', password: 'pass1234', displayName: 'สมชาย' });
    const driverAgent = request.agent(app);
    await driverAgent.post('/api/auth/login').send({ username: 'somchai', password: 'pass1234' });
    const res = await driverAgent.get('/api/fleet');
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run server/routes/fleet.test.ts`
Expected: FAIL — route 404s

- [ ] **Step 4: Write minimal implementation**

```typescript
// server/routes/fleet.ts
import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { requireAuth, requireRole } from '../middleware';

interface VehicleRow {
  id: string;
  type: string;
  name: string;
  capacity_cbm: number;
  fuel_consumption: number;
  fixed_cost: number;
  color: string;
  driver_user_id: number | null;
}

interface SettingsRow {
  driver_wage: number;
  fuel_price_4w: number;
  fuel_price_6w: number;
  fuel_price_10w: number;
}

export function fleetRouter(db: DatabaseSync): Router {
  const router = Router();
  router.use(requireAuth, requireRole('planner'));

  router.get('/', (req, res) => {
    const rows = db.prepare('SELECT * FROM vehicles ORDER BY type, id').all() as VehicleRow[];
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as SettingsRow;
    res.json({
      vehicles: rows.map(r => ({
        id: r.id,
        type: r.type,
        name: r.name,
        capacityCBM: r.capacity_cbm,
        fuelConsumption: r.fuel_consumption,
        fixedCost: r.fixed_cost,
        color: r.color,
        driverUserId: r.driver_user_id,
      })),
      driverWage: settings.driver_wage,
      fuelPrice4W: settings.fuel_price_4w,
      fuelPrice6W: settings.fuel_price_6w,
      fuelPrice10W: settings.fuel_price_10w,
    });
  });

  router.put('/', (req, res) => {
    const { vehicles, driverWage, fuelPrice4W, fuelPrice6W, fuelPrice10W } = req.body ?? {};
    if (!Array.isArray(vehicles)) {
      res.status(400).json({ error: 'vehicles must be an array' });
      return;
    }
    for (const v of vehicles) {
      if (!v.id || !v.type || !v.name || typeof v.capacityCBM !== 'number' || typeof v.fuelConsumption !== 'number' || typeof v.fixedCost !== 'number' || !v.color) {
        res.status(400).json({ error: 'Invalid vehicle entry' });
        return;
      }
    }

    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM vehicles').run();
      const insert = db.prepare(
        'INSERT INTO vehicles (id, type, name, capacity_cbm, fuel_consumption, fixed_cost, color, driver_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const v of vehicles) {
        insert.run(v.id, v.type, v.name, v.capacityCBM, v.fuelConsumption, v.fixedCost, v.color, v.driverUserId ?? null);
      }
      db.prepare(
        'UPDATE settings SET driver_wage = ?, fuel_price_4w = ?, fuel_price_6w = ?, fuel_price_10w = ? WHERE id = 1'
      ).run(driverWage ?? 60, fuelPrice4W ?? 35, fuelPrice6W ?? 35, fuelPrice10W ?? 35);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    res.json({ ok: true });
  });

  return router;
}
```

```typescript
// server/app.ts (modify — add import and mount line)
import { fleetRouter } from './routes/fleet';
// ...
app.use('/api/fleet', fleetRouter(db));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run server/routes/fleet.test.ts server/routes/drivers.test.ts`
Expected: PASS (4 tests in fleet.test.ts, and the previously-skipped "deletes a driver" test in drivers.test.ts now also passes — 4/4)

- [ ] **Step 6: Commit**

```bash
git add src/types.ts server/app.ts server/routes/fleet.ts server/routes/fleet.test.ts
git commit -m "feat: add fleet config persistence with per-vehicle driver assignment"
```

---

## Task 7: Active plan + progress routes

**Files:**
- Create: `server/routes/plan.ts`
- Modify: `server/app.ts` (mount the new router)
- Test: `server/routes/plan.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `requireRole` (Task 3)
- Produces: `planRouter(db: DatabaseSync): Router` mounted at `/api/plan` — `POST /` (planner saves the finalized plan, resets progress), `GET /active` (role-aware: planner gets everything, driver gets only their assigned route or `null`), `POST /progress` (driver-only, own route only), `GET /progress` (planner-only, all routes)

- [ ] **Step 1: Write the failing test**

```typescript
// server/routes/plan.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb } from '../db';
import { createApp } from '../app';

async function loginAsPlanner(app: any) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin1234' });
  return agent;
}

const samplePlan = (vehicleDriverUserId: number | null) => ({
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
      vehicle: { id: '4w-1', type: '4-wheel', name: 'Truck 1', capacityCBM: 12, fuelConsumption: 0.12, fixedCost: 300, color: '#10B981', driverUserId: vehicleDriverUserId },
    }],
  },
});

describe('plan routes', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp(createDb(':memory:'));
  });

  it('returns null for planner when no plan exists yet', async () => {
    const agent = await loginAsPlanner(app);
    const res = await agent.get('/api/plan/active');
    expect(res.status).toBe(200);
    expect(res.body.plan).toBeNull();
  });

  it('planner can save a plan and read it back in full', async () => {
    const agent = await loginAsPlanner(app);
    const saveRes = await agent.post('/api/plan').send(samplePlan(null));
    expect(saveRes.status).toBe(200);

    const res = await agent.get('/api/plan/active');
    expect(res.body.plan.legs).toHaveLength(1);
    expect(res.body.plan.routeSummaries[0].routeIndex).toBe(1);
  });

  it('resets progress to step 0 when a new plan is saved', async () => {
    const agent = await loginAsPlanner(app);
    await agent.post('/api/plan').send(samplePlan(null));
    const progressRes = await agent.get('/api/plan/progress');
    expect(progressRes.body).toEqual([{ routeIndex: 1, currentStep: 0, stepState: 'pending' }]);
  });

  it('driver sees only their assigned route, or null if unassigned', async () => {
    const agent = await loginAsPlanner(app);
    const driverRes = await agent.post('/api/drivers').send({ username: 'somchai', password: 'pass1234', displayName: 'สมชาย' });
    const driverId = driverRes.body.id;
    await agent.post('/api/plan').send(samplePlan(driverId));

    const driverAgent = request.agent(app);
    await driverAgent.post('/api/auth/login').send({ username: 'somchai', password: 'pass1234' });
    const res = await driverAgent.get('/api/plan/active');
    expect(res.body.plan.routeSummaries).toHaveLength(1);
    expect(res.body.plan.legs).toHaveLength(1);

    const otherRes = await agent.post('/api/drivers').send({ username: 'wichai', password: 'pass1234', displayName: 'วิชัย' });
    const otherAgent = request.agent(app);
    await otherAgent.post('/api/auth/login').send({ username: 'wichai', password: 'pass1234' });
    const unassignedRes = await otherAgent.get('/api/plan/active');
    expect(unassignedRes.body.plan).toBeNull();
  });

  it('driver can push their own progress, planner reads it back', async () => {
    const agent = await loginAsPlanner(app);
    const driverRes = await agent.post('/api/drivers').send({ username: 'somchai', password: 'pass1234', displayName: 'สมชาย' });
    const driverId = driverRes.body.id;
    await agent.post('/api/plan').send(samplePlan(driverId));

    const driverAgent = request.agent(app);
    await driverAgent.post('/api/auth/login').send({ username: 'somchai', password: 'pass1234' });
    const postRes = await driverAgent.post('/api/plan/progress').send({ routeIndex: 1, currentStep: 1, stepState: 'in_transit' });
    expect(postRes.status).toBe(200);

    const progressRes = await agent.get('/api/plan/progress');
    expect(progressRes.body).toEqual([{ routeIndex: 1, currentStep: 1, stepState: 'in_transit' }]);
  });

  it('rejects a driver pushing progress for a route that is not theirs', async () => {
    const agent = await loginAsPlanner(app);
    const driverRes = await agent.post('/api/drivers').send({ username: 'somchai', password: 'pass1234', displayName: 'สมชาย' });
    await agent.post('/api/plan').send(samplePlan(driverRes.body.id));

    const otherRes = await agent.post('/api/drivers').send({ username: 'wichai', password: 'pass1234', displayName: 'วิชัย' });
    const otherAgent = request.agent(app);
    await otherAgent.post('/api/auth/login').send({ username: 'wichai', password: 'pass1234' });
    const res = await otherAgent.post('/api/plan/progress').send({ routeIndex: 1, currentStep: 1, stepState: 'in_transit' });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/routes/plan.test.ts`
Expected: FAIL — route 404s

- [ ] **Step 3: Write minimal implementation**

```typescript
// server/routes/plan.ts
import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { requireAuth, requireRole } from '../middleware';

interface ActivePlanRow {
  optimization_criterion: string;
  nodes_json: string;
  legs_json: string;
  route_summaries_json: string;
  aggregates_json: string;
}

function loadPlan(db: DatabaseSync) {
  const row = db.prepare('SELECT * FROM active_plan WHERE id = 1').get() as ActivePlanRow | undefined;
  if (!row) return null;
  return {
    optimizationCriterion: row.optimization_criterion,
    nodes: JSON.parse(row.nodes_json),
    legs: JSON.parse(row.legs_json),
    routeSummaries: JSON.parse(row.route_summaries_json),
    ...JSON.parse(row.aggregates_json),
  };
}

export function planRouter(db: DatabaseSync): Router {
  const router = Router();
  router.use(requireAuth);

  router.post('/', requireRole('planner'), (req, res) => {
    const { optimizationCriterion, data } = req.body ?? {};
    if (!data || !Array.isArray(data.routeSummaries)) {
      res.status(400).json({ error: 'Invalid plan payload' });
      return;
    }
    const { nodes, legs, routeSummaries, ...aggregates } = data;

    db.exec('BEGIN');
    try {
      db.prepare(`
        INSERT INTO active_plan (id, created_at, optimization_criterion, nodes_json, legs_json, route_summaries_json, aggregates_json)
        VALUES (1, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          created_at = excluded.created_at,
          optimization_criterion = excluded.optimization_criterion,
          nodes_json = excluded.nodes_json,
          legs_json = excluded.legs_json,
          route_summaries_json = excluded.route_summaries_json,
          aggregates_json = excluded.aggregates_json
      `).run(new Date().toISOString(), optimizationCriterion, JSON.stringify(nodes), JSON.stringify(legs), JSON.stringify(routeSummaries), JSON.stringify(aggregates));

      db.prepare('DELETE FROM plan_progress').run();
      const insertProgress = db.prepare(
        'INSERT INTO plan_progress (route_index, current_step, step_state) VALUES (?, 0, ?)'
      );
      for (const summary of routeSummaries) {
        insertProgress.run(summary.routeIndex, 'pending');
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    res.json({ ok: true });
  });

  router.get('/active', (req, res) => {
    const plan = loadPlan(db);
    if (!plan) {
      res.json({ plan: null });
      return;
    }
    if (req.user!.role === 'planner') {
      res.json({ plan });
      return;
    }

    const myRouteIndexes = plan.routeSummaries
      .filter((s: any) => s.vehicle.driverUserId === req.user!.sub)
      .map((s: any) => s.routeIndex);

    if (myRouteIndexes.length === 0) {
      res.json({ plan: null });
      return;
    }

    res.json({
      plan: {
        ...plan,
        legs: plan.legs.filter((l: any) => myRouteIndexes.includes(l.routeIndex)),
        routeSummaries: plan.routeSummaries.filter((s: any) => myRouteIndexes.includes(s.routeIndex)),
      },
    });
  });

  router.post('/progress', requireRole('driver'), (req, res) => {
    const { routeIndex, currentStep, stepState } = req.body ?? {};
    const plan = loadPlan(db);
    const owns = plan?.routeSummaries.some((s: any) => s.routeIndex === routeIndex && s.vehicle.driverUserId === req.user!.sub);
    if (!owns) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    db.prepare(`
      INSERT INTO plan_progress (route_index, current_step, step_state, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(route_index) DO UPDATE SET
        current_step = excluded.current_step,
        step_state = excluded.step_state,
        updated_at = excluded.updated_at
    `).run(routeIndex, currentStep, stepState);
    res.json({ ok: true });
  });

  router.get('/progress', requireRole('planner'), (req, res) => {
    const rows = db.prepare('SELECT route_index, current_step, step_state FROM plan_progress ORDER BY route_index').all() as any[];
    res.json(rows.map(r => ({ routeIndex: r.route_index, currentStep: r.current_step, stepState: r.step_state })));
  });

  return router;
}
```

```typescript
// server/app.ts (modify — add import and mount line)
import { planRouter } from './routes/plan';
// ...
app.use('/api/plan', planRouter(db));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/routes/plan.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add server/app.ts server/routes/plan.ts server/routes/plan.test.ts
git commit -m "feat: add active plan persistence and driver progress sync routes"
```

---

## Task 8: Server entry point, npm scripts, dev proxy

**Files:**
- Create: `server/index.ts`, `.env.example`
- Modify: `package.json` (scripts), `vite.config.ts` (dev proxy), `.gitignore` (ignore the SQLite file)

**Interfaces:**
- Consumes: `createDb` (Task 2), `createApp` (Task 4)

- [ ] **Step 1: Create the server entry point**

```typescript
// server/index.ts
import path from 'node:path';
import fs from 'node:fs';
import { createDb } from './db';
import { createApp } from './app';

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = createDb(path.join(dataDir, 'app.db'));
const app = createApp(db);
const port = Number(process.env.PORT) || 3001;

app.listen(port, () => {
  console.log(`RouteWay API listening on port ${port}`);
});
```

- [ ] **Step 2: Add the dev proxy to vite.config.ts**

```typescript
// vite.config.ts (modify — inside the returned config object, add a proxy entry to the existing server block)
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': 'http://localhost:3001',
      },
    },
```

- [ ] **Step 3: Add npm scripts**

```json
// package.json (modify — "scripts" section)
"scripts": {
  "dev": "concurrently -n client,server -c blue,green \"npm:dev:client\" \"npm:dev:server\"",
  "dev:client": "vite --port=3000 --host=0.0.0.0",
  "dev:server": "tsx watch server/index.ts",
  "build": "vite build",
  "preview": "vite preview",
  "clean": "rm -rf dist server.js",
  "lint": "tsc --noEmit",
  "test": "vitest run"
}
```

- [ ] **Step 4: Add `.env.example` and ignore the SQLite file**

```bash
# .env.example
JWT_SECRET=change-me-in-production
PORT=3001
```

```bash
# .gitignore (modify — append)
server/data/*.db
```

- [ ] **Step 5: Verify the server boots and responds**

Run: `npm run dev:server` (in the background), then in another shell: `curl -s -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin1234"}'`
Expected: JSON response with `"role":"planner"`; stop the server afterward

- [ ] **Step 6: Commit**

```bash
git add server/index.ts .env.example package.json package-lock.json vite.config.ts .gitignore
git commit -m "feat: add server entry point, dev proxy, and npm scripts to run client+server together"
```

---

## Task 9: Frontend API client

**Files:**
- Create: `src/lib/api.ts`
- Test: `src/lib/api.test.ts`

**Interfaces:**
- Consumes: `Vehicle`, `ProcessedData`, `OptimizationCriterion` from `src/types.ts`
- Produces: `AuthUser`, `DriverAccount`, `FleetConfig`, `ProgressEntry` interfaces; `login`, `logout`, `getMe`, `listDrivers`, `createDriver`, `deleteDriver`, `getFleet`, `saveFleet`, `saveActivePlan`, `getActivePlan`, `getProgress`, `postProgress` — all used by later frontend tasks

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/api.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { login, getMe, getActivePlan } from './api';

describe('api client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('login posts credentials and returns the user', async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ id: 1, username: 'admin', role: 'planner', displayName: 'Planner' }) });
    const user = await login('admin', 'admin1234');
    expect(user.role).toBe('planner');
    expect((fetch as any).mock.calls[0][0]).toBe('/api/auth/login');
  });

  it('getMe returns null on 401 instead of throwing', async () => {
    (fetch as any).mockResolvedValue({ ok: false, status: 401 });
    const user = await getMe();
    expect(user).toBeNull();
  });

  it('getActivePlan revives Date fields from JSON strings', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        plan: {
          nodes: [{ id: 0, location: 'Depot', lat: 1, lon: 1, demandVolume: 0, weight: 0, readyTime: null, dueTime: null }],
          legs: [{
            fromNode: { id: 0, location: 'Depot', lat: 1, lon: 1, demandVolume: 0, weight: 0, readyTime: null, dueTime: null },
            toNode: { id: 1, location: 'Stop', lat: 1, lon: 1, demandVolume: 1, weight: 1, readyTime: null, dueTime: null },
            distanceKm: 1, durationSec: 1, arrivalDate: '2026-07-06T01:00:00.000Z', waitingMinutes: 0, status: 'On-Time', geometry: null, routeIndex: 1,
          }],
          routeSummaries: [],
        },
      }),
    });
    const plan = await getActivePlan();
    expect(plan!.legs[0].arrivalDate).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/api.test.ts`
Expected: FAIL with "Cannot find module './api'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/api.ts
import { Vehicle, ProcessedData, OptimizationCriterion, RouteNode, RouteLeg } from '../types';

const BASE = '/api';

export interface AuthUser {
  id: number;
  username: string;
  role: 'planner' | 'driver';
  displayName: string;
}

export interface DriverAccount {
  id: number;
  username: string;
  displayName: string;
}

export interface FleetConfig {
  vehicles: Vehicle[];
  driverWage: number;
  fuelPrice4W: number;
  fuelPrice6W: number;
  fuelPrice10W: number;
}

export interface ProgressEntry {
  routeIndex: number;
  currentStep: number;
  stepState: 'pending' | 'in_transit';
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || 'Request failed');
  }
  return res.json();
}

export async function login(username: string, password: string): Promise<AuthUser> {
  return request<AuthUser>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
}

export async function logout(): Promise<void> {
  await request('/auth/logout', { method: 'POST' });
}

export async function getMe(): Promise<AuthUser | null> {
  const res = await fetch(`${BASE}/auth/me`, { credentials: 'include' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error('Failed to fetch session');
  return res.json();
}

export async function listDrivers(): Promise<DriverAccount[]> {
  return request<DriverAccount[]>('/drivers');
}

export async function createDriver(username: string, password: string, displayName: string): Promise<DriverAccount> {
  return request<DriverAccount>('/drivers', { method: 'POST', body: JSON.stringify({ username, password, displayName }) });
}

export async function deleteDriver(id: number): Promise<void> {
  await request(`/drivers/${id}`, { method: 'DELETE' });
}

export async function getFleet(): Promise<FleetConfig> {
  return request<FleetConfig>('/fleet');
}

export async function saveFleet(config: FleetConfig): Promise<void> {
  await request('/fleet', { method: 'PUT', body: JSON.stringify(config) });
}

export async function saveActivePlan(optimizationCriterion: OptimizationCriterion, data: ProcessedData): Promise<void> {
  await request('/plan', { method: 'POST', body: JSON.stringify({ optimizationCriterion, data }) });
}

function reviveNode(node: RouteNode): RouteNode {
  return {
    ...node,
    readyTime: node.readyTime ? new Date(node.readyTime as unknown as string) : null,
    dueTime: node.dueTime ? new Date(node.dueTime as unknown as string) : null,
  };
}

function reviveLeg(leg: RouteLeg): RouteLeg {
  return {
    ...leg,
    fromNode: reviveNode(leg.fromNode),
    toNode: reviveNode(leg.toNode),
    arrivalDate: leg.arrivalDate ? new Date(leg.arrivalDate as unknown as string) : null,
  };
}

export async function getActivePlan(): Promise<ProcessedData | null> {
  const { plan } = await request<{ plan: ProcessedData | null }>('/plan/active');
  if (!plan) return null;
  return {
    ...plan,
    nodes: plan.nodes.map(reviveNode),
    legs: plan.legs.map(reviveLeg),
  };
}

export async function getProgress(): Promise<ProgressEntry[]> {
  return request<ProgressEntry[]>('/plan/progress');
}

export async function postProgress(routeIndex: number, currentStep: number, stepState: 'pending' | 'in_transit'): Promise<void> {
  await request('/plan/progress', { method: 'POST', body: JSON.stringify({ routeIndex, currentStep, stepState }) });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/api.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/api.ts src/lib/api.test.ts
git commit -m "feat: add frontend API client for auth, fleet, drivers, and plan sync"
```

---

## Task 10: AuthContext, Login screen, App.tsx gating

**Files:**
- Create: `src/context/AuthContext.tsx`, `src/components/Login.tsx`
- Modify: `src/main.tsx`, `src/App.tsx:1-18` (imports and top of component)

**Interfaces:**
- Consumes: `login`, `logout`, `getMe`, `AuthUser` from `src/lib/api.ts` (Task 9)
- Produces: `AuthProvider`, `useAuth(): { user: AuthUser | null; loading: boolean; login; logout }` — consumed by Task 11-15

- [ ] **Step 1: Create AuthContext**

```typescript
// src/context/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import * as api from '../lib/api';
import type { AuthUser } from '../lib/api';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getMe().then(setUser).finally(() => setLoading(false));
  }, []);

  const login = async (username: string, password: string) => {
    const loggedInUser = await api.login(username, password);
    setUser(loggedInUser);
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 2: Create the Login screen**

```typescript
// src/components/Login.tsx
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-screen w-full flex items-center justify-center bg-neutral-canvas">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm">
        <h1 className="text-2xl font-bold text-fleet-navy mb-1">RouteWay</h1>
        <p className="text-sm text-slate-500 mb-6">เข้าสู่ระบบเพื่อดำเนินการต่อ</p>

        {error && (
          <div className="bg-red-50 text-alert-red text-sm rounded-lg px-3 py-2 mb-4">{error}</div>
        )}

        <label className="text-sm font-semibold text-slate-700 block mb-1">ชื่อผู้ใช้</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-4 py-2.5 mb-4 text-slate-800 focus:ring-2 focus:ring-fleet-navy focus:outline-none"
          required
        />

        <label className="text-sm font-semibold text-slate-700 block mb-1">รหัสผ่าน</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-4 py-2.5 mb-6 text-slate-800 focus:ring-2 focus:ring-fleet-navy focus:outline-none"
          required
        />

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-fleet-navy hover:bg-blue-800 text-white font-bold py-3 rounded-lg shadow-md transition-all disabled:opacity-50"
        >
          {isSubmitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Wrap the app in AuthProvider**

```typescript
// src/main.tsx (modify — full file)
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './context/AuthContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
```

- [ ] **Step 4: Verify types compile**

Run: `npm run lint`
Expected: No new errors — `App.tsx` is untouched by this task. `App.tsx` is gated behind auth and split into `PlannerApp`/`DriverOnlyShell` in Task 13/14, which is where `useAuth`, `Login`, and this branching logic actually get wired in; this task only builds the pieces (`AuthContext`, `Login`) those later tasks consume.

- [ ] **Step 5: Commit**

```bash
git add src/context/AuthContext.tsx src/components/Login.tsx src/main.tsx
git commit -m "feat: add AuthContext and Login screen"
```

---

## Task 11: Driver account management screen

**Files:**
- Create: `src/components/DriverManagement.tsx`
- Modify: `src/components/Sidebar.tsx:92-98` (menu items), `src/components/Sidebar.tsx:6-19` (props)

**Interfaces:**
- Consumes: `listDrivers`, `createDriver`, `deleteDriver`, `DriverAccount` from `src/lib/api.ts` (Task 9)
- Produces: `DriverManagement` component, rendered as a new tab from `PlannerApp` (wired in Task 13)

- [ ] **Step 1: Create the DriverManagement component**

```typescript
// src/components/DriverManagement.tsx
import React, { useEffect, useState } from 'react';
import { DriverAccount, listDrivers, createDriver, deleteDriver } from '../lib/api';
import { Trash2, UserPlus } from 'lucide-react';

export default function DriverManagement() {
  const [drivers, setDrivers] = useState<DriverAccount[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = () => {
    listDrivers().then(setDrivers).finally(() => setIsLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createDriver(username, password, displayName);
      setUsername('');
      setPassword('');
      setDisplayName('');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'สร้างบัญชีคนขับไม่สำเร็จ');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('ลบบัญชีคนขับนี้?')) return;
    await deleteDriver(id);
    refresh();
  };

  return (
    <div className="p-4 sm:p-8 pb-20 animate-fade-in w-full max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-fleet-navy mb-2">จัดการบัญชีคนขับ</h1>
        <p className="text-lg font-medium text-slate-600">Driver Account Management</p>
      </div>

      <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm mb-6 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <div>
          <label className="text-xs font-semibold text-slate-600 block mb-1">ชื่อผู้ใช้</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600 block mb-1">รหัสผ่าน</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600 block mb-1">ชื่อที่แสดง</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" required />
        </div>
        <button type="submit" className="flex items-center justify-center bg-fleet-navy text-white rounded px-4 py-2 text-sm font-bold hover:bg-blue-800">
          <UserPlus className="w-4 h-4 mr-2" /> เพิ่มคนขับ
        </button>
        {error && <div className="sm:col-span-4 text-alert-red text-sm">{error}</div>}
      </form>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">ชื่อผู้ใช้</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">ชื่อที่แสดง</th>
              <th className="w-16"></th>
            </tr>
          </thead>
          <tbody>
            {!isLoading && drivers.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400">ยังไม่มีบัญชีคนขับ</td></tr>
            )}
            {drivers.map(d => (
              <tr key={d.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">{d.username}</td>
                <td className="px-4 py-3">{d.displayName}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => handleDelete(d.id)} className="text-slate-400 hover:text-alert-red">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add a sidebar entry for planners**

```typescript
// src/components/Sidebar.tsx:7-19 (modify — add a prop)
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
  isMobileNavOpen: boolean;
  onCloseMobileNav: () => void;
  onLogout: () => void;
}
```

```typescript
// src/components/Sidebar.tsx:21-24 (modify — destructure the new prop)
export default function Sidebar({
  currentTab, setCurrentTab, onDataLoaded, isProcessing, hasData, hasComparison,
  avgSpeed, setAvgSpeed, setIsFleetConfigOpen, isMobileNavOpen, onCloseMobileNav, onLogout
}: SidebarProps) {
```

```typescript
// src/components/Sidebar.tsx:92-98 (modify — add a driver-management item; it's always enabled, unlike the data-dependent tabs)
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard & Savings', icon: <Truck className="w-4 h-4 mr-2" /> },
    { id: 'driver', label: 'Interactive Driver Portal', icon: <Navigation className="w-4 h-4 mr-2" /> },
    { id: 'carbon', label: 'Carbon Footprint', icon: <Leaf className="w-4 h-4 mr-2" /> },
    { id: 'statistics', label: 'Statistics car', icon: <BarChart className="w-4 h-4 mr-2" /> },
    { id: 'comparison', label: 'Algorithm Comparison', icon: <BarChart className="w-4 h-4 mr-2" /> },
    { id: 'drivers', label: 'จัดการคนขับ', icon: <Truck className="w-4 h-4 mr-2" />, alwaysEnabled: true },
  ];
```

```typescript
// src/components/Sidebar.tsx:160-176 (modify — respect alwaysEnabled, and add a logout button after the nav)
      <nav className="flex-1 px-4 flex flex-col gap-1">
        {menuItems.map(item => (
          <button
            key={item.id}
            disabled={(item as any).alwaysEnabled ? false : (item.id === 'comparison' ? !hasComparison : !hasData)}
            onClick={() => { setCurrentTab(item.id); onCloseMobileNav(); }}
            className={`flex items-center px-4 py-3 rounded-md text-sm font-medium transition-colors ${
              currentTab === item.id 
                ? 'bg-fleet-navy text-white' 
                : 'text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>
      <div className="px-4 pb-6">
        <button
          onClick={onLogout}
          className="w-full text-left px-4 py-3 rounded-md text-sm font-medium text-slate-500 hover:bg-slate-100"
        >
          ออกจากระบบ
        </button>
      </div>
```

- [ ] **Step 3: Verify manually**

Run: `npm run lint`
Expected: No new type errors from `Sidebar.tsx` or `DriverManagement.tsx` (the `onLogout` prop and `currentTab === 'drivers'` render branch are wired into `PlannerApp` in Task 13 — until then `PlannerApp`/`App` won't compile, which is expected mid-plan; see Task 10 Step 5 note)

- [ ] **Step 4: Commit**

```bash
git add src/components/DriverManagement.tsx src/components/Sidebar.tsx
git commit -m "feat: add driver account management screen and sidebar entry"
```

---

## Task 12: Fleet config table redesign with driver assignment

**Files:**
- Modify: `src/components/FleetConfigModal.tsx` (full rewrite of the row-count mechanic into a table; props change)

**Interfaces:**
- Consumes: `listDrivers`, `DriverAccount`, `getFleet`, `saveFleet`, `FleetConfig` from `src/lib/api.ts` (Task 9); `Vehicle` (with `driverUserId`) from `src/types.ts` (Task 6)
- Produces: `FleetConfigModal` now loads/saves via the API itself (no longer takes `activeFleetPool`/`onSave` with local state — it takes an `onSaved` callback so the parent can refetch)

- [ ] **Step 1: Rewrite FleetConfigModal as a table with an "add row" button and a driver dropdown**

```typescript
// src/components/FleetConfigModal.tsx (modify — full file replacement)
import React, { useState, useEffect } from 'react';
import { Vehicle } from '../types';
import { DriverAccount, getFleet, saveFleet, listDrivers } from '../lib/api';
import { Truck, Plus, Trash2, Save, X } from 'lucide-react';

interface FleetConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  '4-wheel': 'รถบรรทุก 4 ล้อใหญ่',
  '6-wheel': 'รถบรรทุก 6 ล้อ',
  '10-wheel': 'รถบรรทุก 10 ล้อ',
};
const TYPE_COLORS: Record<string, string> = {
  '4-wheel': '#10B981',
  '6-wheel': '#3B82F6',
  '10-wheel': '#F97316',
};

export default function FleetConfigModal({ isOpen, onClose, onSaved }: FleetConfigModalProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<DriverAccount[]>([]);
  const [driverWage, setDriverWage] = useState(60);
  const [fuelPrice4W, setFuelPrice4W] = useState(35);
  const [fuelPrice6W, setFuelPrice6W] = useState(35);
  const [fuelPrice10W, setFuelPrice10W] = useState(35);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    Promise.all([getFleet(), listDrivers()]).then(([fleet, driverList]) => {
      setVehicles(fleet.vehicles);
      setDriverWage(fleet.driverWage);
      setFuelPrice4W(fleet.fuelPrice4W);
      setFuelPrice6W(fleet.fuelPrice6W);
      setFuelPrice10W(fleet.fuelPrice10W);
      setDrivers(driverList);
      setIsLoading(false);
    });
  }, [isOpen]);

  if (!isOpen) return null;

  const updateVehicle = (id: string, field: keyof Vehicle, value: number | string | null) => {
    setVehicles(prev => prev.map(v => v.id === id ? { ...v, [field]: value } : v));
  };

  const addVehicle = (type: string) => {
    const count = vehicles.filter(v => v.type === type).length;
    setVehicles(prev => [...prev, {
      id: `${type}-${Date.now()}`,
      type,
      name: `${TYPE_LABELS[type]} - คันที่ ${count + 1}`,
      capacityCBM: type === '4-wheel' ? 12 : type === '6-wheel' ? 32 : 48,
      fuelConsumption: type === '4-wheel' ? 0.12 : type === '6-wheel' ? 0.2 : 0.28,
      fixedCost: type === '4-wheel' ? 300 : type === '6-wheel' ? 450 : 600,
      color: TYPE_COLORS[type],
      driverUserId: null,
    }]);
  };

  const removeVehicle = (id: string) => {
    setVehicles(prev => prev.filter(v => v.id !== id));
  };

  const handleSave = async () => {
    await saveFleet({ vehicles, driverWage, fuelPrice4W, fuelPrice6W, fuelPrice10W });
    onSaved();
    onClose();
  };

  const fuelPriceFor = (type: string) => type === '4-wheel' ? fuelPrice4W : type === '6-wheel' ? fuelPrice6W : fuelPrice10W;
  const setFuelPriceFor = (type: string) => type === '4-wheel' ? setFuelPrice4W : type === '6-wheel' ? setFuelPrice6W : setFuelPrice10W;

  const renderVehicleSection = (type: string) => {
    const rows = vehicles.filter(v => v.type === type);
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
          <div className="flex items-center">
            <Truck className="w-5 h-5 mr-2" style={{ color: TYPE_COLORS[type] }} />
            <h3 className="font-bold text-lg text-slate-800">{TYPE_LABELS[type]}</h3>
          </div>
          <div className="flex items-center">
            <span className="text-sm font-bold text-slate-700 mr-2">⛽</span>
            <input
              type="number" min="0" step="0.01"
              value={fuelPriceFor(type)}
              onChange={(e) => setFuelPriceFor(type)(Number(e.target.value))}
              className="w-16 border border-slate-300 rounded px-2 py-1 text-sm text-center font-bold"
            />
            <span className="text-xs text-slate-600 ml-1">บาท/ลิตร</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 uppercase">
                <th className="pb-2 pr-2">ชื่อรถ</th>
                <th className="pb-2 pr-2">Capacity (CBM)</th>
                <th className="pb-2 pr-2">Fuel (L/km)</th>
                <th className="pb-2 pr-2">Fixed Cost</th>
                <th className="pb-2 pr-2">Driver account</th>
                <th className="pb-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(v => (
                <tr key={v.id} className="border-t border-slate-100">
                  <td className="py-2 pr-2">
                    <input value={v.name} onChange={(e) => updateVehicle(v.id, 'name', e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1" />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" step="0.1" value={v.capacityCBM} onChange={(e) => updateVehicle(v.id, 'capacityCBM', Number(e.target.value))} className="w-20 border border-slate-300 rounded px-2 py-1" />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" step="0.01" value={v.fuelConsumption} onChange={(e) => updateVehicle(v.id, 'fuelConsumption', Number(e.target.value))} className="w-20 border border-slate-300 rounded px-2 py-1" />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" step="1" min="0" value={v.fixedCost} onChange={(e) => updateVehicle(v.id, 'fixedCost', Number(e.target.value))} className="w-24 border border-slate-300 rounded px-2 py-1" />
                  </td>
                  <td className="py-2 pr-2">
                    <select
                      value={v.driverUserId ?? ''}
                      onChange={(e) => updateVehicle(v.id, 'driverUserId', e.target.value ? Number(e.target.value) : null)}
                      className="w-full border border-slate-300 rounded px-2 py-1 bg-white"
                    >
                      <option value="">ยังไม่ระบุ</option>
                      {drivers.map(d => (
                        <option key={d.id} value={d.id}>{d.displayName}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 text-right">
                    <button onClick={() => removeVehicle(v.id)} className="text-slate-400 hover:text-alert-red">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          onClick={() => addVehicle(type)}
          className="mt-3 flex items-center text-sm font-bold text-fleet-navy hover:underline"
        >
          <Plus className="w-4 h-4 mr-1" /> เพิ่มรถ
        </button>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-50 rounded-2xl shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in">
        <div className="bg-white px-4 sm:px-6 py-4 border-b border-slate-200 flex justify-between items-center gap-2">
          <h2 className="text-lg sm:text-2xl font-bold text-fleet-navy flex items-center">
            <span className="text-xl sm:text-2xl mr-2">⚙️</span> ตั้งค่ากองรถ (Fleet Configuration)
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500 flex-shrink-0">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          {isLoading ? (
            <div className="text-center text-slate-400 py-12">กำลังโหลด...</div>
          ) : (
            <>
              <div className="mb-6 bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-2">
                <span className="font-bold text-slate-700 text-lg flex items-center mr-3">⏱️ ค่าแรงคนขับ:</span>
                <input
                  type="number" min="0"
                  value={driverWage}
                  onChange={(e) => setDriverWage(Number(e.target.value))}
                  className="w-24 border border-slate-300 rounded-md px-3 py-1.5 text-lg font-bold text-center text-fleet-navy"
                />
                <span className="font-bold text-slate-700 text-lg ml-3">บาท / ชั่วโมง</span>
              </div>

              <div className="grid grid-cols-1 gap-6">
                {renderVehicleSection('4-wheel')}
                {renderVehicleSection('6-wheel')}
                {renderVehicleSection('10-wheel')}
              </div>
            </>
          )}
        </div>

        <div className="bg-white px-4 sm:px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
          <button onClick={handleSave} disabled={isLoading} className="flex items-center justify-center px-6 py-2 bg-fleet-navy text-white hover:bg-blue-800 rounded-md font-bold text-sm transition-colors shadow-md disabled:opacity-50">
            <Save className="w-4 h-4 mr-2" /> บันทึกและใช้งานกองรถนี้
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify manually**

Run: `npm run lint`
Expected: No type errors within `FleetConfigModal.tsx` itself (its call sites in `App.tsx` are updated in Task 13, matching `onSaved` instead of `onSave`)

- [ ] **Step 3: Commit**

```bash
git add src/components/FleetConfigModal.tsx
git commit -m "feat: redesign fleet config as a per-vehicle table with driver assignment"
```

---

## Task 13: Wire PlannerApp — server-backed fleet, plan persistence, driver management tab

**Files:**
- Modify: `src/App.tsx` (rename existing component body to `PlannerApp`, fetch fleet from server, save the active plan on variant selection, add the `drivers` tab, finish the Task 10 gating)

**Interfaces:**
- Consumes: `getFleet`, `saveActivePlan` from `src/lib/api.ts` (Task 9); `DriverManagement` (Task 11); redesigned `FleetConfigModal` (Task 12); `useAuth` (Task 10)
- Produces: fully working `App.tsx` that compiles and ties every prior task together for the planner role

- [ ] **Step 1: Replace App.tsx in full**

```typescript
// src/App.tsx (modify — full file replacement)
import React, { useState, useEffect } from 'react';
import { RouteNode, ProcessedData, ComparisonResult, OptimizationCriterion, Vehicle } from './types';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import CarbonFootprint from './components/CarbonFootprint';
import DriverPortal from './components/DriverPortal';
import StatisticsCar from './components/StatisticsCar';
import AlgorithmComparison from './components/AlgorithmComparison';
import ComparisonPopup from './components/ComparisonPopup';
import DriverManagement from './components/DriverManagement';
import { processData } from './lib/geo';
import { getFleet, saveActivePlan } from './lib/api';
import { AlertCircle, Loader2, Menu } from 'lucide-react';
import FleetConfigModal from './components/FleetConfigModal';
import Login from './components/Login';
import DriverOnlyShell from './components/DriverOnlyShell';
import { useAuth } from './context/AuthContext';

export default function App() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-neutral-canvas">
        <Loader2 className="w-10 h-10 text-fleet-navy animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (user.role === 'driver') {
    return <DriverOnlyShell displayName={user.displayName} onLogout={logout} />;
  }

  return <PlannerApp onLogout={logout} />;
}

function PlannerApp({ onLogout }: { onLogout: () => void }) {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [processedData, setProcessedData] = useState<ProcessedData | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [stepState, setStepState] = useState<'pending' | 'in_transit'>('pending');
  // Configuration State
  const [activeFleetPool, setActiveFleetPool] = useState<Vehicle[]>([]);
  const [isFleetConfigOpen, setIsFleetConfigOpen] = useState(false);
  const [avgSpeed, setAvgSpeed] = useState(50);
  const [driverWaitingWage, setDriverWaitingWage] = useState(60);
  const [fuelPrice4W, setFuelPrice4W] = useState(35);
  const [fuelPrice6W, setFuelPrice6W] = useState(35);
  const [fuelPrice10W, setFuelPrice10W] = useState(35);

  const [pendingNodes, setPendingNodes] = useState<RouteNode[] | null>(null);
  const [isParamsModalOpen, setIsParamsModalOpen] = useState(false);
  const [departureTimeStr, setDepartureTimeStr] = useState("08:00");
  const [optimizationCriterion, setOptimizationCriterion] = useState<OptimizationCriterion>('cost');

  const [comparisonData, setComparisonData] = useState<ComparisonResult[] | null>(null);
  const [isComparisonModalOpen, setIsComparisonModalOpen] = useState(false);
  const [variantResults, setVariantResults] = useState<ProcessedData[]>([]);
  const [savingsBaseline, setSavingsBaseline] = useState<ProcessedData | null>(null);
  const [isComparing, setIsComparing] = useState(false);

  const loadFleetFromServer = () => {
    getFleet().then(fleet => {
      setActiveFleetPool(fleet.vehicles);
      setDriverWaitingWage(fleet.driverWage);
      setFuelPrice4W(fleet.fuelPrice4W);
      setFuelPrice6W(fleet.fuelPrice6W);
      setFuelPrice10W(fleet.fuelPrice10W);
    });
  };

  useEffect(() => {
    loadFleetFromServer();
  }, []);

  const handleDataLoaded = (nodes: RouteNode[]) => {
    setComparisonData(null);
    setSavingsBaseline(null);
    if (nodes.length < 2) {
      alert("Manifest must contain at least a Depot and one customer node.");
      return;
    }

    setPendingNodes(nodes);
    setIsParamsModalOpen(true);
  };

  const handleCompareAll = async () => {
    if (!pendingNodes) return;
    setIsParamsModalOpen(false);
    setIsComparing(true);
    setCurrentStep(0);
    setStepState('pending');

    const todayStr = new Date().toISOString().split('T')[0];
    let startDateTime = new Date(`${todayStr} 08:00`);
    if (departureTimeStr) {
      const parts = departureTimeStr.split(':');
      if (parts.length >= 2) {
        startDateTime = new Date(`${todayStr} ${parts[0]}:${parts[1]}`);
      }
    }

    const variants: { algorithm: 'savings' | 'nearest-neighbor' | 'sweep' | 'or-opt-sa' | 'solomon-i1'; applyTwoOpt: boolean }[] = [
      { algorithm: 'savings', applyTwoOpt: false },
      { algorithm: 'savings', applyTwoOpt: true },
      { algorithm: 'nearest-neighbor', applyTwoOpt: false },
      { algorithm: 'nearest-neighbor', applyTwoOpt: true },
      { algorithm: 'sweep', applyTwoOpt: false },
      { algorithm: 'sweep', applyTwoOpt: true },
      { algorithm: 'or-opt-sa', applyTwoOpt: false },
      { algorithm: 'solomon-i1', applyTwoOpt: false },
      { algorithm: 'solomon-i1', applyTwoOpt: true },
    ];

    const baseParams = {
      fleetPool: activeFleetPool,
      avgSpeed,
      startTime: startDateTime,
      driverWage: driverWaitingWage,
      fuelPrice4W,
      fuelPrice6W,
      fuelPrice10W,
    };

    const labels: Record<string, string> = {
      savings: 'Clarke-Wright',
      'nearest-neighbor': 'Nearest Neighbor',
      sweep: 'Sweep',
      'or-opt-sa': 'Or-opt + SA',
      'solomon-i1': 'Solomon I1',
    };

    const results = await Promise.allSettled(
      variants.map(v => processData(pendingNodes!, { ...baseParams, ...v }))
    );

    const comparison: ComparisonResult[] = [];
    const variantData: ProcessedData[] = [];
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') {
        const v = variants[idx];
        const d = r.value;
        comparison.push({
          algorithm: labels[v.algorithm],
          twoOpt: v.applyTwoOpt,
          milkRunDistance: d.milkRunDistance,
          milkRunCost: d.milkRunCost,
          milkRunCO2: d.milkRunCO2,
          totalTrucksUsed: d.totalTrucksUsed,
        });
        variantData.push(d);
      } else {
        console.warn(`Algorithm variant ${idx} failed:`, r.reason);
      }
    });

    let bestData: ProcessedData | null = null;
    if (variantData.length > 0) {
      const metricKey = optimizationCriterion === 'co2' ? 'milkRunCO2' : optimizationCriterion === 'distance' ? 'milkRunDistance' : 'milkRunCost';
      const bestIdx = comparison.reduce((bi, c, i) => c[metricKey] < comparison[bi][metricKey] ? i : bi, 0);
      bestData = variantData[bestIdx];
      setProcessedData(bestData);
    }
    setVariantResults(variantData);

    const savingsIdx = comparison.findIndex(c => c.algorithm === 'Clarke-Wright' && !c.twoOpt);
    setSavingsBaseline(savingsIdx >= 0 ? variantData[savingsIdx] : null);

    setComparisonData(comparison);
    setCurrentTab('dashboard');
    setIsComparisonModalOpen(true);
    setIsComparing(false);

    if (bestData) {
      saveActivePlan(optimizationCriterion, bestData);
    }
  };

  const selectVariant = (idx: number) => {
    setProcessedData(variantResults[idx]);
    saveActivePlan(optimizationCriterion, variantResults[idx]);
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen w-full bg-neutral-canvas overflow-hidden font-sans">
      {/* Mobile top bar */}
      <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white flex-shrink-0">
        <span className="text-lg font-bold text-fleet-navy">RouteWay</span>
        <button
          type="button"
          onClick={() => setIsMobileNavOpen(true)}
          aria-label="Open navigation menu"
          className="p-2 text-slate-600 hover:text-fleet-navy"
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* Sidebar Layout */}
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
        onLogout={onLogout}
      />

      {/* Main Content Area */}
      <main className="flex-1 h-full overflow-y-auto">
        {currentTab === 'drivers' ? (
          <DriverManagement />
        ) : isComparing ? (
          <div className="h-full flex flex-col items-center justify-center">
            <Loader2 className="w-12 h-12 text-fleet-navy animate-spin mb-4" />
            <h2 className="text-xl font-bold text-slate-700">Running All Algorithms...</h2>
            <p className="text-slate-500 mt-2">Running 6 variants in parallel.</p>
          </div>
        ) : !processedData ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center animate-fade-in">
            <div className="w-24 h-24 bg-slate-200 rounded-full flex items-center justify-center mb-6">
              <AlertCircle className="w-12 h-12 text-slate-400" />
            </div>
            <h1 className="text-3xl font-bold text-fleet-navy mb-4">Welcome to RouteWay Intelligence</h1>
            <p className="text-lg text-slate-600 max-w-xl mx-auto">
              Please upload your vehicle manifest (.csv) using the sidebar to begin optimization. <br/><br/>
              The system requires no hardcoded data and relies entirely on your dynamic input for accurate routing, utilization metrics, and carbon tracking.
            </p>
          </div>
        ) : (
          <>
            {currentTab === 'dashboard' && (
              <Dashboard
                data={processedData}
                savingsBaseline={savingsBaseline}
                onViewAlgorithm={comparisonData ? () => setIsComparisonModalOpen(true) : undefined}
              />
            )}
            {currentTab === 'statistics' && <StatisticsCar data={processedData} savingsBaseline={savingsBaseline} />}
            {currentTab === 'driver' && (
              <DriverPortal
                data={processedData}
                currentStep={currentStep}
                setCurrentStep={setCurrentStep}
                stepState={stepState}
                setStepState={setStepState}
              />
            )}
            {currentTab === 'carbon' && <CarbonFootprint data={processedData} savingsBaseline={savingsBaseline} comparisonData={comparisonData} />}
            {currentTab === 'comparison' && comparisonData && (
              <AlgorithmComparison
                data={comparisonData}
                optimizationCriterion={optimizationCriterion}
                onSelectVariant={(idx) => {
                  selectVariant(idx);
                  setCurrentTab('dashboard');
                }}
              />
            )}
          </>
        )}
      </main>

      {/* Algorithm Comparison Popup */}
      {isComparisonModalOpen && comparisonData && (
        <ComparisonPopup
          data={comparisonData}
          optimizationCriterion={optimizationCriterion}
          onClose={() => setIsComparisonModalOpen(false)}
          onSelectVariant={(idx) => {
            selectVariant(idx);
            setCurrentTab('dashboard');
            setIsComparisonModalOpen(false);
          }}
        />
      )}

      {/* Fleet Config Modal */}
      <FleetConfigModal
        isOpen={isFleetConfigOpen}
        onClose={() => setIsFleetConfigOpen(false)}
        onSaved={loadFleetFromServer}
      />

      {/* Params Setup Modal */}
      {isParamsModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl shadow-xl animate-slide-up">
            <div className="bg-fleet-navy text-white p-4 sm:p-6 relative">
              <h2 className="text-xl font-bold">Set Routing Parameters</h2>
              <p className="text-blue-100 text-sm mt-1">Please set your Fleet Speed and Departure Time before calculating.</p>
            </div>

            <div className="p-4 sm:p-6 space-y-6">
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-2">Average Speed (km/h)</label>
                <input
                  type="number"
                  min="1"
                  value={avgSpeed}
                  onChange={(e) => setAvgSpeed(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-lg font-bold text-slate-800 focus:ring-2 focus:ring-fleet-navy focus:outline-none"
                  placeholder="e.g. 50"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-2">Departure Time (HH:MM)</label>
                <input
                  type="time"
                  value={departureTimeStr}
                  onChange={(e) => setDepartureTimeStr(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-lg font-bold text-slate-800 focus:ring-2 focus:ring-fleet-navy focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-2">Optimize For</label>
                <div className="flex gap-2">
                  {([
                    { value: 'cost', label: 'Min Cost' },
                    { value: 'co2', label: 'Min CO2' },
                    { value: 'distance', label: 'Min Distance' },
                  ] as { value: OptimizationCriterion; label: string }[]).map(({ value, label }) => (
                    <label
                      key={value}
                      className={`flex-1 text-center cursor-pointer rounded-lg border px-3 py-2 text-sm font-bold transition-colors ${
                        optimizationCriterion === value
                          ? 'bg-fleet-navy text-white border-fleet-navy'
                          : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="optimizationCriterion"
                        value={value}
                        checked={optimizationCriterion === value}
                        onChange={() => setOptimizationCriterion(value)}
                        className="sr-only"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

            </div>

            <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsParamsModalOpen(false);
                  setPendingNodes(null);
                }}
                className="px-5 py-2.5 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCompareAll}
                disabled={!avgSpeed || avgSpeed <= 0 || !departureTimeStr}
                className="px-5 py-2.5 rounded-lg text-sm font-bold bg-signal-green text-white hover:bg-signal-green-hover transition-colors shadow-sm shadow-signal-green/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                คำนวณเส้นทาง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

Note: `DEFAULT_FLEET_POOL` is no longer imported here — the server now owns fleet defaults (seeded in Task 2). `src/lib/geo.ts`'s `DEFAULT_FLEET_POOL` export can stay (still used by `algorithms.test.ts` and `geo.ts` internals) but is no longer read by `App.tsx`.

- [ ] **Step 2: Run the full test suite and typecheck**

Run: `npm run lint && npx vitest run`
Expected: `lint` fails only on the missing `./components/DriverOnlyShell` import (created in Task 14) — that's expected; all other files typecheck. Vitest tests unrelated to `DriverOnlyShell` pass.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire PlannerApp to server-backed fleet config and plan persistence"
```

---

## Task 14: Driver-only portal restriction and progress push

**Files:**
- Create: `src/components/DriverOnlyShell.tsx`
- Modify: `src/components/DriverPortal.tsx` (support a driver-locked mode with no vehicle dropdown and server progress push)

**Interfaces:**
- Consumes: `getActivePlan`, `postProgress` from `src/lib/api.ts` (Task 9)
- Produces: `DriverOnlyShell` component (imported by `App.tsx` in Task 13), and an extended `DriverPortal` that supports both the existing planner-preview mode (unchanged) and a new driver-locked mode

- [ ] **Step 1: Extend DriverPortal to support a locked, server-synced mode**

```typescript
// src/components/DriverPortal.tsx:75-89 (modify — extend the props interface)
interface DriverPortalProps {
  data: ProcessedData;
  currentStep: number;
  setCurrentStep: (step: number) => void;
  stepState: "pending" | "in_transit";
  setStepState: (state: "pending" | "in_transit") => void;
  lockedRouteIndex?: number;
  onStepChange?: (routeIndex: number, currentStep: number, stepState: "pending" | "in_transit") => void;
}

export default function DriverPortal({
  data,
  currentStep,
  setCurrentStep,
  stepState,
  setStepState,
  lockedRouteIndex,
  onStepChange,
}: DriverPortalProps) {
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number>(
    lockedRouteIndex ?? data.routeSummaries[0]?.routeIndex ?? 1,
  );
```

```typescript
// src/components/DriverPortal.tsx:152-174 (modify — hide the vehicle dropdown when locked)
        {lockedRouteIndex === undefined && data.routeSummaries.length > 0 ? (
          <div className="flex items-center bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
            <label className="text-sm font-bold text-slate-700 mr-3 whitespace-nowrap">
              เลือกยานพาหนะ
            </label>
            <select
              value={selectedRouteIndex}
              onChange={handleRouteSelect}
              className="border border-slate-300 rounded px-3 py-2 text-sm bg-white font-medium text-fleet-navy outline-none focus:ring-2 focus:ring-fleet-navy"
            >
              {data.routeSummaries.map((r) => (
                <option key={r.routeIndex} value={r.routeIndex}>
                  {r.vehicle.name}
                </option>
              ))}
            </select>
          </div>
        ) : lockedRouteIndex === undefined ? (
          <div className="text-sm text-slate-500 italic">
            Please upload a CSV manifest first
          </div>
        ) : null}
```

```typescript
// src/components/DriverPortal.tsx:285-301 (modify — push progress to the server when locked)
                  {stepState === "pending" ? (
                    <button
                      onClick={() => {
                        setStepState("in_transit");
                        onStepChange?.(selectedRouteIndex, currentStep, "in_transit");
                      }}
                      className="w-full bg-amber-warning hover:bg-amber-warning-deep text-white font-bold py-4 px-4 rounded-lg shadow-md transition-all active:scale-[0.98] flex items-center justify-center"
                    >
                      <Navigation className="w-5 h-5 mr-2" />
                      กำลังไปส่ง
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        const nextStep = currentStep + 1;
                        handleNextStep();
                        onStepChange?.(selectedRouteIndex, nextStep, "pending");
                      }}
                      className="w-full bg-signal-green hover:bg-signal-green-hover text-white font-bold py-4 px-4 rounded-lg shadow-md transition-all active:scale-[0.98] flex items-center justify-center"
                    >
                      <PackageCheck className="w-5 h-5 mr-2" />
                      ส่งเสร็จแล้ว
                    </button>
                  )}
```

- [ ] **Step 2: Create DriverOnlyShell**

```typescript
// src/components/DriverOnlyShell.tsx
import React, { useEffect, useState } from 'react';
import { ProcessedData } from '../types';
import { getActivePlan, postProgress } from '../lib/api';
import DriverPortal from './DriverPortal';
import { Loader2 } from 'lucide-react';

export default function DriverOnlyShell({ displayName, onLogout }: { displayName: string; onLogout: () => void }) {
  const [plan, setPlan] = useState<ProcessedData | null | 'loading'>('loading');
  const [currentStep, setCurrentStep] = useState(0);
  const [stepState, setStepState] = useState<'pending' | 'in_transit'>('pending');

  useEffect(() => {
    getActivePlan().then(setPlan);
  }, []);

  if (plan === 'loading') {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-neutral-canvas">
        <Loader2 className="w-10 h-10 text-fleet-navy animate-spin" />
      </div>
    );
  }

  const routeIndex = plan?.routeSummaries[0]?.routeIndex;

  return (
    <div className="h-screen w-full flex flex-col bg-neutral-canvas">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white flex-shrink-0">
        <span className="text-lg font-bold text-fleet-navy">RouteWay — {displayName}</span>
        <button onClick={onLogout} className="text-sm font-medium text-slate-500 hover:text-fleet-navy">
          ออกจากระบบ
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {!plan || routeIndex === undefined ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center">
            <h1 className="text-2xl font-bold text-fleet-navy mb-2">ยังไม่ได้รับมอบหมายรถ</h1>
            <p className="text-slate-600">กรุณาติดต่อ planner เพื่อรับมอบหมายรถและเส้นทาง</p>
          </div>
        ) : (
          <DriverPortal
            data={plan}
            currentStep={currentStep}
            setCurrentStep={setCurrentStep}
            stepState={stepState}
            setStepState={setStepState}
            lockedRouteIndex={routeIndex}
            onStepChange={(idx, step, state) => postProgress(idx, step, state)}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run the full test suite and typecheck**

Run: `npm run lint && npx vitest run`
Expected: All pass — `App.tsx`'s `DriverOnlyShell` import now resolves

- [ ] **Step 4: Commit**

```bash
git add src/components/DriverOnlyShell.tsx src/components/DriverPortal.tsx
git commit -m "feat: restrict driver-role users to their own assigned route with progress push"
```

---

## Task 15: Live delivery status for the planner

**Files:**
- Create: `src/components/LiveDeliveryStatus.tsx`
- Modify: `src/components/Dashboard.tsx:1-28` (render the new component)

**Interfaces:**
- Consumes: `getProgress`, `ProgressEntry` from `src/lib/api.ts` (Task 9); `RouteSummary` from `src/types.ts`

- [ ] **Step 1: Create the polling status component**

```typescript
// src/components/LiveDeliveryStatus.tsx
import React, { useEffect, useState } from 'react';
import { RouteSummary } from '../types';
import { getProgress, ProgressEntry } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Truck } from 'lucide-react';

const STEP_LABELS: Record<ProgressEntry['stepState'], string> = {
  pending: 'รอเริ่มส่ง',
  in_transit: 'กำลังไปส่ง',
};

export default function LiveDeliveryStatus({ routeSummaries }: { routeSummaries: RouteSummary[] }) {
  const [progress, setProgress] = useState<ProgressEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      getProgress().then(entries => {
        if (!cancelled) setProgress(entries);
      }).catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (routeSummaries.length === 0) return null;

  return (
    <Card className="mb-8">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-500">สถานะการจัดส่งสด (Live Delivery Status)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {routeSummaries.map(summary => {
            const entry = progress.find(p => p.routeIndex === summary.routeIndex);
            return (
              <div key={summary.routeIndex} className="flex items-center justify-between border-b border-slate-100 last:border-0 py-2">
                <div className="flex items-center">
                  <Truck className="w-4 h-4 mr-2" style={{ color: summary.vehicle.color }} />
                  <span className="font-medium text-slate-700">{summary.vehicle.name}</span>
                </div>
                <span className="text-sm text-slate-500">
                  {entry ? `จุดที่ ${entry.currentStep + 1} — ${STEP_LABELS[entry.stepState]}` : 'ยังไม่มีข้อมูล'}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Render it from Dashboard**

```typescript
// src/components/Dashboard.tsx:1-4 (modify — add import)
import React from "react";
import { ProcessedData } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import RouteMap from "./RouteMap";
import LiveDeliveryStatus from "./LiveDeliveryStatus";
```

```typescript
// src/components/Dashboard.tsx:28-29 (modify — insert LiveDeliveryStatus below RouteMap)
      <RouteMap data={data} onViewAlgorithm={onViewAlgorithm} />

      <div className="mt-8">
        <LiveDeliveryStatus routeSummaries={data.routeSummaries} />
      </div>
```

- [ ] **Step 3: Run the full test suite and typecheck**

Run: `npm run lint && npx vitest run`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/components/LiveDeliveryStatus.tsx src/components/Dashboard.tsx
git commit -m "feat: show live per-vehicle delivery status polled from the server"
```

---

## Final Verification

- [ ] Run the full backend + frontend test suite: `npx vitest run`
  Expected: all tests across `server/**/*.test.ts` and `src/**/*.test.ts` pass
- [ ] Run typecheck: `npm run lint`
  Expected: no errors
- [ ] Manual smoke test: `npm run dev`, open the app, log in as `admin`/`admin1234`, create a driver account, assign a vehicle to it in Fleet Config, upload a manifest CSV and select a variant, open a second (incognito) browser window, log in as the driver, confirm only their assigned route shows, click "กำลังไปส่ง"/"ส่งเสร็จแล้ว", and confirm the planner's Dashboard "สถานะการจัดส่งสด" card updates within ~5 seconds.
