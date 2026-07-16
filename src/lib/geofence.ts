import { haversineKm } from './geo';

export type GeofenceStatus = 'in-range' | 'near' | 'far';

export interface Coordinates {
  lat: number;
  lon: number;
}

export function distanceMeters(a: Coordinates, b: Coordinates): number {
  return haversineKm([a.lon, a.lat], [b.lon, b.lat]) * 1000;
}

export function statusFromDistance(distanceM: number, radiusM: number): GeofenceStatus {
  if (distanceM <= radiusM) return 'in-range';
  if (distanceM <= radiusM * 3) return 'near';
  return 'far';
}
