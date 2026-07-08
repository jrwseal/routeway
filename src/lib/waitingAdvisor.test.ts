// src/lib/waitingAdvisor.test.ts
import { describe, it, expect } from 'vitest';
import { getPerVehicleWaitingAdvisories } from './waitingAdvisor';
import { parseVehicleTime } from './geo';
import type { ProcessedData, RouteLeg, RouteNode, Vehicle } from '../types';

const makeNode = (id: number, dueTime: Date | null = null): RouteNode => ({
  id,
  location: `Node${id}`,
  lat: 13.7,
  lon: 100.5,
  demandVolume: 5,
  weight: 5,
  requiresColdStorage: false,
  readyTime: null,
  dueTime,
});

const depot = makeNode(0);

const makeVehicle = (id: string, departureTime: string): Vehicle => ({
  id,
  type: '4-wheel',
  name: `Truck ${id}`,
  capacityCBM: 12,
  fuelConsumption: 0.12,
  fixedCost: 300,
  color: '#10B981',
  fuelPrice: 35,
  departureTime,
});

const vehicle1 = makeVehicle('v1', '08:00');
const vehicle2 = makeVehicle('v2', '09:00');
const planDate = '2026-07-07';
const planDepartureTime = new Date(`${planDate}T08:00:00.000Z`);

function makeLeg(routeIndex: number, overrides: Partial<RouteLeg> & { waitingMinutes: number }): RouteLeg {
  return {
    fromNode: depot,
    toNode: makeNode(1),
    distanceKm: 10,
    durationSec: 600,
    arrivalDate: new Date(`${planDate}T09:00:00.000Z`),
    status: 'On-Time',
    geometry: null,
    routeIndex,
    ...overrides,
  };
}

function makeData(overrides: Partial<ProcessedData> & { legs: RouteLeg[] }): ProcessedData {
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
    totalWaitingHours: 0,
    totalTrucksUsed: 2,
    routeSummaries: [
      { routeIndex: 1, totalVolume: 5, volumeUtilization: 50, distanceKm: 10, vehicle: vehicle1 },
      { routeIndex: 2, totalVolume: 5, volumeUtilization: 50, distanceKm: 10, vehicle: vehicle2 },
    ],
    departureTime: planDepartureTime,
    ...overrides,
  };
}

describe('getPerVehicleWaitingAdvisories', () => {
  it('returns an empty array when every vehicle is at or under the 1-hour threshold', () => {
    const data = makeData({
      legs: [
        makeLeg(1, { waitingMinutes: 30 }),
        makeLeg(2, { waitingMinutes: 30 }),
      ],
    });
    expect(getPerVehicleWaitingAdvisories(data)).toEqual([]);
  });

  it('computes an isolated suggestion per vehicle, not mixed with other vehicles\' waits', () => {
    const data = makeData({
      legs: [
        // route 1 (vehicle1): smallest positive wait is 30
        makeLeg(1, { waitingMinutes: 90 }),
        makeLeg(1, { waitingMinutes: 30 }),
        // route 2 (vehicle2): only wait is 500 - if isolation were broken,
        // this would incorrectly come out as 30 (route 1's minimum) instead
        makeLeg(2, { waitingMinutes: 500 }),
      ],
    });

    const result = getPerVehicleWaitingAdvisories(data);
    expect(result).toHaveLength(2);

    const route1 = result.find(r => r.routeIndex === 1)!;
    expect(route1.suggestedDelayMinutes).toBe(30);
    expect(route1.suggestedDepartureTime).toEqual(
      new Date(parseVehicleTime('08:00', planDate).getTime() + 30 * 60000),
    );

    const route2 = result.find(r => r.routeIndex === 2)!;
    expect(route2.suggestedDelayMinutes).toBe(500);
    expect(route2.suggestedDepartureTime).toEqual(
      new Date(parseVehicleTime('09:00', planDate).getTime() + 500 * 60000),
    );
  });

  it('omits a vehicle under threshold while including another vehicle over it', () => {
    const data = makeData({
      legs: [
        makeLeg(1, { waitingMinutes: 30 }), // 0.5h - under threshold, omitted
        makeLeg(2, { waitingMinutes: 90 }), // 1.5h - over threshold, included
      ],
    });

    const result = getPerVehicleWaitingAdvisories(data);
    expect(result).toHaveLength(1);
    expect(result[0].routeIndex).toBe(2);
    expect(result[0].vehicle.id).toBe('v2');
    expect(result[0].suggestedDelayMinutes).toBe(90);
  });

  it("caps a vehicle's suggested delay to its own tightest due-time slack, floored to whole minutes", () => {
    const data = makeData({
      routeSummaries: [
        { routeIndex: 1, totalVolume: 5, volumeUtilization: 50, distanceKm: 10, vehicle: vehicle1 },
      ],
      legs: [
        makeLeg(1, { waitingMinutes: 90 }),
        makeLeg(1, {
          waitingMinutes: 30,
          arrivalDate: new Date(`${planDate}T09:00:00.000Z`),
          toNode: makeNode(2, new Date(`${planDate}T09:10:36.000Z`)), // 10.6 min slack
        }),
      ],
    });

    const result = getPerVehicleWaitingAdvisories(data);
    expect(result).toHaveLength(1);
    expect(result[0].suggestedDelayMinutes).toBe(10);
    expect(result[0].suggestedDepartureTime).toEqual(
      new Date(parseVehicleTime('08:00', planDate).getTime() + 10 * 60000),
    );
  });

  it("suggests no safe shift (null departure) when the vehicle's schedule is already at its tightest deadline", () => {
    const data = makeData({
      routeSummaries: [
        { routeIndex: 1, totalVolume: 5, volumeUtilization: 50, distanceKm: 10, vehicle: vehicle1 },
      ],
      legs: [
        makeLeg(1, { waitingMinutes: 90 }),
        makeLeg(1, {
          waitingMinutes: 30,
          arrivalDate: new Date(`${planDate}T09:00:00.000Z`),
          toNode: makeNode(2, new Date(`${planDate}T09:00:00.000Z`)), // 0 slack
        }),
      ],
    });

    const result = getPerVehicleWaitingAdvisories(data);
    expect(result).toHaveLength(1);
    expect(result[0].suggestedDelayMinutes).toBe(0);
    expect(result[0].suggestedDepartureTime).toBeNull();
  });
});
