import type { RouteNode, Vehicle } from '../types';

export function validateColdStorageFleet(nodes: RouteNode[], fleetPool: Vehicle[]): string | null {
  const coldNodes = nodes.slice(1).filter((n) => n.requiresColdStorage);
  if (coldNodes.length === 0) return null;

  const coldVehicles = fleetPool.filter((v) => v.type === 'cold-storage');
  if (coldVehicles.length === 0) {
    return 'มี order ที่ต้องการรถห้องเย็น แต่กองรถยังไม่มีรถห้องเย็น กรุณาเพิ่มรถห้องเย็นในตั้งค่ากองรถก่อนคำนวณ';
  }

  const totalColdVolume = coldNodes.reduce(
    (sum, n) => sum + (isNaN(n.demandVolume) ? 0 : n.demandVolume),
    0,
  );
  const totalColdCapacity = coldVehicles.reduce((sum, v) => sum + v.capacityCBM, 0);

  if (totalColdVolume > totalColdCapacity) {
    return `ปริมาณสินค้าที่ต้องการรถห้องเย็นรวม ${totalColdVolume.toFixed(1)} CBM เกินความจุรถห้องเย็นทั้งหมด (${totalColdCapacity.toFixed(1)} CBM) กรุณาเพิ่มรถห้องเย็น`;
  }

  return null;
}
