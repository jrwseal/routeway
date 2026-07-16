import { describe, it, expect } from 'vitest';
import { distanceMeters, statusFromDistance } from './geofence';

describe('distanceMeters', () => {
  it('is zero for identical coordinates', () => {
    expect(distanceMeters({ lat: 13.7, lon: 100.5 }, { lat: 13.7, lon: 100.5 })).toBe(0);
  });

  it('returns meters, not kilometers, for a known short hop', () => {
    // 1 degree of latitude is ~111.19km everywhere, so 0.001 deg is ~111m
    const d = distanceMeters({ lat: 13.7, lon: 100.5 }, { lat: 13.701, lon: 100.5 });
    expect(d).toBeGreaterThan(108);
    expect(d).toBeLessThan(114);
  });

  it('does not apply getFallbackDist road-distance fudge factor', () => {
    // getFallbackDist multiplies straight-line distance by 1.3 for road estimation;
    // a geofence check needs the real straight-line distance, not the inflated one.
    const d = distanceMeters({ lat: 13.7, lon: 100.5 }, { lat: 13.701, lon: 100.5 });
    expect(d).toBeLessThan(111.19 * 1.3);
  });
});

describe('statusFromDistance', () => {
  it('is in-range within the radius', () => {
    expect(statusFromDistance(50, 80)).toBe('in-range');
    expect(statusFromDistance(80, 80)).toBe('in-range');
  });

  it('is near between 1x and 3x the radius', () => {
    expect(statusFromDistance(81, 80)).toBe('near');
    expect(statusFromDistance(240, 80)).toBe('near');
  });

  it('is far beyond 3x the radius', () => {
    expect(statusFromDistance(241, 80)).toBe('far');
  });
});
