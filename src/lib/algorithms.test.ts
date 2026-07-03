import { describe, it, expect } from 'vitest';
import { nearestNeighbor, sweep, twoOpt, checkRouteFeasible, orOptAnnealing, clarkWrightSavings, twoOptFeasible } from './algorithms';
import { getFallbackDist } from './geo';
import type { RouteNode, ProcessingParams } from '../types';

const depot: RouteNode = {
  id: 0, location: 'Depot', lat: 13.7, lon: 100.5,
  demandVolume: 0, weight: 0, readyTime: null, dueTime: null,
};
const makeNode = (id: number, lat: number, lon: number, vol: number): RouteNode => ({
  id, location: `Node${id}`, lat, lon,
  demandVolume: vol, weight: 0, readyTime: null, dueTime: null,
});

const baseParams: ProcessingParams = {
  fleetPool: [{ id: 'v1', type: '4-wheel', name: 'Truck', capacityCBM: 20, fuelConsumption: 0.12, color: '#10B981' }],
  avgSpeed: 50,
  startTime: new Date('2024-01-01T08:00:00'),
  driverWage: 60,
  fuelPrice4W: 35,
  fuelPrice6W: 35,
  fuelPrice10W: 35,
  algorithm: 'nearest-neighbor',
  applyTwoOpt: false,
};

const nodes: RouteNode[] = [
  depot,
  makeNode(1, 13.8, 100.5, 5),
  makeNode(2, 13.6, 100.5, 5),
  makeNode(3, 13.7, 100.6, 5),
  makeNode(4, 13.7, 100.4, 5),
];

describe('nearestNeighbor', () => {
  it('covers all customer nodes', () => {
    const routes = nearestNeighbor(nodes, baseParams);
    const allIdx = routes.flat().sort((a, b) => a - b);
    expect(allIdx).toEqual([1, 2, 3, 4]);
  });

  it('no route exceeds max capacity', () => {
    const routes = nearestNeighbor(nodes, baseParams);
    for (const route of routes) {
      const vol = route.reduce((s, i) => s + nodes[i].demandVolume, 0);
      expect(vol).toBeLessThanOrEqual(20);
    }
  });

  it('no route contains depot index (0)', () => {
    const routes = nearestNeighbor(nodes, baseParams);
    for (const route of routes) {
      expect(route).not.toContain(0);
    }
  });
});

describe('sweep', () => {
  it('covers all customer nodes', () => {
    const routes = sweep(nodes, baseParams);
    const allIdx = routes.flat().sort((a, b) => a - b);
    expect(allIdx).toEqual([1, 2, 3, 4]);
  });

  it('no route exceeds max capacity', () => {
    const routes = sweep(nodes, baseParams);
    for (const route of routes) {
      const vol = route.reduce((s, i) => s + nodes[i].demandVolume, 0);
      expect(vol).toBeLessThanOrEqual(20);
    }
  });
});

describe('twoOpt', () => {
  it('returns same nodes in different order (no nodes added or removed)', () => {
    const route = [1, 3, 2, 4];
    const result = twoOpt(route, nodes);
    expect(result.slice().sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  it('returns original route unchanged when fewer than 4 nodes', () => {
    const route = [1, 2, 3];
    expect(twoOpt(route, nodes)).toEqual([1, 2, 3]);
  });

  it('does not increase total route distance', () => {
    // sub-optimal order: 1→3→2→4 vs better orders
    const before = [1, 3, 2, 4];
    const after = twoOpt(before, nodes);
    const dist = (r: number[]) => {
      let d = 0;
      const full = [0, ...r, 0];
      for (let i = 0; i < full.length - 1; i++) {
        const a = nodes[full[i]], b = nodes[full[i + 1]];
        d += Math.hypot(a.lat - b.lat, a.lon - b.lon);
      }
      return d;
    };
    expect(dist(after)).toBeLessThanOrEqual(dist(before) + 0.001);
  });
});

describe('checkRouteFeasible', () => {
  it('returns true for a route within capacity and no time windows', () => {
    const route = [1, 2];
    expect(checkRouteFeasible(route, nodes, baseParams)).toBe(true);
  });

  it('returns false when route volume exceeds max capacity', () => {
    const heavyParams: ProcessingParams = {
      ...baseParams,
      fleetPool: [{ id: 'v1', type: '4-wheel', name: 'Truck', capacityCBM: 5, fuelConsumption: 0.12, color: '#10B981' }],
    };
    const route = [1, 2]; // combined demandVolume = 10, capacity = 5
    expect(checkRouteFeasible(route, nodes, heavyParams)).toBe(false);
  });

  it('returns false when a node is reached after its due time', () => {
    const lateDepot: RouteNode = { ...depot };
    const strictNode: RouteNode = {
      id: 5, location: 'Strict', lat: 20.0, lon: 100.5,
      demandVolume: 1, weight: 0,
      readyTime: null,
      dueTime: new Date('2024-01-01T08:05:00'), // 5 min after startTime, node is ~700km away
    };
    const strictNodes = [lateDepot, strictNode];
    expect(checkRouteFeasible([1], strictNodes, baseParams)).toBe(false);
  });
});

describe('orOptAnnealing', () => {
  it('covers all customer nodes exactly once', () => {
    const routes = orOptAnnealing(nodes, baseParams);
    const allIdx = routes.flat().sort((a, b) => a - b);
    expect(allIdx).toEqual([1, 2, 3, 4]);
  });

  it('no route exceeds max capacity', () => {
    const routes = orOptAnnealing(nodes, baseParams);
    for (const route of routes) {
      const vol = route.reduce((s, i) => s + nodes[i].demandVolume, 0);
      expect(vol).toBeLessThanOrEqual(20);
    }
  });

  it('every route is time-window feasible', () => {
    const routes = orOptAnnealing(nodes, baseParams);
    for (const route of routes) {
      expect(checkRouteFeasible(route, nodes, baseParams)).toBe(true);
    }
  });

  it('produces no route worse than the Clarke-Wright seed on a simple case', () => {
    const seedRoutes = clarkWrightSavings(nodes, baseParams);
    const seedDist = seedRoutes.reduce((total, r) => {
      const full = [0, ...r, 0];
      let d = 0;
      for (let i = 0; i < full.length - 1; i++) {
        const a = nodes[full[i]], b = nodes[full[i + 1]];
        d += Math.hypot(a.lat - b.lat, a.lon - b.lon);
      }
      return total + d;
    }, 0);

    const annealedRoutes = orOptAnnealing(nodes, baseParams);
    const annealedDist = annealedRoutes.reduce((total, r) => {
      const full = [0, ...r, 0];
      let d = 0;
      for (let i = 0; i < full.length - 1; i++) {
        const a = nodes[full[i]], b = nodes[full[i + 1]];
        d += Math.hypot(a.lat - b.lat, a.lon - b.lon);
      }
      return total + d;
    }, 0);

    expect(annealedDist).toBeLessThanOrEqual(seedDist + 0.001);
  });

  it('does not return a route made time-window infeasible by the final twoOpt cleanup', () => {
    // Cardinal-point layout (N, S, E, W around the depot): visiting in N,S,E,W
    // order is feasible for a tight due time on the S node, but twoOpt reorders
    // this crossing path to N,E,S,W, which arrives at the S node much later.
    const bareNodes: RouteNode[] = [
      depot,
      makeNode(1, 13.8, 100.5, 1), // N
      makeNode(2, 13.6, 100.5, 1), // S
      makeNode(3, 13.7, 100.6, 1), // E
      makeNode(4, 13.7, 100.4, 1), // W
    ];
    // Arrival time at the S node (index 2) when visited 2nd, per the same
    // travel-time/service-time math as checkRouteFeasible.
    const dist1 = getFallbackDist([depot.lon, depot.lat], [bareNodes[1].lon, bareNodes[1].lat]);
    const dist12 = getFallbackDist([bareNodes[1].lon, bareNodes[1].lat], [bareNodes[2].lon, bareNodes[2].lat]);
    const arrivalAtNode1 = baseParams.startTime.getTime() + (dist1 / baseParams.avgSpeed) * 3600 * 1000;
    const departAfterNode1 = arrivalAtNode1 + 30 * 60 * 1000;
    const arrivalAtNode2Original = departAfterNode1 + (dist12 / baseParams.avgSpeed) * 3600 * 1000;

    const crossNodes: RouteNode[] = [
      depot,
      makeNode(1, 13.8, 100.5, 1), // N
      { ...makeNode(2, 13.6, 100.5, 1), dueTime: new Date(arrivalAtNode2Original + 5 * 60 * 1000) }, // S, tight due time
      makeNode(3, 13.7, 100.6, 1), // E
      makeNode(4, 13.7, 100.4, 1), // W
    ];
    const original = [1, 2, 3, 4];
    const reordered = twoOpt(original, crossNodes);
    // Prove the trap is real: twoOpt reorders a feasible route into an infeasible one.
    expect(reordered).not.toEqual(original);
    expect(checkRouteFeasible(original, crossNodes, baseParams)).toBe(true);
    expect(checkRouteFeasible(reordered, crossNodes, baseParams)).toBe(false);

    // Prove the guard used by orOptAnnealing's final cleanup pass falls back
    // to the pre-2-opt route instead of returning the infeasible one.
    expect(twoOptFeasible(original, crossNodes, baseParams)).toEqual(original);
  });
});
