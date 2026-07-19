import { describe, it, expect } from 'vitest';
import { getNodeDeviations, getMovingAverageDeviationByNode, getAccuracyTrend } from './calibration';
import type { RouteNode, Parcel } from '../types';
import type { DeliveryLogEntry } from './deliveryLog';

const depot: RouteNode = {
  id: 0, location: 'Depot', lat: 13.7, lon: 100.5,
  demandVolume: 0, weight: 0, requiresColdStorage: false, readyTime: null, dueTime: null,
};

const makeParcel = (overrides: Partial<Parcel>): Parcel => ({
  id: 'PCL-1', name: 'Test Parcel', tier: 'standard', maxExposureMinutes: 60,
  requiredTemp: { min: 2, max: 8 }, ...overrides,
});

const stop: RouteNode = {
  ...depot, id: 1, location: 'Stop A', lat: 13.8, lon: 100.6,
  parcels: [makeParcel({ id: 'PCL-1' })],
};

const entry = (parcelId: string, plannedIso: string, actualIso: string): DeliveryLogEntry => ({
  parcelId,
  plannedTime: plannedIso,
  actualTime: actualIso,
  actualCoordinates: { lat: 13.8, lon: 100.6 },
  distanceAtConfirm: 10,
});

describe('getNodeDeviations', () => {
  it('computes minutes late/early per node from the delivery log', () => {
    const log = [entry('PCL-1', '2024-01-01T08:00:00Z', '2024-01-01T08:12:00Z')];
    const deviations = getNodeDeviations([depot, stop], log);
    expect(deviations).toHaveLength(1);
    expect(deviations[0].deviationMinutes).toBeCloseTo(12);
    expect(deviations[0].location).toBe('Stop A');
  });

  it('skips entries with no plannedTime or unmatched parcel', () => {
    const log: DeliveryLogEntry[] = [
      { ...entry('PCL-1', '2024-01-01T08:00:00Z', '2024-01-01T08:12:00Z'), plannedTime: null },
      entry('PCL-UNKNOWN', '2024-01-01T08:00:00Z', '2024-01-01T08:12:00Z'),
    ];
    expect(getNodeDeviations([depot, stop], log)).toHaveLength(0);
  });
});

describe('getMovingAverageDeviationByNode', () => {
  it('averages only the last N samples per node, chronologically', () => {
    const log = [
      entry('PCL-1', '2024-01-01T08:00:00Z', '2024-01-01T08:20:00Z'), // +20
      entry('PCL-1', '2024-01-02T08:00:00Z', '2024-01-02T08:20:00Z'), // +20
      entry('PCL-1', '2024-01-03T08:00:00Z', '2024-01-03T08:10:00Z'), // +10
      entry('PCL-1', '2024-01-04T08:00:00Z', '2024-01-04T08:00:00Z'), // 0
      entry('PCL-1', '2024-01-05T08:00:00Z', '2024-01-05T08:00:00Z'), // 0
      entry('PCL-1', '2024-01-06T08:00:00Z', '2024-01-06T08:00:00Z'), // 0 (drops the +20/+20 out of window)
    ];
    const deviations = getNodeDeviations([depot, stop], log);
    const avg = getMovingAverageDeviationByNode(deviations, 5);
    // last 5 (chronological): +20, +10, 0, 0, 0 -> avg 6
    expect(avg.get('Stop A|13.8|100.6')).toBeCloseTo(6);
  });
});

describe('getAccuracyTrend', () => {
  it('groups by date and averages absolute deviation', () => {
    const log = [
      entry('PCL-1', '2024-01-01T08:00:00Z', '2024-01-01T08:30:00Z'), // +30
      entry('PCL-1', '2024-01-01T09:00:00Z', '2024-01-01T08:50:00Z'), // -10
      entry('PCL-1', '2024-01-02T08:00:00Z', '2024-01-02T08:05:00Z'), // +5
    ];
    const trend = getAccuracyTrend(getNodeDeviations([depot, stop], log));
    expect(trend).toEqual([
      { date: '2024-01-01', avgAbsDeviationMinutes: 20, count: 2 },
      { date: '2024-01-02', avgAbsDeviationMinutes: 5, count: 1 },
    ]);
  });
});
