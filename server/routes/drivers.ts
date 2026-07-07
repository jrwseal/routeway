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

    const planRow = db.prepare('SELECT route_summaries_json FROM active_plan WHERE id = 1').get() as { route_summaries_json: string } | undefined;
    if (planRow) {
      const routeSummaries = JSON.parse(planRow.route_summaries_json).map((s: any) =>
        s.vehicle.driverUserId === id ? { ...s, vehicle: { ...s.vehicle, driverUserId: null } } : s
      );
      db.prepare('UPDATE active_plan SET route_summaries_json = ? WHERE id = 1').run(JSON.stringify(routeSummaries));
    }

    res.json({ ok: true });
  });

  return router;
}
