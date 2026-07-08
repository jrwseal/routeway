import { Router } from 'express';
import type { Client } from '@libsql/client';

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
  enable_cold_storage: number;
}

export function fleetRouter(db: Client): Router {
  const router = Router();

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
        sql: 'INSERT INTO vehicles (id, type, name, capacity_cbm, fuel_consumption, fixed_cost, color, fuel_price, departure_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: [v.id, v.type, v.name, v.capacityCBM, v.fuelConsumption, v.fixedCost, v.color, v.fuelPrice, v.departureTime],
      })),
      { sql: 'UPDATE settings SET driver_wage = ?, enable_cold_storage = ? WHERE id = 1', args: [driverWage ?? 60, enableColdStorage ? 1 : 0] },
    ], 'write');

    res.json({ ok: true });
  });

  return router;
}
