import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getActivePlan } from './api';

describe('api client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('getActivePlan revives Date fields from JSON strings', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        plan: {
          nodes: [{ id: 0, location: 'Depot', lat: 1, lon: 1, demandVolume: 0, weight: 0, readyTime: null, dueTime: null }],
          legs: [{
            fromNode: { id: 0, location: 'Depot', lat: 1, lon: 1, demandVolume: 0, weight: 0, readyTime: null, dueTime: null },
            toNode: { id: 1, location: 'Stop', lat: 1, lon: 1, demandVolume: 1, weight: 1, readyTime: null, dueTime: null },
            distanceKm: 1, durationSec: 1, arrivalDate: '2026-07-06T01:00:00.000Z', waitingMinutes: 0, status: 'On-Time', geometry: null, routeIndex: 1,
          }],
          routeSummaries: [],
        },
        progress: null,
      }),
    });
    const result = await getActivePlan();
    expect(result!.plan.legs[0].arrivalDate).toBeInstanceOf(Date);
  });
});
