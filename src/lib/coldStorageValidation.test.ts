import { describe, it, expect } from 'vitest';
import { validateColdStorageFleet } from './coldStorageValidation';
import type { RouteNode, Vehicle } from '../types';

function makeNode(overrides: Partial<RouteNode>): RouteNode {
  return {
    id: 1, location: 'Stop', lat: 13.3, lon: 100.9, demandVolume: 5, weight: 0,
    requiresColdStorage: false, readyTime: null, dueTime: null, ...overrides,
  };
}

function makeVehicle(overrides: Partial<Vehicle>): Vehicle {
  return {
    id: 'v1', type: '4-wheel', name: 'Truck', capacityCBM: 12,
    fuelConsumption: 0.12, fixedCost: 300, color: '#10B981',
    fuelPrice: 35, departureTime: '08:00', ...overrides,
  };
}

describe('validateColdStorageFleet', () => {
  it('returns null when no node requires cold storage', () => {
    const nodes = [makeNode({ id: 0 }), makeNode({ id: 1, requiresColdStorage: false })];
    const fleet = [makeVehicle({})];
    expect(validateColdStorageFleet(nodes, fleet)).toBeNull();
  });

  it('blocks when cold nodes exist but no cold-storage vehicle in fleet', () => {
    const nodes = [makeNode({ id: 0 }), makeNode({ id: 1, requiresColdStorage: true, demandVolume: 5 })];
    const fleet = [makeVehicle({ type: '4-wheel' })];
    const result = validateColdStorageFleet(nodes, fleet);
    expect(result).not.toBeNull();
    expect(result).toContain('รถห้องเย็น');
  });

  it('blocks when cold demand exceeds total cold vehicle capacity', () => {
    const nodes = [
      makeNode({ id: 0 }),
      makeNode({ id: 1, requiresColdStorage: true, demandVolume: 12 }),
      makeNode({ id: 2, requiresColdStorage: true, demandVolume: 12 }),
    ];
    const fleet = [makeVehicle({ id: 'cold-1', type: 'cold-storage', capacityCBM: 10 })];
    const result = validateColdStorageFleet(nodes, fleet);
    expect(result).not.toBeNull();
    expect(result).toContain('24');
    expect(result).toContain('10');
  });

  it('returns null when cold vehicle capacity is sufficient', () => {
    const nodes = [
      makeNode({ id: 0 }),
      makeNode({ id: 1, requiresColdStorage: true, demandVolume: 8 }),
    ];
    const fleet = [makeVehicle({ id: 'cold-1', type: 'cold-storage', capacityCBM: 10 })];
    expect(validateColdStorageFleet(nodes, fleet)).toBeNull();
  });

  it('ignores node index 0 (depot) even if it were marked cold-required', () => {
    const nodes = [makeNode({ id: 0, requiresColdStorage: true, demandVolume: 999 })];
    const fleet = [makeVehicle({ type: '4-wheel' })];
    expect(validateColdStorageFleet(nodes, fleet)).toBeNull();
  });
});
