import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { createDb } from './db';

// libsql's native binding can hold the db file handle briefly after close()
// on Windows; retry the delete and tolerate a leftover temp dir rather than
// failing tests whose assertions already passed.
function cleanupDir(dir: string) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    // leftover temp dir on Windows — harmless
  }
}

describe('createDb', () => {
  it('seeds default settings', async () => {
    const db = await createDb(':memory:');
    const row = (await db.execute('SELECT * FROM settings WHERE id = 1')).rows[0];
    expect(row.driver_wage).toBe(60);
    expect(row.fuel_price_4w).toBe(35);
  });

  it('seeds 9 default vehicles', async () => {
    const db = await createDb(':memory:');
    const row = (await db.execute('SELECT COUNT(*) as count FROM vehicles')).rows[0];
    expect(row.count).toBe(9);
  });

  it('does not reseed on a second call against the same file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'routeway-db-test-'));
    const dbPath = join(dir, 'test.db');
    try {
      const db1 = await createDb(`file:${dbPath}`);
      db1.close();
      const db2 = await createDb(`file:${dbPath}`);
      const count = (await db2.execute('SELECT COUNT(*) as count FROM vehicles')).rows[0].count as number;
      expect(count).toBe(9);
      db2.close();
    } finally {
      cleanupDir(dir);
    }
  });

  it('backfills fuel_price for a vehicles table that predates the column', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'routeway-db-migration-test-'));
    const dbPath = join(dir, 'test.db');
    try {
      const oldDb = createClient({ url: `file:${dbPath}` });
      await oldDb.executeMultiple(`
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

      const migratedDb = await createDb(`file:${dbPath}`);
      const result = await migratedDb.execute('SELECT id, type, fuel_price as fuelPrice FROM vehicles ORDER BY id');
      const rows = result.rows.map(r => ({ id: r.id, type: r.type, fuelPrice: r.fuelPrice }));
      expect(rows).toEqual([
        { id: '10w-1', type: '10-wheel', fuelPrice: 53 },
        { id: '4w-1', type: '4-wheel', fuelPrice: 31 },
        { id: '6w-1', type: '6-wheel', fuelPrice: 42 },
      ]);
      migratedDb.close();
    } finally {
      cleanupDir(dir);
    }
  });

  it('backfills departure_time for a vehicles table that predates the column', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'routeway-db-migration-test-'));
    const dbPath = join(dir, 'test.db');
    try {
      const oldDb = createClient({ url: `file:${dbPath}` });
      await oldDb.executeMultiple(`
        CREATE TABLE vehicles (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          name TEXT NOT NULL,
          capacity_cbm REAL NOT NULL,
          fuel_consumption REAL NOT NULL,
          fixed_cost REAL NOT NULL,
          color TEXT NOT NULL,
          fuel_price REAL NOT NULL DEFAULT 35
        );
        CREATE TABLE settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          driver_wage REAL NOT NULL DEFAULT 60,
          fuel_price_4w REAL NOT NULL DEFAULT 35,
          fuel_price_6w REAL NOT NULL DEFAULT 35,
          fuel_price_10w REAL NOT NULL DEFAULT 35
        );
        INSERT INTO settings (id, driver_wage, fuel_price_4w, fuel_price_6w, fuel_price_10w) VALUES (1, 60, 35, 35, 35);
        INSERT INTO vehicles (id, type, name, capacity_cbm, fuel_consumption, fixed_cost, color, fuel_price) VALUES
          ('4w-1', '4-wheel', 'Old 4W', 12, 0.12, 300, '#10B981', 35);
      `);
      oldDb.close();

      const migratedDb = await createDb(`file:${dbPath}`);
      const result = await migratedDb.execute({ sql: 'SELECT departure_time as departureTime FROM vehicles WHERE id = ?', args: ['4w-1'] });
      expect(result.rows[0].departureTime).toBe('08:00');
      migratedDb.close();
    } finally {
      cleanupDir(dir);
    }
  });

  it('seeds enable_cold_storage as 0 by default', async () => {
    const db = await createDb(':memory:');
    const row = (await db.execute('SELECT * FROM settings WHERE id = 1')).rows[0];
    expect(row.enable_cold_storage).toBe(0);
  });

  it('backfills enable_cold_storage for a settings table that predates the column', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'routeway-db-migration-test-'));
    const dbPath = join(dir, 'test.db');
    try {
      const oldDb = createClient({ url: `file:${dbPath}` });
      await oldDb.executeMultiple(`
        CREATE TABLE vehicles (
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
        CREATE TABLE settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          driver_wage REAL NOT NULL DEFAULT 60,
          fuel_price_4w REAL NOT NULL DEFAULT 35,
          fuel_price_6w REAL NOT NULL DEFAULT 35,
          fuel_price_10w REAL NOT NULL DEFAULT 35
        );
        INSERT INTO settings (id, driver_wage) VALUES (1, 60);
        INSERT INTO vehicles (id, type, name, capacity_cbm, fuel_consumption, fixed_cost, color) VALUES
          ('4w-1', '4-wheel', 'Old 4W', 12, 0.12, 300, '#10B981');
      `);
      oldDb.close();

      const migratedDb = await createDb(`file:${dbPath}`);
      const row = (await migratedDb.execute('SELECT * FROM settings WHERE id = 1')).rows[0];
      expect(row.enable_cold_storage).toBe(0);
      migratedDb.close();
    } finally {
      cleanupDir(dir);
    }
  });
});
