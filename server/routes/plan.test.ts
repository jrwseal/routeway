import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb } from '../db';
import { createApp } from '../app';

async function loginAsPlanner(app: any) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin1234' });
  return agent;
}

const samplePlan = (vehicleDriverUserId: number | null) => ({
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
      vehicle: { id: '4w-1', type: '4-wheel', name: 'Truck 1', capacityCBM: 12, fuelConsumption: 0.12, fixedCost: 300, color: '#10B981', driverUserId: vehicleDriverUserId },
    }],
  },
});

describe('plan routes', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp(createDb(':memory:'));
  });

  it('returns null for planner when no plan exists yet', async () => {
    const agent = await loginAsPlanner(app);
    const res = await agent.get('/api/plan/active');
    expect(res.status).toBe(200);
    expect(res.body.plan).toBeNull();
  });

  it('planner can save a plan and read it back in full', async () => {
    const agent = await loginAsPlanner(app);
    const saveRes = await agent.post('/api/plan').send(samplePlan(null));
    expect(saveRes.status).toBe(200);

    const res = await agent.get('/api/plan/active');
    expect(res.body.plan.legs).toHaveLength(1);
    expect(res.body.plan.routeSummaries[0].routeIndex).toBe(1);
  });

  it('resets progress to step 0 when a new plan is saved', async () => {
    const agent = await loginAsPlanner(app);
    await agent.post('/api/plan').send(samplePlan(null));
    const progressRes = await agent.get('/api/plan/progress');
    expect(progressRes.body).toEqual([{ routeIndex: 1, currentStep: 0, stepState: 'pending' }]);
  });

  it('driver sees only their assigned route, or null if unassigned', async () => {
    const agent = await loginAsPlanner(app);
    const driverRes = await agent.post('/api/drivers').send({ username: 'somchai', password: 'pass1234', displayName: 'สมชาย' });
    const driverId = driverRes.body.id;
    await agent.post('/api/plan').send(samplePlan(driverId));

    const driverAgent = request.agent(app);
    await driverAgent.post('/api/auth/login').send({ username: 'somchai', password: 'pass1234' });
    const res = await driverAgent.get('/api/plan/active');
    expect(res.body.plan.routeSummaries).toHaveLength(1);
    expect(res.body.plan.legs).toHaveLength(1);

    const otherRes = await agent.post('/api/drivers').send({ username: 'wichai', password: 'pass1234', displayName: 'วิชัย' });
    const otherAgent = request.agent(app);
    await otherAgent.post('/api/auth/login').send({ username: 'wichai', password: 'pass1234' });
    const unassignedRes = await otherAgent.get('/api/plan/active');
    expect(unassignedRes.body.plan).toBeNull();
  });

  it('driver can push their own progress, planner reads it back', async () => {
    const agent = await loginAsPlanner(app);
    const driverRes = await agent.post('/api/drivers').send({ username: 'somchai', password: 'pass1234', displayName: 'สมชาย' });
    const driverId = driverRes.body.id;
    await agent.post('/api/plan').send(samplePlan(driverId));

    const driverAgent = request.agent(app);
    await driverAgent.post('/api/auth/login').send({ username: 'somchai', password: 'pass1234' });
    const postRes = await driverAgent.post('/api/plan/progress').send({ routeIndex: 1, currentStep: 1, stepState: 'in_transit' });
    expect(postRes.status).toBe(200);

    const progressRes = await agent.get('/api/plan/progress');
    expect(progressRes.body).toEqual([{ routeIndex: 1, currentStep: 1, stepState: 'in_transit' }]);
  });

  it('rejects a driver pushing progress for a route that is not theirs', async () => {
    const agent = await loginAsPlanner(app);
    const driverRes = await agent.post('/api/drivers').send({ username: 'somchai', password: 'pass1234', displayName: 'สมชาย' });
    await agent.post('/api/plan').send(samplePlan(driverRes.body.id));

    const otherRes = await agent.post('/api/drivers').send({ username: 'wichai', password: 'pass1234', displayName: 'วิชัย' });
    const otherAgent = request.agent(app);
    await otherAgent.post('/api/auth/login').send({ username: 'wichai', password: 'pass1234' });
    const res = await otherAgent.post('/api/plan/progress').send({ routeIndex: 1, currentStep: 1, stepState: 'in_transit' });
    expect(res.status).toBe(403);
  });
});
