import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createDb } from './db';

const sqlite = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

describe('createDb', () => {
  it('seeds default settings', () => {
    const db = createDb(':memory:');
    const row = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any;
    expect(row.driver_wage).toBe(60);
    expect(row.fuel_price_4w).toBe(35);
  });

  it('seeds 9 default vehicles', () => {
    const db = createDb(':memory:');
    const row = db.prepare('SELECT COUNT(*) as count FROM vehicles').get() as any;
    expect(row.count).toBe(9);
  });

  it('does not reseed on a second call against the same file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'routeway-db-test-'));
    const dbPath = join(dir, 'test.db');
    try {
      const db1 = createDb(dbPath);
      db1.close();
      const db2 = createDb(dbPath);
      const count = (db2.prepare('SELECT COUNT(*) as count FROM vehicles').get() as any).count;
      expect(count).toBe(9);
      db2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('backfills fuel_price for a vehicles table that predates the column', () => {
    const dir = mkdtempSync(join(tmpdir(), 'routeway-db-migration-test-'));
    const dbPath = join(dir, 'test.db');
    try {
      const oldDb = new sqlite.DatabaseSync(dbPath);
      oldDb.exec(`
        CREATE TABLE vehicles (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          name TEXT NOT NULL,
          capacity_cbm REAL NOT NULL,
          fuel_consumption REAL NOT NULL,
          fixed_cost REAL NOT NULL,
          color TEXT NOT NULL,
          driver_user_id INTEGER
        );
        CREATE TABLE settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          driver_wage REAL NOT NULL DEFAULT 60,
          fuel_price_4w REAL NOT NULL DEFAULT 35,
          fuel_price_6w REAL NOT NULL DEFAULT 35,
          fuel_price_10w REAL NOT NULL DEFAULT 35
        );
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('planner','driver')),
          display_name TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO settings (id, driver_wage, fuel_price_4w, fuel_price_6w, fuel_price_10w) VALUES (1, 60, 31, 42, 53);
        INSERT INTO vehicles (id, type, name, capacity_cbm, fuel_consumption, fixed_cost, color) VALUES
          ('4w-1', '4-wheel', 'Old 4W', 12, 0.12, 300, '#10B981'),
          ('6w-1', '6-wheel', 'Old 6W', 32, 0.2, 450, '#3B82F6'),
          ('10w-1', '10-wheel', 'Old 10W', 48, 0.28, 600, '#F97316');
      `);
      oldDb.close();

      const migratedDb = createDb(dbPath);
      const rows = migratedDb.prepare('SELECT id, type, fuel_price as fuelPrice FROM vehicles ORDER BY id').all() as any[];
      expect(rows).toEqual([
        { id: '10w-1', type: '10-wheel', fuelPrice: 53 },
        { id: '4w-1', type: '4-wheel', fuelPrice: 31 },
        { id: '6w-1', type: '6-wheel', fuelPrice: 42 },
      ]);
      migratedDb.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
