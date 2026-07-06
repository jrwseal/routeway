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
    const rows = db.prepare('SELECT * FROM vehicles ORDER BY type, id').all() as unknown as VehicleRow[];
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as unknown as SettingsRow;
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
