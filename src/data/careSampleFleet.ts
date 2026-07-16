import type { Vehicle } from '../types';

export const careSampleFleet: Vehicle[] = [
  {
    id: 'care-cold-1',
    type: 'cold-storage',
    name: 'รถห้องเย็น 1',
    capacityCBM: 12,
    fuelConsumption: 0.18,
    fixedCost: 500,
    color: '#06B6D4',
    fuelPrice: 35,
    departureTime: '08:00',
    hasColdStorage: true,
    coldStorageCapacity: 12,
  },
  {
    id: 'care-4w-1',
    type: '4-wheel',
    name: 'รถบรรทุก 4 ล้อ 1',
    capacityCBM: 12,
    fuelConsumption: 0.12,
    fixedCost: 300,
    color: '#10B981',
    fuelPrice: 35,
    departureTime: '08:00',
  },
];
