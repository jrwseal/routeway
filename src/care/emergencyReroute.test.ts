import { describe, it, expect } from 'vitest';
import { cheapestInsertionOrder, simulateEmergencyReroute } from './emergencyReroute';
import type { ProcessedData, RouteNode, RouteLeg, RouteSummary, Vehicle } from '../types';

const node = (id: number, location: string, lat: number, lon: number): RouteNode => ({
  id, location, lat, lon,
  demandVolume: 1, weight: 1, requiresColdStorage: false, readyTime: null, dueTime: null,
});

describe('cheapestInsertionOrder', () => {
  it('returns empty for no stops', () => {
    expect(cheapestInsertionOrder({ lat: 0, lon: 0 }, [])).toEqual([]);
  });

  it('orders stops roughly by proximity to current position and each other', () => {
    // start at (0,0); A is far east, B is near start, C is between A and B
    const a = node(1, 'A', 0, 10);
    const b = node(2, 'B', 0, 1);
    const c = node(3, 'C', 0, 5);
    const order = cheapestInsertionOrder({ lat: 0, lon: 0 }, [a, b, c]);
    expect(order.map(n => n.location)).toEqual(['B', 'C', 'A']);
  });
});

describe('simulateEmergencyReroute', () => {
  const depot = node(0, 'Depot', 0, 0);
  const s1 = node(1, 'Stop1', 0, 1);
  const s2 = node(2, 'Stop2', 0, 2);
  const s3 = node(3, 'Stop3', 0, 10);
  const s4 = node(4, 'Stop4', 0, 5);

  const vehicle: Vehicle = {
    id: 'v1', type: 'van', name: 'Van 1', capacityCBM: 10, fuelConsumption: 10,
    fixedCost: 0, color: '#000', fuelPrice: 30, departureTime: '08:00',
  };

  const leg = (from: RouteNode, to: RouteNode, routeIndex: number): RouteLeg => ({
    fromNode: from, toNode: to, distanceKm: 1, durationSec: 60,
    arrivalDate: null, waitingMinutes: 0, status: 'On-Time', geometry: null,
    isReturnToDepot: false, routeIndex,
  });

  const routeSummary: RouteSummary = {
    routeIndex: 0, totalVolume: 4, volumeUtilization: 0.4, distanceKm: 10, vehicle,
  };

  const data: ProcessedData = {
    nodes: [depot, s1, s2, s3, s4],
    legs: [
      leg(depot, s1, 0),
      leg(s1, s2, 0),
      leg(s2, s3, 0),
      leg(s3, s4, 0),
      { ...leg(s4, depot, 0), isReturnToDepot: true },
    ],
    traditionalDistance: 0, milkRunDistance: 0, traditionalCost: 0, milkRunCost: 0,
    savingsPercentage: 0, totalVolume: 4, totalWeight: 4, palletCount: 0,
    spaceUtilization: 0, traditionalCO2: 0, milkRunCO2: 0, fuelSavedLiters: 0,
    co2ReductionPercent: 0, totalWaitingHours: 0, totalTrucksUsed: 1,
    routeSummaries: [routeSummary], departureTime: new Date(),
  };

  it('re-sequences only the stops after the breakdown point', () => {
    const result = simulateEmergencyReroute(data, 0, s2);
    expect(result).not.toBeNull();
    expect(result!.originalRemainingLegs.map(l => l.toNode.location)).toEqual(['Stop3', 'Stop4']);
    // Stop4 (lon 5) is closer to breakdown point (lon 2) than Stop3 (lon 10) -> cheapest insertion reorders
    expect(result!.newLegs.map(l => l.toNode.location)).toEqual(['Stop4', 'Stop3']);
    expect(result!.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(result!.elapsedMs).toBeLessThan(1000);
  });

  it('returns null when the breakdown point is the last stop (nothing left to reroute)', () => {
    expect(simulateEmergencyReroute(data, 0, s4)).toBeNull();
  });

  it('returns null when the node is not found on the given route', () => {
    const other = node(9, 'Nowhere', 5, 5);
    expect(simulateEmergencyReroute(data, 0, other)).toBeNull();
  });
});
