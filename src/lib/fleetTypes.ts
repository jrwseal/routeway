import { Vehicle } from '../types';

export interface VehicleTypeDef {
  type: string;
  label: string;
  color: string;
  defaultCapacityCBM: number;
  defaultFuelConsumption: number;
  defaultFixedCost: number;
}

export const VEHICLE_TYPE_DEFS: VehicleTypeDef[] = [
  { type: '4-wheel', label: 'รถบรรทุก 4 ล้อใหญ่', color: '#10B981', defaultCapacityCBM: 12, defaultFuelConsumption: 0.12, defaultFixedCost: 300 },
  { type: '6-wheel', label: 'รถบรรทุก 6 ล้อ', color: '#3B82F6', defaultCapacityCBM: 32, defaultFuelConsumption: 0.2, defaultFixedCost: 450 },
  { type: '10-wheel', label: 'รถบรรทุก 10 ล้อ', color: '#F97316', defaultCapacityCBM: 48, defaultFuelConsumption: 0.28, defaultFixedCost: 600 },
  { type: 'cold-storage', label: 'รถห้องเย็น', color: '#06B6D4', defaultCapacityCBM: 10, defaultFuelConsumption: 0.18, defaultFixedCost: 500 },
];

export function getAvailableVehicleTypes(enableColdStorage: boolean): VehicleTypeDef[] {
  return VEHICLE_TYPE_DEFS.filter(def => enableColdStorage || def.type !== 'cold-storage');
}

export function canDisableColdStorage(vehicles: Pick<Vehicle, 'type'>[]): boolean {
  return !vehicles.some(v => v.type === 'cold-storage');
}
