import { describe, it, expect, vi, beforeEach } from 'vitest';
import { login, getMe, getActivePlan } from './api';

describe('api client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('login posts credentials and returns the user', async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ id: 1, username: 'admin', role: 'planner', displayName: 'Planner' }) });
    const user = await login('admin', 'admin1234');
    expect(user.role).toBe('planner');
    expect((fetch as any).mock.calls[0][0]).toBe('/api/auth/login');
  });

  it('getMe returns null on 401 instead of throwing', async () => {
    (fetch as any).mockResolvedValue({ ok: false, status: 401 });
    const user = await getMe();
    expect(user).toBeNull();
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
