import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { verifyPassword, signToken, COOKIE_NAME } from '../auth';
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
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as unknown as UserRow | undefined;
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
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.sub) as unknown as UserRow | undefined;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    res.json({ id: user.id, username: user.username, role: user.role, displayName: user.display_name });
  });

  return router;
}
