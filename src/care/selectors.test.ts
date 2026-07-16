import { describe, it, expect } from 'vitest';
import { getParcelExposureRows, getExposureSummary } from './selectors';
import type { ProcessedData, RouteNode, RouteLeg, Parcel } from '../types';

const depot: RouteNode = {
  id: 0, location: 'Depot', lat: 13.7, lon: 100.5,
  demandVolume: 0, weight: 0, requiresColdStorage: false, readyTime: null, dueTime: null,
};

const makeParcel = (overrides: Partial<Parcel>): Parcel => ({
  id: 'PCL-1', name: 'Test Parcel', tier: 'standard', maxExposureMinutes: 60,
  requiredTemp: { min: 2, max: 8 }, ...overrides,
});

function makeData(node: RouteNode, arrivalOffsetMinutes: number, durationMinutes: number): ProcessedData {
  const start = new Date('2024-01-01T08:00:00');
  const leg: RouteLeg = {
    fromNode: depot,
    toNode: node,
    distanceKm: 10,
    durationSec: durationMinutes * 60,
    arrivalDate: new Date(start.getTime() + arrivalOffsetMinutes * 60000),
    waitingMinutes: 0,
    status: 'On-Time',
    geometry: null,
    routeIndex: 0,
  };
  return {
    nodes: [depot, node],
    legs: [leg],
    traditionalDistance: 0, milkRunDistance: 0, traditionalCost: 0, milkRunCost: 0,
    savingsPercentage: 0, totalVolume: 0, totalWeight: 0, palletCount: 0, spaceUtilization: 0,
    traditionalCO2: 0, milkRunCO2: 0, fuelSavedLiters: 0, co2ReductionPercent: 0,
    totalWaitingHours: 0, totalTrucksUsed: 1,
    routeSummaries: [{ routeIndex: 0, totalVolume: 0, volumeUtilization: 0, distanceKm: 10, vehicle: {
      id: 'v1', type: '4-wheel', name: 'Truck', capacityCBM: 20, fuelConsumption: 0.12,
      fixedCost: 0, color: '#000', fuelPrice: 35, departureTime: '08:00',
    } }],
    departureTime: start,
  };
}

describe('getParcelExposureRows', () => {
  it('computes elapsed minutes as arrival minus depot departure (arrival - travel time)', () => {
    const node: RouteNode = { ...depot, id: 1, location: 'Stop', parcels: [makeParcel({ maxExposureMinutes: 60 })] };
    // depot departs at t=0, travel takes 20min, arrives at t=20 -> elapsed should be 20
    const data = makeData(node, 20, 20);
    const rows = getParcelExposureRows(data);
    expect(rows).toHaveLength(1);
    expect(rows[0].elapsedMinutes).toBeCloseTo(20);
    expect(rows[0].status).toBe('safe');
  });

  it('flags expired when elapsed exceeds maxExposureMinutes', () => {
    const node: RouteNode = { ...depot, id: 1, location: 'Stop', parcels: [makeParcel({ maxExposureMinutes: 10 })] };
    const data = makeData(node, 30, 20);
    const rows = getParcelExposureRows(data);
    expect(rows[0].status).toBe('expired');
  });

  it('skips nodes without parcels', () => {
    const node: RouteNode = { ...depot, id: 1, location: 'Stop' };
    const data = makeData(node, 20, 20);
    expect(getParcelExposureRows(data)).toHaveLength(0);
  });
});

describe('getExposureSummary', () => {
  it('returns 100% on-time and 0 at-risk for an empty plan', () => {
    expect(getExposureSummary([])).toEqual({ onTimePercent: 100, atRiskCount: 0 });
  });

  it('counts warning and expired rows as at-risk', () => {
    const rows = [
      { parcel: makeParcel({}), node: depot, routeIndex: 0, elapsedMinutes: 10, status: 'safe' as const },
      { parcel: makeParcel({}), node: depot, routeIndex: 0, elapsedMinutes: 50, status: 'warning' as const },
      { parcel: makeParcel({}), node: depot, routeIndex: 0, elapsedMinutes: 90, status: 'expired' as const },
    ];
    const summary = getExposureSummary(rows);
    expect(summary.atRiskCount).toBe(2);
    expect(summary.onTimePercent).toBeCloseTo((2 / 3) * 100);
  });
});
