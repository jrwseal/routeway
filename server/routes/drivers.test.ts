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

    const deleteRes = await agent.delete(`/api/drivers/${driverId}`);
    expect(deleteRes.status).toBe(200);

    const fleetRes = await agent.get('/api/fleet');
    expect(fleetRes.body.vehicles[0].driverUserId).toBeNull();
  });
});
