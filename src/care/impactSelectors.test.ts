import { describe, it, expect } from 'vitest';
import { joinDeliveryOutcomes, getActualOnTimePercent, getDailyOnTimeTrend, getWasteReductionPercent } from './impactSelectors';
import type { ProcessedData, RouteNode, RouteLeg, Parcel } from '../types';
import type { DeliveryLogEntry } from './deliveryLog';

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

describe('joinDeliveryOutcomes', () => {
  it('adds real-world delay on top of the planned elapsed exposure', () => {
    const node: RouteNode = { ...depot, id: 1, location: 'Stop', parcels: [makeParcel({ id: 'PCL-1', maxExposureMinutes: 60 })] };
    const data = makeData(node, 20, 20); // planned elapsed = 20min
    const log: DeliveryLogEntry[] = [{
      parcelId: 'PCL-1',
      plannedTime: new Date('2024-01-01T08:20:00').toISOString(),
      actualTime: new Date('2024-01-01T08:35:00').toISOString(), // 15min late
      actualCoordinates: { lat: 13.7, lon: 100.5 },
      distanceAtConfirm: 10,
    }];
    const outcomes = joinDeliveryOutcomes(data, log);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].actualElapsedMinutes).toBeCloseTo(35);
    expect(outcomes[0].onTime).toBe(true);
  });

  it('flags a parcel late when actual elapsed exceeds maxExposureMinutes', () => {
    const node: RouteNode = { ...depot, id: 1, location: 'Stop', parcels: [makeParcel({ id: 'PCL-1', maxExposureMinutes: 30 })] };
    const data = makeData(node, 20, 20);
    const log: DeliveryLogEntry[] = [{
      parcelId: 'PCL-1',
      plannedTime: new Date('2024-01-01T08:20:00').toISOString(),
      actualTime: new Date('2024-01-01T08:35:00').toISOString(),
      actualCoordinates: { lat: 13.7, lon: 100.5 },
      distanceAtConfirm: 10,
    }];
    expect(joinDeliveryOutcomes(data, log)[0].onTime).toBe(false);
  });

  it('ignores log entries with no matching planned parcel', () => {
    const node: RouteNode = { ...depot, id: 1, location: 'Stop', parcels: [makeParcel({ id: 'PCL-1' })] };
    const data = makeData(node, 20, 20);
    const log: DeliveryLogEntry[] = [{
      parcelId: 'PCL-UNKNOWN',
      plannedTime: null,
      actualTime: new Date().toISOString(),
      actualCoordinates: { lat: 13.7, lon: 100.5 },
      distanceAtConfirm: 10,
    }];
    expect(joinDeliveryOutcomes(data, log)).toHaveLength(0);
  });
});

describe('getActualOnTimePercent', () => {
  it('returns 100 for an empty list', () => {
    expect(getActualOnTimePercent([])).toBe(100);
  });
});

describe('getDailyOnTimeTrend', () => {
  it('groups outcomes by date and computes per-day on-time percent', () => {
    const outcomes = [
      { parcelId: 'a', parcelName: 'A', tier: 'standard' as const, maxExposureMinutes: 60, actualElapsedMinutes: 10, onTime: true, date: '2024-01-01' },
      { parcelId: 'b', parcelName: 'B', tier: 'standard' as const, maxExposureMinutes: 60, actualElapsedMinutes: 90, onTime: false, date: '2024-01-01' },
      { parcelId: 'c', parcelName: 'C', tier: 'standard' as const, maxExposureMinutes: 60, actualElapsedMinutes: 10, onTime: true, date: '2024-01-02' },
    ];
    const trend = getDailyOnTimeTrend(outcomes);
    expect(trend).toEqual([
      { date: '2024-01-01', onTimePercent: 50, count: 2 },
      { date: '2024-01-02', onTimePercent: 100, count: 1 },
    ]);
  });
});

describe('getWasteReductionPercent', () => {
  it('computes % fewer expired parcels vs baseline', () => {
    const node: RouteNode = { ...depot, id: 1, location: 'Stop', parcels: [makeParcel({ maxExposureMinutes: 10 })] };
    const optimized = makeData(node, 5, 5); // elapsed 5 < 10 -> safe
    const baseline = makeData(node, 30, 30); // elapsed 30 > 10 -> expired
    expect(getWasteReductionPercent(optimized, baseline)).toBe(100);
  });

  it('returns 0 when baseline has no expired parcels', () => {
    const node: RouteNode = { ...depot, id: 1, location: 'Stop', parcels: [makeParcel({ maxExposureMinutes: 999 })] };
    const optimized = makeData(node, 5, 5);
    const baseline = makeData(node, 5, 5);
    expect(getWasteReductionPercent(optimized, baseline)).toBe(0);
  });
});
