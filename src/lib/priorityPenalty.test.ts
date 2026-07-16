import { describe, it, expect } from 'vitest';
import { computePriorityPenalty } from './priorityPenalty';
import type { RouteNode, Parcel } from '../types';

const depot: RouteNode = {
  id: 0, location: 'Depot', lat: 13.7, lon: 100.5,
  demandVolume: 0, weight: 0, requiresColdStorage: false, readyTime: null, dueTime: null,
};

const makeParcel = (overrides: Partial<Parcel>): Parcel => ({
  id: 'PCL-1', name: 'Test Parcel', tier: 'standard', maxExposureMinutes: 60,
  requiredTemp: { min: 2, max: 8 }, ...overrides,
});

const makeNode = (id: number, parcels?: Parcel[]): RouteNode => ({
  id, location: `Node${id}`, lat: 13.7, lon: 100.5,
  demandVolume: 1, weight: 0, requiresColdStorage: false, readyTime: null, dueTime: null,
  parcels,
});

describe('computePriorityPenalty', () => {
  it('is zero when no node carries parcels', () => {
    const nodes = [depot, makeNode(1), makeNode(2)];
    expect(computePriorityPenalty([[1, 2]], nodes)).toBe(0);
  });

  it('is zero for a parcel placed first in the route', () => {
    const nodes = [depot, makeNode(1, [makeParcel({})]), makeNode(2)];
    expect(computePriorityPenalty([[1, 2]], nodes)).toBe(0);
  });

  it('grows with position further into the route', () => {
    const nodes = [depot, makeNode(1), makeNode(2, [makeParcel({})])];
    const early = computePriorityPenalty([[2, 1]], nodes);
    const late = computePriorityPenalty([[1, 2]], nodes);
    expect(late).toBeGreaterThan(early);
  });

  it('weighs a critical parcel heavier than a standard parcel at the same position', () => {
    const criticalNodes = [depot, makeNode(1), makeNode(2, [makeParcel({ tier: 'critical' })])];
    const standardNodes = [depot, makeNode(1), makeNode(2, [makeParcel({ tier: 'standard' })])];
    const criticalPenalty = computePriorityPenalty([[1, 2]], criticalNodes);
    const standardPenalty = computePriorityPenalty([[1, 2]], standardNodes);
    expect(criticalPenalty).toBeGreaterThan(standardPenalty);
  });
});
