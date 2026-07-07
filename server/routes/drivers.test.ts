import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb } from '../db';
import { createApp } from '../app';

async function loginAsPlanner(app: any) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin1234' });
  return agent;
}

describe('drivers routes', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp(createDb(':memory:'));
  });

  it('rejects unauthenticated access', async () => {
    const res = await request(app).get('/api/drivers');
    expect(res.status).toBe(401);
  });

  it('creates and lists a driver account', async () => {
    const agent = await loginAsPlanner(app);
    const createRes = await agent.post('/api/drivers').send({ username: 'somchai', password: 'pass1234', displayName: 'สมชาย' });
    expect(createRes.status).toBe(201);
    expect(createRes.body.username).toBe('somchai');

    const listRes = await agent.get('/api/drivers');
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].displayName).toBe('สมชาย');
  });

  it('rejects a duplicate username', async () => {
    const agent = await loginAsPlanner(app);
    await agent.post('/api/drivers').send({ username: 'somchai', password: 'pass1234', displayName: 'สมชาย' });
    const res = await agent.post('/api/drivers').send({ username: 'somchai', password: 'other123', displayName: 'Someone Else' });
    expect(res.status).toBe(409);
  });

  it('deletes a driver and clears any vehicle assignment', async () => {
    const agent = await loginAsPlanner(app);
    const createRes = await agent.post('/api/drivers').send({ username: 'somchai', password: 'pass1234', displayName: 'สมชาย' });
    const driverId = createRes.body.id;

    const db = (app as any).locals?.db;
    await agent.put('/api/fleet').send({
      vehicles: [{ id: '4w-1', type: '4-wheel', name: 'Truck 1', capacityCBM: 12, fuelConsumption: 0.12, fixedCost: 300, color: '#10B981', driverUserId: driverId }],
      driverWage: 60, fuelPrice4W: 35, fuelPrice6W: 35, fuelPrice10W: 35,
    });

    // Capture the driver's own session (Set-Cookie) BEFORE they're deleted —
    // a deleted user can't log in again, but their existing JWT is still valid
    // for up to 7 days since there's no revocation list.
    const driverAgent = request.agent(app);
    await driverAgent.post('/api/auth/login').send({ username: 'somchai', password: 'pass1234' });

    // Save an active plan referencing this driver's vehicle in a routeSummaries entry.
    await agent.post('/api/plan').send({
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
          vehicle: { id: '4w-1', type: '4-wheel', name: 'Truck 1', capacityCBM: 12, fuelConsumption: 0.12, fixedCost: 300, color: '#10B981', driverUserId: driverId },
        }],
      },
    });

    const deleteRes = await agent.delete(`/api/drivers/${driverId}`);
    expect(deleteRes.status).toBe(200);

    const fleetRes = await agent.get('/api/fleet');
    expect(fleetRes.body.vehicles[0].driverUserId).toBeNull();

    // The deleted driver's still-valid cookie must no longer grant access to
    // their old route snapshot — the snapshot's embedded driverUserId should
    // have been scrubbed immediately on deletion, not left until next recompute.
    const staleRes = await driverAgent.get('/api/plan/active');
    expect(staleRes.body.plan).toBeNull();
  });
});
