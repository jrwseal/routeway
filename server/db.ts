import { createRequire } from 'node:module';
import { hashPassword } from './auth';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

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

export function createDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('planner','driver')),
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      capacity_cbm REAL NOT NULL,
      fuel_consumption REAL NOT NULL,
      fixed_cost REAL NOT NULL,
      color TEXT NOT NULL,
      driver_user_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      driver_wage REAL NOT NULL DEFAULT 60,
      fuel_price_4w REAL NOT NULL DEFAULT 35,
      fuel_price_6w REAL NOT NULL DEFAULT 35,
      fuel_price_10w REAL NOT NULL DEFAULT 35
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

  const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
  if (userCount === 0) {
    db.prepare(
      'INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)'
    ).run('admin', hashPassword('admin1234'), 'planner', 'Planner');
  }

  const settingsCount = (db.prepare('SELECT COUNT(*) as count FROM settings').get() as { count: number }).count;
  if (settingsCount === 0) {
    db.prepare('INSERT INTO settings (id) VALUES (1)').run();
  }

  const vehicleCount = (db.prepare('SELECT COUNT(*) as count FROM vehicles').get() as { count: number }).count;
  if (vehicleCount === 0) {
    const insert = db.prepare(
      'INSERT INTO vehicles (id, type, name, capacity_cbm, fuel_consumption, fixed_cost, color) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    for (const v of DEFAULT_VEHICLES) {
      insert.run(v.id, v.type, v.name, v.capacityCBM, v.fuelConsumption, v.fixedCost, v.color);
    }
  }

  return db;
}
