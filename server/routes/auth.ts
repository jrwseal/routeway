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
    // res.clearCookie warns if `maxAge` is present in the options (Express
    // deprecation), so strip it — the other cookie attributes still need to
    // match what was set at login for the browser to actually clear it.
    const { maxAge, ...clearOptions } = cookieOptions();
    res.clearCookie(SESSION_COOKIE_NAME, clearOptions);
    res.json({ ok: true });
  });

  router.get('/me', requireAuth(db), (req, res) => {
    res.json(req.user);
  });

  return router;
}
