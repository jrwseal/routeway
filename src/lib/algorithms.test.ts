import { describe, it, expect } from 'vitest';
import { nearestNeighbor, sweep, twoOpt } from './algorithms';
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
