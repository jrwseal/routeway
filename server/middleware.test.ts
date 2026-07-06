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
