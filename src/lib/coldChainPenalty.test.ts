import { describe, it, expect } from 'vitest';
import { computeExposurePenalty } from './coldChainPenalty';
import type { RouteNode, ProcessingParams, Parcel } from '../types';

const depot: RouteNode = {
  id: 0, location: 'Depot', lat: 13.7, lon: 100.5,
  demandVolume: 0, weight: 0, requiresColdStorage: false, readyTime: null, dueTime: null,
};

const makeParcel = (overrides: Partial<Parcel>): Parcel => ({
  id: 'PCL-1', name: 'Test Parcel', tier: 'standard', maxExposureMinutes: 60,
  requiredTemp: { min: 2, max: 8 }, ...overrides,
});

const makeNode = (id: number, lat: number, lon: number, parcels?: Parcel[]): RouteNode => ({
  id, location: `Node${id}`, lat, lon,
  demandVolume: 1, weight: 0, requiresColdStorage: false, readyTime: null, dueTime: null,
  parcels,
});

const baseParams: ProcessingParams = {
  fleetPool: [],
  avgSpeed: 50,
  startTime: new Date('2024-01-01T08:00:00'),
  driverWage: 60,
  algorithm: 'or-opt-sa',
  applyTwoOpt: false,
};

describe('computeExposurePenalty', () => {
  it('is zero when nodes carry no parcels', () => {
    const nodes = [depot, makeNode(1, 13.8, 100.5)];
    expect(computeExposurePenalty([[1]], nodes, baseParams)).toBe(0);
  });

  it('is zero when arrival is within maxExposureMinutes', () => {
    // ~50km at 50km/h = 60min travel, parcel allows 120min
    const nodes = [depot, makeNode(1, 14.15, 100.5, [makeParcel({ maxExposureMinutes: 120 })])];
    expect(computeExposurePenalty([[1]], nodes, baseParams)).toBe(0);
  });

  it('is positive when arrival exceeds maxExposureMinutes', () => {
    const nodes = [depot, makeNode(1, 14.15, 100.5, [makeParcel({ maxExposureMinutes: 10 })])];
    expect(computeExposurePenalty([[1]], nodes, baseParams)).toBeGreaterThan(0);
  });

  it('weighs a critical breach heavier than a standard breach of the same overage', () => {
    const criticalNodes = [depot, makeNode(1, 14.15, 100.5, [makeParcel({ tier: 'critical', maxExposureMinutes: 10 })])];
    const standardNodes = [depot, makeNode(1, 14.15, 100.5, [makeParcel({ tier: 'standard', maxExposureMinutes: 10 })])];
    const criticalPenalty = computeExposurePenalty([[1]], criticalNodes, baseParams);
    const standardPenalty = computeExposurePenalty([[1]], standardNodes, baseParams);
    expect(criticalPenalty).toBeGreaterThan(standardPenalty);
  });

  it('prefers ordering the critical parcel earlier in the route (lower total penalty)', () => {
    const near = makeNode(1, 13.75, 100.5); // short hop, no parcel
    const criticalStop = makeNode(2, 14.15, 100.5, [makeParcel({ tier: 'critical', maxExposureMinutes: 45 })]);
    const nodes = [depot, near, criticalStop];

    const criticalFirst = computeExposurePenalty([[2, 1]], nodes, baseParams);
    const criticalLast = computeExposurePenalty([[1, 2]], nodes, baseParams);

    expect(criticalFirst).toBeLessThan(criticalLast);
  });
});
