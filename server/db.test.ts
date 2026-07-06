import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDb } from './db';
import { verifyPassword } from './auth';

describe('createDb', () => {
  it('seeds a default planner account on first run', () => {
    const db = createDb(':memory:');
    const row = db.prepare('SELECT * FROM users WHERE username = ?').get('admin') as any;
    expect(row.role).toBe('planner');
    expect(verifyPassword('admin1234', row.password_hash)).toBe(true);
  });

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
      const count = (db2.prepare('SELECT COUNT(*) as count FROM users').get() as any).count;
      expect(count).toBe(1);
      db2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
