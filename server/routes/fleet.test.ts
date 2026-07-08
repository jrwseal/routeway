import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDb } from '../db';
import { createApp } from '../app';

describe('fleet routes', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    app = createApp(await createDb(':memory:'));
  });

  it('returns the seeded default fleet', async () => {
    const res = await request(app).get('/api/fleet');
    expect(res.status).toBe(200);
    expect(res.body.vehicles).toHaveLength(9);
    expect(res.body.driverWage).toBe(60);
  });

  it('saves an edited fleet', async () => {
    const putRes = await request(app).put('/api/fleet').send({
      vehicles: [
        { id: '4w-1', type: '4-wheel', name: 'Truck 1', capacityCBM: 12, fuelConsumption: 0.12, fixedCost: 300, color: '#10B981', fuelPrice: 36, departureTime: '09:30' },
      ],
      driverWage: 70,
    });
    expect(putRes.status).toBe(200);

    const getRes = await request(app).get('/api/fleet');
    expect(getRes.body.vehicles).toHaveLength(1);
    expect(getRes.body.vehicles[0].fuelPrice).toBe(36);
    expect(getRes.body.vehicles[0].departureTime).toBe('09:30');
    expect(getRes.body.driverWage).toBe(70);
  });
});
