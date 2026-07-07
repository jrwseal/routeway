import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';

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
}

interface SettingsRow {
  driver_wage: number;
}

export function fleetRouter(db: DatabaseSync): Router {
  const router = Router();

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
        fuelPrice: r.fuel_price,
        departureTime: r.departure_time,
      })),
      driverWage: settings.driver_wage,
    });
  });

  router.put('/', (req, res) => {
    const { vehicles, driverWage } = req.body ?? {};
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

    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM vehicles').run();
      const insert = db.prepare(
        'INSERT INTO vehicles (id, type, name, capacity_cbm, fuel_consumption, fixed_cost, color, fuel_price, departure_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const v of vehicles) {
        insert.run(v.id, v.type, v.name, v.capacityCBM, v.fuelConsumption, v.fixedCost, v.color, v.fuelPrice, v.departureTime);
      }
      db.prepare('UPDATE settings SET driver_wage = ? WHERE id = 1').run(driverWage ?? 60);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    res.json({ ok: true });
  });

  return router;
}
