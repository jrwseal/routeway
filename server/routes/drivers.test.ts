import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb } from '../db';
import { createApp } from '../app';

describe('drivers routes', () => {
  let app: ReturnType<typeof createApp>;
  let adminAgent: ReturnType<typeof request.agent>;

  beforeEach(async () => {
    app = createApp(await createDb(':memory:'));
    adminAgent = request.agent(app);
    await adminAgent.post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
  });

  it('creates a driver account', async () => {
    const res = await adminAgent.post('/api/drivers').send({ username: 'somchai', password: 'pass1234', displayName: 'สมชาย' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ username: 'somchai', displayName: 'สมชาย', vehicleId: null });
  });

  it('lists driver accounts', async () => {
    await adminAgent.post('/api/drivers').send({ username: 'somchai', password: 'pass1234', displayName: 'สมชาย' });
    const res = await adminAgent.get('/api/drivers');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].username).toBe('somchai');
  });

  it('rejects a duplicate username', async () => {
    await adminAgent.post('/api/drivers').send({ username: 'somchai', password: 'pass1234', displayName: 'สมชาย' });
    const res = await adminAgent.post('/api/drivers').send({ username: 'somchai', password: 'other1234', displayName: 'อีกคน' });
    expect(res.status).toBe(409);
  });

  it('updates a driver password', async () => {
    const createRes = await adminAgent.post('/api/drivers').send({ username: 'somchai', password: 'pass1234', displayName: 'สมชาย' });
    const patchRes = await adminAgent.patch(`/api/drivers/${createRes.body.id}`).send({ password: 'newpass1' });
    expect(patchRes.status).toBe(200);

    const loginRes = await request(app).post('/api/auth/login').send({ username: 'somchai', password: 'newpass1' });
    expect(loginRes.status).toBe(200);
  });

  it('deletes a driver and clears their vehicle assignment', async () => {
    const createRes = await adminAgent.post('/api/drivers').send({ username: 'somchai', password: 'pass1234', displayName: 'สมชาย' });
    const driverId = createRes.body.id;

    const fleetRes = await adminAgent.get('/api/fleet');
    const vehicle = fleetRes.body.vehicles[0];
    await adminAgent.put('/api/fleet').send({
      vehicles: [{ ...vehicle, driverUserId: driverId }],
      driverWage: fleetRes.body.driverWage,
      enableColdStorage: fleetRes.body.enableColdStorage,
    });

    const delRes = await adminAgent.delete(`/api/drivers/${driverId}`);
    expect(delRes.status).toBe(200);

    const fleetAfter = await adminAgent.get('/api/fleet');
    expect(fleetAfter.body.vehicles[0].driverUserId).toBeNull();
  });

  it('rejects unauthenticated access', async () => {
    const res = await request(app).get('/api/drivers');
    expect(res.status).toBe(401);
  });

  it('rejects driver-role access', async () => {
    await adminAgent.post('/api/drivers').send({ username: 'somchai', password: 'pass1234', displayName: 'สมชาย' });
    const driverAgent = request.agent(app);
    await driverAgent.post('/api/auth/login').send({ username: 'somchai', password: 'pass1234' });
    const res = await driverAgent.get('/api/drivers');
    expect(res.status).toBe(403);
  });
});
