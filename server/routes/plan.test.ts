import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb } from '../db';
import { createApp } from '../app';

const samplePlan = () => ({
  optimizationCriterion: 'cost',
  data: {
    nodes: [{ id: 0, location: 'Depot', lat: 13.7, lon: 100.5, demandVolume: 0, weight: 0, readyTime: null, dueTime: null }],
    legs: [{
      fromNode: { id: 0, location: 'Depot', lat: 13.7, lon: 100.5, demandVolume: 0, weight: 0, readyTime: null, dueTime: null },
      toNode: { id: 1, location: 'Stop 1', lat: 13.8, lon: 100.5, demandVolume: 5, weight: 5, readyTime: null, dueTime: null },
      distanceKm: 10, durationSec: 600, arrivalDate: '2026-07-06T01:00:00.000Z', waitingMinutes: 0, status: 'On-Time', geometry: null, routeIndex: 1,
    }],
    traditionalDistance: 20, milkRunDistance: 10, traditionalCost: 200, milkRunCost: 100, savingsPercentage: 50,
    totalVolume: 5, totalWeight: 5, palletCount: 1, spaceUtilization: 50,
    traditionalCO2: 5, milkRunCO2: 2, fuelSavedLiters: 1, co2ReductionPercent: 60, totalWaitingHours: 0, totalTrucksUsed: 1,
    routeSummaries: [{
      routeIndex: 1, totalVolume: 5, volumeUtilization: 50, distanceKm: 10,
      vehicle: { id: '4w-1', type: '4-wheel', name: 'Truck 1', capacityCBM: 12, fuelConsumption: 0.12, fixedCost: 300, color: '#10B981', fuelPrice: 35 },
    }],
  },
});

describe('plan routes', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    app = createApp(await createDb(':memory:'));
  });

  it('returns null when no plan exists yet', async () => {
    const res = await request(app).get('/api/plan/active');
    expect(res.status).toBe(200);
    expect(res.body.plan).toBeNull();
  });

  it('can save a plan and read it back in full', async () => {
    const saveRes = await request(app).post('/api/plan').send(samplePlan());
    expect(saveRes.status).toBe(200);

    const res = await request(app).get('/api/plan/active');
    expect(res.body.plan.legs).toHaveLength(1);
    expect(res.body.plan.routeSummaries[0].routeIndex).toBe(1);
  });

  it('resets progress to step 0 when a new plan is saved', async () => {
    await request(app).post('/api/plan').send(samplePlan());
    const progressRes = await request(app).get('/api/plan/progress');
    expect(progressRes.body).toEqual([{ routeIndex: 1, currentStep: 0, stepState: 'pending' }]);
  });

  it('can push progress and read it back', async () => {
    await request(app).post('/api/plan').send(samplePlan());
    const postRes = await request(app).post('/api/plan/progress').send({ routeIndex: 1, currentStep: 1, stepState: 'in_transit' });
    expect(postRes.status).toBe(200);

    const progressRes = await request(app).get('/api/plan/progress');
    expect(progressRes.body).toEqual([{ routeIndex: 1, currentStep: 1, stepState: 'in_transit' }]);
  });
});
