import { describe, it, expect } from 'vitest';
import { VEHICLE_TYPE_DEFS, getAvailableVehicleTypes, canDisableColdStorage } from './fleetTypes';

describe('VEHICLE_TYPE_DEFS', () => {
  it('includes the cold-storage definition with spec defaults', () => {
    const coldStorage = VEHICLE_TYPE_DEFS.find(d => d.type === 'cold-storage');
    expect(coldStorage).toEqual({
      type: 'cold-storage',
      label: 'รถห้องเย็น',
      color: '#06B6D4',
      defaultCapacityCBM: 10,
      defaultFuelConsumption: 0.18,
      defaultFixedCost: 500,
    });
  });

  it('lists the 3 original types plus cold-storage, in order', () => {
    expect(VEHICLE_TYPE_DEFS.map(d => d.type)).toEqual(['4-wheel', '6-wheel', '10-wheel', 'cold-storage']);
  });
});

describe('getAvailableVehicleTypes', () => {
  it('excludes cold-storage when disabled', () => {
    const types = getAvailableVehicleTypes(false).map(d => d.type);
    expect(types).toEqual(['4-wheel', '6-wheel', '10-wheel']);
  });

  it('includes cold-storage when enabled', () => {
    const types = getAvailableVehicleTypes(true).map(d => d.type);
    expect(types).toEqual(['4-wheel', '6-wheel', '10-wheel', 'cold-storage']);
  });
});

describe('canDisableColdStorage', () => {
  it('returns true when no vehicle is cold-storage', () => {
    expect(canDisableColdStorage([{ type: '4-wheel' }, { type: '6-wheel' }])).toBe(true);
  });

  it('returns false when a cold-storage vehicle is present', () => {
    expect(canDisableColdStorage([{ type: '4-wheel' }, { type: 'cold-storage' }])).toBe(false);
  });

  it('returns true for an empty fleet', () => {
    expect(canDisableColdStorage([])).toBe(true);
  });
});
