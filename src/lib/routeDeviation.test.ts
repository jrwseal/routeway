import { describe, it, expect } from 'vitest';
import {
  legsToPolyline,
  perpendicularDistanceMeters,
  evaluateDeviation,
  INITIAL_DEVIATION_STATE,
} from './routeDeviation';
import type { RouteLeg, RouteNode } from '../types';

const depot: RouteNode = {
  id: 0, location: 'Depot', lat: 13.700, lon: 100.500,
  demandVolume: 0, weight: 0, requiresColdStorage: false, readyTime: null, dueTime: null,
};
const stop: RouteNode = {
  id: 1, location: 'Stop', lat: 13.710, lon: 100.500,
  demandVolume: 1, weight: 1, requiresColdStorage: false, readyTime: null, dueTime: null,
};

const straightLeg: RouteLeg = {
  fromNode: depot, toNode: stop, distanceKm: 1, durationSec: 60,
  arrivalDate: null, waitingMinutes: 0, status: 'On-Time', geometry: null, routeIndex: 0,
};

describe('legsToPolyline', () => {
  it('falls back to straight from/to points when a leg has no geometry', () => {
    const poly = legsToPolyline([straightLeg]);
    expect(poly).toEqual([
      { lat: 13.700, lon: 100.500 },
      { lat: 13.710, lon: 100.500 },
    ]);
  });

  it('uses routed geometry coordinates ([lon, lat] pairs) when present', () => {
    const leg: RouteLeg = { ...straightLeg, geometry: { coordinates: [[100.5, 13.7], [100.501, 13.705], [100.5, 13.71]] } };
    const poly = legsToPolyline([leg]);
    expect(poly).toEqual([
      { lat: 13.7, lon: 100.5 },
      { lat: 13.705, lon: 100.501 },
      { lat: 13.71, lon: 100.5 },
    ]);
  });
});

describe('perpendicularDistanceMeters', () => {
  const polyline = [{ lat: 13.700, lon: 100.500 }, { lat: 13.710, lon: 100.500 }];

  it('is ~0 for a point on the segment', () => {
    const d = perpendicularDistanceMeters({ lat: 13.705, lon: 100.500 }, polyline);
    expect(d).toBeLessThan(1);
  });

  it('grows with lateral offset from the segment', () => {
    // ~0.001 deg longitude at this latitude is roughly 108m
    const d = perpendicularDistanceMeters({ lat: 13.705, lon: 100.501 }, polyline);
    expect(d).toBeGreaterThan(95);
    expect(d).toBeLessThan(120);
  });

  it('clamps to the nearest endpoint beyond the segment', () => {
    const beyondEnd = perpendicularDistanceMeters({ lat: 13.720, lon: 100.500 }, polyline);
    // ~0.01 deg latitude past the endpoint is roughly 1110m
    expect(beyondEnd).toBeGreaterThan(1000);
    expect(beyondEnd).toBeLessThan(1200);
  });
});

describe('evaluateDeviation', () => {
  const point = { lat: 13.705, lon: 100.502 };
  const corridor = 300;
  const minDurationMs = 3 * 60000;

  it('stays reset while within the corridor', () => {
    const { state, event } = evaluateDeviation(INITIAL_DEVIATION_STATE, point, 100, corridor, minDurationMs, 0);
    expect(state).toEqual(INITIAL_DEVIATION_STATE);
    expect(event).toBeNull();
  });

  it('does not flag before the minimum duration elapses', () => {
    const first = evaluateDeviation(INITIAL_DEVIATION_STATE, point, 400, corridor, minDurationMs, 0);
    expect(first.event).toBeNull();
    const second = evaluateDeviation(first.state, point, 400, corridor, minDurationMs, 60000); // +1min
    expect(second.event).toBeNull();
  });

  it('flags exactly once when continuously outside the corridor for >= 3 minutes', () => {
    let state = INITIAL_DEVIATION_STATE;
    let result = evaluateDeviation(state, point, 400, corridor, minDurationMs, 0);
    state = result.state;
    result = evaluateDeviation(state, point, 400, corridor, minDurationMs, 3 * 60000);
    expect(result.event).not.toBeNull();
    expect(result.event?.distanceFromRoute).toBe(400);
    expect(result.event?.durationMinutes).toBeCloseTo(3);
    state = result.state;

    // still deviated a minute later — must not re-flag
    result = evaluateDeviation(state, point, 400, corridor, minDurationMs, 4 * 60000);
    expect(result.event).toBeNull();
  });

  it('resets the clock on a single in-corridor reading (GPS jitter guard)', () => {
    let state = evaluateDeviation(INITIAL_DEVIATION_STATE, point, 400, corridor, minDurationMs, 0).state;
    // back in corridor briefly at t=1min
    state = evaluateDeviation(state, point, 100, corridor, minDurationMs, 60000).state;
    expect(state).toEqual(INITIAL_DEVIATION_STATE);

    // deviates again at t=2min — must not flag until 2min+3min
    const result = evaluateDeviation(state, point, 400, corridor, minDurationMs, 2 * 60000 + minDurationMs - 1000);
    expect(result.event).toBeNull();
  });

  it('flags a new episode after returning on-route and deviating again', () => {
    let state = evaluateDeviation(INITIAL_DEVIATION_STATE, point, 400, corridor, minDurationMs, 0).state;
    let result = evaluateDeviation(state, point, 400, corridor, minDurationMs, minDurationMs);
    expect(result.event).not.toBeNull();
    state = evaluateDeviation(result.state, point, 100, corridor, minDurationMs, minDurationMs + 60000).state;
    expect(state).toEqual(INITIAL_DEVIATION_STATE);

    result = evaluateDeviation(state, point, 400, corridor, minDurationMs, minDurationMs + 120000);
    expect(result.event).toBeNull(); // just started this episode
    result = evaluateDeviation(result.state, point, 400, corridor, minDurationMs, minDurationMs + 120000 + minDurationMs);
    expect(result.event).not.toBeNull();
  });
});
