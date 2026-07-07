import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb } from '../db';
import { createApp } from '../app';

async function loginAsPlanner(app: any) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin1234' });
  return agent;
}

describe('fleet routes', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp(createDb(':memory:'));
  });

  it('rejects unauthenticated access', async () => {
    const res = await request(app).get('/api/fleet');
    expect(res.status).toBe(401);
  });

  it('returns the seeded default fleet', async () => {
    const agent = await loginAsPlanner(app);
    const res = await agent.get('/api/fleet');
    expect(res.status).toBe(200);
    expect(res.body.vehicles).toHaveLength(9);
    expect(res.body.driverWage).toBe(60);
    expect(res.body.vehicles[0].driverUserId).toBeNull();
  });

  it('saves an edited fleet with a driver assignment', async () => {
    const agent = await loginAsPlanner(app);
    const driverRes = await agent.post('/api/drivers').send({ username: 'somchai', password: 'pass1234', displayName: 'สมชาย' });
    const driverId = driverRes.body.id;

    const putRes = await agent.put('/api/fleet').send({
      vehicles: [
        { id: '4w-1', type: '4-wheel', name: 'Truck 1', capacityCBM: 12, fuelConsumption: 0.12, fixedCost: 300, color: '#10B981', driverUserId: driverId, fuelPrice: 36 },
      ],
      driverWage: 70,
    });
    expect(putRes.status).toBe(200);

    const getRes = await agent.get('/api/fleet');
    expect(getRes.body.vehicles).toHaveLength(1);
    expect(getRes.body.vehicles[0].driverUserId).toBe(driverId);
    expect(getRes.body.vehicles[0].fuelPrice).toBe(36);
    expect(getRes.body.driverWage).toBe(70);
  });

  it('rejects driver-role access', async () => {
    const agent = await loginAsPlanner(app);
    await agent.post('/api/drivers').send({ username: 'somchai', password: 'pass1234', displayName: 'สมชาย' });
    const driverAgent = request.agent(app);
    await driverAgent.post('/api/auth/login').send({ username: 'somchai', password: 'pass1234' });
    const res = await driverAgent.get('/api/fleet');
    expect(res.status).toBe(403);
  });
});
