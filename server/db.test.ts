import { describe, it, expect } from 'vitest';
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

  it('does not reseed on a second call with an existing file', () => {
    const db1 = createDb(':memory:');
    db1.prepare('INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)')
      .run('extra', 'hash', 'driver', 'Extra');
    const count1 = (db1.prepare('SELECT COUNT(*) as count FROM users').get() as any).count;
    expect(count1).toBe(2);
  });
});
