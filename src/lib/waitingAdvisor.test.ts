// src/lib/waitingAdvisor.test.ts
import { describe, it, expect } from 'vitest';
import { getWaitingAdvisory } from './waitingAdvisor';
import type { ProcessedData, RouteLeg, RouteNode } from '../types';

const makeNode = (id: number, dueTime: Date | null = null): RouteNode => ({
  id,
  location: `Node${id}`,
  lat: 13.7,
  lon: 100.5,
  demandVolume: 5,
  weight: 5,
  readyTime: null,
  dueTime,
});

const depot = makeNode(0);

const vehicle = {
  id: 'v1',
  type: '4-wheel',
  name: 'Truck 1',
  capacityCBM: 12,
  fuelConsumption: 0.12,
  fixedCost: 300,
  color: '#10B981',
  fuelPrice: 35,
};

const departureTime = new Date('2026-07-07T08:00:00.000Z');

function makeLeg(overrides: Partial<RouteLeg> & { waitingMinutes: number }): RouteLeg {
  return {
    fromNode: depot,
    toNode: makeNode(1),
    distanceKm: 10,
    durationSec: 600,
    arrivalDate: new Date('2026-07-07T09:00:00.000Z'),
    status: 'On-Time',
    geometry: null,
    routeIndex: 1,
    ...overrides,
  };
}

function makeData(overrides: Partial<ProcessedData> & { legs: RouteLeg[]; totalWaitingHours: number }): ProcessedData {
  return {
    nodes: [depot],
    traditionalDistance: 20,
    milkRunDistance: 10,
    traditionalCost: 200,
    milkRunCost: 100,
    savingsPercentage: 50,
    totalVolume: 5,
    totalWeight: 5,
    palletCount: 1,
    spaceUtilization: 50,
    traditionalCO2: 5,
    milkRunCO2: 2,
    fuelSavedLiters: 1,
    co2ReductionPercent: 60,
    totalTrucksUsed: 1,
    routeSummaries: [{ routeIndex: 1, totalVolume: 5, volumeUtilization: 50, distanceKm: 10, vehicle }],
    departureTime,
    ...overrides,
  };
}

describe('getWaitingAdvisory', () => {
  it('returns null when total waiting is at or under 1 hour', () => {
    const data = makeData({
      totalWaitingHours: 0.5,
      legs: [makeLeg({ waitingMinutes: 30 })],
    });
    expect(getWaitingAdvisory(data)).toBeNull();
  });

  it('suggests the smallest positive wait as the delay when nothing else constrains it', () => {
    const data = makeData({
      totalWaitingHours: 2,
      legs: [
        makeLeg({ waitingMinutes: 90 }),
        makeLeg({ waitingMinutes: 30 }),
      ],
    });
    const advisory = getWaitingAdvisory(data);
    expect(advisory).not.toBeNull();
    expect(advisory!.suggestedDelayMinutes).toBe(30);
    expect(advisory!.suggestedDepartureTime).toEqual(new Date('2026-07-07T08:30:00.000Z'));
  });

  it('caps the suggested delay to the tightest due-time slack', () => {
    const data = makeData({
      totalWaitingHours: 2,
      legs: [
        makeLeg({ waitingMinutes: 90 }),
        makeLeg({
          waitingMinutes: 30,
          arrivalDate: new Date('2026-07-07T09:00:00.000Z'),
          toNode: makeNode(2, new Date('2026-07-07T09:10:00.000Z')),
        }),
      ],
    });
    const advisory = getWaitingAdvisory(data);
    expect(advisory).not.toBeNull();
    expect(advisory!.suggestedDelayMinutes).toBe(10);
    expect(advisory!.suggestedDepartureTime).toEqual(new Date('2026-07-07T08:10:00.000Z'));
  });

  it('returns null when total waiting exceeds the threshold but no leg has a positive wait', () => {
    const data = makeData({
      totalWaitingHours: 2,
      legs: [
        makeLeg({ waitingMinutes: 0 }),
        makeLeg({ waitingMinutes: 0 }),
      ],
    });
    expect(getWaitingAdvisory(data)).toBeNull();
  });

  it('suggests no safe shift when the schedule is already at its tightest deadline', () => {
    const data = makeData({
      totalWaitingHours: 2,
      legs: [
        makeLeg({ waitingMinutes: 90 }),
        makeLeg({
          waitingMinutes: 30,
          arrivalDate: new Date('2026-07-07T09:00:00.000Z'),
          toNode: makeNode(2, new Date('2026-07-07T09:00:00.000Z')),
        }),
      ],
    });
    const advisory = getWaitingAdvisory(data);
    expect(advisory).not.toBeNull();
    expect(advisory!.suggestedDelayMinutes).toBe(0);
    expect(advisory!.suggestedDepartureTime).toBeNull();
  });

  it('floors (not rounds) fractional slack to prevent deadline overshoot', () => {
    // Fractional slack: 10.6 minutes (from 09:00:00 to 09:10:36).
    // With Math.floor, suggestedDelayMinutes = 10 (safe).
    // With Math.round, it would be 11 (violates deadline by ~24 seconds).
    const data = makeData({
      totalWaitingHours: 2,
      legs: [
        makeLeg({ waitingMinutes: 90 }),
        makeLeg({
          waitingMinutes: 30,
          arrivalDate: new Date('2026-07-07T09:00:00.000Z'),
          toNode: makeNode(2, new Date('2026-07-07T09:10:36.000Z')),
        }),
      ],
    });
    const advisory = getWaitingAdvisory(data);
    expect(advisory).not.toBeNull();
    expect(advisory!.suggestedDelayMinutes).toBe(10);
    expect(advisory!.suggestedDepartureTime).toEqual(new Date('2026-07-07T08:10:00.000Z'));
  });
});
