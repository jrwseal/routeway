import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb } from '../db';
import { createApp } from '../app';

describe('fleet routes', () => {
  let app: ReturnType<typeof createApp>;
  let agent: ReturnType<typeof request.agent>;

  beforeEach(async () => {
    app = createApp(await createDb(':memory:'));
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
  });

  it('returns the seeded default fleet', async () => {
    const res = await agent.get('/api/fleet');
    expect(res.status).toBe(200);
    expect(res.body.vehicles).toHaveLength(9);
    expect(res.body.driverWage).toBe(60);
  });

  it('saves an edited fleet', async () => {
    const putRes = await agent.put('/api/fleet').send({
      vehicles: [
        { id: '4w-1', type: '4-wheel', name: 'Truck 1', capacityCBM: 12, fuelConsumption: 0.12, fixedCost: 300, color: '#10B981', fuelPrice: 36, departureTime: '09:30' },
      ],
      driverWage: 70,
    });
    expect(putRes.status).toBe(200);

    const getRes = await agent.get('/api/fleet');
    expect(getRes.body.vehicles).toHaveLength(1);
    expect(getRes.body.vehicles[0].fuelPrice).toBe(36);
    expect(getRes.body.vehicles[0].departureTime).toBe('09:30');
    expect(getRes.body.driverWage).toBe(70);
  });

  it('returns enableColdStorage: false by default', async () => {
    const res = await agent.get('/api/fleet');
    expect(res.body.enableColdStorage).toBe(false);
  });

  it('saves enableColdStorage: true with a cold-storage vehicle', async () => {
    const putRes = await agent.put('/api/fleet').send({
      vehicles: [
        { id: 'cold-1', type: 'cold-storage', name: 'Cold Truck 1', capacityCBM: 10, fuelConsumption: 0.18, fixedCost: 500, color: '#06B6D4', fuelPrice: 35, departureTime: '08:00' },
      ],
      driverWage: 60,
      enableColdStorage: true,
    });
    expect(putRes.status).toBe(200);

    const getRes = await agent.get('/api/fleet');
    expect(getRes.body.enableColdStorage).toBe(true);
    expect(getRes.body.vehicles[0].type).toBe('cold-storage');
  });

  it('rejects disabling cold storage while a cold-storage vehicle is present', async () => {
    await agent.put('/api/fleet').send({
      vehicles: [
        { id: 'cold-1', type: 'cold-storage', name: 'Cold Truck 1', capacityCBM: 10, fuelConsumption: 0.18, fixedCost: 500, color: '#06B6D4', fuelPrice: 35, departureTime: '08:00' },
      ],
      driverWage: 60,
      enableColdStorage: true,
    });

    const putRes = await agent.put('/api/fleet').send({
      vehicles: [
        { id: 'cold-1', type: 'cold-storage', name: 'Cold Truck 1', capacityCBM: 10, fuelConsumption: 0.18, fixedCost: 500, color: '#06B6D4', fuelPrice: 35, departureTime: '08:00' },
      ],
      driverWage: 60,
      enableColdStorage: false,
    });
    expect(putRes.status).toBe(400);
    expect(putRes.body.error).toBe('Cannot disable cold storage while cold-storage vehicles exist');

    const getRes = await agent.get('/api/fleet');
    expect(getRes.body.enableColdStorage).toBe(true);
  });

  it('round-trips a driver assignment', async () => {
    const createDriverRes = await agent.post('/api/drivers').send({ username: 'somchai', password: 'pass1234', displayName: 'สมชาย' });
    const putRes = await agent.put('/api/fleet').send({
      vehicles: [
        { id: '4w-1', type: '4-wheel', name: 'Truck 1', capacityCBM: 12, fuelConsumption: 0.12, fixedCost: 300, color: '#10B981', fuelPrice: 35, departureTime: '08:00', driverUserId: createDriverRes.body.id },
      ],
      driverWage: 60,
    });
    expect(putRes.status).toBe(200);

    const getRes = await agent.get('/api/fleet');
    expect(getRes.body.vehicles[0].driverUserId).toBe(createDriverRes.body.id);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/fleet');
    expect(res.status).toBe(401);
  });
});
