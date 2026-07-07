import { describe, it, expect } from 'vitest';
import { parseVehicleTime } from './geo';

describe('parseVehicleTime', () => {
  it('parses a valid HH:MM string', () => {
    const t = parseVehicleTime('09:30', '2026-07-08');
    expect(t.getHours()).toBe(9);
    expect(t.getMinutes()).toBe(30);
  });

  it('falls back to 08:00 for an empty string', () => {
    const t = parseVehicleTime('', '2026-07-08');
    expect(t.getHours()).toBe(8);
    expect(t.getMinutes()).toBe(0);
  });

  it('pads single-digit hours and minutes', () => {
    const t = parseVehicleTime('9:5', '2026-07-08');
    expect(t.getHours()).toBe(9);
    expect(t.getMinutes()).toBe(5);
  });
});
