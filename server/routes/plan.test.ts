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
  let agent: ReturnType<typeof request.agent>;

  beforeEach(async () => {
    app = createApp(await createDb(':memory:'));
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
  });

  it('returns null when no plan exists yet', async () => {
    const res = await agent.get('/api/plan/active');
    expect(res.status).toBe(200);
    expect(res.body.plan).toBeNull();
  });

  it('can save a plan and read it back in full', async () => {
    const saveRes = await agent.post('/api/plan').send(samplePlan());
    expect(saveRes.status).toBe(200);

    const res = await agent.get('/api/plan/active');
    expect(res.body.plan.legs).toHaveLength(1);
    expect(res.body.plan.routeSummaries[0].routeIndex).toBe(1);
  });

  it('resets progress to step 0 when a new plan is saved', async () => {
    await agent.post('/api/plan').send(samplePlan());
    const progressRes = await agent.get('/api/plan/progress');
    expect(progressRes.body).toEqual([{ routeIndex: 1, currentStep: 0, stepState: 'pending' }]);
  });

  it('can push progress and read it back', async () => {
    await agent.post('/api/plan').send(samplePlan());
    const postRes = await agent.post('/api/plan/progress').send({ routeIndex: 1, currentStep: 1, stepState: 'in_transit' });
    expect(postRes.status).toBe(200);

    const progressRes = await agent.get('/api/plan/progress');
    expect(progressRes.body).toEqual([{ routeIndex: 1, currentStep: 1, stepState: 'in_transit' }]);
  });

  it('rejects unauthenticated access to /active', async () => {
    const res = await request(app).get('/api/plan/active');
    expect(res.status).toBe(401);
  });

  describe('driver scoping', () => {
    async function setUpDriverWithRoute() {
      await agent.post('/api/plan').send(samplePlan());
      const driverRes = await agent.post('/api/drivers').send({ username: 'somchai', password: 'pass1234', displayName: 'สมชาย' });
      await agent.put('/api/fleet').send({
        vehicles: [
          { id: '4w-1', type: '4-wheel', name: 'Truck 1', capacityCBM: 12, fuelConsumption: 0.12, fixedCost: 300, color: '#10B981', fuelPrice: 35, departureTime: '08:00', driverUserId: driverRes.body.id },
        ],
        driverWage: 60,
      });
      const driverAgent = request.agent(app);
      await driverAgent.post('/api/auth/login').send({ username: 'somchai', password: 'pass1234' });
      return driverAgent;
    }

    it('returns only the assigned route on /my-route', async () => {
      const driverAgent = await setUpDriverWithRoute();
      const res = await driverAgent.get('/api/plan/my-route');
      expect(res.status).toBe(200);
      expect(res.body.route.routeSummary.routeIndex).toBe(1);
      expect(res.body.route.legs).toHaveLength(1);
    });

    it('returns route: null when no vehicle is assigned', async () => {
      await agent.post('/api/drivers').send({ username: 'nobody', password: 'pass1234', displayName: 'ไม่มีรถ' });
      const driverAgent = request.agent(app);
      await driverAgent.post('/api/auth/login').send({ username: 'nobody', password: 'pass1234' });

      const res = await driverAgent.get('/api/plan/my-route');
      expect(res.status).toBe(200);
      expect(res.body.route).toBeNull();
    });

    it('allows a driver to push progress for their own route', async () => {
      const driverAgent = await setUpDriverWithRoute();
      const res = await driverAgent.post('/api/plan/progress').send({ routeIndex: 1, currentStep: 1, stepState: 'in_transit' });
      expect(res.status).toBe(200);
    });

    it('rejects a driver pushing progress for a route that is not theirs', async () => {
      const driverAgent = await setUpDriverWithRoute();
      const res = await driverAgent.post('/api/plan/progress').send({ routeIndex: 99, currentStep: 1, stepState: 'in_transit' });
      expect(res.status).toBe(403);
    });

    it('lets a driver post their own location and an admin read it back', async () => {
      const driverAgent = await setUpDriverWithRoute();
      const postRes = await driverAgent.post('/api/plan/location').send({ lat: 13.28, lon: 100.92 });
      expect(postRes.status).toBe(200);

      const res = await agent.get('/api/plan/locations');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ displayName: 'สมชาย', vehicleId: '4w-1', lat: 13.28, lon: 100.92 });
    });

    it('overwrites the previous location on repeated posts instead of accumulating rows', async () => {
      const driverAgent = await setUpDriverWithRoute();
      await driverAgent.post('/api/plan/location').send({ lat: 13.28, lon: 100.92 });
      await driverAgent.post('/api/plan/location').send({ lat: 13.30, lon: 100.90 });

      const res = await agent.get('/api/plan/locations');
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ lat: 13.30, lon: 100.90 });
    });

    it('rejects an admin posting a location (drivers only)', async () => {
      const res = await agent.post('/api/plan/location').send({ lat: 13.28, lon: 100.92 });
      expect(res.status).toBe(403);
    });

    it('rejects a non-admin reading /locations', async () => {
      const driverAgent = await setUpDriverWithRoute();
      const res = await driverAgent.get('/api/plan/locations');
      expect(res.status).toBe(403);
    });

    it('rejects a location post with non-numeric coordinates', async () => {
      const driverAgent = await setUpDriverWithRoute();
      const res = await driverAgent.post('/api/plan/location').send({ lat: 'x', lon: 100.92 });
      expect(res.status).toBe(400);
    });
  });
});
