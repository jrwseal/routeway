import { createClient, type Client } from '@libsql/client';

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

export async function createDb(url: string, authToken?: string): Promise<Client> {
  const db = authToken ? createClient({ url, authToken }) : createClient({ url });

  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      capacity_cbm REAL NOT NULL,
      fuel_consumption REAL NOT NULL,
      fixed_cost REAL NOT NULL,
      color TEXT NOT NULL,
      fuel_price REAL NOT NULL DEFAULT 35,
      departure_time TEXT NOT NULL DEFAULT '08:00'
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      driver_wage REAL NOT NULL DEFAULT 60,
      fuel_price_4w REAL NOT NULL DEFAULT 35,
      fuel_price_6w REAL NOT NULL DEFAULT 35,
      fuel_price_10w REAL NOT NULL DEFAULT 35,
      enable_cold_storage INTEGER NOT NULL DEFAULT 0
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

  const settingsCount = (await db.execute('SELECT COUNT(*) as count FROM settings')).rows[0].count as number;
  if (settingsCount === 0) {
    await db.execute('INSERT OR IGNORE INTO settings (id) VALUES (1)');
  }

  const vehicleColumns = (await db.execute('PRAGMA table_info(vehicles)')).rows as unknown as { name: string }[];
  const hasFuelPriceColumn = vehicleColumns.some((c) => c.name === 'fuel_price');
  if (!hasFuelPriceColumn) {
    await db.execute('ALTER TABLE vehicles ADD COLUMN fuel_price REAL NOT NULL DEFAULT 35');
    const settingsRow = (await db.execute('SELECT * FROM settings WHERE id = 1')).rows[0] as unknown as {
      fuel_price_4w: number;
      fuel_price_6w: number;
      fuel_price_10w: number;
    };
    const priceForType = (type: string) =>
      type === '4-wheel' ? settingsRow.fuel_price_4w :
      type === '6-wheel' ? settingsRow.fuel_price_6w :
      settingsRow.fuel_price_10w;
    const existingVehicles = (await db.execute('SELECT id, type FROM vehicles')).rows as unknown as { id: string; type: string }[];
    if (existingVehicles.length > 0) {
      await db.batch(
        existingVehicles.map((v) => ({
          sql: 'UPDATE vehicles SET fuel_price = ? WHERE id = ?',
          args: [priceForType(v.type), v.id],
        })),
        'write'
      );
    }
  }

  const hasDepartureTimeColumn = vehicleColumns.some((c) => c.name === 'departure_time');
  if (!hasDepartureTimeColumn) {
    await db.execute("ALTER TABLE vehicles ADD COLUMN departure_time TEXT NOT NULL DEFAULT '08:00'");
  }

  const settingsColumns = (await db.execute('PRAGMA table_info(settings)')).rows as unknown as { name: string }[];
  const hasEnableColdStorageColumn = settingsColumns.some((c) => c.name === 'enable_cold_storage');
  if (!hasEnableColdStorageColumn) {
    await db.execute('ALTER TABLE settings ADD COLUMN enable_cold_storage INTEGER NOT NULL DEFAULT 0');
  }

  const vehicleCount = (await db.execute('SELECT COUNT(*) as count FROM vehicles')).rows[0].count as number;
  if (vehicleCount === 0) {
    await db.batch(
      DEFAULT_VEHICLES.map((v) => ({
        sql: 'INSERT OR IGNORE INTO vehicles (id, type, name, capacity_cbm, fuel_consumption, fixed_cost, color) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [v.id, v.type, v.name, v.capacityCBM, v.fuelConsumption, v.fixedCost, v.color],
      })),
      'write'
    );
  }

  return db;
}
