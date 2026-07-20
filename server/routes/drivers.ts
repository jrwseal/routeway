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
