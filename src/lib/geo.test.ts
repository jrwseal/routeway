import { describe, it, expect } from 'vitest';
import { parseVehicleTime, selectVehicleForRoute } from './geo';
import type { Vehicle } from '../types';

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

function makeVehicle(overrides: Partial<Vehicle>): Vehicle {
  return {
    id: 'v1', type: '4-wheel', name: 'Truck', capacityCBM: 12,
    fuelConsumption: 0.12, fixedCost: 300, color: '#10B981',
    fuelPrice: 35, departureTime: '08:00', ...overrides,
  };
}

describe('selectVehicleForRoute', () => {
  it('picks an eligible vehicle from availableFleet that fits the volume', () => {
    const cold = makeVehicle({ id: 'cold-1', type: 'cold-storage', capacityCBM: 10 });
    const regular = makeVehicle({ id: '4w-1', type: '4-wheel', capacityCBM: 12 });
    const result = selectVehicleForRoute(8, [regular, cold], [cold]);
    expect(result.id).toBe('cold-1');
  });

  it('never returns a vehicle outside eligibleFleetPool, even if availableFleet has a better fit', () => {
    const cold = makeVehicle({ id: 'cold-1', type: 'cold-storage', capacityCBM: 10 });
    const regular = makeVehicle({ id: '10w-1', type: '10-wheel', capacityCBM: 48 });
    const result = selectVehicleForRoute(20, [regular, cold], [cold]);
    expect(result.id).toBe('cold-1');
  });

  it('falls back to a fitting vehicle in eligibleFleetPool when availableFleet has none eligible', () => {
    const smallerCold = makeVehicle({ id: 'cold-1', type: 'cold-storage', capacityCBM: 10 });
    const biggerCold = makeVehicle({ id: 'cold-2', type: 'cold-storage', capacityCBM: 15 });
    const result = selectVehicleForRoute(8, [], [smallerCold, biggerCold]);
    expect(result.id).toBe('cold-1');
  });

  it('falls back to the smallest vehicle in eligibleFleetPool when none of them fit the volume', () => {
    const smallerCold = makeVehicle({ id: 'cold-1', type: 'cold-storage', capacityCBM: 10 });
    const biggerCold = makeVehicle({ id: 'cold-2', type: 'cold-storage', capacityCBM: 15 });
    const result = selectVehicleForRoute(20, [], [smallerCold, biggerCold]);
    expect(result.id).toBe('cold-1');
  });

  it('returns a vehicle whose id is findable in availableFleet for the caller to remove it', () => {
    const cold = makeVehicle({ id: 'cold-1', type: 'cold-storage', capacityCBM: 10 });
    const availableFleet = [cold];
    const result = selectVehicleForRoute(5, availableFleet, [cold]);
    expect(availableFleet.findIndex((v) => v.id === result.id)).toBe(0);
  });
});
