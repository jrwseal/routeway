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
